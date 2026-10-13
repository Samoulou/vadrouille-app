import type { Metadata } from "next";

import { devPagesEnabled } from "@/dev/flags";
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
 * des étapes du jour, événement, terminus ou repas pas encore choisi : 404.
 */
export default async function RemplacerPage({ params }: { params: Params }) {
  const { id, n, stopId } = await params;
  return <ReplaceScreen tripId={id} n={n} stopId={stopId} recorderKind={devPagesEnabled() ? "console" : "none"} />;
}
