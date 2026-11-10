import type { Category, RetainedPreference } from "@/contracts";

import type { BriefValues } from "./draft";

/**
 * Goûts retenus proposés à l'écran 2 « Vérification » (M8c-2, ticket 1131 ; spécification M8 § 5.4 ; décision 0160 § 1.6
 * point 5). Fonctions pures d'écran, sur l'état du brief : codes de catégories seulement, ni nom ni donnée Google.
 *
 * Un goût « Tu aimes {catégorie} » vise les envies (`wishes`), « Tu préfères éviter {catégorie} » vise « À limiter »
 * (`limits`). Le goût « distance » n'est pas proposé (décision 0160 § 1.7 : aucun champ du brief ne le porte).
 */

export interface GoutPropose {
  /** Clé du goût (`preferenceKey`). */
  id: string;
  category: Category;
  /** Champ du brief que la case remplit. */
  field: "wishes" | "limits";
}

/**
 * - `libre` : décoché, la personne peut le cocher ;
 * - `coche` : coché ici par la personne, elle peut le décocher ;
 * - `dejaDansCeVoyage` : la catégorie est déjà dans le champ visé sans que cette case l'y ait mise (coché, indisponible) ;
 * - `contraire` : la catégorie est dans l'autre champ, le brief du voyage l'emporte (décoché, indisponible).
 */
export type EtatDuGout = "libre" | "coche" | "dejaDansCeVoyage" | "contraire";

/** Goûts qui ont une case à l'écran 2, dans l'ordre reçu : ceux d'une catégorie ; jamais « distance ». */
export function goutsProposables(tastes: readonly RetainedPreference[]): GoutPropose[] {
  return tastes.flatMap((taste) =>
    taste.subject.kind === "category"
      ? [{ id: taste.id, category: taste.subject.category, field: taste.subject.direction === "more" ? ("wishes" as const) : ("limits" as const) }]
      : [],
  );
}

/** État d'une case, d'après le brief du moment et les cases cochées ici (`coches`, clés des goûts). */
export function etatDuGout(gout: GoutPropose, values: Pick<BriefValues, "wishes" | "limits">, coches: ReadonlySet<string>): EtatDuGout {
  const autre = gout.field === "wishes" ? values.limits : values.wishes;
  if (autre.includes(gout.category)) return "contraire";
  if (!values[gout.field].includes(gout.category)) return "libre";
  return coches.has(gout.id) ? "coche" : "dejaDansCeVoyage";
}
