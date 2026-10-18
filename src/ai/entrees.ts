import "server-only";

import { z } from "zod";

import {
  ADULTS,
  CategorySchema,
  CHILDREN,
  DESTINATION_LENGTH,
  IsoDateSchema,
  MEAL_BUDGET_CHF,
  MobilityModeSchema,
  PaceSchema,
  STOP_KINDS,
  type LodgingRequest,
} from "@/contracts";
import { CANDIDAT_ID_PATTERN, LONGUEURS_TEXTE, texteMaison } from "@/ai/candidat";

/**
 * Types maison de production de la couche IA (décision 0077 § 1 point 2, B7-TL-1 ; B7-PO-1), construits sur
 * `src/contracts` : ce que les modèles reçoivent du voyage. **Aucun champ** pour une donnée Google (`placeId`, nom,
 * adresse, coordonnée, horaire, statut, note, prix, durée, verdict, code de validation : constructeur typé du handover
 * § 10), ni pour le récit, un logement, un engagement ou un email (B7-PO-1) : le récit et le logement de P0 vivent dans
 * `ComplementP0` (`complement-p0.ts`), jamais ici. Schémas stricts : une clé en trop est refusée avant toute requête.
 *
 * Le vocabulaire est celui des contrats (`Pace`, `Category`, `MobilityMode`) ; le constructeur de requêtes
 * (`requetes.ts`) le rend dans la vue des modèles, la même que celle de P0 (octets de P0 inchangés).
 */

const sansDoublon = <T>(valeurs: readonly T[]) => new Set(valeurs).size === valeurs.length;

/** Texte de lieu saisi (destination, ville, pays) : une ligne, Unicode imprimable, sans balise ni URL. */
const lieu = (max: number) => texteMaison(max);

/**
 * Entrée des étapes `plan`, `recherche`, `notation` et `raisons` (B7-PO-1) : destination et dates **d'une** ville,
 * voyageurs, rythme, envies, limites, déplacements, budget des repas. `pays` et `budgetRepas` (niveau de 1 à 3) sont
 * ceux de P0 (brief du prototype) ; `budgetRepasChf` est celui du contrat (`mealBudgetPerPerson`) ; au plus un des deux.
 */
export const EntreeModelesSchema = z
  .strictObject({
    destination: lieu(DESTINATION_LENGTH.max),
    pays: lieu(60).optional(),
    arrivee: IsoDateSchema,
    depart: IsoDateSchema,
    voyageurs: z.strictObject({
      adultes: z.number().int().min(ADULTS.min).max(ADULTS.max),
      enfants: z.number().int().min(CHILDREN.min).max(CHILDREN.max),
    }),
    rythme: PaceSchema,
    envies: z.array(CategorySchema).min(1).refine(sansDoublon, "envies sans doublon"),
    limites: z.array(CategorySchema).refine(sansDoublon, "limites sans doublon").optional(),
    deplacements: z.array(MobilityModeSchema).min(1).refine(sansDoublon, "déplacements sans doublon"),
    budgetRepas: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    budgetRepasChf: z.number().int().min(MEAL_BUDGET_CHF.min).max(MEAL_BUDGET_CHF.max).optional(),
  })
  .superRefine((entree, ctx) => {
    if (entree.depart < entree.arrivee) ctx.addIssue({ code: "custom", path: ["depart"], message: "départ avant l'arrivée" });
    if (entree.budgetRepas !== undefined && entree.budgetRepasChf !== undefined) {
      ctx.addIssue({ code: "custom", path: ["budgetRepasChf"], message: "un seul budget des repas" });
    }
    const envies = new Set<string>(entree.envies);
    if ((entree.limites ?? []).some((limite) => envies.has(limite))) {
      ctx.addIssue({ code: "custom", path: ["limites"], message: "élément commun avec les envies" });
    }
  });
export type EntreeModeles = z.infer<typeof EntreeModelesSchema>;

/**
 * Ce qu'un modèle voit d'un candidat (notation, raisons) : identifiant interne, nom maison, résumé maison, catégorie,
 * type d'étape. **Exactement** la projection de `vuePourModele` de P0 (0077 § 1 point 5 : égalité de types dans
 * `tests/unit/p0/copies.test.ts`) ; aucun autre champ (0027, `CLAUDE.md`).
 */
export const CandidatPourModeleSchema = z.strictObject({
  id: z.string().regex(CANDIDAT_ID_PATTERN),
  nom: texteMaison(LONGUEURS_TEXTE.nom),
  resume: texteMaison(LONGUEURS_TEXTE.resume),
  categorie: CategorySchema,
  typeEtape: z.enum(STOP_KINDS),
});
export type CandidatPourModele = z.infer<typeof CandidatPourModeleSchema>;

/** Nom d'hôte d'une source (`exemple.org`) : lettres, chiffres, tirets et points seulement. */
const DOMAINE_PATTERN = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/;

/**
 * Lieu retenu passé à l'étape `raisons` : le candidat vu par le modèle et le domaine de sa source (P0, étape 9) ; depuis
 * la version 2 du prompt (P0S2-PO-21), et quand l'appelant les connaît, le **secteur maison** du plan (60 caractères au
 * plus, limite de `StopFacts.area`) et `incontournable` (le lieu est un incontournable du plan). Jamais un prix, un
 * horaire, un conseil ni une donnée Google.
 */
export const LieuRetenuSchema = z.strictObject({
  ...CandidatPourModeleSchema.shape,
  sourceDomaine: z.string().min(1).max(253).regex(DOMAINE_PATTERN),
  secteur: texteMaison(60).optional(),
  incontournable: z.literal(true).optional(),
});
export type LieuRetenu = z.infer<typeof LieuRetenuSchema>;

/**
 * Entrée de l'étape `quartier` (B7-PO-1, B7-PO-3) : la ville et les dates de son séjour, **réduites à ce que porte le
 * contrat** `LodgingRequest` (ni voyageurs, ni rythme, ni envies : question 12 de la spécification B7).
 */
export const EntreeQuartierSchema = z
  .strictObject({ ville: lieu(DESTINATION_LENGTH.max), debut: IsoDateSchema, fin: IsoDateSchema })
  .superRefine((entree, ctx) => {
    if (entree.fin < entree.debut) ctx.addIssue({ code: "custom", path: ["fin"], message: "fin avant le début" });
  });
export type EntreeQuartier = z.infer<typeof EntreeQuartierSchema>;

/**
 * `EntreeQuartier` d'une demande `suggestLodging` (B7-PO-3) : `ville` = destination (`city` = 0) ou
 * `otherCities[city − 1].name` ; `debut` = début du voyage ou arrivée de cette ville ; `fin` = arrivée de la ville
 * suivante, ou fin du voyage. **Ne lit jamais** `lodging` ni `commitments` du brouillon (critère `prompts: l'entrée du
 * quartier ne vient que du contrat`). Une ville absente du brouillon est une erreur de l'appelant (`RangeError`) : la
 * demande est validée par `LodgingRequestSchema` avant l'appel.
 */
export function versEntreeQuartier(demande: LodgingRequest): EntreeQuartier {
  const { draft, city } = demande;
  const autres = draft.otherCities;
  const suivante = autres.at(city)?.arrival ?? draft.end;
  if (city === 0) return { ville: draft.destination, debut: draft.start, fin: suivante };
  const ville = city > 0 ? autres.at(city - 1) : undefined;
  if (ville === undefined) throw new RangeError("versEntreeQuartier : ville absente du brouillon");
  return { ville: ville.name, debut: ville.arrival, fin: suivante };
}
