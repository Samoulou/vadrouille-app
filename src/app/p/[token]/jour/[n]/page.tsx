import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { loadSharedDay } from "@/features/partage/load";
import { SharedDayScreen } from "@/features/partage/SharedDayScreen";
import { SharedShell } from "@/features/partage/SharedShell";
import { format, messages } from "@/i18n";

// Lu à chaque requête (F10-PO-15) ; en-têtes privés et `no-store` posés par `next.config.ts` (F10-TL-8).
export const dynamic = "force-dynamic";

type Params = Promise<{ token: string; n: string }>;

const ROBOTS = { index: false, follow: false } as const;

/** Titre du document : « {destination} · Jour {n} · Programme partagé » (F10-PO-14). */
export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token, n } = await params;
  const data = await loadSharedDay(token, n);
  return data
    ? {
        title: format(messages.partage.vue.titreDocument.jour, { destination: data.view.trip.destination, n: data.view.dayIndex }),
        robots: ROBOTS,
      }
    : { robots: ROBOTS };
}

/** `RPJ`, « Journée partagée » (spécification F10, F10c) : lecture seule de la Journée, avec la carte du jour. */
export default async function SharedDayPage({ params }: { params: Params }) {
  const { token, n } = await params;
  const data = await loadSharedDay(token, n);
  const day = data?.view.trip.days.find((candidate) => candidate.index === data.view.dayIndex);
  if (!data || !day) notFound();
  // Partage ouvert avec l'adaptateur `mock` seulement (`shareAvailable()`, décision 0039) : aucune donnée de lieux
  // Google n'y est lue. B12 reprend cette valeur avec l'adaptateur réel.
  const placesFromGoogle = false;
  return (
    <SharedShell
      token={data.token}
      days={data.view.trip.days}
      current={day.index}
      maps={[{ index: day.index, points: data.view.points }]}
      placesFromGoogle={placesFromGoogle}
    >
      <SharedDayScreen day={day} placesFromGoogle={placesFromGoogle} />
    </SharedShell>
  );
}
