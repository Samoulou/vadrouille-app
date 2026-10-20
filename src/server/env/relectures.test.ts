// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ecriturePositionsSuspendue, sourceReelleChoisie } from "@/server/env/relectures";

/** Module d'environnement étroit de la lecture des voyages (B8b ; décision 0100 § 5.3, 0060 § 1.3) : l'environnement est un paramètre. */

describe("composition: source réelle seulement en local (0100 § 5.3)", () => {
  it.each([
    [{ VADROUILLE_ENV: "local", RELECTURES_SOURCE: "google" }, true],
    [{ VERCEL_ENV: "development", RELECTURES_SOURCE: "google" }, true],
    [{ VADROUILLE_ENV: "local" }, false],
    [{ VADROUILLE_ENV: "local", RELECTURES_SOURCE: "Google" }, false],
    [{ VADROUILLE_ENV: "local", RELECTURES_SOURCE: "mock" }, false],
    [{ VADROUILLE_ENV: "ci", RELECTURES_SOURCE: "google" }, false],
    [{ VADROUILLE_ENV: "staging", RELECTURES_SOURCE: "google" }, false],
    [{ VADROUILLE_ENV: "production", RELECTURES_SOURCE: "google" }, false],
    [{ VADROUILLE_ENV: "local", VERCEL_ENV: "production", RELECTURES_SOURCE: "google" }, false],
    [{ VADROUILLE_ENV: "inconnu", RELECTURES_SOURCE: "google" }, false],
    [{ RELECTURES_SOURCE: "google" }, false],
  ] as const)("%j → %s, sans jamais lever", (env, attendu) => {
    expect(sourceReelleChoisie(env)).toBe(attendu);
  });
});

describe("positions: interrupteur d'écriture (0060 § 1.3)", () => {
  it.each([
    ["1", true],
    ["0", false],
    ["true", false],
    [" 1", false],
    ["", false],
    [undefined, false],
  ] as const)("POSITIONS_ECRITURE_SUSPENDUE=%j → %s", (valeur, attendu) => {
    expect(ecriturePositionsSuspendue({ POSITIONS_ECRITURE_SUSPENDUE: valeur })).toBe(attendu);
  });
});
