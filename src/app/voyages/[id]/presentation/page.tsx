import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestContext, getTripReader, paymentAvailable } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { loadPresentation } from "@/features/presentation/load";
import { PresentationScreen } from "@/features/presentation/PresentationScreen";
import { messages } from "@/i18n";

// Données lues à chaque requête, dans le contexte d'organisation de la requête.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.presentation.titre.apercu,
  robots: { index: false, follow: false },
};

/**
 * Écrans 6 et 6b « Présentation » (spécification F6). Voyage inconnu ou d'une autre organisation : 404.
 * Lecture par `getTripReader()` : après un paiement simulé réussi, l'écran 6 devient 6b (décision 0020
 * § 3). Lien « Débloquer » de la fin de l'aperçu seulement si le paiement simulé est disponible (F9-PO-19).
 * Mesures : console en développement et dans les tests sur le build de production (pages de
 * développement actives), aucun enregistrement en production tant que F6-Q3 est ouverte.
 */
export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPresentation(getTripReader(), getRequestContext(), id);
  if (!data) {
    notFound();
  }
  return <PresentationScreen {...data} canUnlock={paymentAvailable()} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
