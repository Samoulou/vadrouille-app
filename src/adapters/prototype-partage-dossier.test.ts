// @vitest-environment node
import { realpathSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { clePartageEssai, prototypeSharedReader, prototypeTripAdapter, sessionPartageEssaiVerifiee } from "./prototype-instance";
import type { AdapterContext } from "./types";

/**
 * Partage réel, mode « dossier » (local, CI ; décision 0135 § 5) : lecteur du seul voyage du lien, servi débloqué, sans
 * droit du visiteur ; clé tirée au hasard par processus, session vérifiée sans code d'accès. Un fichier par mode :
 * l'instance de l'adaptateur `prototype` est créée une fois par processus.
 */

const ESSAI_DIR = realpathSync(join(process.cwd(), "prototype", "programmes-essai"));
const ESSAI_ID = "proto_essai_20271010_1";
const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };
const VISITEUR: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "lien-partage", role: "member" };

function stub() {
  vi.stubEnv("NODE_ENV", "test");
  vi.stubEnv("VADROUILLE_PROTOTYPE_DIR", ESSAI_DIR);
}
afterEach(() => {
  vi.unstubAllEnvs();
});

describe("partage réel, mode « dossier »", () => {
  it("voyage d'essai : non débloqué pour la requête sans droit, servi débloqué (toutes ses journées) par le lecteur du lien", async () => {
    stub();
    const prive = await prototypeTripAdapter().getTrip(CTX, ESSAI_ID);
    const partage = await prototypeSharedReader(ESSAI_ID).getTrip(VISITEUR, ESSAI_ID);
    expect(prive?.unlocked).toBe(false);
    expect(partage?.unlocked).toBe(true);
    expect(partage?.days).toHaveLength(3);
  });

  it("le lecteur ne sert que le voyage du lien, dans son organisation", async () => {
    stub();
    expect(await prototypeSharedReader("proto_autre_1").getTrip(VISITEUR, ESSAI_ID)).toBeNull();
    expect(await prototypeSharedReader(ESSAI_ID).getTrip({ ...VISITEUR, organizationId: "org_autre" }, ESSAI_ID)).toBeNull();
    expect(await prototypeSharedReader(ESSAI_ID).listTrips(VISITEUR)).toHaveLength(1);
  });

  it("clé de 32 octets tirée une fois par processus ; session vérifiée sans code d'accès", async () => {
    stub();
    const cle = clePartageEssai();
    expect(cle).toHaveLength(32);
    expect(clePartageEssai()).toBe(cle);
    expect(await sessionPartageEssaiVerifiee()).toBe(true);
  });

  it("hors liste blanche (production) : erreur, comme l'adaptateur", () => {
    stub();
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => prototypeSharedReader(ESSAI_ID)).toThrow(/adaptateur prototype refusé/);
    expect(() => clePartageEssai()).toThrow(/adaptateur prototype refusé/);
  });
});
