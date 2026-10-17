import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { DAY_PARAM_PATTERN, tripRoutes } from "@/features/sejour/routes";
import { ReplaceScreen } from "@/features/sejour/screen-remplacer";
import { remplacerMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string; stopId: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, n, stopId } = await params;
  return remplacerMetadata(id, n, stopId);
}

/**
 * Écran 14 « Remplacer une étape » (spécification F7), dans le panneau du voyage. `n` hors du voyage, étape absente
 * des étapes du jour, événement, terminus ou repas pas encore choisi : 404. Sans session (`better-auth`, B3c) :
 * redirection vers l'écran 4, suite la Journée (« Remplacer » n'est jamais une suite, B3-PO-11).
 */
export default async function RemplacerPage({ params }: { params: Params }) {
  const { id, n, stopId } = await params;
  const routes = tripRoutes("/voyages", id);
  await exigerSession(DAY_PARAM_PATTERN.test(n) ? routes.jour(Number(n)) : routes.sejour());
  return <ReplaceScreen tripId={id} n={n} stopId={stopId} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
