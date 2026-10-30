import { describe, expect, it } from "vitest";

import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "@/mocks/edimbourg";

import { createMockTripAdapter } from "./mock";
import { createMockTripVersions, type TripVersionsStore } from "./mock-versions";
import type { AdapterContext } from "./types";

/**
 * Versions simulées (tâche M5b, ticket 934 ; décision 0147 § 5.3) : historique créé à la première lecture, refus dans le
 * même ordre que `api`, version proposée après le déblocage seulement, retour écrit comme une version, rejeu par
 * `requestId`, « Annuler » = retour ordinaire, borne du nombre de versions, isolation par organisation.
 */

const CTX: AdapterContext = { organizationId: MOCK_ORGANIZATION_ID, userId: MOCK_USER_ID, role: "owner" };
const AUTRE: AdapterContext = { organizationId: "mock_org_autre", userId: "mock_user_autre", role: "owner" };
const TRIP = EDIMBOURG_DEBLOQUE_TRIP_ID;
const uuid = (n: number) => `0e000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function banc(max = 200) {
  const store: TripVersionsStore = { records: [], unlockedAt: new Map() };
  const versions = createMockTripVersions({ trips: createMockTripAdapter(), store, now: () => Date.parse("2026-10-29T10:00:00Z"), max });
  return { store, versions };
}

describe("versions simulées", () => {
  it("liste : de la plus récente à la plus ancienne, « actuelle » sur la première, v1 avant le déblocage", async () => {
    const { versions } = banc();
    const page = await versions.listTripVersions(CTX, { tripId: TRIP });
    if (!page.ok) throw new Error("refus");
    expect(page.value.items.map((i) => [i.version, i.kind, i.current, i.revertible])).toEqual([
      [4, "unlocked", true, false],
      [3, "locked", false, true],
      [2, "complete", false, true],
      [1, "prepared", false, false],
    ]);
    expect(page.value.nextBefore).toBeNull();
    const suite = await versions.listTripVersions(CTX, { tripId: TRIP, before: 3 });
    expect(suite.ok && suite.value.items.map((i) => i.version)).toEqual([2, 1]);
  });

  it("refus : sans session, entrée invalide, voyage inconnu ou d'une autre organisation, voyage non débloqué", async () => {
    const { versions } = banc();
    expect(await versions.listTripVersions(null, { tripId: TRIP })).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    expect(await versions.listTripVersions(CTX, { tripId: TRIP, extra: 1 })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(await versions.listTripVersions(AUTRE, { tripId: TRIP })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await versions.listTripVersions(CTX, { tripId: EDIMBOURG_TRIP_ID })).toMatchObject({ ok: false, error: { code: "not_unlocked" } });
  });

  it("aperçu : conflit de base, version non proposée (`toVersion`), changements de l'étape simulée", async () => {
    const { versions } = banc();
    expect(await versions.previewRevert(CTX, { tripId: TRIP, baseVersion: 3, toVersion: 2 })).toMatchObject({ ok: false, error: { code: "version_conflict", currentVersion: 4 } });
    expect(await versions.previewRevert(CTX, { tripId: TRIP, baseVersion: 4, toVersion: 1 })).toMatchObject({ ok: false, error: { code: "validation_failed", field: "toVersion" } });
    expect(await versions.previewRevert(CTX, { tripId: TRIP, baseVersion: 4, toVersion: 4 })).toMatchObject({ ok: false, error: { code: "validation_failed", field: "toVersion" } });
    const apercu = await versions.previewRevert(CTX, { tripId: TRIP, baseVersion: 4, toVersion: 3 });
    expect(apercu.ok && apercu.value.changes.map((c) => c.type)).toEqual(["locked"]);
    // Le jeu simulé a déjà une étape verrouillée (engagement) : la phrase des étapes verrouillées est due.
    expect(apercu.ok && apercu.value.currentHasLockedStop).toBe(true);
    const rien = await versions.previewRevert(CTX, { tripId: TRIP, baseVersion: 4, toVersion: 2 });
    expect(rien.ok && rien.value.changes).toEqual([]);
  });

  it("retour : une version `reverted`, rejeu idempotent, « Annuler » = retour ordinaire vers la version d'avant", async () => {
    const { versions } = banc();
    const ecrit = await versions.applyRevert(CTX, { tripId: TRIP, requestId: uuid(1), baseVersion: 4, toVersion: 3 });
    expect(ecrit).toMatchObject({ ok: true, value: { version: 5 } });
    expect(await versions.applyRevert(CTX, { tripId: TRIP, requestId: uuid(1), baseVersion: 4, toVersion: 3 })).toEqual(ecrit);
    const page = await versions.listTripVersions(CTX, { tripId: TRIP });
    expect(page.ok && page.value.items[0]).toMatchObject({ version: 5, kind: "reverted", current: true, revertedTo: { version: 3 } });
    const annule = await versions.applyRevert(CTX, { tripId: TRIP, requestId: uuid(2), baseVersion: 5, toVersion: 4 });
    expect(annule).toMatchObject({ ok: true, value: { version: 6, changes: [{ type: "unlocked" }] } });
  });

  it("borne du nombre de versions : `validation_failed` sur `baseVersion`, rien d'écrit", async () => {
    const { versions, store } = banc(4);
    await versions.listTripVersions(CTX, { tripId: TRIP });
    const avant = store.records.length;
    expect(await versions.applyRevert(CTX, { tripId: TRIP, requestId: uuid(3), baseVersion: 4, toVersion: 3 })).toMatchObject({
      ok: false,
      error: { code: "validation_failed", field: "baseVersion" },
    });
    expect(store.records).toHaveLength(avant);
  });
});
