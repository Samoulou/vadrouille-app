// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { resetScope } from "@/adapters/simulation";
import { SHARE_TOKEN_VALIDE } from "@/mocks/edimbourg-partage";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { createShareLink, getShareStatus, revokeShareLink } from "./partage";

const scopeName = vi.hoisted(() => ({ value: "partage-1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }) }));
const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle", userId: "mock_user_proprietaire", role: "owner" as const }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return {
    ...actual,
    getRequestContext: vi.fn(() => ({ ...contextMock })),
    getShareAdapter: vi.fn(actual.getShareAdapter),
    getSimulationScope: vi.fn(actual.getSimulationScope),
  };
});

/** Le serveur fait foi (spécification F10, F10-PO-17, C35, C38 ; décision 0020 § 11). */

const NOW = Date.parse("2026-08-30T10:40:00+01:00");
const TRIP = EDIMBOURG_DEBLOQUE_TRIP_ID;
const ACTIONS = { createShareLink, revokeShareLink, getShareStatus };

let serial = 0;
beforeEach(() => {
  serial += 1;
  scopeName.value = `partage-${serial}`;
  resetScope(scopeName.value, NOW);
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
  vi.mocked(adapters.getShareAdapter).mockClear();
  vi.mocked(adapters.getRequestContext).mockClear();
  vi.mocked(adapters.getSimulationScope).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("partage.ts", () => {
  it("commence par « use server »", () => {
    const source = readFileSync(join(process.cwd(), "src/server/actions/partage.ts"), "utf8");
    expect(source.startsWith('"use server";')).toBe(true);
  });
});

describe.each(Object.entries(ACTIONS))("%s", (_name, action) => {
  it.each([
    ["voyage absent", {}],
    ["tripId vide", { tripId: "" }],
    ["champ en trop (organisation du navigateur)", { tripId: TRIP, organizationId: "mock_org_autre" }],
    ["entrée qui n'est pas un objet", TRIP],
  ])("%s : validation_failed sans appel à l'adaptateur", async (_label, input) => {
    const result = await action(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.code).toBe("validation_failed");
    expect(adapters.getShareAdapter).not.toHaveBeenCalled();
  });

  it("garde fermée (DATA_ADAPTER=api) : not_found, sans appel à l'adaptateur ni au contexte", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    expect(await action({ tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(adapters.getShareAdapter).not.toHaveBeenCalled();
    expect(adapters.getRequestContext).not.toHaveBeenCalled();
    expect(adapters.getSimulationScope).not.toHaveBeenCalled();
  });

  it("garde fermée (déploiement de production) : not_found, sans appel à l'adaptateur ni au contexte", async () => {
    vi.stubEnv("VADROUILLE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_SHARE", "1");
    expect(await action({ tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(adapters.getShareAdapter).not.toHaveBeenCalled();
    expect(adapters.getRequestContext).not.toHaveBeenCalled();
  });

  it("voyage d'une autre organisation : not_found", async () => {
    contextMock.organizationId = "mock_org_autre";
    expect(await action({ tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
  });
});

describe("createShareLink", () => {
  it("voyage non débloqué : not_found (C27)", async () => {
    expect(await createShareLink({ tripId: EDIMBOURG_TRIP_ID })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("voyage d'une autre organisation : aucun lien n'existe ensuite (C35)", async () => {
    contextMock.organizationId = "mock_org_autre";
    expect(await createShareLink({ tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    // Le lien fixe reste le seul actif : sa date de création est inchangée.
    expect(await getShareStatus({ tripId: TRIP })).toMatchObject({ ok: true, value: { createdAt: "2026-08-01T11:00:00.000Z" } });
  });

  it("partage terminé : not_found (C32)", async () => {
    resetScope(scopeName.value, Date.parse("2026-10-04T00:00:00+01:00"));
    expect(await createShareLink({ tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("un seul lien actif : la création désactive le précédent", async () => {
    const first = await createShareLink({ tripId: TRIP });
    const second = await createShareLink({ tripId: TRIP });
    if (!first.ok || !second.ok) throw new Error("création refusée");
    const scope = await adapters.getSimulationScope();
    const share = adapters.getShareAdapter({ scope });
    expect(await share.getSharedTrip(first.value.token)).toBeNull();
    expect(await share.getSharedTrip(second.value.token)).not.toBeNull();
    expect(await share.getSharedTrip(SHARE_TOKEN_VALIDE)).toBeNull();
  });
});

describe("getShareStatus", () => {
  it("ne renvoie jamais le jeton, avant comme après une création", async () => {
    const created = await createShareLink({ tripId: TRIP });
    if (!created.ok) throw new Error("création refusée");
    const status = await getShareStatus({ tripId: TRIP });
    expect(status).toEqual({ ok: true, value: { active: true, createdAt: "2026-08-30T09:40:00.000Z", expiresOn: "2026-10-03" } });
    expect(JSON.stringify(status)).not.toContain(created.value.token);
  });
});

describe("journaux : le jeton n'est jamais écrit (C35)", () => {
  it("cycle complet : création, lecture de la vue, désactivation", async () => {
    const written: string[] = [];
    const capture = (...args: unknown[]) => {
      written.push(args.map((value) => (typeof value === "string" ? value : JSON.stringify(value))).join(" "));
    };
    for (const method of ["log", "info", "warn", "error", "debug", "trace"] as const) {
      vi.spyOn(console, method).mockImplementation(capture);
    }
    vi.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });
    vi.spyOn(process.stderr, "write").mockImplementation((chunk) => {
      written.push(String(chunk));
      return true;
    });

    const created = await createShareLink({ tripId: TRIP });
    if (!created.ok) throw new Error("création refusée");
    const scope = await adapters.getSimulationScope();
    const share = adapters.getShareAdapter({ scope });
    expect(await share.getSharedTrip(created.value.token)).not.toBeNull();
    expect(await share.getSharedDay(created.value.token, 2)).not.toBeNull();
    await getShareStatus({ tripId: TRIP });
    expect(await revokeShareLink({ tripId: TRIP })).toEqual({ ok: true, value: { active: false } });
    expect(await share.getSharedTrip(created.value.token)).toBeNull();

    for (const line of written) {
      expect(line).not.toContain(created.value.token);
      expect(line).not.toContain(SHARE_TOKEN_VALIDE);
    }
  });
});
