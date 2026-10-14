import Link from "next/link";

import {
  MOCK_DEMO_TRIP,
  MOCK_DEMO_UNLOCKED_TRIP,
  getRequestContext,
  getTripAdapter,
  isMockAdapter,
  isPrototypeAdapter,
  paymentAvailable,
} from "@/adapters";
import { Button } from "@/components/ligne/Button";
import { PRODUCT_NAME } from "@/config/site";
import type { TripSummary } from "@/contracts";
import { DemoSection, type DemoLink } from "@/features/accueil/DemoSection";
import { PrototypeSection } from "@/features/accueil/PrototypeSection";
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
 * Page d'accueil : nom, promesse et « Créer un voyage » (`Button` `primary` en pleine largeur, lien vers l'écran 1
 * `/voyages/nouveau` ; demande de Samuel transmise par le CEO, ticket #259), quel que soit l'adaptateur. Avec
 * l'adaptateur `mock` seulement, section « Démonstration » vers les parcours simulés (spécification D1, D1-PO-1) ; elle disparaît d'elle-même avec `DATA_ADAPTER=api`.
 * Avec l'adaptateur `prototype` seulement, section « Prototype » (spécification P0, P0-PO-11) : un voyage par
 * programme du dossier, absente sans programme ; hors liste blanche, `getRequestContext()` lève (erreur 500).
 */
export default async function HomePage() {
  let demo: { destination?: string } | null = null;
  if (isMockAdapter()) {
    const trip = await getTripAdapter().getTrip(MOCK_DEMO_TRIP.ctx, MOCK_DEMO_TRIP.tripId);
    demo = { destination: trip?.destination };
  }
  let prototype: TripSummary[] = [];
  if (isPrototypeAdapter()) {
    const ctx = getRequestContext();
    prototype = await getTripAdapter().listTrips(ctx);
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5 py-10">
      <h1 className="text-destination font-extrabold tracking-[-0.02em] text-ink">{PRODUCT_NAME}</h1>
      <p className="text-corps text-ink-soft">{messages.produit.promesse}</p>
      <Button asChild className="mt-6 w-full">
        <Link href={creationRoutes.nouveau()}>{messages.accueil.creer}</Link>
      </Button>
      {demo ? (
        <div className="mt-6">
          <DemoSection destination={demo.destination} links={demoLinks()} />
        </div>
      ) : null}
      {prototype.length > 0 ? (
        <div className="mt-6">
          <PrototypeSection trips={prototype} />
        </div>
      ) : null}
    </main>
  );
}
