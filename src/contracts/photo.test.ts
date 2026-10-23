// @vitest-environment node
import { describe, expect, it } from "vitest";

import { adresseGoogleSure, PlacePhotoRequestSchema, PlacePhotoResponseSchema, PlacePhotoSchema } from "./photo";

/** Contrat de la photo d'une carte du tri (décision 0128 § 6) : schémas stricts, bornes, hôtes Google seulement. */

const PHOTO = {
  url: "https://lh3.googleusercontent.com/place-photos/x",
  authors: [{ name: "Ana", profileUrl: "https://maps.google.com/maps/contrib/1" }],
  mapsUrl: "https://www.google.com/maps/p",
};

describe("contrats: PlacePhoto (décision 0128)", () => {
  it("forme nominale ; champs inconnus refusés (strict) ; liens facultatifs", () => {
    expect(PlacePhotoSchema.parse(PHOTO)).toEqual(PHOTO);
    expect(PlacePhotoSchema.safeParse({ url: PHOTO.url, authors: [] }).success).toBe(true);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, placeId: "ChIJ" }).success).toBe(false);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: [{ name: "Ana", photoUri: "x" }] }).success).toBe(false);
  });

  it("bornes : 10 auteurs au plus, nom de 1 à 120 caractères, adresse de 2 048 caractères au plus", () => {
    const auteur = { name: "A" };
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: Array(10).fill(auteur) }).success).toBe(true);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: Array(11).fill(auteur) }).success).toBe(false);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: [{ name: "" }] }).success).toBe(false);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: [{ name: "a".repeat(121) }] }).success).toBe(false);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, url: `https://lh3.googleusercontent.com/${"x".repeat(2048)}` }).success).toBe(false);
  });

  it("hôtes : image chez googleusercontent.com, liens chez google.com ou goo.gl ; https sans identifiants ni port (mineur 11)", () => {
    for (const url of [
      "http://lh3.googleusercontent.com/x",
      "https://exemple.org/x",
      "https://googleusercontent.com.exemple.org/x",
      "https://faux-googleusercontent.com/x",
      "https://u:p@lh3.googleusercontent.com/x",
      "https://lh3.googleusercontent.com:8443/x",
      "https://www.google.com/x",
    ]) {
      expect(PlacePhotoSchema.safeParse({ ...PHOTO, url }).success, url).toBe(false);
    }
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, mapsUrl: "https://lh3.googleusercontent.com/x" }).success).toBe(false);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, mapsUrl: "https://maps.app.goo.gl/x" }).success).toBe(true);
    expect(PlacePhotoSchema.safeParse({ ...PHOTO, authors: [{ name: "Ana", profileUrl: "javascript:alert(1)" }] }).success).toBe(false);
    expect(adresseGoogleSure("pas une adresse", ["google.com"])).toBe(false);
    expect(adresseGoogleSure("https://google.com/x", ["google.com"])).toBe(true);
  });

  it("entrée : la carte (tripId, proposalId), jamais un identifiant de lieu ; stricte et bornée", () => {
    expect(PlacePhotoRequestSchema.parse({ tripId: "proto_lisbonne_1", proposalId: "p1" })).toEqual({ tripId: "proto_lisbonne_1", proposalId: "p1" });
    for (const entree of [
      { placeId: "ChIJ" },
      { tripId: "t1", proposalId: "p1", placeId: "ChIJ" },
      { tripId: "a/b", proposalId: "p1" },
      { tripId: "t".repeat(65), proposalId: "p1" },
      { tripId: "t1", proposalId: "" },
      { tripId: "t1", proposalId: "p".repeat(129) },
    ]) {
      expect(PlacePhotoRequestSchema.safeParse(entree).success, JSON.stringify(entree)).toBe(false);
    }
  });

  it("réponse : photo ou null, stricte", () => {
    expect(PlacePhotoResponseSchema.safeParse({ photo: null }).success).toBe(true);
    expect(PlacePhotoResponseSchema.safeParse({ photo: PHOTO }).success).toBe(true);
    expect(PlacePhotoResponseSchema.safeParse({}).success).toBe(false);
    expect(PlacePhotoResponseSchema.safeParse({ photo: null, raison: "cap_reached" }).success).toBe(false);
  });
});
