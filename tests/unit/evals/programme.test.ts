// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { lireProgramme, ordreEcrit, type CreneauIa, type JourIa, type ProgrammeIa } from "@/ai/sorties";
import { BriefSchema, type Brief } from "@/prototype/brief";
import { reduireSite } from "@/research/fetch-page";
import { sitesDuProgramme } from "@/server/p0/sites";

/**
 * Jeu d'évaluation hors réseau du lot 1 du programme par l'IA (spécification P0-programme-par-ia § 5, critères A1 à A6 ;
 * décision 0116 § 8.4). Sorties **simulées** du prompt `programme` pour rome-1 et edimbourg-1 (`evals/programme/`),
 * écrites à la main avec les noms usuels qu'écrirait l'IA, lues par la lecture de production (`lireProgramme`, puis
 * `ordreEcrit`). Les seuils et les incontournables attendus sont dans `evals/programme/config.json`, **jamais** dans le
 * prompt ni le code de production (P0S2-PO-19, 0115 § 2 point 5). Ce jeu prouve le schéma et la mesure, pas la qualité :
 * la qualité se juge sur l'essai réel de Samuel. Aucune donnée Google.
 */

const RACINE = process.cwd();
const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(path.join(RACINE, chemin), "utf8"));

type Plage = { debut: string; fin: string };
type ConfigIncontournables = { minimum: number; attendus: string[][]; aPart: string[][] };
type Config = {
  finDuJourMin: string;
  debutDuJourMax: string;
  ecartMaxMinutes: number;
  fenetreEcart: Plage;
  delaiArriveeMinutes: number;
  avanceDepartMinutes: number;
  arriveeTardive: string;
  repas: { midi: Plage; soir: Plage };
  apero: { motsCles: string[]; envie: string; partMin: number };
  quartiersMaxParJour: number;
  pourquoiPartMin: number;
  conseilPartMin: number;
  parCas: Record<string, { apero?: { partMin: number; joursEntiersSeulement?: boolean }; incontournables: ConfigIncontournables }>;
};

const CONFIG = lireJson("evals/programme/config.json") as Config;
const CAS = ["rome-1", "edimbourg-1"] as const;

type Cas = { id: string; brief: Brief; programme: ProgrammeIa };

function charger(id: string): Cas {
  const fichier = lireJson(`evals/programme/${id}.json`) as { id: string; brief: string; sortie: unknown };
  expect(fichier.id).toBe(id);
  const brief = BriefSchema.parse(lireJson(`prototype/briefs/${fichier.brief}.json`));
  const lecture = lireProgramme(JSON.stringify(fichier.sortie), { arrivee: brief.arrivee, depart: brief.depart });
  // La sortie simulée passe la lecture de production sans rien perdre.
  expect(lecture).toMatchObject({ illisible: false, joursRetires: 0, creneauxRetires: 0, champsRetires: 0, textesCoupes: 0 });
  return { id, brief, programme: ordreEcrit(lecture.valeur!) };
}

const minutes = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
const finDe = (creneau: CreneauIa) => minutes(creneau.fin ?? creneau.debut);
const normaliser = (texte: string) =>
  texte
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
const avecLieu = (jour: JourIa) => jour.creneaux.filter((creneau) => creneau.lieu !== undefined && creneau.nature !== "arrivee" && creneau.nature !== "depart");

/** Présence du voyageur sur la journée : de l'arrivée (+ délai) au départ (− avance), sinon toute la journée. */
function presence({ brief }: Cas, jour: JourIa): { debut: number; fin: number; premier: boolean; dernier: boolean } {
  const premier = jour.date === brief.arrivee;
  const dernier = jour.date === brief.depart;
  return {
    premier,
    dernier,
    debut: premier ? minutes(brief.heureArrivee) + CONFIG.delaiArriveeMinutes : 0,
    fin: dernier ? minutes(brief.heureDepart) - CONFIG.avanceDepartMinutes : 24 * 60,
  };
}

const chevauche = (debut: number, fin: number, plage: Plage) => debut < minutes(plage.fin) && minutes(plage.debut) < fin;

describe("evals: programme par l'IA, sorties simulées de rome-1 et edimbourg-1 (A1 à A6)", () => {
  const jeux = CAS.map(charger);

  it("evals: incontournables de rome-1 et edimbourg-1", () => {
    for (const cas of jeux) {
      const attendu = CONFIG.parCas[cas.id]!.incontournables;
      const noms = cas.programme.jours.flatMap((jour) => avecLieu(jour).map((creneau) => normaliser(creneau.lieu!)));
      const present = (variantes: string[]) => variantes.some((variante) => noms.some((nom) => nom.includes(normaliser(variante))));
      const trouves = attendu.attendus.filter(present).length;
      // rome-1 : les cinq, sans tolérance ; edimbourg-1 : au moins quatre sur cinq (seuils du jeu, réglables).
      expect(trouves, cas.id).toBeGreaterThanOrEqual(attendu.minimum);
      // Mesuré à part, non bloquant (Trastevere pour rome-1) : seulement relevé.
      const aPart = attendu.aPart.filter(present).length;
      expect(aPart, `${cas.id} (à part)`).toBeGreaterThanOrEqual(0);
    }
    expect(CONFIG.parCas["rome-1"]!.incontournables).toMatchObject({ minimum: 5 });
    expect(CONFIG.parCas["rome-1"]!.incontournables.attendus).toHaveLength(5);
    expect(CONFIG.parCas["edimbourg-1"]!.incontournables).toMatchObject({ minimum: 4 });
  });

  it("programme: journées pleines du matin au soir", () => {
    for (const cas of jeux) {
      for (const jour of cas.programme.jours) {
        const { premier, dernier, debut, fin } = presence(cas, jour);
        const creneaux = jour.creneaux;
        const dernierCreneau = Math.max(...creneaux.map(finDe));
        if (dernier) expect(dernierCreneau, `${cas.id} ${jour.date}`).toBeGreaterThanOrEqual(fin);
        else if (!(premier && minutes(cas.brief.heureArrivee) > minutes(CONFIG.arriveeTardive))) {
          expect(dernierCreneau, `${cas.id} ${jour.date}`).toBeGreaterThanOrEqual(minutes(CONFIG.finDuJourMin));
        }
        if (!premier) expect(minutes(creneaux[0]!.debut), `${cas.id} ${jour.date}`).toBeLessThanOrEqual(minutes(CONFIG.debutDuJourMax));
        else expect(minutes(avecLieu(jour)[0]!.debut), `${cas.id} ${jour.date}`).toBeLessThanOrEqual(debut);
        // Aucun écart de plus de 3 h entre deux créneaux consécutifs, entre 09:00 et 20:00.
        for (let rang = 1; rang < creneaux.length; rang += 1) {
          const avant = finDe(creneaux.at(rang - 1)!);
          const apres = minutes(creneaux.at(rang)!.debut);
          const debutFenetre = Math.max(avant, minutes(CONFIG.fenetreEcart.debut));
          const finFenetre = Math.min(apres, minutes(CONFIG.fenetreEcart.fin));
          expect(Math.max(0, finFenetre - debutFenetre), `${cas.id} ${jour.date} ${creneaux.at(rang)!.debut}`).toBeLessThanOrEqual(CONFIG.ecartMaxMinutes);
        }
      }
    }
  });

  it("programme: repas de midi et du soir chaque jour", () => {
    for (const cas of jeux) {
      for (const jour of cas.programme.jours) {
        const { debut, fin } = presence(cas, jour);
        const natures = new Set(jour.creneaux.map((creneau) => creneau.nature));
        if (chevauche(debut, fin, CONFIG.repas.midi)) expect(natures.has("repas_midi"), `${cas.id} ${jour.date} midi`).toBe(true);
        if (chevauche(debut, fin, CONFIG.repas.soir)) expect(natures.has("repas_soir"), `${cas.id} ${jour.date} soir`).toBe(true);
      }
    }
  });

  it("programme: apéro quand le brief le demande", () => {
    for (const cas of jeux) {
      const recit = normaliser(cas.brief.recit ?? "");
      const demande = CONFIG.apero.motsCles.some((mot) => recit.includes(normaliser(mot))) || (cas.brief.envies as readonly string[]).includes(CONFIG.apero.envie);
      expect(demande, cas.id).toBe(true);
      const reglage = { ...CONFIG.apero, ...CONFIG.parCas[cas.id]!.apero };
      const jours = cas.programme.jours.filter((jour) => {
        const { premier, dernier, fin } = presence(cas, jour);
        if (reglage.joursEntiersSeulement === true) return !premier && !dernier;
        return fin >= minutes(CONFIG.repas.soir.debut);
      });
      const avecApero = jours.filter((jour) => jour.creneaux.some((creneau) => creneau.nature === "apero")).length;
      expect(avecApero / jours.length, cas.id).toBeGreaterThanOrEqual(reglage.partMin);
    }
  });

  it("programme: au plus deux quartiers par jour, titre du jour non vide", () => {
    for (const cas of jeux) {
      for (const jour of cas.programme.jours) {
        expect(jour.titre?.trim(), `${cas.id} ${jour.date}`).toBeTruthy();
        // Hors arrivée, départ et excursion (lieu dans une autre ville).
        const quartiers = new Set(avecLieu(jour).flatMap((creneau) => (creneau.ville === undefined && creneau.quartier !== undefined ? [normaliser(creneau.quartier)] : [])));
        expect(quartiers.size, `${cas.id} ${jour.date}`).toBeLessThanOrEqual(CONFIG.quartiersMaxParJour);
      }
    }
  });

  it("evals: pourquoi sur chaque lieu, conseil sur au moins la moitié (A5)", () => {
    for (const cas of jeux) {
      const lieux = cas.programme.jours.flatMap(avecLieu);
      expect(lieux.length, cas.id).toBeGreaterThan(0);
      expect(lieux.filter((creneau) => creneau.pourquoi !== undefined).length / lieux.length, cas.id).toBeGreaterThanOrEqual(CONFIG.pourquoiPartMin);
      expect(lieux.filter((creneau) => creneau.conseil !== undefined).length / lieux.length, cas.id).toBeGreaterThanOrEqual(CONFIG.conseilPartMin);
    }
  });

  it("evals: sites proposés lus et réduits, aucune donnée Google (lot 2a, A13 et A14 ; 0121 § 4.2)", () => {
    for (const id of CAS) {
      const { programme } = charger(id);
      const fichier = lireJson(`evals/programme/${id}.json`) as { cas: string; attendu: { sitesProposes: number; sitesFormeInvalide: number } };
      expect(fichier.cas, id).toContain("prompt programme v2");
      const sites = sitesDuProgramme(programme, reduireSite);
      expect({ sitesProposes: sites.adresses.length, sitesFormeInvalide: sites.formesRefusees }, id).toEqual(fichier.attendu);
      expect(new Set(sites.adresses).size, id).toBe(sites.adresses.length);
      for (const adresse of sites.adresses) {
        expect(adresse, id).toMatch(/^https:\/\/[^/?#]+\.[^/?#]+\//);
        expect(adresse, id).not.toMatch(/[?#]/);
        expect(adresse, id).not.toMatch(/google|goo\.gl|g\.page|g\.co\//i);
      }
      // Le jeu porte des cas refusés à la forme et au moins un site cité par plusieurs créneaux (dédoublonnage).
      expect(sites.formesRefusees, id).toBeGreaterThan(0);
      const cites = programme.jours.flatMap((jour, j) => jour.creneaux.map((_, rang) => sites.adresseDe(j, rang))).filter((a) => a !== undefined);
      if (id === "rome-1") expect(cites.length, id).toBeGreaterThan(sites.adresses.length);
    }
  });

  it("evals: les seuils et les incontournables ne sont ni dans le prompt ni dans le code de production", () => {
    const prompt = readFileSync(path.join(RACINE, "src/ai/prompts/programme.ts"), "utf8");
    const production = ["src/ai/sorties.ts", "src/ai/rediger-programme.ts", "src/workflows/p0-run.ts", "src/server/p0/assemblage.ts"].map((fichier) => readFileSync(path.join(RACINE, fichier), "utf8"));
    for (const texte of [prompt, ...production]) {
      for (const variantes of Object.values(CONFIG.parCas).flatMap((cas) => cas.incontournables.attendus)) {
        for (const variante of variantes.filter((v) => v.length > 6)) expect(normaliser(texte)).not.toContain(variante);
      }
      expect(texte).not.toContain(CONFIG.finDuJourMin);
    }
  });
});
