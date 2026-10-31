import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { axeViolations } from "../../../tests/unit/axe";

import { CreateTripForm } from "./CreateTripForm";
import { DraftProvider } from "./DraftProvider";

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/server/actions/villes-essai", () => ({ suggererVilles: vi.fn(), choisirVille: vi.fn() }));
vi.mock("@/server/actions/villes", () => ({ suggererVillesApi: vi.fn(), choisirVilleApi: vi.fn() }));
vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

/**
 * Spécification M4-suite § 4.2 et § 6, critère 13 (décision UX-M4S-C) : aide sous le « Billet » qui deviendra le changement
 * de ville, à l'écran 1. Rome du 2027-05-04 au 2027-05-08, puis Florence à partir du 2027-05-06.
 */

const AIDE_BILLET =
  "Pour changer de ville, ajoute ton billet ou ton vol dans Déjà réservé, avec ses heures. Ce jour-là, un billet compte comme ton transport : pour un concert ou une visite, choisis Sortie. Les trains de nuit ne sont pas encore pris en compte.";
const aide = (ville: string) => `Ce jour-là, tu changes de ville : ce billet sera ton transport vers ${ville}.`;

const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label, { exact: true }), { target: { value } });
const all = (label: string) => screen.getAllByLabelText(label, { exact: true });
const kinds = () => screen.getAllByRole("radiogroup", { name: "Type de réservation" });
const aides = () => screen.queryAllByText(/^Ce jour-là, tu changes de ville/);

function renderForm() {
  return render(
    <DraftProvider>
      <CreateTripForm />
    </DraftProvider>,
  );
}

function addCity(name: string, arrival: string) {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une ville" }));
  fireEvent.change(all("Nom de la ville").at(-1)!, { target: { value: name } });
  fireEvent.change(all("Arrivée dans cette ville").at(-1)!, { target: { value: arrival } });
}

/** Rome, puis les autres villes ; logement « Pas encore » pour chacune. */
function fillTrip(others: { name: string; arrival: string }[] = [{ name: "Florence", arrival: "2027-05-06" }]) {
  change("Destination", "Rome");
  change("Arrivée", "2027-05-04");
  change("Départ", "2027-05-08");
  for (const ville of others) addCity(ville.name, ville.arrival);
  for (const group of screen.getAllByRole("radiogroup", { name: "As-tu déjà un logement ?" })) {
    fireEvent.click(within(group).getByRole("radio", { name: "Pas encore" }));
  }
}

type Kind = "Billet" | "Vol" | "Sortie";
/** Ajoute une réservation : type, libellé, date et heure de début (laissée vide si absente). */
function addCommitment(kind: Kind, date: string, start?: string) {
  fireEvent.click(screen.getByRole("button", { name: "Ajouter une réservation" }));
  const index = kinds().length - 1;
  fireEvent.click(within(kinds()[index]!).getByRole("radio", { name: kind }));
  fireEvent.change(all("Libellé")[index]!, { target: { value: `${kind} ${index + 1}` } });
  fireEvent.change(all("Date")[index]!, { target: { value: date } });
  if (start !== undefined) fireEvent.change(all("Heure de début")[index]!, { target: { value: start } });
}

/** Rangs des sélecteurs « Type de réservation » qui portent l'aide de changement de ville. */
const avecAide = () =>
  kinds().flatMap((kind, index) => (kind.getAttribute("aria-describedby")?.includes("aide-changement") ? [index] : []));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2027, 3, 1, 8, 0));
  router.push.mockClear();
});

describe("M4-suite: aide du billet de changement de ville", () => {
  it("un « Billet » du 2027-05-06 : aide du § 6, corps-s ink-soft, sans icône ; reliée au sélecteur après l'aide générale ; axe sans violation", async () => {
    const { container } = renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06", "09:00");
    const texte = aides()[0]!;
    // Texte exact, espace insécable avant le deux-points compris (§ 6).
    expect(texte.textContent).toBe(aide("Florence"));
    expect(texte.tagName).toBe("P");
    expect(texte).toHaveClass("text-corps-s", "text-ink-soft");
    expect(texte.className).not.toMatch(/quai/);
    expect(texte.querySelector("svg")).toBeNull();
    expect(texte.closest("[data-kind]")).toBeNull();
    const kind = kinds()[0]!;
    expect(kind.getAttribute("aria-describedby")!.split(" ")).toEqual(["villes-aide-billet", texte.id]);
    expect(kind).toHaveAccessibleDescription(`${AIDE_BILLET} ${aide("Florence")}`);
    // Le texte suit le sélecteur, dans le bloc du type de réservation.
    expect(kind.nextElementSibling).toBe(texte);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("ni un « Billet » du 2027-05-05, ni une « Sortie », ni un « Vol » du 2027-05-06", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-05", "09:00");
    addCommitment("Sortie", "2027-05-06", "09:00");
    expect(aides()).toHaveLength(0);
    expect(avecAide()).toEqual([]);
    for (const kind of kinds()) expect(kind).toHaveAccessibleDescription(AIDE_BILLET);
  });

  it("un « Vol » du 2027-05-06 n'a pas d'aide", () => {
    renderForm();
    fillTrip();
    addCommitment("Vol", "2027-05-06", "09:00");
    expect(aides()).toHaveLength(0);
  });

  it("deux « Billet » à 09:00 et à 15:00 : seul celui de 09:00", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06", "15:00");
    addCommitment("Billet", "2027-05-06", "09:00");
    expect(aides()).toHaveLength(1);
    expect(avecAide()).toEqual([1]);
  });

  it("deux « Billet » à 09:00 : seul le premier saisi", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06", "09:00");
    addCommitment("Billet", "2027-05-06", "09:00");
    expect(avecAide()).toEqual([0]);
  });

  it("un « Vol » à 08:00 puis un « Billet » à 15:00 : aucune aide", () => {
    renderForm();
    fillTrip();
    addCommitment("Vol", "2027-05-06", "08:00");
    addCommitment("Billet", "2027-05-06", "15:00");
    expect(aides()).toHaveLength(0);
  });

  it("un « Billet » sans heure de début et un « Billet » à 15:00 : seul celui de 15:00", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06");
    addCommitment("Billet", "2027-05-06", "15:00");
    expect(avecAide()).toEqual([1]);
  });

  it("Rome, Florence puis Venise à partir du 2027-05-08 : un « Billet » du 2027-05-08 nomme Venise", () => {
    renderForm();
    fillTrip([
      { name: "Florence", arrival: "2027-05-06" },
      { name: "Venise", arrival: "2027-05-08" },
    ]);
    addCommitment("Billet", "2027-05-08", "10:00");
    expect(aides().map((texte) => texte.textContent)).toEqual([aide("Venise")]);
  });

  it("type passé à « Sortie », date changée ou Florence retirée : l'aide et son lien disparaissent ; le focus ne bouge pas", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06", "09:00");
    expect(aides()).toHaveLength(1);

    const sortie = within(kinds()[0]!).getByRole("radio", { name: "Sortie" });
    fireEvent.click(sortie);
    expect(aides()).toHaveLength(0);
    expect(kinds()[0]!.getAttribute("aria-describedby")).toBe("villes-aide-billet");
    fireEvent.click(within(kinds()[0]!).getByRole("radio", { name: "Billet" }));
    expect(aides()).toHaveLength(1);

    const date = all("Date")[0]!;
    date.focus();
    fireEvent.change(date, { target: { value: "2027-05-07" } });
    expect(aides()).toHaveLength(0);
    expect(document.activeElement).toBe(date);
    fireEvent.change(date, { target: { value: "2027-05-06" } });
    expect(aides()).toHaveLength(1);
    expect(document.activeElement).toBe(date);

    fireEvent.click(screen.getByRole("button", { name: "Retirer Florence" }));
    expect(aides()).toHaveLength(0);
    expect(kinds()[0]!).not.toHaveAttribute("aria-describedby");
  });

  it("avec une seule ville, l'aide n'apparaît jamais", () => {
    renderForm();
    fillTrip([]);
    addCommitment("Billet", "2027-05-06", "09:00");
    expect(aides()).toHaveLength(0);
  });

  it("l'aide n'empêche pas l'envoi", () => {
    renderForm();
    fillTrip();
    addCommitment("Billet", "2027-05-06", "09:00");
    change("Heure de fin (facultatif)", "10:30");
    expect(aides()).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Continuer" }));
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(router.push).toHaveBeenCalledTimes(1);
  });
});
