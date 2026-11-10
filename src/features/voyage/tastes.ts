import type { PreferenceSubject, RetainedPreference } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

/**
 * Libellés d'un goût (M8c-1, ticket 1121 ; spécification F11, écran 16 point 5 et « Tes goûts retenus ») : les mêmes sur
 * l'écran 16 et dans « Mes voyages ». Catégories au libellé de F6-PO-10 (`presentation.categories`). Fonctions pures
 * d'écran : codes maison seulement, ni nom ni donnée Google.
 */

const t = messages.apres.gouts;

/** « Tu aimes {catégorie} », « Tu préfères éviter {catégorie} » ou « Tu préfères rester près de ton hôtel ». */
export function tasteLabel(subject: PreferenceSubject): string {
  if (subject.kind === "distance") return t.distance;
  const categorie = messages.presentation.categories[subject.category];
  return format(subject.direction === "more" ? t.aime : t.evite, { categorie });
}

/** Nom accessible d'un goût : celui d'un goût déduit contient « déduit » (F11-PO-12). */
export function tasteAccessibleName(taste: Pick<RetainedPreference, "origin" | "subject">): string {
  const libelle = tasteLabel(taste.subject);
  return taste.origin === "inferred" ? format(t.nomDeduit, { libelle }) : libelle;
}

/** Propriété `category` de `taste_removed` : la catégorie, ou `distance`. */
export function tasteEventCategory(subject: PreferenceSubject) {
  return subject.kind === "distance" ? ("distance" as const) : subject.category;
}
