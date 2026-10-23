import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMemoryRecorder, type MemoryRecorder } from "@/analytics/track";
import { fail, ok, type GenerationStatus } from "@/contracts";
import * as messages from "@/i18n/messages";
import { MOCK_GENERATION_STEP_MS, mockGenerationStatus, type MockGenerationOutcome } from "@/mocks/creation-edimbourg";
import { relancerVoyageEssai } from "@/server/actions/creation";
import { saisirCodeAccesP0 } from "@/server/actions/p0-acces";

import { axeViolations } from "../../../tests/unit/axe";

import { GENERATION_POLL_MS, missingMessage, newlyReadyDays, readyCounter, type FetchStatus } from "./generation";
import { markLaunch, resetLaunchTiming, setLaunchClock } from "./launch-timing";
import { PreparationView } from "./PreparationView";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ getGenerationStatus: vi.fn(), relancerVoyageEssai: vi.fn() }));
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

/** Écran 5 « Propositions prêtes » (F8-PO-12, F8-PO-19, F8-PO-20 ; 0017 § 9 ; 0018 § 19). */

const t = messages.creation.ecran5;
const TRIP = "mock_trip_edimbourg";
const at = (step: number, outcome?: MockGenerationOutcome): GenerationStatus => mockGenerationStatus(TRIP, step * MOCK_GENERATION_STEP_MS, outcome);

let recorder: MemoryRecorder;
let server: GenerationStatus;
let fetchStatus: ReturnType<typeof vi.fn<FetchStatus>>;

function renderView(initial: GenerationStatus = at(0)) {
  return render(<PreparationView tripId={TRIP} initial={initial} recorder={recorder} fetchStatus={fetchStatus} />);
}

/** Une interrogation : le serveur passe à `next`, puis une seconde s'écoule. */
async function poll(next: GenerationStatus = server) {
  server = next;
  await act(async () => {
    await vi.advanceTimersByTimeAsync(GENERATION_POLL_MS);
  });
}

/** axe attend des minuteurs réels. */
async function axeWithRealTimers(container: Element) {
  vi.useRealTimers();
  return axeViolations(container);
}

const counter = () => document.querySelector("[data-compteur]")!;
const rows = () => within(screen.getByRole("list", { name: t.jours })).getAllByRole("listitem");
const announcements = () => [...document.querySelectorAll("[data-annonces] p")].map((p) => p.textContent);
const previewEvents = () => recorder.events.filter((event) => event.name === "preview_ready");

beforeEach(() => {
  vi.useFakeTimers();
  recorder = createMemoryRecorder();
  server = at(0);
  fetchStatus = vi.fn<FetchStatus>(async () => ok(server));
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(relancerVoyageEssai).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  resetLaunchTiming();
});

describe("formatage", () => {
  it("compteur au singulier pour 0 et 1 (0018 § 19)", () => {
    expect(readyCounter(0, 8)).toBe("0 proposition prête sur 8");
    expect(readyCounter(1, 8)).toBe("1 proposition prête sur 8");
    expect(readyCounter(2, 8)).toBe("2 propositions prêtes sur 8");
  });

  it("aperçu incomplet au singulier pour 1", () => {
    expect(missingMessage(1)).toBe("1 proposition n'a pas trouvé de lieu compatible.");
    expect(missingMessage(2)).toBe("2 propositions n'ont pas trouvé de lieu compatible.");
  });

  it("jours devenus prêts entre deux états", () => {
    expect(newlyReadyDays(at(3), at(4))).toEqual([1]);
    expect(newlyReadyDays(at(4), at(5))).toEqual([]);
    expect(newlyReadyDays(at(0), at(8))).toEqual([1, 2]);
  });
});

describe("PreparationView : progression", () => {
  it("titre, compteur hors région live, une rangée par jour avec sa mini-ligne décorative", async () => {
    const { container } = renderView();
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
    expect(counter()).toHaveTextContent("0 proposition prête sur 8");
    expect(counter().closest("[role='status'], [role='alert'], [aria-live]")).toBeNull();
    expect(rows()).toHaveLength(2);
    for (const row of rows()) {
      expect(row).toHaveTextContent(t.enPreparation);
      expect(row.querySelector("[data-mini-ligne]")).toHaveAttribute("aria-hidden", "true");
    }
    expect(container.querySelector("[data-kind='generating']")).toBeNull();
    expect(screen.queryByRole("link", { name: t.voirPropositions })).toBeNull();
    expect(await axeWithRealTimers(container)).toEqual([]);
  });

  it("interrogation toutes les secondes ; anneaux selon readyStops ; annonces une fois chacune ; arrêt à l'état final", async () => {
    const { container } = renderView();
    expect(fetchStatus).not.toHaveBeenCalled();
    for (let step = 1; step <= 8; step++) {
      await poll(at(step));
      expect(counter()).toHaveTextContent(readyCounter(step, 8));
      const [j1, j2] = rows();
      expect(j1!.querySelectorAll("[data-anneau]")).toHaveLength(Math.min(4, step));
      expect(j2!.querySelectorAll("[data-anneau]")).toHaveLength(Math.max(0, step - 4));
      expect(container.querySelector("[data-kind='generating']")).toBeNull();
    }
    expect(fetchStatus).toHaveBeenCalledTimes(8);
    expect(announcements()).toEqual(["Jour 1 prêt", "Jour 2 prêt", t.titrePret]);
    expect(screen.getByRole("heading", { level: 1, name: t.titrePret })).toBeInTheDocument();
    expect(rows()[1]).toHaveTextContent("Jour 2 prêt");
    await poll();
    await poll();
    expect(fetchStatus).toHaveBeenCalledTimes(8);
    expect(announcements()).toHaveLength(3);
  });

  it("prêt : deux sorties, sans redirection ni déplacement du focus ; rail plein dessiné, fondu sous mouvement réduit", async () => {
    renderView(at(7));
    const before = document.activeElement;
    await poll(at(8));
    expect(screen.getByRole("link", { name: t.voirPropositions })).toHaveAttribute("href", `/voyages/${TRIP}/presentation`);
    expect(screen.getByRole("link", { name: t.passer })).toHaveAttribute("href", `/voyages/${TRIP}`);
    expect(document.activeElement).toBe(before);
    expect(router.push).not.toHaveBeenCalled();
    expect(router.replace).not.toHaveBeenCalled();
    const rail = rows()[1]!.querySelector("[data-rail-plein]")!;
    expect(rail).toHaveClass("transition-transform", "duration-200", "scale-x-100", "motion-reduce:transition-opacity");
  });

  it("« Retour » vers Mes voyages", () => {
    renderView(at(8));
    fireEvent.click(screen.getByRole("button", { name: messages.creation.retour }));
    expect(router.push).toHaveBeenCalledWith("/voyages");
  });
});

describe("PreparationView : preview_ready", () => {
  it("une fois, avec la durée depuis createTrip ; aucun doublon au retour sur l'écran", async () => {
    let now = 0;
    setLaunchClock(() => now);
    markLaunch(TRIP, 0);
    const { unmount } = renderView(at(7));
    now = 9000;
    await poll(at(8));
    await vi.waitFor(() => expect(previewEvents()).toEqual([{ name: "preview_ready", properties: { duration_ms: 9000 } }]));
    unmount();
    renderView(at(8));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(previewEvents()).toHaveLength(1);
  });

  it("état déjà final au chargement (rechargement) : sans durée, et aucune annonce", async () => {
    renderView(at(8, "incomplete"));
    await vi.waitFor(() => expect(previewEvents()).toEqual([{ name: "preview_ready", properties: {} }]));
    expect(announcements()).toEqual([]);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it("aucun preview_ready en préparation ou en erreur", async () => {
    renderView();
    await poll(at(3, "failed"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(previewEvents()).toEqual([]);
  });
});

describe("PreparationView : bandeaux", () => {
  it("aperçu incomplet : noOption dans la région status, les deux sorties", async () => {
    const { container } = renderView(at(7, "incomplete"));
    await poll(at(8, "incomplete"));
    const banner = container.querySelector("[data-kind='noOption']")!;
    expect(banner).toHaveTextContent("2 propositions n'ont pas trouvé de lieu compatible.");
    expect(banner.closest("[role='status']")).not.toBeNull();
    expect(screen.getByRole("link", { name: t.voirPropositions })).toBeInTheDocument();
    expect(await axeWithRealTimers(container)).toEqual([]);
  });

  it("erreur réparable : « Réessayer » relance le suivi tout de suite", async () => {
    const { container } = renderView(at(2, "failed"));
    await poll(at(3, "failed"));
    const alert = container.querySelector("main [role='alert']")!;
    expect(alert).toHaveTextContent(t.interrompue);
    // Titre et jours non prêts disent l'interruption, comme le bandeau.
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titreInterrompu);
    expect(rows()[0]).toHaveTextContent(t.jourInterrompu);
    expect(rows()[0]).not.toHaveTextContent(t.enPreparation);
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await poll(at(5, "failed"));
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(within(alert as HTMLElement).getByRole("button", { name: t.reessayer }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(fetchStatus).toHaveBeenCalledTimes(2);
    expect(alert).toBeEmptyDOMElement();
    // Le bouton a disparu avec le bandeau : le focus est sur le titre (WCAG 2.4.3).
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titre);
    await poll(at(6, "failed"));
    expect(counter()).toHaveTextContent(readyCounter(4, 8));
  });

  it("erreur définitive : « Voir mes voyages », sans « Réessayer » ni sorties", async () => {
    const { container } = renderView(at(2, "failedFinal"));
    await poll(at(3, "failedFinal"));
    const alert = container.querySelector("main [role='alert']") as HTMLElement;
    expect(alert).toHaveTextContent(t.interrompue);
    expect(within(alert).queryByRole("button", { name: t.reessayer })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titreInterrompu);
    expect(within(alert).getByRole("link", { name: t.voirMesVoyages })).toHaveAttribute("href", "/voyages");
    expect(screen.queryByRole("link", { name: t.voirPropositions })).toBeNull();
    expect(await axeWithRealTimers(container)).toEqual([]);
  });

  it("interrogation en échec (réseau, serveur) : arrêt, « Réessayer » la relance", async () => {
    renderView();
    fetchStatus.mockRejectedValueOnce(new Error("réseau")).mockResolvedValueOnce(fail("provider_error"));
    await poll();
    const alert = document.querySelector("main [role='alert']") as HTMLElement;
    expect(alert).toHaveTextContent(t.interrompue);
    await poll();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: t.reessayer }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(alert).toHaveTextContent(t.interrompue);
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: t.reessayer }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(alert).toBeEmptyDOMElement();
    expect(fetchStatus).toHaveBeenCalledTimes(3);
  });

  it("démontage : l'interrogation s'arrête", async () => {
    const { unmount } = renderView();
    unmount();
    await poll(at(1));
    expect(fetchStatus).not.toHaveBeenCalled();
  });
});

describe("PreparationView : site d'essai (E2E-essai, lot 3 ; décision 0125 § 4)", () => {
  const ESSAI = "proto_rome_0123abcd45674890a123456789abcdef";
  const NOUVEAU = "proto_rome_fedcba9876543210fedcba9876543210";
  const echec: GenerationStatus = { phase: "failed", tripId: ESSAI, days: [{ index: 1, state: "preparing", readyStops: 0 }], expected: 8, ready: 0, reason: "provider_error", retryable: true };
  const e = t.essai;
  const alerte = () => document.querySelector("main [role='alert']") as HTMLElement;
  const renderEssai = () => render(<PreparationView tripId={ESSAI} initial={echec} fetchStatus={fetchStatus} essai />);
  async function reessayer() {
    await act(async () => {
      fireEvent.click(within(alerte()).getByRole("button", { name: t.reessayer }));
      await vi.advanceTimersByTimeAsync(0);
    });
  }

  it("relance annoncée (role=status), titre de la préparation, bandeau retiré ; puis l'écran 5 du nouveau voyage", async () => {
    let fin: (valeur: unknown) => void = () => undefined;
    vi.mocked(relancerVoyageEssai).mockReturnValue(new Promise((resolve) => (fin = resolve)) as never);
    renderEssai();
    await reessayer();
    expect(screen.getByText(e.relance)).toHaveAttribute("role", "status");
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titre);
    expect(screen.getByRole("heading", { level: 1 })).toHaveFocus();
    expect(alerte()).toBeEmptyDOMElement();
    expect(vi.mocked(relancerVoyageEssai).mock.calls[0]?.[0]).toMatchObject({ tripId: ESSAI });
    await act(async () => {
      fin(ok({ tripId: NOUVEAU }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(router.replace).toHaveBeenCalledWith(`/voyages/${NOUVEAU}/preparation`);
    expect(fetchStatus).not.toHaveBeenCalled();
  });

  it.each([
    ["provider_error", () => fail("provider_error"), e.relanceEchec],
    ["not_found", () => fail("not_found"), e.relanceEchec],
    ["cost_cap_reached", () => fail("cost_cap_reached"), e.plafond],
  ])("relance refusée (%s) : message propre dans l'alerte, « Réessayer » rejoue le même requestId", async (_cas, refus, message) => {
    vi.mocked(relancerVoyageEssai).mockResolvedValue(refus() as never);
    const { container } = renderEssai();
    await reessayer();
    expect(alerte()).toHaveTextContent(message);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(t.titreInterrompu);
    await reessayer();
    const [premier, second] = vi.mocked(relancerVoyageEssai).mock.calls.map((call) => (call[0] as { requestId: string }).requestId);
    expect(second).toBe(premier);
    expect(router.replace).not.toHaveBeenCalled();
    expect(await axeWithRealTimers(container)).toEqual([]);
  });

  it("erreur réseau : message de la relance", async () => {
    vi.mocked(relancerVoyageEssai).mockRejectedValue(new Error("réseau"));
    renderEssai();
    await reessayer();
    expect(alerte()).toHaveTextContent(e.relanceEchec);
  });

  it("accès expiré (unauthenticated) : saisie du code dans l'écran, puis relance une fois le code accepté", async () => {
    vi.mocked(relancerVoyageEssai).mockResolvedValueOnce(fail("unauthenticated")).mockResolvedValueOnce(ok({ tripId: NOUVEAU }));
    vi.mocked(saisirCodeAccesP0).mockResolvedValue({ statut: "accepte" });
    renderEssai();
    await reessayer();
    expect(screen.getByRole("heading", { level: 1, name: e.acces.titre })).toHaveFocus();
    expect(screen.getByText(e.acces.aide)).toBeInTheDocument();
    const champ = screen.getByLabelText(messages.prototype.acces.libelle);
    await act(async () => {
      fireEvent.submit(champ.closest("form") as HTMLFormElement);
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(relancerVoyageEssai).toHaveBeenCalledTimes(2);
    expect(router.replace).toHaveBeenCalledWith(`/voyages/${NOUVEAU}/preparation`);
  });

  it("hors site d'essai : « Réessayer » ne relance jamais un voyage", async () => {
    render(<PreparationView tripId={ESSAI} initial={echec} fetchStatus={fetchStatus} />);
    await reessayer();
    expect(relancerVoyageEssai).not.toHaveBeenCalled();
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});

describe("PreparationView : aucun nom de lieu", () => {
  it("l'écran ne rend que des compteurs, des états de jour et des anneaux", async () => {
    const { container } = renderView(at(8));
    expect(container.textContent).not.toMatch(/\[/);
  });
});
