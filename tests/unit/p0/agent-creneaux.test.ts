// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CandidatExtraitSchema } from "@/ai/sorties";
import { ciblesAtteintes, creneauCompte, creneauDe } from "@/research/agent";

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

  // Mineur 11 de la revue de la PR #490 (Sécurité) : fin de la boucle cohérente avec `creneauCompte`.
  it("fin de la boucle : cibles comptées comme creneauCompte ; des événements seuls ne servent jamais la soirée, seul le total les arrête", () => {
    const bornes = { ciblesParCreneau: { activity: 2, meal: 1, evening: 1 }, totalCandidats: 6 };
    // Comptage d'une suite de candidats admis, comme l'agent : la soirée manque tant que sa cible n'est pas atteinte.
    const compter = (suite: readonly { typeEtape: "activity" | "meal" | "event"; slotFit?: ("activity" | "meal" | "evening")[] }[]) => {
      const trouves = { activity: 0, meal: 0, evening: 0 };
      for (const candidat of suite) {
        const creneau = creneauCompte(candidat, trouves.evening < bornes.ciblesParCreneau.evening);
        if (creneau !== undefined) trouves[creneau] += 1;
      }
      return { trouves, servi: ciblesAtteintes(trouves, suite.length, bornes) };
    };
    const evenement = { typeEtape: "event" as const, slotFit: ["evening" as const] };
    expect(compter([evenement, evenement, evenement, evenement, evenement])).toEqual({ trouves: { activity: 0, meal: 0, evening: 0 }, servi: false });
    expect(compter(Array.from({ length: 6 }, () => evenement)).servi).toBe(true);
    // Une activité du soir sert la soirée ; la suivante, qui convient aussi le jour, compte en activité.
    const soir = { typeEtape: "activity" as const, slotFit: ["activity" as const, "evening" as const] };
    expect(compter([soir, soir, { typeEtape: "activity" }, { typeEtape: "meal" }])).toEqual({ trouves: { activity: 2, meal: 1, evening: 1 }, servi: true });
    expect(compter([{ typeEtape: "activity" }, { typeEtape: "activity" }, { typeEtape: "meal" }, evenement]).servi).toBe(false);
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
