import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Day, RevisionResult } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgRevision } from "@/mocks/edimbourg-revision";

import { axeViolations } from "../../../tests/unit/axe";

import { insertionIndex, MoveSheet } from "./MoveSheet";
import { TripShell } from "./TripShell";
import type { RevisionActions } from "./revision";

/**
 * Feuille « Déplacer » (spécification F7, F7b, C20 à C22 et C9 ; décisions 0018 § 11 et 0019 § 1) avec le programme en
 * mémoire et des actions injectées : jours complets, points, aperçu, « Appliquer », bandeaux, hors ligne, attente.
 */

const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ n: "2" }),
  useSearchParams: () => new URLSearchParams("etape=j2-jardin-botanique"),
}));

vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const JARDIN = "j2-jardin-botanique";
const day = (n: number): Day => edimbourg.days.find((candidate) => candidate.index === n)!;
const jardin = (() => {
  const item = day(2).items.find((candidate) => candidate.type === "stop" && candidate.stop.id === JARDIN);
  if (item?.type !== "stop") throw new Error("jardin absent");
  return item.stop;
})();

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

function renderSheet(revision?: RevisionActions) {
  const recorder = createMemoryRecorder();
  const onReturnFocus = vi.fn();
  const onOpenChange = vi.fn();
  const result = render(
    <TripShell trip={edimbourg} maps={[]} base="/voyages" revision={revision} revisionFixtures={edimbourgRevision}>
      <MoveSheet open onOpenChange={onOpenChange} stop={jardin} dayIndex={2} onReturnFocus={onReturnFocus} recorder={recorder} />
    </TripShell>,
  );
  return { ...result, recorder, onReturnFocus, onOpenChange };
}

const dialog = () => screen.getByRole("dialog");
const days = () => within(dialog()).getByRole("radiogroup", { name: "Vers quel jour ?" });
const dayRadio = (name: string) => within(days()).getByRole("radio", { name });

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("déplacer: point d'insertion dans la ligne", () => {
  it("insertionIndex : après le temps libre qui contient l'heure, avant le trajet suivant", () => {
    const j4 = day(4);
    const free = j4.items.findIndex((item) => item.type === "free");
    expect(insertionIndex(j4, "15:45")).toBe(free);
    expect(insertionIndex(day(1), "16:15")).toBe(day(1).items.findIndex((item) => item.type === "free"));
    expect(insertionIndex(day(1), "08:00")).toBe(0);
  });
});

describe("déplacer: feuille", () => {
  it("modale titrée « Déplacer [Jardin botanique royal] » avec le focus ; J2, J3 et J6 complets, aucun jour coché", async () => {
    const { baseElement } = renderSheet();
    expect(dialog()).toHaveAttribute("aria-modal", "true");
    const title = within(dialog()).getByRole("heading", { level: 2 });
    expect(title).toHaveTextContent("Déplacer [Jardin botanique royal]");
    expect(title).toHaveFocus();
    await waitFor(() => expect(dayRadio("Jour 3, complet")).toHaveAttribute("aria-disabled", "true"));
    expect(dayRadio("Jour 2, complet")).toHaveAttribute("aria-disabled", "true");
    expect(dayRadio("Jour 6, complet")).toHaveAttribute("aria-disabled", "true");
    for (const radio of within(days()).getAllByRole("radio")) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(within(dialog()).queryByRole("button", { name: /Placer ici/ })).toBeNull();
    expect(await axeViolations(baseElement)).toEqual([]);
  });

  it("J4 : ligne compacte sans lien, « Placer ici, vers 15:45 » ; aperçu « J2 13:25 → J4 15:45 » avec le focus ; « Appliquer »", async () => {
    const { recorder, onReturnFocus, baseElement } = renderSheet();
    await waitFor(() => expect(dayRadio("Jour 4")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(dayRadio("Jour 4"));
    expect(dayRadio("Jour 4")).toHaveAttribute("aria-checked", "true");
    const line = dialog().querySelector("[data-part='ligne-compacte']")!;
    expect(within(line as HTMLElement).queryAllByRole("link")).toHaveLength(0);
    const place = within(dialog()).getByRole("button", { name: "Placer ici, vers 15:45" });
    expect(place).not.toHaveAttribute("aria-pressed");
    expect(place).not.toHaveAttribute("aria-current");

    fireEvent.click(place);
    const changesTitle = await within(dialog()).findByRole("heading", { level: 3, name: "Ce qui change" });
    await waitFor(() => expect(changesTitle).toHaveFocus());
    expect(place).toHaveAttribute("aria-current", "true");
    const moved = dialog().querySelector("[data-change='moved']")!;
    expect(moved).toHaveTextContent("[Jardin botanique royal] : avant : J2 13:25 → après : J4 15:45");
    expect(moved.querySelector("del")).toHaveTextContent("J2 13:25");
    const unchanged = dialog().querySelector("[data-part='ne-bouge-pas']")!;
    expect(unchanged).toHaveTextContent("19:00 [Bonne table de New Town]");
    expect(unchanged).toHaveTextContent("19:00 [Petite adresse de l'Old Town]");
    expect(await axeViolations(baseElement)).toEqual([]);

    fireEvent.click(within(dialog()).getByRole("button", { name: "Appliquer" }));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/4", { scroll: false }));
    await waitFor(() => expect(recorder.events).toEqual([{ name: "stop_moved", properties: { method: "button" } }]));
    expect(onReturnFocus).not.toHaveBeenCalled();
  });

  it("point sans brouillon (J1) : bandeau « aucune option compatible » avec le focus, rien d'appliqué", async () => {
    const { recorder } = renderSheet();
    await waitFor(() => expect(dayRadio("Jour 1")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(dayRadio("Jour 1"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Placer ici, vers 16:15" }));
    const banner = await waitFor(() => {
      const node = dialog().querySelector<HTMLElement>("[data-part='bandeau-aucune-option']");
      expect(node).not.toBeNull();
      return node!;
    });
    await waitFor(() => expect(banner).toHaveFocus());
    expect(banner).toHaveTextContent("Aucune option compatible pour ce créneau. Ton programme est inchangé.");
    expect(router.push).not.toHaveBeenCalled();
    expect(recorder.events).toEqual([]);
  });

  it("changer de jour retire l'aperçu ; « Annuler » de l'aperçu ferme la feuille sans rien appliquer", async () => {
    const { onOpenChange } = renderSheet();
    await waitFor(() => expect(dayRadio("Jour 4")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(dayRadio("Jour 4"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Placer ici, vers 15:45" }));
    await within(dialog()).findByRole("heading", { name: "Ce qui change" });
    fireEvent.click(dayRadio("Jour 5"));
    expect(within(dialog()).queryByRole("heading", { name: "Ce qui change" })).toBeNull();
    fireEvent.click(dayRadio("Jour 4"));
    fireEvent.click(within(dialog()).getByRole("button", { name: "Placer ici, vers 15:45" }));
    await within(dialog()).findByRole("heading", { name: "Ce qui change" });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Annuler" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it("hors ligne : bandeau, « Placer ici » et « Appliquer » en `aria-disabled` sans effet, réactivés au retour du réseau", async () => {
    renderSheet();
    await waitFor(() => expect(dayRadio("Jour 4")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(dayRadio("Jour 4"));
    setOnline(false);
    expect(within(dialog()).getByText("Tu es hors ligne. Modifier ton programme demande une connexion.")).toBeInTheDocument();
    const place = within(dialog()).getByRole("button", { name: "Placer ici, vers 15:45" });
    expect(place).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(place);
    expect(within(dialog()).queryByRole("heading", { name: "Ce qui change" })).toBeNull();
    setOnline(true);
    expect(place).not.toHaveAttribute("aria-disabled");
    fireEvent.click(place);
    await within(dialog()).findByRole("heading", { name: "Ce qui change" });
    setOnline(false);
    const apply = within(dialog()).getByRole("button", { name: "Appliquer" });
    expect(apply).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(apply);
    expect(router.push).not.toHaveBeenCalled();
    setOnline(true);
    expect(apply).not.toHaveAttribute("aria-disabled");
  });

  it("attente : squelette et `aria-busy`, « Arrêter » à 5 000 ms seulement, sans « On cherche autour de » ; « Arrêter » abandonne", async () => {
    let pendingSignal: AbortSignal | undefined;
    let resolve: ((result: RevisionResult) => void) | undefined;
    const base = {
      version: () => 0,
      previewReplacement: vi.fn(),
      apply: vi.fn(),
      getMoveOptions: vi.fn(async () => edimbourgRevision.moves[0]!.options),
      previewMove: vi.fn(
        (_request, { signal }: { signal: AbortSignal }) =>
          new Promise<RevisionResult>((done) => {
            pendingSignal = signal;
            resolve = done;
          }),
      ),
    } as unknown as RevisionActions;
    renderSheet(base);
    await waitFor(() => expect(dayRadio("Jour 4")).not.toHaveAttribute("aria-disabled"));
    fireEvent.click(dayRadio("Jour 4"));
    vi.useFakeTimers();
    fireEvent.click(within(dialog()).getByRole("button", { name: "Placer ici, vers 15:45" }));
    const zone = dialog().querySelector("[data-part='zone-apercu']")!;
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(dialog().querySelector("[data-part='squelette']")).not.toBeNull();
    act(() => vi.advanceTimersByTime(4_999));
    expect(within(dialog()).queryByRole("button", { name: "Arrêter" })).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    const stop = within(dialog()).getByRole("button", { name: "Arrêter" });
    expect(dialog()).not.toHaveTextContent("On cherche autour de");
    fireEvent.click(stop);
    expect(pendingSignal?.aborted).toBe(true);
    vi.useRealTimers();
    await act(async () => {
      resolve?.({ ok: true, preview: { kind: "move", id: "tardif", baseVersion: 0, ...edimbourgRevision.moves[0]!.drafts[0]!.draft } });
    });
    expect(within(dialog()).queryByRole("heading", { name: "Ce qui change" })).toBeNull();
    expect(zone).toHaveAttribute("aria-busy", "false");
  });
});
