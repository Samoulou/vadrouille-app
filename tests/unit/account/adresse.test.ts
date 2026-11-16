// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { creerLectureAdresse } from "@/server/account/adresse";
import type { ExecuteurExport, TransactionExport } from "@/server/account/export";

/**
 * Adresse de la session pour « Ton compte » (M9c, ticket 1122 ; spécification M9 § 6.4, critère 1), sur une transaction
 * injectée : aucune base. La transaction réelle est celle de l'export (`transactionExportSur(withOrg)`), couverte par
 * `tests/db/export-compte.test.ts`.
 */

const CTX = { organizationId: "0d000000-0000-4000-8000-0000000000a1", userId: "0d000000-0000-4000-8000-0000000000b1" };

function banc(lignes: Record<string, unknown>[]) {
  const query = vi.fn<ExecuteurExport["query"]>(async () => ({ rows: lignes }));
  const contextes: unknown[] = [];
  const transaction: TransactionExport = (ctx, fn) => {
    contextes.push(ctx);
    return fn({ query });
  };
  return { query, contextes, lire: creerLectureAdresse(transaction) };
}

describe("creerLectureAdresse", () => {
  it("une seule requête, dans la transaction du contexte, liée à la personne de la session seulement", async () => {
    const { query, contextes, lire } = banc([{ email: "samuel@exemple.test" }]);
    expect(await lire(CTX)).toBe("samuel@exemple.test");
    expect(contextes).toEqual([CTX]);
    expect(query).toHaveBeenCalledExactlyOnceWith("SELECT email FROM users WHERE id = $1", [CTX.userId]);
  });

  it.each([
    ["aucune ligne", []],
    ["deux lignes", [{ email: "a@exemple.test" }, { email: "b@exemple.test" }]],
    ["adresse vide", [{ email: "" }]],
    ["adresse d'un autre type", [{ email: 12 }]],
  ])("%s : null", async (_cas, lignes) => {
    expect(await banc(lignes).lire(CTX)).toBeNull();
  });

  it("une erreur de la base est relancée à l'appelant (l'action rend null)", async () => {
    const transaction: TransactionExport = async () => {
      throw new Error("base");
    };
    await expect(creerLectureAdresse(transaction)(CTX)).rejects.toThrow("base");
  });
});
