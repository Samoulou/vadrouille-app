import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok, type TripRequest } from "@/contracts";
import * as messages from "@/i18n/messages";
import { MOCK_DEMO_TRIP_DRAFT } from "@/mocks/creation-edimbourg";
import { createTrip } from "@/server/actions/creation";

import { axeViolations } from "../../../tests/unit/axe";

import { DraftProvider, useDraft } from "./DraftProvider";
import { draftForLodging, draftReducer, initialDraft, type DraftState } from "./draft";
import { LaunchStep } from "./LaunchStep";
import { resetLaunchTiming, setLaunchClock, takePreviewReady } from "./launch-timing";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ createTrip: vi.fn() }));

/** `R-lancer` (F8c ; « Lancement » et « Garde du lancement » ; F8-PO-2, F8-PO-11 ; 0018 § 18). */

const t = messages.creation.lancement;
const R4_LANCER = "/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer";
const R5 = "/voyages/mock_trip_edimbourg/preparation";

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

/** Brouillon complet : écrans 1 et 2 validés, « Partir du quartier » choisi pour Édimbourg. */
const COMPLETE = draftReducer(draftForLodging(MOCK_DEMO_TRIP_DRAFT), {
  type: "lodgingChoice",
  city: 0,
  choice: { kind: "none" },
  next: null,
});

function renderStep({ initial = COMPLETE, signedIn = true }: { initial?: DraftState; signedIn?: boolean } = {}) {
  return render(
    <DraftProvider initial={initial}>
      <LaunchStep signedIn={signedIn} />
      <Probe />
    </DraftProvider>,
  );
}

const requests = () => vi.mocked(createTrip).mock.calls.map(([input]) => input as TripRequest);

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(createTrip).mockReset();
  latest = null;
});

afterEach(() => resetLaunchTiming());

describe("LaunchStep : garde", () => {
  it("sans brouillon complet : R1 et l'annonce du brouillon perdu, aucun appel à createTrip", async () => {
    renderStep({ initial: initialDraft() });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau"));
    expect(latest?.lostNotice).toBe(true);
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("écran 3 non choisi : brouillon incomplet, R1", async () => {
    renderStep({ initial: draftForLodging(MOCK_DEMO_TRIP_DRAFT) });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau"));
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("brouillon complet sans session : R4(R-lancer), aucun appel à createTrip", async () => {
    renderStep({ signedIn: false });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(R4_LANCER));
    expect(createTrip).not.toHaveBeenCalled();
    expect(latest?.lostNotice).toBe(false);
  });
});

describe("LaunchStep : lancement", () => {
  it("un seul appel avec le brouillon et un requestId gardé ; l'adresse est remplacée par l'écran 5", async () => {
    let now = 100;
    setLaunchClock(() => now);
    vi.mocked(createTrip).mockImplementation(async () => {
      now = 350;
      return ok({ tripId: "mock_trip_edimbourg" });
    });
    renderStep();
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(R5));
    expect(createTrip).toHaveBeenCalledTimes(1);
    const [request] = requests();
    expect(request!.requestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(request!.draft).toMatchObject({
      destination: "Édimbourg",
      lodging: { kind: "none" },
    });
    expect(latest?.requestId).toBe(request!.requestId);
    expect(router.push).not.toHaveBeenCalled();
    // L'instant de l'appel est retenu pour `preview_ready`.
    now = 1350;
    expect(takePreviewReady("mock_trip_edimbourg")).toEqual({
      durationMs: 1250,
    });
  });

  it("attente : « Création de ton voyage… » dans la région status ; régions présentes dès l'affichage ; « Retour » inactif", async () => {
    vi.mocked(createTrip).mockReturnValue(new Promise(() => {}));
    const { container } = renderStep();
    expect(screen.getByRole("status")).toHaveTextContent(t.attente);
    expect(screen.getByRole("button", { name: messages.creation.retour })).toBeDisabled();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("requestId déjà présent dans le brouillon (retour du navigateur) : réutilisé", async () => {
    vi.mocked(createTrip).mockResolvedValue(ok({ tripId: "mock_trip_edimbourg" }));
    renderStep({
      initial: {
        ...COMPLETE,
        requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
      },
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(R5));
    expect(requests()[0]!.requestId).toBe("5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11");
  });

  it("active_preview_exists : bandeau « conflict » et lien vers le voyage existant, sans redirection", async () => {
    vi.mocked(createTrip).mockResolvedValue({
      ok: false,
      error: { code: "active_preview_exists", activeTripId: "mock_trip_edimbourg" },
    });
    const { container } = renderStep();
    const alert = await screen.findByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent(t.conflit));
    expect(screen.getByRole("link", { name: t.voirConflit })).toHaveAttribute("href", R5);
    expect(alert.querySelector("[data-kind='conflict']")).not.toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("autre erreur : bandeau « error », « Réessayer » relance avec le même requestId, brouillon conservé", async () => {
    vi.mocked(createTrip)
      .mockResolvedValueOnce(fail("provider_error"))
      .mockRejectedValueOnce(new Error("réseau"))
      .mockResolvedValueOnce(ok({ tripId: "mock_trip_edimbourg" }));
    renderStep();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.echec));
    expect(screen.getByRole("button", { name: messages.creation.retour })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: t.reessayer }));
    // Le bandeau disparaît pendant l'essai : le focus est sur le titre.
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toHaveFocus();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.echec));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: t.reessayer }));
    });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(R5));
    const ids = requests().map((request) => request.requestId);
    expect(ids).toHaveLength(3);
    expect(new Set(ids).size).toBe(1);
    expect(latest?.tripReady).toBe(true);
  });

  it("unauthenticated (session perdue) : R4(R-lancer)", async () => {
    vi.mocked(createTrip).mockResolvedValue(fail("unauthenticated"));
    renderStep();
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(R4_LANCER));
  });

  it("« Retour » (après l'appel) : dernier écran 3 affiché, sinon écran 2", async () => {
    vi.mocked(createTrip).mockResolvedValue(fail("provider_error"));
    const retour = () => screen.getByRole("button", { name: messages.creation.retour });
    const { unmount } = renderStep({
      initial: { ...COMPLETE, lodgingCity: 0 },
    });
    await waitFor(() => expect(retour()).toBeEnabled());
    fireEvent.click(retour());
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/logement");
    unmount();
    renderStep({ initial: { ...COMPLETE, lodgingCity: null } });
    await waitFor(() => expect(retour()).toBeEnabled());
    fireEvent.click(retour());
    expect(router.push).toHaveBeenLastCalledWith("/voyages/nouveau/brief");
  });
});
