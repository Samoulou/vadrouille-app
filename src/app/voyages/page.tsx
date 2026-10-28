import type { Metadata } from "next";

import { getTripReader, siteEssaiAutorise } from "@/adapters";
import { PRODUCT_NAME } from "@/config/site";
import { exigerSession } from "@/features/compte/session";
import { TripsScreen } from "@/features/compte/TripsScreen";
import { creationRoutes } from "@/features/creation/routes";
import { mesVoyagesRoute } from "@/features/sejour/routes";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";

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
 * « Créer un voyage » (F11-PO-4, C13/C14) : vers l'écran 1 (F8a), avec `?site=essai` sur le site d'essai, comme
 * l'accueil.
 *
 * Sans session (`better-auth`, B3c) : redirection vers `/connexion?suite=/voyages`.
 */
export default async function MesVoyagesPage() {
  const trips = await getTripReader().listTrips(await exigerSession(mesVoyagesRoute()));
  return <TripsScreen trips={trips} createHref={creationRoutes.nouveau({ essai: siteEssaiAutorise() })} />;
}
