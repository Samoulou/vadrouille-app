import { z } from "zod";

import { RAISONS_REFUS_PAGE } from "@/research/fetch-page";

import { CODES_JOURNAL } from "./journal";

/**
 * Schéma du rapport d'exécution (spécification P0, « Sortie 2 » ; décision 0032, A3.1). **Compteurs et
 * identifiants internes seulement** : aucune donnée Google, aucun `placeId`, aucun texte de prompt, aucun résumé
 * de page, aucune URL. Aucun nom de champ n'appartient à la liste interdite du handover back-end § 8 (les temps
 * s'écrivent `elapsedMs`, jamais `duration`). Strict à tous les niveaux.
 */

const n = z.number().int().nonnegative();
const usd = z.number().finite().nonnegative();
const ETAPES = ["recherche", "ancrage", "notation", "planification", "raisons", "validation"] as const;

export const RapportSchema = z.strictObject({
  schema: z.literal(1),
  variante: z.enum(["a", "b"]),
  brief: z.string().regex(/^[a-z0-9-]{1,32}$/),
  tripId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  dateExecution: z.iso.date(),
  mode: z.literal("simule"),
  statut: z.enum(["complete", "stopped", "failed"]),
  raisonArret: z.enum(CODES_JOURNAL).optional(),
  compteurAtteint: z
    .enum([
      "coutUsd",
      "recherchesWeb",
      "pagesLues",
      "candidatsTrouves",
      "placesTextSearch",
      "placesDetails",
      "routesRequetes",
      "routesElements",
      "dureeMs",
    ])
    .optional(),
  prompts: z.strictObject({ plan: n, recherche: n, notation: n, raisons: n }),
  modeles: z.strictObject({ recherche: z.string(), notation: z.string(), raisons: z.string() }),
  /** Absent quand la garde data_collection a arrêté l'exécution (routage invalide, jamais recopié). */
  routage: z.strictObject({ data_collection: z.literal("deny"), zdr: z.boolean().optional() }).optional(),
  fichiersConfig: z.strictObject({ modeles: n, recherche: n, classement: n, plafonds: n }),
  notes: z.strictObject({
    notForMeRisk: z.strictObject(Object.fromEntries(Array.from({ length: 10 }, (_, i) => [String(i + 1), n]))),
    matchesWishes: z.strictObject({ oui: n, non: n }),
    mustSee: z.strictObject({ oui: n, non: n }),
  }),
  sortiesRefusees: z.strictObject({ plan: n, recherche: n, notation: n, raisons: n }),
  elapsedMs: z.strictObject({ total: n, ...Object.fromEntries(ETAPES.map((etape) => [etape, n])) }),
  coutUsd: z.strictObject({ modeles: usd, rechercheWeb: usd, total: usd }),
  google: z.strictObject({ placesTextSearchIdsOnly: n, placesDetails: n, routesRequetes: n, routesElements: n }),
  compteurs: z.strictObject({
    toursAgent: n,
    recherches: n,
    pagesLues: n,
    pagesRefusees: z.strictObject(Object.fromEntries(RAISONS_REFUS_PAGE.map((raison) => [raison, n]))),
    candidatsTrouves: n,
    candidatsRefuses: z.strictObject({ source_not_in_results: n, duplicate: n, over_total: n, invalid: n }),
    candidatsAncres: n,
    candidatsNonRetenusParAncrage: n,
    candidatsNotes: n,
    candidatsRetenus: n,
    propositions: n,
    jours: n,
  }),
  /** Part des candidats trouvés dont la source est officielle ou indépendante (classement maison des domaines). */
  partSourcesLocalesOuIndependantes: z.number().min(0).max(1),
  violations: z.strictObject({ R1: n, R2: n, R4: n, R5: n, R6: n, R8: n }),
  /** Règles sans objet dans P0 (sans révision, P0-PO-6) ; R9 seulement si une source donne un prix. */
  reglesSansObjet: z.array(z.enum(["R3", "R7", "R10"])),
});
export type Rapport = z.infer<typeof RapportSchema>;
