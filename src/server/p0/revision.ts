import "server-only";

import type { ProgrammeEcrit } from "@/prototype/programme-reduit";
import { entreeRevisionDepuisJours, nomsEcartesDesJours, type ChoixRevision, type EntreeRevisionProgramme } from "@/server/programme/revision";
import { entreeProgrammeDepuisBrief, type EntreeProgrammeP0 } from "@/server/p0/vers-couche-ia";

/**
 * Révision d'un voyage d'essai après le tri « J'aime / Pas pour moi » (spécification E2E-essai, lot 4 ; décision 0126) :
 * fonctions **pures**, sans lecture, réseau ni horloge. Le code est **partagé** avec la vraie app depuis M1b (ticket 868) :
 * `src/server/programme/revision.ts` le porte sur des formes structurelles, ce module l'applique au programme écrit du site
 * d'essai et réexporte le reste, sans changement de comportement.
 *
 * - `entreeRevisionDepuisProgramme` : entrée de la requête `revision`, tirée du programme stocké. Elle ne reprend que les
 *   **textes que l'IA a écrits** (date, titre du jour, heures, lieu, quartier, « pourquoi ») et les choix (identifiants
 *   maison). Elle ne lit jamais `placeId`, une position, un segment (temps de trajet), `exceptions` (badges), `source`
 *   (site vérifié), `locked`, `facts.durationMinutes`, les engagements (déjà dans le brief), le logement des terminus,
 *   les propositions ni le terminus du programme réduit : ni donnée Google, ni verdict d'ancrage (0011 § 1, 0117 § 3).
 *   Les étapes sans `placeId` (« à confirmer » à la lecture) sont rendues exactement comme les autres.
 * - `retirerEtapesEcartees` : filet du code après la lecture de la sortie (critère « une étape Pas pour moi est absente
 *   de la nouvelle version ») : tout créneau dont le lieu, normalisé, est celui d'une étape écartée est retiré.
 */

export { nomNormalise, retirerEtapesEcartees, type ChoixRevision } from "@/server/programme/revision";

/** Forme d'`EntreeRevision` (`src/ai/entree-revision.ts`), égalité vérifiée par le test du module. */
export type EntreeRevisionP0 = Omit<EntreeRevisionProgramme, "brief"> & { brief: EntreeProgrammeP0 };

/** Brief du prototype, sous la forme lue par `entreeProgrammeDepuisBrief` (aucun import de `src/prototype/brief`). */
type Brief = Parameters<typeof entreeProgrammeDepuisBrief>[0];

/**
 * Entrée de la révision : brief (même projection que `programme`), textes de l'IA de la version précédente et choix.
 * Seuls les choix portant sur une étape du programme sont gardés (un identifiant inconnu est ignoré, jamais transmis).
 */
export function entreeRevisionDepuisProgramme(programme: ProgrammeEcrit, brief: Brief, choix: ChoixRevision): EntreeRevisionP0 {
  return entreeRevisionDepuisJours(programme.trip.days, entreeProgrammeDepuisBrief(brief), choix);
}

/** Noms (écrits par l'IA) des étapes écartées du programme précédent. */
export function nomsEcartes(programme: ProgrammeEcrit, pasPourMoi: readonly string[]): string[] {
  return nomsEcartesDesJours(programme.trip.days, pasPourMoi);
}
