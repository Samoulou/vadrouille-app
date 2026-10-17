import "server-only";

/**
 * Lecture du cache de positions `place_coordinates` (décision 0060 § 1.2 ; 0059 § 5 point 3) : **seule** lecture de la
 * table hors de `db/` et des tests. Importée par `src/server/positions/cache-positions.ts`, `src/server/voyages/**`
 * (B6a) et les tests seulement (0060 § 1.4).
 *
 * Une requête en paramètres liés, **sans filtre ni paramètre d'organisation** : la RLS seule borne à l'organisation
 * courante, aux lignes vivantes, et exclut `org_prototype` (0011 § 6, 0046 S2). L'exécuteur est le client de la
 * transaction déjà ouverte par `withOrg`, contexte posé ; ce module n'ouvre ni connexion ni transaction et ne pose
 * aucun `set_config`.
 *
 * Aucun journal : ni `placeId`, ni coordonnée, ni lot, ni taille de lot. L'échec est `EchecPositions` (code fermé et
 * SQLSTATE seuls, comme `EchecEcritureProgramme` de `src/adapters/prototype-ecriture.ts`), jamais l'erreur d'origine,
 * son message ni ses paramètres.
 */

/**
 * Client de la transaction de `withOrg` (B3b non fusionnée au moment de B8c : type structurel minimal de 0060 § 1.3,
 * forme de `ClientSql` de `src/server/usage/neon.ts` sans `release`).
 */
export type ExecuteurPositions = {
  query(texte: string, valeurs: readonly unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
};

/** Codes de la lecture : sous-ensemble de `CodeEchecPositions` (`src/grounding/port-positions.ts`). */
export type CodeEchecLecture = "entree_invalide" | "base";

/** Échec de lecture : code fermé et, pour `base`, le SQLSTATE seul (cinq caractères). Aucune valeur. */
export class EchecPositions extends Error {
  constructor(
    readonly code: CodeEchecLecture,
    readonly sqlstate?: string,
  ) {
    super(sqlstate === undefined ? `positions illisibles (${code})` : `positions illisibles (${code}, ${sqlstate})`);
    this.name = "EchecPositions";
  }
}

/** Forme du `CHECK` de `place_coordinates.place_id` (0002_place_coordinates) : 1 à 256 caractères. */
const FORME_PLACE_ID = /^[A-Za-z0-9_-]{1,256}$/;
const SQLSTATE = /^[0-9A-Z]{5}$/;
/** Identifiants distincts par appel, au plus (0060 § 1.2). */
const MAX_IDENTIFIANTS = 5_000;
/** Identifiants par requête, au plus : au-delà, lots successifs dans le même exécuteur. */
const TAILLE_LOT = 500;

const SQL_LECTURE = "SELECT place_id, lat, lng FROM public.place_coordinates WHERE place_id = ANY($1::text[])";

const borne = (valeur: unknown, max: number): valeur is number =>
  typeof valeur === "number" && Number.isFinite(valeur) && valeur >= -max && valeur <= max;

/**
 * Positions vivantes de l'organisation courante pour ces `placeId` ; un identifiant absent du cache est absent de la
 * `Map`. Liste vide : aucune requête. Plus de 5 000 identifiants distincts, ou un identifiant hors forme :
 * `entree_invalide`, aucune requête.
 */
export async function lirePositions(executeur: ExecuteurPositions, placeIds: readonly string[]): Promise<ReadonlyMap<string, { lat: number; lng: number }>> {
  const distincts = new Set<string>();
  for (const placeId of placeIds) {
    if (typeof placeId !== "string" || !FORME_PLACE_ID.test(placeId)) throw new EchecPositions("entree_invalide");
    distincts.add(placeId);
  }
  if (distincts.size > MAX_IDENTIFIANTS) throw new EchecPositions("entree_invalide");
  const positions = new Map<string, { lat: number; lng: number }>();
  const identifiants = [...distincts];
  for (let debut = 0; debut < identifiants.length; debut += TAILLE_LOT) {
    const lot = identifiants.slice(debut, debut + TAILLE_LOT);
    let lignes: readonly Record<string, unknown>[];
    try {
      lignes = (await executeur.query(SQL_LECTURE, [lot])).rows;
    } catch (erreur) {
      const code = (erreur as { code?: unknown } | null)?.code;
      throw new EchecPositions("base", typeof code === "string" && SQLSTATE.test(code) ? code : undefined);
    }
    for (const ligne of lignes) {
      const placeId = ligne.place_id;
      if (typeof placeId !== "string" || !distincts.has(placeId) || !borne(ligne.lat, 90) || !borne(ligne.lng, 180)) {
        throw new EchecPositions("base");
      }
      positions.set(placeId, { lat: ligne.lat, lng: ligne.lng });
    }
  }
  return positions;
}
