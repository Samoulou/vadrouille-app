import "server-only";

import type { CodeEchecEcriture, EcritureProgrammePrototype, ProgrammeEcrit } from "@/contracts/prototype-ecriture";
import {
  CLES_PROGRAMME_ECRIT,
  PLACE_ID_PATTERN,
  PROTOTYPE_ORG_ID,
  cleTrajet,
  minutesTrajetValides,
  pairesAConserver,
  placeIdsDuProgramme,
} from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

// Import relatif : la suppression des candidats vit dans l'adaptateur de la table de travail (Q531), qui seul la nomme.
import { supprimerCandidatsDansTransaction } from "./prototype-travail";

/**
 * Écriture d'un programme du prototype et de ses positions (décision 0052 § 1 ; exigence Sécurité S10 ; 0055,
 * section 8, ligne P0r3c) : **implémentation unique** du contrat `EcritureProgrammePrototype`, importée directement
 * par `src/workflows/p0-run.ts` (étape finale) et par ses tests ; ni fabrique, ni implémentation de remplacement, ni
 * réexportation par `src/adapters/index.ts` (que l'interface importe). Seul module hors de `db/` et `tests/db/` qui
 * nomme la fonction de la base (règle S6 resserrée, test `imports: store_prototype_coordinates nommée par un seul
 * module`).
 *
 * Une seule transaction sous `vadrouille_prototype`, contexte posé selon 0046 D15 point 5, puis dans l'ordre (§ 1.1) :
 * (i) la fonction de la base pour chaque `placeId` du programme, l'exécution étant encore `en_cours` ; (ii) le
 * programme **sans** `positions` (Q324) ; (ii bis) les temps de trajet conservés du programme, un `INSERT` par paire
 * dans `prototype.trajets` (décision 0092 § 4) ; (iii) le passage de l'exécution à `programme_ecrit` ; (iv) la suppression
 * des candidats de l'exécution, table de travail (0046 D15 point 3 et S4 ; constat A de 0103) ; `COMMIT`. Toute
 * erreur annule la transaction : **aucune position ni aucun temps n'est écrit sans son programme, aucun programme sans
 * ses temps**. Valeurs toujours en paramètres liés (§ 1.8) : le texte des requêtes ne contient ni identifiant de lieu,
 * ni coordonnée, ni durée.
 *
 * Compatibilité (0092 § 5 point 6) : tant que la migration `0011_trajets_prototype` n'est pas appliquée, la table
 * n'existe pas (`to_regclass`, lu dans la même transaction) et l'étape (ii bis) n'est pas tentée ; le programme est
 * écrit comme avant. Avec `prototype-lecture.ts`, seul module hors de `db/` et `tests/db/` qui nomme
 * `prototype.trajets` (test de confinement).
 *
 * Le module reçoit le pool `vadrouille_prototype` de la garde de connexion (`poolPrototype()`, `src/server/p0/base.ts`)
 * comme le port de consommation (`src/server/usage/neon.ts`) : le pool est la connexion, pas une implémentation de
 * l'opération ; les tests simulent le client `pg` ou utilisent la seconde base jetable de la CI (0052 § 1, « Harnais
 * des tests sous verrou »). Sous le verrou S8 (aucun `EXECUTE` pour `vadrouille_prototype`, 0052 § 3), toute écriture
 * échoue à l'étape (i) et n'écrit rien.
 *
 * Erreurs : `EchecEcritureProgramme`, code fermé et SQLSTATE seuls (§ 1.8, comme `sanitizeConnectionError`) ; jamais
 * l'erreur d'origine, son message ni ses paramètres.
 */

/**
 * Clés de premier niveau du contenu, égales à `CLES_CONTENU` (`src/prototype/decoupage.ts`) et au `CHECK` de
 * `prototype.programmes` (test) : `CLES_PROGRAMME_ECRIT` de `programme-reduit`, seul module de `src/prototype` que
 * l'application atteint (0048 § 1).
 */
export const CLES_CONTENU_ECRIT = CLES_PROGRAMME_ECRIT;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;

const SQL_CONTEXTE = "SELECT pg_catalog.set_config('app.organization_id', $1, true)";
const SQL_POSITION = "SELECT public.store_prototype_coordinates($1::uuid, $2::text, $3::double precision, $4::double precision)";
const SQL_PROGRAMME = "INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1::uuid, $2::jsonb) RETURNING id";
/** Présence de la table des temps conservés (migration `0011_trajets_prototype`, décision 0092 § 5 point 6). */
export const SQL_TRAJETS_PRESENTS = "SELECT pg_catalog.to_regclass('prototype.trajets') IS NOT NULL AS presente";
/** Un temps conservé ; `id`, `organization_id` et `expires_at` sont posés par le déclencheur de la base (0092 § 3). */
export const SQL_TRAJET =
  "INSERT INTO prototype.trajets (programme_id, mode, origine, destination, minutes) VALUES ($1::uuid, $2::text, $3::text, $4::text, $5::integer)";
const SQL_STATUT = `UPDATE prototype.runs SET status = 'programme_ecrit', phase = NULL, cost_models_micros = NULL
WHERE id = $1::uuid AND status = 'en_cours' RETURNING id`;

/**
 * Signature de la fonction d'écriture des positions (0052 § 1.7, migration `0005`). Le verrou S8 (0046, 0052 § 3,
 * 0056 § 4) est levé si et seulement si `vadrouille_prototype` peut l'exécuter.
 */
export const FONCTION_POSITIONS = "public.store_prototype_coordinates(uuid, text, double precision, double precision)";
/** Droit d'exécution de la fonction des positions pour le rôle courant ; faux si elle n'existe pas sous cette signature. */
export const SQL_VERROU_S8 = "SELECT COALESCE(pg_catalog.has_function_privilege(pg_catalog.to_regprocedure($1), 'EXECUTE'), false) AS leve";

/** Échec d'écriture : code de la liste fermée et, pour `base`, le SQLSTATE seul. Aucune valeur. */
export class EchecEcritureProgramme extends Error {
  constructor(
    readonly code: CodeEchecEcriture,
    readonly sqlstate?: string,
  ) {
    super(sqlstate === undefined ? `écriture du programme refusée (${code})` : `écriture du programme refusée (${code}, ${sqlstate})`);
    this.name = "EchecEcritureProgramme";
  }
}

const borne = (valeur: number, max: number) => Number.isFinite(valeur) && valeur >= -max && valeur <= max;

type LigneTrajet = [mode: string, origine: string, destination: string, minutes: number];

/**
 * Contrôles avant toute requête (§ 1.10) : identifiant d'exécution, contenu sans `positions` ni clé inconnue, clés de
 * `positions` **égales** à `placeIdsDuProgramme(programme)`, formes et bornes. Les temps (0092 § 4, « Écriture ») ne
 * sont pas contrôlés mais **filtrés** : seules les paires de `pairesAConserver(programme, mode)` dont les minutes sont
 * un entier entre 0 et 1 440 sont retenues ; une paire sans durée, d'un autre mode, hors bornes ou étrangère au
 * programme est écartée sans refus (jamais un programme payé perdu pour un temps). Rend les positions et les temps
 * dans un ordre fixe.
 */
function controler(entree: EcritureProgrammePrototype): { positions: [string, number, number][]; trajets: LigneTrajet[] } {
  if (!UUID.test(entree.runId)) throw new EchecEcritureProgramme("entree_refusee");
  const cles = Object.keys(entree.programme);
  if (cles.some((cle) => !(CLES_CONTENU_ECRIT as readonly string[]).includes(cle))) throw new EchecEcritureProgramme("entree_refusee");
  let attendus: Set<string>;
  try {
    attendus = placeIdsDuProgramme(entree.programme);
  } catch {
    throw new EchecEcritureProgramme("entree_refusee");
  }
  if (attendus.size !== entree.positions.size) throw new EchecEcritureProgramme("entree_refusee");
  const lignes: [string, number, number][] = [];
  for (const placeId of [...attendus].sort()) {
    const position = entree.positions.get(placeId);
    if (position === undefined || !PLACE_ID_PATTERN.test(placeId) || !borne(position.lat, 90) || !borne(position.lng, 180)) {
      throw new EchecEcritureProgramme("entree_refusee");
    }
    lignes.push([placeId, position.lat, position.lng]);
  }
  // `pairesAConserver` est pure et ne lève pas (`src/prototype/programme-reduit.ts`, sans `throw`) ; la structure du
  // programme vient d'être parcourue par `placeIdsDuProgramme`. Aucun refus n'est possible ici : un programme payé
  // n'est jamais perdu pour un temps (0092 § 4, « Écriture »).
  const paires = pairesAConserver(entree.programme, entree.mode);
  const trajets: LigneTrajet[] = [];
  for (const paire of [...paires].sort((a, b) => (cleTrajet(a) < cleTrajet(b) ? -1 : 1))) {
    const minutes = entree.trajets.get(cleTrajet(paire));
    if (minutesTrajetValides(minutes)) trajets.push([paire.mode, paire.origine, paire.destination, minutes]);
  }
  return { positions: lignes, trajets };
}

const codeSql = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" && SQLSTATE.test(code) ? code : undefined;
};

/** Écrit le programme et ses positions ensemble, ou rien (0052 § 1.1). */
export async function ecrireProgramme(entree: EcritureProgrammePrototype, pool: PoolSql): Promise<ProgrammeEcrit> {
  const { positions, trajets } = controler(entree);
  const contenu = JSON.stringify(entree.programme);
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch (erreur) {
    throw new EchecEcritureProgramme("base", codeSql(erreur));
  }
  let enTransaction = false;
  try {
    await client.query("BEGIN");
    enTransaction = true;
    await client.query(SQL_CONTEXTE, [PROTOTYPE_ORG_ID]);
    for (const [placeId, lat, lng] of positions) await client.query(SQL_POSITION, [entree.runId, placeId, lat, lng]);
    const programmeId = (await client.query(SQL_PROGRAMME, [entree.runId, contenu])).rows[0]?.id;
    if (typeof programmeId !== "string") throw new EchecEcritureProgramme("base");
    if (trajets.length > 0 && (await client.query(SQL_TRAJETS_PRESENTS)).rows[0]?.presente === true) {
      for (const [mode, origine, destination, minutes] of trajets) {
        await client.query(SQL_TRAJET, [programmeId, mode, origine, destination, minutes]);
      }
    }
    if ((await client.query(SQL_STATUT, [entree.runId])).rows.length !== 1) throw new EchecEcritureProgramme("execution_close");
    // (iv) Fin d'exécution : les candidats de cette exécution (table de travail), dans la même transaction (0046 D15
    // point 3 et S4). Un échec annule tout : l'exécution reste `en_cours`, ses candidats aussi, l'étape peut être rejouée.
    await supprimerCandidatsDansTransaction(client, entree.runId);
    await client.query("COMMIT");
    enTransaction = false;
    return { programmeId };
  } catch (erreur) {
    if (enTransaction) await client.query("ROLLBACK").catch(() => undefined);
    if (erreur instanceof EchecEcritureProgramme) throw erreur;
    throw new EchecEcritureProgramme("base", codeSql(erreur));
  } finally {
    client.release();
  }
}

/**
 * Verrou S8 levé : `vadrouille_prototype` peut exécuter la fonction d'écriture des positions (lecture du catalogue
 * seulement, aucun appel de la fonction). Fermé, aucun programme ne peut être écrit (étape (i) refusée) : le lancement
 * est refusé avant toute réservation (P0r3d ; 0063 point 10 : aucune exécution ne dépense sans pouvoir écrire). Toute
 * erreur, ou une réponse illisible, devient `EchecEcritureProgramme` (`base`, sans valeur) : l'appelant refuse.
 */
export async function verrouS8Leve(pool: PoolSql): Promise<boolean> {
  let client: ClientSql;
  try {
    client = await pool.connect();
  } catch {
    throw new EchecEcritureProgramme("base");
  }
  try {
    const leve = (await client.query(SQL_VERROU_S8, [FONCTION_POSITIONS])).rows[0]?.leve;
    if (typeof leve !== "boolean") throw new EchecEcritureProgramme("base");
    return leve;
  } catch (erreur) {
    if (erreur instanceof EchecEcritureProgramme) throw erreur;
    throw new EchecEcritureProgramme("base");
  } finally {
    client.release();
  }
}
