import type { ReactNode } from "react";

import { TripLayout } from "@/features/sejour/screens";

// Données lues à chaque requête, dans le contexte d'organisation de la requête.
export const dynamic = "force-dynamic";

/**
 * Mise en page commune du Séjour et de la Journée (F5-PO-1, décision 0015 § 5.3) : carte et panneau montés
 * une fois pour le voyage, conservés d'une page à l'autre. Groupe de routes `(programme)` : la présentation
 * (`/voyages/[id]/presentation`) n'est pas concernée. Voyage inconnu ou d'une autre organisation : 404.
 */
export default async function ProgrammeLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  const { id } = await params;
  return (
    <TripLayout tripId={id} base="/voyages">
      {children}
    </TripLayout>
  );
}
