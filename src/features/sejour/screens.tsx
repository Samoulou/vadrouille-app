import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { format, messages } from "@/i18n";

import { JourneePanel } from "./JourneePanel";
import { dayFromParam, loadTrip } from "./load";
import { tripRoutes, type TripRoutesBase } from "./routes";
import { SejourPanel } from "./SejourPanel";
import { TripShell } from "./TripShell";

/**
 * Composants serveur partagés par les routes `/voyages/…` et leurs pages de développement `/dev/voyages/…`
 * (décision 0015 § 1 et § 5.3) : lecture par l'adaptateur dans le contexte de la requête, `notFound()`
 * hors organisation ou hors limites. Aucune de ces fonctions n'importe la carte simulée.
 */

const t = messages.sejour.titreDocument;
const ROBOTS = { index: false, follow: false } as const;

export async function TripLayout({ tripId, base, children }: { tripId: string; base: TripRoutesBase; children: ReactNode }) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  return (
    <TripShell trip={data.trip} maps={data.maps} base={base}>
      {children}
    </TripShell>
  );
}

export async function SejourScreen({ tripId }: { tripId: string }) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  return <SejourPanel trip={data.trip} />;
}

export async function JourneeScreen({ tripId, n, base }: { tripId: string; n: string; base: TripRoutesBase }) {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  if (!data || !day) notFound();
  return <JourneePanel day={day} routes={tripRoutes(base, data.trip.id)} />;
}

/** Titre du document du Séjour : « {destination} · Séjour » (F5-PO-1). */
export async function sejourMetadata(tripId: string): Promise<Metadata> {
  const data = await loadTrip(tripId);
  return data ? { title: format(t.sejour, { destination: data.trip.destination }), robots: ROBOTS } : { robots: ROBOTS };
}

/** Titre du document de la Journée : « {destination} · Jour {n} » (F5-PO-1). */
export async function journeeMetadata(tripId: string, n: string): Promise<Metadata> {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  return data && day
    ? { title: format(t.jour, { destination: data.trip.destination, n: day.index }), robots: ROBOTS }
    : { robots: ROBOTS };
}
