import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_CITIES, MAX_COMMITMENTS } from "@/contracts/values";

import { axeViolations } from "../../../tests/unit/axe";

import { CreateTripForm } from "./CreateTripForm";
import { DraftProvider, useDraft } from "./DraftProvider";
import { draftReducer, initialDraft, type DraftState } from "./draft";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

/** Écran 1 « Ton voyage » (`R1`, F8-PO-3), rendus et textes provisoires (0018 § 15). */

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

function renderForm(initial?: DraftState) {
  return render(
    <DraftProvider initial={initial}>
      <CreateTripForm />
      <Probe />
    </DraftProvider>,
  );
}

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const lodging = () => screen.getAllByRole("radiogroup", { name: "As-tu déjà un logement ?" })[0]!;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 1, 8, 0));
  router.push.mockClear();
  latest = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CreateTripForm", () => {
  it("un seul titre de niveau 1, régions status et alert présentes et vides dès l'affichage, « Retour » en haut", async () => {
    const { container } = renderForm();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(screen.getAllByRole("button", { name: "Retour" })).toHaveLength(1);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("« Retour » mène à Mes voyages", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Retour" }));
    expect(router.push).toHaveBeenCalledWith("/voyages");
  });

  it("« Continuer » sans rien saisir : messages, aria-invalid, focus sur la destination, aucune navigation", async () => {
    const { container } = renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const destination = screen.getByLabelText("Destination");
    expect(destination).toHaveAttribute("aria-invalid", "true");
    expect(destination).toHaveAccessibleDescription("Indique ta destination.");
    expect(screen.getByLabelText("Arrivée", { exact: true })).toHaveAccessibleDescription("Indique ta date d'arrivée.");
    expect(screen.getByLabelText("Départ", { exact: true })).toHaveAccessibleDescription("Indique ta date de départ.");
    expect(lodging()).toHaveAttribute("aria-invalid", "true");
    expect(lodging()).toHaveAccessibleDescription("Choisis une réponse.");
    await waitFor(() => expect(destination).toHaveFocus());
    expect(router.push).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("créer un voyage sans hôtel : « Continuer » garde la saisie et mène à l'écran 2", () => {
    renderForm();
    change("Destination", "Édimbourg");
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-09-03");
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un engagement" }));
    const block = screen.getByRole("region", { name: "Engagement 1" });
    fireEvent.click(within(block).getByRole("radio", { name: "Billet" }));
    change("Libellé", "[Tattoo]");
    change("Date", "2026-08-29");
    change("Heure de début", "21:30");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
    expect(latest?.tripReady).toBe(true);
    expect(latest?.trip.commitments[0]).toMatchObject({ kind: "ticket", label: "[Tattoo]", date: "2026-08-29", start: "21:30" });
  });

  it("arrivée passée refusée ; départ égal à l'arrivée refusé", () => {
    renderForm();
    change("Arrivée", "2026-07-31");
    change("Départ", "2026-07-31");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("La date d'arrivée ne peut pas être déjà passée.")).toBeInTheDocument();
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-08-29");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("Le départ doit suivre l'arrivée d'au moins une nuit.")).toBeInTheDocument();
  });

  it("« Oui » demande le nom ou l'adresse ; « Un quartier » le quartier", () => {
    renderForm();
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Oui" }));
    expect(screen.getByLabelText("Nom ou adresse du logement")).toBeInTheDocument();
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Un quartier" }));
    expect(screen.getByLabelText("Quartier")).toBeInTheDocument();
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
    expect(screen.queryByLabelText("Quartier")).toBeNull();
  });

  it("villes : récapitulatif, ville refusée hors des dates, « Retirer » rend tout le voyage à la destination", async () => {
    renderForm();
    change("Destination", "Édimbourg");
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-09-03");
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une ville" }));
    await waitFor(() => expect(screen.getByLabelText("Nom de la ville")).toHaveFocus());
    change("Nom de la ville", "Glasgow");
    change("Arrivée dans cette ville", "2026-09-01");
    const recap = screen.getByRole("list", { name: "Tes villes" });
    // Dates au format court du handover (jour de la semaine, puis « 29.08 »), comme la plaque de destination.
    expect(within(recap).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "Édimbourg : sam. 29.08 – mar. 01.09",
      "Glasgow : mar. 01.09 – jeu. 03.09",
    ]);

    change("Arrivée dans cette ville", "2026-09-03");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("L'arrivée doit précéder le départ du voyage d'au moins une nuit.")).toBeInTheDocument();
    change("Arrivée dans cette ville", "2026-08-29");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByText("L'arrivée doit suivre celle de la ville précédente d'au moins une nuit.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Retirer Glasgow" }));
    expect(screen.queryByRole("list", { name: "Tes villes" })).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ajouter une ville" })).toHaveFocus());
  });

  it("engagement hors des dates refusé", () => {
    renderForm();
    change("Destination", "Édimbourg");
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-09-03");
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un engagement" }));
    fireEvent.click(within(screen.getByRole("region", { name: "Engagement 1" })).getByRole("radio", { name: "Vol" }));
    change("Libellé", "Vol retour");
    change("Date", "2026-09-04");
    change("Heure de début", "10:00");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByLabelText("Date")).toHaveAccessibleDescription("La date doit être comprise dans les dates du voyage.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it(`une ${MAX_CITIES + 1}e ville et un ${MAX_COMMITMENTS + 1}e engagement ne peuvent pas être ajoutés`, () => {
    renderForm();
    for (let i = 0; i < MAX_CITIES - 1; i++) fireEvent.click(screen.getByRole("button", { name: "Ajouter une ville" }));
    for (let i = 0; i < MAX_COMMITMENTS; i++) fireEvent.click(screen.getByRole("button", { name: "Ajouter un engagement" }));
    // Au plafond : `aria-disabled` (atteignable au clavier, comme les `Chip`), un clic de plus n'ajoute rien.
    const addCity = screen.getByRole("button", { name: "Ajouter une ville" });
    expect(addCity).toHaveAttribute("aria-disabled", "true");
    expect(addCity).not.toBeDisabled();
    expect(addCity).toHaveAccessibleDescription("Au plus 4 villes en tout, destination comprise.");
    fireEvent.click(addCity);
    const addCommitment = screen.getByRole("button", { name: "Ajouter un engagement" });
    expect(addCommitment).toHaveAttribute("aria-disabled", "true");
    expect(addCommitment).not.toBeDisabled();
    expect(addCommitment).toHaveAccessibleDescription("Au plus 10 engagements.");
    fireEvent.click(addCommitment);
    expect(latest?.trip.otherCities).toHaveLength(MAX_CITIES - 1);
    expect(latest?.trip.commitments).toHaveLength(MAX_COMMITMENTS);
  });

  it("brouillon perdu : l'annonce est écrite après le premier rendu dans la région déjà présente", async () => {
    const lost = draftReducer(initialDraft(), { type: "lost" });
    renderForm(lost);
    await act(async () => {});
    expect(screen.getByRole("status")).toHaveTextContent("Ton brouillon n'a pas été conservé. Recommence à partir de la destination.");
  });
});

describe("CreateTripForm : site d'essai (E2E-essai, lot 2, critère 2 ; D1)", () => {
  function renderEssai() {
    return render(
      <DraftProvider>
        <CreateTripForm essai />
        <Probe />
      </DraftProvider>,
    );
  }

  function remplir(destination: string, depart = "2026-09-03") {
    change("Destination", destination);
    change("Arrivée", "2026-08-29");
    change("Départ", depart);
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
  }

  it("ville hors de la table des fuseaux : refus au champ, message relié, focus ; aucune navigation", async () => {
    const { container } = renderEssai();
    remplir("Atlantide");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const destination = screen.getByLabelText("Destination", { exact: true });
    expect(destination).toHaveAttribute("aria-invalid", "true");
    expect(destination).toHaveAccessibleDescription("Cette ville n'est pas encore disponible sur le site d'essai. Essaie Rome ou Lisbonne.");
    await waitFor(() => expect(destination).toHaveFocus());
    expect(router.push).not.toHaveBeenCalled();
    expect(latest?.tripReady).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("une seule ville : « Autres villes » et « Ajouter une ville » ne sont pas proposés", () => {
    renderEssai();
    expect(screen.queryByRole("heading", { name: "Autres villes" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ajouter une ville" })).not.toBeInTheDocument();
    remplir("Rome");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("page prérendue : le site d'essai est lu dans l'adresse (?site=essai)", () => {
    window.history.pushState({}, "", "/voyages/nouveau?site=essai");
    try {
      renderForm();
      expect(screen.queryByRole("button", { name: "Ajouter une ville" })).not.toBeInTheDocument();
      remplir("Atlantide");
      fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
      expect(screen.getByLabelText("Destination", { exact: true })).toHaveAttribute("aria-invalid", "true");
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("plus de 15 jours : refus au départ ; Rome sur 15 jours : écran 2", () => {
    renderEssai();
    remplir("Rome", "2026-09-13");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByLabelText("Départ", { exact: true })).toHaveAccessibleDescription(
      "15 jours au plus sur le site d'essai : choisis un départ plus proche de l'arrivée.",
    );
    change("Départ", "2026-09-12");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("hors du site d'essai : une ville hors table reste admise par l'écran 1, « Ajouter une ville » proposé", () => {
    renderForm();
    expect(screen.getByRole("button", { name: "Ajouter une ville" })).toBeInTheDocument();
    remplir("Atlantide");
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });
});
