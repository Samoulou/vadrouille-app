import { describe, expect, it } from "vitest";

import { presentationRoute } from "./routes";

describe("presentationRoute (D1-PO-4)", () => {
  it("construit l'adresse de la présentation", () => {
    expect(presentationRoute("mock_trip_edimbourg")).toBe("/voyages/mock_trip_edimbourg/presentation");
  });

  it("encode l'identifiant", () => {
    expect(presentationRoute("a b/c")).toBe("/voyages/a%20b%2Fc/presentation");
  });
});
