// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { retenirDeblocageEssai } from "@/adapters";
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
