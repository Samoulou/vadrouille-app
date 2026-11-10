import { describe, expect, it } from "vitest";

import { accueilApresSuppressionRoute, annonceCompteSupprime, compteRoute } from "./routes";
import { connexionRoute, normaliserSuite } from "./suite";

/** Adresses de « Ton compte » (M9c, ticket 1122 ; spécification M9 § 6.4, critères 1 et 4). */

describe("adresses de « Ton compte »", () => {
  it("page, accueil après la suppression", () => {
    expect(compteRoute()).toBe("/compte");
    expect(accueilApresSuppressionRoute()).toBe("/?compte=supprime");
  });

  it("annonce de la suppression : la valeur exacte seulement", () => {
    const lus = Object.fromEntries(new URL(accueilApresSuppressionRoute(), "https://exemple.test").searchParams);
    expect(annonceCompteSupprime(lus)).toBe(true);
    expect(annonceCompteSupprime({})).toBe(false);
    expect(annonceCompteSupprime({ compte: "autre" })).toBe(false);
    expect(annonceCompteSupprime({ compte: ["supprime", "supprime"] })).toBe(false);
    expect(annonceCompteSupprime({ autre: "supprime" })).toBe(false);
  });
});

describe("normaliserSuite : « Ton compte » (retour après la connexion)", () => {
  it("accepte /compte, forme exacte", () => {
    expect(normaliserSuite(compteRoute())).toBe("/compte");
    expect(connexionRoute(compteRoute())).toBe("/connexion?suite=%2Fcompte");
    expect(normaliserSuite(new URLSearchParams("suite=%2Fcompte").get("suite") ?? undefined)).toBe("/compte");
  });

  it.each(["/compte/", "/compte/export", "/compte?x=1", "/compte#x", "/Compte", "//compte", "/compte/..", "/api/v1/compte/export"])(
    "refuse %s : repli sur /voyages",
    (valeur) => {
      expect(normaliserSuite(valeur)).toBe("/voyages");
    },
  );
});
