/**
 * Points d'arrêt du panneau coulissant (`Sheet`), en fonctions pures testées sans DOM
 * (spécification F5, F5-PO-2 ; décision 0015 § 5.2).
 */

/** Hauteur du panneau en part de la hauteur de la fenêtre (handover § 5 et § 7). */
export type SnapPoint = 0.25 | 0.55 | 0.92;

export const SNAP_POINTS: readonly SnapPoint[] = [0.25, 0.55, 0.92];
export const DEFAULT_SNAP: SnapPoint = 0.55;

/** Au-delà de cette vitesse verticale (px/ms), le panneau se pose sur la hauteur suivante dans le sens du geste. */
export const SHEET_FLICK_VELOCITY = 0.5;

/** En deçà de ce déplacement (px), un appui sur la poignée est un toucher, pas un glisser. */
export const SHEET_TAP_MAX_DISTANCE = 6;

const sorted = (snaps: readonly SnapPoint[]) => [...snaps].sort((a, b) => a - b);

/** Hauteur d'arrêt la plus proche de `height` (part de la fenêtre) ; à égalité, la plus basse. */
export function nearestSnap(height: number, snaps: readonly SnapPoint[] = SNAP_POINTS): SnapPoint {
  const list = sorted(snaps);
  let best = list[0] ?? DEFAULT_SNAP;
  for (const snap of list) {
    if (Math.abs(snap - height) < Math.abs(best - height)) best = snap;
  }
  return best;
}

/**
 * Hauteur au relâchement. `height` : hauteur atteinte (part de la fenêtre) ; `velocity` : vitesse
 * verticale du geste en px/ms, positive quand le panneau monte. Au-delà de `SHEET_FLICK_VELOCITY`,
 * la hauteur suivante dans le sens du geste ; sinon la plus proche.
 */
export function snapAfterRelease({
  height,
  velocity,
  snaps = SNAP_POINTS,
}: {
  height: number;
  velocity: number;
  snaps?: readonly SnapPoint[];
}): SnapPoint {
  const list = sorted(snaps);
  if (Math.abs(velocity) > SHEET_FLICK_VELOCITY) {
    if (velocity > 0) {
      return list.find((snap) => snap > height) ?? list[list.length - 1] ?? DEFAULT_SNAP;
    }
    return [...list].reverse().find((snap) => snap < height) ?? list[0] ?? DEFAULT_SNAP;
  }
  return nearestSnap(height, list);
}

/** Poignée : agrandir d'une hauteur ; depuis la plus haute, « Réduire » ramène à la plus basse (F5-PO-2). */
export function handleTarget(current: SnapPoint, snaps: readonly SnapPoint[] = SNAP_POINTS): SnapPoint {
  const list = sorted(snaps);
  return list.find((snap) => snap > current) ?? list[0] ?? DEFAULT_SNAP;
}

/** Flèche haut : une hauteur au-dessus, sans dépasser la plus haute. */
export function nextSnapUp(current: SnapPoint, snaps: readonly SnapPoint[] = SNAP_POINTS): SnapPoint {
  const list = sorted(snaps);
  return list.find((snap) => snap > current) ?? current;
}

/** Flèche bas : une hauteur au-dessous, sans descendre sous la plus basse. */
export function nextSnapDown(current: SnapPoint, snaps: readonly SnapPoint[] = SNAP_POINTS): SnapPoint {
  const list = sorted(snaps);
  return [...list].reverse().find((snap) => snap < current) ?? current;
}

/** La poignée réduit (au lieu d'agrandir) quand le panneau est à sa plus grande hauteur. */
export function handleReduces(current: SnapPoint, snaps: readonly SnapPoint[] = SNAP_POINTS): boolean {
  return handleTarget(current, snaps) < current;
}
