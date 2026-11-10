import { describe, expect, it } from "vitest";

import * as domaine from "@/domain/signalement";
import { etapeSignalableSurFiche } from "@/features/sejour/signalement";
import { edimbourg } from "@/mocks/edimbourg";
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

  it("signalement: la règle de la fiche (navigateur) est celle du serveur, sur toutes les combinaisons et les étapes du jeu simulé", () => {
    const commitments = [undefined, { kind: "booking" }] as const;
    const auteurs = [undefined, "person"] as const;
    for (const commitment of commitments) {
      for (const addedBy of auteurs) {
        const stop = { id: "j1-1", ...(commitment === undefined ? {} : { commitment }), ...(addedBy === undefined ? {} : { addedBy }) } as Parameters<typeof domaine.etapeSignalable>[0];
        expect(etapeSignalableSurFiche(stop), JSON.stringify(stop)).toBe(domaine.etapeSignalable(stop));
      }
    }
    const etapes = edimbourg.days.flatMap((jour) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : [])));
    expect(etapes.some((stop) => !domaine.etapeSignalable(stop))).toBe(true);
    for (const stop of etapes) expect(etapeSignalableSurFiche(stop), stop.id).toBe(domaine.etapeSignalable(stop));
  });
});
