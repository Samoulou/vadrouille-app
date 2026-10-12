import type { Metadata } from "next";

import { getRequestContext, getTripReader } from "@/adapters";
import { PRODUCT_NAME } from "@/config/site";
import { TripsScreen } from "@/features/compte/TripsScreen";
import { format, messages } from "@/i18n";

// Données lues à chaque requête, dans le contexte d'organisation de la requête.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: format(messages.mesVoyages.titreDocument, { produit: PRODUCT_NAME }),
  robots: { index: false, follow: false },
};

/**
 * Écran 17 « Mes voyages » (`R17` ; spécification F11, F11a). Lit seulement les résumés des voyages de
 * l'organisation de la requête (`listTrips`, par `getTripReader()` : un voyage débloqué par un paiement simulé
 * apparaît débloqué, décision 0021 § 2) ; aucun jour, aucune proposition, aucune position. Le classement est
 * fait par l'écran, dans le navigateur (décision 0021 § 3).
 *
 * « Créer un voyage » n'est pas proposé : l'écran 1 (`/voyages/nouveau`, F8a) n'existe pas encore (F11-PO-4).
 */
export default async function MesVoyagesPage() {
  const trips = await getTripReader().listTrips(getRequestContext());
  return <TripsScreen trips={trips} />;
}
