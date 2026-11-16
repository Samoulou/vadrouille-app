import type { Category, PreferenceSubject, RetainedPreference } from "@/contracts";
import { CATEGORIES, preferenceKey } from "@/contracts/values";

import { categoriesArretees, type SignalDeCategorie } from "./preferences";

/**
 * Candidats de goûts de l'écran 16 (tâche M8c-1, ticket 1121 ; spécification M8 « Après le voyage » § 5.1,
 * M8-PO-7 ; décision 0160 § 1.8). Fonction pure sur les signaux **actifs** du tri d'un voyage :
 *
 * - « Tu préfères éviter {catégorie} », **confirmé** : un `answerYes` actif de la catégorie (`categoriesArretees`, la
 *   seule définition de la règle) ;
 * - « Tu aimes {catégorie} », **déduit** : au moins `seuilDeduit` signaux actifs `like` ou `choose` de la catégorie, sauf
 *   si la même catégorie est « à éviter » confirmée ;
 * - « Tu préfères rester près de ton hôtel », **confirmé** : un `travelReduction` actif, gardé seulement si `distance`.
 *
 * L'entrée n'a que trois champs (`signal`, `category`, `status`) : ni origine, ni `placeId`, ni candidat, ni carte. Jamais
 * les avis (Q151), les adresses découvertes, le brief ni un nom. Module **non** importé par le navigateur : les candidats
 * arrivent calculés dans `TripReview`.
 */

/** Signal lu par le calcul : projection explicite faite par l'appelant (`src/server/gouts/`). */
export type SignalDeGout = SignalDeCategorie;

export type ReglesDeGouts = {
  /** Nombre de « J'aime » ou « Je choisis » actifs d'une catégorie à partir duquel le goût est déduit (handover : trois). */
  readonly seuilDeduit: number;
  /** Faux : le sujet « distance » n'est jamais candidat (décision 0160 § 1.7 point 2). */
  readonly distance: boolean;
};

const actif = (signal: SignalDeGout) => signal.status !== "cancelled";

function candidat(origin: RetainedPreference["origin"], subject: PreferenceSubject): RetainedPreference {
  return { id: preferenceKey(subject), origin, subject };
}

/** Candidats triés par `preferenceKey` (ordre de la liste des goûts retenus, décision 0160 § 1.3 point 7). */
export function candidatsDeGouts(signaux: readonly SignalDeGout[], regles: ReglesDeGouts): RetainedPreference[] {
  const evitees = categoriesArretees(signaux);
  const aimees = new Map<Category, number>();
  let distance = false;
  for (const signal of signaux) {
    if (!actif(signal)) continue;
    if (signal.signal === "travelReduction") distance = true;
    else if ((signal.signal === "like" || signal.signal === "choose") && signal.category !== null) {
      aimees.set(signal.category, (aimees.get(signal.category) ?? 0) + 1);
    }
  }
  const candidats: RetainedPreference[] = [];
  for (const category of CATEGORIES) {
    if (evitees.has(category)) candidats.push(candidat("confirmed", { kind: "category", category, direction: "less" }));
    else if ((aimees.get(category) ?? 0) >= regles.seuilDeduit) candidats.push(candidat("inferred", { kind: "category", category, direction: "more" }));
  }
  if (distance && regles.distance) candidats.push(candidat("confirmed", { kind: "distance" }));
  return candidats.sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
}
