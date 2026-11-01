import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { projectSharedTrip } from "@/adapters/share-projection";
import { CarteProvider, type CarteInjection } from "@/components/carte/config";
import { DayTabs } from "@/components/ligne/DayTabs";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { stubLayout } from "../../../tests/unit/carte-fixtures";

import { SharedDayScreen } from "./SharedDayScreen";
import { SharedShell } from "./SharedShell";
import { SharedTripScreen } from "./SharedTripScreen";

/**
 * Aucun préchargement depuis la vue partagée (ticket 1013, M6a ; décision 0157 § 2.1 point 5) : chaque lien de `RP` et
 * de `RPJ` (rangée des jours, retour au Séjour, « Jour par jour ») passe `prefetch={false}` à `next/link`, sans changer
 * le comportement par défaut de `DayTabs` dans le Séjour. `next/link` est doublé pour lire la propriété reçue.
 */
vi.mock("next/link", () => ({
  default: ({ href, prefetch, children, ...rest }: { href: string; prefetch?: boolean | null; children: ReactNode } & AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} data-prefetch={prefetch === undefined ? "defaut" : String(prefetch)} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@googlemaps/js-api-loader", () => ({ setOptions: vi.fn(), importLibrary: vi.fn(() => new Promise(() => {})) }));

const TOKEN = "A".repeat(43);
const trip = projectSharedTrip(edimbourgDebloque);
const SANS_CARTE: CarteInjection = { config: {} };
const maps = trip.days.map((d) => ({ index: d.index, points: [] }));

const liens = () => screen.getAllByRole("link").filter((a) => a.getAttribute("href")?.startsWith("/p/"));

beforeEach(() => {
  stubLayout(390, 844);
});

describe("vue partagée : liens sans préchargement (0157 § 2.1 point 5)", () => {
  it("RP : rangée des jours, onglet Séjour et « Jour par jour » en prefetch={false}", () => {
    render(
      <CarteProvider value={SANS_CARTE}>
        <SharedShell token={TOKEN} days={trip.days} current="sejour" maps={maps} placesFromGoogle={false}>
          <SharedTripScreen token={TOKEN} trip={trip} placesFromGoogle={false} />
        </SharedShell>
      </CarteProvider>,
    );
    const tous = liens();
    expect(tous.length).toBeGreaterThan(trip.days.length * 2);
    for (const a of tous) expect(a.getAttribute("data-prefetch"), a.getAttribute("href") ?? "").toBe("false");
  });

  it("RPJ : rangée des jours et bouton retour en prefetch={false}", () => {
    const day = trip.days[1]!;
    render(
      <CarteProvider value={SANS_CARTE}>
        <SharedShell token={TOKEN} days={trip.days} current={day.index} maps={maps} placesFromGoogle={false}>
          <SharedDayScreen day={day} placesFromGoogle={false} />
        </SharedShell>
      </CarteProvider>,
    );
    const tous = liens();
    expect(tous.length).toBeGreaterThan(trip.days.length);
    for (const a of tous) expect(a.getAttribute("data-prefetch"), a.getAttribute("href") ?? "").toBe("false");
  });

  it("DayTabs sans la propriété (Séjour) : comportement par défaut inchangé", () => {
    render(<DayTabs days={[{ index: 1, href: "/voyages/x/jour/1" }]} current="sejour" sejourHref="/voyages/x" />);
    for (const a of screen.getAllByRole("link")) expect(a.getAttribute("data-prefetch")).toBe("defaut");
  });
});
