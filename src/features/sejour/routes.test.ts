import { describe, expect, it } from "vitest";

import { mesVoyagesRoute, tripRoutes } from "./routes";

describe("tripRoutes (décision 0015 § 1)", () => {
  const routes = tripRoutes("/voyages", "mock_trip_edimbourg");

  it("construit les adresses du voyage", () => {
    expect(routes.sejour()).toBe("/voyages/mock_trip_edimbourg");
    expect(routes.jour(2)).toBe("/voyages/mock_trip_edimbourg/jour/2");
    expect(routes.etape(2, "j2-dean-village")).toBe("/voyages/mock_trip_edimbourg/jour/2?etape=j2-dean-village");
    expect(routes.remplacer(2, "j2-dean-village")).toBe("/voyages/mock_trip_edimbourg/jour/2/remplacer/j2-dean-village");
    expect(routes.mesVoyages()).toBe("/voyages");
  });

  it("applique le préfixe des pages de développement", () => {
    const dev = tripRoutes("/dev/voyages", "mock_trip_edimbourg");
    expect(dev.sejour()).toBe("/dev/voyages/mock_trip_edimbourg");
    expect(dev.jour(5)).toBe("/dev/voyages/mock_trip_edimbourg/jour/5");
    // `R17` n'a pas de pendant de développement : « Mes voyages » reste `/voyages` (décision 0021 § 6).
    expect(dev.mesVoyages()).toBe("/voyages");
  });

  it("écran 15 (F10-TL-3, F10-PO-7) : `/voyages/{id}/aujourdhui` ; aucune adresse avec la base `/dev/voyages` (C16)", () => {
    expect(routes.aujourdhui()).toBe("/voyages/mock_trip_edimbourg/aujourdhui");
    expect(tripRoutes("/voyages", "a b/c").aujourdhui()).toBe("/voyages/a%20b%2Fc/aujourdhui");
    expect(tripRoutes("/dev/voyages", "mock_trip_edimbourg").aujourdhui()).toBeNull();
  });

  it("« Versions du programme » (M5b) : `/voyages/{id}/versions` ; aucune adresse avec la base `/dev/voyages`", () => {
    expect(routes.versions()).toBe("/voyages/mock_trip_edimbourg/versions");
    expect(tripRoutes("/voyages", "a b/c").versions()).toBe("/voyages/a%20b%2Fc/versions");
    expect(tripRoutes("/dev/voyages", "mock_trip_edimbourg").versions()).toBeNull();
  });

  it("« Mes voyages » : une seule adresse, `/voyages` (décision 0021 § 6)", () => {
    expect(mesVoyagesRoute()).toBe("/voyages");
    expect(tripRoutes("/voyages", "a b").mesVoyages()).toBe(mesVoyagesRoute());
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

  it("« Choisir » d'un repas pas encore choisi : de et repas, tels quels (F7-PO-8, M5d-3)", () => {
    expect(routes.ajouter(2, { time: "19:30", meal: "dinner" })).toBe("/voyages/mock_trip_edimbourg/jour/2/ajouter?de=19:30&repas=dinner");
    expect(routes.ajouter(1, { time: "12:30", meal: "lunch" })).toBe("/voyages/mock_trip_edimbourg/jour/1/ajouter?de=12:30&repas=lunch");
  });
});
