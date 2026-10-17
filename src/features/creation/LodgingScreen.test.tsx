import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok, type TripDraft } from "@/contracts";
import * as messages from "@/i18n/messages";
import { MOCK_DEMO_TRIP_DRAFT, MOCK_LODGING_SUGGESTION } from "@/mocks/creation-edimbourg";
import { suggestLodging } from "@/server/actions/creation";

import { axeViolations } from "../../../tests/unit/axe";
import { stubLayout } from "../../../tests/unit/carte-fixtures";

import { DraftProvider, useDraft } from "./DraftProvider";
import { draftForLodging, initialDraft, type DraftState } from "./draft";
import { LodgingScreen } from "./LodgingScreen";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/creation", () => ({ suggestLodging: vi.fn() }));

/** Écran 3 « Où loger » (`R3`, F8-PO-8 ; 0017 § 1 et § 7 ; 0018 § 17). */

const t = messages.creation.ecran3;
const LODGINGS = MOCK_LODGING_SUGGESTION.lodgings;
const { areaId, name, center, radiusM } = MOCK_LODGING_SUGGESTION.area;
/** Valeurs maison de la zone retenue (0081 § B9-TL-5) : jamais la raison affichée. */
const SUGGESTED_AREA = { kind: "suggestedArea" as const, areaId, name, center, radiusM };

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

function renderScreen(initial: DraftState = draftForLodging(MOCK_DEMO_TRIP_DRAFT)) {
  return render(
    <DraftProvider initial={initial}>
      <LodgingScreen />
      <Probe />
    </DraftProvider>,
  );
}

/** Édimbourg « Pas encore », puis Glasgow « Pas encore ». */
const TWO_CITIES: TripDraft = {
  ...MOCK_DEMO_TRIP_DRAFT,
  otherCities: [{ name: "Glasgow", arrival: "2026-09-01", lodging: { kind: "none" } }],
};

/** Région status de l'écran (la mini-carte a la sienne). */
const screenStatus = () => screen.getAllByRole("status").find((element) => !element.closest("[data-area-map]"))!;

beforeEach(() => {
  stubLayout(390, 220);
  router.push.mockClear();
  router.replace.mockClear();
  vi.mocked(suggestLodging).mockReset();
  vi.mocked(suggestLodging).mockResolvedValue(ok(MOCK_LODGING_SUGGESTION));
  latest = null;
});

describe("LodgingScreen : sans brouillon", () => {
  it("remplace l'adresse par l'écran 1 et demande l'annonce du brouillon perdu, sans demande de suggestion", async () => {
    renderScreen(initialDraft());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/voyages/nouveau"));
    expect(latest?.lostNotice).toBe(true);
    expect(suggestLodging).not.toHaveBeenCalled();
  });
});

describe("LodgingScreen : suggestion", () => {
  it("attente : squelette et « On cherche… » dans la région status, présente dès l'affichage", async () => {
    vi.mocked(suggestLodging).mockReturnValue(new Promise(() => {}));
    const { container } = renderScreen();
    expect(screen.getByRole("heading", { level: 1, name: "Où loger à Édimbourg" })).toBeInTheDocument();
    expect(screenStatus()).toHaveTextContent(t.attente);
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(container.querySelector('[data-part="squelette"]')).toHaveAttribute("aria-hidden", "true");
  });

  it("quartier conseillé (niveau 2), raison, carte, au plus 3 logements et « Partir du quartier, choisir plus tard »", async () => {
    const { container } = renderScreen();
    expect(await screen.findByRole("heading", { level: 2, name: MOCK_LODGING_SUGGESTION.area.name })).toBeInTheDocument();
    expect(suggestLodging).toHaveBeenCalledWith({ draft: MOCK_DEMO_TRIP_DRAFT, city: 0 });
    expect(screen.getByText(MOCK_LODGING_SUGGESTION.area.reason)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: `Carte du quartier ${MOCK_LODGING_SUGGESTION.area.name}` })).toBeInTheDocument();
    const list = within(screen.getByRole("region", { name: t.logements })).getByRole("list");
    expect(within(list).getAllByRole("listitem")).toHaveLength(LODGINGS.length);
    for (const lodging of LODGINGS) {
      expect(screen.getByRole("button", { name: `Choisir ce logement : ${lodging.name}` })).toHaveTextContent(t.choisir);
    }
    expect(screen.getByRole("button", { name: t.partirDuQuartier })).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screenStatus()).toBeEmptyDOMElement();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("« Choisir ce logement » sur la dernière ville : identifiants gardés, écran 4 avec la suite du lancement", async () => {
    renderScreen();
    fireEvent.click(await screen.findByRole("button", { name: `Choisir ce logement : ${LODGINGS[1]!.name}` }));
    expect(latest?.lodgingChoices).toEqual({
      destination: { kind: "suggestedLodging", lodgingId: LODGINGS[1]!.lodgingId, name: LODGINGS[1]!.name },
    });
    expect(router.push).toHaveBeenCalledWith("/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer");
  });

  it("« Partir du quartier » sur la première de deux villes : ville suivante sur la même adresse, focus sur son titre", async () => {
    vi.mocked(suggestLodging).mockImplementation(async (input) =>
      (input as { city: number }).city === 0 ? ok(MOCK_LODGING_SUGGESTION) : fail("no_option"),
    );
    renderScreen(draftForLodging(TWO_CITIES));
    fireEvent.click(await screen.findByRole("button", { name: t.partirDuQuartier }));
    expect(router.push).not.toHaveBeenCalled();
    const title = await screen.findByRole("heading", { level: 1, name: "Où loger à Glasgow" });
    await waitFor(() => expect(title).toHaveFocus());
    expect(latest?.lodgingCity).toBe(1);
    // La demande de Glasgow porte le choix déjà fait pour Édimbourg.
    expect(suggestLodging).toHaveBeenLastCalledWith({
      draft: { ...TWO_CITIES, lodging: SUGGESTED_AREA },
      city: 1,
    });
    // Ville inconnue du jeu simulé.
    expect(await screen.findByText(t.aucunQuartier)).toBeInTheDocument();
    expect(screenStatus()).toHaveTextContent(t.aucunQuartier);
    // « Retour » : écran 3 de la ville précédente, même adresse.
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Où loger à Édimbourg" })).toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("« Retour » sur la première ville : écran 2 (« Vérification »)", async () => {
    renderScreen();
    await screen.findByRole("heading", { level: 2, name: MOCK_LODGING_SUGGESTION.area.name });
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("aucun quartier : « Aucun quartier à te proposer pour l'instant. » et « Continuer sans logement »", async () => {
    vi.mocked(suggestLodging).mockResolvedValue(fail("no_option"));
    renderScreen();
    expect(await screen.findByText("Aucun quartier à te proposer pour l'instant.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: t.continuerSansLogement }));
    expect(latest?.lodgingChoices).toEqual({ destination: { kind: "none" } });
    expect(router.push).toHaveBeenCalledWith("/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer");
  });

  it("erreur : bandeau dans la région alert avec « Réessayer » et « Continuer sans logement » ; « Réessayer » relance", async () => {
    vi.mocked(suggestLodging).mockResolvedValueOnce(fail("provider_error"));
    renderScreen();
    const alert = screen.getByRole("alert");
    await waitFor(() => expect(alert).toHaveTextContent(t.echec));
    expect(within(alert).getByRole("button", { name: t.continuerSansLogement })).toBeInTheDocument();
    await act(async () => {
      fireEvent.click(within(alert).getByRole("button", { name: t.reessayer }));
    });
    expect(suggestLodging).toHaveBeenCalledTimes(2);
    expect(await screen.findByRole("heading", { level: 2, name: MOCK_LODGING_SUGGESTION.area.name })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
  });

  it("exception réseau : même bandeau", async () => {
    vi.mocked(suggestLodging).mockRejectedValue(new Error("réseau"));
    renderScreen();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(t.echec));
  });
});
