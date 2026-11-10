import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPaymentAdapter, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { contexteFacultatif, exigerSession } from "@/features/compte/session";
import { OfferScreen } from "@/features/presentation/OfferScreen";
import { unlockRoutes } from "@/features/presentation/routes";
import { loadUnlockPage } from "@/features/presentation/unlock-load";
import { tripRoutes } from "@/features/sejour/routes";
import { plateMeta } from "@/features/voyage/plate";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// Données lues à chaque requête, dans le contexte d'organisation et la portée de la requête.
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ paiement?: string | string[] }>;

const ROBOTS = { index: false, follow: false } as const;

async function load(id: string, paiement: string | string[] | undefined) {
  // Garde en premier, avant toute lecture (décision 0020 § 2.3) : 404, jamais 500.
  if (!paymentAvailable()) return null;
  // Sans session (`better-auth`, B3c) : redirection vers l'écran 4.
  const ctx = await exigerSession(unlockRoutes(id).debloquer());
  const scope = await getSimulationScope();
  return loadUnlockPage(getTripReader({ scope }), getPaymentAdapter({ scope }), ctx, id, paiement);
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!paymentAvailable()) return { robots: ROBOTS };
  const { id } = await params;
  // Sans session (`better-auth`) : titre par défaut ; seule la page redirige (`exigerSession`).
  const ctx = await contexteFacultatif();
  const trip = ctx === null ? null : await getTripReader().getTrip(ctx, id);
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
  const { trip, offer, failure, receipt } = data;
  return (
    <OfferScreen
      tripId={trip.id}
      destination={trip.destination}
      destinationColor={trip.destinationColor}
      plateMeta={plateMeta(trip)}
      programmeHref={tripRoutes("/voyages", trip.id).sejour()}
      offer={offer ? { ...offer, start: trip.start, end: trip.end } : null}
      failure={failure}
      receiptHref={receipt ? unlockRoutes(trip.id).recu() : null}
      simulated
      recorderKind={devPagesEnabled() ? "console" : "none"}
    />
  );
}
