// @vitest-environment node
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getPaymentAdapter, getPaymentSimulator, getTripReader, isTrialTrip, retenirDeblocageEssai } from "@/adapters";
import { explicitScope } from "@/adapters/simulation";
import { brancherDeblocagesEssai, deblocagesEssai, type DeblocagesEssai } from "@/adapters/prototype-instance";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Spécification E2E-essai, lot 1 : le déblocage simulé d'un voyage d'essai n'est retenu par le cookie de l'essai qu'avec
 * l'adaptateur `prototype` et le paiement simulé disponible ; jamais en production, jamais avec `mock`. Ne lève jamais.
 */

const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

function double(echec = false): DeblocagesEssai & { retenus: string[] } {
  const retenus: string[] = [];
  return {
    retenus,
    lire: async () => new Set(retenus),
    retenir: async (_ctx, tripId) => {
      if (echec) throw new Error("cookie");
      retenus.push(tripId);
    },
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("essai: déblocage retenu par cookie", () => {
  it("prototype en test : retenu ; mock, production ou prestataire réel : rien", async () => {
    const d = double();
    brancherDeblocagesEssai(d);
    expect(deblocagesEssai()).toBe(d);

    vi.stubEnv("DATA_ADAPTER", "prototype");
    await retenirDeblocageEssai(ctx, "proto_a_1");
    expect(d.retenus).toEqual(["proto_a_1"]);

    vi.stubEnv("VERCEL_ENV", "production");
    await retenirDeblocageEssai(ctx, "proto_b_1");
    vi.stubEnv("VERCEL_ENV", undefined);
    vi.stubEnv("PAYMENT_ADAPTER", "stripe");
    await retenirDeblocageEssai(ctx, "proto_c_1");
    vi.stubEnv("PAYMENT_ADAPTER", undefined);
    vi.stubEnv("DATA_ADAPTER", "mock");
    await retenirDeblocageEssai(ctx, "proto_d_1");
    expect(d.retenus).toEqual(["proto_a_1"]);
  });

  it("un échec d'écriture du cookie ne lève pas", async () => {
    brancherDeblocagesEssai(double(true));
    vi.stubEnv("DATA_ADAPTER", "prototype");
    await expect(retenirDeblocageEssai(ctx, "proto_a_1")).resolves.toBeUndefined();
  });
});

describe("essai: getTripReader sur l'adaptateur prototype (décision 0124 § 2)", () => {
  const ESSAI = "proto_essai_20271010_1";
  // L'instance `prototype` est créée au premier appel de ce fichier (isolé), avec le dossier des programmes d'essai.
  beforeEach(() => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    vi.stubEnv("VADROUILLE_PROTOTYPE_DIR", join(process.cwd(), "prototype", "programmes-essai"));
  });

  it("ni cookie ni droit : voyage d'essai non débloqué, journées de l'aperçu seulement", async () => {
    brancherDeblocagesEssai(double());
    const reader = getTripReader({ scope: explicitScope("essai-rien") });
    const trip = await reader.getTrip(ctx, ESSAI);
    expect(trip?.unlocked).toBe(false);
    expect(trip?.days.map((d) => d.index)).toEqual([1, 2]);
    expect(await isTrialTrip(reader, ctx, ESSAI)).toBe(true);
  });

  it("cookie seul (aucun droit dans la portée) : débloqué, toutes les journées", async () => {
    const d = double();
    d.retenus.push(ESSAI);
    brancherDeblocagesEssai(d);
    const trip = await getTripReader({ scope: explicitScope("essai-cookie") }).getTrip(ctx, ESSAI);
    expect(trip?.unlocked).toBe(true);
    expect(trip?.days.map((day) => day.index)).toEqual([1, 2, 3]);
  });

  it("droit seul (paiement simulé réussi dans la portée, aucun cookie) : débloqué dans cette portée, pas dans une autre", async () => {
    brancherDeblocagesEssai(double());
    const scope = explicitScope("essai-droit");
    const start = await getPaymentAdapter({ scope }).createCheckout(ctx, { tripId: ESSAI, method: "card", requestId: crypto.randomUUID() });
    if (!start.ok) throw new Error(`paiement simulé non créé : ${start.error.code}`);
    const fin = await getPaymentSimulator({ scope })!.simulateOutcome(ctx, start.value.checkoutId, "succeeded");
    expect(fin.ok).toBe(true);
    const trip = await getTripReader({ scope }).getTrip(ctx, ESSAI);
    expect(trip?.unlocked).toBe(true);
    expect(trip?.days.map((day) => day.index)).toEqual([1, 2, 3]);
    expect((await getTripReader({ scope: explicitScope("essai-autre") }).getTrip(ctx, ESSAI))?.unlocked).toBe(false);
  });
});
