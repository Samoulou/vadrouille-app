// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ClientModeles } from "@/ai/client";
import { creerModelesSimules } from "@/ai/modeles.simule";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { creerCoucheIa } from "@/ai/couche";
import { creerLecteurPages, type LecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule } from "@/research/pages.simule";
import { creerRechercheSimulee } from "@/research/recherche-web.simule";
import { creerRecherche, type ConfigurationRecherche } from "@/research/recherche";
import { entreeModelesDepuisBrief } from "@/server/p0/vers-couche-ia";
import { CONFIGURATION_IA } from "@/server/config/ia";

import { lireBrief, lireFixtures } from "../../../scripts/p0/fichiers";

/**
 * Question 7 de la spécification B7 (décision 0096 § 5) : durée du profil `apercu` sur Édimbourg, en mode simulé avec
 * horloge injectée. Les clients sont les doubles sur fixtures de P0 ; chaque appel fait avancer l'horloge d'une latence
 * **posée par le test** (hypothèses nommées ci-dessous, pas des mesures : aucun appel réel n'est fait). Le test vérifie le
 * contrat du profil (la recherche tient dans `delaiMs`, aucun appel ne démarre après l'échéance) et fixe le nombre d'appels
 * que la PR rapporte.
 */

const LATENCE_MS = { modele: 4_000, recherche: 2_000, page: 1_500 } as const;

function monter() {
  const brief = lireBrief("edimbourg-1");
  const fixtures = lireFixtures("edimbourg");
  let instant = 1_000_000;
  const appels = { modele: 0, recherche: 0, page: 0 };
  const debuts: number[] = [];
  const avancer = (nature: keyof typeof LATENCE_MS) => {
    debuts.push(instant);
    appels[nature] += 1;
    instant += LATENCE_MS[nature];
  };
  const simules = creerModelesSimules(fixtures.modeles);
  const modeles: ClientModeles = {
    async envoyer(requete) {
      avancer("modele");
      return simules.envoyer(requete);
    },
  };
  const simulee = creerRechercheSimulee(fixtures.recherche);
  const rechercheWeb: ClientRechercheWeb = {
    async rechercher(requete) {
      avancer("recherche");
      return simulee.rechercher(requete);
    },
  };
  const lecteurSimule = creerLecteurPages({
    resoudre: creerResolveurSimule(fixtures.pages.dns),
    http: creerHttpSimule(fixtures.pages.pages),
  });
  const lecteur: LecteurPages = {
    async lire(url, autorisees) {
      avancer("page");
      return lecteurSimule.lire(url, autorisees);
    },
  };
  const {
    reglages,
    recherche,
    profils,
    profils: { apercu },
  } = CONFIGURATION_IA;
  const configuration: ConfigurationRecherche = {
    recherche,
    profils,
    ageSourceMaxJours: apercu.ageSourceMaxJours,
  };
  const ia = creerCoucheIa({ modeles, reglages });
  const moteur = creerRecherche({
    ia,
    modeles,
    rechercheWeb,
    lecteur,
    configuration,
    horloge: () => instant,
  });
  return {
    moteur,
    brief,
    appels,
    debuts,
    depart: () => 1_000_000,
    fin: () => instant,
  };
}

describe("recherche: durée du profil apercu sur Édimbourg (mode simulé, horloge injectée)", () => {
  it("la recherche s'arrête dans le délai du profil et aucun appel ne démarre après l'échéance", async () => {
    const { moteur, brief, appels, debuts, depart, fin } = monter();
    const resultat = await moteur.rechercher({ entree: entreeModelesDepuisBrief(brief) as never }, "apercu");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    const delai = CONFIGURATION_IA.profils.apercu.delaiMs;
    for (const debut of debuts) expect(debut - depart()).toBeLessThanOrEqual(delai);
    expect(resultat.valeur.bilan.durationMs).toBeLessThanOrEqual(fin() - depart());
    expect(resultat.valeur.bilan.durationMs).toBeGreaterThan(0);
    // Le nombre d'appels est celui que rapporte la PR (note, pas assertion de performance).
    expect(appels.modele).toBeGreaterThan(0);
    expect(resultat.valeur.bilan.pagesRead).toBe(appels.page);
    expect(resultat.valeur.bilan.queries).toHaveLength(appels.recherche);
    expect(appels.modele).toBeLessThanOrEqual(1 + CONFIGURATION_IA.profils.apercu.toursMax);
  });
});
