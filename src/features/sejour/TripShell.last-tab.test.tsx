import { render } from "@testing-library/react";
import { useEffect, type ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { TripSessionProvider, useOptionalTripSession, type TabMemory } from "@/features/voyage/TripSessionProvider";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { TripShell } from "./TripShell";

/** `TripShell` enregistre le dernier onglet consulté (F11a, décision 0021 § 4), sans changer son rendu. */

const location: { n?: string; etape: string | null } = { etape: null };
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(location.etape ? { etape: location.etape } : {}),
}));

vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

// Mémoire lue après chaque rendu (dans un effet, pas pendant le rendu).
const captured: { memory: TabMemory | null } = { memory: null };
function Probe() {
  const value = useOptionalTripSession();
  useEffect(() => {
    captured.memory = value;
  });
  return null;
}

function tree(trip = edimbourg) {
  return (
    <TripSessionProvider>
      <Probe />
      <TripShell trip={trip} maps={[]} base="/voyages">
        <p>contenu</p>
      </TripShell>
    </TripSessionProvider>
  );
}

function navigate(rerender: (ui: ReactElement) => void, next: { n?: string; etape?: string | null }, trip = edimbourg) {
  location.n = next.n;
  location.etape = next.etape ?? null;
  rerender(tree(trip));
}

beforeEach(() => {
  location.n = undefined;
  location.etape = null;
  captured.memory = null;
});

describe("TripShell : dernier onglet consulté", () => {
  it("Séjour, puis Journée 3, puis fiche de la Journée 3 (compte comme la Journée)", () => {
    const { rerender } = render(tree());
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "sejour" });
    navigate(rerender, { n: "3" });
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "jour", n: 3 });
    navigate(rerender, { n: "3", etape: "j3-excursion-highlands" });
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "jour", n: 3 });
    navigate(rerender, {});
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "sejour" });
  });

  it("jour hors du voyage (404) : rien n'est enregistré", () => {
    location.n = "3";
    const { rerender } = render(tree());
    navigate(rerender, { n: "99" });
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "jour", n: 3 });
  });

  it("deux voyages : aucun mélange", () => {
    location.n = "2";
    const { rerender } = render(tree(edimbourg));
    navigate(rerender, { n: "5" }, edimbourgDebloque);
    expect(captured.memory?.lastTab(edimbourg.id)).toEqual({ kind: "jour", n: 2 });
    expect(captured.memory?.lastTab(edimbourgDebloque.id)).toEqual({ kind: "jour", n: 5 });
  });

  it("sans fournisseur (pages de développement) : le rendu ne change pas et rien n'est enregistré", () => {
    const { container } = render(
      <TripShell trip={edimbourg} maps={[]} base="/dev/voyages">
        <p>contenu</p>
      </TripShell>,
    );
    expect(container.textContent).toContain("contenu");
  });
});
