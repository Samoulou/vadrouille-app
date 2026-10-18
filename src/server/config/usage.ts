import "server-only";

import { z } from "zod";

import { QUOTA_ROUTES_ELEMENTS_PAR_MINUTE } from "@/server/usage/forfait";

/**
 * Plafonds de consommation du MVP (spécification B7, B7c point 3 ; handover back-end § 13 ; B7-TL-8, B7-TL-9 ;
 * décision 0081, B9-TL-4) : par génération (aperçu, voyage complet, mini-recherche) et par relecture, par action sans
 * compte, par organisation et par jour, plafond global quotidien des actions sans compte, par mois et par fournisseur,
 * enveloppe jusqu'à G0. Validés par Zod au chargement ; lus par la composition (B9, B8) et passés à
 * `reserverForfait` et `reserverAction` (`src/server/usage/reservation.ts`). `src/ai` et `src/research` ne
 * l'importent jamais.
 *
 * **Aucun montant réel ici.** Les montants sont réservés à Samuel (argent : Q39, Q45, Q465, question 5 de la
 * spécification B7) : tant qu'ils ne sont pas écrits, `PLAFONDS_USAGE` vaut `null` et la composition ne peut réserver
 * aucun forfait (échec fermé : aucun appel payant du MVP). Les tests utilisent des **valeurs de test**
 * (`tests/support/plafonds-usage.ts`).
 *
 * Module distinct de `src/server/config/ia.ts` (B7b, B7-TL-8 : modèles, routage, profils de bornes), livré en
 * parallèle : les deux sous-tâches ne touchent pas les mêmes fichiers (décision 0054 § 2).
 */

/** Micro-USD : entier, au plus 1 000 USD (garde contre une faute de frappe d'un ordre de grandeur). */
const micros = z.number().int().min(0).max(1_000_000_000);
const microsPositifs = micros.min(1);
const requetes = z.number().int().min(0).max(100_000);
/** Éléments Routes d'un forfait : au plus le quota d'une minute (Q330, `refusDuForfait`). */
const elements = z.number().int().min(0).max(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE);
const sku = z.string().regex(/^[a-z0-9_]{1,80}$/);

/**
 * Préfixes des SKU sommés pour le quota du jour Google par `public.usage_forfait_totals()` (migration 0010, filtre
 * `starts_with`). Un SKU configuré hors de son préfixe ferait tomber la somme du jour à 0 sans erreur (échec ouvert) :
 * il est refusé au chargement (revue de la PR #454, mineur 2 ; test sur `prototype/config/prix-google.json`).
 */
export const PREFIXES_SKU_QUOTA = { textSearch: "places_text_search_", details: "places_details_", matrice: "routes_matrix_" } as const;
const skuDe = (prefixe: string) => sku.refine((valeur) => valeur.startsWith(prefixe), { message: `SKU hors du préfixe ${prefixe}` });

/** Plafonds d'une génération : par méthode (portée `execution`) et coût des modèles. */
const ProfilGenerationSchema = z.strictObject({
  coutModelesMicros: microsPositifs,
  placesTextSearch: requetes,
  placesDetails: requetes,
  routesRequetes: requetes,
  routesElements: elements,
});

/** Plafonds d'une relecture de Journée : Routes seulement, aucun coût de modèle (0046 D13 point 3). */
const ProfilRelectureSchema = z.strictObject({ routesRequetes: requetes.min(1), routesElements: elements.min(1) });

export const PlafondsUsageSchema = z.strictObject({
  schema: z.literal(1),
  /** Profils de génération (B7-PO-5) : `apercu` (workflow 1), `complet` (workflow 4), `mini` (workflow 5). */
  generations: z.strictObject({ apercu: ProfilGenerationSchema, complet: ProfilGenerationSchema, mini: ProfilGenerationSchema }),
  relecture: ProfilRelectureSchema,
  /** Actions sans compte (B7-TL-10, 0081 B9-TL-4 point 3). */
  actions: z.strictObject({
    structureBrief: z.strictObject({ coutModelesMicros: microsPositifs }),
    suggestLodging: z.strictObject({ coutModelesMicros: microsPositifs, placesTextSearch: requetes }),
  }),
  /** Plafond par organisation et par jour (UTC), tous fournisseurs, forfaits compris. */
  parOrganisationJourMicros: microsPositifs,
  /** Plafond global quotidien (UTC) des actions sans compte, en coût (0081 B9-TL-4 point 3). */
  actionsSansCompteJourMicros: microsPositifs,
  /**
   * Limites globales (une clé pour toutes les organisations) : quota du jour Google par méthode (jour du Pacifique),
   * mois et enveloppe jusqu'à G0 par fournisseur. Même forme que `LimitesForfait` (`forfait.ts`), lue par
   * `refusDuForfait` ; `LIMITES_PROTOTYPE` reste propre au prototype.
   */
  limites: z.strictObject({
    quotaJourParMethode: requetes.min(1),
    moisGoogleMicros: microsPositifs,
    enveloppeGoogleMicros: microsPositifs,
    moisModelesMicros: microsPositifs,
    enveloppeModelesMicros: microsPositifs,
  }),
  /** SKU écrits dans `usage_ledger` : ceux des clients réels (table de prix) et le SKU de forfait des modèles. */
  skus: z.strictObject({
    textSearch: skuDe(PREFIXES_SKU_QUOTA.textSearch),
    details: skuDe(PREFIXES_SKU_QUOTA.details),
    matrice: skuDe(PREFIXES_SKU_QUOTA.matrice),
    modeles: sku,
  }),
});
export type PlafondsUsage = z.infer<typeof PlafondsUsageSchema>;

/** Validation d'une configuration de plafonds : lève si une valeur est absente, inconnue ou hors bornes. */
export function chargerPlafondsUsage(valeur: unknown): PlafondsUsage {
  return PlafondsUsageSchema.parse(valeur);
}

/**
 * Plafonds de production : **non fixés** (Q39, Q45, Q465 à Samuel). `null` : aucune réservation possible, donc aucun
 * appel payant du MVP, jusqu'à ce qu'une PR écrive les montants qu'il aura validés.
 */
export const PLAFONDS_USAGE: PlafondsUsage | null = null;
