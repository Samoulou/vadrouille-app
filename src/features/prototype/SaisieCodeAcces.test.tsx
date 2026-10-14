import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import * as messages from "@/i18n/messages";
import { saisirCodeAccesP0, type EtatSaisieCodeP0 } from "@/server/actions/p0-acces";

import { SaisieCodeAcces } from "./SaisieCodeAcces";

vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

/**
 * Formulaire de saisie du code d'accès du mode réel (P0r3b ; décision 0055, section 2 points 3 et 5) : un seul envoi
 * à la fois (chaque envoi consomme un essai de l'heure), régions live présentes dès l'affichage, focus déplacé.
 */

const t = messages.prototype.acces;
const action = vi.mocked(saisirCodeAccesP0);

/** Réponse de l'action tenue en attente jusqu'à `repondre`. */
function reponseDifferee() {
  let repondre: (etat: EtatSaisieCodeP0) => void = () => undefined;
  const promesse = new Promise<EtatSaisieCodeP0>((resolve) => {
    repondre = resolve;
  });
  return { promesse, repondre: (etat: EtatSaisieCodeP0) => repondre(etat) };
}

const champ = () => screen.getByLabelText(t.libelle);
const formulaire = () => champ().closest("form") as HTMLFormElement;

beforeEach(() => {
  action.mockReset();
});

describe("p0: formulaire de saisie du code d'accès", () => {
  it("régions status et alert présentes et vides dès l'affichage", () => {
    render(<SaisieCodeAcces ouverte={false} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("alert")).toBeEmptyDOMElement();
    expect(champ()).not.toHaveAttribute("aria-invalid");
    expect(champ()).not.toHaveAttribute("aria-describedby");
  });

  it("double envoi : une seule action, même après la réponse, bouton aria-disabled libellé « Vérification… » pendant l'envoi", async () => {
    const reponse = reponseDifferee();
    action.mockReturnValue(reponse.promesse);
    render(<SaisieCodeAcces ouverte={false} />);
    fireEvent.change(champ(), { target: { value: "code" } });
    await act(async () => {
      fireEvent.submit(formulaire());
      fireEvent.submit(formulaire());
    });
    const bouton = screen.getByRole("button", { name: t.verification });
    expect(bouton).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.submit(formulaire());
    });
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => {
      reponse.repondre({ statut: "invalid_code" });
      await reponse.promesse;
    });
    // useActionState met en file les envois suivants : ignorés à l'envoi, ils ne partent pas non plus après la réponse.
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: t.valider })).not.toHaveAttribute("aria-disabled");
  });

  it("refus : erreur reliée au champ (aria-invalid, aria-describedby) et focus rendu au champ ; nouvel envoi possible", async () => {
    action.mockResolvedValue({ statut: "invalid_code" });
    render(<SaisieCodeAcces ouverte={false} />);
    await act(async () => {
      fireEvent.submit(formulaire());
    });
    const alerte = screen.getByRole("alert");
    expect(alerte).toHaveTextContent(t.erreurs.invalid_code);
    expect(champ()).toHaveAttribute("aria-invalid", "true");
    expect(champ()).toHaveAttribute("aria-describedby", alerte.id);
    expect(champ()).toHaveFocus();
    await act(async () => {
      fireEvent.submit(formulaire());
    });
    expect(action).toHaveBeenCalledTimes(2);
  });

  it("acceptation : confirmation écrite dans la région status déjà présente, focus sur le titre", async () => {
    action.mockResolvedValue({ statut: "accepte" });
    render(<SaisieCodeAcces ouverte={false} />);
    const region = screen.getByRole("status");
    await act(async () => {
      fireEvent.submit(formulaire());
    });
    expect(screen.getByRole("status")).toBe(region);
    expect(region).toHaveTextContent(t.ouverte);
    expect(screen.getByRole("heading", { level: 1, name: t.titre })).toHaveFocus();
    expect(screen.queryByLabelText(t.libelle)).toBeNull();
  });
});
