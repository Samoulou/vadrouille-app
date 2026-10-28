// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import {
  brancherPartageEssai,
  clePartageEssai,
  debrancherPartageEssaiPourTests,
  PartageDejaBrancheError,
  prototypeSharedReader,
  sessionPartageEssaiVerifiee,
} from "./prototype-instance";
import type { AdapterContext } from "./types";

/** Partage réel, programmes réels en base (décision 0135 § 3 et § 5) : clé, session et barrière viennent du port branché. */

const ESSAI_ID = "proto_essai_20271010_1";
const VISITEUR: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "lien-partage", role: "member" };

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherPartageEssaiPourTests();
});

describe("partage réel, programmes réels", () => {
  it("port non branché : aucune clé, aucune session, aucun programme (aucune connexion)", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("VADROUILLE_PROTOTYPE_DIR", "");
    expect(clePartageEssai()).toBeNull();
    expect(await sessionPartageEssaiVerifiee()).toBe(false);
    expect(await prototypeSharedReader(ESSAI_ID).getTrip(VISITEUR, ESSAI_ID)).toBeNull();
  });

  it("port branché : clé et session du port ; barrière de la vue partagée appelée", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const cle = Buffer.alloc(32, 5);
    const barriere = vi.fn(async () => null);
    brancherPartageEssai({ cle: () => cle, sessionVerifiee: async () => true, barriereLecture: barriere });
    expect(clePartageEssai()).toBe(cle);
    expect(await sessionPartageEssaiVerifiee()).toBe(true);
    expect(await prototypeSharedReader(ESSAI_ID).getTrip(VISITEUR, ESSAI_ID)).toBeNull();
    expect(barriere).toHaveBeenCalledTimes(1);
  });

  it("second branchement : refusé, le premier port reste en place (clé inchangée)", () => {
    vi.stubEnv("NODE_ENV", "test");
    const cle = Buffer.alloc(32, 5);
    brancherPartageEssai({ cle: () => cle, sessionVerifiee: async () => true, barriereLecture: async () => null });
    expect(() => brancherPartageEssai({ cle: () => Buffer.alloc(32, 9), sessionVerifiee: async () => true, barriereLecture: async () => null })).toThrow(
      PartageDejaBrancheError,
    );
    expect(clePartageEssai()).toBe(cle);
  });

  it("session du port qui lève : non vérifiée", async () => {
    vi.stubEnv("NODE_ENV", "test");
    brancherPartageEssai({
      cle: () => Buffer.alloc(32, 5),
      sessionVerifiee: async () => {
        throw new Error("cookie illisible");
      },
      barriereLecture: async () => null,
    });
    expect(await sessionPartageEssaiVerifiee()).toBe(false);
  });
});
