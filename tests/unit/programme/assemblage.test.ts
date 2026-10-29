import { describe, expect, it } from "vitest";

import { LONGUEURS } from "@/prototype/programme-reduit";
import * as p0 from "@/server/p0/assemblage";
import * as depuisFormulaire from "@/server/p0/depuis-formulaire";
import * as sitesP0 from "@/server/p0/sites";
import * as versCoucheIa from "@/server/p0/vers-couche-ia";
import * as versMoteur from "@/server/p0/vers-moteur";
import * as assemblage from "@/server/programme/assemblage";
import * as brief from "@/server/programme/brief";
import * as entree from "@/server/programme/entree";
import * as sites from "@/server/programme/sites";

/** Code partagé de la chaîne inversée (décision 0136 § 1.1 à § 1.3, M1a-1) : déplacé, réexporté, jamais recopié. */
describe("programme: code partagé de src/server/programme (décision 0136 § 1)", () => {
  it("programme: longueur du libellé de source égale à celle du programme réduit", () => {
    expect(assemblage.LONGUEUR_LIBELLE_SOURCE).toBe(LONGUEURS.libelle);
  });

  it("programme: src/server/p0 réexporte les fonctions déplacées (mêmes objets)", () => {
    expect(p0.assemblerProgrammeIa).toBe(assemblage.assemblerProgrammeIa);
    expect(p0.pointsDeTrajet).toBe(assemblage.pointsDeTrajet);
    expect(p0.sourceDuSite).toBe(assemblage.sourceDuSite);
    expect(versMoteur.rythmeVersPace).toBe(assemblage.rythmeVersPace);
    expect(versCoucheIa.entreeProgrammeDepuisBrief).toBe(entree.entreeProgrammeDepuisBrief);
    expect(depuisFormulaire.briefDepuisFormulaire).toBe(brief.briefDepuisFormulaire);
    expect(depuisFormulaire.texteDuLogement).toBe(brief.texteDuLogement);
    expect(depuisFormulaire.niveauBudgetRepas).toBe(brief.niveauBudgetRepas);
    expect(depuisFormulaire.DEPLACEMENTS_PAR_DEFAUT).toBe(brief.DEPLACEMENTS_PAR_DEFAUT);
    expect(sitesP0.sitesDuProgramme).toBe(sites.sitesDuProgramme);
    expect(sitesP0.verifierSites).toBe(sites.verifierSites);
    expect(sitesP0.avecSiteGarde).toBe(sites.avecSiteGarde);
    expect(sitesP0.compteursNonSoumis).toBe(sites.compteursNonSoumis);
  });
});
