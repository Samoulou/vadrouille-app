/**
 * Suivi d'un pointeur pendant un glisser (décision 0015 § 5.2, déplacé de `features/presentation/deck.ts`).
 * Axe indifférent : `pos` est `clientX` pour un glisser horizontal (cartes de la présentation) ou `clientY`
 * pour un glisser vertical (panneau). Les seuils restent propres à chaque composant.
 */

/** Position d'un pointeur sur l'axe suivi (px) à l'instant `t` (ms, `event.timeStamp`). */
export interface PointerSample {
  pos: number;
  t: number;
}

/** Fenêtre de temps (ms) des derniers mouvements qui servent au calcul de la vitesse. */
export const VELOCITY_WINDOW_MS = 100;

/**
 * Vitesse (px/ms) au relâchement sur l'axe suivi, sur les mouvements des `VELOCITY_WINDOW_MS`
 * dernières millisecondes ; nulle si le pointeur n'a pas bougé dans la fenêtre.
 */
export function releaseVelocity(samples: readonly PointerSample[], release: PointerSample): number {
  const recent = samples.filter((sample) => release.t - sample.t <= VELOCITY_WINDOW_MS);
  const first = recent[0];
  if (!first || release.t <= first.t) return 0;
  return (release.pos - first.pos) / (release.t - first.t);
}
