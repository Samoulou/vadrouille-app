import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { devPagesEnabled } from "@/dev/flags";
import { SejourScreen, sejourMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return devPagesEnabled() ? sejourMetadata(id) : {};
}

/** Écran 11 sur la carte simulée (F5-TL-1). 404 en production sans VADROUILLE_DEV_PAGES=1. */
export default async function DevSejourPage({ params }: { params: Params }) {
  if (!devPagesEnabled()) notFound();
  const { id } = await params;
  return <SejourScreen tripId={id} />;
}
