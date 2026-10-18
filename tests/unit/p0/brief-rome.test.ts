// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { briefPourRecherche } from "@/ai/requetes";
import { BriefSchema, NOM_BRIEF_PATTERN } from "@/prototype/brief";
import { complementDepuisBrief, entreeModelesDepuisBrief } from "@/server/p0/vers-couche-ia";
import { briefLancable, briefTientDansLeMode, NOMS_BRIEFS } from "@/workflows/p0-run";

/**
 * Brief d'essai `rome-1` (ticket #478, demande de Samuel du 2026-10-18) : un autre pays que l'Écosse pour la page
 * d'essai. Valeurs choisies par le CEO là où la demande ne dit rien (logement, heures, rythme, budget des repas comme
 * `edimbourg-1`). Aucun appel : le contrôle de lancement est calculé sur les configurations commitées.
 */

const RACINE = process.cwd();
const NOM = "rome-1";
const lire = (fichier: string): unknown => JSON.parse(readFileSync(path.join(RACINE, fichier), "utf8"));
const brut = lire(`prototype/briefs/${NOM}.json`);
const brief = BriefSchema.parse(brut);

const mots = (texte: string) =>
  texte
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((mot) => mot.length > 2);

describe("p0: brief d'essai rome-1 (ticket 478)", () => {
  it("passe le schéma strict des briefs, nom admis, inscrit dans les briefs de p0Run", () => {
    expect(NOM_BRIEF_PATTERN.test(NOM)).toBe(true);
    expect(BriefSchema.safeParse(brut).success).toBe(true);
    expect(NOMS_BRIEFS).toContain(`${NOM}.json`);
    expect(briefLancable(`${NOM}.json`)).toBe(true);
  });

  it("contenu demandé : Rome, du 4 au 8 mai 2027, deux adultes, sans voiture, rythme équilibré, 4 nuits à Monti", () => {
    expect(brief).toMatchObject({
      destination: "Rome",
      pays: "Italie",
      fuseau: "Europe/Rome",
      arrivee: "2027-05-04",
      depart: "2027-05-08",
      heureArrivee: "12:00",
      heureDepart: "16:00",
      voyageurs: { adultes: 2, enfants: 0 },
      rythme: "equilibre",
      deplacements: ["walk", "transit"],
      logements: [{ texte: "Rione Monti (près du Colisée), Rome", nuits: 4 }],
    });
    expect(brief.deplacements).not.toContain("car");
    expect(brief.engagements).toBeUndefined();
  });

  it("envies : patrimoine et monuments, musées, balades, restaurants, dégustations ; budget des repas d'edimbourg-1", () => {
    expect([...brief.envies].sort()).toEqual(["heritage", "museum", "restaurant", "tasting", "walk"]);
    const reference = BriefSchema.parse(lire("prototype/briefs/edimbourg-1.json"));
    expect(brief.budgetRepas).toBe(reference.budgetRepas);
  });

  it("tient dans les plafonds actuels du mode réel et du mode essai (contrôle de lancement, aucun plafond modifié)", () => {
    expect(briefTientDansLeMode("reel", `${NOM}.json`)).toBe(true);
    expect(briefTientDansLeMode("essai", `${NOM}.json`)).toBe(true);
  });

  it("récit : sans nom propre de personne ni donnée personnelle ; il ne reprend aucun mot du logement", () => {
    const recit = brief.recit ?? "";
    expect(recit).toContain("carbonara");
    expect(recit).not.toMatch(/Samuel/i);
    const lieu = new Set(mots(`${brief.destination} ${brief.pays}`));
    const motsLogement = mots(brief.logements[0]?.texte ?? "").filter((mot) => !lieu.has(mot));
    expect(motsLogement.length).toBeGreaterThan(0);
    for (const mot of mots(recit)) expect(motsLogement, mot).not.toContain(mot);
  });

  it("le modèle de la recherche ne voit pas le logement", () => {
    const vue = JSON.stringify(briefPourRecherche(entreeModelesDepuisBrief(brief), complementDepuisBrief(brief)));
    expect(vue).not.toContain(brief.logements[0]?.texte);
  });
});
