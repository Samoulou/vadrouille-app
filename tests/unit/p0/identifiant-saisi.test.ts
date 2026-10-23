// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TRIP_ID_PATTERN } from "@/contracts/values";
import { identifiantVoyage, identifiantVoyageSaisi, lireIdentifiantVoyageSaisi } from "@/domain/identifiant";

/** Identifiant d'un voyage lancé depuis l'app, connu dès le lancement (E2E-essai, lot 3 ; décision 0125 § 2). */

const RUN = "0123abcd-4567-4890-a123-456789abcdef";

describe("p0: identifiant du voyage d'un brief saisi", () => {
  it("proto_<slug>_<exécution sans tirets>, conforme au contrat, relu à l'identique", () => {
    const id = identifiantVoyageSaisi("Édimbourg", RUN);
    expect(id).toBe("proto_edimbourg_0123abcd45674890a123456789abcdef");
    expect(TRIP_ID_PATTERN.test(id)).toBe(true);
    expect(lireIdentifiantVoyageSaisi(id)).toEqual({ runId: RUN, slug: "edimbourg" });
  });

  it("slug long : identifiant dans les 64 caractères du contrat", () => {
    const id = identifiantVoyageSaisi("Saint-Jacques-de-Compostelle et environs", RUN);
    expect(id.length).toBeLessThanOrEqual(64);
    expect(lireIdentifiantVoyageSaisi(id)?.runId).toBe(RUN);
  });

  it("exécution non conforme : refus", () => {
    for (const run of ["", "pas-un-uuid", RUN.toUpperCase().replaceAll("-", "")]) {
      expect(() => identifiantVoyageSaisi("Rome", run)).toThrow(RangeError);
    }
  });

  it("identifiants des essais de /prototype/executions, du mock ou inventés : jamais lus comme un voyage de l'app", () => {
    for (const id of [identifiantVoyage("Rome", "2026-10-22", 3), "mock_trip_edimbourg", "proto_rome_0123", `proto_Rome_${"a".repeat(32)}`, `proto_rome_${"g".repeat(32)}`]) {
      expect(lireIdentifiantVoyageSaisi(id)).toBeNull();
    }
  });
});
