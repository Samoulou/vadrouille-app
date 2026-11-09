import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { apresVoyageDisponible, finAccesApresVoyage, getTripReview, isPrototypeAdapter } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { tripRoutes } from "@/features/sejour/routes";
import { loadToday } from "@/features/voyage/load-today";
import { TodayScreen } from "@/features/voyage/TodayScreen";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// Données lues à chaque requête, dans le contexte d'organisation de la requête ; `Cache-Control` privé et
// `no-store` posé par `next.config.ts` (F10-TL-8).
export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

const ROBOTS = { index: false, follow: false } as const;

/** Titre du document : « {destination} · Aujourd'hui » (provisoire, UX/UI). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  const trip = await loadToday(id);
  return trip
    ? { title: format(messages.voyage.aujourdhui.titreDocument, { destination: trip.destination }), robots: ROBOTS }
    : { robots: ROBOTS };
}

/**
 * Écran 15 « Pendant le voyage » (`R15` ; spécification F10, F10a). Page sans carte, hors du groupe
 * `(programme)` (F10-TL-3) : elle lit le voyage par `getTripReader()` et transmet tous ses jours projetés ;
 * l'écran choisit le jour dans le navigateur (F10-TL-2). Voyage inconnu ou d'une autre organisation : 404 ;
 * erreur de l'adaptateur : page d'erreur commune. Sans session (`better-auth`, B3c) : redirection vers l'écran 4.
 * « Donner ton avis » (M8a, ticket 1062) : seulement si l'écran 16 existe pour ce voyage (`getTripReview` non nul :
 * débloqué, personne propriétaire sur `api`, jamais sur le site d'essai) ; l'écran le montre à l'état « terminé ».
 */
export default async function AujourdhuiPage({ params }: { params: Params }) {
  const { id } = await params;
  const routes = tripRoutes("/voyages", id);
  const ctx = await exigerSession(routes.aujourdhui() ?? routes.sejour());
  const trip = await loadToday(id);
  if (!trip) notFound();
  const href = routes.apresVoyage();
  const end = trip.days[trip.days.length - 1]?.date;
  const review =
    href !== null && end !== undefined && apresVoyageDisponible() && (await getTripReview(ctx, id)) !== null ? { href, until: finAccesApresVoyage(end) } : undefined;
  // Mention « Données de lieux : Google » avec l'adaptateur `prototype` (spécification P0), comme le Séjour.
  return <TodayScreen trip={trip} placesFromGoogle={isPrototypeAdapter()} recorderKind={devPagesEnabled() ? "console" : "none"} review={review} />;
}
