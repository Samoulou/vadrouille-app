import "server-only";

import { TRIP_ID_PATTERN } from "@/contracts/values";
import { ProgrammeEcritSchema, type ProgrammeEcrit } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import type { SourceProgrammesEcrits } from "./prototype";

/**
 * Source des programmes **réels** de l'adaptateur `prototype` sans carte (décision 0074 ; spécification P0-suite-2,
 * « P0r4 », partie lecture) : les programmes écrits par `p0Run` dans `prototype.programmes`, lus pour « Mes voyages » et
 * les pages du voyage de la préversion de `p0-reel`.
 *
 * - **Lecture seule** : une transaction `BEGIN READ ONLY` par lecture, `SET LOCAL statement_timeout`, un seul `SELECT`
 *   fixe, valeurs en paramètres liés. Rôle : `vadrouille_prototype` (pool de la garde de connexion), dont la politique
 *   de lecture ne rend que les lignes d'`org_prototype` non expirées ; `expires_at > now()` est aussi écrit ici.
 * - **Même barrière que le lancement** (exigence 4) : `pool()` est injecté et rend `null` tant que la garde du mode réel
 *   est fermée ou que le cookie d'accès manque (`src/server/p0/lecture-programmes.ts`) ; alors **aucune connexion**
 *   n'est ouverte, la liste est vide et un voyage est introuvable (404).
 * - **Aucune position** : `place_coordinates` n'est jamais lue (0052, S6) ; l'adaptateur sert ces programmes par son
 *   chemin sans carte (`createPrototypeAdapterSansCarte`).
 * - **Schéma unique** : `ProgrammeEcritSchema` (`src/prototype/programme-reduit.ts`, partagé avec le rapport), puis
 *   `trip.id` égal à l'identifiant demandé. Un contenu refusé n'est jamais servi ni journalisé.
 * - **Identifiant en double** : deux programmes portant le même `trip.id` (impossible par construction, 0071) ne sont
 *   servis ni par la liste ni par la page du voyage : le voyage est absent des deux, de façon cohérente.
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
export const SQL_LISTE = `SELECT contenu FROM prototype.programmes
WHERE expires_at > pg_catalog.now() ORDER BY contenu #>> '{trip,id}' LIMIT ${PROGRAMMES_MAX + 1}`;
/** Contenu du programme d'un voyage, s'il n'est pas expiré (deux lignes au plus, pour détecter un doublon). */
export const SQL_PROGRAMME = `SELECT contenu FROM prototype.programmes
WHERE contenu #>> '{trip,id}' = $1::text AND expires_at > pg_catalog.now() LIMIT 2`;

export class EchecLectureProgrammes extends Error {
  constructor() {
    super("lecture des programmes du prototype impossible");
    this.name = "EchecLectureProgrammes";
  }
}

export interface SourceProgrammesReelsOptions {
  /** Pool `vadrouille_prototype` si la barrière est ouverte pour cette requête, sinon `null` (aucune lecture). */
  pool: () => Promise<PoolSql | null>;
}

/**
 * Une connexion, une transaction en lecture seule bornée dans le temps ; toute erreur devient `EchecLectureProgrammes`
 * et le client est rendu au pool **comme cassé** (`release(true)` : il est détruit, jamais réutilisé).
 */
async function lectureSeule(pool: PoolSql, sql: string, valeurs?: readonly unknown[]): Promise<readonly Record<string, unknown>[]> {
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
    const { rows } = await client.query(sql, valeurs);
    await client.query("COMMIT");
    return rows;
  } catch {
    casse = true;
    await client.query("ROLLBACK").catch(() => undefined);
    throw new EchecLectureProgrammes();
  } finally {
    client.release(casse);
  }
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

export function createSourceProgrammesReels({ pool }: SourceProgrammesReelsOptions): SourceProgrammesEcrits {
  return {
    async lister() {
      const ouvert = await pool();
      if (ouvert === null) return [];
      const lignes = await lectureSeule(ouvert, SQL_LISTE);
      if (lignes.length > PROGRAMMES_MAX) throw new EchecLectureProgrammes();
      const parId = new Map<string, unknown[]>();
      for (const { contenu } of lignes) {
        const id = idDe(contenu);
        if (id !== undefined && TRIP_ID_PATTERN.test(id)) parId.set(id, [...(parId.get(id) ?? []), contenu]);
      }
      const programmes: ProgrammeEcrit[] = [];
      for (const [id, contenus] of parId) {
        // Doublon : aucun des deux n'est servi, comme par `lire`.
        const programme = contenus.length === 1 ? programmeValide(contenus[0], id) : null;
        if (programme) programmes.push(programme);
      }
      return programmes;
    },
    async lire(tripId) {
      // Motif vérifié avant toute connexion.
      if (typeof tripId !== "string" || !TRIP_ID_PATTERN.test(tripId)) return null;
      const ouvert = await pool();
      if (ouvert === null) return null;
      const lignes = await lectureSeule(ouvert, SQL_PROGRAMME, [tripId]);
      if (lignes.length !== 1) return null;
      return programmeValide(lignes[0]?.contenu, tripId);
    },
  };
}
