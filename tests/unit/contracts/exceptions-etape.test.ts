// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ExceptionSchema, SHARED_EXCEPTIONS } from "@/contracts";

import { SNAPSHOT_STOP_EXCEPTIONS } from "../../../db/jsonb-keys";

/**
 * Exceptions d'une étape (ticket 1019, question 4 de la PR M6a) : le contrat (`ExceptionSchema`) a trois valeurs, la
 * base n'en garde que deux. L'écart est voulu (décision 0011, point 5) : `toConfirm`, tirée des horaires Google, n'est
 * jamais stockée et n'existe qu'après une lecture qui la recalcule. Ce test fige cet alignement ; la preuve sur la base
 * réelle (écrite sans `toConfirm`, relue avec) est `lecture: une étape « À confirmer » créée sur api…` de
 * `tests/db/adaptateur-api.test.ts`.
 */
describe("exceptions d'une étape : contrat et base alignés (ticket 1019)", () => {
  it("le contrat = les valeurs stockées + toConfirm, seule valeur calculée à la lecture", () => {
    expect([...ExceptionSchema.options].sort()).toEqual([...SNAPSHOT_STOP_EXCEPTIONS, "toConfirm"].sort());
    expect(SNAPSHOT_STOP_EXCEPTIONS).not.toContain("toConfirm");
  });

  it("vue partagée : sur l'instantané stocké, seule unconfirmed peut passer ; toConfirm vient d'une lecture", () => {
    expect(SHARED_EXCEPTIONS.filter((e) => (SNAPSHOT_STOP_EXCEPTIONS as readonly string[]).includes(e))).toEqual(["unconfirmed"]);
    expect(SHARED_EXCEPTIONS.filter((e) => !(SNAPSHOT_STOP_EXCEPTIONS as readonly string[]).includes(e))).toEqual(["toConfirm"]);
  });
});
