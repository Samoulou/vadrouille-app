import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPaymentAdapter, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { contexteFacultatif, exigerSession } from "@/features/compte/session";
import { PaymentReturn } from "@/features/presentation/PaymentReturn";
import { presentationRoute, unlockRoutes } from "@/features/presentation/routes";
import { loadCheckout } from "@/features/presentation/unlock-load";
import { tripRoutes } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;
type SearchParams = Promise<{ paiement?: string | string[] }>;

const ROBOTS = { index: false, follow: false } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!paymentAvailable()) return { robots: ROBOTS };
  const { id } = await params;
  // Sans session (`better-auth`) : titre par défaut ; seule la page redirige (`exigerSession`).
  const ctx = await contexteFacultatif();
  const trip = ctx === null ? null : await getTripReader().getTrip(ctx, id);
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
  // Sans session (`better-auth`, B3c) : redirection vers l'écran 4, suite « Débloquer » (une page de paiement simulé
  // n'est jamais une suite, B3-PO-11).
  const ctx = await exigerSession(unlockRoutes(id).debloquer());
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
