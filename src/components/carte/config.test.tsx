import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { CarteProvider, isMapConfigComplete, readMapConfig, useCarteInjection } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
});

function Probe() {
  const { config, simulated } = useCarteInjection();
  return <output>{JSON.stringify({ config, simulated: Boolean(simulated) })}</output>;
}

describe("configuration injectable de la carte (F4-TL-3)", () => {
  it("valeur par défaut : les deux variables NEXT_PUBLIC_*", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "cle-de-test");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "map-de-test");
    expect(readMapConfig()).toEqual({ apiKey: "cle-de-test", mapId: "map-de-test" });
  });

  it("variables vides : configuration incomplète", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "");
    expect(readMapConfig()).toEqual({ apiKey: undefined, mapId: undefined });
    expect(isMapConfigComplete(readMapConfig())).toBe(false);
  });

  it("complète seulement avec une clé et un Map ID non vides", () => {
    expect(isMapConfigComplete({ apiKey: "test-key", mapId: "test-map" })).toBe(true);
    expect(isMapConfigComplete({ apiKey: "test-key" })).toBe(false);
    expect(isMapConfigComplete({ apiKey: " ", mapId: "test-map" })).toBe(false);
  });

  it("sans contexte, lit l'environnement ; avec contexte, la valeur injectée", () => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "cle-env");
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID", "map-env");
    const { unmount } = render(<Probe />);
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({
      config: { apiKey: "cle-env", mapId: "map-env" },
      simulated: false,
    });
    unmount();
    render(
      <CarteProvider value={{ config: {}, simulated: () => null }}>
        <Probe />
      </CarteProvider>,
    );
    expect(JSON.parse(screen.getByRole("status").textContent!)).toEqual({ config: {}, simulated: true });
  });
});
