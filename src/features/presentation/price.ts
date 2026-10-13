import type { Currency } from "@/contracts/values";
import { formatNombre } from "@/lib/nombre";

/** Espace insécable U+00A0 entre le montant et la devise (`fr-CH`, CLDR). */
const ESPACE_DEVISE = "\u00A0";

/**
 * Prix de l'écran 9 et du paiement simulé (F9-PO-4) : montant entier en centimes et devise reçus de
 * l'offre (configuration serveur), jamais un montant en dur. Format `fr-CH` (handover § 9), composé avec
 * `formatNombre`, indépendant de l'ICU (F-ICU, ticket 171) : sans décimales pour un montant rond (« 39 CHF »),
 * deux décimales après un point sinon (« 39.50 CHF »), milliers séparés par U+202F (« 1 234.50 CHF »).
 */
export function formatPrice(amount: number, currency: Currency): string {
  const centimes = Math.round(amount);
  const francs = formatNombre(Math.trunc(centimes / 100));
  const reste = Math.abs(centimes % 100);
  const montant = reste === 0 ? francs : `${francs}.${String(reste).padStart(2, "0")}`;
  return `${montant}${ESPACE_DEVISE}${currency}`;
}

/** Fin de l'accès : date ISO de fin du voyage + `days` jours (cadrage § 4), en ISO « AAAA-MM-JJ ». */
export function accessUntil(end: string, days: number): string {
  const [year, month, day] = end.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}
