import { notFound } from "next/navigation";

import type { RecorderKind } from "@/analytics/track";

import { loadTrip } from "./load";
import { SejourPanel } from "./SejourPanel";

/**
 * Écran 11 « Séjour » : la page valide le voyage (404 sinon) ; le contenu du panneau est rendu par
 * `SejourPanel` depuis le contexte du voyage (lignes cochées comprises). `recorderKind` : enregistreur des
 * mesures choisi par la page (console avec les pages de développement, sans effet sinon). Module propre au
 * Séjour : la Journée ne charge pas son JavaScript (voir `screens.tsx`).
 */
export async function SejourScreen({ tripId, recorderKind }: { tripId: string; recorderKind: RecorderKind }) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  return <SejourPanel recorderKind={recorderKind} />;
}
