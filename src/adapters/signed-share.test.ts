// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { getTripAdapter } from "./index";
import { createMockShareAdapter } from "./mock-share";
import { signShareToken, verifyShareToken } from "./share-signed-token";
import { createSignedShareAdapter, SHARED_LINK_USER_ID } from "./signed-share";
import { initialShareStore } from "./simulation";
import type { AdapterContext, TripAdapter } from "./types";

/**
 * Adaptateur de partage réel du site d'essai (décision 0135, amendement de 0039 F10-TL-7) : jeton signé sans stockage,
 * session vérifiée pour créer, lecture dans l'organisation du jeton, règle d'expiration de F10-TL-7 point 2.
 */

const CTX: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };
const OTHER: AdapterContext = { organizationId: "mock_org_autre", userId: "user_autre", role: "owner" };
const NOW = Date.parse("2026-08-30T10:40:00+01:00");
const KEY = Buffer.alloc(32, 3);

function setup(options: { now?: number; key?: Buffer | null; session?: boolean } = {}) {
  const clock = { value: options.now ?? NOW };
  const trips = getTripAdapter("mock");
  const contextes: AdapterContext[] = [];
  const lecteurs: string[] = [];
  // Lecteur de la vue partagée espionné : contexte reçu (organisation du jeton) et voyage pour lequel il est construit.
  const shared: TripAdapter = {
    ...trips,
    getTrip: async (ctx, tripId) => {
      contextes.push(ctx);
      return trips.getTrip(ctx, tripId);
    },
  };
  const session = { value: options.session ?? true };
  const adapter = createSignedShareAdapter({
    creatorTrips: trips,
    sharedTrips: (tripId) => {
      lecteurs.push(tripId);
      return shared;
    },
    key: () => (options.key === undefined ? KEY : options.key),
    sessionVerified: async () => session.value,
    now: () => clock.value,
    accessDaysAfterReturn: 30,
  });
  return { adapter, clock, contextes, lecteurs, session };
}

async function created(adapter: ReturnType<typeof setup>["adapter"], ctx = CTX, tripId = EDIMBOURG_DEBLOQUE_TRIP_ID): Promise<string> {
  const result = await adapter.createLink(ctx, tripId);
  if (!result.ok) throw new Error(result.error.code);
  return result.value.token;
}

describe("création du lien (session vérifiée)", () => {
  it("voyage débloqué de l'organisation : jeton signé, fin du partage = accessUntil(end, 30)", async () => {
    const { adapter } = setup();
    const result = await adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(result).toEqual({ ok: true, value: { token: expect.stringMatching(/^v1\./), createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" } });
    if (!result.ok) return;
    expect(verifyShareToken(KEY, result.value.token)).toEqual({
      tripId: EDIMBOURG_DEBLOQUE_TRIP_ID,
      organizationId: MOCK_ORGANIZATION_ID,
      expiresOn: "2026-10-03",
    });
  });

  it("sans session vérifiée : unauthenticated, rien n'est lu", async () => {
    const { adapter } = setup({ session: false });
    expect(await adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "unauthenticated" } });
  });

  it("voyage non débloqué, d'une autre organisation, inconnu, partage terminé ou clé absente : not_found", async () => {
    expect((await setup().adapter.createLink(CTX, EDIMBOURG_TRIP_ID)).ok).toBe(false);
    expect((await setup().adapter.createLink(OTHER, EDIMBOURG_DEBLOQUE_TRIP_ID)).ok).toBe(false);
    expect((await setup().adapter.createLink(CTX, "inconnu")).ok).toBe(false);
    expect((await setup({ now: Date.parse("2026-10-04T00:00:00+01:00") }).adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).ok).toBe(false);
    expect(await setup({ key: null }).adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("aucun lien gardé : état toujours inactif ; désactivation : not_found (révocation hors périmètre, 0135 § 7)", async () => {
    const { adapter } = setup();
    await created(adapter);
    expect(await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: true, value: { active: false } });
    expect(await adapter.getStatus(CTX, EDIMBOURG_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.revokeLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("vue partagée", () => {
  it("même projection que l'adaptateur simulé, sans session pour la lecture", async () => {
    const { adapter, session } = setup();
    const token = await created(adapter);
    session.value = false;
    const fixe = "fixe-de-test-".padEnd(43, "0");
    // Jeton simulé du même voyage : la vue partagée doit être identique, champ par champ.
    const store = initialShareStore();
    const mockAdapter = createMockShareAdapter({ trips: getTripAdapter("mock"), now: () => NOW, store, accessDaysAfterReturn: 30, randomToken: () => fixe });
    await mockAdapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(await adapter.getSharedTrip(token)).toEqual(await mockAdapter.getSharedTrip(fixe));
    expect(await adapter.getSharedDay(token, 2)).toEqual(await mockAdapter.getSharedDay(fixe, 2));
    expect(await adapter.getSharedDay(token, 7)).toBeNull();
  });

  it("lecture dans l'organisation du jeton, par le lecteur de ce seul voyage, sans personne", async () => {
    const { adapter, contextes, lecteurs } = setup();
    const token = await created(adapter);
    await adapter.getSharedTrip(token);
    expect(lecteurs).toEqual([EDIMBOURG_DEBLOQUE_TRIP_ID]);
    expect(contextes).toEqual([{ organizationId: MOCK_ORGANIZATION_ID, userId: SHARED_LINK_USER_ID, role: "member" }]);
  });

  it("jeton signé pour une autre organisation : le voyage n'y est pas, null", async () => {
    const { adapter } = setup();
    const token = signShareToken(KEY, { tripId: EDIMBOURG_DEBLOQUE_TRIP_ID, organizationId: OTHER.organizationId, expiresOn: "2026-10-03" });
    expect(await adapter.getSharedTrip(token)).toBeNull();
  });

  it("jeton altéré, signé par une autre clé, mal formé, ou clé absente : null, sans lire le voyage", async () => {
    const { adapter, lecteurs } = setup();
    const token = await created(adapter);
    const altere = token.slice(0, -2) + (token.endsWith("AA") ? "BB" : "AA");
    const autreCle = signShareToken(Buffer.alloc(32, 9), { tripId: EDIMBOURG_DEBLOQUE_TRIP_ID, organizationId: MOCK_ORGANIZATION_ID, expiresOn: "2026-10-03" });
    const plusLong = signShareToken(Buffer.alloc(32, 9), { tripId: EDIMBOURG_DEBLOQUE_TRIP_ID, organizationId: MOCK_ORGANIZATION_ID, expiresOn: "2099-01-01" });
    for (const value of [altere, autreCle, plusLong, "A".repeat(43), "v1.abc.def"]) {
      expect(await adapter.getSharedTrip(value), value).toBeNull();
      expect(await adapter.getSharedDay(value, 2), value).toBeNull();
    }
    expect(lecteurs).toEqual([]);
    expect(await setup({ key: null }).adapter.getSharedTrip(token)).toBeNull();
  });

  it("jeton d'un voyage non débloqué : null", async () => {
    const { adapter } = setup();
    const token = signShareToken(KEY, { tripId: EDIMBOURG_TRIP_ID, organizationId: MOCK_ORGANIZATION_ID, expiresOn: "2026-10-03" });
    expect(await adapter.getSharedTrip(token)).toBeNull();
  });
});

describe("expiration (décision 0039, F10-TL-7 point 2 ; C32)", () => {
  it("valable le 2026-10-03 à 23:59, 404 le 2026-10-04 à 00:00, heure d'Édimbourg", async () => {
    const { adapter, clock } = setup({ now: Date.parse("2026-10-03T23:59:00+01:00") });
    const token = await created(adapter);
    expect(await adapter.getSharedTrip(token)).not.toBeNull();
    clock.value = Date.parse("2026-10-04T00:00:00+01:00");
    expect(await adapter.getSharedTrip(token)).toBeNull();
    expect(await adapter.getSharedDay(token, 2)).toBeNull();
  });

  it("dernier jour signé plus tôt que celui du voyage : le jour signé l'emporte", async () => {
    const { adapter, clock } = setup();
    const token = signShareToken(KEY, { tripId: EDIMBOURG_DEBLOQUE_TRIP_ID, organizationId: MOCK_ORGANIZATION_ID, expiresOn: "2026-09-10" });
    clock.value = Date.parse("2026-09-10T23:59:00+01:00");
    expect(await adapter.getSharedTrip(token)).not.toBeNull();
    clock.value = Date.parse("2026-09-11T00:00:00+01:00");
    expect(await adapter.getSharedTrip(token)).toBeNull();
  });

  it("expiré dans tout fuseau : refusé sans lire le voyage", async () => {
    const { adapter, lecteurs, clock } = setup();
    const token = await created(adapter);
    clock.value = Date.parse("2026-10-06T00:00:00Z");
    expect(await adapter.getSharedTrip(token)).toBeNull();
    expect(lecteurs).toEqual([]);
  });
});
