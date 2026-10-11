// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { getCheckoutStatus, simulateCheckoutOutcome, startCheckout } from "./paiement";

const scopeName = vi.hoisted(() => ({ value: "actions-1" }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-vadrouille-simulation": scopeName.value }) }));
const revalidate = vi.hoisted(() => vi.fn());
vi.mock("next/cache", () => ({ revalidatePath: revalidate }));
const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle" }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return {
    ...actual,
    getRequestContext: () => ({ ...contextMock }),
    getPaymentAdapter: vi.fn(actual.getPaymentAdapter),
    getPaymentSimulator: vi.fn(actual.getPaymentSimulator),
  };
});

/** Le serveur fait foi (F9-PO-7, décision 0020 § 11). */

const TRIP = "mock_trip_edimbourg";

let serial = 0;
beforeEach(() => {
  serial += 1;
  scopeName.value = `actions-${serial}`;
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
  vi.mocked(adapters.getPaymentAdapter).mockClear();
  vi.mocked(adapters.getPaymentSimulator).mockClear();
  revalidate.mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

async function started(method: "twint" | "card" = "twint") {
  const result = await startCheckout({ tripId: TRIP, method });
  if (!result.ok) throw new Error(result.error.code);
  return result.value;
}

describe("startCheckout", () => {
  it.each([
    ["moyen hors schéma", { tripId: TRIP, method: "paypal" }, "method"],
    ["champ amount ajouté", { tripId: TRIP, method: "card", amount: 1 }, undefined],
    ["tripId vide", { tripId: "", method: "card" }, "tripId"],
    ["entrée qui n'est pas un objet", "mock_trip_edimbourg", undefined],
  ])("%s : validation_failed sans appel à l'adaptateur", async (_label, input, field) => {
    const result = await startCheckout(input);
    expect(result).toEqual({ ok: false, error: field ? { code: "validation_failed", field } : { code: "validation_failed" } });
    expect(adapters.getPaymentAdapter).not.toHaveBeenCalled();
  });

  it("le montant vient de la configuration : un amount du navigateur n'est jamais lu", async () => {
    const result = await startCheckout({ tripId: TRIP, method: "card", amount: 1 });
    expect(result.ok).toBe(false);
    const { checkoutId } = await started("card");
    const status = await getCheckoutStatus({ checkoutId });
    expect(status).toMatchObject({ ok: true, value: { amount: 2900, currency: "CHF", priceVariant: "chf_29", status: "pending" } });
  });

  it("redirectUrl : la page de paiement simulé, chemin de l'application", async () => {
    const start = await started();
    expect(start.redirectUrl).toBe(`/voyages/${TRIP}/debloquer/paiement-simule/${start.checkoutId}`);
    expect(start.checkoutId).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("voyage d'une autre organisation ou inconnu : not_found, sans paiement créé", async () => {
    contextMock.organizationId = "mock_org_autre";
    expect(await startCheckout({ tripId: TRIP, method: "card" })).toEqual({ ok: false, error: { code: "not_found" } });
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    expect(await startCheckout({ tripId: "inconnu", method: "card" })).toEqual({ ok: false, error: { code: "not_found" } });
  });

  it("voyage déjà débloqué : already_unlocked", async () => {
    expect(await startCheckout({ tripId: "mock_trip_edimbourg_debloque", method: "card" })).toEqual({
      ok: false,
      error: { code: "already_unlocked" },
    });
    const { checkoutId } = await started();
    await simulateCheckoutOutcome({ checkoutId, outcome: "succeeded" });
    expect(await startCheckout({ tripId: TRIP, method: "card" })).toEqual({ ok: false, error: { code: "already_unlocked" } });
  });
});

describe("simulateCheckoutOutcome et getCheckoutStatus", () => {
  it("entrée hors schéma : validation_failed sans appel", async () => {
    expect(await simulateCheckoutOutcome({ checkoutId: "court", outcome: "succeeded" })).toEqual({
      ok: false,
      error: { code: "validation_failed", field: "checkoutId" },
    });
    expect(await simulateCheckoutOutcome({ checkoutId: "AAAAAAAAAAAAAAAAAAAAAA", outcome: "refunded" })).toMatchObject({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(await getCheckoutStatus({ checkoutId: "AAAAAAAAAAAAAAAAAAAAAA", tripId: TRIP })).toEqual({
      ok: false,
      error: { code: "validation_failed" },
    });
    expect(adapters.getPaymentSimulator).not.toHaveBeenCalled();
    expect(adapters.getPaymentAdapter).not.toHaveBeenCalled();
  });

  it("paiement d'une autre organisation : not_found sans rien modifier", async () => {
    const { checkoutId } = await started();
    contextMock.organizationId = "mock_org_autre";
    expect(await simulateCheckoutOutcome({ checkoutId, outcome: "succeeded" })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(await getCheckoutStatus({ checkoutId })).toEqual({ ok: false, error: { code: "not_found" } });
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    expect(await getCheckoutStatus({ checkoutId })).toMatchObject({ ok: true, value: { status: "pending" } });
  });

  it("réussite : le voyage est débloqué et le cache du voyage invalidé", async () => {
    const { checkoutId } = await started();
    expect(await simulateCheckoutOutcome({ checkoutId, outcome: "succeeded" })).toMatchObject({ ok: true, value: { status: "succeeded" } });
    expect(revalidate).toHaveBeenCalledWith(`/voyages/${TRIP}`, "layout");
    const scope = await adapters.getSimulationScope();
    expect((await adapters.getTripReader({ scope }).getTrip({ organizationId: MOCK_ORGANIZATION_ID }, TRIP))?.unlocked).toBe(true);
  });

  it("refus : aucune invalidation, voyage non débloqué", async () => {
    const { checkoutId } = await started();
    expect(await simulateCheckoutOutcome({ checkoutId, outcome: "declined" })).toMatchObject({ ok: true, value: { status: "declined" } });
    expect(revalidate).not.toHaveBeenCalled();
  });
});

describe("emplacement des actions (décision 0020 § 11)", () => {
  it("chaque fichier de src/server/actions/ (hors tests) commence par la directive « use server »", () => {
    const dir = join(process.cwd(), "src/server/actions");
    const files = readdirSync(dir).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name));
    expect(files).toContain("paiement.ts");
    for (const name of files) {
      expect(readFileSync(join(dir, name), "utf8").startsWith('"use server";'), name).toBe(true);
    }
  });

  it("aucun journal dans les actions de paiement", () => {
    expect(readFileSync(join(process.cwd(), "src/server/actions/paiement.ts"), "utf8")).not.toMatch(/console\./);
  });
});
