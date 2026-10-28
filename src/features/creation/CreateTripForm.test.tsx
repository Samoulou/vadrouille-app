import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_CITIES, MAX_COMMITMENTS } from "@/contracts/values";

import { axeViolations } from "../../../tests/unit/axe";

import { CreateTripForm } from "./CreateTripForm";
import { DraftProvider, useDraft } from "./DraftProvider";
import { fieldId } from "./fields";
import { draftReducer, initialDraft, type DraftState } from "./draft";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
// Recherche de ville du site d'essai : doubles des actions serveur (aucun appel réel à Google).
const villes = vi.hoisted(() => ({ suggererVilles: vi.fn(), choisirVille: vi.fn() }));
vi.mock("@/server/actions/villes-essai", () => villes);
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

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
  // Par défaut, la recherche ne répond pas (repli sur la table maison des villes).
  villes.suggererVilles.mockReset().mockResolvedValue({ statut: "indisponible" });
  villes.choisirVille.mockReset().mockResolvedValue({ statut: "indisponible" });
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

  // Suggestions fictives (identifiants fictifs : aucun identifiant de lieu Google réel dans le dépôt).
  const VALENCE = { placeId: "lieu_fictif_valence_es", principal: "Valence", secondaire: "Espagne" };
  const VALENCE_FR = { placeId: "lieu_fictif_valence_fr", principal: "Valence", secondaire: "France" };
  const HOI_AN = { placeId: "lieu_fictif_hoi_an", principal: "Hội An", secondaire: "Quảng Nam, Viêt Nam" };
  const champ = () => screen.getByRole("combobox", { name: "Destination" });
  const proposer = (suggestions: readonly { placeId: string; principal: string; secondaire: string | null }[]) =>
    villes.suggererVilles.mockResolvedValue({ statut: "ok", suggestions });
  const dates = () => {
    change("Arrivée", "2026-08-29");
    change("Départ", "2026-09-03");
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
  };

  it("« Valen » : suggestions de villes en liste (combobox ARIA), attribution « Google Maps » non traduite, annonce du nombre", async () => {
    // Demande de Samuel du 23 octobre 2026 : plus de « Cette ville n'est pas encore disponible… Essaie Rome ou Lisbonne. ».
    proposer([VALENCE, VALENCE_FR]);
    const { container } = renderEssai();
    const destination = champ();
    expect(destination).toHaveAttribute("aria-expanded", "false");
    expect(destination).toHaveAccessibleDescription("Commence à taper, puis choisis ta ville dans la liste.");
    change("Destination", "V");
    change("Destination", "Valen");
    await screen.findAllByRole("option");
    const liste = screen.getByRole("listbox", { name: "Villes suggérées" });
    // Une seule recherche par pause de frappe, jamais pour moins de deux caractères ; un jeton de session envoyé.
    expect(villes.suggererVilles).toHaveBeenCalledTimes(1);
    expect(villes.suggererVilles).toHaveBeenCalledWith({ saisie: "Valen", session: expect.stringMatching(/^[A-Za-z0-9_-]{1,36}$/) });
    expect(destination).toHaveAttribute("aria-expanded", "true");
    expect(within(liste).getAllByRole("option").map((o) => o.textContent)).toEqual(["ValenceEspagne", "ValenceFrance"]);
    const attribution = screen.getByText("Google Maps");
    expect(attribution).toHaveAttribute("translate", "no");
    // Mineur 13 de la revue du head de4ab92 : le nombre seul, sans consigne de clavier (écran tactile).
    expect(screen.getByText("2 villes suggérées.")).toBeInTheDocument();
    expect(screen.queryByText(/Essaie Rome ou Lisbonne/)).not.toBeInTheDocument();
    expect(await axeViolations(container)).toEqual([]);
  });

  it("clavier : flèches, Entrée choisit Valence (Espagne) ; nom maison, placeId, pays et fuseau gardés ; « Continuer » mène à l'écran 2", async () => {
    proposer([VALENCE, VALENCE_FR]);
    villes.choisirVille.mockResolvedValue({
      statut: "ok",
      ville: { placeId: VALENCE.placeId, country: "ES", timeZone: "Europe/Madrid", nomPays: "Espagne", nomMaison: "Valence" },
    });
    const { container } = renderEssai();
    change("Destination", "Valen");
    await screen.findAllByRole("option");
    const destination = champ();
    fireEvent.keyDown(destination, { key: "ArrowDown" });
    fireEvent.keyDown(destination, { key: "ArrowDown" });
    fireEvent.keyDown(destination, { key: "ArrowUp" });
    const active = screen.getAllByRole("option")[0]!;
    expect(destination).toHaveAttribute("aria-activedescendant", active.id);
    expect(active).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(destination, { key: "Enter" });
    await waitFor(() => expect(latest?.trip).toMatchObject({ destination: "Valence", placeId: VALENCE.placeId, country: "ES", timeZone: "Europe/Madrid" }));
    const session = villes.suggererVilles.mock.calls[0]?.[0].session as string;
    // Même session pour la fiche ; le texte principal sert à la table maison, côté serveur.
    expect(villes.choisirVille).toHaveBeenCalledWith({ placeId: VALENCE.placeId, session, saisie: "Valen", principal: "Valence" });
    expect(destination).toHaveValue("Valence");
    expect(destination).toHaveAttribute("aria-expanded", "false");
    // Bloquant 8 de la revue du head `aa77422` : le champ porte le nom retenu, et la confirmation visible le nomme.
    // Mineurs 10 et 11 de la revue du head de4ab92 : ville et pays seulement, précédés d'une coche `line`.
    expect(destination).toHaveAccessibleDescription(expect.stringContaining("Ville retenue : Valence (Espagne)."));
    const confirmation = screen.getByText("Ville retenue : Valence (Espagne).");
    expect(confirmation).toHaveClass("font-semibold", "text-ink");
    expect(confirmation.querySelector('[data-part="ville-coche"]')).toHaveClass("text-line");
    expect(confirmation.querySelector('[data-part="ville-coche"]')).toHaveAttribute("aria-hidden", "true");
    expect(await axeViolations(container)).toEqual([]);
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("revue du head `aa77422` (bloquants 6 et 7, mineur 11) : états visibles en flux, option active contournée, liste fermée absente", async () => {
    proposer([VALENCE, VALENCE_FR]);
    renderEssai();
    const destination = champ();
    // Liste fermée : ni liste vide rendue, ni `aria-controls` vers elle.
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(destination).not.toHaveAttribute("aria-controls");
    change("Destination", "Valen");
    await screen.findAllByRole("option");
    expect(destination).toHaveAttribute("aria-controls", screen.getByRole("listbox").id);
    fireEvent.keyDown(destination, { key: "ArrowDown" });
    const [premiere, seconde] = screen.getAllByRole("option");
    expect(premiere).toHaveClass("outline-2", "outline-line", "min-h-(--touch-target)");
    expect(seconde).not.toHaveClass("outline-2");
    fireEvent.keyDown(destination, { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(destination).not.toHaveAttribute("aria-controls");
    // Aucune ville : texte visible, en flux, dans la région d'état (jamais en position absolue).
    villes.suggererVilles.mockResolvedValue({ statut: "ok", suggestions: [] });
    change("Destination", "Xqzw");
    const aucune = await screen.findByText("Aucune ville trouvée. Vérifie l'orthographe.");
    expect(aucune).toHaveAttribute("role", "status");
    expect(aucune).toHaveClass("text-corps-s", "text-ink-soft");
    expect(aucune).not.toHaveClass("absolute");
  });

  it("plafond de la minute (décision 0129 § 3) : « réessaie dans une minute », aucune liste ; « Continuer » garde ce message", async () => {
    villes.suggererVilles.mockResolvedValue({ statut: "limite" });
    renderEssai();
    change("Destination", "Hoi An");
    const minute = "Trop de recherches de villes en une minute. Réessaie dans une minute.";
    expect(await screen.findByText(minute)).toHaveAttribute("role", "status");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    // Mineur 3 de la revue du head de4ab92 : le refus au plafond ne se lit jamais « ne répond pas ».
    expect(champ()).toHaveAccessibleDescription(expect.stringContaining(minute));
    expect(screen.queryByText(/ne répond pas/)).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("plafond du jour (décision 0129 § 3) : message distinct, nom complet ou plus tard ; « Continuer » garde ce message", async () => {
    villes.suggererVilles.mockResolvedValue({ statut: "limite_jour" });
    renderEssai();
    change("Destination", "Hoi An");
    const jour = "La recherche des villes a atteint sa limite pour aujourd'hui. Écris le nom complet de ta ville, ou réessaie plus tard.";
    expect(await screen.findByText(jour)).toHaveAttribute("role", "status");
    expect(screen.queryByText(/une minute/)).not.toBeInTheDocument();
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(champ()).toHaveAccessibleDescription(expect.stringContaining(jour));
    expect(screen.queryByText(/ne répond pas/)).not.toBeInTheDocument();
    expect(router.push).not.toHaveBeenCalled();
  });

  it("Échap ferme la liste sans choisir ; une nouvelle frappe efface le choix précédent", async () => {
    proposer([VALENCE]);
    villes.choisirVille.mockResolvedValue({
      statut: "ok",
      ville: { placeId: VALENCE.placeId, country: "ES", timeZone: "Europe/Madrid", nomPays: "Espagne", nomMaison: "Valence" },
    });
    renderEssai();
    change("Destination", "Valen");
    await screen.findAllByRole("option");
    fireEvent.keyDown(champ(), { key: "Escape" });
    expect(champ()).toHaveAttribute("aria-expanded", "false");
    expect(villes.choisirVille).not.toHaveBeenCalled();
    fireEvent.keyDown(champ(), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: /Valence/ }));
    await waitFor(() => expect(latest?.trip.placeId).toBe(VALENCE.placeId));
    change("Destination", "Valenc");
    expect(latest?.trip).toMatchObject({ destination: "Valenc", placeId: "", country: "", timeZone: "" });
  });

  it("recherche disponible, aucune ville choisie : « Continuer » demande de choisir, message relié, focus ; aucune navigation", async () => {
    proposer([VALENCE]);
    const { container } = renderEssai();
    change("Destination", "Valencia");
    await screen.findAllByRole("option");
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    const destination = champ();
    expect(destination).toHaveAttribute("aria-invalid", "true");
    expect(destination).toHaveAccessibleDescription(expect.stringContaining("Choisis ta ville dans la liste des suggestions."));
    await waitFor(() => expect(destination).toHaveFocus());
    expect(router.push).not.toHaveBeenCalled();
    expect(latest?.tripReady).toBe(false);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("ville d'Asie hors de la table (Hoi An) : la destination reste le texte tapé, jamais le libellé Google ; pays et fuseau maison", async () => {
    proposer([HOI_AN]);
    villes.choisirVille.mockResolvedValue({
      statut: "ok",
      ville: { placeId: HOI_AN.placeId, country: "VN", timeZone: "Asia/Ho_Chi_Minh", nomPays: "Viêt Nam", nomMaison: null },
    });
    renderEssai();
    change("Destination", "Hoi An");
    fireEvent.click(await screen.findByRole("option", { name: /Hội An/ }));
    await waitFor(() => expect(latest?.trip).toMatchObject({ destination: "Hoi An", placeId: HOI_AN.placeId, country: "VN", timeZone: "Asia/Ho_Chi_Minh" }));
    expect(champ()).toHaveValue("Hoi An");
    expect(screen.getByText("Ville retenue : Hoi An (Viêt Nam).")).toBeInTheDocument();
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
  });

  it("pays à plusieurs fuseaux : la confirmation nomme la ville et le pays, le fuseau maison est gardé", async () => {
    proposer([{ placeId: "lieu_fictif_asheville", principal: "Asheville", secondaire: "Caroline du Nord, États-Unis" }]);
    villes.choisirVille.mockResolvedValue({
      statut: "ok",
      ville: { placeId: "lieu_fictif_asheville", country: "US", timeZone: "America/New_York", nomPays: "États-Unis", nomMaison: null },
    });
    renderEssai();
    change("Destination", "Asheville");
    fireEvent.click(await screen.findByRole("option", { name: /Asheville/ }));
    expect(await screen.findByText("Ville retenue : Asheville (États-Unis).")).toBeInTheDocument();
    expect(latest?.trip).toMatchObject({ country: "US", timeZone: "America/New_York" });
  });

  it("nom tapé incomplet, ville hors de la table : refusé, le nom complet est demandé (le texte tapé part au programme)", async () => {
    proposer([HOI_AN]);
    villes.choisirVille.mockResolvedValue({
      statut: "ok",
      ville: { placeId: HOI_AN.placeId, country: "VN", timeZone: "Asia/Ho_Chi_Minh", nomPays: "Viêt Nam", nomMaison: null },
    });
    renderEssai();
    change("Destination", "Hoi");
    fireEvent.click(await screen.findByRole("option", { name: /Hội An/ }));
    await waitFor(() => expect(champ()).toHaveAccessibleDescription(expect.stringContaining("Écris le nom complet de ta ville")));
    expect(champ()).toHaveAttribute("aria-invalid", "true");
    expect(latest?.trip.placeId).toBe("");
  });

  it("pays hors de la table maison : refusé, une autre ville est demandée", async () => {
    proposer([VALENCE]);
    villes.choisirVille.mockResolvedValue({ statut: "pays_inconnu" });
    renderEssai();
    change("Destination", "Valence");
    fireEvent.click(await screen.findByRole("option", { name: /Valence/ }));
    await waitFor(() => expect(champ()).toHaveAccessibleDescription(expect.stringContaining("Ce pays n'est pas encore disponible")));
    expect(latest?.trip.placeId).toBe("");
  });

  it("cookie d'accès absent : saisie du code (titre de niveau 2) hors du formulaire, puis la recherche reprend", async () => {
    villes.suggererVilles.mockResolvedValueOnce({ statut: "acces" });
    const { container } = renderEssai();
    change("Destination", "Valen");
    const titre = await screen.findByRole("heading", { level: 2, name: "Code d'accès du site d'essai" });
    expect(screen.getByText("Pour chercher ta ville, saisis d'abord le code d'accès du site d'essai.")).toBeInTheDocument();
    // Pas de formulaires imbriqués : la saisie du code n'est pas dans le formulaire de l'écran 1.
    expect(titre.closest("form")?.querySelector("button[type=submit]")?.textContent).not.toBe("Continuer");
    expect(container.querySelectorAll("form form")).toHaveLength(0);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("recherche indisponible (repli) : une ville de la table est admise sans choix ; hors de la table, message « réessaie »", async () => {
    const { container } = renderEssai();
    change("Destination", "Hoi An");
    expect(await screen.findByText("La recherche des villes ne répond pas pour le moment. Réessaie dans un instant.")).toBeInTheDocument();
    dates();
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    // Un seul message (mineur 14) : l'erreur du champ reprend le texte de la recherche, la région d'état se tait.
    expect(champ()).toHaveAccessibleDescription(expect.stringContaining("La recherche des villes ne répond pas pour le moment. Réessaie dans un instant."));
    expect(screen.getAllByText("La recherche des villes ne répond pas pour le moment. Réessaie dans un instant.")).toHaveLength(1);
    expect(router.push).not.toHaveBeenCalled();
    expect(await axeViolations(container)).toEqual([]);
    change("Destination", "Valencia");
    await waitFor(() => expect(villes.suggererVilles).toHaveBeenCalledTimes(2));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(router.push).toHaveBeenCalledWith("/voyages/nouveau/brief");
    expect(latest?.trip).toMatchObject({ destination: "Valencia", placeId: "" });
  });

  it("logement saisi : aide « pas d'adresse privée » reliée au champ (décision 0125 § 6) ; absente hors du site d'essai", () => {
    renderEssai();
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Oui" }));
    expect(screen.getByLabelText("Nom ou adresse du logement")).toHaveAccessibleDescription(expect.stringContaining("pas une adresse privée"));
    // Durée de conservation et données interdites (revue consolidée de #704, mineur Sécurité 4).
    expect(screen.getByLabelText("Nom ou adresse du logement")).toHaveAccessibleDescription(expect.stringMatching(/Google pour le placer sur la carte.*Nous le conservons 29 jours.*ni e-mail, ni numéro de téléphone/));
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
      // Champ de recherche de ville du site d'essai ; recherche indisponible (double) : ville hors table refusée.
      expect(screen.getByRole("combobox", { name: "Destination" })).toHaveAttribute("aria-invalid", "true");
      expect(router.push).not.toHaveBeenCalled();
    } finally {
      window.history.pushState({}, "", "/");
    }
  });

  it("plus de 15 jours : refus au départ ; Rome sur 15 jours : écran 2", () => {
    renderEssai();
    remplir("Rome", "2026-09-13");
    // Le calendrier du départ s'arrête au 15e jour ; la saisie au clavier reste refusée par la validation.
    expect(screen.getByLabelText("Départ", { exact: true })).toHaveAttribute("max", "2026-09-12");
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

  it("calendriers bornés : arrivée dès aujourd'hui, départ dès le lendemain de l'arrivée, durée annoncée", async () => {
    const { container } = renderForm();
    const arrivee = screen.getByLabelText("Arrivée", { exact: true });
    const depart = screen.getByLabelText("Départ", { exact: true });
    const duree = container.querySelector("[data-part='duree']")!;
    // Région live rendue dès l'affichage, vide tant que les deux dates ne sont pas cohérentes (0018 § 14).
    expect(duree).toHaveAttribute("aria-live", "polite");
    expect(duree).toBeEmptyDOMElement();
    expect(arrivee).toHaveAttribute("min", "2026-08-01");
    expect(depart).toHaveAttribute("min", "2026-08-02");
    expect(depart).not.toHaveAttribute("max");
    change("Arrivée", "2026-08-29");
    expect(depart).toHaveAttribute("min", "2026-08-30");
    change("Départ", "2026-08-30");
    expect(duree).toHaveTextContent(/^1 nuit$/);
    change("Départ", "2026-09-03");
    expect(duree).toHaveTextContent(/^5 nuits$/);
    expect(await axeViolations(container)).toEqual([]);
    // Arrivée déplacée après le départ : le départ saisi n'est jamais effacé, « Continuer » le refuse.
    change("Arrivée", "2026-09-10");
    expect(depart).toHaveValue("2026-09-03");
    expect(depart).toHaveAttribute("min", "2026-09-11");
    expect(duree).toBeEmptyDOMElement();
    change("Destination", "Édimbourg");
    fireEvent.click(within(lodging()).getByRole("radio", { name: "Pas encore" }));
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(depart).toHaveAttribute("aria-invalid", "true");
    expect(router.push).not.toHaveBeenCalled();
  });

  it("calendriers bornés : autres villes et engagements dans les dates du voyage", () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Ajouter une ville" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter un engagement" }));
    const ville = () => document.getElementById(fieldId("otherCities.0.arrival"));
    const engagement = () => document.getElementById(fieldId("commitments.0.date"));
    expect(ville()).toHaveAttribute("min", "2026-08-02");
    expect(engagement()).toHaveAttribute("min", "2026-08-01");
    change("Arrivée", "2026-08-29");
    expect(ville()).toHaveAttribute("min", "2026-08-30");
    expect(ville()).not.toHaveAttribute("max");
    expect(engagement()).toHaveAttribute("min", "2026-08-29");
    change("Départ", "2026-09-03");
    expect(ville()).toHaveAttribute("max", "2026-09-02");
    expect(engagement()).toHaveAttribute("max", "2026-09-03");
  });
});
