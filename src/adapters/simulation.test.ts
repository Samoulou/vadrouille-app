// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

const headerValue = vi.hoisted(() => ({ value: null as string | null, throws: false }));
vi.mock("next/headers", () => ({
  headers: async () => {
    if (headerValue.throws) throw new Error("hors requête");
    return new Headers(headerValue.value === null ? {} : { "x-vadrouille-simulation": headerValue.value });
  },
}));

import {
  MAX_SCOPES,
  advanceClock,
  configurePayment,
  defaultScope,
  explicitScope,
  getSimulationScope,
  isScopeName,
  resetScope,
  simulationEnabled,
} from "./simulation";

/** Portée et horloge des simulations (décision 0017 § 10, créée par F9a). */

afterEach(() => {
  vi.unstubAllEnvs();
  headerValue.value = null;
  headerValue.throws = false;
});

describe("noms de portée", () => {
  it.each(["t1", "f9a-1234", "A_b-9"])("accepte %s", (name) => expect(isScopeName(name)).toBe(true));
  it.each(["", "default", "__proto__", "constructor", "prototype", "a/b", "a b", "x".repeat(65), null, undefined])("refuse %j", (name) =>
    expect(isScopeName(name)).toBe(false),
  );
});

describe("getSimulationScope", () => {
  it("lit l'en-tête quand les pages de développement sont actives", async () => {
    headerValue.value = "portee-1";
    const scope = await getSimulationScope();
    expect(scope.explicit).toBe(true);
    expect(scope.name).toBe("portee-1");
  });

  it("valeur invalide ou absente : portée par défaut", async () => {
    headerValue.value = "__proto__";
    expect(await getSimulationScope()).toBe(defaultScope());
    headerValue.value = null;
    expect(await getSimulationScope()).toBe(defaultScope());
  });

  it("sans pages de développement ou en déploiement de production : l'en-tête est ignoré", async () => {
    headerValue.value = "portee-1";
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", undefined);
    expect(await getSimulationScope()).toBe(defaultScope());
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    vi.stubEnv("VADROUILLE_ENV", "production");
    expect(simulationEnabled()).toBe(false);
    expect(await getSimulationScope()).toBe(defaultScope());
  });

  it("hors requête (tests unitaires) : portée par défaut", async () => {
    headerValue.throws = true;
    expect(await getSimulationScope()).toBe(defaultScope());
  });
});

describe("horloge et remise à zéro", () => {
  it("horloge manuelle : fixée par reset, avancée par advanceClock, immobile entre deux", () => {
    resetScope("horloge", Date.UTC(2026, 7, 1));
    const scope = explicitScope("horloge");
    expect(scope.clock.now()).toBe(Date.UTC(2026, 7, 1));
    advanceClock("horloge", 5000);
    expect(scope.clock.now()).toBe(Date.UTC(2026, 7, 1) + 5000);
    expect(scope.clock.now()).toBe(Date.UTC(2026, 7, 1) + 5000);
  });

  it("reset vide paiements et droits et remet le délai à 0", () => {
    configurePayment("vider", 60_000);
    const scope = explicitScope("vider");
    scope.payment.entitlements.set("x", { organizationId: "o", tripId: "t", at: 0 });
    resetScope("vider", 0);
    const after = explicitScope("vider");
    expect(after.payment.entitlements.size).toBe(0);
    expect(after.payment.checkouts.size).toBe(0);
    expect(after.payment.confirmationDelayMs).toBe(0);
  });

  it("portées isolées ; au plus 1 000 portées explicites", () => {
    explicitScope("a1").payment.entitlements.set("x", { organizationId: "o", tripId: "t", at: 0 });
    expect(explicitScope("a2").payment.entitlements.size).toBe(0);
    for (let i = 0; i < MAX_SCOPES + 5; i += 1) explicitScope(`masse-${i}`);
    // a1 était la plus anciennement utilisée : retirée, recréée vide.
    expect(explicitScope("a1").payment.entitlements.size).toBe(0);
  });
});
