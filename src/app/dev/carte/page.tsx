import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MOCK_DEMO_TRIP, getTripAdapter } from "@/adapters";
import { devPagesEnabled } from "@/dev/flags";
import { messages } from "@/i18n";

import { CarteDemo, type DemoConfig, type DemoRenderer, type DemoVue } from "./CarteDemo";

// Lu à chaque requête : la variable VADROUILLE_DEV_PAGES est évaluée à l'exécution.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: messages.dev.carte.titre,
  robots: { index: false, follow: false },
};

type SearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/**
 * Démonstration de F4 : carte et `DayLine` synchronisées, sur les données de l'adaptateur mock.
 * Paramètres (pages de développement seulement) :
 * - `rendu=google` : rendu Google au lieu de la carte simulée (par défaut) ;
 * - `config=absente` ou `config=factice` : configuration injectée (vide, ou `test-key` / `test-map`) ;
 * - `vue=ensemble` : vue d'ensemble du séjour.
 */
export default async function DevCartePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  if (!devPagesEnabled()) {
    notFound();
  }
  const params = await searchParams;
  const adapter = getTripAdapter();
  const { ctx, tripId } = MOCK_DEMO_TRIP;
  const [trip, maps] = await Promise.all([adapter.getTrip(ctx, tripId), adapter.getTripMap(ctx, tripId)]);
  if (!trip) {
    notFound();
  }
  const renderer: DemoRenderer = first(params.rendu) === "google" ? "google" : "simulee";
  const configParam = first(params.config);
  const config: DemoConfig = configParam === "absente" || configParam === "factice" ? configParam : "environnement";
  const vue: DemoVue = first(params.vue) === "ensemble" ? "ensemble" : "jour";
  return <CarteDemo days={trip.days} maps={maps} renderer={renderer} config={config} vue={vue} />;
}
