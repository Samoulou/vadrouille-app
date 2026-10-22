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

/** `R-lancer` sur le site d'essai (spécification E2E-essai, lot 2, critères 4 et 5 ; D3). */

const t = messages.creation.lancement.essai;
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
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau"));
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

  it("code accepté : retour au lancement, brouillon gardé, « arrive bientôt », focus sur le titre ; aucun lancement", async () => {
    vi.mocked(saisirCodeAccesP0).mockResolvedValue({ statut: "accepte" });
    renderStep("saisie");
    fireEvent.change(screen.getByLabelText(acces.libelle), { target: { value: SAISIE_DE_TEST } });
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(acces.libelle).closest("form") as HTMLFormElement);
    });
    const titre = await screen.findByRole("heading", { level: 1, name: t.titre });
    expect(screen.getByText(t.bientot)).toBeInTheDocument();
    await waitFor(() => expect(titre).toHaveFocus());
    expect(latest?.trip).toEqual(COMPLETE.trip);
    expect(latest?.lodgingChoices).toEqual(COMPLETE.lodgingChoices);
    expect(router.replace).not.toHaveBeenCalled();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("code refusé : erreur au champ, saisie toujours affichée", async () => {
    vi.mocked(saisirCodeAccesP0).mockResolvedValue({ statut: "invalid_code" });
    renderStep("saisie");
    await act(async () => {
      fireEvent.submit(screen.getByLabelText(acces.libelle).closest("form") as HTMLFormElement);
    });
    expect(await screen.findByText(acces.erreurs.invalid_code)).toBeInTheDocument();
    expect(screen.queryByText(t.bientot)).toBeNull();
  });

  it("accès ouvert : « Le lancement depuis l'app arrive bientôt », sans erreur ni appel ; axe", async () => {
    const { container } = renderStep("ouverte");
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(t.bientot);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByLabelText(acces.libelle)).toBeNull();
    expect(createTrip).not.toHaveBeenCalled();
    expect(saisirCodeAccesP0).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("garde fermée : le lancement n'est pas ouvert sur ce site, sans saisie", () => {
    renderStep("fermee");
    expect(screen.getByRole("status")).toHaveTextContent(t.ferme);
    expect(screen.queryByLabelText(acces.libelle)).toBeNull();
    expect(createTrip).not.toHaveBeenCalled();
  });

  it("« Retour » : écran 3 de la dernière ville, brouillon gardé", () => {
    renderStep("ouverte");
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/logement");
    expect(latest?.lodgingCity).toBe(0);
  });
});
