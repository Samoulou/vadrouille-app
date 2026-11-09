import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { getTripReader, getTripReview, isApiAdapter } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { contexteFacultatif, exigerSession } from "@/features/compte/session";
import { tripRoutes } from "@/features/sejour/routes";
import { projectReviewTrip } from "@/features/voyage/review";
import { ReviewScreen } from "@/features/voyage/ReviewScreen";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// Données lues à chaque requête, dans le contexte d'organisation de la requête ; l'accès (avant la fin, ouvert, lecture
// seule) est calculé par le serveur à chaque requête (décision 0160 § 1.5 point 3).
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const ROBOTS = { index: false, follow: false } as const;

/**
 * Voyage et lecture de l'écran 16, une seule fois par requête pour la page et ses métadonnées ; `null` sans session, pour
 * un voyage inconnu, d'une autre organisation, non débloqué, d'une autre personne que la propriétaire (`api`), et avec
 * `prototype` (404). Une erreur de l'adaptateur n'est pas rattrapée : page d'erreur commune.
 */
const loadReview = cache(async (tripId: string) => {
  const ctx = await contexteFacultatif();
  if (ctx === null) return null;
  // Contrôles de l'écran 16 d'abord (propriétaire, débloqué ; revue de la PR 1068, mineur 14), puis le programme.
  const review = await getTripReview(ctx, tripId);
  if (review === null) return null;
  const trip = await getTripReader().getTrip(ctx, tripId);
  return trip === null ? null : { trip, review };
});

/** Titre du document : « {destination} · Après le voyage » (provisoire, UX/UI). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const lu = await loadReview(id);
  return lu ? { title: format(messages.apres.titreDocument, { destination: lu.trip.destination }), robots: ROBOTS } : { robots: ROBOTS };
}

/**
 * Écran 16 « Après le voyage » (`R16` ; tâche M8a, ticket 1062 ; décision 0160 § 1.5 point 2). Page sans carte, hors du
 * groupe `(programme)`, sous le fournisseur de l'onglet de `src/app/voyages/layout.tsx` (mémoire des avis de `mock`). Ordre :
 * session (`exigerSession`, sinon l'écran 4), lecture `getTripReview` (404 : propriétaire, débloqué), voyage par
 * `getTripReader()` (404).
 */
export default async function ApresVoyagePage({ params }: { params: Params }) {
  const { id } = await params;
  const routes = tripRoutes("/voyages", id);
  await exigerSession(routes.apresVoyage() ?? routes.sejour());
  const lu = await loadReview(id);
  if (!lu) notFound();
  return (
    <ReviewScreen
      trip={projectReviewTrip(lu.trip)}
      review={lu.review}
      mode={isApiAdapter() ? "server" : "memory"}
      recorderKind={devPagesEnabled() ? "console" : "none"}
    />
  );
}
