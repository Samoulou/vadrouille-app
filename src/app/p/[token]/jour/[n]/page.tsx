import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isPrototypeAdapter } from "@/adapters";
import { loadSharedDay } from "@/features/partage/load";
import { SharedDayScreen } from "@/features/partage/SharedDayScreen";
import { SharedShell } from "@/features/partage/SharedShell";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

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
  // Noms et positions des lieux : données Google avec l'adaptateur `prototype` (partage réel du site d'essai, décision
  // 0135), montrées seulement sur la carte Google de `DayMap` (sinon l'état de remplacement, sans carte) avec la mention
  // de leur source ; aucune avec l'adaptateur `mock`.
  const placesFromGoogle = isPrototypeAdapter();
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
