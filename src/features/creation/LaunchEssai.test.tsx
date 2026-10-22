import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as messages from "@/i18n/messages";
import { MOCK_DEMO_TRIP_DRAFT } from "@/mocks/creation-edimbourg";
import { createTrip } from "@/server/actions/creation";
import { saisirCodeAccesP0 } from "@/server/actions/p0-acces";

import { axeViolations } from "../../../tests/unit/axe";

import { DraftProvider, useDraft } from "./DraftProvider";
import { draftForLodging, draftReducer, initialDraft, type DraftState } from "./draft";
import { LaunchEssai, type AccesEssai } from "./LaunchEssai";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ createTrip: vi.fn() }));
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

/** `R-lancer` sur le site d'essai (spécification E2E-essai, lot 2, critères 4 et 5 ; lot 3 ; D3 ; décision 0125 § 2). */

const l = messages.creation.lancement;
const t = l.essai;
const TRIP_ID = "proto_edimbourg_0123456789abcdef0123456789abcdef";
const acces = messages.prototype.acces;
/** Saisie de test, jamais un code réel : l'action est simulée. */
const SAISIE_DE_TEST = "saisie-de-test";

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

/** Brouillon complet : écrans 1 et 2 validés, « Continuer sans logement » pour Édimbourg. */
const COMPLETE = draftReducer(draftForLodging(MOCK_DEMO_TRIP_DRAFT), {
  type: "lodgingChoice",
  city: 0,
  choice: { kind: "none" },
  next: null,
});

function renderStep(etat: AccesEssai, initial: DraftState = COMPLETE) {
  return render(
    <DraftProvider initial={initial}>
      <LaunchEssai acces={etat} />
      <Probe />
    </DraftProvider>,
  );
}

beforeEach(() => {
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(createTrip).mockReset();
  vi.mocked(saisirCodeAccesP0).mockReset();
  latest = null;
});

describe("LaunchEssai", () => {
  it("sans brouillon complet : écran 1, brouillon perdu annoncé ; ni saisie ni lancement", async () => {
    renderStep("saisie", initialDraft());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau?site=essai"));
    expect(latest?.lostNotice).toBe(true);
    expect(screen.queryByLabelText(acces.libelle)).toBeNull();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("sans cookie d'accès valide : saisie du code dans le parcours, titre et aide de la création ; axe", async () => {
    const { container } = renderStep("saisie");
    expect(screen.getByRole("heading", { level: 1, name: t.acces.titre })).toBeInTheDocument();
    expect(screen.getByText(t.acces.aide)).toBeInTheDocument();
    expect(screen.getByLabelText(acces.libelle)).toHaveAttribute("autocomplete", "off");
    expect(screen.getByRole("button", { name: "Retour" })).toBeInTheDocument();
    // Une seule région principale : celle du cadre de la création.
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(router.replace).not.toHaveBeenCalled();
    expect(createTrip).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("code accepté : retour à l'étape, brouillon gardé, focus sur le titre, puis un seul lancement", async () => {
    vi.mocked(saisirCodeAccesP0).mockResolvedValue({ statut: "accepte" });
    vi.mocked(createTrip).mockReturnValue(new Promise(() => undefined));
    renderStep("saisie");
    fireEvent.change(screen.getByLabelText(acces.libelle), { target: { value: SAISIE_DE_TEST } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(acces.libelle).closest("form") as HTMLFormElement);
    });
    const titre = await screen.findByRole("heading", { level: 1, name: l.titre });
    await waitFor(() => expect(titre).toHaveFocus());
    expect(latest?.trip).toEqual(COMPLETE.trip);
    expect(latest?.lodgingChoices).toEqual(COMPLETE.lodgingChoices);
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
    expect(screen.getByText(l.attente)).toHaveAttribute("role", "status");
  });

  it("code refusé : erreur au champ, saisie toujours affichée, aucun lancement", async () => {
    vi.mocked(saisirCodeAccesP0).mockResolvedValue({ statut: "invalid_code" });
    renderStep("saisie");
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(acces.libelle).closest("form") as HTMLFormElement);
    });
    expect(await screen.findByText(acces.erreurs.invalid_code)).toBeInTheDocument();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("accès ouvert : un appel avec brouillon, vérification, récit et requestId gardé, puis l'écran 5 remplace l'adresse", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: true, value: { tripId: TRIP_ID } });
    const recit = "On aime les ruines antiques et marcher le soir.";
    renderStep("ouverte", { ...COMPLETE, story: `  ${recit}  ` });
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(`/voyages/${TRIP_ID}/preparation`));
    expect(createTrip).toHaveBeenCalledTimes(1);
    const demande = vi.mocked(createTrip).mock.calls[0]?.[0] as { requestId: string; story?: string; draft: unknown; brief: unknown };
    expect(demande.story).toBe(recit);
    expect(demande.draft).toBeDefined();
    expect(demande.brief).toBeDefined();
    expect(latest?.requestId).toBe(demande.requestId);
  });

  it("récit trop court : lancement sans récit (il est facultatif)", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: true, value: { tripId: TRIP_ID } });
    renderStep("ouverte", { ...COMPLETE, story: "court" });
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(1));
    expect(vi.mocked(createTrip).mock.calls[0]?.[0]).not.toHaveProperty("story");
  });

  it("échec : bandeau d'erreur et « Réessayer » avec le même requestId ; axe", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: false, error: { code: "provider_error" } });
    const { container } = renderStep("ouverte");
    expect(await screen.findByText(l.echec)).toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: l.reessayer }));
    await waitFor(() => expect(createTrip).toHaveBeenCalledTimes(2));
    const [premier, second] = vi.mocked(createTrip).mock.calls.map((call) => (call[0] as { requestId: string }).requestId);
    expect(second).toBe(premier);
    expect(screen.getByRole("heading", { level: 1, name: l.titre })).toHaveFocus();
  });

  it("cookie expiré entre-temps : la saisie du code revient, brouillon gardé", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: false, error: { code: "unauthenticated" } });
    renderStep("ouverte");
    expect(await screen.findByLabelText(acces.libelle)).toBeInTheDocument();
    expect(latest?.trip).toEqual(COMPLETE.trip);
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("récit refusé : bandeau et « Modifier mon récit » vers l'écran 2, état « Récit »", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: false, error: { code: "validation_failed", field: "story" } });
    renderStep("ouverte");
    expect(await screen.findByText(t.recit)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.modifierRecit }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
    expect(latest?.stage).toBe("story");
  });

  it("plafond atteint : bandeau sans « Réessayer »", async () => {
    vi.mocked(createTrip).mockResolvedValue({ ok: false, error: { code: "cost_cap_reached" } });
    renderStep("ouverte");
    expect(await screen.findByText(t.plafond)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: l.reessayer })).toBeNull();
  });

  it("garde fermée : le lancement n'est pas ouvert sur ce site, sans saisie", () => {
    renderStep("fermee");
    expect(screen.getByText(t.ferme).closest("[role='status']")).not.toBeNull();
    expect(screen.queryByLabelText(acces.libelle)).toBeNull();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("« Retour » : écran 3 de la dernière ville, brouillon gardé", () => {
    renderStep("fermee");
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/logement");
    expect(latest?.lodgingCity).toBe(0);
  });
});
