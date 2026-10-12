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

const NUMBER_FORMAT = new Intl.NumberFormat("fr-CH");

/** Nombre affiché par la création (compteur, budget par repas) : `Intl.NumberFormat("fr-CH")` (handover § 9). */
export function formatNombre(value: number): string {
  return NUMBER_FORMAT.format(value);
}
