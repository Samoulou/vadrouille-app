import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { edimbourgDebloque } from "@/mocks/edimbourg";

import { projectTodayTrip } from "./today";
import { TodayScreen } from "./TodayScreen";

/** « Donner ton avis » de l'écran 15 (M8a, ticket 1062 ; spécification M8 § 3.1 point 5, critère 11) : état « terminé » seulement. */

vi.mock("@/lib/offline/register", () => ({ registerOfflineFallback: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

const TRIP = projectTodayTrip(edimbourgDebloque);
const REVIEW = { href: `/voyages/${TRIP.id}/retour` };

const renderAt = (iso: string, review: typeof REVIEW | null = REVIEW) =>
  render(<TodayScreen trip={TRIP} placesFromGoogle={false} now={() => Date.parse(iso)} deviceTimeZone="Europe/London" review={review ?? undefined} />);

describe("TodayScreen : « Donner ton avis »", () => {
  it.each(["2026-09-04T12:00:00+01:00", "2026-10-11T12:00:00+01:00"])("état « Ton voyage est terminé » (%s, sans borne haute) : lien vers l'écran 16, à côté de « Voir le séjour »", (iso) => {
    renderAt(iso);
    expect(screen.getByText("Ton voyage est terminé.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Donner ton avis" })).toHaveAttribute("href", REVIEW.href);
    expect(screen.getByRole("link", { name: "Voir le séjour" })).toBeInTheDocument();
  });

  it.each([
    ["avant le voyage", "2026-08-01T12:00:00+01:00"],
    ["pendant le voyage", "2026-08-30T10:40:00+01:00"],
  ])("%s : aucun lien", (_nom, iso) => {
    renderAt(iso);
    expect(screen.queryByRole("link", { name: "Donner ton avis" })).toBeNull();
  });

  it("sans écran 16 (prop absente) : aucun lien", () => {
    renderAt("2026-09-04T12:00:00+01:00", null);
    expect(screen.queryByRole("link", { name: "Donner ton avis" })).toBeNull();
  });
});
