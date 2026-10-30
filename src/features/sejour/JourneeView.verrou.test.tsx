import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PatchResult, Result, Trip } from "@/contracts";
import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { JourneeView } from "./JourneeView";
import { TripShell } from "./TripShell";

/**
 * Verrou de la fiche sur `api` au niveau de l'écran (M5a, spécification M5 § 3 ; revue de la PR 923, bloquant 3) : `TripShell`
 * avec la révision enregistrée (`revisionVersion` non nul) et `JourneeView`, les actions serveur remplacées par des doubles.
 * Prouve le garde-fou du déblocage (`lockable`), le message annoncé selon le refus (`VerrouNonEnregistre`) et son vidage.
 */

const location: { n?: string; etape: string | null } = { etape: null };
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => (location.n === undefined ? {} : { n: location.n }),
  useSearchParams: () => new URLSearchParams(location.etape ? { etape: location.etape } : {}),
}));
vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const serveur = vi.hoisted(() => ({
  lockStop: vi.fn(),
  unlockStop: vi.fn(),
}));
vi.mock("@/server/actions/retouches", () => serveur);
vi.mock("@/server/actions/remplacement", () => ({ previewReplacement: vi.fn(), applyReplacement: vi.fn(), undoReplacement: vi.fn() }));
vi.mock("@/server/actions/sejour", () => ({ toggleChecklistItem: vi.fn() }));

const DEAN = "j2-dean-village";
const JARDIN = "j2-jardin-botanique";

function tree(trip: Trip) {
  return (
    <TripShell trip={trip} maps={[]} base="/voyages" revisionVersion={1}>
      <JourneeView />
    </TripShell>
  );
}

const verrouiller = () => screen.queryByRole("button", { name: "Verrouiller" });
const region = (container: HTMLElement) => container.querySelector<HTMLElement>("[data-part='verrou-echec']");
const refus = (code: string, currentVersion?: number): Result<PatchResult> => ({
  ok: false,
  error: { code, retryable: code === "version_conflict", ...(currentVersion === undefined ? {} : { currentVersion }) } as never,
});

beforeEach(() => {
  location.n = "2";
  location.etape = DEAN;
  vi.clearAllMocks();
});

describe("JourneeView : verrou sur api (M5a)", () => {
  it("verrou: voyage api non débloqué : la fiche n'offre pas « Verrouiller » ; débloqué, elle l'offre", () => {
    const { unmount } = render(tree(edimbourg));
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(verrouiller()).toBeNull();
    unmount();
    render(tree(edimbourgDebloque));
    expect(verrouiller()).toBeInTheDocument();
    expect(serveur.lockStop).not.toHaveBeenCalled();
  });

  it("verrou: refus conflict puis error : « Ton programme a changé… » puis « Impossible d'enregistrer. Réessaie. » annoncés, rien n'est verrouillé", async () => {
    serveur.lockStop.mockResolvedValueOnce(refus("version_conflict", 3)).mockResolvedValueOnce(refus("internal"));
    const { container } = render(tree(edimbourgDebloque));
    expect(region(container)).toHaveAttribute("role", "alert");
    expect(region(container)).toBeEmptyDOMElement();

    await act(async () => verrouiller()?.click());
    expect(serveur.lockStop).toHaveBeenCalledWith(expect.objectContaining({ tripId: edimbourgDebloque.id, stopId: DEAN, baseVersion: 1 }));
    expect(screen.getByRole("alert")).toHaveTextContent("Ton programme a changé entre-temps. Regarde la dernière version, puis réessaie.");
    expect(verrouiller()).toHaveAttribute("aria-pressed", "false");

    await act(async () => verrouiller()?.click());
    // Le conflit a recalé la version de base sur la version relue.
    expect(serveur.lockStop).toHaveBeenLastCalledWith(expect.objectContaining({ stopId: DEAN, baseVersion: 3 }));
    expect(screen.getByRole("alert")).toHaveTextContent("Impossible d'enregistrer. Réessaie.");
    expect(verrouiller()).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector("[data-undo-toast]")).toBeNull();
  });

  it("verrou: message vidé au geste suivant (pendant l'appel) et au changement de fiche", async () => {
    let repondre: (r: Result<PatchResult>) => void = () => {};
    serveur.lockStop.mockResolvedValueOnce(refus("internal")).mockImplementationOnce(() => new Promise<Result<PatchResult>>((resolve) => (repondre = resolve)));
    const { container, rerender } = render(tree(edimbourgDebloque));
    await act(async () => verrouiller()?.click());
    expect(region(container)).toHaveTextContent("Impossible d'enregistrer. Réessaie.");

    // Geste suivant : la région est vidée dès l'appui, avant la réponse.
    await act(async () => verrouiller()?.click());
    expect(region(container)).toBeEmptyDOMElement();
    await act(async () => repondre(refus("internal")));
    expect(region(container)).toHaveTextContent("Impossible d'enregistrer. Réessaie.");

    // Autre fiche : région vide.
    location.etape = JARDIN;
    rerender(tree(edimbourgDebloque));
    expect(container.querySelector("[data-part='fiche']")).toHaveAttribute("data-stop-id", JARDIN);
    expect(region(container)).toBeEmptyDOMElement();
  });
});
