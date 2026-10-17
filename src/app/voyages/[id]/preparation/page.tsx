import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRequestContext, getTripReader } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { PreparationView } from "@/features/creation/PreparationView";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { getGenerationStatus } from "@/server/actions/creation";

// Données lues à chaque requête, dans le contexte d'organisation et la portée de simulation de la requête.
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const ROBOTS = { index: false, follow: false } as const;

/** Titre du document : « {destination} · Préparation » (provisoire, UX/UI, F8-Q1). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const trip = await getTripReader().getTrip(getRequestContext(), id);
  return trip
    ? {
        title: format(messages.creation.titreDocument.preparation, {
          destination: trip.destination,
        }),
        robots: ROBOTS,
      }
    : { robots: ROBOTS };
}

/**
 * `R5`, écran 5 « Propositions prêtes » (spécification F8, F8-PO-12 ; décision 0017 § 9). Composant serveur : le
 * voyage est lu dans le contexte de `getRequestContext()` (inconnu ou d'une autre organisation : 404), puis
 * l'avancement par l'action `getGenerationStatus` (état initial du rendu serveur ; le navigateur l'interroge ensuite
 * toutes les secondes). Une erreur de lecture de l'avancement affiche la page d'erreur commune. Fermer l'onglet ou
 * recharger ne perd rien : l'état vient de l'adaptateur.
 */
export default async function PreparationPage({ params }: { params: Params }) {
  const { id } = await params;
  const trip = await getTripReader().getTrip(getRequestContext(), id);
  if (!trip) notFound();
  const status = await getGenerationStatus({ tripId: id });
  if (!status.ok) {
    if (status.error.code === "not_found") notFound();
    throw new Error("avancement de la génération illisible");
  }
  return <PreparationView tripId={id} initial={status.value} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
