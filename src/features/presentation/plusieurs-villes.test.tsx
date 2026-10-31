import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { createMemoryRecorder } from "@/analytics/track";
import type { Proposal } from "@/contracts";
import { edimbourg, propositions } from "@/mocks/edimbourg";
import { propositionsRomeFlorence, romeFlorence } from "@/mocks/rome-florence";

import { axeViolations } from "../../../tests/unit/axe";

import { presentationDay } from "./load";
import { PresentationScreen, villeDeLaCarte } from "./PresentationScreen";

vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));

const DAYS = romeFlorence.days.map(presentationDay);

function renderCarte(proposal: Proposal) {
  return render(
    <PresentationScreen
      tripId={romeFlorence.id}
      unlocked
      generatingDays={[]}
      proposals={[proposal]}
      days={DAYS}
      cities={romeFlorence.cities}
      recorder={createMemoryRecorder()}
    />,
  );
}

const carte = () => document.querySelector<HTMLButtonElement>("[data-part='carte']")!;
const proposition = (id: string) => propositionsRomeFlorence.find((candidate) => candidate.id === id)!;

/** Critère 14, partie écran (spécification M4 § 7.3) ; critère 25 pour une seule ville. */
describe("Présentation: plusieurs villes", () => {
  it("chaque carte affiche « Jour {n} · {ville} », dans sa description", async () => {
    const { container } = renderCarte(proposition("prop-rf-j1-forum"));
    const ville = carte().querySelector("[data-part='ville']")!;
    expect(ville).toHaveTextContent(/^Jour 1 · Rome$/);
    expect(ville).toHaveClass("break-words");
    expect(carte().getAttribute("aria-describedby")?.split(" ")).toContain(ville.id);
    expect(await axeViolations(container)).toEqual([]);
  });

  it("6b, jour du changement de ville : la carte du matin (Rome) et celle de l'après-midi (Florence) affichent « Jour 3 · De Rome à Florence »", () => {
    for (const id of ["prop-rf-j3-matin", "prop-rf-j3-apres-midi"]) {
      const { unmount } = renderCarte(proposition(id));
      expect(carte().querySelector("[data-part='ville']")).toHaveTextContent(/^Jour 3 · De Rome à Florence$/);
      unmount();
    }
  });

  it("6b : la première carte après la ligne « Vers {ville} » n'a ni trajet ni détour", () => {
    renderCarte(proposition("prop-rf-j3-apres-midi"));
    expect(carte().querySelector("[data-part='trajet']")).toBeNull();
    expect(carte().textContent).not.toMatch(/détour/i);
  });

  it("villeDeLaCarte : « Jour 2 · Rome », « Jour 3 · De Rome à Florence », rien pour une seule ville", () => {
    expect(villeDeLaCarte(romeFlorence.cities, 2)).toBe("Jour 2 · Rome");
    expect(villeDeLaCarte(romeFlorence.cities, 3)).toBe("Jour 3 · De Rome à Florence");
    expect(villeDeLaCarte(romeFlorence.cities, 4)).toBe("Jour 4 · Florence");
    expect(villeDeLaCarte(undefined, 2)).toBeNull();
  });

  it("une seule ville (Édimbourg) : aucune carte ne nomme de ville", () => {
    render(
      <PresentationScreen
        tripId={edimbourg.id}
        unlocked={false}
        generatingDays={[]}
        proposals={propositions}
        days={edimbourg.days.map(presentationDay)}
        recorder={createMemoryRecorder()}
      />,
    );
    expect(carte().querySelector("[data-part='ville']")).toBeNull();
  });
});
