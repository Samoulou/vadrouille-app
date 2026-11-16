/**
 * Adresses de « Ton compte » (M9c, ticket 1122 ; spécification M9 § 6.4, adresse `/compte` proposée, T7 à confirmer par
 * le Tech Lead) : seul endroit qui les écrit.
 */

/** Page « Ton compte ». */
export function compteRoute(): string {
  return "/compte";
}

/** Accueil. */
export function accueilRoute(): string {
  return "/";
}

const PARAM_COMPTE = "compte";
const VALEUR_SUPPRIME = "supprime";

/** Accueil après la suppression du compte : il affiche l'annonce « Ton compte est supprimé. » (M9-PO-7). */
export function accueilApresSuppressionRoute(): string {
  return `${accueilRoute()}?${PARAM_COMPTE}=${VALEUR_SUPPRIME}`;
}

/** Vrai si les paramètres de l'accueil (décodés par Next.js) demandent l'annonce de la suppression ; valeur fermée. */
export function annonceCompteSupprime(searchParams: Readonly<Record<string, string | string[] | undefined>>): boolean {
  return searchParams[PARAM_COMPTE] === VALEUR_SUPPRIME;
}
