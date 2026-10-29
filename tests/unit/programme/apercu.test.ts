import { describe, expect, it } from "vitest";

import * as domaine from "@/domain/apercu";
import * as lecture from "@/adapters/prototype-lecture";
import * as parcours from "@/adapters/prototype-parcours";
import * as reexport from "@/server/programme/apercu";

/**
 * Règles de l'aperçu écrites une seule fois (décision 0136 § 1.7, M1a-1) : les adaptateurs du site d'essai servent les
 * fonctions de `src/domain/apercu.ts` par la réexportation `src/server/programme/apercu.ts`, sans copie ; le paramètre
 * nouveau `retenir` de `selectionApercu` retient par défaut toutes les étapes (aucun changement pour le site d'essai).
 */
describe("apercu: règles partagées (décision 0136 § 1.7)", () => {
  it("apercu: fonctions du site d'essai = celles de src/domain/apercu.ts", () => {
    // Réexportation seule : mêmes objets, aucune enveloppe.
    expect(reexport.selectionApercu).toBe(domaine.selectionApercu);
    expect(reexport.etapeEnCase).toBe(domaine.etapeEnCase);
    expect(reexport.servisAvantDeblocage).toBe(domaine.servisAvantDeblocage);
    expect(reexport.avecBadgeSansLieu).toBe(domaine.avecBadgeSansLieu);
    expect(reexport.JOURS_APERCU).toBe(domaine.JOURS_APERCU);
    // Fonctions réexportées par les adaptateurs du prototype (`voyageNonDebloque` et `propositionsDesJours` y restent des
    // enveloppes, sur `servisAvantDeblocage` et `etapeEnCase`).
    expect(parcours.selectionApercu).toBe(reexport.selectionApercu);
    expect(parcours.JOURS_APERCU).toBe(reexport.JOURS_APERCU);
    expect(lecture.avecBadgeALaLecture).toBe(reexport.avecBadgeSansLieu);
  });

  /** Deux journées de 5 étapes, un engagement en J1, un trajet entre deux étapes ; une troisième journée. */
  const etape = (id: string, extra: Record<string, unknown> = {}) => ({ type: "stop", stop: { id, ...extra } });
  const jours = [
    { index: 2, items: [etape("j2-1"), { type: "segment" }, etape("j2-2"), etape("j2-3"), etape("j2-4"), etape("j2-5")] },
    { index: 3, items: [etape("j3-1")] },
    { index: 1, items: [{ type: "terminus" }, etape("j1-1"), etape("j1-c1", { commitment: "ticket" }), etape("j1-2"), { type: "free" }, etape("j1-3"), etape("j1-4"), etape("j1-5")] },
  ];

  it("apercu: retenir vaut « toutes » par défaut, et la sélection est celle du site d'essai", () => {
    const parDefaut = domaine.selectionApercu(jours);
    expect(parDefaut).toEqual(domaine.selectionApercu(jours, () => true));
    // J1 puis J2, ordre écrit, engagement exclu, 8 au plus ; J3 jamais lu.
    expect(parDefaut.etapes).toEqual(["j1-1", "j1-2", "j1-3", "j1-4", "j1-5", "j2-1", "j2-2", "j2-3"]);
    expect([...parDefaut.jours].sort()).toEqual([1, 2]);
    // Le prédicat n'est appelé que sur les étapes proposables (jamais sur un engagement).
    const vues: string[] = [];
    domaine.selectionApercu(jours, (e) => {
      vues.push(e.id);
      return true;
    });
    expect(vues).not.toContain("j1-c1");
  });
});
