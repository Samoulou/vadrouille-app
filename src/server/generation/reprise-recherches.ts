import "server-only";

/**
 * Reprise des recherches d'un aperçu précédent par un « Réessayer » (sous-tâche **B9c-suite**, ticket #573 ; décisions 0106 § 5
 * (choix (b), amendement de B9-PO-8) et 0105 § 6 (amendement de 0081 B9-TL-3 point 2)).
 *
 * Critère (0106 § 5) : un « Réessayer » après un échec **ne refait pas la recherche des villes déjà cherchées** et n'appelle
 * aucun modèle de recherche pour elles ; les candidats repris sont **ré-ancrés** (étape `c` : double appelé pour eux, `place_id`
 * retiré s'il n'est pas résolu). Conditions du Tech Lead (0105 § 6) : même forfait et mêmes plafonds que l'exécution neuve ;
 * **aucune écriture de la ligne précédente**.
 *
 * Forme retenue (aucune migration, aucun contrat touché) :
 * - **source** d'une ville de rang `r` : la recherche (`research_runs`) de rang `r` de l'exécution `preview` **précédente** la plus
 *   récente du même voyage qui en a une (rang : ordre `started_at`, `id` des recherches d'une exécution, comme `SQL_CANDIDATS`
 *   de `etapes.ts`). Le brouillon et les séjours d'un voyage ne changent pas entre deux essais de l'aperçu (seul `stays.place_id`
 *   est réécrit, par l'étape `l`), donc le rang `r` désigne la même ville ;
 * - **copie**, jamais modification : une nouvelle ligne `research_runs` de l'exécution courante, au bilan vide (aucune requête,
 *   aucune page, coût nul : cette exécution n'a rien cherché pour la ville), puis une copie de chaque candidat de la source
 *   (contenu maison, notes comprises, `place_id` des seuls lieux, que l'étape `c` ré-ancre) et de ses occurrences d'événement.
 *   Les lignes de l'exécution précédente (`generation_runs`, `research_runs`, `candidates`, `event_occurrences`) ne sont que
 *   lues : le ré-ancrage de l'étape `c` porte sur les copies ;
 * - le rang des villes de l'exécution courante reste celui de ses propres recherches : les étapes `c`, `d` et `e` ne changent pas.
 *
 * Décision 0011 point 2 : **aucun compteur** de candidats (trouvés, ancrés, écartés, retenus, repris) n'est écrit, ni en base,
 * ni dans l'état du workflow, ni dans un journal ; la copie n'écrit que des lignes de contenu, et le bilan copié est vide.
 */

export type ExecuteurReprise = {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
};

/** Nom normalisé d'un candidat (sans accents, casse ni ponctuation) : unicité par exécution (étape `b`). */
export const normaliser = (nom: string): string =>
  nom
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/**
 * Recherche source de la ville de rang `$3` pour l'exécution `$2` : la plus récente des exécutions `preview` du même voyage
 * commencées **avant** elle (`started_at` strictement croissant par voyage, `SQL_NOUVELLE_EXECUTION`). Aucune ligne si
 * l'exécution courante n'est pas un aperçu, ou si aucune exécution précédente n'a cherché cette ville.
 */
export const SQL_SOURCE_REPRISE = `WITH courante AS (
    SELECT trip_id, started_at FROM public.generation_runs WHERE organization_id = $1 AND id = $2 AND kind = 'preview'),
  precedentes AS (
    SELECT g.id, g.started_at FROM public.generation_runs g JOIN courante c ON c.trip_id = g.trip_id
    WHERE g.organization_id = $1 AND g.kind = 'preview' AND g.id <> $2 AND g.started_at < c.started_at),
  recherches AS (
    SELECT r.id, r.generation_run_id, (row_number() OVER (PARTITION BY r.generation_run_id ORDER BY r.started_at, r.id) - 1)::int AS ville
    FROM public.research_runs r JOIN precedentes p ON p.id = r.generation_run_id
    WHERE r.organization_id = $1)
  SELECT r.id FROM recherches r JOIN precedentes p ON p.id = r.generation_run_id
  WHERE r.ville = $3
  ORDER BY p.started_at DESC, p.id DESC
  LIMIT 1`;

/** Candidats de la recherche source, dans l'ordre de la recherche (le premier est le mieux classé). Noms seuls : le reste est copié en SQL. */
export const SQL_CANDIDATS_SOURCE = `SELECT id, name FROM public.candidates
  WHERE organization_id = $1 AND research_run_id = $2
  ORDER BY created_at, id`;

/** Recherche copiée : bilan vide (aucune requête, aucune page, durée et coût nuls, aucune erreur). */
export const SQL_RECHERCHE_REPRISE = `INSERT INTO public.research_runs (organization_id, trip_id, generation_run_id, queries, pages_read, duration_ms, cost_estimate_micros, errors, started_at, finished_at)
  VALUES ($1, $2, $3, '{}'::text[], 0, 0, 0, '{}'::text[], $4::timestamptz, $4::timestamptz) RETURNING id`;

/**
 * Copie d'un candidat dans la recherche `$3` : contenu maison et notes ; `place_id` des seuls lieux (`kind = 'place'`, que l'étape
 * `c` ré-ancre ; un événement n'est jamais ancré) ; `created_at` porte l'ordre de la recherche (`$4`). Aucune autre colonne.
 */
export const SQL_CANDIDAT_REPRISE = `INSERT INTO public.candidates (organization_id, trip_id, research_run_id, kind, name, summary, category, facts, sources,
    confidence, place_id, fit, not_for_me_risk, must_see, slot_fit, stop_kind, to_reserve, created_at)
  SELECT organization_id, trip_id, $3, kind, name, summary, category, facts, sources,
    confidence, CASE WHEN kind = 'place' THEN place_id END, fit, not_for_me_risk, must_see, slot_fit, stop_kind, to_reserve, $4::timestamptz
  FROM public.candidates WHERE organization_id = $1 AND id = $2
  RETURNING id`;

/** Copie des occurrences d'un événement repris (`$2` source, `$3` copie) : données de la page de l'événement, jamais Google. */
export const SQL_OCCURRENCES_REPRISE = `INSERT INTO public.event_occurrences (organization_id, trip_id, candidate_id, starts_at, ends_at, timezone, category, price_note, source_url, source_checked_at, status)
  SELECT organization_id, trip_id, $3, starts_at, ends_at, timezone, category, price_note, source_url, source_checked_at, status
  FROM public.event_occurrences WHERE organization_id = $1 AND candidate_id = $2`;

/**
 * Candidats de la source à copier, dans l'ordre de la recherche : un nom (normalisé) déjà écrit pour l'exécution courante ou
 * déjà copié n'est jamais réécrit (même règle que l'étape `b`). Fonction pure.
 */
export function candidatsAReprendre(source: readonly { readonly id: string; readonly nom: string }[], dejaConnus: ReadonlySet<string>): string[] {
  const vus = new Set(dejaConnus);
  const ids: string[] = [];
  for (const { id, nom } of source) {
    const cle = normaliser(nom);
    if (vus.has(cle)) continue;
    vus.add(cle);
    ids.push(id);
  }
  return ids;
}

/** Recherche source de la ville `rang` pour l'exécution courante, ou `null` (ville jamais cherchée par un essai précédent). */
export async function sourceDeReprise(x: ExecuteurReprise, organizationId: string, generationRunId: string, rang: number): Promise<string | null> {
  const ligne = (await x.query(SQL_SOURCE_REPRISE, [organizationId, generationRunId, rang])).rows[0];
  return ligne === undefined ? null : String(ligne.id);
}

/**
 * Copie, dans la transaction gardée de l'appelant (étape `b`), de la recherche `source` pour l'exécution courante : une ligne
 * `research_runs` au bilan vide, les candidats de `candidatsAReprendre` et leurs occurrences. `debut` : instant de la recherche
 * (ordre des villes et des candidats, comme une recherche neuve). Ne rend rien : aucun compteur (0011 point 2).
 */
export async function reprendreRecherche(
  x: ExecuteurReprise,
  contexte: { readonly organizationId: string; readonly tripId: string; readonly generationRunId: string },
  source: string,
  dejaConnus: ReadonlySet<string>,
  debut: number,
): Promise<void> {
  const { organizationId, tripId, generationRunId } = contexte;
  const run = (await x.query(SQL_RECHERCHE_REPRISE, [organizationId, tripId, generationRunId, new Date(debut).toISOString()])).rows[0];
  if (run === undefined) throw new Error("reprise : recherche non écrite");
  const lus = (await x.query(SQL_CANDIDATS_SOURCE, [organizationId, source])).rows.map((ligne) => ({ id: String(ligne.id), nom: String(ligne.name) }));
  let ordre = 0;
  for (const id of candidatsAReprendre(lus, dejaConnus)) {
    const copie = (await x.query(SQL_CANDIDAT_REPRISE, [organizationId, id, run.id, new Date(debut + ordre).toISOString()])).rows[0];
    ordre += 1;
    if (copie === undefined) throw new Error("reprise : candidat non écrit");
    await x.query(SQL_OCCURRENCES_REPRISE, [organizationId, id, copie.id]);
  }
}
