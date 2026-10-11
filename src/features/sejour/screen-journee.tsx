import { notFound } from "next/navigation";

import { JourneeView } from "./JourneeView";
import { dayFromParam, loadTrip } from "./load";

/**
 * Écran 12 « Journée » et, avec `?etape=`, écran 13 « Fiche étape » : la page valide `n` (404 sinon) ; le
 * contenu du panneau est rendu par `JourneeView` depuis le contexte du voyage (programme, fiche), et ses
 * adresses par le module `routes.ts` que `TripShell` construit pour la même base. Module propre à la
 * Journée : le Séjour ne charge pas son JavaScript (voir `screens.tsx`).
 */
export async function JourneeScreen({ tripId, n }: { tripId: string; n: string }) {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  if (!data || !day) notFound();
  return <JourneeView />;
}
