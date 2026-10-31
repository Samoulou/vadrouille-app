import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { isPrototypeAdapter } from "@/adapters";
import { jeuCarteVilles } from "@/adapters/carte-villes";
import { devPagesEnabled } from "@/dev/flags";
import { TripShell } from "@/features/sejour/TripShell";
import * as messages from "@/i18n/messages";

import { SimulatedCarte } from "../../../voyages/SimulatedCarte";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.dev.carte.titre,
  robots: { index: false, follow: false },
};

/**
 * Carte à plusieurs villes (décision 0150, critère 19 de M4-suite) : Séjour et Journée d'un voyage simulé avec positions,
 * mêmes `TripShell` et carte que `/voyages/…`, avec la carte simulée injectée. 404 en production sans VADROUILLE_DEV_PAGES=1
 * et avec l'adaptateur prototype (jamais de positions Google sur une carte non Google).
 */
export default async function CarteVillesLayout({ params, children }: { params: Promise<{ jeu: string }>; children: ReactNode }) {
  if (!devPagesEnabled() || isPrototypeAdapter()) notFound();
  const { jeu } = await params;
  const donnees = jeuCarteVilles(jeu);
  if (!donnees) notFound();
  return (
    <SimulatedCarte>
      <TripShell trip={donnees.trip} maps={donnees.maps} base="/dev/carte/villes">
        {children}
      </TripShell>
    </SimulatedCarte>
  );
}
