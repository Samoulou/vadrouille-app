import { act, render } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LARGE_SCREEN_QUERY } from "@/lib/large-screen";
import { edimbourg } from "@/mocks/edimbourg";

import { tripRoutes } from "./routes";
import { TripShell, layoutFitPadding, layoutVisibleInsets, useTripShell, type TripShellValue } from "./TripShell";

// Adresse courante simulée : paramètre `n` (jour) et `?etape=`, modifiés par le test comme le ferait le routeur.
const location: { n?: string; etape: string | null } = { etape: null };
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(location.etape ? { etape: location.etape } : {}),
}));

// La carte n'intervient pas dans la mémoire « ouverte depuis le panneau ».
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const routes = tripRoutes("/voyages", edimbourg.id);
const CONCERT = "j2-concert-orgue";

// Contexte lu après chaque rendu (dans un effet, pas pendant le rendu).
const captured: { current: TripShellValue | null } = { current: null };
function Probe() {
  const value = useTripShell();
  useEffect(() => {
    captured.current = value;
  });
  return null;
}
const shell = () => captured.current!;

function tree() {
  return (
    <TripShell trip={edimbourg} maps={[]} base="/voyages">
      <Probe />
    </TripShell>
  );
}

/** Change l'adresse simulée, puis rend de nouveau (navigation côté client). */
function navigate(rerender: (ui: ReactElement) => void, next: { n?: string; etape?: string | null }) {
  location.n = next.n;
  location.etape = next.etape ?? null;
  rerender(tree());
}

beforeEach(() => {
  location.n = undefined;
  location.etape = null;
  captured.current = null;
  vi.clearAllMocks();
});

describe("TripShell : fermeture de la fiche (« Fermer », Échap)", () => {
  it("ouverte depuis le panneau du jour : « Fermer » revient dans l'historique", () => {
    location.n = "2";
    const { rerender } = render(tree());
    act(() => shell().markOpenedFromPanel(routes.etape(2, CONCERT)));
    navigate(rerender, { n: "2", etape: CONCERT });
    expect(shell().fiche?.stop.id).toBe(CONCERT);
    act(() => shell().closeFiche());
    expect(router.back).toHaveBeenCalledTimes(1);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("fermée par le retour du navigateur, puis rouverte sans passer par le panneau : « Fermer » remplace l'adresse", () => {
    location.n = "2";
    const { rerender } = render(tree());
    // Ouverture depuis le panneau du jour 2.
    act(() => shell().markOpenedFromPanel(routes.etape(2, CONCERT)));
    navigate(rerender, { n: "2", etape: CONCERT });
    // Retour du navigateur : la fiche se ferme sans « Fermer ».
    navigate(rerender, { n: "2" });
    expect(shell().fiche).toBeNull();
    // Séjour, puis réouverture du même événement par une adresse qui ne vient pas du panneau.
    navigate(rerender, {});
    navigate(rerender, { n: "2", etape: CONCERT });
    expect(shell().fiche?.stop.id).toBe(CONCERT);
    act(() => shell().closeFiche());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(routes.jour(2), { scroll: false });
  });

  it("ouverture directe : « Fermer » remplace l'adresse", () => {
    location.n = "2";
    location.etape = CONCERT;
    render(tree());
    act(() => shell().closeFiche());
    expect(router.back).not.toHaveBeenCalled();
    expect(router.replace).toHaveBeenCalledWith(routes.jour(2), { scroll: false });
  });
});

describe("TripShell : grand écran (F12-PO-7 à F12-PO-10, décision 0022 § 6)", () => {
  const main = { width: 1280, height: 800 };

  it("marge du cadrage : panneau à 55 % de `main` en bas en mobile ; `--touch-target` seul en grand écran", () => {
    document.documentElement.style.setProperty("--touch-target", "44px");
    expect(layoutFitPadding({ width: 390, height: 844 }, false)).toEqual({ top: 44, right: 44, bottom: 0.55 * 844, left: 44 });
    expect(layoutFitPadding(main, true)).toEqual({ top: 44, right: 44, bottom: 44, left: 44 });
    document.documentElement.style.removeProperty("--touch-target");
  });

  it("partie couverte de la carte : `snap` de la hauteur de `main` en mobile ; aucune en grand écran", () => {
    expect(layoutVisibleInsets({ width: 390, height: 844 }, 0.92, false)).toEqual({ top: 0, right: 0, bottom: 0.92 * 844, left: 0 });
    expect(layoutVisibleInsets(main, 0.92, true)).toEqual({ top: 0, right: 0, bottom: 0, left: 0 });
  });

  it("fiche ouverte panneau à 25 % en grand écran : la hauteur mobile n'est pas touchée et reste 25 % sous le seuil", () => {
    let large = true;
    const listeners = new Set<() => void>();
    vi.stubGlobal("matchMedia", (query: string) => ({
      get matches() {
        return query === LARGE_SCREEN_QUERY && large;
      },
      media: query,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
    }));
    try {
      location.n = "2";
      const { rerender } = render(tree());
      act(() => shell().setSnap(0.25));
      navigate(rerender, { n: "2", etape: CONCERT });
      expect(shell().fiche?.stop.id).toBe(CONCERT);
      expect(shell().snap).toBe(0.25);
      act(() => {
        large = false;
        for (const listener of listeners) listener();
      });
      expect(shell().snap).toBe(0.25);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
