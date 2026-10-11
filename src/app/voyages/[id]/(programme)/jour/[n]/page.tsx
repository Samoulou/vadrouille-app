import type { Metadata } from "next";

import { JourneeScreen, journeeMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string }>;
type SearchParams = Promise<{ etape?: string | string[] }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { id, n } = await params;
  return journeeMetadata(id, n, (await searchParams).etape);
}

/** Écran 12 « Journée » (spécification F5). `n` hors des jours du voyage ou mal écrit : 404. */
export default async function JourneePage({ params }: { params: Params }) {
  const { id, n } = await params;
  return <JourneeScreen tripId={id} n={n} />;
}
