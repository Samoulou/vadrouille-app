import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { CreateTripForm, type CreateTripFormProps } from "./CreateTripForm";
import { DraftProvider, useDraft } from "./DraftProvider";
import type { DraftState } from "./draft";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
const villes = vi.hoisted(() => ({ suggererVilles: vi.fn(), choisirVille: vi.fn() }));
vi.mock("@/server/actions/villes-essai", () => villes);
const villesApi = vi.hoisted(() => ({ suggererVillesApi: vi.fn(), choisirVilleApi: vi.fn() }));
vi.mock("@/server/actions/villes", () => villesApi);
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

/** Écran 1 à plusieurs villes (spécification M4 § 7.1 et § 8 ; critères 2 à 4, 18 et 22 ; verdict 0149 § 3). */

let latest: DraftState | null = null;
function Probe() {
  const { state } = useDraft();
  useEffect(() => {
    latest = state;
  });
  return null;
}

function renderForm(props: CreateTripFormProps = {}) {
  return render(
    <DraftProvider>
      <CreateTripForm {...props} />
      <Probe />
    </DraftProvider>,
  );
}

const AIDE_BILLET =
  "Pour changer de ville, ajoute ton billet ou ton vol dans Déjà réservé, avec ses heures. Ce jour-là, un billet compte comme ton transport : pour un concert ou une visite, choisis Sortie. Les trains de nuit ne sont pas encore pris en compte.";
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const lodgings = () => screen.getAllByRole("radiogroup", { name: "As-tu déjà un logement ?" });
const addCity = () => screen.getByRole("button", { name: "Ajouter une ville" });
const status = () => screen.getByRole("status");
const kinds = () => screen.getAllByRole("radiogroup", { name: "Type de réservation" });
const cityNames = () => screen.getAllByLabelText("Nom de la ville", { exact: true });
const cityArrivals = () => screen.getAllByLabelText("Arrivée dans cette ville", { exact: true });

/** Voyage du 29.08 au 05.09 (7 nuits) ; logement « Pas encore » pour chaque ville. */
function fillTrip(destination: string, others: { name: string; arrival: string }[]) {
  change("Destination", destination);
  change("Arrivée", "2026-08-29");
  change("Départ", "2026-09-05");
  others.forEach((city, index) => {
    fireEvent.click(addCity());
    fireEvent.change(cityNames()[index]!, { target: { value: city.name } });
    fireEvent.change(cityArrivals()[index]!, { target: { value: city.arrival } });
  });
  for (const group of lodgings()) fireEvent.click(within(group).getByRole("radio", { name: "Pas encore" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 1, 8, 0));
  router.push.mockClear();
  latest = null;
  villesApi.suggererVillesApi.mockReset().mockResolvedValue({ statut: "indisponible" });
  villesApi.choisirVilleApi.mockReset().mockResolvedValue({ statut: "indisponible" });
});

describe("Écran 1: aide du billet de trajet", () => {
  it("absente avec une seule ville ; affichée dès qu'une autre ville est ajoutée ; reliée au « Type de réservation » de chaque engagement ; retirée avec la dernière ville", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une réservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une réservation" }));
    expect(screen.queryByText(AIDE_BILLET)).not.toBeInTheDocument();
    for (const kind of kinds()) expect(kind).not.toHaveAccessibleDescription(expect.stringContaining("changer de ville"));

    fireEvent.click(addCity());
    expect(screen.getByText(AIDE_BILLET)).toBeInTheDocument();
    for (const kind of kinds()) expect(kind).toHaveAccessibleDescription(AIDE_BILLET);
    fireEvent.click(addCity());
    fireEvent.click(screen.getAllByRole("button", { name: /^Retirer Ville/ })[0]!);
    // Encore une autre ville : l'aide et son lien restent.
    for (const kind of kinds()) expect(kind).toHaveAccessibleDescription(AIDE_BILLET);
    fireEvent.click(screen.getByRole("button", { name: /^Retirer Ville/ }));
    expect(screen.queryByText(AIDE_BILLET)).not.toBeInTheDocument();
    for (const kind of kinds()) expect(kind).not.toHaveAttribute("aria-describedby");
  });

  it("l'erreur du type et l'aide sont toutes deux reliées au sélecteur (aide d'abord)", () => {
    renderForm();
    fireEvent.click(addCity());
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une réservation" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(kinds()[0]).toHaveAccessibleDescription(`${AIDE_BILLET} Choisis un type.`);
  });
});

describe("Écran 1: ajout et retrait d'une ville annoncés, focus", () => {
  it("« Ville 2 ajoutée. », focus sur son nom ; « Florence retirée. », focus sur « Ajouter une ville » ; « Ville 2 retirée. » sans nom", async () => {
    renderForm();
    fireEvent.click(addCity());
    expect(status()).toHaveTextContent(/^Ville 2 ajoutée\.$/);
    await waitFor(() => expect(cityNames()[0]).toHaveFocus());
    fireEvent.click(addCity());
    expect(status()).toHaveTextContent(/^Ville 3 ajoutée\.$/);
    await waitFor(() => expect(cityNames()[1]).toHaveFocus());

    fireEvent.change(cityNames()[0]!, { target: { value: "Florence" } });
    fireEvent.click(screen.getByRole("button", { name: "Retirer Florence" }));
    expect(status()).toHaveTextContent(/^Florence retirée\.$/);
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });
    expect(addCity()).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: /^Retirer Ville/ }));
    expect(status()).toHaveTextContent(/^Ville 2 retirée\.$/);
    // Le texte annoncé n'est pas visible : la région reste la seule de l'écran (`role="status"`).
    expect(status().querySelector("[data-part='annonce-villes']")).toHaveClass("sr-only");
    expect(screen.getAllByRole("status")).toHaveLength(1);
  });
});

describe("plusieurs-villes: erreurs de ville à l'écran 1 (api)", () => {
  it("même ville deux fois de suite : « Choisis une autre ville que la précédente. » sous la seconde, reliée au champ", () => {
    renderForm({ controleVilles: true });
    fillTrip("Rome", [{ name: "Rome", arrival: "2026-09-01" }]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(cityNames()[0]).toHaveAttribute("aria-invalid", "true");
    expect(cityNames()[0]).toHaveAccessibleDescription("Choisis une autre ville que la précédente.");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Rome, Florence, puis Rome : accepté", () => {
    renderForm({ controleVilles: true });
    fillTrip("Rome", [
      { name: "Florence", arrival: "2026-08-31" },
      { name: "Rome", arrival: "2026-09-02" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalled();
  });

  it("autre décalage horaire : « Madrid n'a pas la même heure que Lisbonne. Choisis une ville à la même heure. »", () => {
    renderForm({ controleVilles: true });
    fillTrip("Lisbonne", [{ name: "Madrid", arrival: "2026-09-01" }]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(cityNames()[0]).toHaveAccessibleDescription("Madrid n'a pas la même heure que Lisbonne. Choisis une ville à la même heure.");
  });

  it("Paris puis Berlin : accepté (même heure)", () => {
    renderForm({ controleVilles: true });
    fillTrip("Paris", [{ name: "Berlin", arrival: "2026-09-01" }]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalled();
  });

  it("ville hors des 62 : « Cette ville n'est pas encore proposée. Choisis une autre ville. » ; axe sans violation avec 3 villes et une erreur", async () => {
    const { container } = renderForm({ controleVilles: true });
    fillTrip("Rome", [
      { name: "Florence", arrival: "2026-08-31" },
      { name: "[Ville imaginaire]", arrival: "2026-09-02" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(cityNames()[0]).not.toHaveAttribute("aria-invalid");
    expect(cityNames()[1]).toHaveAccessibleDescription("Cette ville n'est pas encore proposée. Choisis une autre ville.");
    expect(addCity()).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByText("Au plus 3 villes en tout, destination comprise.")).toBeInTheDocument();
    vi.useRealTimers();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("hors de api (mock) : aucun de ces contrôles, comme aujourd'hui", () => {
    renderForm();
    fillTrip("Rome", [{ name: "Rome", arrival: "2026-09-01" }]);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalled();
  });
});

describe("plusieurs-villes: recherche de ville pour les autres villes (api, verdict 0149 § 3)", () => {
  const FLORENCE = { placeId: "lieu_fictif_florence_it", principal: "Florence", secondaire: "Italie" };
  const champVille = () => screen.getByRole("combobox", { name: "Nom de la ville" });

  it("plusieurs-villes: la ville choisie entre dans otherCities par son nom maison, sans placeId", async () => {
    villesApi.suggererVillesApi.mockResolvedValue({ statut: "ok", suggestions: [FLORENCE] });
    villesApi.choisirVilleApi.mockResolvedValue({
      statut: "ok",
      ville: { placeId: FLORENCE.placeId, country: "IT", timeZone: "Europe/Rome", nomPays: "Italie", nomMaison: "Florence" },
    });
    renderForm({ recherche: "api", controleVilles: true });
    fireEvent.click(addCity());
    fireEvent.change(champVille(), { target: { value: "Flore" } });
    await screen.findAllByRole("option");
    // Mêmes actions de api que la destination, jamais celles du site d'essai.
    expect(villesApi.suggererVillesApi).toHaveBeenCalledWith({ saisie: "Flore", session: expect.any(String) });
    expect(villes.suggererVilles).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("option"));
    await waitFor(() => expect(latest?.trip.otherCities[0]?.name).toBe("Florence"));
    expect(champVille()).toHaveValue("Florence");
    expect(latest?.trip.otherCities[0]).not.toHaveProperty("placeId");
    expect(JSON.stringify(latest?.trip.otherCities)).not.toContain(FLORENCE.placeId);
  });

  it("plusieurs-villes: recherche épuisée, repli sur les 62 villes pour chaque ville", async () => {
    villesApi.suggererVillesApi.mockResolvedValue({ statut: "limite_jour" });
    renderForm({ recherche: "api", controleVilles: true });
    fireEvent.click(addCity());
    fireEvent.click(addCity());
    const [premiere, seconde] = screen.getAllByRole("combobox", { name: "Nom de la ville" });
    fireEvent.change(premiere!, { target: { value: "Florence" } });
    expect(await screen.findByText("La recherche des villes a atteint sa limite pour aujourd'hui. Écris le nom complet de ta ville, ou réessaie plus tard.")).toHaveAttribute("role", "status");
    fireEvent.change(seconde!, { target: { value: "Venise" } });
    await waitFor(() =>
      expect(screen.getAllByText("La recherche des villes a atteint sa limite pour aujourd'hui. Écris le nom complet de ta ville, ou réessaie plus tard.")).toHaveLength(2),
    );
    // Saisie libre gardée dans chaque champ ; « Continuer » ne refuse ni Florence ni Venise (villes des 62, même heure).
    expect(latest?.trip.otherCities.map((city) => city.name)).toEqual(["Florence", "Venise"]);
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-09-05");
    fireEvent.change(screen.getAllByLabelText("Arrivée dans cette ville", { exact: true })[0]!, { target: { value: "2026-08-31" } });
    fireEvent.change(screen.getAllByLabelText("Arrivée dans cette ville", { exact: true })[1]!, { target: { value: "2026-09-02" } });
    for (const group of lodgings()) fireEvent.click(within(group).getByRole("radio", { name: "Pas encore" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    for (const champ of screen.getAllByRole("combobox", { name: "Nom de la ville" })) expect(champ).not.toHaveAttribute("aria-invalid");
  });
});
