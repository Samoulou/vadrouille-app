import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/dev/flags";
import { JourneeScreen, journeeMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string }>;
type SearchParams = Promise<{ etape?: string | string[] }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { id, n } = await params;
  return devPagesEnabled() ? journeeMetadata(id, n, (await searchParams).etape) : {};
}

/** Écran 12 sur la carte simulée (F5-TL-1). 404 en production sans VADROUILLE_DEV_PAGES=1. */
export default async function DevJourneePage({ params }: { params: Params }) {
  if (!devPagesEnabled()) notFound();
  const { id, n } = await params;
  return <JourneeScreen tripId={id} n={n} />;
}
