// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import type { ComplementP0 } from "@/ai/complement-p0";
import { CandidatPourModeleSchema, EntreeModelesSchema, LieuRetenuSchema, type CandidatPourModele, type EntreeModeles, type LieuRetenu } from "@/ai/entrees";
import type { EntreeNotation } from "@/ai/noter-candidats";
import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import type { EntreeRaisons } from "@/ai/rediger-raisons";
import { encadrer, requeteNotation, requetePlan, requeteRaisons, requeteRecherche, rythmePourModele } from "@/ai/requetes";
import { BriefSchema, RYTHMES, type Brief } from "@/prototype/brief";
import { vuePourModele, type Candidat } from "@/prototype/candidat";
import { ConfigRechercheSchema } from "@/prototype/config";
import type { DependancesAgent, DonneesProtegees } from "@/research/agent";
import { BornesRechercheSchema, type BornesRecherche } from "@/research/bornes";
import {
  bornesDepuisConfig,
  bornesDepuisDemande,
  candidatPourModele,
  complementDepuisBrief,
  donneesProtegeesDepuisBrief,
  entreeModelesDepuisBrief,
  lieuRetenuDepuisCandidat,
  type BornesRechercheP0,
  type CandidatPourModeleP0,
  type ComplementP0Structurel,
  type DonneesProtegeesP0,
  type EntreeModelesP0,
  type LieuRetenuP0,
  MARGE_CIBLES_POURCENT,
} from "@/server/p0/vers-couche-ia";
import { rythmeVersPace } from "@/server/p0/vers-moteur";

import { RACINE } from "./resolution";

/**
 * B7a (décision 0077 § 1 point 5) : adaptateur de P0 vers la couche IA (`src/server/p0/vers-couche-ia.ts`). Il n'importe
 * ni `src/ai` ni `src/research` (frontière de 0048 § 1) : ses types sont structurels, et leur égalité avec les types de
 * production est vérifiée ici. Les requêtes de `plan`, `recherche`, `notation` et `raisons` construites après la
 * conversion sont **identiques octet pour octet** à celles de P0 avant B7a : la référence est la vue du brief de P0 telle
 * que `src/ai/requetes.ts` la composait sur `main` (`b7a-avant`, ci-dessous), sur chaque brief commité.
 */

const ROUTAGE = { data_collection: "deny" as const };
const lire = (relatif: string): unknown => JSON.parse(readFileSync(path.join(RACINE, relatif), "utf8"));
const BRIEFS: [string, Brief][] = readdirSync(path.join(RACINE, "prototype/briefs"))
  .filter((nom) => nom.endsWith(".json"))
  .sort()
  .map((nom) => [nom, BriefSchema.parse(lire(`prototype/briefs/${nom}`))]);

const CANDIDATS: Candidat[] = [
  {
    id: "c_001",
    nom: "Musée maison",
    resume: "Résumé maison.",
    categorie: "museum",
    typeEtape: "activity",
    source: { url: "https://guide.example/musees", date: "2026-09-01", classe: "independante" },
    aReserver: false,
  },
  {
    id: "c_002",
    nom: "Concert maison",
    resume: "Un concert écrit par nous.",
    categorie: "nightlife",
    typeEtape: "event",
    source: { url: "https://WWW.Agenda.example:443/concert?x=1", date: "2026-09-02", classe: "officielle" },
    evenement: { date: "2026-11-24", heure: "20:00", dateConfirmee: true },
    aReserver: true,
    prixParPersonne: 25,
    dureeMinutes: 90,
  },
];

// --- Référence « avant B7a » : vues du brief de P0 de `src/ai/requetes.ts` sur `main` (head 55d03b5) --------------------
const avant = {
  briefPourModele: (brief: Brief) => ({
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    voyageurs: brief.voyageurs,
    rythme: brief.rythme,
    envies: brief.envies,
    deplacements: brief.deplacements,
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
    logements: brief.logements.map((logement) => logement.texte),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  }),
  briefPourRecherche: (brief: Brief) => ({
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    voyageurs: brief.voyageurs,
    rythme: brief.rythme,
    envies: brief.envies,
    deplacements: brief.deplacements,
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  }),
};

const requeteAvant = (etape: string, prompt: { id: string; version: number; texte: string }, modele: string, donnees: unknown) => ({
  etape,
  modele,
  routage: { ...ROUTAGE },
  prompt: { id: prompt.id, version: prompt.version },
  messages: [
    { role: "system", contenu: prompt.texte },
    { role: "user", contenu: encadrer(donnees) },
  ],
});

describe("p0: adaptateur vers la couche IA (vers-couche-ia.ts)", () => {
  it("types structurels égaux aux types de production", () => {
    expectTypeOf<EntreeModelesP0>().toEqualTypeOf<EntreeModeles>();
    expectTypeOf<CandidatPourModeleP0>().toEqualTypeOf<CandidatPourModele>();
    expectTypeOf<LieuRetenuP0>().toMatchTypeOf<LieuRetenu>();
    expectTypeOf<LieuRetenu>().toMatchTypeOf<LieuRetenuP0>();
    expectTypeOf<ComplementP0Structurel>().toEqualTypeOf<ComplementP0>();
    expectTypeOf<BornesRechercheP0>().toEqualTypeOf<Omit<BornesRecherche, "delaiMs">>();
    expectTypeOf<DonneesProtegeesP0>().toEqualTypeOf<DonneesProtegees>();
  });

  it("garde-fou du complément : les types dérivés par Parameters<…> restent exactement ComplementP0 (revue du head 5a955f8, mineur 7)", () => {
    expectTypeOf<EntreeNotation["complement"]>().toEqualTypeOf<ComplementP0 | undefined>();
    expectTypeOf<EntreeRaisons["complement"]>().toEqualTypeOf<ComplementP0 | undefined>();
    expectTypeOf<DependancesAgent["complement"]>().toEqualTypeOf<ComplementP0 | undefined>();
  });

  it("rythme : la conversion puis la vue des modèles rendent le libellé de P0 (inverse de rythmeVersPace)", () => {
    for (const rythme of RYTHMES) {
      expect(rythmePourModele(rythmeVersPace(rythme))).toBe(rythme);
      const [, brief] = BRIEFS[0] ?? [];
      if (brief === undefined) throw new Error("aucun brief");
      expect(rythmePourModele(entreeModelesDepuisBrief({ ...brief, rythme }).rythme)).toBe(rythme);
    }
  });

  describe.each(BRIEFS)("%s", (_nom, brief) => {
    const entree = entreeModelesDepuisBrief(brief);
    const complement = complementDepuisBrief(brief);

    it("entrée de production valide (schéma strict), sans récit, logement, engagement, fuseau ni heure", () => {
      expect(EntreeModelesSchema.safeParse(entree).success).toBe(true);
      const texte = JSON.stringify(entree);
      for (const logement of brief.logements) expect(texte).not.toContain(logement.texte);
      for (const engagement of brief.engagements ?? []) expect(texte).not.toContain(engagement.libelle);
      if (brief.recit !== undefined) expect(texte).not.toContain(brief.recit);
      for (const cle of ["recit", "logements", "engagements", "fuseau", "heureArrivee", "heureDepart", "schema"]) expect(entree).not.toHaveProperty(cle);
    });

    it("complément de P0 : récit et textes des logements, dans l'ordre du brief", () => {
      expect(complement.logements).toEqual(brief.logements.map((logement) => logement.texte));
      expect(complement.recit).toBe(brief.recit);
    });

    it("requêtes de plan, recherche, notation et raisons identiques avant et après la conversion", () => {
      const modele = "fournisseur/modele-test";
      expect(requetePlan(entree, modele, ROUTAGE, complement)).toEqual(requeteAvant("plan", PROMPT_PLAN, modele, { brief: avant.briefPourRecherche(brief) }));
      const donneesRecherche = {
        tour: 2,
        plan: [{ requete: "musées Édimbourg", creneau: "activity" }],
        resultats: [{ url: "https://guide.example/musees", titre: "Musées", extrait: "Extrait." }],
        pages: [{ url: "https://guide.example/musees", texte: "Texte de page." }],
        dejaTrouves: ["Musée maison"],
        manquants: { activity: 1, meal: 2, evening: 0 },
      };
      expect(requeteRecherche({ entree, ...donneesRecherche }, modele, ROUTAGE, complement)).toEqual(
        requeteAvant("recherche", PROMPT_RECHERCHE, modele, { brief: avant.briefPourRecherche(brief), ...donneesRecherche }),
      );
      expect(requeteNotation(entree, CANDIDATS.map(candidatPourModele), modele, ROUTAGE, complement)).toEqual(
        requeteAvant("notation", PROMPT_NOTATION, modele, { brief: avant.briefPourModele(brief), candidats: CANDIDATS.map(vuePourModele) }),
      );
      expect(requeteRaisons(entree, CANDIDATS.map(lieuRetenuDepuisCandidat), modele, ROUTAGE, complement)).toEqual(
        requeteAvant("raisons", PROMPT_RAISONS, modele, {
          brief: avant.briefPourModele(brief),
          lieux: CANDIDATS.map((candidat) => ({ ...vuePourModele(candidat), sourceDomaine: new URL(candidat.source.url).hostname })),
        }),
      );
      // Revue du head `5a955f8`, mineur 8 : `toEqual` ignore l'ordre des clés ; les messages (système et données) sont
      // donc aussi comparés en texte, pour les quatre étapes : octets identiques, ordre des clés compris.
      const octets = (requete: { messages: readonly { contenu: string }[] }) => requete.messages.map((m) => m.contenu);
      expect(octets(requetePlan(entree, modele, ROUTAGE, complement))).toStrictEqual(
        octets(requeteAvant("plan", PROMPT_PLAN, modele, { brief: avant.briefPourRecherche(brief) })),
      );
      expect(octets(requeteRecherche({ entree, ...donneesRecherche }, modele, ROUTAGE, complement))).toStrictEqual(
        octets(requeteAvant("recherche", PROMPT_RECHERCHE, modele, { brief: avant.briefPourRecherche(brief), ...donneesRecherche })),
      );
      expect(octets(requeteNotation(entree, CANDIDATS.map(candidatPourModele), modele, ROUTAGE, complement))).toStrictEqual(
        octets(requeteAvant("notation", PROMPT_NOTATION, modele, { brief: avant.briefPourModele(brief), candidats: CANDIDATS.map(vuePourModele) })),
      );
      expect(octets(requeteRaisons(entree, CANDIDATS.map(lieuRetenuDepuisCandidat), modele, ROUTAGE, complement))).toStrictEqual(
        octets(
          requeteAvant("raisons", PROMPT_RAISONS, modele, {
            brief: avant.briefPourModele(brief),
            lieux: CANDIDATS.map((candidat) => ({ ...vuePourModele(candidat), sourceDomaine: new URL(candidat.source.url).hostname })),
          }),
        ),
      );
    });

    it("données protégées du filtre des requêtes web : destination, pays, logements, libellés d'engagements, récit", () => {
      const protegees = donneesProtegeesDepuisBrief(brief);
      expect(protegees.destination).toBe(brief.destination);
      expect(protegees.pays).toBe(brief.pays);
      expect(protegees.logements?.map((l) => l.texte)).toEqual(brief.logements.map((l) => l.texte));
      expect(protegees.engagements?.map((e) => e.libelle)).toEqual(brief.engagements?.map((e) => e.libelle));
      expect(protegees.recit).toBe(brief.recit);
    });
  });

  it("candidats : projection de vuePourModele (cinq champs) ; lieu retenu : plus le domaine de la source, valides", () => {
    for (const candidat of CANDIDATS) {
      expect(candidatPourModele(candidat)).toEqual(vuePourModele(candidat));
      expect(CandidatPourModeleSchema.safeParse(candidatPourModele(candidat)).success).toBe(true);
      const lieu = lieuRetenuDepuisCandidat(candidat);
      expect(lieu).toEqual({ ...vuePourModele(candidat), sourceDomaine: new URL(candidat.source.url).hostname });
      expect(LieuRetenuSchema.safeParse(lieu).success).toBe(true);
    }
    expect(lieuRetenuDepuisCandidat(CANDIDATS[1] as Candidat).sourceDomaine).toBe("www.agenda.example");
  });

  it("bornes : depuis chaque recherche*.json de P0, sans délai, valides", () => {
    const fichiers = readdirSync(path.join(RACINE, "prototype/config")).filter((nom) => /^recherche.*\.json$/.test(nom));
    expect(fichiers.length).toBeGreaterThan(0);
    for (const nom of fichiers) {
      const config = ConfigRechercheSchema.parse(lire(`prototype/config/${nom}`));
      const bornes = bornesDepuisConfig(config);
      expect(bornes, nom).toEqual({
        ciblesParCreneau: config.ciblesParCreneau,
        totalCandidats: config.totalCandidats,
        toursMax: config.toursMax,
        ageSourceMaxJours: config.ageSourceMaxJours,
      });
      expect(BornesRechercheSchema.safeParse(bornes).success, nom).toBe(true);
    }
  });

  // Ticket 483 (essai rome-1 du 2026-10-18 : 23 candidats pour 32 lieux demandés).
  it("bornes depuis la demande : cibles ≥ recherche.json et ≥ demande + 30 % (entiers), sous le plafond, valides", () => {
    const config = ConfigRechercheSchema.parse(lire("prototype/config/recherche.json"));
    expect(MARGE_CIBLES_POURCENT).toBe(30);
    // Rome, première série : 19 activités, 9 repas, 4 soirées.
    const rome = bornesDepuisDemande(config, { activity: 19, meal: 9, evening: 4 }, 85);
    expect(rome).toEqual({
      ciblesParCreneau: { activity: 25, meal: 14, evening: 6 },
      totalCandidats: 45,
      toursMax: config.toursMax,
      ageSourceMaxJours: config.ageSourceMaxJours,
    });
    // 10 × 1,3 = 13 tout juste (aucune erreur d'arrondi flottant) ; 20 × 1,3 = 26.
    expect(bornesDepuisDemande(config, { activity: 10, meal: 10, evening: 0 }, 85).ciblesParCreneau.meal).toBe(14);
    expect(bornesDepuisDemande(config, { activity: 10, meal: 20, evening: 0 }, 85).ciblesParCreneau.meal).toBe(26);
    expect(bornesDepuisDemande(config, { activity: 0, meal: 10, evening: 0 }, 85).ciblesParCreneau.meal).toBe(14);
    expect(bornesDepuisDemande({ ...config, ciblesParCreneau: { activity: 1, meal: 1, evening: 1 } }, { activity: 0, meal: 10, evening: 0 }, 85).ciblesParCreneau.meal).toBe(13);
    // Petite demande : les cibles de recherche.json restent un plancher.
    expect(bornesDepuisDemande(config, { activity: 1, meal: 1, evening: 0 }, 85)).toEqual(bornesDepuisConfig(config));
    // Au-delà du plafond : cibles réduites en proportion, total au plafond, bornes toujours valides.
    const borne = bornesDepuisDemande(config, { activity: 80, meal: 40, evening: 10 }, 85);
    const somme = borne.ciblesParCreneau.activity + borne.ciblesParCreneau.meal + borne.ciblesParCreneau.evening;
    expect(somme).toBeLessThanOrEqual(85);
    expect(borne.totalCandidats).toBe(somme);
    expect(borne.ciblesParCreneau.activity).toBeGreaterThan(borne.ciblesParCreneau.meal);
    for (const bornes of [rome, borne, bornesDepuisDemande(config, { activity: 5, meal: 5, evening: 5 }, 2)]) {
      expect(BornesRechercheSchema.safeParse(bornes).success).toBe(true);
    }
  });
});
