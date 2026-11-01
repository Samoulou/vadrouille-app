import { notFound } from "next/navigation";

import type { RecorderKind } from "@/analytics/track";

import { isApiAdapter, isMockAdapter } from "@/adapters";
import { getTripReminders } from "@/server/actions/rappels";

import { loadTrip } from "./load";
import { calendrierRoute } from "./routes";
import { SejourPanel } from "./SejourPanel";

/**
 * Écran 11 « Séjour » : la page valide le voyage (404 sinon) ; le contenu du panneau est rendu par
 * `SejourPanel` depuis le contexte du voyage (lignes cochées comprises). `recorderKind` : enregistreur des
 * mesures choisi par la page (console avec les pages de développement, sans effet sinon). Module propre au
 * Séjour : la Journée ne charge pas son JavaScript (voir `screens.tsx`).
 */
export async function SejourScreen({
  tripId,
  recorderKind,
  calendrier = false,
  rappels: avecRappels = false,
}: {
  tripId: string;
  recorderKind: RecorderKind;
  calendrier?: boolean;
  /** Interrupteur des rappels par e-mail (M6c) : page `/voyages` seulement, paramètre propre (revue de la PR 1024, mineur 4). */
  rappels?: boolean;
}) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  // « Ajouter au calendrier » (M6b) : page `/voyages` seulement (`calendrier`), adaptateurs `mock` et `api` (la route répond
  // 404 au site d'essai, plan § 10) ; le panneau ne le montre que pour un voyage débloqué.
  const calendrierHref = calendrier && (isMockAdapter() || isApiAdapter()) ? calendrierRoute(tripId) : null;
  // Rappels par e-mail (M6c) : page `/voyages` (`rappels`) et adaptateur `api` seulement ; l'action ne rend un état que si le
  // port des notifications est branché et que la personne est propriétaire du voyage (sinon pas d'interrupteur).
  const etatRappels = avecRappels && isApiAdapter() ? await getTripReminders({ tripId }) : null;
  const rappels = etatRappels?.ok ? etatRappels.value : null;
  return <SejourPanel recorderKind={recorderKind} calendrierHref={calendrierHref} rappels={rappels} />;
}
