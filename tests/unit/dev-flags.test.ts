// @vitest-environment node
import { describe, expect, it } from "vitest";

import { devPagesEnabled, isProductionDeployment, isProductionTarget } from "@/dev/flags";

const env = (values: Record<string, string | undefined>) => values as unknown as NodeJS.ProcessEnv;

/**
 * Pages de développement, fermées par défaut (décision 0017 § 11.1, F8b) : attentes changées par cette décision
 * écrite (CLAUDE.md), aucun cas retiré sans remplaçant. Avant F8b, toute valeur de `NODE_ENV` autre que
 * `production` ouvrait `/dev` ; ce n'est plus le cas.
 */
describe("pages de développement", () => {
  it("sont actives en développement et en test", () => {
    expect(devPagesEnabled({ NODE_ENV: "development" })).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "test" })).toBe(true);
  });

  it("sont désactivées en production", () => {
    expect(devPagesEnabled({ NODE_ENV: "production" })).toBe(false);
  });

  it.each([{}, { NODE_ENV: "" }, { NODE_ENV: "staging" }, { NODE_ENV: "Development" }])(
    "sont désactivées pour NODE_ENV absent, vide ou inconnu (%j)",
    (values) => {
      expect(devPagesEnabled(env(values))).toBe(false);
    },
  );

  it("ne s'activent en production que sur demande explicite, exactement « 1 »", () => {
    expect(devPagesEnabled({ NODE_ENV: "production", VADROUILLE_DEV_PAGES: "1" })).toBe(true);
    expect(devPagesEnabled(env({ VADROUILLE_DEV_PAGES: "1" }))).toBe(true);
    expect(devPagesEnabled({ NODE_ENV: "production", VADROUILLE_DEV_PAGES: "true" })).toBe(false);
    expect(devPagesEnabled({ NODE_ENV: "production", VADROUILLE_DEV_PAGES: " 1" })).toBe(false);
  });

  it.each(["development", "test", "production"] as const)(
    "sont toujours fermées sur un déploiement de production, même avec le drapeau (NODE_ENV=%s)",
    (nodeEnv) => {
      for (const deployment of [{ VERCEL_ENV: "production" }, { VADROUILLE_ENV: "production" }]) {
        expect(devPagesEnabled({ NODE_ENV: nodeEnv, VADROUILLE_DEV_PAGES: "1", ...deployment })).toBe(false);
        expect(devPagesEnabled({ NODE_ENV: nodeEnv, ...deployment })).toBe(false);
      }
    },
  );

  it.each([" production", "PRODUCTION", "Production ", "production"])(
    "VADROUILLE_ENV ou VERCEL_ENV à %j ferme aussi (comparaison tolérante, 0017 § 11.0)",
    (value) => {
      expect(isProductionDeployment(env({ VADROUILLE_ENV: value }))).toBe(true);
      expect(isProductionDeployment(env({ VERCEL_ENV: value }))).toBe(true);
      expect(devPagesEnabled({ NODE_ENV: "development", VADROUILLE_DEV_PAGES: "1", VADROUILLE_ENV: value })).toBe(false);
    },
  );

  it("isProductionDeployment ne ferme pas sans valeur de production", () => {
    expect(isProductionDeployment(env({}))).toBe(false);
    expect(isProductionDeployment(env({ VERCEL_ENV: "preview", VADROUILLE_ENV: "local" }))).toBe(false);
  });
});

// B4c (PR 863 ; décision 0140 § 3 point 6) : prédicat de production partagé du paiement Stripe. Il contient
// `isProductionDeployment` (aucune ligne de sa table n'est retirée) et ferme aussi sur `VERCEL_TARGET_ENV`.
describe("env: isProductionTarget", () => {
  it.each([
    [{ VADROUILLE_ENV: "production" }, true],
    [{ VADROUILLE_ENV: " Production " }, true],
    [{ VERCEL_ENV: "production" }, true],
    [{ VERCEL_ENV: "PRODUCTION" }, true],
    [{ VERCEL_TARGET_ENV: "production" }, true],
    [{ VERCEL_TARGET_ENV: " Production " }, true],
    [{ VERCEL_TARGET_ENV: "production", VERCEL_ENV: "preview", VADROUILLE_ENV: "ci" }, true],
    [{}, false],
    [{ VERCEL_ENV: "preview", VADROUILLE_ENV: "local" }, false],
    [{ VERCEL_TARGET_ENV: "preview" }, false],
    [{ VERCEL_TARGET_ENV: "mvp-essai" }, false],
    [{ VERCEL_TARGET_ENV: "prod" }, false],
    [{ VERCEL_TARGET_ENV: "" }, false],
  ] as const)("%j → %s", (values, attendu) => {
    expect(isProductionTarget(env(values))).toBe(attendu);
  });

  it("vrai dès que isProductionDeployment est vrai (même table)", () => {
    for (const valeur of ["production", " Production ", "PRODUCTION"]) {
      for (const nom of ["VADROUILLE_ENV", "VERCEL_ENV"]) {
        const e = env({ [nom]: valeur });
        expect(isProductionDeployment(e)).toBe(true);
        expect(isProductionTarget(e)).toBe(true);
      }
    }
  });
});
