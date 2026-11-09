import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockTripAdapter } from "@/adapters/mock";
import type { TripSummary } from "@/contracts";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { reviewLinkShown, type ReviewLink } from "./trips";
import { TripsScreen } from "./TripsScreen";

/**
 * « Donner ton avis » dans « Mes voyages » (M8a, ticket 1062 ; spécification M8 § 3.1 point 5, critère 11) : lien distinct,
 * jamais imbriqué, du dernier jour du voyage au dernier jour modifiable compris, à la date de la destination.
 */

const ED_OK = "mock_trip_edimbourg_debloque";
const LINKS: Record<string, ReviewLink> = { [ED_OK]: { href: `/voyages/${ED_OK}/retour`, until: "2026-10-03" } };

async function trips(): Promise<TripSummary[]> {
  return mockTripAdapter.listTrips({ organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const });
}

const at = (iso: string) => {
  const value = Date.parse(iso);
  return () => value;
};

describe("reviewLinkShown", () => {
  const summary = { timeZone: "Europe/London", end: "2026-09-03" };
  const link = LINKS[ED_OK]!;
  it.each([
    ["2026-09-02T23:59:00+01:00", false],
    ["2026-09-03T00:00:00+01:00", true],
    ["2026-09-03T00:30:00+02:00", false],
    ["2026-10-03T23:59:00+01:00", true],
    ["2026-10-04T00:00:00+01:00", false],
  ])("%s : %s", (iso, shown) => {
    expect(reviewLinkShown(summary, link, Date.parse(iso))).toBe(shown);
  });
});

describe("TripsScreen : « Donner ton avis »", () => {
  it("jamais avant le dernier jour", async () => {
    render(<TripsScreen trips={await trips()} reviewLinks={LINKS} now={at("2026-09-02T12:00:00+01:00")} />);
    expect(screen.queryByRole("link", { name: /Donner ton avis/ })).toBeNull();
  });

  it("le dernier jour : lien distinct sous la ligne du voyage, nom accessible avec la destination, jamais dans le lien du voyage", async () => {
    const { container } = render(<TripsScreen trips={await trips()} reviewLinks={LINKS} now={at("2026-09-03T09:00:00+01:00")} />);
    const lien = screen.getByRole("link", { name: "Donner ton avis (Édimbourg)" });
    expect(lien).toHaveAttribute("href", `/voyages/${ED_OK}/retour`);
    expect(lien).toHaveTextContent("Donner ton avis");
    expect(lien.closest(`[data-trip='${ED_OK}']`)).not.toBeNull();
    expect(container.querySelector("a a")).toBeNull();
    expect(within(lien.closest("li")!).getAllByRole("link")).toHaveLength(2);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("après le dernier jour modifiable : plus de lien ; sans `reviewLinks` : jamais", async () => {
    render(<TripsScreen trips={await trips()} reviewLinks={LINKS} now={at("2026-10-09T12:00:00+01:00")} />);
    expect(screen.queryByRole("link", { name: /Donner ton avis/ })).toBeNull();
  });
});
