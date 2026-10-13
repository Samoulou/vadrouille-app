import { notFound } from "next/navigation";

import type { RecorderKind } from "@/analytics/track";

import { dayFromParam, loadTrip, replaceTargetOf } from "./load";
import { ReplaceView } from "./ReplaceScreen";

/**
 * Écran 14 « Remplacer une étape » (spécification F7, F7-PO-2) : la page valide `n` et `stopId` (404 pour un jour
 * hors du voyage, une étape absente des étapes `stop` du jour, un événement de `Day.events`, un terminus ou un repas
 * pas encore choisi) ; le contenu du panneau est rendu par `ReplaceView` depuis le contexte du voyage. Module propre
 * à l'écran 14 : ni la Journée ni le Séjour ne chargent son JavaScript (voir `screens.tsx`).
 */
export async function ReplaceScreen({
  tripId,
  n,
  stopId,
  recorderKind,
}: {
  tripId: string;
  n: string;
  stopId: string;
  recorderKind: RecorderKind;
}) {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  const stop = day ? replaceTargetOf(day, stopId) : null;
  if (!stop) notFound();
  return <ReplaceView stopId={stop.id} recorderKind={recorderKind} />;
}
