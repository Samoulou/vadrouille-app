import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getTripReader, isPrototypeAdapter } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { contexteFacultatif, exigerSession } from "@/features/compte/session";
import { creationRoutes } from "@/features/creation/routes";
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
  // Sans session (`better-auth`) : titre par défaut ; seule la page redirige (`exigerSession`). Sur `api`, pendant la
  // génération (aucune version publiée), `getTrip` rend `null` : titre par défaut aussi, la page s'affiche quand même.
  const ctx = await contexteFacultatif();
  const trip = ctx === null ? null : await getTripReader().getTrip(ctx, id);
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
 * `R5`, écran 5 « Propositions prêtes » (spécification F8, F8-PO-12 ; décision 0017 § 9). Composant serveur : sans
 * session (`better-auth`, B3c), `exigerSession` redirige vers l'écran 4. Puis l'avancement est lu par l'action
 * `getGenerationStatus` (état initial du rendu serveur ; le navigateur l'interroge ensuite toutes les secondes), qui
 * vérifie aussi le voyage : inconnu ou d'une autre organisation, `not_found`, donc 404. Le voyage n'est **pas** lu par
 * `getTrip` : sur l'adaptateur `api`, `getTrip` rend `null` tant qu'aucune version n'est publiée (B6-PO-2), donc pendant
 * toute la génération, que cet écran sert justement à suivre (spécification B9, B9e ; revue de la PR 588, bloquant 2).
 * Une erreur de lecture de l'avancement affiche la page d'erreur commune. Fermer l'onglet ou recharger ne perd rien :
 * l'état vient de l'adaptateur.
 */
export default async function PreparationPage({ params }: { params: Params }) {
  const { id } = await params;
  const ctx = await exigerSession(creationRoutes.preparation(id));
  const status = await getGenerationStatus({ tripId: id });
  if (!status.ok) {
    if (status.error.code === "not_found") notFound();
    throw new Error("avancement de la génération illisible");
  }
  // Villes du voyage (spécification M4 § 7.2) : seulement quand une version est lisible ; pendant la génération sur `api`,
  // `getTrip` rend `null` et les rangées ne nomment pas de ville.
  const cities = (await getTripReader().getTrip(ctx, id))?.cities;
  // Site d'essai (adaptateur `prototype` ; E2E-essai, lot 3) : « Réessayer » relance le brief saisi (décision 0125 § 4).
  return <PreparationView tripId={id} initial={status.value} recorderKind={devPagesEnabled() ? "console" : "none"} essai={isPrototypeAdapter()} {...(cities ? { cities } : {})} />;
}
