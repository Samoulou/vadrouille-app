import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPaymentAdapter, getRequestContext, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { PaymentReturn } from "@/features/presentation/PaymentReturn";
import { presentationRoute } from "@/features/presentation/routes";
import { loadCheckout } from "@/features/presentation/unlock-load";
import { tripRoutes } from "@/features/sejour/routes";
import { format, messages } from "@/i18n";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ paiement?: string | string[] }>;

const ROBOTS = { index: false, follow: false } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!paymentAvailable()) return { robots: ROBOTS };
  const { id } = await params;
  const trip = await getTripReader().getTrip(getRequestContext(), id);
  return trip
    ? { title: format(messages.debloquer.titreDocument.confirmation, { destination: trip.destination }), robots: ROBOTS }
    : { robots: ROBOTS };
}

/**
 * Confirmation `R9-retour` (F9-PO-8). Paiement simulé indisponible (F9-PO-19), voyage ou paiement inconnu,
 * d'une autre organisation ou d'un autre voyage, paramètre mal formé : 404. Cible de réussite : le Séjour
 * (`R11`) en F9a, tant que l'écran 10 n'existe pas (F9-PO-18).
 */
export default async function ConfirmationPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  if (!paymentAvailable()) notFound();
  const { id } = await params;
  const { paiement } = await searchParams;
  const ctx = getRequestContext();
  const scope = await getSimulationScope();
  const trip = await getTripReader({ scope }).getTrip(ctx, id);
  if (!trip) notFound();
  const checkout = await loadCheckout(getPaymentAdapter({ scope }), ctx, trip, paiement);
  if (!checkout) notFound();
  return (
    <PaymentReturn
      tripId={trip.id}
      checkoutId={checkout.checkoutId}
      initialStatus={checkout.status}
      method={checkout.method}
      priceVariant={checkout.priceVariant}
      successHref={tripRoutes("/voyages", trip.id).sejour()}
      presentationHref={presentationRoute(trip.id)}
      recorderKind={devPagesEnabled() ? "console" : "none"}
    />
  );
}
