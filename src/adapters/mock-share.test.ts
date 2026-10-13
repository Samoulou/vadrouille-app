// @vitest-environment node
import { describe, expect, it } from "vitest";

import { SHARE_TOKEN_DESACTIVE, SHARE_TOKEN_VALIDE } from "@/mocks/edimbourg-partage";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { getTripAdapter } from "./index";
import { createMockShareAdapter, shareEnded, shareExpiresOn } from "./mock-share";
import { hashShareToken, randomShareToken } from "./share-token";
import { initialShareStore, MAX_SHARE_LINKS_PER_SCOPE } from "./simulation";
import type { AdapterContext } from "./types";

/** Adaptateur de partage simulé (spécification F10, F10-TL-7, F10-PO-18, F10-PO-21 ; décision 0039). */

const CTX: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };
const OTHER: AdapterContext = { organizationId: "mock_org_autre", userId: "user_autre", role: "owner" };
const NOW = Date.parse("2026-08-30T10:40:00+01:00");

function setup(now = NOW) {
  const clock = { value: now };
  const store = initialShareStore();
  let serial = 0;
  const adapter = createMockShareAdapter({
    trips: getTripAdapter("mock"),
    now: () => clock.value,
    store,
    accessDaysAfterReturn: 30,
    randomToken: () => {
      serial += 1;
      return `jeton-de-test-${String(serial).padStart(29, "0")}`;
    },
  });
  return { adapter, store, clock };
}

describe("jeton et empreinte", () => {
  it("randomShareToken : 32 octets en base64url (43 caractères), différents à chaque appel", () => {
    const a = randomShareToken();
    const b = randomShareToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
  });

  it("hashShareToken : SHA-256 en hexadécimal, stable", () => {
    expect(hashShareToken("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });
});

describe("fin du partage (F10-PO-21, F10-TL-7 point 2)", () => {
  const trip = { end: "2026-09-03", timeZone: "Europe/London" };

  it("expiresOn = accessUntil(end, 30)", () => {
    expect(shareExpiresOn(trip, 30)).toBe("2026-10-03");
  });

  it("valable le 2026-10-03 à 23:59, terminé le 2026-10-04 à 00:00 (heure d'Édimbourg)", () => {
    expect(shareEnded(trip, Date.parse("2026-10-03T23:59:00+01:00"), 30)).toBe(false);
    expect(shareEnded(trip, Date.parse("2026-10-04T00:00:00+01:00"), 30)).toBe(true);
  });
});

describe("liens fixes du jeu simulé", () => {
  it("la portée ne garde que des empreintes", () => {
    const { store } = setup();
    const text = JSON.stringify([...store.links.entries()]);
    expect(text).not.toContain(SHARE_TOKEN_VALIDE);
    expect(text).not.toContain(SHARE_TOKEN_DESACTIVE);
    expect(store.links.has(hashShareToken(SHARE_TOKEN_VALIDE))).toBe(true);
  });

  it("getStatus : lien actif depuis le 1er août, valable jusqu'au 3 octobre, sans jeton", async () => {
    const { adapter } = setup();
    const result = await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(result).toEqual({ ok: true, value: { active: true, createdAt: "2026-08-01T11:00:00.000Z", expiresOn: "2026-10-03" } });
    expect(JSON.stringify(result)).not.toContain(SHARE_TOKEN_VALIDE);
  });

  it("jeton valide : vue lue ; jeton désactivé, inconnu ou mal formé : null", async () => {
    const { adapter } = setup();
    expect(await adapter.getSharedTrip(SHARE_TOKEN_VALIDE)).not.toBeNull();
    expect(await adapter.getSharedDay(SHARE_TOKEN_VALIDE, 2)).not.toBeNull();
    for (const token of [SHARE_TOKEN_DESACTIVE, "A".repeat(43), "abc", "A".repeat(300)]) {
      expect(await adapter.getSharedTrip(token), token).toBeNull();
      expect(await adapter.getSharedDay(token, 2), token).toBeNull();
    }
  });

  it("jour hors du voyage : null", async () => {
    const { adapter } = setup();
    expect(await adapter.getSharedDay(SHARE_TOKEN_VALIDE, 7)).toBeNull();
  });

  it("partage terminé : null le 2026-10-04 à 00:00, la vue reste lue le 2026-10-03 à 23:59", async () => {
    const { adapter, clock } = setup(Date.parse("2026-10-03T23:59:00+01:00"));
    expect(await adapter.getSharedTrip(SHARE_TOKEN_VALIDE)).not.toBeNull();
    clock.value = Date.parse("2026-10-04T00:00:00+01:00");
    expect(await adapter.getSharedTrip(SHARE_TOKEN_VALIDE)).toBeNull();
  });
});

describe("créer, remplacer, désactiver", () => {
  it("création : jeton en clair dans la réponse seulement ; l'ancien lien est désactivé (un seul lien actif)", async () => {
    const { adapter, store } = setup();
    const created = await adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID);
    if (!created.ok) throw new Error(created.error.code);
    expect(created.value).toEqual({ token: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/), createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" });
    expect(JSON.stringify([...store.links.values()])).not.toContain(created.value.token);
    expect(await adapter.getSharedTrip(SHARE_TOKEN_VALIDE)).toBeNull();
    expect(await adapter.getSharedTrip(created.value.token)).not.toBeNull();
    const active = [...store.links.values()].filter((record) => record.tripId === EDIMBOURG_DEBLOQUE_TRIP_ID && record.revokedAt === undefined);
    expect(active).toHaveLength(1);
    expect(await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({
      ok: true,
      value: { active: true, createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" },
    });
  });

  it("désactivation : aucun lien actif ; le jeton ne fonctionne plus et ne se réactive pas", async () => {
    const { adapter } = setup();
    expect(await adapter.revokeLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: true, value: { active: false } });
    expect(await adapter.getSharedTrip(SHARE_TOKEN_VALIDE)).toBeNull();
    expect(await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: true, value: { active: false } });
  });

  it("voyage non débloqué, d'une autre organisation ou inconnu : not_found, aucun lien créé ni désactivé", async () => {
    const { adapter, store } = setup();
    const before = JSON.stringify([...store.links.values()]);
    expect(await adapter.createLink(CTX, EDIMBOURG_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.createLink(OTHER, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.revokeLink(OTHER, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.getStatus(OTHER, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await adapter.createLink(CTX, "mock_trip_inconnu")).toEqual({ ok: false, error: { code: "not_found" } });
    expect(JSON.stringify([...store.links.values()])).toBe(before);
  });

  it("partage terminé : création refusée ; désactivation et état restent possibles", async () => {
    const { adapter } = setup(Date.parse("2026-10-04T00:00:00+01:00"));
    expect(await adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: false, error: { code: "not_found" } });
    expect((await adapter.getStatus(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).ok).toBe(true);
    expect(await adapter.revokeLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID)).toEqual({ ok: true, value: { active: false } });
  });

  it(`au plus ${MAX_SHARE_LINKS_PER_SCOPE} liens créés par portée ; les liens fixes restent`, async () => {
    const { adapter, store } = setup();
    for (let i = 0; i < MAX_SHARE_LINKS_PER_SCOPE + 5; i += 1) await adapter.createLink(CTX, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect([...store.links.values()].filter((record) => !record.fixed)).toHaveLength(MAX_SHARE_LINKS_PER_SCOPE);
    expect([...store.links.values()].filter((record) => record.fixed)).toHaveLength(2);
  });
});
