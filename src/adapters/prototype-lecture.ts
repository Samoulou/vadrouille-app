import "server-only";

import { TRIP_ID_PATTERN } from "@/contracts/values";
import {
  cleTrajet,
  minutesTrajetValides,
  PLACE_ID_PATTERN,
  placeIdsDuProgramme,
  ProgrammeEcritSchema,
  ProgrammeReduitSchema,
  type ModeTrajet,
  type ProgrammeEcrit,
  type ProgrammeReduit,
} from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import type { ProgrammeReelLu, SourceProgrammesReels, TrajetsConserves } from "./prototype";

/**
 * Source des programmes **réels** de l'adaptateur `prototype` (décision 0074, complétée par 0079 ; spécification
 * P0-suite-2, « P0r4 — Lecture des programmes réels ») : les programmes écrits par `p0Run` dans `prototype.programmes`,
 * **recomposés avec leurs positions** lues dans `public.place_coordinates`, pour « Mes voyages » et les pages du voyage
 * de la préversion de `p0-reel`.
 *
 * - **Lecture seule** : une transaction `BEGIN READ ONLY` par lecture, `SET LOCAL statement_timeout`, des `SELECT`
 *   fixes, valeurs en paramètres liés. Rôle : `vadrouille_prototype` (pool de la garde de connexion), dont les politiques
 *   de lecture ne rendent que les lignes d'`org_prototype` non expirées (programmes et positions) ; `expires_at > now()`
 *   est aussi écrit ici.
 * - **Même barrière que le lancement** (exigence 4) : `pool()` est injecté et rend `null` tant que la garde du mode réel
 *   est fermée ou que le cookie d'accès manque (`src/server/p0/lecture-programmes.ts`) ; alors **aucune connexion**
 *   n'est ouverte, la liste est vide et un voyage est introuvable (404).
 * - **Positions** (0046 D15 point 9, P0r4) : une requête pour tous les `placeId` des programmes lus, dans la même
 *   transaction ; recomposition validée par `ProgrammeReduitSchema` (une position par lieu du programme, aucune en
 *   trop), comme `recomposerProgramme` de `src/prototype/decoupage.ts` (que l'application ne peut pas importer, 0048 § 1). **Une position manquante ou expirée : programme non servi** — absent de la liste, et la
 *   page du voyage rend l'état d'erreur existant (`PositionsManquantes`), jamais un programme sans positions ni une
 *   position inventée. Les positions ne sont rendues qu'à l'adaptateur (carte Google seulement, S6) : jamais
 *   journalisées.
 * - **Schéma unique** : `ProgrammeEcritSchema` (`src/prototype/programme-reduit.ts`, partagé avec le rapport), puis
 *   `trip.id` égal à l'identifiant demandé. Un contenu refusé n'est jamais servi ni journalisé.
 * - **Identifiant en double** : deux programmes portant le même `trip.id` (impossible par construction, 0071) ne sont
 *   servis ni par la liste ni par la page du voyage : le voyage est absent des deux, de façon cohérente.
 *
 * - **Temps de trajet conservés** (décision 0092 § 4, prototype seulement) : lus **avec le programme**, dans la même
 *   transaction, une requête pour tous les programmes lus (comme les positions), dans `prototype.trajets` (lignes non
 *   expirées, `expires_at > now()` aussi écrit ici) ; rendus à l'adaptateur seulement (`ProgrammeReelLu.trajets`),
 *   jamais journalisés. Une ligne hors forme (mode, identifiant de lieu, minutes entre 0 et 1 440) est ignorée : la
 *   paire est relue. **Compatibilité** (0092 § 5 point 6) : tant que la migration `0011_trajets_prototype` n'est pas
 *   appliquée, la table n'existe pas (`to_regclass`, lu dans la même transaction, avant toute requête qui la nomme) :
 *   aucun temps n'est lu, tout est relu comme avant. Avec `prototype-ecriture.ts`, seul module hors de `db/` et
 *   `tests/db/` qui nomme `prototype.trajets`.
 *
 * Erreur de base (connexion, requête, délai) : `EchecLectureProgrammes`, sans message de la base ni valeur ; la page
 * affiche l'état d'erreur existant.
 */

/** Délai maximal d'une requête de lecture (millisecondes), posé dans la transaction. */
export const DELAI_LECTURE_MS = 5000;
export const SQL_DELAI = `SET LOCAL statement_timeout = ${DELAI_LECTURE_MS}`;

/** Programmes listés au plus ; au-delà, la lecture échoue fermée (jamais une liste tronquée en silence). */
export const PROGRAMMES_MAX = 200;

/** Contenus des programmes non expirés, pour « Mes voyages » : une seule requête (`PROGRAMMES_MAX` + 1 lignes au plus). */
export const SQL_LISTE = `SELECT id, contenu FROM prototype.programmes
WHERE expires_at > pg_catalog.now() ORDER BY contenu #>> '{trip,id}' LIMIT ${PROGRAMMES_MAX + 1}`;
/** Contenu du programme d'un voyage, s'il n'est pas expiré (deux lignes au plus, pour détecter un doublon). */
export const SQL_PROGRAMME = `SELECT id, contenu FROM prototype.programmes
WHERE contenu #>> '{trip,id}' = $1::text AND expires_at > pg_catalog.now() LIMIT 2`;
/**
 * Positions non expirées des lieux demandés (`place_coordinates`, 0011 § 6) : la politique de `vadrouille_prototype` ne
 * rend que celles d'`org_prototype` ; `expires_at > now()` est aussi écrit ici. Identifiants en tableau lié.
 */
export const SQL_POSITIONS = `SELECT place_id, lat, lng FROM public.place_coordinates
WHERE place_id = ANY($1::text[]) AND expires_at > pg_catalog.now()`;

/** Présence de la table des temps conservés (migration `0011_trajets_prototype`, décision 0092 § 5 point 6). */
export const SQL_TRAJETS_PRESENTS = "SELECT pg_catalog.to_regclass('prototype.trajets') IS NOT NULL AS presente";
/**
 * Temps conservés non expirés des programmes lus (décision 0092 § 4) : la politique de `vadrouille_prototype` ne rend
 * que ceux d'`org_prototype` ; `expires_at > now()` est aussi écrit ici. Identifiants de programme en tableau lié.
 */
export const SQL_TRAJETS = `SELECT programme_id, mode, origine, destination, minutes FROM prototype.trajets
WHERE programme_id = ANY($1::uuid[]) AND expires_at > pg_catalog.now()`;

export class EchecLectureProgrammes extends Error {
  constructor() {
    super("lecture des programmes du prototype impossible");
    this.name = "EchecLectureProgrammes";
  }
}

/**
 * Programme trouvé mais non servi : une de ses positions manque ou a expiré (0046 D15 point 9). Message fixe, sans
 * identifiant de lieu ni de voyage ; la page affiche l'état d'erreur existant.
 */
export class PositionsManquantes extends Error {
  constructor() {
    super("programme du prototype sans toutes ses positions");
    this.name = "PositionsManquantes";
  }
}

export interface SourceProgrammesReelsOptions {
  /** Pool `vadrouille_prototype` si la barrière est ouverte pour cette requête, sinon `null` (aucune lecture). */
  pool: () => Promise<PoolSql | null>;
}

/** Requêtes faites dans la transaction de lecture : rend les lignes d'un `SELECT` fixe. */
type Lire = (sql: string, valeurs?: readonly unknown[]) => Promise<readonly Record<string, unknown>[]>;

/**
 * Une connexion, une transaction en lecture seule bornée dans le temps ; toute erreur devient `EchecLectureProgrammes`
 * et le client est rendu au pool **comme cassé** (`release(true)` : il est détruit, jamais réutilisé).
 */
async function lectureSeule<T>(pool: PoolSql, travail: (lire: Lire) => Promise<T>): Promise<T> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    throw new EchecLectureProgrammes();
  }
  let casse = false;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(SQL_DELAI);
    const resultat = await travail(async (sql, valeurs) => (await client.query(sql, valeurs)).rows);
    await client.query("COMMIT");
    return resultat;
  } catch {
    casse = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw new EchecLectureProgrammes();
  } finally {
    client.release(casse);
  }
}

type PositionLieu = { readonly lat: number; readonly lng: number };

const coordonnee = (valeur: unknown): number => {
  const n = typeof valeur === "string" ? Number(valeur) : valeur;
  if (typeof n !== "number" || !Number.isFinite(n)) throw new Error("position illisible");
  return n;
};

/** Positions non expirées des lieux des programmes, en une requête (aucune si aucun lieu). */
async function lirePositions(lire: Lire, programmes: readonly ProgrammeEcrit[]): Promise<Map<string, PositionLieu>> {
  const ids = new Set<string>();
  for (const programme of programmes) for (const id of placeIdsDuProgramme(programme)) ids.add(id);
  const positions = new Map<string, PositionLieu>();
  if (ids.size === 0) return positions;
  for (const ligne of await lire(SQL_POSITIONS, [[...ids].sort()])) {
    if (typeof ligne.place_id !== "string" || !ids.has(ligne.place_id)) continue;
    positions.set(ligne.place_id, { lat: coordonnee(ligne.lat), lng: coordonnee(ligne.lng) });
  }
  return positions;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const MODES: ReadonlySet<string> = new Set<ModeTrajet>(["walk", "transit", "car"]);

/** Identifiant d'un programme lu (colonne `id`), `undefined` s'il n'a pas la forme d'un uuid. */
const idProgramme = (valeur: unknown): string | undefined => (typeof valeur === "string" && UUID.test(valeur) ? valeur : undefined);

/**
 * Temps conservés des programmes lus, par identifiant de programme (aucune requête sans programme ni sans la table).
 * Une ligne hors forme est ignorée (la paire sera relue), jamais corrigée.
 */
async function lireTrajets(lire: Lire, programmeIds: readonly string[]): Promise<Map<string, Map<string, number>>> {
  const parProgramme = new Map<string, Map<string, number>>();
  if (programmeIds.length === 0) return parProgramme;
  if ((await lire(SQL_TRAJETS_PRESENTS))[0]?.presente !== true) return parProgramme;
  const demandes = new Set(programmeIds);
  for (const ligne of await lire(SQL_TRAJETS, [[...demandes].sort()])) {
    const { programme_id: programmeId, mode, origine, destination, minutes } = ligne;
    if (typeof programmeId !== "string" || !demandes.has(programmeId)) continue;
    if (typeof mode !== "string" || !MODES.has(mode) || !minutesTrajetValides(minutes)) continue;
    if (typeof origine !== "string" || !PLACE_ID_PATTERN.test(origine) || typeof destination !== "string" || !PLACE_ID_PATTERN.test(destination)) continue;
    const trajets = parProgramme.get(programmeId) ?? new Map<string, number>();
    trajets.set(cleTrajet({ mode: mode as ModeTrajet, origine, destination }), minutes);
    parProgramme.set(programmeId, trajets);
  }
  return parProgramme;
}

const AUCUN_TRAJET: TrajetsConserves = new Map();

/** Programme recomposé avec ses positions, ou `null` si une position manque (programme non servi). */
function recomposer(programme: ProgrammeEcrit, positions: ReadonlyMap<string, PositionLieu>): ProgrammeReduit | null {
  const entrees: [string, PositionLieu][] = [];
  for (const placeId of placeIdsDuProgramme(programme)) {
    const position = positions.get(placeId);
    if (position === undefined) return null;
    entrees.push([placeId, { lat: position.lat, lng: position.lng }]);
  }
  // `Object.fromEntries` crée des propriétés propres (jamais un prototype modifié) ; le schéma refuse `__proto__`.
  const resultat = ProgrammeReduitSchema.safeParse({ ...programme, positions: Object.fromEntries(entrees) });
  return resultat.success ? resultat.data : null;
}

const idDe = (contenu: unknown): string | undefined => {
  const trip = (contenu as { trip?: { id?: unknown } } | null)?.trip;
  return typeof trip?.id === "string" ? trip.id : undefined;
};

/** Contenu validé par le schéma unique, avec l'identifiant attendu ; `null` sinon. */
function programmeValide(contenu: unknown, tripId: string): ProgrammeEcrit | null {
  const resultat = ProgrammeEcritSchema.safeParse(contenu);
  return resultat.success && resultat.data.trip.id === tripId ? resultat.data : null;
}

export function createSourceProgrammesReels({ pool }: SourceProgrammesReelsOptions): SourceProgrammesReels {
  return {
    async lister() {
      const ouvert = await pool();
      if (ouvert === null) return [];
      return lectureSeule(ouvert, async (lire) => {
        const lignes = await lire(SQL_LISTE);
        if (lignes.length > PROGRAMMES_MAX) throw new EchecLectureProgrammes();
        const parId = new Map<string, { contenu: unknown; programmeId: string | undefined }[]>();
        for (const { id: programmeId, contenu } of lignes) {
          const id = idDe(contenu);
          if (id !== undefined && TRIP_ID_PATTERN.test(id)) parId.set(id, [...(parId.get(id) ?? []), { contenu, programmeId: idProgramme(programmeId) }]);
        }
        const valides: { programme: ProgrammeEcrit; programmeId: string | undefined }[] = [];
        for (const [id, lus] of parId) {
          // Doublon : aucun des deux n'est servi, comme par `lire`.
          const programme = lus.length === 1 ? programmeValide(lus[0]?.contenu, id) : null;
          if (programme) valides.push({ programme, programmeId: lus[0]?.programmeId });
        }
        const positions = await lirePositions(
          lire,
          valides.map(({ programme }) => programme),
        );
        const trajets = await lireTrajets(
          lire,
          valides.flatMap(({ programmeId }) => programmeId ?? []),
        );
        // Position manquante ou expirée : le programme n'est pas listé (0046 D15 point 9).
        return valides.flatMap(({ programme, programmeId }): ProgrammeReelLu[] => {
          const recompose = recomposer(programme, positions);
          return recompose ? [{ programme: recompose, trajets: (programmeId && trajets.get(programmeId)) || AUCUN_TRAJET }] : [];
        });
      });
    },
    async lire(tripId) {
      // Motif vérifié avant toute connexion.
      if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
      const ouvert = await pool();
      if (ouvert === null) return null;
      const lu = await lectureSeule(ouvert, async (lire) => {
        const lignes = await lire(SQL_PROGRAMME, [tripId]);
        if (lignes.length !== 1) return null;
        const programme = programmeValide(lignes[0]?.contenu, tripId);
        if (programme === null) return null;
        const recompose = recomposer(programme, await lirePositions(lire, [programme]));
        // Programme non servi : aucun temps n'est lu.
        if (recompose === null) return { programme: null, trajets: AUCUN_TRAJET };
        const programmeId = idProgramme(lignes[0]?.id);
        const trajets = programmeId === undefined ? undefined : (await lireTrajets(lire, [programmeId])).get(programmeId);
        return { programme: recompose, trajets: trajets ?? AUCUN_TRAJET };
      });
      if (lu === null) return null;
      // Programme trouvé sans toutes ses positions : non servi, état d'erreur existant (0046 D15 point 9).
      if (lu.programme === null) throw new PositionsManquantes();
      return { programme: lu.programme, trajets: lu.trajets };
    },
  };
}
