// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { assertApiAdapter, getTripAdapter, type TripAdapter } from "@/adapters";
import { brancherLectureVoyages, debrancherLectureVoyagesPourTests, LectureDejaBrancheeError } from "@/adapters/api-instance";
import { mockTripAdapter } from "@/adapters/mock";
import type { SourceRelectures } from "@/domain/relectures";

/**
 * Critère `adaptateurs: getTripAdapter api et sa garde` (spécification B6, B6b ; décision 0086 § 2.1, B6-TL-7) :
 * l'adaptateur `api` est rendu en `local` et en `ci` avec `AUTH_ADAPTER=better-auth` ; il lève, à l'appel, sans
 * `better-auth`, en `staging`, en `production`, et pour un environnement absent ou inconnu (mêmes règles que
 * `resolveServerEnvironment`). Aucun repli vers `mock`. La garde lit l'environnement **du processus** (`vi.stubEnv`),
 * jamais l'environnement transmis à `getTripAdapter`. Aucune base n'est jointe : la fabrique est un double.
 */

type Valeurs = { VADROUILLE_ENV?: string; VERCEL_ENV?: string; AUTH_ADAPTER?: string };

function poser(valeurs: Valeurs): void {
  vi.stubEnv("VADROUILLE_ENV", valeurs.VADROUILLE_ENV);
  vi.stubEnv("VERCEL_ENV", valeurs.VERCEL_ENV);
  vi.stubEnv("AUTH_ADAPTER", valeurs.AUTH_ADAPTER);
}

const METHODES = ["listTrips", "getTrip", "getDay", "listProposals", "listPreviewSlots", "getDayMap", "getTripMap", "getDeckSession"] as const;

/** Fabrique de test : un adaptateur distinct par appel, qui retient le double reçu. */
function fabriqueDeTest() {
  const doubles: SourceRelectures[] = [];
  const fabrique = vi.fn((double: SourceRelectures): TripAdapter => {
    doubles.push(double);
    return { ...mockTripAdapter };
  });
  return { fabrique, doubles };
}

afterEach(() => {
  vi.unstubAllEnvs();
  debrancherLectureVoyagesPourTests();
});

describe("adaptateurs: getTripAdapter api et sa garde", () => {
  it.each(["local", "ci", "development", " CI "])("VADROUILLE_ENV=%j avec better-auth : adaptateur de la fabrique branchée, pas mock", (valeur) => {
    poser({ VADROUILLE_ENV: valeur, AUTH_ADAPTER: "better-auth" });
    const { fabrique } = fabriqueDeTest();
    brancherLectureVoyages(fabrique);
    const adaptateur = getTripAdapter("api");
    expect(adaptateur).not.toBe(mockTripAdapter);
    expect(fabrique).toHaveBeenCalledTimes(1);
    expect(adaptateur).toBe(fabrique.mock.results[0]?.value);
  });

  it("VERCEL_ENV=development seul, avec better-auth : admis (règle de resolveServerEnvironment)", () => {
    poser({ VERCEL_ENV: "development", AUTH_ADAPTER: "better-auth" });
    expect(() => getTripAdapter("api")).not.toThrow();
  });

  it.each([
    ["sans AUTH_ADAPTER", { VADROUILLE_ENV: "ci" }, "sans AUTH_ADAPTER=better-auth"],
    ["AUTH_ADAPTER=mock", { VADROUILLE_ENV: "local", AUTH_ADAPTER: "mock" }, "sans AUTH_ADAPTER=better-auth"],
    ["staging", { VADROUILLE_ENV: "staging", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["production", { VADROUILLE_ENV: "production", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["VERCEL_ENV=preview", { VERCEL_ENV: "preview", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["ci et VERCEL_ENV=production", { VADROUILLE_ENV: "ci", VERCEL_ENV: "production", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["environnement absent", { AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
    ["environnement inconnu", { VADROUILLE_ENV: "recette", AUTH_ADAPTER: "better-auth" }, "hors local et ci"],
  ])("%s : levée à l'appel, fabrique jamais appelée, aucun repli vers mock", (_cas, valeurs, message) => {
    poser(valeurs);
    const { fabrique } = fabriqueDeTest();
    brancherLectureVoyages(fabrique);
    expect(() => getTripAdapter("api")).toThrow(message);
    expect(() => assertApiAdapter()).toThrow(message);
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("un environnement transmis à getTripAdapter n'ouvre pas la garde : seul celui du processus compte", () => {
    poser({ VADROUILLE_ENV: "production", AUTH_ADAPTER: "better-auth" });
    const transmis = { NODE_ENV: "test", VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" } as NodeJS.ProcessEnv;
    expect(() => getTripAdapter("api", transmis)).toThrow("hors local et ci");
  });

  it("un nouvel appel rend un nouvel adaptateur sur un double neuf (aucun compteur gardé entre deux requêtes)", () => {
    poser({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" });
    const { fabrique, doubles } = fabriqueDeTest();
    brancherLectureVoyages(fabrique);
    expect(getTripAdapter("api")).not.toBe(getTripAdapter("api"));
    expect(doubles).toHaveLength(2);
    expect(doubles[0]).not.toBe(doubles[1]);
  });

  it("un second branchement lève LectureDejaBrancheeError et ne remplace pas la fabrique du démarrage", () => {
    poser({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" });
    const premiere = fabriqueDeTest();
    const seconde = fabriqueDeTest();
    brancherLectureVoyages(premiere.fabrique);
    expect(() => brancherLectureVoyages(seconde.fabrique)).toThrow(LectureDejaBrancheeError);
    let erreur: unknown;
    try {
      brancherLectureVoyages(seconde.fabrique);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(LectureDejaBrancheeError);
    expect((erreur as Error).name).toBe("LectureDejaBrancheeError");
    expect((erreur as Error).message).toBe("Lecture des voyages déjà branchée.");
    getTripAdapter("api");
    expect(premiere.fabrique).toHaveBeenCalledTimes(1);
    expect(seconde.fabrique).not.toHaveBeenCalled();
  });

  it("non branchée (tests, next build) : garde vérifiée, puis chaque méthode rejette sans rien lire", async () => {
    poser({ VADROUILLE_ENV: "ci", AUTH_ADAPTER: "better-auth" });
    const adaptateur = getTripAdapter("api");
    expect(adaptateur).not.toBe(mockTripAdapter);
    const ctx = { organizationId: "o", userId: "u", role: "owner" } as const;
    for (const methode of METHODES) {
      const appel = adaptateur[methode] as (...args: unknown[]) => Promise<unknown>;
      await expect(appel(ctx, "t", 1)).rejects.toThrow("adaptateur api non branché");
    }
  });
});
