import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { DAY_PARAM_PATTERN, tripRoutes } from "@/features/sejour/routes";
import { JourneeScreen } from "@/features/sejour/screen-journee";
import { journeeMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string }>;
type SearchParams = Promise<{ etape?: string | string[] }>;

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: SearchParams }): Promise<Metadata> {
  const { id, n } = await params;
  return journeeMetadata(id, n, (await searchParams).etape);
}

/**
 * Écran 12 « Journée » (spécification F5). `n` hors des jours du voyage ou mal écrit : 404. Sans session
 * (`better-auth`, B3c) : redirection vers l'écran 4, suite la Journée (le Séjour si `n` est mal écrit).
 */
export default async function JourneePage({ params }: { params: Params }) {
  const { id, n } = await params;
  const routes = tripRoutes("/voyages", id);
  await exigerSession(DAY_PARAM_PATTERN.test(n) ? routes.jour(Number(n)) : routes.sejour());
  return <JourneeScreen tripId={id} n={n} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
