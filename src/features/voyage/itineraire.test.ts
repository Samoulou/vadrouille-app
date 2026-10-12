// @vitest-environment node
import { describe, expect, it } from "vitest";

import { itineraryUrl } from "./itineraire";

/** Adresse du lien « Itinéraire » (spécification F10, F10-TL-11, C7). */
describe("itineraryUrl", () => {
  it("adresse publique de Google Maps, sans clé, mode tiré du segment", () => {
    const url = new URL(itineraryUrl({ name: "[Dean Village]", placeId: "mock_place_dean_village" }, "walk"));
    expect(`${url.origin}${url.pathname}`).toBe("https://www.google.com/maps/dir/");
    expect([...url.searchParams.entries()]).toEqual([
      ["api", "1"],
      ["destination", "[Dean Village]"],
      ["destination_place_id", "mock_place_dean_village"],
      ["travelmode", "walking"],
    ]);
    expect(url.search).not.toMatch(/key=/);
  });

  it.each([
    ["transit", "transit"],
    ["car", "driving"],
  ] as const)("segment %s : travelmode=%s ; sans segment : pas de mode", (mode, travelmode) => {
    expect(new URL(itineraryUrl({ name: "A", placeId: "p" }, mode)).searchParams.get("travelmode")).toBe(travelmode);
    expect(new URL(itineraryUrl({ name: "A", placeId: "p" })).searchParams.has("travelmode")).toBe(false);
  });

  it("nom avec &, # et %, placeId à encoder : relu à l'identique, sans paramètre en plus ni fragment", () => {
    const name = "[Fish & Chips #1 à 100 %]";
    const placeId = "id&x=1#y%";
    const url = new URL(itineraryUrl({ name, placeId }, "walk"));
    expect(url.hash).toBe("");
    expect(url.searchParams.get("destination")).toBe(name);
    expect(url.searchParams.get("destination_place_id")).toBe(placeId);
    expect([...url.searchParams.keys()]).toEqual(["api", "destination", "destination_place_id", "travelmode"]);
  });
});
