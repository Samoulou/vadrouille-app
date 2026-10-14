import "server-only";

import type { CodeEchecEcriture, EcritureProgrammePrototype, ProgrammeEcrit } from "@/contracts/prototype-ecriture";
import { PLACE_ID_PATTERN, PROTOTYPE_ORG_ID, placeIdsDuProgramme } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

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
 * programme **sans** `positions` (Q324) ; (iii) le passage de l'exécution à `programme_ecrit` ; `COMMIT`. Toute erreur
 * annule la transaction : **aucune position n'est écrite sans son programme**. Valeurs toujours en paramètres liés
 * (§ 1.8) : le texte des requêtes ne contient ni identifiant de lieu ni coordonnée.
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
 * `prototype.programmes` (test) ; recopiées parce que l'application n'atteint pas `src/prototype` hors de
 * `programme-reduit` (0048 § 1, test `p0: graphes d'import`).
 */
export const CLES_CONTENU_ECRIT = ["schema", "trip", "proposals", "terminus"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;

const SQL_CONTEXTE = "SELECT pg_catalog.set_config('app.organization_id', $1, true)";
const SQL_POSITION = "SELECT public.store_prototype_coordinates($1::uuid, $2::text, $3::double precision, $4::double precision)";
const SQL_PROGRAMME = "INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1::uuid, $2::jsonb) RETURNING id";
const SQL_STATUT = `UPDATE prototype.runs SET status = 'programme_ecrit', phase = NULL, cost_models_micros = NULL
WHERE id = $1::uuid AND status = 'en_cours' RETURNING id`;

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

/**
 * Contrôles avant toute requête (§ 1.10) : identifiant d'exécution, contenu sans `positions` ni clé inconnue, clés de
 * `positions` **égales** à `placeIdsDuProgramme(programme)`, formes et bornes. Rend les positions dans un ordre fixe.
 */
function controler(entree: EcritureProgrammePrototype): [string, number, number][] {
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
  return lignes;
}

const codeSql = (erreur: unknown): string | undefined => {
  const code = (erreur as { code?: unknown } | null)?.code;
  return typeof code === "string" && SQLSTATE.test(code) ? code : undefined;
};

/** Écrit le programme et ses positions ensemble, ou rien (0052 § 1.1). */
export async function ecrireProgramme(entree: EcritureProgrammePrototype, pool: PoolSql): Promise<ProgrammeEcrit> {
  const positions = controler(entree);
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
    if ((await client.query(SQL_STATUT, [entree.runId])).rows.length !== 1) throw new EchecEcritureProgramme("execution_close");
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
