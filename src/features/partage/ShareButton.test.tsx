import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { CarteProvider } from "@/components/carte/config";
import { TripShell } from "@/features/sejour/TripShell";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { stubLayout } from "../../../tests/unit/carte-fixtures";

const actions = vi.hoisted(() => ({
  getShareStatus: vi.fn(async () => ({ ok: true, value: { active: false } })),
  createShareLink: vi.fn(),
  revokeShareLink: vi.fn(),
}));
vi.mock("@/server/actions/partage", () => actions);

const location: { n?: string } = {};
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/voyages/mock_trip_edimbourg_debloque",
}));

/** Bouton « Partager » sur la carte du Séjour et de la Journée (spécification F10, F10c, C27). */

function renderShell(shareable?: boolean) {
  return render(
    <CarteProvider value={{ config: {} }}>
      <TripShell trip={edimbourgDebloque} maps={[]} base="/voyages" shareable={shareable}>
        <p>{"contenu"}</p>
      </TripShell>
    </CarteProvider>,
  );
}

beforeEach(() => {
  stubLayout(390, 844);
  location.n = undefined;
  actions.getShareStatus.mockClear();
});

describe("TripShell : bouton « Partager »", () => {
  it.each([
    ["Séjour", undefined],
    ["Journée", "2"],
  ])("%s : absent par défaut, sans texte de remplacement", (_label, n) => {
    location.n = n;
    renderShell();
    expect(screen.queryByRole("button", { name: "Partager" })).toBeNull();
  });

  it.each([
    ["Séjour", undefined],
    ["Journée", "2"],
  ])("%s : présent sur la carte avec shareable ; ouvre la feuille sans changer d'adresse, focus rendu à la fermeture", async (_label, n) => {
    location.n = n;
    const before = window.location.href;
    renderShell(true);
    const button = screen.getByRole("button", { name: "Partager" });
    expect(button.closest("[data-part='zone-carte']")).not.toBeNull();
    expect(button).toHaveAttribute("aria-haspopup", "dialog");
    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Partager ton voyage" });
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(window.location.href).toBe(before);
    await waitFor(() => expect(actions.getShareStatus).toHaveBeenCalledWith({ tripId: edimbourgDebloque.id }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(button).toHaveFocus();
  });
});
