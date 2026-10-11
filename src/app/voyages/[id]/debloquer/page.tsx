import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPaymentAdapter, getRequestContext, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { OfferScreen } from "@/features/presentation/OfferScreen";
import { loadUnlockPage } from "@/features/presentation/unlock-load";
import { tripRoutes } from "@/features/sejour/routes";
import { plateMeta } from "@/features/voyage/plate";
import { format, messages } from "@/i18n";

// Données lues à chaque requête, dans le contexte d'organisation et la portée de la requête.
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ paiement?: string | string[] }>;

const ROBOTS = { index: false, follow: false } as const;

async function load(id: string, paiement: string | string[] | undefined) {
  // Garde en premier, avant toute lecture (décision 0020 § 2.3) : 404, jamais 500.
  if (!paymentAvailable()) return null;
  const ctx = getRequestContext();
  const scope = await getSimulationScope();
  return loadUnlockPage(getTripReader({ scope }), getPaymentAdapter({ scope }), ctx, id, paiement);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!paymentAvailable()) return { robots: ROBOTS };
  const { id } = await params;
  const trip = await getTripReader().getTrip(getRequestContext(), id);
  return trip ? { title: format(messages.debloquer.titreDocument.debloquer, { destination: trip.destination }), robots: ROBOTS } : { robots: ROBOTS };
}

/**
 * Écran 9 « Débloquer » (spécification F9a). Voyage inconnu ou d'une autre organisation, ou paiement simulé
 * indisponible (F9-PO-19) : 404. Paramètre `paiement` lu et résolu ici (F9-PO-20).
 */
export default async function DebloquerPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id } = await params;
  const { paiement } = await searchParams;
  const data = await load(id, paiement);
  if (!data) notFound();
  const { trip, offer, failure } = data;
  return (
    <OfferScreen
      tripId={trip.id}
      destination={trip.destination}
      destinationColor={trip.destinationColor}
      plateMeta={plateMeta(trip)}
      programmeHref={tripRoutes("/voyages", trip.id).sejour()}
      offer={offer ? { ...offer, start: trip.start, end: trip.end } : null}
      failure={failure}
      simulated
      recorderKind={devPagesEnabled() ? "console" : "none"}
    />
  );
}
