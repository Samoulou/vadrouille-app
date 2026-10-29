import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTripReader, isPrototypeAdapter, paymentAvailable, photosDuTriActives } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { loadPresentation } from "@/features/presentation/load";
import { PresentationScreen } from "@/features/presentation/PresentationScreen";
import { presentationRoute } from "@/features/presentation/routes";
import * as messages from "@/i18n/messages";

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
 * développement actives), aucun enregistrement en production tant que F6-Q3 est ouverte. Photos du tri
 * (décision 0128 ; ticket 879) : demandées sur le site d'essai, et sur `api` barrière ouverte seulement
 * (`photosDuTriActives`) ; sinon l'emplacement « Photo du lieu » reste, sans appel. Sans session
 * (`better-auth`, B3c) : redirection vers l'écran 4.
 */
export default async function PresentationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await loadPresentation(getTripReader(), await exigerSession(presentationRoute(id)), id);
  if (!data) {
    notFound();
  }
  const photos = await photosDuTriActives();
  return (
    <PresentationScreen
      {...data}
      canUnlock={paymentAvailable()}
      // Décision 0143 § 5 : une photo Google affichée sur `api` porte aussi « Données de lieux : Google » (0128 § 3).
      placesFromGoogle={isPrototypeAdapter() || photos}
      photos={photos}
      recorderKind={devPagesEnabled() ? "console" : "none"}
    />
  );
}
