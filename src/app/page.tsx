import Link from "next/link";

import {
  MOCK_DEMO_TRIP,
  MOCK_DEMO_UNLOCKED_TRIP,
  getTripAdapter,
  isMockAdapter,
  paymentAvailable,
  siteEssaiAutorise,
} from "@/adapters";
import { Button } from "@/components/ligne/Button";
import { DemoSection, type DemoLink } from "@/features/accueil/DemoSection";
import { Landing } from "@/features/accueil/Landing";
import { creationRoutes } from "@/features/creation/routes";
import { presentationRoute, unlockRoutes } from "@/features/presentation/routes";
import { mesVoyagesRoute, tripRoutes } from "@/features/sejour/routes";
import * as messages from "@/i18n/messages";

// `DATA_ADAPTER` lu à chaque requête, comme les pages du voyage (D1-PO-5).
export const dynamic = "force-dynamic";

/**
 * Les quatre parcours simulés, dans l'ordre du produit (D1-PO-2) ; identifiants de `@/adapters` (D1-PO-3).
 * Cinquième entrée « Débloquer » (F9-PO-17), seulement si le paiement simulé est disponible (F9-PO-19).
 * Dernière entrée « Mes voyages » (F11-PO-18), après les entrées existantes.
 */
function demoLinks(): DemoLink[] {
  const t = messages.accueil.demo.liens;
  const unlocked = tripRoutes("/voyages", MOCK_DEMO_UNLOCKED_TRIP.tripId);
  const links: DemoLink[] = [
    { href: presentationRoute(MOCK_DEMO_TRIP.tripId), label: t.presentation.libelle, detail: t.presentation.precision },
    { href: presentationRoute(MOCK_DEMO_UNLOCKED_TRIP.tripId), label: t.suite.libelle, detail: t.suite.precision },
    { href: unlocked.sejour(), label: t.sejour.libelle, detail: t.sejour.precision },
    { href: unlocked.jour(1), label: t.jour.libelle, detail: t.jour.precision },
  ];
  if (paymentAvailable()) {
    links.push({ href: unlockRoutes(MOCK_DEMO_TRIP.tripId).debloquer(), label: t.debloquer.libelle, detail: t.debloquer.precision });
  }
  links.push({ href: mesVoyagesRoute(), label: t.mesVoyages.libelle, detail: t.mesVoyages.precision });
  return links;
}

/**
 * Page d'accueil (ticket #802, décision 0132 : `Landing`) : nom, promesse et « Créer un voyage » (`Button` `primary` en pleine largeur, lien vers l'écran 1
 * `/voyages/nouveau` ; demande de Samuel transmise par le CEO, ticket #259), quel que soit l'adaptateur. Avec
 * l'adaptateur `mock` seulement, section « Démonstration » vers les parcours simulés (spécification D1, D1-PO-1) ; elle disparaît d'elle-même avec `DATA_ADAPTER=api`.
 * Site d'essai (adaptateur `prototype`) : une seule app (spécification E2E-essai, lot 2) ; la section « Prototype » de
 * P0-PO-11 est retirée et ses voyages se lisent dans « Mes voyages », lien secondaire sous « Créer un voyage ». Hors
 * liste blanche de l'adaptateur `prototype`, la page lève (erreur 500), comme avant.
 */
export default async function HomePage() {
  let demo: { destination?: string } | null = null;
  if (isMockAdapter()) {
    const trip = await getTripAdapter().getTrip(MOCK_DEMO_TRIP.ctx, MOCK_DEMO_TRIP.tripId);
    demo = { destination: trip?.destination };
  }
  // Site d'essai : garde explicite de la liste blanche (décision 0032 § A4.2), qui lève hors de la préversion sans rien lire.
  const essai = siteEssaiAutorise();
  return (
    <Landing
      createHref={creationRoutes.nouveau({ essai })}
      secondary={
        essai ? (
          <Button asChild variant="secondary" className="w-full">
            <Link href={mesVoyagesRoute()}>{messages.accueil.mesVoyages}</Link>
          </Button>
        ) : null
      }
      footer={demo ? <DemoSection destination={demo.destination} links={demoLinks()} /> : null}
    />
  );
}
