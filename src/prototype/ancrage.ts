import { z } from "zod";

/**
 * Résultat d'ancrage d'un candidat (décision 0032, A3.1) : **données Google en mémoire seulement**.
 *
 * `placeId`, position, statut et horaires d'ouverture servent au moteur pendant l'exécution, puis disparaissent :
 * seuls le `placeId` et la position d'un lieu retenu entrent dans le programme réduit (table `positions`,
 * réponse de Samuel à P0-Q8). Rien de ce module n'est écrit dans un journal, une trace ou le rapport.
 *
 * `src/ai` et `src/research` n'ont pas le droit d'importer ce module, ni directement ni par transitivité
 * (test du graphe d'import) : un résultat d'ancrage ne peut pas atteindre un prompt par un import.
 *
 * Module pur, feuille : n'importe que `zod`.
 */

export const STATUTS_LIEU = ["ouvert", "ferme_temporairement", "ferme_definitivement"] as const;
export type StatutLieu = (typeof STATUTS_LIEU)[number];

export const PositionSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type Position = z.infer<typeof PositionSchema>;

/** Plage d'ouverture d'un jour (0 = dimanche), en minutes depuis minuit ; `fin` peut dépasser 1 440 (nuit). */
export const PlageOuvertureSchema = z.strictObject({
  jour: z.number().int().min(0).max(6),
  debut: z.number().int().min(0).max(1440),
  fin: z.number().int().min(0).max(2880),
});
export type PlageOuverture = z.infer<typeof PlageOuvertureSchema>;

export const AncrageSchema = z.discriminatedUnion("resolu", [
  z.strictObject({ resolu: z.literal(false) }),
  z.strictObject({
    resolu: z.literal(true),
    placeId: z.string().min(1).max(256),
    statut: z.enum(STATUTS_LIEU),
    position: PositionSchema,
    /** `null` : horaires inconnus (aucune contrainte d'ouverture appliquée). */
    horaires: z.array(PlageOuvertureSchema).nullable(),
  }),
]);
export type Ancrage = z.infer<typeof AncrageSchema>;
export type AncrageResolu = Extract<Ancrage, { resolu: true }>;

/** Un candidat entre dans la suite (notation, programme) seulement s'il est résolu et non fermé définitivement. */
export function estAncre(ancrage: Ancrage | undefined): ancrage is AncrageResolu {
  return ancrage !== undefined && ancrage.resolu && ancrage.statut !== "ferme_definitivement";
}

/** Durées de trajet en mémoire (minutes), entre deux `placeId`. */
export type Trajets = (depuis: string, vers: string) => number | undefined;
