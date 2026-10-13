import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";

import { projectTodayTrip } from "./today";
import { TodayScreen } from "./TodayScreen";

/**
 * Écran 15 et page de repli (spécification F10, F10b ; F10-PO-8) : l'écran enregistre le service worker par le
 * module hors ligne désigné, une fois, à toute date (rien ne dépend du jour : le service worker ne contient aucune
 * donnée du voyage).
 */

const register = vi.hoisted(() => vi.fn());
vi.mock("@/lib/offline/register", () => ({ registerOfflineFallback: register }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }) }));

const TRIP = projectTodayTrip(edimbourg);

afterEach(() => {
  register.mockClear();
});

describe("TodayScreen : service worker de la page de repli (F10b)", () => {
  it.each([
    ["pendant le voyage", "2026-08-30T10:40:00+01:00"],
    ["avant le voyage", "2026-08-01T12:00:00+01:00"],
    ["après le voyage", "2026-09-04T12:00:00+01:00"],
  ])("%s : un seul enregistrement à l'ouverture", (_name, iso) => {
    const { rerender } = render(
      <TodayScreen trip={TRIP} placesFromGoogle={false} now={() => Date.parse(iso)} deviceTimeZone="Europe/London" />,
    );
    rerender(<TodayScreen trip={TRIP} placesFromGoogle={false} now={() => Date.parse(iso)} deviceTimeZone="Europe/London" />);
    expect(register).toHaveBeenCalledOnce();
  });
});
