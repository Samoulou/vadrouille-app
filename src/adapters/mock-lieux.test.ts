import { describe, expect, it } from "vitest";

import { ApiErrorSchema, PatchResultSchema, PlaceSearchResultsSchema, RevisionPreviewSchema, type Day } from "@/contracts";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { createMockTripAdapter } from "./mock";
import { createMockPlaces, poserAjoutSimule, VERSION_SIMULEE, type PlaceSearchStore } from "./mock-lieux";
import type { AdapterContext } from "./types";

/**
 * Lieu à soi simulé (tâche M5d-1, ticket 939 ; décision 0147 § 3) : mêmes refus que `api`, plafond par voyage et par
 * 24 heures, aucune requête ni résultat gardés, étape ajoutée verrouillée et `addedBy: "person"`.
 */

const CTX: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };
const AUTRE: AdapterContext = { organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" };
const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const DUREES = { activity: 60, lunch: 75, dinner: 90 };

/** Lecteur du voyage simulé, débloqué ou non (le déblocage simulé de la portée est lu par `getTripReader`). */
function lecteur(debloque: boolean) {
  const base = createMockTripAdapter();
  return {
    getTrip: async (ctx: AdapterContext, tripId: string) => {
      const trip = await base.getTrip(ctx, tripId);
      return trip === null ? null : { ...trip, unlocked: debloque };
    },
  };
}

function banc(debloque = true) {
  const store: PlaceSearchStore = { records: [] };
  let now = Date.parse("2026-10-30T10:00:00Z");
  const trips = lecteur(debloque);
  const lieux = createMockPlaces({ trips, store, now: () => now, plafond: 20, durees: DUREES, max: 200 });
  return { store, lieux, trips, avancer: (ms: number) => (now += ms) };
}

/** Premier temps libre d'au moins une heure du voyage simulé : jour et heure de début. */
async function tempsLibre(trips: ReturnType<typeof lecteur>): Promise<{ day: number; time: string }> {
  const trip = await trips.getTrip(CTX, EDIMBOURG_TRIP_ID);
  for (const day of trip?.days ?? []) {
    for (const item of day.items) {
      if (item.type !== "free") continue;
      const [h, m] = item.from.split(":").map(Number);
      const [h2, m2] = item.to.split(":").map(Number);
      if ((h2 ?? 0) * 60 + (m2 ?? 0) - ((h ?? 0) * 60 + (m ?? 0)) >= 60) return { day: day.index, time: item.from };
    }
  }
  throw new Error("aucun temps libre");
}

describe("lieu à soi simulé: recherche", () => {
  it("trois résultats fictifs (adresse facultative) ; « aucun » : liste vide ; seuls organisation, voyage et instant gardés", async () => {
    const { lieux, store } = banc();
    const resultat = await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" });
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(PlaceSearchResultsSchema.parse(resultat.value).map((r) => r.resultId)).toEqual(["mock-lieu-1", "mock-lieu-2", "mock-lieu-3"]);
      expect(resultat.value[2]?.address).toBeUndefined();
    }
    expect(await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "aucun lieu" })).toEqual({ ok: true, value: [] });
    expect(store.records).toHaveLength(2);
    expect(JSON.stringify(store.records)).not.toContain("Café");
  });

  it("refus : sans session, entrée, voyage d'une autre organisation", async () => {
    const { lieux } = banc();
    expect(await lieux.searchPlaces(null, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "C" })).toEqual({ ok: false, error: { code: "validation_failed", field: "query" } });
    expect(await lieux.searchPlaces(AUTRE, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).toEqual({ ok: false, error: { code: "not_found" } });
    const ferme = banc(false);
    expect(await ferme.lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
    expect(ferme.store.records).toEqual([]);
  });

  it("21e recherche du voyage en 24 heures : rate_limited ; admise de nouveau 24 heures plus tard", async () => {
    const { lieux, avancer } = banc();
    for (let i = 0; i < 20; i += 1) expect((await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).ok).toBe(true);
    expect(await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    avancer(86_400_001);
    expect((await lieux.searchPlaces(CTX, { tripId: EDIMBOURG_TRIP_ID, day: 1, query: "Café" })).ok).toBe(true);
  });
});

describe("lieu à soi simulé: aperçu et application", () => {
  it("aperçu add : étape verrouillée, ajoutée par la personne, nom saisi, dans un temps libre ; application : version suivante", async () => {
    const { lieux, trips } = banc();
    const { day, time } = await tempsLibre(trips);
    const demande = { tripId: EDIMBOURG_TRIP_ID, baseVersion: VERSION_SIMULEE, day, time, kind: "activity", name: "Chez Marie", resultId: "mock-lieu-1" };
    const apercu = await lieux.previewAddPlace(CTX, demande);
    expect(apercu.ok).toBe(true);
    if (!apercu.ok) return;
    const lu = RevisionPreviewSchema.parse(apercu.value);
    expect(lu.kind).toBe("add");
    const etape = lu.days[0]?.items.find((i) => i.type === "stop" && i.stop.id === lu.targetStopId);
    expect(etape).toMatchObject({ type: "stop", stop: { name: "Chez Marie", placeId: "mock-lieu-1", locked: true, addedBy: "person", start: time } });
    const applique = await lieux.applyAddPlace(CTX, { ...demande, requestId: REQUETE });
    expect(applique.ok).toBe(true);
    if (applique.ok) expect(PatchResultSchema.parse(applique.value)).toEqual({ version: VERSION_SIMULEE + 1, touchedDays: [day], changes: [{ type: "added", time, label: "Chez Marie" }] });
  });

  it("refus : version de base, jour inconnu, autre organisation, sans requestId à l'application, aucune place (no_option, cause no_room, 0155 § 1.2)", async () => {
    const { lieux, trips } = banc();
    const { day, time } = await tempsLibre(trips);
    const demande = { tripId: EDIMBOURG_TRIP_ID, baseVersion: VERSION_SIMULEE, day, time, kind: "activity", name: "Chez Marie", resultId: "mock-lieu-1" };
    expect(await lieux.previewAddPlace(CTX, { ...demande, baseVersion: 3 })).toEqual({ ok: false, error: { code: "version_conflict", retryable: true, currentVersion: VERSION_SIMULEE } });
    expect(await lieux.previewAddPlace(CTX, { ...demande, day: 30 })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await lieux.previewAddPlace(AUTRE, demande)).toEqual({ ok: false, error: { code: "not_found" } });
    expect((await lieux.applyAddPlace(CTX, demande)).ok).toBe(false);
    const aucunePlace = await lieux.previewAddPlace(CTX, { ...demande, time: "23:30" });
    expect(aucunePlace).toEqual({ ok: false, error: { code: "no_option", cause: "no_room" } });
    if (!aucunePlace.ok) expect(ApiErrorSchema.parse(aucunePlace.error)).toEqual(aucunePlace.error);
    expect(await lieux.applyAddPlace(CTX, { ...demande, requestId: crypto.randomUUID(), time: "23:30" })).toEqual({ ok: false, error: { code: "no_option", cause: "no_room" } });
  });

  it("poserAjoutSimule : un repas ouvert à la même heure est remplacé ; hors d'un temps libre : null", () => {
    const jour: Day = {
      index: 1,
      date: "2027-05-04",
      items: [
        { type: "free", from: "09:00", to: "12:00" },
        { type: "openMeal", meal: "lunch", time: "12:30" },
      ],
    } as unknown as Day;
    const demande = { tripId: EDIMBOURG_TRIP_ID, baseVersion: 1, day: 1, kind: "meal" as const, name: "Chez Marie", resultId: "mock-lieu-1" };
    const repas = poserAjoutSimule(jour, "ajout-x", { ...demande, time: "12:30" }, DUREES);
    expect(repas?.day.items.map((i) => i.type)).toEqual(["free", "stop"]);
    expect(repas?.stop.end).toBe("13:45");
    const activite = poserAjoutSimule(jour, "ajout-x", { ...demande, kind: "activity", time: "10:00" }, DUREES);
    expect(activite?.day.items.map((i) => (i.type === "free" ? `${i.from}-${i.to}` : i.type))).toEqual(["09:00-10:00", "stop", "11:00-12:00", "openMeal"]);
    expect(poserAjoutSimule(jour, "ajout-x", { ...demande, kind: "activity", time: "11:30" }, DUREES)).toBeNull();
  });
});
