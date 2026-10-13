import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { ApplyResult, RevisionResult } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { edimbourgRevision } from "@/mocks/edimbourg-revision";

import { axeViolations } from "../../../tests/unit/axe";

import { ReplaceView } from "./ReplaceScreen";
import type { RevisionActions } from "./revision";
import { TripShell } from "./TripShell";

/**
 * Écran 14 « Remplacer une étape » avec des actions injectées (spécification F7, C12, C13, C16, C17 ; décision 0016
 * § 10) : raisons, souhait, attente et « Arrêter », bandeaux, hors ligne, « Appliquer ».
 */

const location: { n: string; stopId: string } = { n: "2", stopId: "j2-dean-village" };
const router = { push: vi.fn(), replace: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock("next/navigation", () => ({
  useRouter: () => router,
  useParams: () => ({ n: location.n, stopId: location.stopId }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/components/carte/DayMap", () => ({ DayMap: () => null }));

const PREVIEW = { kind: "replace" as const, id: "apercu-test", baseVersion: 0, ...edimbourgRevision.replacements[0]!.draft };

interface Pending {
  signal: AbortSignal;
  resolve: (result: RevisionResult) => void;
  reject: (error: unknown) => void;
}

/** Actions injectées : chaque demande d'aperçu attend que le test la résolve. */
function fakeRevision(applyResult: ApplyResult = { ok: true, version: 1 }) {
  const pending: Pending[] = [];
  const revision: RevisionActions & { pending: Pending[] } = {
    pending,
    version: () => 0,
    previewReplacement: vi.fn(
      (_request, { signal }) =>
        new Promise<RevisionResult>((resolve, reject) => {
          pending.push({ signal, resolve, reject });
        }),
    ),
    apply: vi.fn(async () => applyResult),
    // Déplacement (F7b) : hors de l'écran 14.
    getMoveOptions: vi.fn(async (stopId: string) => ({ stopId, days: [] })),
    previewMove: vi.fn(async (): Promise<RevisionResult> => ({ ok: false, error: "noOption" })),
  };
  return revision;
}

function renderScreen(revision: RevisionActions, stopId = "j2-dean-village", n = "2") {
  location.n = n;
  location.stopId = stopId;
  const recorder = createMemoryRecorder();
  const result = render(
    <TripShell trip={edimbourg} maps={[]} base="/voyages" revision={revision}>
      <ReplaceView stopId={stopId} recorder={recorder} recorderKind="none" now={() => 0} />
    </TripShell>,
  );
  return { ...result, recorder };
}

const group = () => screen.getByRole("radiogroup", { name: "Pourquoi la remplacer ?" });
const askButton = () => screen.getByRole("button", { name: "Voir une proposition" });
const wish = () => screen.getByRole("textbox", { name: "Ce que tu préfères (facultatif)" });
const choose = (label: string) => fireEvent.click(within(group()).getByRole("radio", { name: label }));

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", { configurable: true, get: () => value });
  act(() => {
    window.dispatchEvent(new Event(value ? "online" : "offline"));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  setOnline(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("remplacer: raisons", () => {
  it("titre avec le focus, cinq raisons dans l'ordre, aucune cochée ; sans raison : « Choisis une raison. » et focus sur le groupe", async () => {
    const revision = fakeRevision();
    const { container } = renderScreen(revision);
    const title = screen.getByRole("heading", { level: 1 });
    expect(title).toHaveTextContent("Remplacer [Dean Village]");
    expect(title).toHaveFocus();
    const radios = within(group()).getAllByRole("radio");
    expect(radios.map((radio) => radio.textContent)).toEqual(["Pas mon style", "Trop chargé", "Trop cher", "Trop loin", "Autre raison"]);
    for (const radio of radios) expect(radio).toHaveAttribute("aria-checked", "false");
    expect(screen.queryByRole("button", { name: "Retour" })).toBeNull();

    fireEvent.click(askButton());
    const alert = screen.getAllByRole("alert").find((node) => node.textContent === "Choisis une raison.");
    expect(alert).toBeDefined();
    expect(group()).toHaveFocus();
    expect(group()).toHaveAttribute("aria-describedby", alert!.id);
    expect(revision.previewReplacement).not.toHaveBeenCalled();

    choose("Trop loin");
    expect(alert).toHaveTextContent("");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("souhait : 200 caractères au plus, compteur « {n} sur 200 caractères », annoncé seulement à 180 et 200", () => {
    renderScreen(fakeRevision());
    expect(wish()).toHaveAttribute("maxlength", "200");
    expect(screen.getByText("0 sur 200 caractères")).toBeInTheDocument();
    const live = document.querySelector("[aria-live='polite']")!;
    fireEvent.change(wish(), { target: { value: "a".repeat(179) } });
    expect(live).toHaveTextContent("");
    fireEvent.change(wish(), { target: { value: "a".repeat(180) } });
    expect(live).toHaveTextContent("180 sur 200 caractères");
    fireEvent.change(wish(), { target: { value: "a".repeat(200) } });
    expect(screen.getAllByText("200 sur 200 caractères").length).toBeGreaterThan(0);
    expect(live).toHaveTextContent("200 sur 200 caractères");
  });
});

describe("remplacer: attente et arrêt", () => {
  it("squelette et `aria-busy` dès l'activation ; rien à 4 999 ms ; message et « Arrêter » à 5 000 ms ; arrêt sans affichage tardif", () => {
    vi.useFakeTimers();
    const revision = fakeRevision();
    const { container } = renderScreen(revision);
    choose("Pas mon style");
    fireEvent.change(wish(), { target: { value: "une dégustation" } });
    act(() => {
      fireEvent.click(askButton());
    });
    const zone = container.querySelector("[data-part='zone-proposition']")!;
    expect(zone).toHaveAttribute("aria-busy", "true");
    expect(container.querySelector("[data-part='squelette']")).toHaveAttribute("aria-hidden", "true");
    expect(revision.previewReplacement).toHaveBeenCalledWith(
      { stopId: "j2-dean-village", reason: "notMyStyle", wish: "une dégustation", baseVersion: 0 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );

    act(() => {
      vi.advanceTimersByTime(4_999);
    });
    expect(screen.queryByText("On cherche autour de [Dean Village].")).toBeNull();
    expect(screen.queryByRole("button", { name: "Arrêter" })).toBeNull();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByText("On cherche autour de [Dean Village].")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Arrêter" }));
    const request = revision.pending[0]!;
    expect(request.signal.aborted).toBe(true);
    expect(zone).toHaveAttribute("aria-busy", "false");
    expect(askButton()).toHaveFocus();
    // La réponse arrivée après l'arrêt n'affiche rien.
    act(() => {
      request.resolve({ ok: true, preview: PREVIEW });
    });
    expect(screen.queryByRole("heading", { name: PREVIEW.proposal.name })).toBeNull();
    expect(within(group()).getByRole("radio", { name: "Pas mon style" })).toHaveAttribute("aria-checked", "true");
    expect(wish()).toHaveValue("une dégustation");
  });

  it("proposition reçue : « Proposition prête. », focus sur son nom ; changer de raison la retire", async () => {
    const revision = fakeRevision();
    renderScreen(revision);
    choose("Pas mon style");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    const name = screen.getByRole("heading", { level: 2, name: PREVIEW.proposal.name });
    expect(name).toHaveFocus();
    expect(document.querySelector("[data-part='annonce-proposition']")).toHaveTextContent("Proposition prête.");
    expect(document.querySelector("[data-part='annonce-proposition']")).toHaveAttribute("role", "status");
    expect(screen.queryByRole("button", { name: "Voir une proposition" })).toBeNull();
    choose("Trop cher");
    expect(screen.queryByRole("heading", { name: PREVIEW.proposal.name })).toBeNull();
    expect(askButton()).toBeInTheDocument();
  });
});

describe("remplacer: bandeaux", () => {
  it("aucune option : bandeau `noOption` avec le focus, raisons toujours modifiables", async () => {
    const revision = fakeRevision();
    const { container } = renderScreen(revision);
    choose("Trop chargé");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: false, error: "noOption" });
    });
    const banner = container.querySelector("[data-part='bandeau-aucune-option']")!;
    expect(banner).toHaveTextContent("Aucune option compatible pour ce créneau. Ton programme est inchangé.");
    expect(banner).toHaveFocus();
    choose("Autre raison");
    expect(within(group()).getByRole("radio", { name: "Autre raison" })).toHaveAttribute("aria-checked", "true");
  });

  it.each(["rejet", "costCapReached", "rateLimited"] as const)("erreur (%s) : bandeau `error` et « Réessayer », qui relance la demande", async (cause) => {
    const revision = fakeRevision();
    renderScreen(revision);
    choose("Trop cher");
    fireEvent.click(askButton());
    await act(async () => {
      if (cause === "rejet") revision.pending[0]!.reject(new Error("réseau"));
      else revision.pending[0]!.resolve({ ok: false, error: cause });
    });
    expect(screen.getByText("La proposition n'a pas pu être calculée. Ton programme est inchangé.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(revision.previewReplacement).toHaveBeenCalledTimes(2);
  });

  it("conflit à « Appliquer » : bandeau `conflict`, « Revoir la proposition », aucune navigation ni mesure", async () => {
    const revision = fakeRevision({ ok: false, error: "conflict" });
    const { recorder } = renderScreen(revision);
    choose("Pas mon style");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(screen.getByText("Ton programme a changé depuis cette proposition. Rien n'a été modifié.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Revoir la proposition" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(recorder.events).toEqual([]);
    // Aucun texte visible de l'écran ne dit « aperçu » (décision 0018, « Portée » ; C7).
    expect(document.body.textContent).not.toMatch(/aperçu/i);
  });
});

describe("remplacer: hors ligne", () => {
  it("bandeau `offline`, « Voir une proposition » puis « Appliquer » en `aria-disabled`, réactivés au retour en ligne", async () => {
    const revision = fakeRevision();
    renderScreen(revision);
    choose("Pas mon style");
    setOnline(false);
    expect(screen.getByText("Tu es hors ligne. Modifier ton programme demande une connexion.")).toBeInTheDocument();
    expect(askButton()).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(askButton());
    expect(revision.previewReplacement).not.toHaveBeenCalled();
    setOnline(true);
    expect(askButton()).not.toHaveAttribute("aria-disabled");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    setOnline(false);
    const apply = screen.getByRole("button", { name: "Appliquer" });
    expect(apply).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(apply);
    expect(revision.apply).not.toHaveBeenCalled();
    setOnline(true);
    expect(apply).not.toHaveAttribute("aria-disabled");
  });

  it.each([
    ["error", "Réessayer"],
    ["conflict", "Revoir la proposition"],
  ] as const)("hors ligne, bandeau `%s` : « %s » en `aria-disabled`, décrit par le bandeau hors ligne, sans relancer", async (kind, label) => {
    const revision = fakeRevision({ ok: false, error: "conflict" });
    renderScreen(revision);
    choose("Pas mon style");
    fireEvent.click(askButton());
    await act(async () => {
      if (kind === "error") revision.pending[0]!.reject(new Error("réseau"));
      else revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    if (kind === "conflict") {
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
      });
    }
    setOnline(false);
    const action = screen.getByRole("button", { name: label });
    expect(action).toHaveAttribute("aria-disabled", "true");
    expect(action).toHaveAccessibleDescription("Tu es hors ligne. Modifier ton programme demande une connexion.");
    fireEvent.click(action);
    expect(revision.previewReplacement).toHaveBeenCalledTimes(1);
    setOnline(true);
    expect(action).not.toHaveAttribute("aria-disabled");
    fireEvent.click(action);
    expect(revision.previewReplacement).toHaveBeenCalledTimes(2);
  });
});

describe("remplacer: appliquer", () => {
  it("double clic sur « Appliquer » : une seule application, aucun bandeau d'erreur", async () => {
    const revision = fakeRevision();
    let finish: (result: ApplyResult) => void = () => {};
    vi.mocked(revision.apply).mockImplementation(() => new Promise<ApplyResult>((resolve) => (finish = resolve)));
    renderScreen(revision);
    choose("Trop loin");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    const apply = screen.getByRole("button", { name: "Appliquer" });
    fireEvent.click(apply);
    fireEvent.click(apply);
    await act(async () => {
      finish({ ok: true, version: 1 });
    });
    expect(revision.apply).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("La proposition n'a pas pu être calculée. Ton programme est inchangé.")).not.toBeInTheDocument();
  });

  it("« Appliquer » rejeté (réseau, fournisseur) : bandeau `error`, aucune navigation ni mesure ; « Réessayer » relance", async () => {
    const revision = fakeRevision();
    vi.mocked(revision.apply).mockRejectedValueOnce(new Error("réseau"));
    const { recorder } = renderScreen(revision);
    choose("Trop loin");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(screen.getByText("La proposition n'a pas pu être calculée. Ton programme est inchangé.")).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
    expect(recorder.events).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(revision.previewReplacement).toHaveBeenCalledTimes(2);
  });

  it("« Appliquer » : `replace_applied` (raison, réserve, durée), navigation vers la Journée du jour visé", async () => {
    const revision = fakeRevision();
    const { recorder } = renderScreen(revision);
    choose("Trop loin");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Appliquer" }));
    });
    expect(revision.apply).toHaveBeenCalledWith("apercu-test");
    expect(router.push).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/2", { scroll: false });
    await waitFor(() =>
      expect(recorder.events).toEqual([{ name: "replace_applied", properties: { reason: "too_far", from_reserve: true, duration_ms: 0 } }]),
    );
  });

  it("« Annuler » de l'aperçu et « Retour à la fiche » : fiche de l'étape, rien d'appliqué", async () => {
    const revision = fakeRevision();
    renderScreen(revision);
    choose("Pas mon style");
    fireEvent.click(askButton());
    await act(async () => {
      revision.pending[0]!.resolve({ ok: true, preview: PREVIEW });
    });
    fireEvent.click(screen.getByRole("button", { name: "Annuler" }));
    expect(router.replace).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/2?etape=j2-dean-village", { scroll: false });
    fireEvent.click(screen.getByRole("button", { name: "Retour à la fiche" }));
    expect(router.replace).toHaveBeenCalledTimes(2);
    expect(revision.apply).not.toHaveBeenCalled();
  });
});

describe("remplacer: étape verrouillée", () => {
  it("Tattoo : explication et « Retour à la fiche », sans raisons ni « Voir une proposition »", () => {
    renderScreen(fakeRevision(), "j1-tattoo", "1");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Remplacer [Royal Edinburgh Military Tattoo]");
    expect(screen.getByText("Cette étape est verrouillée. Retire le verrou depuis sa fiche pour la remplacer.")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Voir une proposition" })).toBeNull();
    const back = screen.getAllByRole("button", { name: "Retour à la fiche" });
    fireEvent.click(back[back.length - 1]!);
    expect(router.replace).toHaveBeenCalledWith("/voyages/mock_trip_edimbourg/jour/1?etape=j1-tattoo", { scroll: false });
  });
});
