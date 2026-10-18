// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CandidatExtraitSchema } from "@/ai/sorties";
import { creneauCompte, creneauDe } from "@/research/agent";

/**
 * Ticket 483 (essai rome-1 du 2026-10-18) : les cibles de l'agent se comptent comme la planification remplit ses
 * créneaux. La soirée prend une activité qui convient au soir (`slotFit`), jamais un événement (rangé dans les
 * événements du jour).
 */
describe("p0: créneau compté par l'agent de recherche (ticket 483)", () => {
  it("repas en repas ; événement dans aucun créneau ; activité sans slotFit en activité", () => {
    expect(creneauCompte({ typeEtape: "meal", slotFit: ["evening"] }, true)).toBe("meal");
    expect(creneauCompte({ typeEtape: "event" }, true)).toBeUndefined();
    expect(creneauCompte({ typeEtape: "event", slotFit: ["evening"] }, true)).toBeUndefined();
    expect(creneauCompte({ typeEtape: "activity" }, true)).toBe("activity");
  });

  it("activité du soir : en soirée tant que la soirée manque ; ensuite en activité si elle convient aussi le jour", () => {
    expect(creneauCompte({ typeEtape: "activity", slotFit: ["activity", "evening"] }, true)).toBe("evening");
    expect(creneauCompte({ typeEtape: "activity", slotFit: ["activity", "evening"] }, false)).toBe("activity");
    expect(creneauCompte({ typeEtape: "activity", slotFit: ["evening"] }, false)).toBe("evening");
    expect(creneauCompte({ typeEtape: "activity", slotFit: ["activity"] }, true)).toBe("activity");
  });

  it("mesures de evals/ inchangées : creneauDe classe encore par type d'étape", () => {
    expect([creneauDe("activity"), creneauDe("meal"), creneauDe("event")]).toEqual(["activity", "meal", "evening"]);
  });

  it("slotFit du modèle de recherche : facultatif, forme de la notation ; mal formé, ignoré sans écarter le lieu", () => {
    const base = {
      nom: "Lieu maison",
      resume: "Résumé maison.",
      categorie: "walk",
      typeEtape: "activity",
      sourceUrl: "https://guide.example/page",
      sourceDate: "2026-09-01",
      aReserver: false,
    };
    expect(CandidatExtraitSchema.safeParse(base).data?.slotFit).toBeUndefined();
    expect(CandidatExtraitSchema.safeParse({ ...base, slotFit: ["activity", "evening"] }).data?.slotFit).toEqual(["activity", "evening"]);
    for (const slotFit of [[], ["evening", "evening"], ["night"], "evening"]) {
      const lu = CandidatExtraitSchema.safeParse({ ...base, slotFit });
      expect(lu.success, JSON.stringify(slotFit)).toBe(true);
      expect(lu.data?.slotFit, JSON.stringify(slotFit)).toBeUndefined();
    }
  });
});
