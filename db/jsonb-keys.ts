import "server-only";

/**
 * Clés admises dans les colonnes JSONB à contrat fermé (spécification B1, décision B1-PO-5).
 *
 * Seul fichier de `db/` qui porte ces listes : les contraintes `CHECK` du schéma Drizzle (`db/schema/`) en sont
 * générées, donc la migration SQL aussi. Écrites d'après le handover back-end § 5 et la décision 0010, **sans
 * importer `src/contracts`** (B2 crée `StopFacts`, `ChecklistMoment` et `ProposalRecord` en parallèle). La PR
 * fusionnée en second, B1 ou B2, ajoute le test `schéma: les clés JSONB suivent les contrats`, qui compare ces
 * listes aux schémas Zod de B2.
 *
 * Un `CHECK` par différence de clés ne contrôle que le premier niveau d'un objet (ou de chaque élément d'un
 * tableau) : le verrou principal reste la validation par le schéma Zod strict avant toute écriture (handover § 6).
 */

/**
 * `candidates.facts` (`StopFacts`, évolution E3) : durée de la visite, coût estimé par personne, secteur.
 * Noms proposés par B1 (le handover ne fixe que leur sens) ; B2 les confirme ou une migration les aligne.
 */
export const STOP_FACTS_KEYS = ["durationMinutes", "costPerPerson", "area"] as const;

/** Élément de `candidates.sources` : `{ label, url, checkedOn }`, `url` en `https://` (handover § 6 et § 12). */
export const CANDIDATE_SOURCE_KEYS = ["label", "url", "checkedOn"] as const;

/** `checklist_items.moment` (`ChecklistMoment`, PO-2) : union discriminée par `type`, clés par variante. */
export const CHECKLIST_MOMENT_VARIANTS = {
  deadline: ["type", "date"],
  beforeDeparture: ["type"],
  tripDay: ["type", "day"],
} as const;

/**
 * `proposals.content` (`ProposalRecord`, décision 0010 principe 7) : clés de premier niveau de `Proposal` moins
 * les champs calculés (`weekday`, `context`, `option`) et chargés à la demande (`photoUrl`).
 */
export const PROPOSAL_RECORD_KEYS = ["id", "kind", "day", "time", "stop", "category", "travelFromPrevious", "detour"] as const;

/**
 * Liste blanche de l'instantané partagé (vue `shared_trip_version`, fonctions `shared_*` de
 * `db/migrations/0001_securite.sql`). Écrite à la main dans la migration ; le test
 * `tests/unit/db/liste-blanche-partage.test.ts` vérifie que chaque fonction `shared_*` émet exactement ces clés, et
 * le test `schéma: les clés JSONB suivent les contrats` (PR fusionnée en second, B1 ou B2) les compare aussi aux
 * schémas Zod de B2. Jamais l'étiquette de logement des terminus (Q50).
 */
export const SHARED_SNAPSHOT_KEYS = {
  source: ["label", "url"],
  facts: STOP_FACTS_KEYS,
  stop: ["id", "kind", "placeId", "name", "start", "end", "facts", "reason", "source", "exceptions", "locked", "commitment"],
  surprise: ["id", "placeId", "name", "facts", "reason", "source"],
  day: ["index", "date", "travelBudgetMinutes", "items", "events", "surprise"],
} as const;

/**
 * Valeurs de `Stop.exceptions` admises dans l'instantané (décision 0011, point 5) : au plus 2, jamais `toConfirm`
 * (tiré d'horaires Google, ajouté à la lecture seulement).
 */
export const SNAPSHOT_STOP_EXCEPTIONS = ["toReserve", "unconfirmed"] as const;
export const SNAPSHOT_STOP_EXCEPTIONS_MAX = 2;

/** Littéral SQL `ARRAY['a', 'b']::text[]` d'une liste de clés (valeurs fixes de ce fichier, jamais une saisie). */
export function sqlTextArray(keys: readonly string[]): string {
  for (const key of keys) {
    if (!/^[A-Za-z]+$/.test(key)) throw new Error(`clé JSONB invalide : ${key}`);
  }
  return `ARRAY[${keys.map((key) => `'${key}'`).join(", ")}]::text[]`;
}
