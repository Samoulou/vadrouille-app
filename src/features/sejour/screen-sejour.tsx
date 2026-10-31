import { notFound } from "next/navigation";

import type { RecorderKind } from "@/analytics/track";

import { isApiAdapter, isMockAdapter } from "@/adapters";

import { loadTrip } from "./load";
import { calendrierRoute } from "./routes";
import { SejourPanel } from "./SejourPanel";

/**
 * Écran 11 « Séjour » : la page valide le voyage (404 sinon) ; le contenu du panneau est rendu par
 * `SejourPanel` depuis le contexte du voyage (lignes cochées comprises). `recorderKind` : enregistreur des
 * mesures choisi par la page (console avec les pages de développement, sans effet sinon). Module propre au
 * Séjour : la Journée ne charge pas son JavaScript (voir `screens.tsx`).
 */
export async function SejourScreen({ tripId, recorderKind, calendrier = false }: { tripId: string; recorderKind: RecorderKind; calendrier?: boolean }) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  // « Ajouter au calendrier » (M6b) : page `/voyages` seulement (`calendrier`), adaptateurs `mock` et `api` (la route répond
  // 404 au site d'essai, plan § 10) ; le panneau ne le montre que pour un voyage débloqué.
  const calendrierHref = calendrier && (isMockAdapter() || isApiAdapter()) ? calendrierRoute(tripId) : null;
  return <SejourPanel recorderKind={recorderKind} calendrierHref={calendrierHref} />;
}
