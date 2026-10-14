// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { GardeOuverte } from "@/server/p0/garde";

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
