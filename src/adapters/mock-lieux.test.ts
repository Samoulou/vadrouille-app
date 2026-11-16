import { describe, expect, it } from "vitest";

import { ApiErrorSchema, PatchResultSchema, PlaceSearchResultsSchema, RevisionPreviewSchema, type Day } from "@/contracts";
import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";
import { marqueAuMoment } from "@/server/lieux/marque";

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

function banc(debloque = true, depart = "2026-10-30T10:00:00Z") {
  const store: PlaceSearchStore = { records: [] };
  let now = Date.parse(depart);
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

describe("lieu à soi simulé: annulation d'un ajout (M5d-6, ticket 994 ; décision 0155 § 4.1)", () => {
  it("même signature que api : version 2 d'un ajout simulé → version 3 ; autre version : version_conflict ; refus d'entrée, de session, de voyage et de déblocage", async () => {
    const { lieux } = banc();
    const annulation = { tripId: EDIMBOURG_TRIP_ID, requestId: REQUETE, version: VERSION_SIMULEE + 1 };
    const annule = await lieux.undoAddPlace(CTX, annulation);
    expect(annule).toEqual({ ok: true, value: { version: VERSION_SIMULEE + 2, touchedDays: [], changes: [] } });
    if (annule.ok) expect(PatchResultSchema.parse(annule.value)).toEqual(annule.value);
    expect(await lieux.undoAddPlace(CTX, { ...annulation, version: VERSION_SIMULEE })).toEqual({ ok: false, error: { code: "version_conflict", retryable: true, currentVersion: VERSION_SIMULEE } });
    expect(await lieux.undoAddPlace(null, annulation)).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await lieux.undoAddPlace(CTX, { ...annulation, baseVersion: 1 })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(await lieux.undoAddPlace(CTX, { ...annulation, requestId: "x" })).toEqual({ ok: false, error: { code: "validation_failed", field: "requestId" } });
    expect(await lieux.undoAddPlace(AUTRE, annulation)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await banc(false).lieux.undoAddPlace(CTX, annulation)).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
  });
});

/**
 * M8b (ticket 1111 ; spécification M8 § 4.1 et § 6.4, critère M8b-1 ; décision 0160 § 1.4 point 4 et § 3.4) : la marque de
 * l'ajout simulé suit la même règle que `api` (`marqueAuMoment`, calcul unique), à l'horloge de la portée. Édimbourg simulé :
 * 2026-08-29 au 2026-09-03, `Europe/London`.
 */
describe("adresse découverte simulée: marque calculée à l'horloge de la portée (M8b)", () => {
  const marqueLe = async (instant: string, jour?: number) => {
    const { lieux, trips } = banc(true, instant);
    const libre = await tempsLibre(trips);
    const trip = await trips.getTrip(CTX, EDIMBOURG_TRIP_ID);
    if (trip === null) throw new Error("voyage simulé absent");
    const day = jour ?? libre.day;
    const cible = trip.days.find((d) => d.index === day);
    const creneau = cible?.items.find((item) => item.type === "free");
    if (creneau?.type !== "free") return { day, marque: null, attendue: marqueAuMoment(trip, day, Date.parse(instant)) };
    const demande = { tripId: EDIMBOURG_TRIP_ID, baseVersion: VERSION_SIMULEE, day, time: creneau.from, kind: "activity", name: "Trouvé sur place", resultId: "mock-lieu-1" };
    const apercu = await lieux.previewAddPlace(CTX, demande);
    if (!apercu.ok) return { day, marque: null, attendue: marqueAuMoment(trip, day, Date.parse(instant)) };
    const lu = RevisionPreviewSchema.parse(apercu.value);
    const etape = lu.days[0]?.items.find((i) => i.type === "stop" && i.stop.id === lu.targetStopId);
    return { day, marque: etape?.type === "stop" ? (etape.stop.addedBy ?? null) : null, attendue: marqueAuMoment(trip, day, Date.parse(instant)) };
  };

  it("le voyage simulé est celui de la spécification", async () => {
    const trip = await lecteur(true).getTrip(CTX, EDIMBOURG_TRIP_ID);
    expect(trip).toMatchObject({ start: "2026-08-29", end: "2026-09-03", timeZone: "Europe/London" });
  });

  it("pendant le voyage, pour un jour passé ou d'aujourd'hui : discovered ; avant ou après le voyage : person", async () => {
    // Dernier jour à midi (Londres) : tout jour du voyage est passé ou d'aujourd'hui.
    expect((await marqueLe("2026-09-03T12:00:00+01:00")).marque).toBe("discovered");
    // Lendemain du dernier jour, minuit à Londres : plus d'adresse découverte.
    expect((await marqueLe("2026-09-04T00:00:00+01:00")).marque).toBe("person");
    // Veille du premier jour à 23:30 à Londres (déjà le 29.08 à Zurich) : lieu à soi préparé.
    expect((await marqueLe("2026-08-28T23:30:00+01:00")).marque).toBe("person");
    expect((await marqueLe("2026-08-20T12:00:00+01:00")).marque).toBe("person");
  });

  it("même marque que api (marqueAuMoment) pour chaque jour du voyage qui a un temps libre, le 31.08 à midi", async () => {
    const vues: string[] = [];
    for (const jour of [1, 2, 3, 4, 5, 6]) {
      const { marque, attendue } = await marqueLe("2026-08-31T12:00:00+01:00", jour);
      if (marque === null) continue;
      expect(marque, `J${String(jour)}`).toBe(attendue);
      expect(attendue, `J${String(jour)}`).toBe(jour <= 3 ? "discovered" : "person");
      vues.push(marque);
    }
    expect(vues.length).toBeGreaterThan(0);
  });

  it("poserAjoutSimule : person par défaut, la marque reçue sinon ; la demande stricte n'a aucun champ pour elle", async () => {
    const { lieux, trips } = banc(true, "2026-09-03T12:00:00+01:00");
    const { day, time } = await tempsLibre(trips);
    const trip = await trips.getTrip(CTX, EDIMBOURG_TRIP_ID);
    const jour = trip?.days.find((d) => d.index === day);
    if (jour === undefined) throw new Error("jour absent");
    const demande = { tripId: EDIMBOURG_TRIP_ID, baseVersion: VERSION_SIMULEE, day, time, kind: "activity" as const, name: "Trouvé sur place", resultId: "mock-lieu-1" };
    expect(poserAjoutSimule(jour, "ajout-x", demande, DUREES)?.stop.addedBy).toBe("person");
    expect(poserAjoutSimule(jour, "ajout-x", demande, DUREES, "discovered")?.stop.addedBy).toBe("discovered");
    for (const extra of [{ addedBy: "discovered" }, { addedBy: "person" }]) {
      const refuse = await lieux.previewAddPlace(CTX, { ...demande, ...extra });
      expect(refuse.ok ? null : refuse.error.code, JSON.stringify(extra)).toBe("validation_failed");
      const applique = await lieux.applyAddPlace(CTX, { ...demande, requestId: REQUETE, ...extra });
      expect(applique.ok ? null : applique.error.code, JSON.stringify(extra)).toBe("validation_failed");
    }
  });
});
