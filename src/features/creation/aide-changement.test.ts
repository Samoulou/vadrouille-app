import { describe, expect, it } from "vitest";

import { aidesDeChangement } from "./aide-changement";
import type { CityForm, CommitmentForm } from "./draft";

/** Spécification M4-suite § 4.2, critère 13 : Rome du 2027-05-04 au 2027-05-08, puis Florence à partir du 2027-05-06. */

const ville = (name: string, arrival: string): CityForm => ({ key: name, name, arrival, lodging: { answer: "none", label: "" } });
let serie = 0;
const engagement = (kind: CommitmentForm["kind"], date: string, start = "", end = ""): CommitmentForm => {
  serie += 1;
  return { key: `e${serie}`, kind, label: "", date, start, end };
};
const FLORENCE = [ville("Florence", "2027-05-06")];
const aides = (otherCities: CityForm[], commitments: CommitmentForm[]) => Object.fromEntries(aidesDeChangement({ otherCities, commitments }));

describe("M4-suite: aide du billet de changement de ville (fonction de l'écran 1)", () => {
  it("un « Billet » daté de l'arrivée de Florence a l'aide qui nomme Florence", () => {
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06", "09:00")])).toEqual({ 0: "Florence" });
  });

  it("ni un « Billet » de la veille, ni une « Sortie », ni un « Vol » du jour", () => {
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-05", "09:00")])).toEqual({});
    expect(aides(FLORENCE, [engagement("booking", "2027-05-06", "09:00")])).toEqual({});
    expect(aides(FLORENCE, [engagement("flight", "2027-05-06", "09:00")])).toEqual({});
    expect(aides(FLORENCE, [engagement(null, "2027-05-06", "09:00")])).toEqual({});
  });

  it("deux « Billet » à 09:00 et à 15:00 : seul celui de 09:00 ; saisis dans l'autre ordre, toujours celui de 09:00", () => {
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06", "09:00"), engagement("ticket", "2027-05-06", "15:00")])).toEqual({ 0: "Florence" });
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06", "15:00"), engagement("ticket", "2027-05-06", "09:00")])).toEqual({ 1: "Florence" });
  });

  it("deux « Billet » à 09:00 : seul le premier saisi", () => {
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06", "09:00"), engagement("ticket", "2027-05-06", "09:00")])).toEqual({ 0: "Florence" });
  });

  it("un « Vol » à 08:00 puis un « Billet » à 15:00 : aucune aide, le vol est le changement de ville", () => {
    expect(aides(FLORENCE, [engagement("flight", "2027-05-06", "08:00"), engagement("ticket", "2027-05-06", "15:00")])).toEqual({});
  });

  it("un « Billet » sans heure de début et un « Billet » à 15:00 : seul celui de 15:00 ; sans aucune heure, le premier saisi", () => {
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06"), engagement("ticket", "2027-05-06", "15:00")])).toEqual({ 1: "Florence" });
    expect(aides(FLORENCE, [engagement("ticket", "2027-05-06"), engagement("ticket", "2027-05-06")])).toEqual({ 0: "Florence" });
  });

  it("Rome, Florence puis Venise à partir du 2027-05-08 : un « Billet » du 2027-05-08 a l'aide qui nomme Venise", () => {
    const villes = [...FLORENCE, ville("Venise", "2027-05-08")];
    expect(aides(villes, [engagement("ticket", "2027-05-06", "10:00"), engagement("ticket", "2027-05-08", "10:00")])).toEqual({ 0: "Florence", 1: "Venise" });
  });

  it("une seule ville, ou une autre ville sans nom ou sans date : aucune aide", () => {
    const billet = [engagement("ticket", "2027-05-06", "09:00")];
    expect(aides([], billet)).toEqual({});
    expect(aides([ville(" ", "2027-05-06")], billet)).toEqual({});
    expect(aides([ville("Florence", "")], billet)).toEqual({});
  });
});
