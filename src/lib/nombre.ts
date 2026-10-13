/**
 * Formatage des nombres de l'interface, à la mode suisse (handover § 9, `fr-CH`), indépendant de l'ICU
 * (ticket 171, F-ICU). `Intl.NumberFormat("fr-CH")` n'est pas utilisé : son séparateur des milliers dépend
 * des données ICU du moteur (espace fine ou apostrophe selon la version de Node ou du navigateur), ce qui
 * ferait différer le rendu serveur et le rendu client (hydratation) et les environnements entre eux (échec e2e
 * corrigé par F8a). Rendu identique partout.
 */

/** Séparateur des milliers suisse (`fr-CH`, CLDR) : espace fine insécable U+202F. */
export const SEPARATEUR_MILLIERS = " ";

/** Signe moins typographique U+2212. */
const MOINS = "−";

/**
 * Nombre entier (partie entière, décimales tronquées) : 999 → « 999 », 1000 → « 1 000 »,
 * 12345 → « 12 345 », −1500 → « −1 500 ». Séparateur `SEPARATEUR_MILLIERS`.
 */
export function formatNombre(value: number): string {
  const entier = Math.trunc(value);
  const chiffres = String(Math.abs(entier)).replace(/\B(?=(\d{3})+(?!\d))/g, SEPARATEUR_MILLIERS);
  return entier < 0 ? `${MOINS}${chiffres}` : chiffres;
}
