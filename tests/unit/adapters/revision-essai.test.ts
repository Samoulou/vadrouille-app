// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { reviserProgrammeEssai, voyageEssaiRevisable } from "@/adapters";
import type { PortCreationEssai } from "@/adapters/prototype-creation";
import { brancherCreationEssai, revisionEssai } from "@/adapters/prototype-instance";
import type { AdapterContext } from "@/adapters/types";
import { APP_TRIAL_TRIP_ID_PATTERN } from "@/contracts";
import { identifiantVoyage, identifiantVoyageSaisi, lireIdentifiantVoyageSaisi } from "@/domain/identifiant";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Révision d'un voyage d'essai par l'adaptateur `prototype` (E2E-essai, lot 4 ; décision 0126) : port de création
 * simulé, branché comme au démarrage (aucune base, aucun cookie, aucun lancement) ; statuts du port ramenés au contrat ;
 * prédicat « voyage révisable » (bloquant 4 et mineur 1 de la revue de la PR 717).
 */

const TRIP = "proto_rome_0123abcd45674890a123456789abcdef";
const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };
const DEMANDE = { tripId: TRIP, notForMe: ["j1-2"], liked: ["j1-1"] };

let statut: string | Error = "lancee";
const reviser = vi.fn<PortCreationEssai["reviser"]>(async () => {
  if (statut instanceof Error) throw statut;
  return { statut };
});
const port = (): PortCreationEssai => ({ lancer: vi.fn(), relancer: vi.fn(), etat: vi.fn(), reviser });

beforeEach(() => {
  vi.stubEnv("DATA_ADAPTER", "prototype");
  vi.stubEnv("NODE_ENV", "test");
  statut = "lancee";
  reviser.mockClear();
  brancherCreationEssai(port());
});

afterEach(() => {
  brancherCreationEssai(undefined as never);
  vi.unstubAllEnvs();
});

describe("adaptateur prototype : reviserProgrammeEssai", () => {
  it("demande transmise au port branché sous ses noms (pasPourMoi, jAime)", async () => {
    expect(await reviserProgrammeEssai(CTX, DEMANDE)).toEqual({ status: "started" });
    expect(reviser).toHaveBeenCalledWith({ tripId: TRIP, pasPourMoi: ["j1-2"], jAime: ["j1-1"] });
  });

  it.each([
    ["lancee", "started"],
    ["en_cours", "inProgress"],
    ["epuisees", "exhausted"],
    ["acces_refuse", "accessExpired"],
    ["cap_reached", "capReached"],
    ["envelope_reached", "capReached"],
    ["daily_quota_insufficient", "capReached"],
    ["entree_invalide", "unavailable"],
    ["fermee", "unavailable"],
    ["demarrage_impossible", "unavailable"],
    ["statut_inconnu", "unavailable"],
    ["toString", "unavailable"],
  ])("statut du port %s : %s", async (issue, attendu) => {
    statut = issue;
    expect(await reviserProgrammeEssai(CTX, DEMANDE)).toEqual({ status: attendu });
  });

  it("autre organisation, autre adaptateur, port non branché, port qui lève : unavailable", async () => {
    expect(await reviserProgrammeEssai({ ...CTX, organizationId: "org_autre" }, DEMANDE)).toEqual({ status: "unavailable" });
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(await reviserProgrammeEssai(CTX, DEMANDE)).toEqual({ status: "unavailable" });
    expect(reviser).not.toHaveBeenCalled();
    vi.stubEnv("DATA_ADAPTER", "prototype");
    statut = new Error("panne");
    expect(await reviserProgrammeEssai(CTX, DEMANDE)).toEqual({ status: "unavailable" });
    brancherCreationEssai(undefined as never);
    expect(revisionEssai()).toBeNull();
    expect(await reviserProgrammeEssai(CTX, DEMANDE)).toEqual({ status: "unavailable" });
  });

  it("revisionEssai : refusée hors de la liste blanche du prototype (production)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => revisionEssai()).toThrow();
  });
});

describe("voyageEssaiRevisable : même motif que lireIdentifiantVoyageSaisi (mineur 1 de la revue de la PR 717)", () => {
  it("voyages de l'app seulement ; jamais un voyage d'un brief commité", () => {
    const exemples = [
      identifiantVoyageSaisi("Édimbourg", "0123abcd-4567-4890-a123-456789abcdef"),
      identifiantVoyageSaisi("Rome", "fedcba98-7654-4321-8edc-ba9876543210"),
      identifiantVoyage("Rome", "2026-10-12", 1),
      TRIP,
      "proto_rome_0123ABCD45674890a123456789abcdef",
      "proto_rome_0123abcd45674890a123456789abcde",
      `proto_${"a".repeat(25)}_0123abcd45674890a123456789abcdef`,
      "mock_trip_edimbourg",
      "",
    ];
    for (const tripId of exemples) {
      expect(voyageEssaiRevisable(tripId), tripId).toBe(lireIdentifiantVoyageSaisi(tripId) !== null);
      expect(APP_TRIAL_TRIP_ID_PATTERN.test(tripId), tripId).toBe(voyageEssaiRevisable(tripId));
    }
    expect(voyageEssaiRevisable(TRIP)).toBe(true);
    expect(voyageEssaiRevisable(identifiantVoyage("Rome", "2026-10-12", 1))).toBe(false);
  });
});
