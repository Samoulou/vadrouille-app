// @vitest-environment node
import { describe, expect, it } from "vitest";

import { INCONNU, type SourceRelectures, type VoyageARelire } from "@/domain/relectures";
import { avecVoyagesGeneresSimules, choisirSourceRelectures, creerSourceLecture, PREFIXE_LIEU_FIXTURES } from "@/server/composition/lecture";

import { voyageARelire } from "../../support/voyage-a-relire";

/** Seconde composition (B8b ; décision 0100 § 5) : sélection de la source et échec fermé sans plafonds. */

const REPLI: SourceRelectures = { pour: () => Promise.reject(new Error("repli")) };
const ENV_REEL = { VADROUILLE_ENV: "local", RELECTURES_SOURCE: "google" };
const DEMANDE = { lieux: [{ placeId: "test_place_a", dates: ["2027-05-03"] }], trajets: [] };

describe("composition: source réelle seulement en local", () => {
  it("préproduction, production, préversion ou environnement absent : le repli (le double) seul", () => {
    for (const env of [
      { VADROUILLE_ENV: "staging", RELECTURES_SOURCE: "google" },
      { VADROUILLE_ENV: "production", RELECTURES_SOURCE: "google" },
      { VERCEL_ENV: "preview" },
      {},
    ]) {
      expect(choisirSourceRelectures(REPLI, env)).toBe(REPLI);
    }
  });

  // B9e (spécification B9, B9e point 3 ; décision 0110 § 1, qui amende 0100 § 5.3) : en `ci` et en `local` sans source réelle, le double reste la source de ses voyages,
  // complété pour les voyages générés par la variante simulée (lieux des fixtures d'Édimbourg).
  it("ci, ou local sans source réelle : le repli complété, qui lui confie les lieux qui ne sont pas des fixtures", async () => {
    const appels: unknown[] = [];
    const repli: SourceRelectures = { pour: async (voyage) => (appels.push(voyage), { ok: false, refus: "quota_reached" }) };
    for (const env of [{ VADROUILLE_ENV: "ci", RELECTURES_SOURCE: "google" }, { VADROUILLE_ENV: "local" }, { VADROUILLE_ENV: "ci" }]) {
      const source = choisirSourceRelectures(repli, env);
      expect(source).not.toBe(repli);
      expect(await source.pour(voyageARelire(["test_place_a"]), DEMANDE)).toEqual({ ok: false, refus: "quota_reached" });
    }
    expect(appels).toHaveLength(3);
  });

  it("local avec RELECTURES_SOURCE=google : la source réelle (distincte du repli)", () => {
    const source = choisirSourceRelectures(REPLI, { VADROUILLE_ENV: "local", RELECTURES_SOURCE: "google" });
    expect(source).not.toBe(REPLI);
  });
});

describe("composition: creerSourceLecture refuse hors de la sélection (0100 § 5.3)", () => {
  it.each([
    ["ci", { VADROUILLE_ENV: "ci", RELECTURES_SOURCE: "google" }],
    ["staging", { VADROUILLE_ENV: "staging", RELECTURES_SOURCE: "google" }],
    ["production", { VADROUILLE_ENV: "production", RELECTURES_SOURCE: "google" }],
    ["local sans RELECTURES_SOURCE", { VADROUILLE_ENV: "local" }],
    ["environnement absent", {}],
  ])("%s : lève avant toute construction", (_nom, env) => {
    expect(() => creerSourceLecture({ env })).toThrow("lecture: source réelle non choisie");
  });

  it("local avec RELECTURES_SOURCE=google : construite", () => {
    expect(() => creerSourceLecture({ env: ENV_REEL })).not.toThrow();
  });
});

describe("composition: PLAFONDS_USAGE nul, échec fermé", () => {
  it("sans plafonds posés, la source réelle rend unavailable sans transaction ni client", async () => {
    const source = creerSourceLecture({
      env: ENV_REEL,
      transaction: () => () => Promise.reject(new Error("aucune transaction attendue")),
      clients: () => {
        throw new Error("aucun client attendu");
      },
    });
    expect(await source.pour(voyageARelire(["test_place_a"]), DEMANDE)).toEqual({ ok: false, refus: "unavailable" });
  });
});

describe("composition: lecture des voyages générés par la variante simulée (B9e)", () => {
  const FIXTURE = `${PREFIXE_LIEU_FIXTURES}_001`;

  it("lieux mêlés (fixtures et double) ou aucun lieu : le repli", async () => {
    let appels = 0;
    const repli: SourceRelectures = { pour: async () => (appels++, { ok: false, refus: "quota_reached" }) };
    const source = avecVoyagesGeneresSimules(repli, { VADROUILLE_ENV: "ci" });
    await source.pour(voyageARelire([FIXTURE]), DEMANDE);
    await source.pour(voyageARelire([null]), { lieux: [], trajets: [] });
    expect(appels).toBe(2);
  });

  it("lieux des fixtures en ci : relu sur les doubles, forfait en mémoire, aucune transaction ni ligne dans usage_ledger (0110 § 3)", async () => {
    let appels = 0;
    const repli: SourceRelectures = { pour: async () => (appels++, { ok: false, refus: "quota_reached" }) };
    const source = avecVoyagesGeneresSimules(repli, { VADROUILLE_ENV: "ci" });
    const demande = { lieux: [{ placeId: FIXTURE, dates: ["2027-05-03"] }], trajets: [] };
    // Aucune base dans ce test : une réservation (`withOrg`) échouerait et rendrait `unavailable`.
    expect(await source.pour(voyageARelire([FIXTURE]), demande)).toMatchObject({ ok: true });
    expect(appels).toBe(0);
  });

  it("chaîne inversée : un voyage de Rome (logement « quartier ») est relu sur les fixtures de Rome, ville résolue (M1a-3 ; 0136 § 9)", async () => {
    // Lieu propre au jeu de Rome, logement sans lieu (`area`) résolu par la ville (Text Search « Rome » du double, 0100 § 6.2).
    const lieu = `${PREFIXE_LIEU_FIXTURES}_030`;
    const voyageDe = (ville: string): VoyageARelire => ({
      ...voyageARelire([null]),
      sejoursParNuit: [{ placeId: null, ville, centre: null, type: "neighbourhood", logement: "area" }],
    });
    const demande = { lieux: [{ placeId: lieu, dates: ["2027-05-04"] }], trajets: [{ depuis: { logement: 0 }, vers: { lieu }, modes: ["walk" as const] }] };
    const source = avecVoyagesGeneresSimules(REPLI, { VADROUILLE_ENV: "ci" });
    const rome = await source.pour(voyageDe("Rome"), demande);
    if (!rome.ok) throw new Error("lecture de Rome refusée");
    expect(rome.relectures.validite(lieu)).toBe("valide");
    expect(rome.relectures.duree({ logement: 0 }, { lieu }, "walk")).not.toBe(INCONNU);
    // Une autre ville garde le jeu d'Édimbourg (liste fermée), où « Rome » n'est pas une ville connue : trajet du logement inconnu.
    const autre = await source.pour(voyageDe("Lisbonne"), demande);
    if (!autre.ok) throw new Error("lecture refusée");
    expect(autre.relectures.duree({ logement: 0 }, { lieu }, "walk")).toBe(INCONNU);
  });

  it("déclaration de production : le chargeur de fixtures refuse, unavailable, jamais le repli ni un client réel", async () => {
    const source = avecVoyagesGeneresSimules(REPLI, { VADROUILLE_ENV: "production" });
    const demande = { lieux: [{ placeId: FIXTURE, dates: ["2027-05-03"] }], trajets: [] };
    expect(await source.pour(voyageARelire([FIXTURE]), demande)).toEqual({ ok: false, refus: "unavailable" });
  });
});
