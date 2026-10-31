import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { DAY_PARAM_PATTERN, tripRoutes } from "@/features/sejour/routes";
import { AjouterScreen, ajouterMetadata } from "@/features/sejour/screen-ajouter";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string; n: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id, n } = await params;
  return ajouterMetadata(id, n);
}

/**
 * « Ajouter un lieu » (tâche M5d-2, ticket 961 ; spécification M5 § 6 et F7), dans le panneau du voyage. `n` hors du
 * voyage, ou site d'essai : 404. Sans session (`better-auth`, B3c) : redirection vers l'écran 4, suite la Journée
 * (« Ajouter un lieu » n'est jamais une suite, comme « Remplacer »).
 */
export default async function AjouterPage({ params, searchParams }: { params: Params; searchParams: SearchParams }) {
  const { id, n } = await params;
  const routes = tripRoutes("/voyages", id);
  await exigerSession(DAY_PARAM_PATTERN.test(n) ? routes.jour(Number(n)) : routes.sejour());
  return <AjouterScreen tripId={id} n={n} searchParams={await searchParams} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
