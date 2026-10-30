import type { Metadata } from "next";

import { exigerSession } from "@/features/compte/session";
import { tripRoutes } from "@/features/sejour/routes";
import { VersionsScreen } from "@/features/sejour/screen-versions";
import { versionsMetadata } from "@/features/sejour/screens";

export const dynamic = "force-dynamic";

type Params = Promise<{ id: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { id } = await params;
  return versionsMetadata(id);
}

/**
 * « Versions du programme » (tâche M5b ; spécification M5 § 4), dans le panneau du voyage. Voyage inconnu, d'une autre
 * organisation ou non débloqué : 404. Sans session (`better-auth`, B3c) : redirection vers l'écran 4, suite le Séjour.
 */
export default async function VersionsPage({ params }: { params: Params }) {
  const { id } = await params;
  await exigerSession(tripRoutes("/voyages", id).sejour());
  return <VersionsScreen tripId={id} />;
}
