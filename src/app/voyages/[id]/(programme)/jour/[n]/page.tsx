import type { Metadata } from "next";

import { JourneeScreen, journeeMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, n } = await params;
  return journeeMetadata(id, n);
}

/** Écran 12 « Journée » (spécification F5). `n` hors des jours du voyage ou mal écrit : 404. */
export default async function JourneePage({ params }: { params: Params }) {
  const { id, n } = await params;
  return <JourneeScreen tripId={id} n={n} base="/voyages" />;
}
