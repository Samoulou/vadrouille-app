import { afterEach, describe, expect, it, vi } from "vitest";

import { EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { createMockTripAdapter } from "./mock";
import { createMockStopReports } from "./mock-reports";
import type { StopReportStore } from "./simulation";
import type { AdapterContext } from "./types";

/**
 * Signalement simulé (tâche M5c ; décision 0147 § 1 et § 2) : mêmes refus et même ordre que `api`, idempotence, doublon
 * avant le plafond, plafond par voyage et par jour UTC, isolation par organisation. Aucun texte n'est gardé.
 */

const CTX: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };
const AUTRE: AdapterContext = { organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" };
const uuid = (n: number) => `0d000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function banc(start = Date.parse("2026-10-29T10:00:00Z")) {
  const store: StopReportStore = { records: [] };
  let now = start;
  const reports = createMockStopReports({ trips: createMockTripAdapter(), store, now: () => now, plafond: 20, max: 200 });
  return { store, reports, avancer: (ms: number) => (now += ms), poser: (ms: number) => (now = ms) };
}

const entree = (extra: Record<string, unknown> = {}) => ({ tripId: EDIMBOURG_TRIP_ID, stopId: "j2-dean-village", reason: "closed", requestId: uuid(1), ...extra });

describe("signalement simulé", () => {
  it("enregistre motif, étape, placeId, requestId, sans texte ; rien d'autre", async () => {
    const { reports, store } = banc();
    expect(await reports.reportStop(CTX, entree())).toEqual({ ok: true, value: null });
    expect(store.records).toEqual([
      {
        organizationId: MOCK_ORGANIZATION_ID,
        tripId: EDIMBOURG_TRIP_ID,
        stopId: "j2-dean-village",
        placeId: "mock_place_dean_village",
        reason: "closed",
        requestId: uuid(1),
        createdAt: Date.parse("2026-10-29T10:00:00Z"),
      },
    ]);
  });

  it("refus : sans session, entrée (texte, motif inconnu), voyage d'une autre organisation, étape inconnue, événement, engagement", async () => {
    const { reports, store } = banc();
    expect(await reports.reportStop(null, entree())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await reports.reportStop(CTX, entree({ text: "x" }))).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(await reports.reportStop(CTX, entree({ reason: "dirty" }))).toEqual({ ok: false, error: { code: "validation_failed", field: "reason" } });
    expect(await reports.reportStop(AUTRE, entree())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await reports.reportStop(CTX, entree({ stopId: "j9-inconnue" }))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await reports.reportStop(CTX, entree({ stopId: "j2-concert-orgue" }))).toEqual({ ok: false, error: { code: "validation_failed", field: "stopId" } });
    expect(await reports.reportStop(CTX, entree({ stopId: "j1-tattoo" }))).toEqual({ ok: false, error: { code: "validation_failed", field: "stopId" } });
    expect(store.records).toEqual([]);
  });

  it("signalement: idempotent : même requestId, ou même motif sur la même étape, ne crée qu'un enregistrement", async () => {
    const { reports, store } = banc();
    await reports.reportStop(CTX, entree());
    expect(await reports.reportStop(CTX, entree())).toEqual({ ok: true, value: null });
    expect(await reports.reportStop(CTX, entree({ requestId: uuid(2) }))).toEqual({ ok: true, value: null });
    expect(store.records).toHaveLength(1);
    expect(await reports.reportStop(CTX, entree({ requestId: uuid(3), reason: "hours" }))).toEqual({ ok: true, value: null });
    expect(store.records).toHaveLength(2);
  });

  it("signalement: plafond : le 21e du jour UTC rend rate_limited ; un doublon passe encore ; minuit UTC remet à zéro", async () => {
    const { reports, store, poser } = banc(Date.parse("2026-10-29T22:30:00Z"));
    const etapes = ["j1-chateau", "j1-diner", "j2-royal-mile", "j2-dean-village", "j2-jardin-botanique"];
    const motifs = ["closed", "hours", "wrongPlace", "price"];
    let n = 0;
    for (const stopId of etapes) for (const reason of motifs) await reports.reportStop(CTX, entree({ stopId, reason, requestId: uuid(100 + n++) }));
    expect(store.records).toHaveLength(20);
    expect(await reports.reportStop(CTX, entree({ stopId: "j2-dean-village", reason: "other", requestId: uuid(999) }))).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(await reports.reportStop(CTX, entree({ requestId: uuid(100) }))).toEqual({ ok: true, value: null });
    // 23:30 à Zurich le 29 est déjà le 30 en heure locale, pas en UTC : toujours le même jour UTC.
    poser(Date.parse("2026-10-29T23:59:00Z"));
    expect(await reports.reportStop(CTX, entree({ stopId: "j2-dean-village", reason: "other", requestId: uuid(999) }))).toEqual({ ok: false, error: { code: "rate_limited" } });
    poser(Date.parse("2026-10-30T00:00:00Z"));
    expect(await reports.reportStop(CTX, entree({ stopId: "j2-dean-village", reason: "other", requestId: uuid(999) }))).toEqual({ ok: true, value: null });
    expect(store.records).toHaveLength(21);
  });

  it("journée que le lecteur ne sert pas (avant le déblocage) : not_found, même pour un engagement, jamais validation_failed", async () => {
    // Le mock lit les jours servis par le lecteur de la portée (`getTripReader`) ; un lecteur qui ne sert pas le J1 (journée
    // cachée avant le déblocage, 0136 § 3.5) rend l'engagement `j1-tattoo` introuvable, comme `api` (0147 § 1 point 4 d).
    const lecteur = createMockTripAdapter();
    const store: StopReportStore = { records: [] };
    const reports = createMockStopReports({
      trips: {
        getTrip: async (ctx, tripId) => {
          const trip = await lecteur.getTrip(ctx, tripId);
          return trip === null ? null : { ...trip, days: trip.days.filter((jour) => jour.index !== 1) };
        },
      },
      store,
      now: () => Date.parse("2026-10-29T10:00:00Z"),
      plafond: 20,
      max: 200,
    });
    expect(await reports.reportStop(CTX, entree({ stopId: "j1-tattoo" }))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await reports.reportStop(CTX, entree({ stopId: "j1-chateau" }))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(store.records).toEqual([]);
  });

  it("signalement: rien ne change : programme et liste « À faire » identiques, aucun appel réseau (modèle, Google)", async () => {
    const lecteur = createMockTripAdapter();
    const reseau = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("réseau interdit pendant un signalement"));
    const { reports } = banc();
    const avant = structuredClone(await lecteur.getTrip(CTX, EDIMBOURG_TRIP_ID));
    expect(await reports.reportStop(CTX, entree())).toEqual({ ok: true, value: null });
    expect(await lecteur.getTrip(CTX, EDIMBOURG_TRIP_ID)).toEqual(avant);
    expect(avant?.checklist.length).toBeGreaterThan(0);
    expect(reseau).not.toHaveBeenCalled();
  });
});

afterEach(() => vi.restoreAllMocks());
