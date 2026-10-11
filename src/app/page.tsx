import { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP, getTripAdapter, isMockAdapter } from "@/adapters";
import { PRODUCT_NAME } from "@/config/site";
import { DemoSection, type DemoLink } from "@/features/accueil/DemoSection";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";
import { messages } from "@/i18n";

// `DATA_ADAPTER` lu à chaque requête, comme les pages du voyage (D1-PO-5).
export const dynamic = "force-dynamic";

/** Les quatre parcours simulés, dans l'ordre du produit (D1-PO-2) ; identifiants de `@/adapters` (D1-PO-3). */
function demoLinks(): DemoLink[] {
  const t = messages.accueil.demo.liens;
  const unlocked = tripRoutes("/voyages", MOCK_DEMO_UNLOCKED_TRIP.tripId);
  return [
    { href: presentationRoute(MOCK_DEMO_TRIP.tripId), label: t.presentation.libelle, detail: t.presentation.precision },
    { href: presentationRoute(MOCK_DEMO_UNLOCKED_TRIP.tripId), label: t.suite.libelle, detail: t.suite.precision },
    { href: unlocked.sejour(), label: t.sejour.libelle, detail: t.sejour.precision },
    { href: unlocked.jour(1), label: t.jour.libelle, detail: t.jour.precision },
  ];
}

/**
 * Page d'accueil : nom et promesse. Avec l'adaptateur `mock` seulement, section « Démonstration » vers les
 * parcours simulés (spécification D1, D1-PO-1) ; elle disparaît d'elle-même avec `DATA_ADAPTER=api`.
 */
export default async function HomePage() {
  let demo: { destination?: string } | null = null;
  if (isMockAdapter()) {
    const trip = await getTripAdapter().getTrip(MOCK_DEMO_TRIP.ctx, MOCK_DEMO_TRIP.tripId);
    demo = { destination: trip?.destination };
  }
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-3 px-5 py-10">
      <h1 className="text-destination font-extrabold tracking-[-0.02em] text-ink">{PRODUCT_NAME}</h1>
      <p className="text-corps text-ink-soft">{messages.produit.promesse}</p>
      {demo ? (
        <div className="mt-6">
          <DemoSection destination={demo.destination} links={demoLinks()} />
        </div>
      ) : null}
    </main>
  );
}
