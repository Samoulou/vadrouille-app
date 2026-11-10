import type { Metadata } from "next";

import { apresVoyageDisponible, getPaymentAdapter, getTripReader, goutsEnregistres, paymentAvailable, siteEssaiAutorise } from "@/adapters";
import type { TripSummary } from "@/contracts";
import { PRODUCT_NAME } from "@/config/site";
import { devPagesEnabled } from "@/dev/flags";
import { exigerSession } from "@/features/compte/session";
import { TripsScreen } from "@/features/compte/TripsScreen";
import { creationRoutes } from "@/features/creation/routes";
import { unlockRoutes } from "@/features/presentation/routes";
import { loadReceiptLinks } from "@/features/presentation/unlock-load";
import type { ReviewLink } from "@/features/compte/trips";
import { mesVoyagesRoute, tripRoutes } from "@/features/sejour/routes";
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
 * Reçus (B4d) : avec un adaptateur de paiement qui en a (`simulated`), un lien « Voir le reçu » sous chaque voyage payé
 * par la personne ; aucun sans paiement disponible (garde lue avant, 0020 § 2.3) ni avec `mock`.
 *
 * « Donner ton avis » (M8a, ticket 1062) : voir `reviewLinksOf`.
 *
 * « Tes goûts retenus » (M8c-1, ticket 1121) : sur `api`, les goûts de la personne de la session, lus à chaque requête
 * (`goutsEnregistres`) ; sur `mock`, rien n'est lu ici (mémoire de l'onglet) ; aucun sur le site d'essai.
 *
 * Sans session (`better-auth`, B3c) : redirection vers `/connexion?suite=/voyages`.
 */
export default async function MesVoyagesPage() {
  const ctx = await exigerSession(mesVoyagesRoute());
  const trips = await getTripReader().listTrips(ctx);
  const receiptHrefs = paymentAvailable() ? await loadReceiptLinks(getPaymentAdapter(), ctx, (id) => unlockRoutes(id).recu()) : {};
  const retainedTastes = await goutsEnregistres()?.listRetainedTastes(ctx);
  return (
    <TripsScreen
      trips={trips}
      receiptHrefs={receiptHrefs}
      reviewLinks={reviewLinksOf(trips)}
      {...(retainedTastes === undefined ? {} : { retainedTastes })}
      recorderKind={devPagesEnabled() ? "console" : "none"}
      createHref={creationRoutes.nouveau({ essai: siteEssaiAutorise() })}
    />
  );
}

/**
 * « Donner ton avis » (M8a, ticket 1062) : pour chaque voyage débloqué, l'adresse de l'écran 16 ; l'écran ne montre le
 * lien qu'à partir du dernier jour du voyage. Aucun lien sur le site d'essai.
 */
function reviewLinksOf(trips: readonly TripSummary[]): Record<string, ReviewLink> {
  if (!apresVoyageDisponible()) return {};
  const links: Record<string, ReviewLink> = {};
  for (const trip of trips) {
    const href = tripRoutes("/voyages", trip.id).apresVoyage();
    if (trip.unlocked && href !== null) links[trip.id] = { href };
  }
  return links;
}
