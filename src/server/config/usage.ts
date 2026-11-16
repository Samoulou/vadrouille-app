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
 * **Montants réels : `PLAFONDS_USAGE`** (décision 0169 § 3), posés sur les réponses de Samuel (argent : Q639 du
 * 2026-11-09 ; 0027 § 2 pour les mois). Remise à `null`, la composition ne peut réserver aucun forfait (échec fermé :
 * aucun appel payant du MVP). Les tests utilisent des **valeurs de test** (`tests/support/plafonds-usage.ts`).
 *
 * Module distinct de `src/server/config/ia.ts` (B7b, B7-TL-8 : modèles, routage, profils de bornes), livré en
 * parallèle : les deux sous-tâches ne touchent pas les mêmes fichiers (décision 0054 § 2).
 */

/** Micro-USD : entier, au plus 1 000 USD (garde contre une faute de frappe d'un ordre de grandeur). */
const micros = z.number().int().min(0).max(1_000_000_000);
const microsPositifs = micros.min(1);

/**
 * **Bornes de garde** (spécification B9, critère « Configuration des plafonds » de B9e) : bornes de **validation**, pas des
 * plafonds. Elles refusent au chargement (`chargerPlafondsUsage`) une faute de saisie d'un ordre de grandeur ; les plafonds
 * eux-mêmes sont des valeurs de départ fixées par Samuel (question 4 de B9). Une génération (plafond de coût des modèles de
 * chaque profil) : 50 USD ; une organisation et un jour : 100 USD ; les actions sans compte, par jour (plafond global et
 * plafond de chaque action) : 20 USD. Les requêtes Google gardent leurs bornes en nombre (`requetes`, `elements`).
 */
export const BORNES_DE_GARDE_MICROS = {
  parGeneration: 50_000_000,
  parOrganisationJour: 100_000_000,
  actionsSansCompteJour: 20_000_000,
} as const;
const microsGeneration = microsPositifs.max(BORNES_DE_GARDE_MICROS.parGeneration);
const microsActions = microsPositifs.max(BORNES_DE_GARDE_MICROS.actionsSansCompteJour);
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
  coutModelesMicros: microsGeneration,
  placesTextSearch: requetes,
  placesDetails: requetes,
  routesRequetes: requetes,
  routesElements: elements,
});

/**
 * Plafonds d'une relecture (décision 0100 § 1) : Text Search des villes, fiches (tous masques) et Routes, aucun coût de
 * modèle. Deux profils du même schéma, choisis par la portée de la lecture (`jour`, `voyage`).
 */
/**
 * Plafonds de la vérification des lieux restants (M1c, ticket 1048 ; réponse de Samuel à Q638) : Text Search et fiches
 * seulement. **Aucun coût de modèle ni aucune requête Routes** : le forfait dérivé porte `coutModelesMicros: null`, si bien que
 * le registre refuse toute requête de modèle, et une part Routes nulle (Q639 : 2 USD d'IA par voyage, aucun pour ce passage).
 */
const ProfilVerificationSchema = z.strictObject({
  placesTextSearch: requetes,
  placesDetails: requetes,
});

const ProfilRelectureSchema = z.strictObject({
  placesTextSearch: requetes,
  placesDetails: requetes,
  routesRequetes: requetes.min(1),
  routesElements: elements.min(1),
});

export const PlafondsUsageSchema = z.strictObject({
  schema: z.literal(1),
  /**
   * Profils de génération (B7-PO-5) : `apercu` (workflow 1), `complet` (workflow 4), `mini` (mini-recherche, B11) et `lot`
   * (recalcul des jours touchés par un tri, workflow 5 `batchRecompute`, décision 0119 § 4.1 : aucune recherche, des requêtes
   * Routes ; plafond d'un recalcul, question 3 de la spécification B10, à Samuel) ; `programme` (aperçu de la chaîne inversée,
   * workflow `generateProgramme`, décision 0136 § 6 : une requête de modèle, Text Search et fiches, aucune requête Routes) ;
   * `revision` (« Pas pour moi » de la chaîne inversée, exécution `batch` du workflow 5, décision 0142 : une requête `revision`,
   * vérification de toute la version, aucune requête Routes) ; `verification` (voyage complet de la chaîne inversée, workflow 4
   * après le déblocage, M1c : vérification des lieux restants, Text Search et fiches seulement, ni modèle ni Routes).
   */
  generations: z.strictObject({
    apercu: ProfilGenerationSchema,
    complet: ProfilGenerationSchema,
    mini: ProfilGenerationSchema,
    lot: ProfilGenerationSchema,
    programme: ProfilGenerationSchema,
    revision: ProfilGenerationSchema,
    verification: ProfilVerificationSchema,
  }),
  /** Relectures (0100 § 1.3) : `jour` (un jour, une présentation : `getDay`, `listProposals`, `listPreviewSlots`) et `voyage` (`getTrip`). */
  relecture: z.strictObject({ jour: ProfilRelectureSchema, voyage: ProfilRelectureSchema }),
  /** Actions sans compte (B7-TL-10, 0081 B9-TL-4 point 3). */
  actions: z.strictObject({
    structureBrief: z.strictObject({ coutModelesMicros: microsActions }),
    suggestLodging: z.strictObject({ coutModelesMicros: microsActions, placesTextSearch: requetes }),
  }),
  /** Plafond par organisation et par jour (UTC), tous fournisseurs, forfaits compris. */
  parOrganisationJourMicros: microsPositifs.max(BORNES_DE_GARDE_MICROS.parOrganisationJour),
  /** Plafond global quotidien (UTC) des actions sans compte, en coût (0081 B9-TL-4 point 3). */
  actionsSansCompteJourMicros: microsActions,
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
 * Plafonds réels de la préversion `mvp-essai` (décision 0169 § 3). La barrière de B9-TL-8 (`plafondsDeGenerationPoses`) ne
 * lit **que** cette constante ; `null` la refermerait (« 0 USD partout » de B9-PO-10).
 *
 * **Montants de Samuel** (Q639, « Je suis tes reco », 2026-11-09 06:07 UTC) :
 * - **2 USD d'IA par voyage**, révision comprise (0136, question 6) : `programme` 1,20 USD + `revision` 0,80 USD ; la
 *   vérification après le déblocage (`verification`) n'a aucun coût de modèle ;
 * - **10 USD par organisation et par jour** (`parOrganisationJourMicros`), tous fournisseurs, forfaits compris ;
 * - **5 USD par jour sans compte** (`actionsSansCompteJourMicros`).
 * **Mois et enveloppes** : montants déjà cités par Samuel pour le prototype (0027 § 2 ; 0046 D13 point 3), repris tels
 * quels : Google 20 USD par mois et 40 USD jusqu'à G0, modèles 40 USD par mois et 80 USD jusqu'à G0. Ce sont les seuls
 * plafonds **globaux** (toutes organisations) : ils bornent la dépense totale de la préversion, qui est publique (0163).
 *
 * **Valeurs techniques du studio, sous ces montants** (nombres de requêtes, pas des montants ; à juger par le Tech Lead à
 * la revue, 0169 § 3) :
 * - `programme` et `revision` : 60 Text Search (prix 0) et 60 fiches (1,20 USD au prix plein) ; `verification` : 60 et 60
 *   (recommandation de Q843, tranchée par le CEO sur mandat). Un voyage entier (programme, une révision, vérification) réserve
 *   au plus 2,40 + 2,00 + 1,20 = 5,60 USD, sous les 10 USD par organisation et par jour ;
 * - quota du jour par méthode : 400 requêtes (deux voyages entiers par jour, toutes organisations) ; le mois Google borne le reste ;
 * - `relecture` : valeurs de départ de 0100 § 1.4, **non servies sur la préversion** (la source réelle de relectures reste
 *   réservée à `local`, 0100 § 5.3 ; 0169 § 7) ;
 * - `apercu`, `complet`, `lot` (ancienne chaîne, non sélectionnée : `CHAINE_APERCU` vaut `inversee`) et `mini` (B11, non
 *   livrée) : le schéma les exige et la barrière exige un profil `apercu` non nul ; valeurs de la variante simulée, coût de
 *   modèles ramené sous les 2 USD par voyage. Aucun workflow de la chaîne inversée ne les réserve.
 */
export const PLAFONDS_USAGE: PlafondsUsage | null = chargerPlafondsUsage({
  schema: 1,
  generations: {
    apercu: { coutModelesMicros: 600_000, placesTextSearch: 30, placesDetails: 30, routesRequetes: 10, routesElements: 300 },
    complet: { coutModelesMicros: 600_000, placesTextSearch: 60, placesDetails: 40, routesRequetes: 8, routesElements: 400 },
    mini: { coutModelesMicros: 20_000, placesTextSearch: 6, placesDetails: 6, routesRequetes: 0, routesElements: 0 },
    lot: { coutModelesMicros: 20_000, placesTextSearch: 4, placesDetails: 40, routesRequetes: 4, routesElements: 200 },
    programme: { coutModelesMicros: 1_200_000, placesTextSearch: 60, placesDetails: 60, routesRequetes: 0, routesElements: 0 },
    revision: { coutModelesMicros: 800_000, placesTextSearch: 60, placesDetails: 60, routesRequetes: 0, routesElements: 0 },
    verification: { placesTextSearch: 60, placesDetails: 60 },
  },
  relecture: {
    jour: { placesTextSearch: 2, placesDetails: 20, routesRequetes: 24, routesElements: 24 },
    voyage: { placesTextSearch: 20, placesDetails: 100, routesRequetes: 240, routesElements: 240 },
  },
  actions: {
    structureBrief: { coutModelesMicros: 10_000 },
    suggestLodging: { coutModelesMicros: 20_000, placesTextSearch: 3 },
  },
  parOrganisationJourMicros: 10_000_000,
  actionsSansCompteJourMicros: 5_000_000,
  limites: {
    quotaJourParMethode: 400,
    moisGoogleMicros: 20_000_000,
    enveloppeGoogleMicros: 40_000_000,
    moisModelesMicros: 40_000_000,
    enveloppeModelesMicros: 80_000_000,
  },
  skus: {
    textSearch: "places_text_search_essentials_ids_only",
    details: "places_details_enterprise",
    matrice: "routes_matrix_essentials",
    modeles: "modeles_forfait",
  },
});

/**
 * **Valeurs de test de la variante simulée** (spécification B9, B9e points 2 et 3 ; B9-PO-10) : forfait des générations dont
 * la composition est **simulée** (doubles sur les fixtures d'Édimbourg, aucun appel réseau), en local, en CI et sur une
 * préversion barrière fermée. Elles bornent le forfait du bout en bout simulé (les doubles sont enveloppés dans le même
 * registre que les clients réels, B9c) ; ce ne sont pas des montants, aucun fournisseur n'est payé.
 *
 * **Incapables d'autoriser un appel réel** : la barrière ne les lit jamais (elle lit `PLAFONDS_USAGE` seul), et les
 * dépendances de la génération (`src/server/generation/dependances.ts`) ne les passent qu'au forfait d'une étape dont la
 * barrière a rendu `simulee`. Valeurs de test (celles de `tests/support/plafonds-usage.ts`, aperçu et limites élargis comme
 * `PLAFONDS_LARGES` de `tests/support/banc-apercu.ts` pour qu'un aperçu simulé d'Édimbourg tienne dans son forfait), sans
 * lien avec les montants réels réservés à Samuel ; leur alignement sur les valeurs des bancs est testé (`usage.test.ts`).
 * La variante simulée n'en tire que des forfaits **en mémoire** : elle n'écrit aucune ligne dans `usage_ledger` (décision
 * 0110 § 3), si bien que les limites globales et le plafond par organisation ne sont pas lus par elle.
 */
export const PLAFONDS_VARIANTE_SIMULEE: PlafondsUsage = chargerPlafondsUsage({
  schema: 1,
  generations: {
    apercu: { coutModelesMicros: 600_000, placesTextSearch: 30, placesDetails: 30, routesRequetes: 10, routesElements: 300 },
    // Coût de modèles du voyage complet élargi comme celui de l'aperçu (revue de la PR 600) : un voyage simulé de six jours
    // tient dans son forfait (part de `e` répartie par jour). Valeur de test, sans lien avec les montants réels.
    complet: { coutModelesMicros: 600_000, placesTextSearch: 60, placesDetails: 40, routesRequetes: 8, routesElements: 400 },
    mini: { coutModelesMicros: 20_000, placesTextSearch: 6, placesDetails: 6, routesRequetes: 0, routesElements: 0 },
    // Recalcul d'un tri (0119 § 4.1 point 3) : six jours, deux jours touchés, une ville. Une requête `raisons` (20 000 micro-USD,
    // réserve exacte), deux relectures d'un jour (2 × 20 fiches), la part de deux jours du profil `complet` en Routes (2 × 2
    // requêtes, 2 × 100 éléments), au plus deux villes `area` ou `none` par jour touché. Valeurs de test, pas des montants.
    lot: { coutModelesMicros: 20_000, placesTextSearch: 4, placesDetails: 40, routesRequetes: 4, routesElements: 200 },
    // Aperçu de la chaîne inversée (décision 0136 § 6.4) : Text Search et fiches de `prototype/config/mode-reel.json` (le
    // programme simulé de Rome compte 30 lieux distincts et un logement), aucune requête Routes à la génération (§ 2.4). 100 et
    // 100 depuis M4b (décision 0148 § 3 point 2 : 3 villes et 15 jours, 13 × 6 + 2 × 4 lieux + 3 logements = 89, avec marge).
    // Valeurs de test, pas des montants : la barrière ne les lit jamais.
    programme: { coutModelesMicros: 600_000, placesTextSearch: 100, placesDetails: 100, routesRequetes: 0, routesElements: 0 },
    // Révision de la chaîne inversée (décision 0142) : une requête `revision` (entrée plus longue que celle du programme : les
    // textes de la version de base), toute la version revérifiée (Text Search et fiches du profil `programme`), aucune requête
    // Routes. Valeurs de test, pas des montants : la barrière ne les lit jamais.
    revision: { coutModelesMicros: 700_000, placesTextSearch: 100, placesDetails: 100, routesRequetes: 0, routesElements: 0 },
    // Voyage complet de la chaîne inversée (M1c) : les lieux des journées hors de l'aperçu (au plus ceux du profil `programme`)
    // et les logements, Text Search et fiches seulement. Valeurs de test, pas des montants : la barrière ne les lit jamais.
    verification: { placesTextSearch: 100, placesDetails: 100 },
  },
  relecture: {
    jour: { placesTextSearch: 2, placesDetails: 20, routesRequetes: 24, routesElements: 24 },
    voyage: { placesTextSearch: 20, placesDetails: 100, routesRequetes: 240, routesElements: 240 },
  },
  actions: {
    structureBrief: { coutModelesMicros: 10_000 },
    suggestLodging: { coutModelesMicros: 20_000, placesTextSearch: 3 },
  },
  parOrganisationJourMicros: 50_000_000,
  actionsSansCompteJourMicros: 100_000,
  limites: {
    quotaJourParMethode: 100_000,
    moisGoogleMicros: 1_000_000_000,
    enveloppeGoogleMicros: 1_000_000_000,
    moisModelesMicros: 1_000_000_000,
    enveloppeModelesMicros: 1_000_000_000,
  },
  skus: {
    textSearch: "places_text_search_essentials_ids_only",
    details: "places_details_enterprise",
    matrice: "routes_matrix_essentials",
    modeles: "modeles_forfait",
  },
});
