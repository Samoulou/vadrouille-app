import { describe, expect, it } from "vitest";

import { tripRoutes } from "./routes";

describe("tripRoutes (décision 0015 § 1)", () => {
  const routes = tripRoutes("/voyages", "mock_trip_edimbourg");

  it("construit les adresses du voyage", () => {
    expect(routes.sejour()).toBe("/voyages/mock_trip_edimbourg");
    expect(routes.jour(2)).toBe("/voyages/mock_trip_edimbourg/jour/2");
    expect(routes.etape(2, "j2-dean-village")).toBe("/voyages/mock_trip_edimbourg/jour/2?etape=j2-dean-village");
    expect(routes.remplacer(2, "j2-dean-village")).toBe("/voyages/mock_trip_edimbourg/jour/2/remplacer/j2-dean-village");
    expect(routes.retour()).toBe("/voyages");
  });

  it("applique le préfixe des pages de développement", () => {
    const dev = tripRoutes("/dev/voyages", "mock_trip_edimbourg");
    expect(dev.sejour()).toBe("/dev/voyages/mock_trip_edimbourg");
    expect(dev.jour(5)).toBe("/dev/voyages/mock_trip_edimbourg/jour/5");
    expect(dev.retour()).toBe("/dev/voyages");
  });

  it("encode les identifiants", () => {
    const odd = tripRoutes("/voyages", "a b/c");
    expect(odd.sejour()).toBe("/voyages/a%20b%2Fc");
    expect(odd.etape(1, "x&y=z")).toBe("/voyages/a%20b%2Fc/jour/1?etape=x%26y%3Dz");
  });

  it("écrit les heures du lien « Idées » telles quelles (de, a)", () => {
    expect(routes.ajouter(2, { from: "15:00", to: "18:30" })).toBe(
      "/voyages/mock_trip_edimbourg/jour/2/ajouter?de=15:00&a=18:30",
    );
    expect(routes.ajouter(2)).toBe("/voyages/mock_trip_edimbourg/jour/2/ajouter");
  });
});
