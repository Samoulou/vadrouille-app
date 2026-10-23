// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok } from "@/contracts";

import { reviserVoyageEssai } from "./revision-essai";

/**
 * Action de la fin du tri d'un voyage d'essai (E2E-essai, lot 4 ; décision 0126) : fermée hors de l'adaptateur
 * `prototype`, entrée revalidée (stricte), contexte de la requête, sortie revalidée. Adaptateur simulé : aucune base,
 * aucun cookie, aucun lancement.
 */

const d = vi.hoisted(() => ({
  prototype: true,
  contexte: { organizationId: "org_prototype", userId: "user_prototype", role: "owner" } as unknown,
  reviser: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  isPrototypeAdapter: () => d.prototype,
  reviserProgrammeEssai: (...args: unknown[]) => d.reviser(...args),
}));
vi.mock("@/features/compte/session", () => ({
  contexteFacultatif: async () => d.contexte,
}));

const TRIP = "proto_rome_0123abcd45674890a123456789abcdef";
const DEMANDE = { tripId: TRIP, notForMe: ["j1-2"], liked: ["j1-1"] };

beforeEach(() => {
  vi.clearAllMocks();
  d.prototype = true;
  d.contexte = { organizationId: "org_prototype", userId: "user_prototype", role: "owner" };
  d.reviser.mockResolvedValue({ status: "started" });
});

describe("reviserVoyageEssai", () => {
  it("chemin nominal : contexte de la requête et entrée validée transmis, statut rendu", async () => {
    expect(await reviserVoyageEssai(DEMANDE)).toEqual(ok({ status: "started" }));
    expect(d.reviser).toHaveBeenCalledWith(d.contexte, DEMANDE);
  });

  it("hors adaptateur prototype : not_found, avant toute lecture de l'entrée", async () => {
    d.prototype = false;
    expect(await reviserVoyageEssai({ nimporte: "quoi" })).toEqual(fail("not_found"));
    expect(d.reviser).not.toHaveBeenCalled();
  });

  it("entrée refusée (schéma strict) : validation_failed, sans appel", async () => {
    for (const entree of [
      { ...DEMANDE, notForMe: [] },
      { ...DEMANDE, placeId: "ChIJ-SENTINELLE" },
      { ...DEMANDE, tripId: "pas un voyage !" },
      { tripId: TRIP, notForMe: ["j1-2"] },
      null,
    ]) {
      const resultat = await reviserVoyageEssai(entree);
      expect(resultat.ok, JSON.stringify(entree)).toBe(false);
      if (!resultat.ok) expect(resultat.error.code).toBe("validation_failed");
    }
    expect(d.reviser).not.toHaveBeenCalled();
  });

  it("sans contexte, adaptateur qui lève, sortie hors contrat : provider_error", async () => {
    d.contexte = null;
    expect(await reviserVoyageEssai(DEMANDE)).toEqual(fail("provider_error"));
    d.contexte = { organizationId: "org_prototype", userId: "user_prototype", role: "owner" };
    d.reviser.mockRejectedValue(new Error("panne"));
    expect(await reviserVoyageEssai(DEMANDE)).toEqual(fail("provider_error"));
    d.reviser.mockResolvedValue({ status: "lancee" });
    expect(await reviserVoyageEssai(DEMANDE)).toEqual(fail("provider_error"));
    d.reviser.mockResolvedValue({ status: "started", tripId: TRIP });
    expect(await reviserVoyageEssai(DEMANDE)).toEqual(fail("provider_error"));
  });
});
