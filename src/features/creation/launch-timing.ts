/**
 * Durée de `preview_ready` (spécification F8, F8-PO-15 ; décision 0017 § 5) : l'instant de l'appel à `createTrip`
 * doit survivre à la navigation de `R-lancer` vers l'écran 5, hors du groupe `(creation)`. Variable de module, en
 * mémoire de l'onglet, perdue au rechargement : la propriété `duration_ms` est alors absente, plutôt qu'une valeur
 * fausse. Aucun stockage navigateur.
 *
 * Le module retient aussi les voyages dont `preview_ready` est déjà parti dans cet onglet : l'événement n'est envoyé
 * qu'à la première fois que l'écran 5 voit l'état « prêt » ou « aperçu incomplet » (aucun double au retour sur l'écran).
 */

export type LaunchClock = () => number;

const defaultClock: LaunchClock = () => performance.now();

let clock: LaunchClock = defaultClock;
const launches = new Map<string, number>();
const reported = new Set<string>();

/** Horloge des instants (tests) ; `performance.now` par défaut. Sans argument, rétablit l'horloge par défaut. */
export function setLaunchClock(next?: LaunchClock): void {
  clock = next ?? defaultClock;
}

/** Instant courant, sur l'horloge du module. */
export function launchNow(): number {
  return clock();
}

/** Retient l'instant de l'appel à `createTrip` pour le voyage `tripId` (le dernier lancement l'emporte). */
export function markLaunch(tripId: string, at: number = clock()): void {
  launches.set(tripId, at);
}

/** Instant du lancement de `tripId`, retiré du module (lu une seule fois), ou `undefined` (page rechargée). */
export function takeLaunch(tripId: string): number | undefined {
  const at = launches.get(tripId);
  launches.delete(tripId);
  return at;
}

/**
 * Durée de `preview_ready` pour `tripId`, à appeler à la première vue de l'état prêt : `null` si l'événement est déjà
 * parti dans cet onglet ; sinon `{ durationMs }`, sans durée quand aucun lancement n'est connu (rechargement,
 * ouverture directe).
 */
export function takePreviewReady(tripId: string): { durationMs?: number } | null {
  if (reported.has(tripId)) return null;
  reported.add(tripId);
  const at = takeLaunch(tripId);
  return at === undefined ? {} : { durationMs: Math.max(0, Math.round(clock() - at)) };
}

/** Vide le module (tests). */
export function resetLaunchTiming(): void {
  launches.clear();
  reported.clear();
  clock = defaultClock;
}
