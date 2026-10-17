import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { tripRoutes } from "@/features/sejour/routes";
import { SejourScreen } from "@/features/sejour/screen-sejour";
import { sejourMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return sejourMetadata(id);
}

/** Écran 11 « Séjour » (spécification F5). Sans session (`better-auth`, B3c) : redirection vers l'écran 4. */
export default async function SejourPage({ params }: { params: Params }) {
  const { id } = await params;
  await exigerSession(tripRoutes("/voyages", id).sejour());
  return <SejourScreen tripId={id} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
