// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { GardeOuverte, GardeRelecture } from "@/server/p0/garde";

/**
 * `GardeOuverte` infalsifiable sans conversion (décision 0055, section 1 point 2 et section 3 point 1 ; revue du head
 * 6be9299, bloquant 1) : la marque est un `unique symbol` non exporté de `src/server/p0/garde.ts`. Les lignes
 * `@ts-expect-error` sont vérifiées par `pnpm typecheck` (tsconfig : `tests/**`) : si un littéral devenait une
 * `GardeOuverte`, la directive serait inutilisée et la vérification des types échouerait.
 */

describe("p0: GardeOuverte infalsifiable par un littéral", () => {
  it("ni { runId }, ni l'ancienne marque textuelle, ni une clé symbole quelconque ne sont une GardeOuverte", () => {
    // @ts-expect-error littéral sans marque
    const sansMarque: GardeOuverte = { runId: "00000000-0000-4000-8000-000000000000" };
    // @ts-expect-error ancienne marque textuelle (head 6be9299) : refusée sans `as`
    const marqueTexte: GardeOuverte = { runId: "00000000-0000-4000-8000-000000000000", __brand: "GardeOuverte" };
    // @ts-expect-error un autre symbole n'est pas la marque (non exportée) de garde.ts
    const autreSymbole: GardeOuverte = { runId: "00000000-0000-4000-8000-000000000000", [Symbol("marque")]: true };
    const recu = (garde: GardeOuverte) => garde.runId;
    // @ts-expect-error passage direct d'un littéral à une fonction qui exige la preuve
    recu({ runId: "00000000-0000-4000-8000-000000000000", __brand: "GardeOuverte" });
    // À l'exécution, ces objets n'ont que les clés écrites : la marque n'existe qu'au niveau des types.
    expect([sansMarque, marqueTexte, autreSymbole].map((o) => Object.keys(o))).toEqual([["runId"], ["runId", "__brand"], ["runId"]]);
  });
});

/**
 * `GardeRelecture` (P0r4, décision 0079 ; bloquant 3 de la revue du head `e79fbed`) : même marque, aussi infalsifiable
 * par un littéral, et **jamais confondue** avec `GardeOuverte` : une preuve de relecture n'ouvre pas une exécution, et
 * une preuve d'exécution n'ouvre pas une relecture.
 */
describe("p0: GardeRelecture infalsifiable et distincte de GardeOuverte", () => {
  it("ni { relecture: true }, ni une marque textuelle, ni une clé symbole quelconque ne sont une GardeRelecture", () => {
    // @ts-expect-error littéral sans marque
    const sansMarque: GardeRelecture = { relecture: true };
    // @ts-expect-error marque textuelle : refusée sans `as`
    const marqueTexte: GardeRelecture = { relecture: true, __brand: "GardeRelecture" };
    // @ts-expect-error un autre symbole n'est pas la marque (non exportée) de garde.ts
    const autreSymbole: GardeRelecture = { relecture: true, [Symbol("marque")]: true };
    const recu = (garde: GardeRelecture) => garde.relecture;
    // @ts-expect-error passage direct d'un littéral à une fonction qui exige la preuve
    recu({ relecture: true });
    expect([sansMarque, marqueTexte, autreSymbole].map((o) => Object.keys(o))).toEqual([["relecture"], ["relecture", "__brand"], ["relecture"]]);
  });

  it("non-confusion : une GardeRelecture n'est pas une GardeOuverte, ni l'inverse (types)", () => {
    const exigeExecution = (garde: GardeOuverte) => garde.runId;
    const exigeRelecture = (garde: GardeRelecture) => garde.relecture;
    const verifier = (relecture: GardeRelecture, ouverte: GardeOuverte) => {
      // @ts-expect-error une preuve de relecture n'a pas d'exécution
      exigeExecution(relecture);
      // @ts-expect-error une preuve d'exécution n'ouvre pas une relecture
      exigeRelecture(ouverte);
    };
    expect(typeof verifier).toBe("function");
  });
});
