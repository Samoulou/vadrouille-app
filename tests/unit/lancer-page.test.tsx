import { afterEach, describe, expect, it, vi } from "vitest";

import LancerPage, { dynamic } from "@/app/(creation)/voyages/nouveau/lancer/page";
import { LaunchEssai } from "@/features/creation/LaunchEssai";
import { LaunchStep } from "@/features/creation/LaunchStep";
import { hasSession } from "@/server/actions/compte";
import { etatPageExecutionsP0 } from "@/server/p0/page-acces";

vi.mock("@/server/actions/compte", () => ({ hasSession: vi.fn(async () => true) }));
vi.mock("@/server/p0/page-acces", () => ({ etatPageExecutionsP0: vi.fn(async () => "saisie") }));

/** `R-lancer` (spécification F8 ; site d'essai : spécification E2E-essai, lot 2, D3). */

afterEach(() => {
  vi.unstubAllEnvs();
  vi.mocked(hasSession).mockClear();
  vi.mocked(etatPageExecutionsP0).mockClear();
});

describe("R-lancer", () => {
  it("rendu à chaque requête", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("adaptateur mock : garde de la session, l'état du code d'accès n'est pas lu", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    const element = await LancerPage();
    expect(element.type).toBe(LaunchStep);
    expect(element.props).toEqual({ signedIn: true });
    expect(etatPageExecutionsP0).not.toHaveBeenCalled();
  });

  it.each(["saisie", "ouverte", "fermee"] as const)("site d'essai, accès %s : seul l'état de l'accès atteint l'étape, aucune session lue", async (etat) => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    vi.mocked(etatPageExecutionsP0).mockResolvedValueOnce(etat);
    const element = await LancerPage();
    expect(element.type).toBe(LaunchEssai);
    expect(element.props).toEqual({ acces: etat });
    expect(hasSession).not.toHaveBeenCalled();
  });
});
