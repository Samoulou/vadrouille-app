import { describe, expect, it } from "vitest";

import { ArretEtape } from "@/server/generation/codes";
import { resoudre } from "@/server/generation/dependances";

import { chargerDoublesEdimbourg, ErreurFixtures, lectureAdmise, lecturesDeFixtures } from "@/server/composition/fixtures-simulees";

/**
 * Fixtures d'Édimbourg hors du graphe de production (décision 0105 § 2 ; revue de la PR 563, bloquant 1) : `production` ne
 * charge aucune fixture, et le module refuse de lire quand le déploiement déclaré est `production` ou inconnu.
 */
describe("fixtures simulées : jamais chargées en production", () => {
  it("composer(\"production\") lève production_refused sans charger aucune fixture", async () => {
    const avant = lecturesDeFixtures.fichiers;
    const dependances = resoudre({ barriere: { env: {} } });
    expect(await dependances.barriere()).toBe("production");
    await expect(dependances.composer("production")).rejects.toBeInstanceOf(ArretEtape);
    await expect(dependances.composer("production")).rejects.toMatchObject({ code: "production_refused" });
    expect(lecturesDeFixtures.fichiers).toBe(avant);
  });

  it("la composition simulée relit les cinq fichiers à chaque composition (pas de cache de module)", async () => {
    const avant = lecturesDeFixtures.fichiers;
    const dependances = resoudre({ barriere: { env: { VADROUILLE_ENV: "ci" } } });
    await dependances.composer("simulee");
    await dependances.composer("simulee");
    expect(lecturesDeFixtures.fichiers - avant).toBe(10);
  });

  it.each([
    [{ VADROUILLE_ENV: "production" }, false],
    [{ VERCEL_ENV: "production" }, false],
    [{ VADROUILLE_ENV: "ci", VERCEL_ENV: "production" }, false],
    [{ VADROUILLE_ENV: "inconnu" }, false],
    [{}, false],
    [{ VADROUILLE_ENV: "ci" }, true],
    [{ VADROUILLE_ENV: "local" }, true],
    [{ VERCEL_ENV: "preview" }, true],
  ] as const)("lectureAdmise(%j) = %s", (env, attendu) => {
    expect(lectureAdmise(env)).toBe(attendu);
  });

  it("le module refuse de lire sous production ou en environnement inconnu, par une erreur fermée sans chemin", async () => {
    for (const env of [{ VADROUILLE_ENV: "production" }, { VERCEL_ENV: "production" }, {}, { VADROUILLE_ENV: "x" }]) {
      const erreur = await chargerDoublesEdimbourg(env).catch((e: unknown) => e);
      expect(erreur).toBeInstanceOf(ErreurFixtures);
      expect((erreur as ErreurFixtures).code).toBe("fixtures_refusees");
      expect((erreur as Error).message).not.toMatch(/prototype|\.json|\//);
    }
  });

  it("hors production, les cinq familles de fixtures sont lues et validées par leurs schémas", async () => {
    const fabrique = await chargerDoublesEdimbourg({ VADROUILLE_ENV: "ci" });
    const doubles = fabrique();
    expect(Object.keys(doubles).sort()).toEqual(["lecteur", "modeles", "places", "rechercheWeb", "routes"]);
    expect(fabrique().places).not.toBe(doubles.places);
  });
});
