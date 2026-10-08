// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { getTripAdapter } from "./index";
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
});
