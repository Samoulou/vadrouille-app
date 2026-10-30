import { z } from "zod";

import { PACES, TimeSchema } from "@/contracts";
import { TRANSFER_ESTIMATED_MINUTES_MAX } from "@/contracts/values";

/**
 * Configuration du moteur (décision 0045, B5-TL-4) : schéma Zod strict, type d'entrée du moteur. Il porte PO-1
 * (budget de trajet par rythme), B5-PO-1 (activités par rythme, fenêtre du jour, fenêtres de repas, début de
 * soirée, durées par défaut, marge) et B5-PO-9 (temps libre minimal, seuil d'écriture du temps libre).
 *
 * Les **valeurs** vivent dans un seul fichier, `src/server/config/moteur.json`, validé par ce schéma au chargement
 * (par `scripts/p0/fichiers.ts` pour P0). `src/domain` ne lit jamais ce fichier : la configuration lui est passée.
 * Une seule clé est facultative : `transfertAeroportMinutes` (0045 § 9 ; valeur attendue du Product Owner).
 */

export const CONFIGURATION_MOTEUR_SCHEMA = 1;

const minutes = (min: number, max: number) => z.number().int().min(min).max(max);
const parRythme = (min: number, max: number) =>
  z.strictObject({ relaxed: minutes(min, max), balanced: minutes(min, max), intense: minutes(min, max) });

/** « HH:MM » en minutes depuis minuit, pour comparer deux bornes du schéma. */
function enMinutes(heure: string): number {
  const [h, m] = heure.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

const FenetreSchema = z
  .strictObject({ debut: TimeSchema, fin: TimeSchema })
  .refine((fenetre) => enMinutes(fenetre.debut) < enMinutes(fenetre.fin), "début avant la fin");

/**
 * Section `changementDeVille` (spécification M4 § 3 ; décision 0148 § 5.1 point 5 et § 5.4 ; valeurs de M4-suite § 2 posées
 * par M4b : départ estimé au plus tôt 10:00, créneau de 180 minutes sans durée, durée estimée de 20 à 600 minutes,
 * activités 1, 2 et 2). Les marges et le long changement de ville viennent avec M4-suite-back.
 * - `activitesParRythme` : activités au plus le jour d'un changement de ville, par rythme ;
 * - `departEstime` : `heureParDefaut` (au plus tôt) et `limite` (les fins occupées après elle sont ignorées) ;
 * - `creneauSansDureeMinutes` : créneau occupé par un départ estimé sans durée estimée ;
 * - `dureeEstimeeMinutes` : bornes inclusives de la durée estimée par le modèle, multiples de 5 ; le maximum ne dépasse
 *   jamais `TRANSFER_ESTIMATED_MINUTES_MAX` du contrat (décision 0151 § 1 point 5).
 */
const ChangementDeVilleSchema = z
  .strictObject({
    activitesParRythme: parRythme(0, 4),
    departEstime: z.strictObject({ heureParDefaut: TimeSchema, limite: TimeSchema }),
    creneauSansDureeMinutes: minutes(0, 600),
    dureeEstimeeMinutes: z.strictObject({ min: minutes(5, TRANSFER_ESTIMATED_MINUTES_MAX), max: minutes(5, TRANSFER_ESTIMATED_MINUTES_MAX) }),
  })
  .refine((section) => enMinutes(section.departEstime.heureParDefaut) <= enMinutes(section.departEstime.limite), "départ par défaut avant la limite")
  .refine(
    (section) =>
      section.dureeEstimeeMinutes.min < section.dureeEstimeeMinutes.max && section.dureeEstimeeMinutes.min % 5 === 0 && section.dureeEstimeeMinutes.max % 5 === 0,
    "durée estimée : bornes croissantes, multiples de 5",
  );

const FenetreRepasSchema = z
  .strictObject({ auPlusTot: TimeSchema, auPlusTard: TimeSchema })
  .refine((fenetre) => enMinutes(fenetre.auPlusTot) < enMinutes(fenetre.auPlusTard), "au plus tôt avant au plus tard");

export const ConfigurationMoteurSchema = z
  .strictObject({
    schema: z.literal(CONFIGURATION_MOTEUR_SCHEMA),
    /** PO-1 : budget de trajet du jour, en minutes, par rythme (`Day.travelBudgetMinutes`). */
    budgetTrajetParRythme: parRythme(5, 600),
    /** B5-PO-1 : activités d'un jour complet, par rythme (la moitié arrondie au-dessus le matin). */
    activitesParRythme: parRythme(1, 8),
    /** B5-PO-9 : temps libre minimal d'un jour complet (ni arrivée ni départ), en minutes. */
    tempsLibreMinParRythme: parRythme(0, 600),
    /** B5-PO-1 : fenêtre d'un jour complet. */
    fenetreJour: FenetreSchema,
    /** B5-PO-1 : fenêtres du déjeuner et du dîner. */
    repas: z.strictObject({ lunch: FenetreRepasSchema, dinner: FenetreRepasSchema }),
    /** B5-PO-1 : début de la soirée (sauf rythme `relaxed` et dernier jour). */
    debutSoiree: TimeSchema,
    /** B5-PO-1 : durée prévue quand `StopFacts.durationMinutes` est absent. */
    dureesParDefaut: z.strictObject({
      activity: minutes(15, 600),
      lunch: minutes(15, 600),
      dinner: minutes(15, 600),
      evening: minutes(15, 600),
    }),
    /** B5-PO-1 : marge entre l'arrivée et le début d'une étape (R5). */
    margeMinutes: minutes(0, 60),
    /** B5-PO-9 : écart à partir duquel un intervalle est écrit comme temps libre (`free`) ; en dessous, marge. */
    seuilTempsLibreMinutes: minutes(5, 120),
    /** M4 (décision 0148 § 5) : règles du jour d'un changement de ville. */
    changementDeVille: ChangementDeVilleSchema,
    /** 0045 § 9 : transfert forfaitaire entre l'aéroport et le logement. Facultatif ; absent : non compté (B5-PO-12). */
    transfertAeroportMinutes: minutes(0, 240).optional(),
  })
  .refine(
    (config) =>
      enMinutes(config.fenetreJour.debut) <= enMinutes(config.repas.lunch.auPlusTot) &&
      enMinutes(config.repas.lunch.auPlusTard) < enMinutes(config.repas.dinner.auPlusTot) &&
      enMinutes(config.repas.dinner.auPlusTard) <= enMinutes(config.fenetreJour.fin),
    "fenêtres de repas dans la fenêtre du jour, déjeuner avant dîner",
  )
  .refine(
    (config) => {
      const { heureParDefaut, limite } = config.changementDeVille.departEstime;
      return (
        enMinutes(config.fenetreJour.debut) <= enMinutes(heureParDefaut) &&
        enMinutes(heureParDefaut) <= enMinutes(config.fenetreJour.fin) &&
        enMinutes(limite) + config.changementDeVille.creneauSansDureeMinutes <= enMinutes(config.fenetreJour.fin)
      );
    },
    "changement de ville : départ par défaut dans la fenêtre du jour, limite et créneau sans durée avant sa fin",
  );
export type ConfigurationMoteur = z.infer<typeof ConfigurationMoteurSchema>;

/** Rythmes de la configuration, dans l'ordre des contrats (`PACES`). */
export const RYTHMES_CONFIGURATION = PACES;
