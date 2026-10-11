import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { devPagesEnabled } from "@/dev/flags";
import { TripLayout } from "@/features/sejour/screens";

import { SimulatedCarte } from "../SimulatedCarte";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

/**
 * Pendant de développement des écrans du voyage (F5-TL-1, décision 0015 § 1) : mêmes composants que
 * `/voyages/…`, avec la carte simulée injectée. 404 en production sans VADROUILLE_DEV_PAGES=1.
 */
export default async function DevTripLayout({ params, children }: { params: Promise<{ id: string }>; children: ReactNode }) {
  if (!devPagesEnabled()) notFound();
  const { id } = await params;
  return (
    <SimulatedCarte>
      <TripLayout tripId={id} base="/dev/voyages">
        {children}
      </TripLayout>
    </SimulatedCarte>
  );
}
