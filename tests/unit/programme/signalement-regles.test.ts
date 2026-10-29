import { describe, expect, it } from "vitest";

import * as domaine from "@/domain/signalement";
import * as reexport from "@/server/programme/signalement";

/**
 * Règles du signalement écrites une seule fois (tâche M5c, ticket 904 ; décision 0147 § 1 point 4) : l'adaptateur `mock`
 * les lit par la réexportation `src/server/programme/signalement.ts` (frontière de 0048 § 1), sans copie.
 */
describe("signalement: règles partagées", () => {
  it("signalement: fonctions de l'adaptateur mock = celles de src/domain/signalement.ts", () => {
    expect(reexport.situerEtapeSignalee).toBe(domaine.situerEtapeSignalee);
    expect(reexport.etapeSignalable).toBe(domaine.etapeSignalable);
    expect(reexport.debutDuJourUtc).toBe(domaine.debutDuJourUtc);
  });
});
