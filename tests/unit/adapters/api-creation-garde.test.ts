// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { getCreationAdapter, type CreationAdapter } from "@/adapters";
import { brancherCreationVoyages, CreationDejaBrancheeError, debrancherCreationVoyagesPourTests } from "@/adapters/api-creation-instance";

/**
 * Création sur l'adaptateur `api` (spécification B9, B9e points 1 et 3 ; décision 0081 B9-TL-1, sur le modèle de 0108) :
 * `getCreationAdapter("api")` vérifie la garde de l'adaptateur `api` (`assertApiAdapter`, 0086 § 2.1 : `local` ou `ci`
 * avec `better-auth`, inchangée), puis rend la fabrique branchée au démarrage par `src/instrumentation.ts`. Aucun repli
 * vers `mock` ; non branchée, chaque méthode rejette. Aucune base n'est jointe : la fabrique est un double.
 */

type Valeurs = { VADROUILLE_ENV?: string; VERCEL_ENV?: string; AUTH_ADAPTER?: string };

function poser(valeurs: Valeurs): void {
  vi.stubEnv("VADROUILLE_ENV", valeurs.VADROUILLE_ENV);
  vi.stubEnv("VERCEL_ENV", valeurs.VERCEL_ENV);
  vi.stubEnv("AUTH_ADAPTER", valeurs.AUTH_ADAPTER);
}

const METHODES = ["structureBrief", "suggestLodging", "createTrip", "retryGeneration", "getGenerationStatus", "getFullTripStatus"] as const;

function fabriqueDeTest() {
  return vi.fn((): CreationAdapter => Object.fromEntries(METHODES.map((m) => [m, vi.fn()])) as unknown as CreationAdapter);
}

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherCreationVoyagesPourTests();
});

describe("adaptateurs: getCreationAdapter api et sa garde (B9e)", () => {
  it.each(["local", "ci"])("VADROUILLE_ENV=%j avec better-auth : adaptateur de la fabrique branchée, pas mock", (valeur) => {
    poser({ VADROUILLE_ENV: valeur, AUTH_ADAPTER: "better-auth" });
    const fabrique = fabriqueDeTest();
    brancherCreationVoyages(fabrique);
    const adaptateur = getCreationAdapter("api");
    expect(fabrique).toHaveBeenCalledTimes(1);
    expect(adaptateur).toBe(fabrique.mock.results[0]?.value);
  });

  it.each([
    ["sans AUTH_ADAPTER", { VADROUILLE_ENV: "ci" }, "sans AUTH_ADAPTER=better-auth"],
    ["production", { VADROUILLE_ENV: "production", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["environnement absent", { AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
  ])("%s : levée à l'appel, fabrique jamais appelée, aucun repli vers mock", (_cas, valeurs, message) => {
    poser(valeurs);
    const fabrique = fabriqueDeTest();
    brancherCreationVoyages(fabrique);
    expect(() => getCreationAdapter("api")).toThrow(message);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("un second branchement lève CreationDejaBrancheeError et ne remplace pas la fabrique du démarrage", () => {
    poser({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" });
    const premiere = fabriqueDeTest();
    const seconde = fabriqueDeTest();
    brancherCreationVoyages(premiere);
    expect(() => brancherCreationVoyages(seconde)).toThrow(CreationDejaBrancheeError);
    getCreationAdapter("api");
    expect(premiere).toHaveBeenCalledTimes(1);
    expect(seconde).not.toHaveBeenCalled();
  });

  it("non branchée (tests, next build) : garde vérifiée, puis chaque méthode rejette sans rien lire", async () => {
    poser({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" });
    const adaptateur = getCreationAdapter("api");
    const ctx = { organizationId: "o", userId: "u", role: "owner" } as const;
    for (const methode of METHODES) {
      const appel = adaptateur[methode] as (...args: unknown[]) => Promise<unknown>;
      await expect(appel(ctx, "t")).rejects.toThrow("création api non branchée");
    }
  });
});
