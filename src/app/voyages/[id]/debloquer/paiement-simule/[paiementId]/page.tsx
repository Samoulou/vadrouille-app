import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getPaymentAdapter, getRequestContext, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { PaymentSimulation } from "@/features/presentation/PaymentSimulation";
import { unlockRoutes } from "@/features/presentation/routes";
import { loadCheckout } from "@/features/presentation/unlock-load";
import { messages } from "@/i18n";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; paiementId: string }>;

export const metadata: Metadata = {
  title: messages.debloquer.titreDocument.simule,
  robots: { index: false, follow: false },
};

/**
 * Paiement simulé `R9-sim` (F9-PO-6). Paiement simulé indisponible (F9-PO-19), voyage ou paiement inconnu,
 * d'une autre organisation ou d'un autre voyage : 404. Paiement déjà conclu (rechargement, retour du
 * navigateur) : l'adresse est remplacée par la confirmation, qui affiche l'état réel.
 */
export default async function PaiementSimulePage({ params }: { params: Params }) {
  if (!paymentAvailable()) notFound();
  const { id, paiementId } = await params;
  const ctx = getRequestContext();
  const scope = await getSimulationScope();
  const trip = await getTripReader({ scope }).getTrip(ctx, id);
  if (!trip) notFound();
  const checkout = await loadCheckout(getPaymentAdapter({ scope }), ctx, trip, paiementId);
  if (!checkout) notFound();
  if (checkout.status !== "pending") redirect(unlockRoutes(trip.id).confirmation(checkout.checkoutId));
  return (
    <PaymentSimulation
      tripId={trip.id}
      checkoutId={checkout.checkoutId}
      destination={trip.destination}
      amount={checkout.amount}
      currency={checkout.currency}
      method={checkout.method}
    />
  );
}
