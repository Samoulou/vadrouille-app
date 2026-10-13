// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP, getTripAdapter, isMockAdapter, isPrototypeAdapter } from "./index";
import { mockTripAdapter } from "./mock";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getTripAdapter", () => {
  it("choisit l'adaptateur mock par défaut", () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    expect(getTripAdapter()).toBe(mockTripAdapter);
  });

  it("choisit l'adaptateur mock avec DATA_ADAPTER=mock", () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(getTripAdapter()).toBe(mockTripAdapter);
  });

  it("lève « adaptateur api non implémenté » avec DATA_ADAPTER=api", () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    expect(() => getTripAdapter()).toThrow("adaptateur api non implémenté");
  });

  it("refuse une valeur inconnue", () => {
    vi.stubEnv("DATA_ADAPTER", "postgres");
    expect(() => getTripAdapter()).toThrow(/DATA_ADAPTER inconnu/);
  });

  it("adaptateurs: getTripAdapter accepte prototype et cite mock, api, prototype dans son erreur", () => {
    expect(() => getTripAdapter("postgres")).toThrow("(valeurs : mock, api, prototype)");
    const adapter = getTripAdapter("prototype", { NODE_ENV: "test" });
    expect(adapter).not.toBe(mockTripAdapter);
    expect(typeof adapter.getTrip).toBe("function");
    expect(() => getTripAdapter("prototype", { NODE_ENV: "production" })).toThrow(/adaptateur prototype refusé/);
  });
});

describe("isMockAdapter (spécification D1)", () => {
  it.each([undefined, "", "  ", "mock", " mock "])("vrai pour DATA_ADAPTER=%j", (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    expect(isMockAdapter()).toBe(true);
    expect(isMockAdapter(value)).toBe(true);
  });

  it.each(["api", "autre", "MOCK"])("faux, sans erreur, pour DATA_ADAPTER=%j", (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    expect(() => isMockAdapter()).not.toThrow();
    expect(isMockAdapter()).toBe(false);
  });

  it("ne dépend ni de NODE_ENV ni de VADROUILLE_DEV_PAGES", () => {
    vi.stubEnv("DATA_ADAPTER", undefined);
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", undefined);
    expect(isMockAdapter()).toBe(true);
  });
});

describe("isPrototypeAdapter (spécification P0, P0b1)", () => {
  it("vrai pour prototype, faux sinon, sans erreur ni liste blanche", () => {
    expect(isPrototypeAdapter("prototype")).toBe(true);
    expect(isPrototypeAdapter(" prototype ")).toBe(true);
    for (const value of [undefined, "", "mock", "api", "PROTOTYPE"]) expect(isPrototypeAdapter(value)).toBe(false);
  });
});

describe("MOCK_DEMO_UNLOCKED_TRIP (D1-PO-3)", () => {
  it("désigne le voyage débloqué, lisible par l'adaptateur mock", async () => {
    const trip = await mockTripAdapter.getTrip(MOCK_DEMO_UNLOCKED_TRIP.ctx, MOCK_DEMO_UNLOCKED_TRIP.tripId);
    expect(trip?.unlocked).toBe(true);
    expect(MOCK_DEMO_UNLOCKED_TRIP.ctx).toEqual(MOCK_DEMO_TRIP.ctx);
    expect(MOCK_DEMO_UNLOCKED_TRIP.tripId).not.toBe(MOCK_DEMO_TRIP.tripId);
  });
});
