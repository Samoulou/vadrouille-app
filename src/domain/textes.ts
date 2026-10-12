import type { Category } from "@/contracts";

/**
 * Textes déterministes du programme (spécification P0, « Textes produits ») : `Day.title` et `Proposal.context`
 * sont des gabarits construits à partir des catégories maison et du créneau, jamais d'un nom de quartier, d'une
 * adresse, d'une position ou d'une durée Google.
 */

const LIBELLES_CATEGORIE: Record<Category, string> = {
  museum: "Musées et histoire",
  walk: "Balades",
  nature: "Nature et points de vue",
  tasting: "Dégustations",
  restaurant: "Bonnes tables",
};

/** « Balades, dégustations » ; « Journée libre » sans étape. */
export function titreDuJour(categories: readonly Category[]): string {
  const distinctes = [...new Set(categories)];
  const [premiere, seconde] = distinctes;
  if (premiere === undefined) return "Journée libre";
  const debut = LIBELLES_CATEGORIE[premiere];
  if (seconde === undefined) return debut;
  const suite = LIBELLES_CATEGORIE[seconde];
  return `${debut}, ${suite.charAt(0).toLowerCase()}${suite.slice(1)}`;
}

export type CreneauTexte = "activity" | "lunch" | "dinner" | "evening";

const LIBELLES_CRENEAU: Record<CreneauTexte, string> = {
  activity: "Activité",
  lunch: "Déjeuner",
  dinner: "Dîner",
  evening: "Soirée",
};

/** « Déjeuner du jour 1 ». */
export function contexteDeProposition(creneau: CreneauTexte, jour: number): string {
  return `${LIBELLES_CRENEAU[creneau]} du jour ${jour}`;
}
