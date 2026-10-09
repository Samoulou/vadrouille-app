import type { Currency } from "@/contracts/values";

/**
 * Prix de l'écran 9 et du paiement simulé (F9-PO-4) : montant entier en centimes et devise reçus de
 * l'offre (configuration serveur), jamais un montant en dur. `Intl.NumberFormat("fr-CH")` (handover § 9) :
 * sans décimales pour un montant rond (« 39 CHF »), deux décimales sinon (« 39.50 CHF »).
 */
export function formatPrice(amount: number, currency: Currency): string {
  const round = amount % 100 === 0;
  return new Intl.NumberFormat("fr-CH", {
    style: "currency",
    currency,
    minimumFractionDigits: round ? 0 : 2,
    maximumFractionDigits: round ? 0 : 2,
  }).format(amount / 100);
}

/** Fin de l'accès : date ISO de fin du voyage + `days` jours (cadrage § 4), en ISO « AAAA-MM-JJ ». */
export function accessUntil(end: string, days: number): string {
  const [year, month, day] = end.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days));
  return date.toISOString().slice(0, 10);
}
