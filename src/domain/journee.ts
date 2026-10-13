import type { DayLineItemSnapshot } from "@/contracts";

import type { ConfigurationMoteur } from "@/domain/configuration";
import { memePoint, type ModeTrajet, type Point } from "@/domain/relectures";
import { arrondi5, versHeure } from "@/domain/temps";

/**
 * Règles d'écriture d'une ligne de jour partagées par la génération (`generation.ts`, B5b) et la replanification
 * des jours touchés par un patch (`patch.ts`, B5c) : un seul endroit pour la dernière heure écrite, le temps libre
 * (B5-PO-9) et la fin du jour (retour au logement, terminus `end`).
 */

/** Heure de fin la plus tardive qu'écrit le moteur (il ne planifie pas après minuit). */
export const DERNIERE_HEURE = 23 * 60 + 55;

/**
 * Temps libre avant un élément (B5-PO-9) : écart de `seuilTempsLibreMinutes` ou plus entre `fin` (fin de l'élément
 * précédent) et le départ (`debut` − trajet − marge ; `debut` seul sans trajet) ; en dessous, c'est de la marge. Fin
 * du temps libre sur la grille de 5 min. `undefined` : pas de temps libre.
 */
export function tempsLibreAvant(
  fin: number,
  debut: number,
  trajet: number | undefined,
  configuration: Pick<ConfigurationMoteur, "margeMinutes" | "seuilTempsLibreMinutes">,
): DayLineItemSnapshot | undefined {
  const depart = trajet === undefined ? debut : debut - trajet - configuration.margeMinutes;
  if (depart - fin < configuration.seuilTempsLibreMinutes) return undefined;
  return { type: "free", from: versHeure(fin), to: versHeure(Math.max(fin, Math.floor(depart / 5) * 5)) };
}

/** Trajet de retour au logement du soir, mode le plus rapide (B5-PO-6) ; durée en mémoire seulement. */
export type Retour = { mode: ModeTrajet; minutes: number; estimee: boolean };

/**
 * Fin du jour : trajet de retour au logement du soir si la dernière position n'y est pas déjà et qu'une durée est
 * connue (`retour` n'est appelé que dans ce cas), puis terminus `end` à la fin arrondie à 5 min, au plus tard
 * `DERNIERE_HEURE`. `finJour` : fin non bornée (retour compris), pour un contrôle de la fenêtre du jour.
 */
export function finDuJour(parametres: {
  position: Point;
  arrivee: Point;
  fin: number;
  retour: () => Retour | undefined;
  label: string;
}): { items: DayLineItemSnapshot[]; finJour: number } {
  const { position, arrivee, fin, label } = parametres;
  const items: DayLineItemSnapshot[] = [];
  let finJour = fin;
  if (!memePoint(position, arrivee)) {
    const retour = parametres.retour();
    if (retour !== undefined) {
      items.push({ type: "segment", segment: { mode: retour.mode, estimated: retour.estimee } });
      finJour = fin + retour.minutes;
    }
  }
  items.push({ type: "terminus", role: "end", time: versHeure(Math.min(DERNIERE_HEURE, arrondi5(finJour))), label });
  return { items, finJour };
}
