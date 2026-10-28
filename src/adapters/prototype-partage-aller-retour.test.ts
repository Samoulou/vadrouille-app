// @vitest-environment node
import { realpathSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { getShareAdapter, shareAvailable } from "./index";
import { clePartageEssai } from "./prototype-instance";
import { verifyShareToken } from "./share-signed-token";
import { explicitScope } from "./simulation";
import type { AdapterContext } from "./types";

/** `getShareAdapter` avec `DATA_ADAPTER=prototype` (décision 0135) : aller-retour en mode « dossier », sans base. */

const TEST_DIR = realpathSync(join(process.cwd(), "prototype", "programmes-test"));
const TEST_ID = "proto_test_20261012_1";
const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("getShareAdapter, partage réel", () => {
  it("lien créé pour un voyage débloqué, lu sans session ; rien d'interne dans la vue ; garde fermée en production", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("DATA_ADAPTER", "prototype");
    vi.stubEnv("VADROUILLE_PROTOTYPE_DIR", TEST_DIR);
    expect(shareAvailable()).toBe(true);
    const scope = explicitScope("partage-reel-test");
    scope.clock.set(Date.parse("2026-11-01T10:00:00Z"));
    const adapter = getShareAdapter({ scope });
    const created = await adapter.createLink(CTX, TEST_ID);
    if (!created.ok) throw new Error(created.error.code);
    expect(created.value.expiresOn).toBe("2026-12-24");
    expect(verifyShareToken(clePartageEssai()!, created.value.token)).toEqual({ tripId: TEST_ID, organizationId: PROTOTYPE_ORG_ID, expiresOn: "2026-12-24" });
    const vue = await adapter.getSharedTrip(created.value.token);
    expect(vue?.trip.days).toHaveLength(2);
    expect(JSON.stringify(vue)).not.toContain(TEST_ID);
    expect(JSON.stringify(vue)).not.toContain(PROTOTYPE_ORG_ID);
    expect(await adapter.getSharedDay(created.value.token, 1)).not.toBeNull();
    expect(await adapter.getStatus(CTX, TEST_ID)).toEqual({ ok: true, value: { active: false } });
    vi.stubEnv("VERCEL_ENV", "production");
    expect(shareAvailable()).toBe(false);
    expect(() => getShareAdapter({ scope })).toThrow(/partage indisponible/);
  });
});
