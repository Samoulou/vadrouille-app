// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { TransferItem } from "@/contracts";
import { romeFlorence } from "@/mocks/rome-florence";

import { detailDuChangement, texteDuChangement } from "./changement-de-ville";
import { villeDeLaPastille } from "./pastille-ville";

const saisi: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "15:05", end: "16:40", label: "Train Rome–Florence" };
const estime: TransferItem = { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "10:00", estimatedMinutes: 90, mode: "transit" };

/** Textes de la ligne « Vers {ville} » (spécification M4 § 3.3 et § 8 ; critères 7, 8 et 11 côté écran). */
describe("Journée: ligne « Vers {ville} », textes", () => {
  it("billet saisi avec arrivée : « Train Rome–Florence, 15:05 – 16:40 », sans « (estimation) », heure du départ en colonne", () => {
    const texte = texteDuChangement(saisi);
    expect(texte).toEqual({
      title: "Vers Florence",
      detail: "Train Rome–Florence, 15:05 – 16:40",
      name: "Vers Florence, Train Rome–Florence, 15:05 – 16:40",
      time: "15:05",
    });
    expect(texte.detail).not.toContain("estimation");
  });

  it("billet saisi sans heure de fin : « Train Rome–Florence, départ à 15:05, arrivée à confirmer »", () => {
    const sansFin: TransferItem = { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "15:05", label: "Train Rome–Florence" };
    expect(detailDuChangement(sansFin)).toBe("Train Rome–Florence, départ à 15:05, arrivée à confirmer");
  });

  it("départ estimé : toujours « départ vers {heure} (estimation) », puis la durée estimée ou « durée à confirmer »", () => {
    expect(detailDuChangement(estime)).toBe("En train ou en bus, départ vers 10:00 (estimation), environ 1 h 30 (estimation)");
    const sansDuree: TransferItem = { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "10:00", mode: "transit" };
    expect(detailDuChangement(sansDuree)).toBe("En train ou en bus, départ vers 10:00 (estimation), durée à confirmer");
    expect(detailDuChangement({ ...estime, mode: "car", estimatedMinutes: 45 })).toBe("En voiture, départ vers 10:00 (estimation), environ 45 min (estimation)");
    const aPied: TransferItem = { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "10:00", estimatedMinutes: 90 };
    expect(detailDuChangement(aPied)).toBe("Départ vers 10:00 (estimation), environ 1 h 30 (estimation)");
    const aPiedSansDuree: TransferItem = { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "10:00" };
    expect(detailDuChangement(aPiedSansDuree)).toBe("Départ vers 10:00 (estimation), durée à confirmer");
    // Aucune heure de départ estimée en colonne : elle n'est jamais affichée sans « vers » ni « (estimation) ».
    expect(texteDuChangement(estime).time).toBeUndefined();
  });

  it("le mot « trajet » n'apparaît dans aucun texte du changement de ville (M4-PO-11)", () => {
    for (const item of [saisi, estime]) expect(JSON.stringify(texteDuChangement(item))).not.toMatch(/trajet/i);
  });

  it("pastille de la Journée : ville seulement le jour du changement de ville, rien pour une seule ville", () => {
    expect(villeDeLaPastille(romeFlorence.cities, "2027-04-12")).toEqual({ ville: "de Rome à Florence" });
    expect(villeDeLaPastille(romeFlorence.cities, "2027-04-11")).toEqual({});
    expect(villeDeLaPastille(undefined, "2027-04-12")).toEqual({});
  });
});
