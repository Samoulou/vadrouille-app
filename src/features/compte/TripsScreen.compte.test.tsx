import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { mockTripAdapter } from "@/adapters/mock";
import * as messages from "@/i18n/messages";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { TripsScreen } from "./TripsScreen";

/** « Mes voyages » : lien « Ton compte » (M9c, ticket 1122 ; spécification M9 § 6.4, critère 1). */

const NOW = () => Date.parse("2026-08-01T12:00:00+01:00");
const trips = () => mockTripAdapter.listTrips({ organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const });

describe("TripsScreen : lien « Ton compte »", () => {
  it("avec accountHref : un lien « Ton compte », dernier lien de l'écran, après ceux des voyages", async () => {
    const { container } = render(<TripsScreen trips={await trips()} now={NOW} accountHref="/compte" />);
    const lien = screen.getByRole("link", { name: messages.compte.lien });
    expect(lien).toHaveAttribute("href", "/compte");
    expect(screen.getAllByRole("link").at(-1)).toBe(lien);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("aucun voyage : le lien reste proposé", () => {
    render(<TripsScreen trips={[]} accountHref="/compte" />);
    expect(screen.getByRole("link", { name: messages.compte.lien })).toHaveAttribute("href", "/compte");
  });

  it("sans accountHref (site d'essai, catalogue des états) : aucun lien", async () => {
    render(<TripsScreen trips={await trips()} now={NOW} />);
    expect(screen.queryByRole("link", { name: messages.compte.lien })).toBeNull();
    render(<TripsScreen trips={[]} accountHref="/compte" embedded />);
    expect(screen.queryByRole("link", { name: messages.compte.lien })).toBeNull();
  });
});
