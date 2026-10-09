import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { format, messages } from "@/i18n";

import { findFicheTarget } from "./fiche";
import { JourneeView } from "./JourneeView";
import { dayFromParam, loadTrip } from "./load";
import type { TripRoutesBase } from "./routes";
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

/**
 * Écran 12 « Journée » et, avec `?etape=`, écran 13 « Fiche étape » : la page valide `n` (404 sinon) ; le
 * contenu du panneau est rendu par `JourneeView` depuis le contexte du voyage (programme, fiche), et ses
 * adresses par le module `routes.ts` que `TripShell` construit pour la même base.
 */
export async function JourneeScreen({ tripId, n }: { tripId: string; n: string }) {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  if (!data || !day) notFound();
  return <JourneeView />;
}

/** Titre du document du Séjour : « {destination} · Séjour » (F5-PO-1). */
export async function sejourMetadata(tripId: string): Promise<Metadata> {
  const data = await loadTrip(tripId);
  return data ? { title: format(t.sejour, { destination: data.trip.destination }), robots: ROBOTS } : { robots: ROBOTS };
}

/**
 * Titre du document de la Journée : « {destination} · Jour {n} », et, fiche ouverte, « {nom de l'étape} ·
 * Jour {n} » (F5-PO-1). Un `etape` absent du jour garde le titre du jour.
 */
export async function journeeMetadata(tripId: string, n: string, etape?: string | string[]): Promise<Metadata> {
  const data = await loadTrip(tripId);
  const day = data ? dayFromParam(data.trip, n) : null;
  if (!data || !day) return { robots: ROBOTS };
  const fiche = findFicheTarget(day, Array.isArray(etape) ? etape[0] : etape);
  const title = fiche
    ? format(t.etape, { name: fiche.stop.name, n: day.index })
    : format(t.jour, { destination: data.trip.destination, n: day.index });
  return { title, robots: ROBOTS };
}
