import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isPrototypeAdapter } from "@/adapters";
import { format, messages } from "@/i18n";

import { findFicheTarget } from "./fiche";
import { dayFromParam, loadTrip } from "./load";
import type { TripRoutesBase } from "./routes";
import { SejourOriginProvider } from "./SejourOrigin";
import { TripShell } from "./TripShell";

/**
 * Composants serveur partagés par les routes `/voyages/…` et leurs pages de développement `/dev/voyages/…`
 * (décision 0015 § 1 et § 5.3) : lecture par l'adaptateur dans le contexte de la requête, `notFound()`
 * hors organisation ou hors limites. Aucune de ces fonctions n'importe la carte simulée.
 *
 * Ce module, importé par la mise en page du voyage, n'importe le contenu d'aucun écran : chaque page importe
 * le sien (`screen-sejour.tsx`, `screen-journee.tsx`). Sinon le JavaScript du Séjour (mesure comprise) serait
 * chargé par la Journée, et celui de la Journée par le Séjour (budget du handover § 14, décision 0016 § 3).
 */

const t = messages.sejour.titreDocument;
const ROBOTS = { index: false, follow: false } as const;

export async function TripLayout({ tripId, base, children }: { tripId: string; base: TripRoutesBase; children: ReactNode }) {
  const data = await loadTrip(tripId);
  if (!data) notFound();
  return (
    <TripShell trip={data.trip} maps={data.maps} base={base} placesFromGoogle={isPrototypeAdapter()}>
      <SejourOriginProvider>{children}</SejourOriginProvider>
    </TripShell>
  );
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
