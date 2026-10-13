import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/dev/flags";
import { ReplaceScreen } from "@/features/sejour/screen-remplacer";
import { remplacerMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string; stopId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, n, stopId } = await params;
  return devPagesEnabled() ? remplacerMetadata(id, n, stopId) : {};
}

/** Écran 14 sur la carte simulée (F7-TL-4). 404 en production sans VADROUILLE_DEV_PAGES=1. */
export default async function DevRemplacerPage({ params }: { params: Params }) {
  if (!devPagesEnabled()) notFound();
  const { id, n, stopId } = await params;
  return <ReplaceScreen tripId={id} n={n} stopId={stopId} recorderKind="console" />;
}
