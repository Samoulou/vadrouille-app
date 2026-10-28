import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isPrototypeAdapter } from "@/adapters";
import { loadSharedTrip } from "@/features/partage/load";
import { SharedShell } from "@/features/partage/SharedShell";
import { SharedTripScreen } from "@/features/partage/SharedTripScreen";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

// Lu à chaque requête : un lien désactivé ou expiré cesse de fonctionner dès la requête suivante (F10-PO-15) ;
// en-têtes privés et `no-store` posés par `next.config.ts` (F10-TL-8).
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string }>;

const ROBOTS = { index: false, follow: false } as const;

/** Titre du document : « {destination} · Programme partagé » (F10-PO-14). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadSharedTrip(token);
  return data
    ? { title: format(messages.partage.vue.titreDocument.sejour, { destination: data.view.trip.destination }), robots: ROBOTS }
    : { robots: ROBOTS };
}

/** `RP`, « Séjour partagé » (spécification F10, F10c) : lecture seule du Séjour, avec la carte. */
export default async function SharedTripPage({ params }: { params: Params }) {
  const { token } = await params;
  const data = await loadSharedTrip(token);
  if (!data) notFound();
  // Noms et positions des lieux : données Google avec l'adaptateur `prototype` (partage réel du site d'essai, décision
  // 0135), montrées seulement sur la carte Google de `DayMap` (sinon l'état de remplacement, sans carte) avec la mention
  // de leur source ; aucune avec l'adaptateur `mock`.
  const placesFromGoogle = isPrototypeAdapter();
  const { trip, maps } = data.view;
  return (
    <SharedShell token={data.token} days={trip.days} current="sejour" maps={maps} placesFromGoogle={placesFromGoogle}>
      <SharedTripScreen token={data.token} trip={trip} placesFromGoogle={placesFromGoogle} />
    </SharedShell>
  );
}
