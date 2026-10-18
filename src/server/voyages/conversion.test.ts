import { describe, expect, it, vi } from "vitest";

import { TripSnapshotSchema, type DaySnapshot } from "@/contracts";
import { MOBILITY_MODES } from "@/contracts/values";
import { ORDRE_MODES } from "@/domain/relectures";
import { formatLogLine, LOG_READ_REASONS } from "@/server/log";

import { dateDansFuseau, datesDeVerification, identifiantLisible, logementsParNuit, mobiliteDepuisColonne, nombreDeNuits, type VersionDeChaine } from "./conversion";
import { echec, LectureVoyageError, RAISONS_LECTURE } from "./erreurs";

/**
 * Conversions de la lecture des voyages, sans base (spécification B6, B6a ; décision 0086 ; réponses du rôle data,
 * points 4 et 5) et champs fermés du journal (B6a point 10 ; 0086 § 4 point 2).
 */

describe("lecture: identifiant reçu (B6-PO-11)", () => {
  it.each([
    ["00000000-0000-4000-8000-000000000000", true],
    ["8f14e45f-ceea-4e7a-9f5b-5d3c1b2a9e10", true],
    ["mock_trip_edimbourg", false],
    ["", false],
    ["00000000-0000-4000-8000-00000000000", false],
    ["00000000-0000-4000-8000-000000000000 ", false],
    ["' OR 1=1 --", false],
  ])("%s : lisible %s", (id, attendu) => {
    expect(identifiantLisible(id)).toBe(attendu);
  });

  it("une valeur qui n'est pas une chaîne n'est pas lisible", () => {
    for (const valeur of [undefined, null, 42, {}, ["00000000-0000-4000-8000-000000000000"]]) expect(identifiantLisible(valeur)).toBe(false);
  });
});

describe("lecture: briefs.mobility, lecture stricte (réponse de data, point 4)", () => {
  it("ORDRE_MODES et MOBILITY_MODES gardent le même ordre", () => {
    expect([...ORDRE_MODES]).toEqual([...MOBILITY_MODES]);
  });

  it.each([
    [null, []],
    ["", []],
    ["walk", ["walk"]],
    ["transit", ["transit"]],
    ["car", ["car"]],
    ["walk,transit", ["walk", "transit"]],
    ["walk,car", ["walk", "car"]],
    ["transit,car", ["transit", "car"]],
    ["walk,transit,car", ["walk", "transit", "car"]],
  ])("%j : %j", (valeur, attendu) => {
    expect(mobiliteDepuisColonne(valeur)).toEqual(attendu);
  });

  it.each(["walk,", ",walk", " walk", "walk ", "walk, transit", "walk,walk", "transit,walk", "car,walk", "walk,plane", "WALK", "bike", ",", "walk;transit"])(
    "%j : mobility_invalid (null)",
    (valeur) => {
      expect(mobiliteDepuisColonne(valeur)).toBeNull();
    },
  );

  it("une valeur qui n'est pas une chaîne : null", () => {
    for (const valeur of [undefined, 0, ["walk"], {}]) expect(mobiliteDepuisColonne(valeur)).toBeNull();
  });
});

describe("lecture: logements par nuit (B6-PO-17 ; réponse de data, point 5)", () => {
  const ligne = (placeId: string | null, from: string, to: string) => ({ placeId, from, to });

  it("nombre de nuits : end − start", () => {
    expect(nombreDeNuits("2027-05-01", "2027-05-04")).toBe(3);
    expect(nombreDeNuits("2027-05-01", "2027-05-01")).toBe(0);
    // Passage à l'heure d'été : les dates sont lues en UTC.
    expect(nombreDeNuits("2027-03-27", "2027-03-29")).toBe(2);
  });

  it("borne exclusive de to_date : from_date ≤ D < to_date", () => {
    expect(logementsParNuit([ligne("test_place_a", "2027-05-01", "2027-05-03"), ligne("test_place_b", "2027-05-03", "2027-05-04")], "2027-05-01", "2027-05-04")).toEqual([
      "test_place_a",
      "test_place_a",
      "test_place_b",
    ]);
  });

  it("un logement sans lieu donne null pour sa nuit (le double rend alors inconnu)", () => {
    expect(logementsParNuit([ligne(null, "2027-05-01", "2027-05-03")], "2027-05-01", "2027-05-03")).toEqual([null, null]);
  });

  it("une nuit sans ligne ou couverte par deux lignes : null (stay_missing)", () => {
    expect(logementsParNuit([ligne("test_place_a", "2027-05-01", "2027-05-02")], "2027-05-01", "2027-05-03")).toBeNull();
    expect(logementsParNuit([ligne("test_place_a", "2027-05-01", "2027-05-03"), ligne("test_place_b", "2027-05-02", "2027-05-03")], "2027-05-01", "2027-05-03")).toBeNull();
    expect(logementsParNuit([], "2027-05-01", "2027-05-02")).toBeNull();
  });

  it("une ligne qui ne couvre aucune nuit (to_date = from_date) n'est lue par aucune nuit", () => {
    expect(logementsParNuit([ligne("test_place_a", "2027-05-01", "2027-05-02"), ligne("test_place_b", "2027-05-02", "2027-05-02")], "2027-05-01", "2027-05-02")).toEqual([
      "test_place_a",
    ]);
    expect(logementsParNuit([ligne("test_place_b", "2027-05-02", "2027-05-02")], "2027-05-01", "2027-05-03")).toBeNull();
  });

  it("voyage sans nuit : aucune ligne lue", () => {
    expect(logementsParNuit([], "2027-05-01", "2027-05-01")).toEqual([]);
  });
});

describe("lecture: verifiedAt depuis la chaîne des versions (B6-PO-6, Q259)", () => {
  type Item = DaySnapshot["items"][number];
  const etape = (id: string, start: string, placeId: string): Item => ({
    type: "stop",
    stop: { id, kind: "activity", placeId, name: "[Étape de test]", start, end: `${String(Number(start.slice(0, 2)) + 1).padStart(2, "0")}:00`, facts: {}, exceptions: [], locked: false },
  });
  const version = (n: number, iso: string, items: Item[], surprisePlaceId = "test_place_s"): VersionDeChaine => ({
    version: n,
    createdAtMs: Date.parse(iso),
    snapshot: TripSnapshotSchema.parse({
      days: [
        {
          index: 1,
          date: "2027-08-01",
          items,
          events: [],
          travelBudgetMinutes: 90,
          surprise: { id: "s", placeId: surprisePlaceId, name: "[Idée]", facts: {}, reason: "[Raison]", source: { label: "[Source]", url: "https://example.org/test" } },
        },
      ],
    }),
  });

  it("date dans le fuseau du voyage", () => {
    expect(dateDansFuseau(Date.parse("2026-10-01T23:30:00Z"), "Europe/Zurich")).toBe("2026-10-02");
    expect(dateDansFuseau(Date.parse("2026-10-01T23:30:00Z"), "America/New_York")).toBe("2026-10-01");
  });

  it("plus ancienne version depuis laquelle l'élément est inchangé (id, placeId, jour, start, end)", () => {
    // chaine[0] : courante (v3).
    const chaine = [
      version(3, "2026-10-09T10:00:00Z", [etape("a", "10:00", "test_place_a"), etape("b", "12:00", "test_place_b"), etape("d", "14:00", "test_place_d")], "test_place_s2"),
      version(2, "2026-10-05T10:00:00Z", [etape("a", "10:00", "test_place_a"), etape("b", "12:00", "test_place_b"), etape("c", "14:00", "test_place_c")]),
      version(1, "2026-10-01T23:30:00Z", [etape("a", "10:00", "test_place_a"), etape("b", "11:00", "test_place_b"), etape("c", "14:00", "test_place_c")]),
    ];
    const date = datesDeVerification(chaine, "Europe/Zurich");
    expect(date(1, { genre: "stop", id: "a", placeId: "test_place_a" })).toBe("2026-10-02");
    expect(date(1, { genre: "stop", id: "b", placeId: "test_place_b" })).toBe("2026-10-05");
    expect(date(1, { genre: "stop", id: "d", placeId: "test_place_d" })).toBe("2026-10-09");
    // Idée « Surprends-moi » : lieu changé en v3.
    expect(date(1, { genre: "surprise", id: "s", placeId: "test_place_s2" })).toBe("2026-10-09");
    // Élément absent de la version courante, ou autre jour : aucune date.
    expect(date(1, { genre: "stop", id: "c", placeId: "test_place_c" })).toBeUndefined();
    expect(date(2, { genre: "stop", id: "a", placeId: "test_place_a" })).toBeUndefined();
  });

  it("chaîne vide : aucune date", () => {
    expect(datesDeVerification([], "Europe/Zurich")(1, { genre: "stop", id: "a", placeId: "test_place_a" })).toBeUndefined();
  });
});

describe("journal de la lecture (B6a point 10 ; 0086 § 4 point 2)", () => {
  it("LOG_READ_REASONS est égale à RAISONS_LECTURE", () => {
    expect([...LOG_READ_REASONS]).toEqual([...RAISONS_LECTURE]);
  });

  it("champs admis : raison de la liste fermée, uuid, entiers ≥ 1", () => {
    const ligne = JSON.parse(
      formatLogLine("voyages.read_failed", { reason: "stay_missing", tripId: "00000000-0000-4000-8000-000000000000", version: 3, dayIndex: 2 }, "error"),
    ) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "error", event: "voyages.read_failed", reason: "stay_missing", tripId: "00000000-0000-4000-8000-000000000000", version: 3, dayIndex: 2 });
  });

  it.each([
    ["reason", "Edinburgh Castle"],
    ["reason", "internal"],
    ["tripId", "mock_trip_edimbourg"],
    ["tripId", "Édimbourg"],
    ["version", 0],
    ["version", 1.5],
    ["version", "3"],
    ["dayIndex", 0],
    ["dayIndex", -1],
    ["placeId", "test_place_a"],
    ["snapshot", { days: [] }],
    ["minutes", 12],
  ])("%s = %j : retiré (dropped)", (cle, valeur) => {
    const ligne = JSON.parse(formatLogLine("voyages.read_failed", { [cle]: valeur }, "error")) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "error", event: "voyages.read_failed", dropped: 1 });
  });

  it("echec : erreur fermée (message = raison), événement selon la raison, aucune donnée", () => {
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const erreur = echec("travel_unknown", { tripId: "00000000-0000-4000-8000-000000000000", version: 2, dayIndex: 1 });
      expect(erreur).toBeInstanceOf(LectureVoyageError);
      expect(erreur).toMatchObject({ name: "LectureVoyageError", reason: "travel_unknown", message: "travel_unknown" });
      expect(erreurs).toHaveBeenCalledTimes(1);
      expect(JSON.parse(String(erreurs.mock.calls[0]?.[0]))).toEqual({
        level: "error",
        event: "voyages.read_failed",
        reason: "travel_unknown",
        tripId: "00000000-0000-4000-8000-000000000000",
        version: 2,
        dayIndex: 1,
      });
      for (const refus of ["quota_reached", "unavailable"] as const) {
        expect(echec(refus, { tripId: "00000000-0000-4000-8000-000000000000" }).message).toBe(refus);
        expect(JSON.parse(String(journal.mock.calls.at(-1)?.[0]))).toEqual({
          level: "warn",
          event: "voyages.relecture_refused",
          reason: refus,
          tripId: "00000000-0000-4000-8000-000000000000",
        });
      }
      expect(erreurs).toHaveBeenCalledTimes(1);
    } finally {
      erreurs.mockRestore();
      journal.mockRestore();
    }
  });
});
