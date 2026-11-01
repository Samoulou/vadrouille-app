// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REVIEW_ACCESS,
  RemoveAllTastesRequestSchema,
  RemoveTasteRequestSchema,
  RestoreTasteRequestSchema,
  RetainTastesRequestSchema,
  STOP_RATINGS,
  StopReviewRequestSchema,
  StopReviewSchema,
  TripReviewSchema,
} from "@/contracts";

/*
 * Contrats de l'écran 16 « Après le voyage » (décision 0160 § 1.2 point 3 et § 3.1 ; spécification M8 § 6.1, critère 2 ;
 * PR de contrat M8-C, ticket 1041).
 */

const REQUEST_ID = "6f1c2a4e-8d0b-4c3a-9e7f-2b5d1a0c9e88";
const candidat = { id: "category:museum:less", origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } } as const;
const deduit = { id: "category:tasting:more", origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } } as const;
const revue = {
  tripId: "trip-edimbourg",
  access: "open",
  reviews: [
    { stopId: "j1-chateau", rating: "liked" },
    { stopId: "j2-musee", rating: "notDone" },
  ],
  tasteCandidates: [candidat, deduit],
  retainedIds: ["category:museum:less"],
} as const;

const SENTINELLES = [
  ["placeId", "ChIJ-SENTINELLE-M8C"],
  ["name", "[SENTINELLE-NOM-M8C]"],
  ["destination", "Édimbourg"],
  ["text", "texte libre"],
  ["comment", "super endroit"],
] as const;

describe("avis: valeurs fermées (décision 0160 § 1.2 point 1)", () => {
  it("STOP_RATINGS en camelCase et REVIEW_ACCESS", () => {
    expect(STOP_RATINGS).toEqual(["liked", "disliked", "notDone"]);
    expect(REVIEW_ACCESS).toEqual(["notEnded", "open", "readOnly"]);
  });
});

describe("avis: StopReview strict, sans placeId", () => {
  it("accepte `{ stopId, rating }` pour chaque valeur", () => {
    for (const rating of STOP_RATINGS) expect(StopReviewSchema.safeParse({ stopId: "j1", rating }).success).toBe(true);
  });

  it.each([
    ["valeur hors liste", { stopId: "j1", rating: "not_done" }],
    ["note chiffrée", { stopId: "j1", rating: 4 }],
    ["valeur nulle (lecture)", { stopId: "j1", rating: null }],
    ["étape vide", { stopId: "", rating: "liked" }],
    ...SENTINELLES.map(([cle, valeur]) => [cle, { stopId: "j1", rating: "liked", [cle]: valeur }] as const),
  ] as [string, unknown][])("refuse : %s", (_cas, valeur) => {
    expect(StopReviewSchema.safeParse(valeur).success).toBe(false);
  });
});

describe("avis: TripReview (décision 0160 § 1.2 point 3)", () => {
  it("accepte la lecture complète, et chaque accès", () => {
    expect(TripReviewSchema.safeParse(revue).success).toBe(true);
    expect(TripReviewSchema.safeParse({ ...revue, access: "readOnly" }).success).toBe(true);
    expect(TripReviewSchema.safeParse({ ...revue, access: "notEnded", reviews: [], tasteCandidates: [] }).success).toBe(true);
    expect(TripReviewSchema.safeParse({ ...revue, reviews: [], tasteCandidates: [], retainedIds: [] }).success).toBe(true);
  });

  it.each([
    ["readOnly booléen (remplacé par access)", { ...revue, readOnly: true }],
    ["accès hors liste", { ...revue, access: "closed" }],
    ["accès manquant", { tripId: revue.tripId, reviews: [], tasteCandidates: [], retainedIds: [] }],
    ["placeId dans un avis", { ...revue, reviews: [{ stopId: "j1", rating: "liked", placeId: "ChIJ-SENTINELLE-M8C" }] }],
    ["candidat dont l'id n'est pas la clé", { ...revue, tasteCandidates: [{ ...candidat, id: "distance" }] }],
    ["clé retenue inconnue", { ...revue, retainedIds: ["category:museum"] }],
    ["adresses découvertes à part", { ...revue, discoveredPlaces: [] }],
    ...SENTINELLES.map(([cle, valeur]) => [cle, { ...revue, [cle]: valeur }] as const),
  ] as [string, unknown][])("refuse : %s", (_cas, valeur) => {
    expect(TripReviewSchema.safeParse(valeur).success).toBe(false);
  });

  it("raffinements : sans doublon d'étape, de candidat ni de clé retenue", () => {
    expect(TripReviewSchema.safeParse({ ...revue, reviews: [{ stopId: "j1", rating: "liked" }, { stopId: "j1", rating: "disliked" }] }).success).toBe(false);
    expect(TripReviewSchema.safeParse({ ...revue, tasteCandidates: [candidat, candidat] }).success).toBe(false);
    expect(TripReviewSchema.safeParse({ ...revue, retainedIds: ["distance", "distance"] }).success).toBe(false);
  });

  it("raffinement : ni avis ni candidat avant le dernier jour (notEnded)", () => {
    expect(TripReviewSchema.safeParse({ ...revue, access: "notEnded", tasteCandidates: [] }).success).toBe(false);
    expect(TripReviewSchema.safeParse({ ...revue, access: "notEnded", reviews: [] }).success).toBe(false);
  });
});

describe("avis: StopReviewRequest (rateStop, M8a)", () => {
  const demande = { tripId: "trip-edimbourg", stopId: "j1-chateau", rating: "disliked", requestId: REQUEST_ID } as const;

  it("accepte une valeur, et null pour effacer", () => {
    expect(StopReviewRequestSchema.safeParse(demande).success).toBe(true);
    expect(StopReviewRequestSchema.safeParse({ ...demande, rating: null }).success).toBe(true);
  });

  it.each([
    ["rating absent", { tripId: demande.tripId, stopId: demande.stopId, requestId: REQUEST_ID }],
    ["requestId hors uuid", { ...demande, requestId: "abc" }],
    ["voyage hors motif", { ...demande, tripId: "voyage à Édimbourg" }],
    ["organisation", { ...demande, organizationId: "org-1" }],
    ...SENTINELLES.map(([cle, valeur]) => [cle, { ...demande, [cle]: valeur }] as const),
  ] as [string, unknown][])("refuse : %s", (_cas, valeur) => {
    expect(StopReviewRequestSchema.safeParse(valeur).success).toBe(false);
  });
});

describe("goûts: demandes de M8c-1 (décision 0160 § 1.2 point 3)", () => {
  const retenue = { tripId: "trip-edimbourg", candidateIds: ["category:museum:less", "distance"], requestId: REQUEST_ID };

  it("RetainTastesRequest : 1 à 17 clés distinctes", () => {
    expect(RetainTastesRequestSchema.safeParse(retenue).success).toBe(true);
    expect(RetainTastesRequestSchema.safeParse({ ...retenue, candidateIds: [] }).success).toBe(false);
    expect(RetainTastesRequestSchema.safeParse({ ...retenue, candidateIds: ["distance", "distance"] }).success).toBe(false);
    expect(RetainTastesRequestSchema.safeParse({ ...retenue, candidateIds: ["Tu préfères éviter les musées"] }).success).toBe(false);
  });

  it.each([
    ["origine fournie", { ...retenue, origin: "confirmed" }],
    ["sujet fourni", { ...retenue, subjects: [{ kind: "distance" }] }],
    ...SENTINELLES.map(([cle, valeur]) => [cle, { ...retenue, [cle]: valeur }] as const),
  ] as [string, unknown][])("RetainTastesRequest refuse : %s", (_cas, valeur) => {
    expect(RetainTastesRequestSchema.safeParse(valeur).success).toBe(false);
  });

  it("RemoveTasteRequest : tasteId est une preferenceKey", () => {
    expect(RemoveTasteRequestSchema.safeParse({ tasteId: "category:museum:less", requestId: REQUEST_ID }).success).toBe(true);
    expect(RemoveTasteRequestSchema.safeParse({ tasteId: "distance", requestId: REQUEST_ID }).success).toBe(true);
    expect(RemoveTasteRequestSchema.safeParse({ tasteId: "8f8c1d1e-0000-4000-8000-000000000000", requestId: REQUEST_ID }).success).toBe(false);
    expect(RemoveTasteRequestSchema.safeParse({ tasteId: "distance", requestId: REQUEST_ID, userId: "u1" }).success).toBe(false);
  });

  it("RestoreTasteRequest : le goût rendu par removeTaste, fromTripId nul permis", () => {
    const taste = { ...candidat, fromTripId: null };
    expect(RestoreTasteRequestSchema.safeParse({ taste, requestId: REQUEST_ID }).success).toBe(true);
    expect(RestoreTasteRequestSchema.safeParse({ taste: { ...taste, id: "distance" }, requestId: REQUEST_ID }).success).toBe(false);
    expect(RestoreTasteRequestSchema.safeParse({ taste: { ...taste, name: "[SENTINELLE-NOM-M8C]" }, requestId: REQUEST_ID }).success).toBe(false);
    expect(RestoreTasteRequestSchema.safeParse({ taste, requestId: REQUEST_ID, consentedAt: "2026-09-04T10:00:00Z" }).success).toBe(false);
  });

  it("RemoveAllTastesRequest : requestId seul", () => {
    expect(RemoveAllTastesRequestSchema.safeParse({ requestId: REQUEST_ID }).success).toBe(true);
    expect(RemoveAllTastesRequestSchema.safeParse({ requestId: REQUEST_ID, userId: "u1" }).success).toBe(false);
    expect(RemoveAllTastesRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe("après le voyage: aucune liste d'adresses à part (décision 0160 § 1.2 point 4 et § 3.1)", () => {
  /** Noms abandonnés par 0160, écrits en morceaux pour que ce test ne se trouve pas lui-même. */
  const INTERDITS = ["Discovered" + "Place", "DISCOVERED_" + "PLACE", "discovered_" + "place_added"];
  const SRC = path.join(__dirname, "..");

  function fichiers(dossier: string): string[] {
    return readdirSync(dossier).flatMap((nom) => {
      const chemin = path.join(dossier, nom);
      if (statSync(chemin).isDirectory()) return fichiers(chemin);
      return /\.(ts|tsx|json)$/.test(nom) ? [chemin] : [];
    });
  }

  it("aucune occurrence dans src/", () => {
    const trouves = fichiers(SRC).flatMap((fichier) => {
      const texte = readFileSync(fichier, "utf8");
      return INTERDITS.filter((motif) => texte.includes(motif)).map((motif) => `${path.relative(SRC, fichier)} : ${motif}`);
    });
    expect(trouves).toEqual([]);
  });
});
