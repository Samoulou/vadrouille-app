// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CLES_INTERDITES_ENTREE, type ReglagesIa } from "@/ai/couche";
import { creerModelesSimules, FixturesModelesSchema } from "@/ai/modeles.simule";
import { BornesRechercheSchema } from "@/research/bornes";
import { evaluerCas, CasEvaluationSchema, MesuresCasSchema, type CasEvaluation, type MesuresCas } from "@/research/evaluation";
import { creerLecteurPages } from "@/research/fetch-page";
import { creerHttpSimule, creerResolveurSimule, FixturesPagesSchema } from "@/research/pages.simule";
import { creerRechercheSimulee, FixturesRechercheSchema } from "@/research/recherche-web.simule";

/**
 * Jeu d'évaluation `evals/` (spécification B7, B7c point 4 et B7-PO-9 ; critères `evals: …` de B7c) : jeu valide,
 * aucune donnée Google, harnais en mode simulé sans réseau ni clé, mesures sans nom de lieu ni compteur d'ancrage,
 * comparées au fichier commité `evals/resultats/simule.json` (pour mettre ce fichier à jour après un changement
 * voulu de prompt, de modèle ou de fixture : `pnpm vitest run tests/unit/evals -u`, jamais en CI).
 */

const RACINE = process.cwd();
const EVALS = path.join(RACINE, "evals");
const RESULTATS_SIMULES = path.join(EVALS, "resultats", "simule.json");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    return statSync(chemin).isDirectory() ? fichiers(chemin) : [chemin];
  });
}

const lireJson = (chemin: string): unknown => JSON.parse(readFileSync(chemin, "utf8"));

function chargerJeu(): CasEvaluation[] {
  return ["briefs", "cas-limites"].flatMap((dossier) =>
    readdirSync(path.join(EVALS, dossier))
      .filter((nom) => nom.endsWith(".json"))
      .sort()
      .map((nom) => {
        const cas = CasEvaluationSchema.parse(lireJson(path.join(EVALS, dossier, nom)));
        expect(`${cas.id}.json`, nom).toBe(nom);
        return cas;
      }),
  );
}

// --- Contrôle « aucune donnée Google » (handover § 10) ---------------------------------------------------------

/** Clés de la liste interdite du handover § 8 : la tête de `CLES_INTERDITES_ENTREE`, jusqu'à `placeId` compris. */
const CLES_GOOGLE = CLES_INTERDITES_ENTREE.slice(0, CLES_INTERDITES_ENTREE.indexOf("placeId") + 1);
const normaliserCle = (cle: string) => cle.toLowerCase().replace(/[_-]/g, "");
const CLES_GOOGLE_NORMALISEES = new Set(CLES_GOOGLE.map(normaliserCle));

const MOTIFS_TEXTE: readonly [string, RegExp][] = [
  // Identifiants de lieu Google (« ChIJ… », « GhIJ… ») et noms de ressource (« places/… »).
  ["identifiant de lieu Google", /\b(?:ChIJ|GhIJ)[A-Za-z0-9_-]{8,}/],
  ["ressource de lieu Google", /\bplaces\/[A-Za-z0-9_-]{8,}/],
  // Paire de coordonnées décimales (latitude, longitude).
  ["coordonnées", /-?\d{1,3}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}/],
  ["hôte Google", /googleapis\.com|maps\.google\.|google\.[a-z.]+\/maps|goo\.gl\/maps|maps\.app\.goo\.gl/i],
];

/** Violations d'un fichier du jeu : motifs de texte, puis clés interdites à tout niveau d'un JSON. */
export function violationsGoogle(nom: string, contenu: string): string[] {
  const violations = MOTIFS_TEXTE.filter(([, motif]) => motif.test(contenu)).map(([libelle]) => `${nom} : ${libelle}`);
  if (nom.endsWith(".json")) {
    const pile: unknown[] = [JSON.parse(contenu)];
    while (pile.length > 0) {
      const noeud = pile.pop();
      if (noeud === null || typeof noeud !== "object") continue;
      if (Array.isArray(noeud)) {
        pile.push(...noeud);
        continue;
      }
      for (const [cle, valeur] of Object.entries(noeud)) {
        if (CLES_GOOGLE_NORMALISEES.has(normaliserCle(cle))) violations.push(`${nom} : clé ${cle}`);
        pile.push(valeur);
      }
    }
  }
  return violations;
}

describe("evals: jeu d'évaluation", () => {
  it("evals: aucune donnée Google dans les jeux d'évaluation", () => {
    const tous = fichiers(EVALS);
    expect(tous.length).toBeGreaterThan(10);
    for (const chemin of tous) expect(violationsGoogle(path.relative(RACINE, chemin), readFileSync(chemin, "utf8"))).toEqual([]);
  });

  it("evals: un fichier qui contient une donnée Google fait échouer le contrôle", () => {
    // Valeurs sentinelles fabriquées (préfixe assemblé : la garde du dépôt de P0r2 refuse un identifiant écrit en clair).
    const identifiant = `${["Ch", "IJ"].join("")}sentinelle_fabriquee_b7c`;
    const cas: [string, string][] = [
      ["a.json", JSON.stringify({ id: identifiant })],
      ["b.json", JSON.stringify({ ressource: `places/${identifiant}` })],
      ["c.json", JSON.stringify({ point: "12.345678, -1.234567" })],
      ["d.md", "Voir https://maps.googleapis.com/maps/api/place/details/json"],
      ["e.md", "https://maps.google.com/?q=1"],
      ["f.json", JSON.stringify({ lieu: { profond: [{ displayName: "x" }] } })],
      ["g.json", JSON.stringify({ place_id: "x" })],
      ["h.json", JSON.stringify({ location: {} })],
      ["i.json", JSON.stringify({ regularOpeningHours: {} })],
    ];
    for (const [nom, contenu] of cas) expect(violationsGoogle(nom, contenu).length, nom).toBeGreaterThan(0);
    expect(violationsGoogle("ok.json", JSON.stringify({ story: "Pas de musée", nom: "Forteresse du rocher" }))).toEqual([]);
  });

  it("evals: le jeu de référence et les cas limites sont valides (B7-PO-9)", () => {
    const jeu = chargerJeu();
    expect(jeu.filter((cas) => cas.type === "reference").map((cas) => cas.id)).toEqual(["edimbourg-1", "edimbourg-2", "edimbourg-3"]);
    expect(jeu.filter((cas) => cas.type === "cas-limite").map((cas) => cas.id).sort()).toEqual(
      ["arrivee-tardive", "budget-mixte", "destination-peu-couverte", "evenement-horaire-fixe", "pas-de-musee", "sans-voiture"].sort(),
    );
    // Brief de référence : mêmes envies, rythme et budget que le brief de P0 dont il vient.
    for (const cas of jeu.filter((c) => c.type === "reference")) {
      const p0 = lireJson(path.join(RACINE, "prototype/briefs", `${cas.id}.json`)) as { envies: string[]; recit: string; budgetRepas: number };
      expect(cas.entree.envies, cas.id).toEqual(p0.envies);
      expect(cas.entree.budgetRepas, cas.id).toBe(p0.budgetRepas);
      expect(cas.demande.story, cas.id).toBe(p0.recit);
    }
  });
});

// --- Harnais en mode simulé ------------------------------------------------------------------------------------

function simulation(nom: string) {
  const fichier = (type: "modeles" | "recherche" | "pages") => {
    const propre = path.join(EVALS, "simule", nom, `${type}.json`);
    return existsSync(propre) ? propre : path.join(RACINE, "prototype/fixtures", type, `${nom}.json`);
  };
  return {
    modeles: FixturesModelesSchema.parse(lireJson(fichier("modeles"))),
    recherche: FixturesRechercheSchema.parse(lireJson(fichier("recherche"))),
    pages: FixturesPagesSchema.parse(lireJson(fichier("pages"))),
  };
}

/** Réglages des étapes : modèles de `prototype/config/modeles.json` (une seule source), structuration sur celui de recherche (B7-TL-8). */
function reglages(): ReglagesIa & { recherche: { modele: string; routage: { data_collection: "deny" } } } {
  const config = lireJson(path.join(RACINE, "prototype/config/modeles.json")) as { etapes: { recherche: string; notation: string; raisons: string } };
  const routage = { data_collection: "deny" as const };
  const etape = (modele: string) => ({ modele, routage });
  return {
    structuration: etape(config.etapes.recherche),
    quartier: etape(config.etapes.recherche),
    plan: etape(config.etapes.recherche),
    recherche: etape(config.etapes.recherche),
    notation: etape(config.etapes.notation),
    raisons: etape(config.etapes.raisons),
  };
}

function bornes() {
  const config = lireJson(path.join(RACINE, "prototype/config/recherche.json")) as Record<string, unknown>;
  const { ciblesParCreneau, totalCandidats, toursMax, ageSourceMaxJours } = config;
  return BornesRechercheSchema.parse({ ciblesParCreneau, totalCandidats, toursMax, ageSourceMaxJours });
}

async function evaluerJeuSimule(jeu: readonly CasEvaluation[]): Promise<MesuresCas[]> {
  const mesures: MesuresCas[] = [];
  for (const cas of jeu) {
    const fixtures = simulation(cas.simulation);
    mesures.push(
      await evaluerCas(cas, {
        modeles: creerModelesSimules(fixtures.modeles),
        recherche: creerRechercheSimulee(fixtures.recherche),
        lecteur: creerLecteurPages({ resoudre: creerResolveurSimule(fixtures.pages.dns), http: creerHttpSimule(fixtures.pages.pages) }),
        reglages: reglages(),
        bornes: bornes(),
        maintenant: () => 0,
      }),
    );
  }
  return mesures;
}

describe("evals: harnais en mode simulé", () => {
  beforeEach(() => {
    // Aucun réseau : un appel à fetch fait échouer le test.
    vi.stubGlobal("fetch", () => {
      throw new Error("réseau interdit dans le harnais simulé");
    });
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("evals: le harnais tourne en simulé sans clé", async () => {
    // Aucune clé de service : `tests/unit/setup.ts` refuse de lancer Vitest si l'une est posée (garde-cles, décision
    // 0031 § 6), et ce fichier ne peut pas importer ce module étroit. Aucun réseau : `fetch` échoue (beforeEach).
    const jeu = chargerJeu();
    const mesures = await evaluerJeuSimule(jeu);
    expect(mesures.map((m) => m.cas)).toEqual(jeu.map((cas) => cas.id));
    for (const m of mesures) expect(MesuresCasSchema.parse(m)).toEqual(m);

    // Mesures produites : les cinq étapes appelées sur un brief de référence, aucune sur la destination peu couverte.
    const reference = mesures.find((m) => m.cas === "edimbourg-1");
    for (const etape of ["structuration", "plan", "recherche", "notation", "raisons"] as const) expect(reference?.etapes[etape].appels, etape).toBeGreaterThan(0);
    expect(reference?.partSources).not.toBeNull();
    const peuCouverte = mesures.find((m) => m.cas === "destination-peu-couverte");
    expect(peuCouverte?.candidatsParCreneau).toEqual({ activity: 0, meal: 0, evening: 0 });
    expect(peuCouverte?.etapes.notation.appels).toBe(0);

    // Ni nom de lieu, ni URL, ni compteur d'ancrage dans les mesures.
    const texte = JSON.stringify(mesures);
    const noms = new Set<string>();
    for (const cas of jeu) {
      const fixtures = simulation(cas.simulation);
      for (const tour of fixtures.modeles.recherche as { candidats?: { nom: string }[] }[]) for (const c of tour.candidats ?? []) noms.add(c.nom);
      for (const incontournable of cas.attentes.incontournables) noms.add(incontournable);
      noms.add(cas.entree.destination);
    }
    for (const nom of noms) expect(texte.includes(nom), nom).toBe(false);
    expect(texte).not.toMatch(/https?:/);
    const cles = new Set<string>();
    const pile: unknown[] = [mesures];
    while (pile.length > 0) {
      const noeud = pile.pop();
      if (noeud === null || typeof noeud !== "object") continue;
      for (const [cle, valeur] of Object.entries(noeud)) {
        if (!Array.isArray(noeud)) cles.add(cle);
        pile.push(valeur);
      }
    }
    for (const cle of cles) expect(cle, cle).not.toMatch(/ancr|ground|google|place|resolu|ecart/i);

    // Résultats commités pour comparer les versions (cadrage § 8).
    const attendu = `${JSON.stringify({ schema: 1, mode: "simule", mesures }, null, 2)}\n`;
    // Mise à jour voulue : `pnpm vitest run tests/unit/evals -u` (Vitest n'écrit jamais ce fichier en CI).
    await expect(attendu).toMatchFileSnapshot(RESULTATS_SIMULES);
  });
});
