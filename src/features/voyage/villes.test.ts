// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { TripCity } from "@/contracts";

import { aPlusieursVilles, dateDuJour, texteDeVille, villeDeLaDate } from "./villes";
import { nuitsDeLaVille, rangDeVilleOuLOnDort } from "./villes-sejour";

const ROME_FLORENCE: TripCity[] = [
  { name: "Rome", start: "2027-05-04", end: "2027-05-06" },
  { name: "Florence", start: "2027-05-06", end: "2027-05-08" },
];
const RETOUR: TripCity[] = [
  { name: "Rome", start: "2027-05-04", end: "2027-05-06" },
  { name: "Florence", start: "2027-05-06", end: "2027-05-07" },
  { name: "Rome", start: "2027-05-07", end: "2027-05-09" },
];

/** Villes des écrans (spécification M4 § 7 ; décision 0148 § 6 point 3 : `villesDeLaDate` seule source). */
describe("plusieurs-villes: ville de chaque jour à l'écran", () => {
  it("une seule ville (Trip.cities absent) : aucune ville", () => {
    expect(aPlusieursVilles(undefined)).toBe(false);
    expect(villeDeLaDate(undefined, "2027-05-04")).toBeUndefined();
  });

  it("jour ordinaire, journée du changement de ville, dernier jour sous la dernière ville", () => {
    expect(villeDeLaDate(ROME_FLORENCE, dateDuJour(ROME_FLORENCE, 1))).toEqual({ ville: "Rome" });
    expect(villeDeLaDate(ROME_FLORENCE, dateDuJour(ROME_FLORENCE, 3))).toEqual({ de: "Rome", vers: "Florence" });
    expect(villeDeLaDate(ROME_FLORENCE, dateDuJour(ROME_FLORENCE, 5))).toEqual({ ville: "Florence" });
    expect(dateDuJour(ROME_FLORENCE, 3)).toBe("2027-05-06");
  });

  it("textes : « Rome », « De Rome à Florence »", () => {
    expect(texteDeVille({ ville: "Rome" }, "De {de} à {vers}")).toBe("Rome");
    expect(texteDeVille({ de: "Rome", vers: "Florence" }, "De {de} à {vers}")).toBe("De Rome à Florence");
  });

  it("Séjour range chaque jour sous la ville où l'on dort ; une ville qui revient garde son rang", () => {
    expect(["2027-05-04", "2027-05-05", "2027-05-06", "2027-05-07", "2027-05-08"].map((date) => rangDeVilleOuLOnDort(ROME_FLORENCE, date))).toEqual([0, 0, 1, 1, 1]);
    expect(["2027-05-06", "2027-05-07", "2027-05-09"].map((date) => rangDeVilleOuLOnDort(RETOUR, date))).toEqual([1, 2, 2]);
    expect(rangDeVilleOuLOnDort(ROME_FLORENCE, "2027-05-10")).toBeUndefined();
  });

  it("nuits par ville", () => {
    expect(ROME_FLORENCE.map(nuitsDeLaVille)).toEqual([2, 2]);
    expect(nuitsDeLaVille({ start: "2027-03-27", end: "2027-03-29" })).toBe(2);
  });
});
