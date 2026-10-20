// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { SourceRelectures } from "@/domain/relectures";
import { choisirSourceRelectures, creerSourceLecture } from "@/server/composition/lecture";

import { voyageARelire } from "../../../tests/support/voyage-a-relire";

/** Seconde composition (B8b ; décision 0100 § 5) : sélection de la source et échec fermé sans plafonds. */

const REPLI: SourceRelectures = { pour: () => Promise.reject(new Error("repli")) };
const DEMANDE = { lieux: [{ placeId: "test_place_a", dates: ["2027-05-03"] }], trajets: [] };

describe("composition: source réelle seulement en local", () => {
  it("ci, préproduction, production ou source non demandée : le repli (le double)", () => {
    for (const env of [
      { VADROUILLE_ENV: "ci", RELECTURES_SOURCE: "google" },
      { VADROUILLE_ENV: "staging", RELECTURES_SOURCE: "google" },
      { VADROUILLE_ENV: "production", RELECTURES_SOURCE: "google" },
      { VADROUILLE_ENV: "local" },
    ]) {
      expect(choisirSourceRelectures(REPLI, env)).toBe(REPLI);
    }
  });

  it("local avec RELECTURES_SOURCE=google : la source réelle (distincte du repli)", () => {
    const source = choisirSourceRelectures(REPLI, { VADROUILLE_ENV: "local", RELECTURES_SOURCE: "google" });
    expect(source).not.toBe(REPLI);
  });
});

describe("composition: PLAFONDS_USAGE nul, échec fermé", () => {
  it("sans plafonds posés, la source réelle rend unavailable sans transaction ni client", async () => {
    const source = creerSourceLecture({
      transaction: () => () => Promise.reject(new Error("aucune transaction attendue")),
      clients: () => {
        throw new Error("aucun client attendu");
      },
    });
    expect(await source.pour(voyageARelire(["test_place_a"]), DEMANDE)).toEqual({ ok: false, refus: "unavailable" });
  });
});
