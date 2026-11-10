import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPaymentAdapter, getSimulationScope, getTripReader, paymentAvailable } from "@/adapters";
import { contexteFacultatif, exigerSession } from "@/features/compte/session";
import { ReceiptScreen } from "@/features/presentation/ReceiptScreen";
import { unlockRoutes } from "@/features/presentation/routes";
import { loadReceipt } from "@/features/presentation/unlock-load";
import { tripRoutes } from "@/features/sejour/routes";
import { plateMeta } from "@/features/voyage/plate";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// Données lues à chaque requête, dans le contexte d'organisation et la portée de la requête.
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const ROBOTS = { index: false, follow: false } as const;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!paymentAvailable()) return { robots: ROBOTS };
  const { id } = await params;
  // Sans session (`better-auth`) : titre par défaut ; seule la page redirige (`exigerSession`).
  const ctx = await contexteFacultatif();
  if (ctx === null) return { robots: ROBOTS };
  const scope = await getSimulationScope();
  // Titre selon la forme du reçu (B4e) ; sans reçu de la personne, la page répond 404 avec le titre par défaut.
  const data = await loadReceipt(getTripReader({ scope }), getPaymentAdapter({ scope }), ctx, id);
  if (!data) return { robots: ROBOTS };
  const titre = data.receipt.kind === "stripe" ? messages.debloquer.titreDocument.recuStripe : messages.debloquer.titreDocument.recu;
  return { title: format(titre, { destination: data.trip.destination }), robots: ROBOTS };
}

/**
 * Reçu `R9-recu` (B4d, B4e) : reçu du paiement qui a débloqué le voyage, pour la personne qui l'a payé (`created_by`) :
 * reçu maison du simulé, ou reçu du paiement de test Stripe avec le lien de Stripe (décision 0144 § 5.3 point 7 : ce lien
 * n'apparaît que dans le HTML de cette page). En-têtes propres à ce chemin (`Cache-Control: private, no-store`,
 * `Referrer-Policy: no-referrer`) : `next.config.ts`. Paiement indisponible (F9-PO-19), adaptateur sans reçu (`mock` ;
 * `stripe` sans lien conservé), voyage inconnu ou d'une autre organisation, voyage non débloqué ou payé par une autre
 * personne : 404. Sans session
 * (`better-auth`, B3c) : redirection vers l'écran 4, suite « Débloquer » (`R9`, qui rend le lien du reçu), comme les
 * pages de paiement simulé : la liste blanche des suites (B3-PO-11, `src/features/compte/suite.ts`) n'est pas étendue.
 */
export default async function RecuPage({ params }: { params: Params }) {
  if (!paymentAvailable()) notFound();
  const { id } = await params;
  const ctx = await exigerSession(unlockRoutes(id).debloquer());
  const scope = await getSimulationScope();
  const data = await loadReceipt(getTripReader({ scope }), getPaymentAdapter({ scope }), ctx, id);
  if (!data) notFound();
  const { trip, receipt } = data;
  return <ReceiptScreen receipt={receipt} destination={trip.destination} tripDates={plateMeta(trip)} programmeHref={tripRoutes("/voyages", trip.id).sejour()} />;
}
