/**
 * Rythme d'interrogation de la confirmation (décision 0020 § 5, F9-PO-8) : chaque seconde pendant les
 * 30 premières secondes, puis toutes les 5 s, et plus du tout après 10 min (« Vérifier de nouveau »).
 */
export const CHECKOUT_POLL_FAST_MS = 1000;
export const CHECKOUT_POLL_SLOW_MS = 5000;
export const CHECKOUT_POLL_SLOWDOWN_AFTER_MS = 30_000;
export const CHECKOUT_POLL_STOP_AFTER_MS = 600_000;

/** Délai avant la prochaine interrogation, `elapsedMs` après le début du cycle ; `null` : arrêt. */
export function nextPollDelay(elapsedMs: number): number | null {
  if (elapsedMs >= CHECKOUT_POLL_STOP_AFTER_MS) return null;
  return elapsedMs < CHECKOUT_POLL_SLOWDOWN_AFTER_MS ? CHECKOUT_POLL_FAST_MS : CHECKOUT_POLL_SLOW_MS;
}
