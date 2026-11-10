import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ok, type GenerationStatus, type TripCity } from "@/contracts";
import * as messages from "@/i18n/messages";

import { axeViolations } from "../../../tests/unit/axe";

import type { FetchStatus } from "./generation";
import { PreparationView } from "./PreparationView";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.mock("@/server/actions/creation", () => ({ getGenerationStatus: vi.fn(), relancerVoyageEssai: vi.fn() }));
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

const t = messages.creation.ecran5;

/** Rome du 05-04, puis Florence à partir du 05-06 : J3 est la journée du changement de ville. */
const ROME_FLORENCE: TripCity[] = [
  { name: "Rome", start: "2027-05-04", end: "2027-05-06" },
  { name: "Florence", start: "2027-05-06", end: "2027-05-08" },
];

const STATUS: GenerationStatus = {
  phase: "ready",
  tripId: "mock_trip_rome_florence",
  days: [
    { index: 1, state: "ready", readyStops: 4 },
    { index: 2, state: "ready", readyStops: 2 },
    { index: 3, state: "ready", readyStops: 2 },
  ],
  expected: 8,
  ready: 8,
};

const fetchStatus: FetchStatus = async () => ok(STATUS);

function renderView(cities?: readonly TripCity[]) {
  return render(<PreparationView tripId={STATUS.tripId} initial={STATUS} fetchStatus={fetchStatus} {...(cities ? { cities } : {})} />);
}

const rows = () => within(screen.getByRole("list", { name: t.jours })).getAllByRole("listitem");
const badgeName = (row: HTMLElement) => row.querySelector("[data-day] .sr-only")?.textContent;

/** Critère 13 (spécification M4 § 7.2 et § 7.7 ; décision UX-M4S-B) ; critère 25 pour une seule ville. */
describe("Écran 5: ville de chaque jour", () => {
  it("texte masqué des pastilles sm : « Jour 1, Rome », « Jour 3, de Rome à Florence »", () => {
    renderView(ROME_FLORENCE);
    expect(rows().map(badgeName)).toEqual(["Jour 1, Rome", "Jour 2, Rome", "Jour 3, de Rome à Florence"]);
  });

  it("légendes « Rome » et « De Rome à Florence » : corps-s, ink-2, aria-hidden, au-dessus de la mini-ligne dans la colonne centrale ; mini-ligne aria-hidden", async () => {
    const { container } = renderView(ROME_FLORENCE);
    const legendes = rows().map((row) => row.querySelector("[data-part='legende-ville']") as HTMLElement);
    expect(legendes.map((legende) => legende.textContent)).toEqual(["Rome", "Rome", "De Rome à Florence"]);
    for (const [rang, legende] of legendes.entries()) {
      expect(legende).toHaveAttribute("aria-hidden", "true");
      expect(legende).toHaveClass("text-corps-s", "text-ink-2", "col-start-2", "row-start-1", "break-words");
      expect(legende).not.toHaveClass("truncate");
      const miniLigne = rows()[rang]!.querySelector("[data-mini-ligne]") as HTMLElement;
      expect(miniLigne).toHaveAttribute("aria-hidden", "true");
      expect(miniLigne.parentElement).toHaveClass("col-start-2", "row-start-2");
      // Légende avant la mini-ligne dans l'ordre du document (au-dessus).
      expect(legende.compareDocumentPosition(miniLigne) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(await axeViolations(container)).toEqual([]);
  });

  it("pastille et état sur la rangée de la mini-ligne, centrés entre eux (la légende ne les décale pas)", () => {
    renderView(ROME_FLORENCE);
    const rangee = rows()[2]!;
    expect(rangee).toHaveClass("items-center", "grid-rows-[auto_auto]");
    expect(rangee.querySelector("[data-day]")?.parentElement).toHaveClass("col-start-1", "row-start-2");
  });

  it("une seule ville : aucune légende, pastilles « Jour {n} », rangées en items-center", () => {
    renderView();
    expect(rows().map(badgeName)).toEqual(["Jour 1", "Jour 2", "Jour 3"]);
    expect(document.querySelector("[data-part='legende-ville']")).toBeNull();
    for (const row of rows()) expect(row).toHaveClass("col-span-3", "grid", "grid-cols-subgrid", "items-center");
  });

  it("le mot « Aperçu » n'apparaît dans aucun texte ajouté", () => {
    renderView(ROME_FLORENCE);
    expect(document.body.textContent).not.toMatch(/Aperçu/);
    expect(JSON.stringify(t.villes)).not.toMatch(/Aperçu/);
  });
});
