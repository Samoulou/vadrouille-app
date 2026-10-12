import type { BriefForm } from "./draft";

/**
 * Propriétés de `brief_completed` (handover § 12, F8-PO-15) : `inferred_fields_count`, nombre de champs déduits à
 * l'affichage de la vérification ; `edited_fields_count`, nombre de ces champs que la personne a modifiés, un
 * champ comptant une fois. Six champs au plus (`BRIEF_FIELDS`). Aucune autre propriété.
 */
export function briefCompletedProperties(brief: Pick<BriefForm, "shown" | "edited">) {
  const shown = new Set(brief.shown);
  return {
    inferred_fields_count: shown.size,
    edited_fields_count: new Set(brief.edited.filter((field) => shown.has(field))).size,
  };
}

/** Séparateur des milliers suisse (`fr-CH`, CLDR) : espace fine insécable U+202F. */
export const SEPARATEUR_MILLIERS = "\u202F";

/**
 * Nombre entier affiché par la création (compteur, budget par repas), à la mode suisse (handover § 9) :
 * « 1 000 », séparateur `SEPARATEUR_MILLIERS`. Formaté sans `Intl.NumberFormat` : son séparateur dépend de
 * l'ICU embarqué (espace fine ou apostrophe selon la version de Node ou du navigateur), ce qui ferait différer
 * le rendu serveur et le rendu client (hydratation) et les environnements entre eux. Rendu identique partout.
 * Écart voulu avec `formatMontant` (`src/features/sejour/travel.ts`, `Intl.NumberFormat`) : le compteur du récit
 * atteint 1 000, et le budget suit le même format que lui ; `formatMontant` pourra rejoindre cette fonction quand
 * le séjour en aura besoin (hors F8a).
 */
export function formatNombre(value: number): string {
  const entier = Math.trunc(value);
  const chiffres = String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATEUR_MILLIERS);
  return entier < 0 ? `\u2212${chiffres}` : chiffres;
}
