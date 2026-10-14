import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isPrototypeAdapter } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
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
 * erreur de l'adaptateur : page d'erreur commune.
 */
export default async function AujourdhuiPage({ params }: { params: Params }) {
  const { id } = await params;
  const trip = await loadToday(id);
  if (!trip) notFound();
  // Mention « Données de lieux : Google » avec l'adaptateur `prototype` (spécification P0), comme le Séjour.
  return <TodayScreen trip={trip} placesFromGoogle={isPrototypeAdapter()} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
