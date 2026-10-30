import { notFound } from "next/navigation";

import { versionsDuVoyage } from "@/adapters";
import { contexteFacultatif } from "@/features/compte/session";

import { loadTrip } from "./load";
import { VersionsView } from "./VersionsView";

/**
 * « Versions du programme » (tâche M5b ; spécification M5 § 4 ; décision 0147 § 5.3 point 3) : la page valide le voyage
 * (404 pour un voyage inconnu, d'une autre organisation, non débloqué, ou sans versions : site d'essai), lit la première
 * page côté serveur et la passe à `VersionsView`, rendue dans le panneau du voyage. Module propre à l'écran : ni le Séjour
 * ni la Journée ne chargent son JavaScript (voir `screens.tsx`).
 */
export async function VersionsScreen({ tripId }: { tripId: string }) {
  const ctx = await contexteFacultatif();
  const data = await loadTrip(tripId);
  const versions = await versionsDuVoyage();
  if (ctx === null || !data || !data.trip.unlocked || versions === null) notFound();
  const page = await versions.listTripVersions(ctx, { tripId });
  if (!page.ok && (page.error.code === "not_found" || page.error.code === "not_unlocked")) notFound();
  return <VersionsView tripId={tripId} initial={page.ok ? page.value : null} />;
}
