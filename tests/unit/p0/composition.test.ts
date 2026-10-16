// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { afterEach, beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import type { ClientModeles, RequeteModele } from "@/ai/client";
import { DEBUT_DONNEES } from "@/ai/requetes";
import { lireTour } from "@/ai/sorties";
import type { EntreeNotation, NoterCandidats } from "@/ai/noter-candidats";
import type { EntreeRaisons, RedigerRaisons } from "@/ai/rediger-raisons";
import type { CapacitesAncrage } from "@/grounding/ancrage-zone";
import type { ClientPlaces, ClientRoutes } from "@/grounding/interfaces";
import type { Brief } from "@/prototype/brief";
import { LONGUEURS_TEXTE } from "@/prototype/candidat";
import { ConfigRechercheSchema } from "@/prototype/config";
import { chercherCandidats, FENETRE_RECIT_CARACTERES, LONGUEUR_FRAGMENT_MIN, MOTS_RECIT_FENETRE, requeteSansDonneeDuBrief } from "@/research/agent";
import type { LecteurPages } from "@/research/fetch-page";
import { nettoyerRequeteWeb, type ClientRechercheWeb } from "@/research/recherche-web";
import { composerP0Reel, type CapacitesAgent, type CapacitesEtapeFinale, type OptionsComposition } from "@/server/composition/p0-reel";
import type { GardeOuverte } from "@/server/p0/garde";

import { creerHorlogeManuelle } from "../../support/horloge-manuelle";
import { creerPortMemoire } from "../../support/port-consommation-memoire";
import { RACINE, rel, resoudre, type Cible } from "./resolution";

/**
 * Module de composition du mode réel (P0r3c-3, ticket 316 ; décision 0055, section 3, D18 ; avis de la Sécurité S-3) :
 * - `p0: modules de capacité importés par la seule composition` (section 3 point 2 ; S-3 point 2 : `import()` à
 *   spécificateur calculé et réexportations compris) et seul importateur de la composition (point 3) ;
 * - `p0: port de consommation isolé` (point 6, mineur 4 de 0049) ;
 * - séparation des capacités (point 5) : objets de l'agent, de l'ancrage et de l'étape finale, par le type et à
 *   l'exécution ;
 * - S-3 point 3 (E3 de 0049) : à travers `composerP0Reel`, l'appel de modèle part du client réel de modèles
 *   (objet modèle, origine figée, `redirect: "manual"`), le `fetch` global étant un double ; aucun service réel.
 */

// --- Graphe d'imports du dépôt -----------------------------------------------------------------------------------

const MODULES_CAPACITE = (JSON.parse(readFileSync(path.join(RACINE, "tests/unit/confinement/donnees/refus.json"), "utf8")) as { modulesCapaciteP0r1: string[] })
  .modulesCapaciteP0r1;
const COMPOSITION = "src/server/composition/p0-reel.ts";
/** Seul importateur admis de la composition hors des tests (0055 § 3 point 3), livré avec le workflow `p0Run`. */
const IMPORTATEUR_COMPOSITION = "src/workflows/p0-run.ts";

/**
 * Fichiers exemptés : les fichiers de test (`*.test.*`, `*.spec.*`) et les supports de test (`tests/support/`) seulement
 * (mineur 10 de la PR 326) ; les autres fichiers de `tests/` (bouchons, e2e, perf, visuels) et les fichiers de
 * configuration de la racine sont analysés.
 */
const estTest = (fichier: string) => /\.(test|spec)\.(ts|tsx|mts)$/.test(fichier) || fichier.startsWith("tests/support/");

function fichiers(dossier: string): string[] {
  const absolu = path.join(RACINE, dossier);
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin)));
    else if (/\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(nom) && !nom.endsWith(".d.ts")) resultat.push(rel(chemin));
  }
  return resultat;
}

/** Arête d'import : `reexport` pour `export … from`, `calcule` pour un `import()` dont le spécificateur n'est pas littéral. */
type Arete = { readonly specificateur: string; readonly reexport: boolean; readonly calcule: boolean };

/** Imports d'un fichier : statiques, de type, `export … from`, `import x = require()`, `import()` et `require()` littéraux. */
function aretesDe(fichier: string, source: string): Arete[] {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const aretes: Arete[] = [];
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      aretes.push({ specificateur: noeud.moduleSpecifier.text, reexport: false, calcule: false });
    } else if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier !== undefined && ts.isStringLiteral(noeud.moduleSpecifier)) {
      aretes.push({ specificateur: noeud.moduleSpecifier.text, reexport: true, calcule: false });
    } else if (ts.isImportEqualsDeclaration(noeud) && ts.isExternalModuleReference(noeud.moduleReference)) {
      const expression = noeud.moduleReference.expression;
      aretes.push(ts.isStringLiteral(expression) ? { specificateur: expression.text, reexport: false, calcule: false } : { specificateur: "?", reexport: false, calcule: true });
    } else if (ts.isCallExpression(noeud) && (noeud.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(noeud.expression) && noeud.expression.text === "require"))) {
      const argument = noeud.arguments[0];
      aretes.push(argument !== undefined && ts.isStringLiteralLike(argument) ? { specificateur: argument.text, reexport: false, calcule: false } : { specificateur: "?", reexport: false, calcule: true });
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(sf);
  return aretes;
}

type Depot = { readonly fichiers: readonly string[]; readonly lire: (fichier: string) => string; readonly resoudre: (depuis: string, specificateur: string) => Cible };

/**
 * Importateurs non test de modules de capacité, hors de `admis` ; un module qui **réexporte** un module de capacité
 * (`export … from`, directement ou par un autre réexportateur) compte comme module de capacité (S-3 point 2). Un
 * `import()` ou `require()` à spécificateur calculé, dans un fichier non test, est une violation : la fermeture ne
 * pourrait pas être vérifiée.
 */
function violationsCapacite(depot: Depot, capacites: readonly string[], admis: readonly string[]): string[] {
  const aretes = new Map(depot.fichiers.map((f) => [f, aretesDe(f, depot.lire(f)).map((a) => ({ ...a, cible: a.calcule ? null : depot.resoudre(f, a.specificateur) }))]));
  const chemin = (c: Cible | null) => (c !== null && c.type === "projet" ? c.chemin : null);
  const capacite = new Set(capacites);
  for (let change = true; change; ) {
    change = false;
    for (const [fichier, liste] of aretes) {
      if (capacite.has(fichier) || estTest(fichier)) continue;
      if (liste.some((a) => a.reexport && capacite.has(chemin(a.cible) ?? ""))) {
        capacite.add(fichier);
        change = true;
      }
    }
  }
  const violations: string[] = [];
  for (const [fichier, liste] of aretes) {
    if (estTest(fichier)) continue;
    for (const arete of liste) {
      if (arete.calcule) violations.push(`${fichier} → import calculé`);
      const cible = chemin(arete.cible);
      if (cible !== null && capacite.has(cible) && !admis.includes(fichier) && !capacites.includes(fichier)) violations.push(`${fichier} → ${cible}`);
    }
  }
  return violations.sort();
}

/** Importateurs non test d'un fichier (imports, réexportations et `import()` littéraux). */
function importateurs(depot: Depot, cibleCherchee: string): string[] {
  return depot.fichiers
    .filter((f) => !estTest(f) && aretesDe(f, depot.lire(f)).some((a) => !a.calcule && chemin(depot.resoudre(f, a.specificateur)) === cibleCherchee))
    .sort();
  function chemin(c: Cible) {
    return c.type === "projet" ? c.chemin : null;
  }
}

/** Fichiers de projet atteints depuis `depart` (imports, réexportations, `import()` littéraux). */
function atteints(depot: Depot, depart: string): Set<string> {
  const vus = new Set([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    for (const arete of aretesDe(courant, depot.lire(courant))) {
      if (arete.calcule) {
        vus.add(`${courant}?import-calcule`);
        continue;
      }
      const cible = depot.resoudre(courant, arete.specificateur);
      const cle = cible.type === "projet" ? cible.chemin : `externe:${cible.nom}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (cible.type === "projet") pile.push(cible.chemin);
    }
  }
  return vus;
}

const lireDepot = (fichier: string) => readFileSync(path.join(RACINE, fichier), "utf8");
/** Fichiers de configuration de la racine (`*.config.ts`, `*.mjs`…), analysés comme le reste du dépôt (mineur 10). */
const racine = () => readdirSync(RACINE).filter((nom) => /\.(ts|mts|cts|js|mjs|cjs)$/.test(nom) && !nom.endsWith(".d.ts") && statSync(path.join(RACINE, nom)).isFile());
const DEPOT: Depot = {
  fichiers: [...["src", "scripts", "db", "tests", "eslint-rules"].flatMap((dossier) => (statSync(path.join(RACINE, dossier), { throwIfNoEntry: false })?.isDirectory() === true ? fichiers(dossier) : [])), ...racine()],
  lire: lireDepot,
  resoudre,
};

/** Dépôt fictif des cas négatifs : `@/x` → `src/x.ts`, relatif → `<dossier>/x.ts`. */
function depotFictif(contenus: Record<string, string>): Depot {
  return {
    fichiers: Object.keys(contenus),
    lire: (fichier) => contenus[fichier] ?? "",
    resoudre: (depuis, specificateur) => {
      if (specificateur.startsWith("@/")) return { type: "projet", chemin: `src/${specificateur.slice(2)}.ts` };
      if (specificateur.startsWith(".")) return { type: "projet", chemin: path.posix.normalize(path.posix.join(path.posix.dirname(depuis), `${specificateur}.ts`)) };
      return { type: "externe", nom: specificateur };
    },
  };
}

describe("p0: modules de capacité importés par la seule composition", () => {
  it("la liste des modules de capacité est celle du régime (quatre modules, tous présents)", () => {
    expect(MODULES_CAPACITE).toHaveLength(4);
    for (const capacite of MODULES_CAPACITE) expect(DEPOT.fichiers).toContain(capacite);
    expect(DEPOT.fichiers).toContain(COMPOSITION);
  });

  it("hors des tests, seul src/server/composition/p0-reel.ts importe un module de capacité ; aucun import() calculé", () => {
    expect(violationsCapacite(DEPOT, MODULES_CAPACITE, [COMPOSITION])).toEqual([]);
    // La composition importe bien les quatre modules (le test porte sur un cas réel).
    const directs = aretesDe(COMPOSITION, lireDepot(COMPOSITION)).map((a) => resoudre(COMPOSITION, a.specificateur));
    for (const capacite of MODULES_CAPACITE) expect(directs).toContainEqual({ type: "projet", chemin: capacite });
  });

  it(`seul ${IMPORTATEUR_COMPOSITION} (absent tant que le workflow n'est pas livré) peut importer la composition`, () => {
    const trouves = importateurs(DEPOT, COMPOSITION);
    expect(trouves.filter((f) => f !== IMPORTATEUR_COMPOSITION)).toEqual([]);
    for (const interdit of ["src/app/", "src/features/", "src/server/actions/", "src/adapters/index.ts"]) {
      expect(trouves.some((f) => f.startsWith(interdit))).toBe(false);
    }
  });

  it("cas négatifs : import direct, import() littéral ou calculé, require, réexportation par un intermédiaire, import d'un réexportateur", () => {
    const depot = depotFictif({
      "src/server/composition/p0-reel.ts": 'import { a } from "@/capacite";\n',
      "src/server/direct.ts": 'import { a } from "@/capacite";\n',
      "src/server/dynamique.ts": 'const m = () => import("@/capacite");\n',
      "src/server/calcule.ts": 'const nom = "@/capacite";\nconst m = () => import(nom);\n',
      "src/server/requis.ts": 'const m = require("@/capacite");\n',
      "src/server/relais.ts": 'export { a as b } from "@/capacite";\n',
      "src/server/relais-de-relais.ts": 'export * from "./relais";\n',
      "src/app/page.ts": 'import { b } from "@/server/relais-de-relais";\n',
      "src/server/sain.ts": 'import type { T } from "@/autre";\n',
      "tests/unit/capacite.test.ts": 'import { a } from "@/capacite";\n',
      "src/capacite.ts": "export const a = 1;\n",
    });
    expect(violationsCapacite(depot, ["src/capacite.ts"], ["src/server/composition/p0-reel.ts"])).toEqual(
      [
        "src/app/page.ts → src/server/relais-de-relais.ts",
        "src/server/calcule.ts → import calculé",
        "src/server/direct.ts → src/capacite.ts",
        "src/server/dynamique.ts → src/capacite.ts",
        "src/server/relais-de-relais.ts → src/server/relais.ts",
        "src/server/relais.ts → src/capacite.ts",
        "src/server/requis.ts → src/capacite.ts",
      ].sort(),
    );
  });

  it("cas négatifs : une page, une action ou l'index des adaptateurs qui importe la composition est relevé", () => {
    const depot = depotFictif({
      "src/app/x/page.ts": 'import { composerP0Reel } from "@/server/composition/p0-reel";\n',
      "src/server/actions/lancer.ts": 'const c = () => import("@/server/composition/p0-reel");\n',
      "src/adapters/index.ts": 'export * from "../server/composition/p0-reel";\n',
      "src/workflows/p0-run.ts": 'import { composerP0Reel } from "@/server/composition/p0-reel";\n',
      "src/server/composition/p0-reel.ts": "export const composerP0Reel = 1;\n",
    });
    expect(importateurs(depot, COMPOSITION).filter((f) => f !== IMPORTATEUR_COMPOSITION)).toEqual(["src/adapters/index.ts", "src/app/x/page.ts", "src/server/actions/lancer.ts"]);
  });
});

describe("p0: port de consommation isolé", () => {
  const interdit = (cle: string) =>
    cle.startsWith("src/grounding/") || cle === "src/prototype/ancrage.ts" || cle.startsWith("scripts/") || cle.endsWith("?import-calcule");

  it("src/server/usage/port.ts et tout ce qu'il atteint n'importent ni src/grounding, ni @/prototype/ancrage, ni scripts/", () => {
    const vus = atteints(DEPOT, "src/server/usage/port.ts");
    expect(vus.has("src/server/usage/port.ts")).toBe(true);
    expect([...vus].filter(interdit)).toEqual([]);
  });

  it("cas négatifs : un import de src/grounding, de l'ancrage du prototype ou de scripts/, même indirect, est relevé", () => {
    const depot = depotFictif({
      "src/server/usage/port.ts": 'import { a } from "./intermediaire";\nimport type { B } from "@/prototype/ancrage";\n',
      "src/server/usage/intermediaire.ts": 'export { c } from "@/grounding/zone";\nconst d = () => import("../../../scripts/p0/x");\n',
    });
    expect([...atteints(depot, "src/server/usage/port.ts")].filter(interdit).sort()).toEqual(["scripts/p0/x.ts", "src/grounding/zone.ts", "src/prototype/ancrage.ts"]);
  });
});

// --- Séparation des capacités (0055 § 3 point 5) ---------------------------------------------------------------------

describe("p0: séparation des capacités de la composition (types)", () => {
  it("agent : modèles, recherche web et pages ; ancrage : textSearch et detailsLogement ; étape finale : places (fiches), routes, detailsLogement, noterCandidats, redigerRaisons", () => {
    expectTypeOf<keyof CapacitesAgent>().toEqualTypeOf<"modeles" | "rechercheWeb" | "pages">();
    expectTypeOf<CapacitesAgent["modeles"]>().toEqualTypeOf<ClientModeles>();
    expectTypeOf<CapacitesAgent["rechercheWeb"]>().toEqualTypeOf<ClientRechercheWeb>();
    expectTypeOf<CapacitesAgent["pages"]>().toEqualTypeOf<LecteurPages>();
    expectTypeOf<keyof CapacitesAncrage>().toEqualTypeOf<"textSearch" | "detailsLogement">();
    expectTypeOf<keyof CapacitesEtapeFinale>().toEqualTypeOf<"places" | "routes" | "detailsLogement" | "noterCandidats" | "redigerRaisons">();
    expectTypeOf<CapacitesEtapeFinale["places"]>().toEqualTypeOf<Pick<ClientPlaces, "details">>();
    expectTypeOf<keyof CapacitesEtapeFinale["places"]>().toEqualTypeOf<"details">();
    expectTypeOf<CapacitesEtapeFinale["routes"]>().toEqualTypeOf<ClientRoutes>();
    expectTypeOf<CapacitesEtapeFinale["redigerRaisons"]>().toEqualTypeOf<RedigerRaisons>();
    // Amendement A3 de 0055 § 3 point 5 (P0r3c-5) : la notation et la relecture du logement passent à l'étape finale,
    // qui ne reçoit toujours ni client de modèles, ni recherche web, ni pages, ni textSearch libre.
    expectTypeOf<CapacitesEtapeFinale["noterCandidats"]>().toEqualTypeOf<NoterCandidats>();
    expectTypeOf<CapacitesEtapeFinale["detailsLogement"]>().toEqualTypeOf<CapacitesAncrage["detailsLogement"]>();
    expectTypeOf<CapacitesEtapeFinale>().not.toHaveProperty("modeles");
    expectTypeOf<CapacitesEtapeFinale>().not.toHaveProperty("textSearch");
  });

  it("notation des candidats : l'entrée est le brief et nos candidats, sans aucun champ pour une donnée Google", () => {
    expectTypeOf<keyof EntreeNotation>().toEqualTypeOf<"brief" | "lot">();
    type Lieu = EntreeNotation["lot"][number];
    expectTypeOf<Lieu>().not.toHaveProperty("placeId");
    expectTypeOf<Lieu>().not.toHaveProperty("position");
    expectTypeOf<Lieu>().not.toHaveProperty("statut");
    expectTypeOf<Lieu>().not.toHaveProperty("horaires");
  });

  it("rédaction des raisons : l'entrée est le brief et nos candidats, sans aucun champ pour une donnée Google", () => {
    expectTypeOf<keyof EntreeRaisons>().toEqualTypeOf<"brief" | "retenus">();
    type Lieu = EntreeRaisons["retenus"][number];
    // Aucun champ d'ancrage, de fiche ni de trajet dans ce qu'un prompt peut recevoir.
    expectTypeOf<Lieu>().not.toHaveProperty("placeId");
    expectTypeOf<Lieu>().not.toHaveProperty("position");
    expectTypeOf<Lieu>().not.toHaveProperty("statut");
    expectTypeOf<Lieu>().not.toHaveProperty("horaires");
    expectTypeOf<Lieu>().not.toHaveProperty("trajets");
    expectTypeOf<EntreeRaisons["brief"]>().not.toHaveProperty("placeId");
  });

  it("la composition exige une GardeOuverte : un littéral est refusé par le type", () => {
    const options = {} as OptionsComposition;
    // @ts-expect-error un littéral `{ runId }` n'est pas une GardeOuverte (marque non exportée de garde.ts)
    const appel = () => composerP0Reel({ runId: RUN }, options);
    expect(typeof appel).toBe("function");
  });
});

// --- Exécution à travers la composition (S-3 point 3), fetch global remplacé par un double -------------------------

const RUN = "0f2b6c1e-8a4d-4e7b-9c3a-5d6e7f8a9b0c";
const CLE_MODELES = "SENTINELLE-CLE-COMPOSITION-9d1e";
/** Fabriquée dans le test (conversion admise dans les seuls fichiers de `tests/`, 0055 § 1 point 2 et S-1 point 3). */
const GARDE = Object.freeze({ runId: RUN }) as unknown as GardeOuverte;

/**
 * Modules de clés de service remplacés (comme `tests/unit/p0/garde.test.ts`) : la composition ne lit aucune
 * variable ; les clients lisent leur clé par ces modules, à leur construction. La barrière de sortie et la lecture des
 * clés ont leurs propres tests (P0r1) ; ici, la clé de modèles est une sentinelle et la clé Google est refusée sauf
 * mention contraire.
 */
const cles = vi.hoisted(() => ({ google: { present: false } }));
vi.mock("@/server/env/ai", () => ({ lireCleOpenRouter: () => ({ ok: true, cle: "SENTINELLE-CLE-COMPOSITION-9d1e" }) }));
vi.mock("@/server/env/grounding", () => ({
  lireCleGoogle: () => (cles.google.present ? { ok: true, cle: "SENTINELLE-CLE-COMPOSITION-GOOGLE-3a7f" } : { ok: false, code: "production_refused" }),
}));

beforeEach(() => {
  cles.google.present = false;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type Appel = { url: string; init: RequestInit };

function monter(reponses: (() => Promise<Response>)[]) {
  const appels: Appel[] = [];
  const fetchDouble = vi.fn(async (url: string, init: RequestInit) => {
    appels.push({ url, init });
    const suivante = reponses.shift();
    if (suivante === undefined) throw new TypeError("SENTINELLE-FETCH-DOUBLE");
    return suivante();
  });
  vi.stubGlobal("fetch", fetchDouble);
  const horloge = creerHorlogeManuelle();
  const port = creerPortMemoire(horloge);
  const composition = composerP0Reel(GARDE, {
    usage: port,
    plafonds: [],
    coutEstimeModelesMicros: 10_000,
    coutEstimeRechercheWebMicros: 20_000,
    modeles: {
      routage: { data_collection: "deny" },
      rechercheWeb: { modele: "fournisseur/recherche-test", moteur: "exa", maxResultats: 3 },
      notation: { modele: "fournisseur/notation-test" },
      raisons: { modele: "fournisseur/raisons-test" },
    },
    horloge,
  });
  return { composition, appels, port, fetchDouble };
}

const reponseModele = (message: Record<string, unknown>) =>
  new Response(
    JSON.stringify({
      id: "gen-1",
      object: "chat.completion",
      created: 1,
      model: "fournisseur/modele-test",
      provider: "P",
      choices: [{ index: 0, message: { role: "assistant", ...message }, finish_reason: "stop" }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15, cost: 0.003 },
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );

const requete: RequeteModele = {
  etape: "notation",
  modele: "fournisseur/modele-test",
  routage: { data_collection: "deny" },
  prompt: { id: "notation", version: 1 },
  messages: [{ role: "user", contenu: "Question." }],
};

describe("p0: composition, appel de modèle par le client réel de modèles (S-3 point 3)", () => {
  it("agent : l'appel passe par l'enveloppe (origine figée, redirect manual, data_collection deny, aucun greffon), réservé pour l'exécution de la garde", async () => {
    const { composition, appels, port } = monter([async () => reponseModele({ content: '{"ok":true}' })]);
    const agent = composition.agent();
    expect(Object.keys(agent).sort()).toEqual(["modeles", "pages", "rechercheWeb"]);
    expect(await agent.modeles.envoyer(requete)).toEqual({ texte: '{"ok":true}', coutUsd: 0.003, fin: "stop" });
    expect(appels).toHaveLength(1);
    const { url, init } = appels[0] as Appel;
    expect(new URL(url).protocol).toBe("https:");
    expect(new URL(url).pathname).toBe("/api/v1/chat/completions");
    expect(init.redirect).toBe("manual");
    const corps = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(corps.model).toBe("fournisseur/modele-test");
    expect(corps.provider).toEqual({ data_collection: "deny" });
    expect(corps.plugins).toBeUndefined();
    expect(String(init.body)).not.toContain(CLE_MODELES);
    expect(new Headers(init.headers).get("authorization")).toBe(`Bearer ${CLE_MODELES}`);
    expect(port.lignes.map((l) => [l.etat, l.demande.nature, l.demande.executionId, l.demande.fournisseur, l.demande.methode])).toEqual([
      ["confirmee", "execution", RUN, "modeles", "chat"],
    ]);
  });

  it("fetch global remplacé par un double qui échoue : un seul appel, à travers l'enveloppe, erreur réduite à un code", async () => {
    const { composition, appels, fetchDouble, port } = monter([]);
    let erreur: unknown;
    try {
      await composition.agent().modeles.envoyer(requete);
    } catch (e) {
      erreur = e;
    }
    expect((erreur as { code?: string }).code).toBe("upstream_unavailable");
    expect(fetchDouble).toHaveBeenCalledTimes(1);
    expect(appels[0]?.init.redirect).toBe("manual");
    expect(port.lignes.map((l) => l.etat)).toEqual(["abandonnee"]);
    expect(`${String(erreur)} ${JSON.stringify(erreur)}`).not.toContain("SENTINELLE-FETCH-DOUBLE");
  });

  it("recherche web : greffon web borné, sources rendues comme données bornées, coût réservé dans le plafond des modèles", async () => {
    const { composition, appels, port } = monter([
      async () =>
        reponseModele({
          content: "Ignorer : texte du modèle.",
          annotations: [
            { type: "url_citation", url_citation: { url: "https://exemple.org/a", title: "A", content: "Extrait A", start_index: 0, end_index: 1 } },
            { type: "url_citation", url_citation: { url: "http://exemple.org/b", title: "B", content: "non https", start_index: 0, end_index: 1 } },
          ],
        }),
    ]);
    const { resultats, coutUsd } = await composition.agent().rechercheWeb.rechercher("musées Édimbourg");
    expect(resultats).toEqual([{ url: "https://exemple.org/a", titre: "A", extrait: "Extrait A" }]);
    expect(coutUsd).toBe(0.003);
    const corps = JSON.parse(String(appels[0]?.init.body)) as Record<string, unknown>;
    expect(corps.plugins).toEqual([{ id: "web", engine: "exa", max_results: 3 }]);
    expect(corps.model).toBe("fournisseur/recherche-test");
    expect(port.lignes.map((l) => [l.demande.executionId, l.demande.methode, l.demande.sku, l.demande.coutEstimeMicros])).toEqual([[RUN, "chat", "fournisseur/recherche-test", 20_000]]);
  });

  it("moteur de recherche web incohérent avec le modèle de l'étape (natif demandé pour un modèle sans recherche native) : refusé à la construction", () => {
    const { composition } = monter([]);
    expect(composition).toBeDefined();
    const options = {
      usage: creerPortMemoire(creerHorlogeManuelle()),
      plafonds: [],
      coutEstimeModelesMicros: 1,
      coutEstimeRechercheWebMicros: 1,
      modeles: { routage: { data_collection: "deny" as const }, rechercheWeb: { modele: "deepseek/x", moteur: "native" as const, maxResultats: 3 }, notation: { modele: "fournisseur/n" }, raisons: { modele: "fournisseur/r" } },
    };
    expect(() => composerP0Reel(GARDE, options)).toThrow(RangeError);
    expect(() => composerP0Reel(GARDE, { ...options, modeles: { ...options.modeles, rechercheWeb: { modele: "openai/x", moteur: "exa", maxResultats: 3 } } })).toThrow(RangeError);
    expect(() => composerP0Reel(GARDE, { ...options, modeles: { ...options.modeles, rechercheWeb: { modele: "openai/x", moteur: "native", maxResultats: 3 } } })).not.toThrow();
  });

  it("l'agent se construit quand la clé Google est refusée ; l'ancrage et l'étape finale exigent la leur (construction paresseuse, par famille d'étapes)", () => {
    const { composition, fetchDouble } = monter([]);
    expect(() => composition.agent()).not.toThrow();
    for (const fabrique of [composition.ancrage, composition.etapeFinale]) {
      let erreur: unknown;
      try {
        fabrique();
      } catch (e) {
        erreur = e;
      }
      expect((erreur as { code?: string }).code).toBe("production_refused");
    }
    expect(fetchDouble).not.toHaveBeenCalled();
  });

  it("ancrage et étape finale : exactement leurs capacités à l'exécution", async () => {
    cles.google.present = true;
    const { composition, appels } = monter([async () => reponseModele({ content: '{"raisons":[]}' }), async () => reponseModele({ content: '{"notes":[]}' })]);
    expect(Object.keys(composition.ancrage()).sort()).toEqual(["detailsLogement", "textSearch"]);
    const finale = composition.etapeFinale();
    expect(Object.keys(finale).sort()).toEqual(["detailsLogement", "noterCandidats", "places", "redigerRaisons", "routes"]);
    expect(Object.keys(finale.places)).toEqual(["details"]);
    expect(Object.keys(finale.routes)).toEqual(["matrice"]);
    // La rédaction des raisons passe par le client de modèles réel, sans greffon, avec le modèle des raisons.
    const brief = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as EntreeRaisons["brief"];
    await finale.redigerRaisons({ brief, retenus: [] });
    const corps = JSON.parse(String(appels[0]?.init.body)) as Record<string, unknown>;
    expect(corps.model).toBe("fournisseur/raisons-test");
    expect(corps.plugins).toBeUndefined();
    // La notation aussi : client de modèles réel, sans greffon, avec le modèle de la notation (amendement A3 de 0055).
    await finale.noterCandidats({ brief, lot: [] });
    const notation = JSON.parse(String(appels[1]?.init.body)) as Record<string, unknown>;
    expect(notation.model).toBe("fournisseur/notation-test");
    expect(notation.plugins).toBeUndefined();
  });
});

// --- Bloquant 1d de la PR 326 : requête web sans logement ni texte libre du brief --------------------------------------

describe("p0: requête de recherche web, aucune donnée de logement ni texte libre du brief (bloquant 1d de la PR 326)", () => {
  const LOGEMENT = "Appartement SENTINELLE-LOGEMENT 12 rue Imaginaire";
  const RECIT = "Nous fêtons les quarante ans de SENTINELLE-RECIT Martine avec toute la famille, et on aime les musées.";
  const ENGAGEMENT = "Dîner SENTINELLE-ENGAGEMENT chez Paulette";

  it("l'agent, branché sur la recherche web de la composition : seule la requête propre part ; logement, récit recopié et engagement sont refusés", async () => {
    const { composition, appels } = monter([
      async () => reponseModele({ content: "x", annotations: [] }),
      async () => reponseModele({ content: "x", annotations: [] }),
    ]);
    const base = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
    const brief: Brief = {
      ...base,
      logements: [{ texte: LOGEMENT, nuits: 5 }],
      recit: RECIT,
      engagements: [{ libelle: ENGAGEMENT, date: base.arrivee, heure: "20:00", type: "reservation" }],
    };
    const actions = [
      { type: "rechercher", requete: `restaurants près de ${LOGEMENT}` },
      { type: "rechercher", requete: "quarante ans de sentinelle recit martine avec toute la famille" },
      { type: "rechercher", requete: `${ENGAGEMENT} horaires` },
      { type: "rechercher", requete: "musées Édimbourg histoire" },
    ];
    const reponses = [
      JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] }),
      JSON.stringify({ actions, candidats: [], termine: false }),
      JSON.stringify({ actions: [], candidats: [], termine: true }),
    ];
    const requetesModele: RequeteModele[] = [];
    const modeles: ClientModeles = {
      envoyer: async (requete) => {
        requetesModele.push(requete);
        return { texte: reponses.shift() ?? '{"actions":[],"candidats":[],"termine":true}', coutUsd: 0 };
      },
    };
    const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche.json"), "utf8")));
    const { compteurs } = await chercherCandidats(brief, {
      modeles,
      modele: "fournisseur/recherche-test",
      routage: { data_collection: "deny" },
      recherche: composition.agent().rechercheWeb,
      lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
      config,
    });
    expect(compteurs.recherches).toBe(1);
    expect(compteurs.sortiesRefusees.recherche).toBe(3);
    expect(appels).toHaveLength(1);
    const corps = appels.map((a) => String(a.init.body)).join("\n");
    expect(corps).toContain(DEBUT_DONNEES);
    expect(corps).toContain("musées Édimbourg histoire");
    for (const sentinelle of ["SENTINELLE", "sentinelle", "Imaginaire", "imaginaire", "Martine", "martine", "Paulette", "paulette"]) expect(corps, sentinelle).not.toContain(sentinelle);
    // Correction 2 : les modèles du plan et de la recherche ne voient ni le logement ni l'engagement ; le récit, oui.
    expect(requetesModele.map((r) => r.etape)).toEqual(["plan", "recherche", "recherche"]);
    for (const requete of requetesModele) {
      const vu = requete.messages.map((m) => m.contenu).join("\n");
      for (const sentinelle of ["SENTINELLE-LOGEMENT", "Imaginaire", "SENTINELLE-ENGAGEMENT", "Paulette", "logements"]) expect(vu, sentinelle).not.toContain(sentinelle);
      expect(vu).toContain("SENTINELLE-RECIT");
    }
  });

  const base = JSON.parse(readFileSync(path.join(RACINE, "prototype/briefs/edimbourg-1.json"), "utf8")) as Brief;
  const avec = (champs: Partial<Brief>): Brief => ({ ...base, engagements: undefined, recit: undefined, ...champs });

  it.each([
    ["quartier seul", "Hôtel Balmoral, quartier de Marchmont", "restaurants près de Marchmont"],
    ["nom d'hôtel seul", "Hôtel Balmoral, quartier de Marchmont", "brunch au BALMORAL"],
    ["numéro et rue", "Appartement, 12 rue Imaginaire", "café 12 rue imaginaire"],
    ["rue seule, accents et casse", "Appartement, 12 rue Éléonore-Dupré", "brunch rue Eleonore Dupre"],
    ["cyrillique", "Гостиница Метрополь, Тверской район", "рестораны рядом с МЕТРОПОЛЬ"],
    ["cyrillique, quartier", "Гостиница Метрополь, Тверской район", "бары тверской"],
    ["lettres hors ASCII conservées", "Kærlighed Søndergade", "brunch søndergade"],
  ])("logement, %s : requête refusée", (_cas, logement, requete) => {
    expect(requeteSansDonneeDuBrief(requete, avec({ logements: [{ texte: logement, nuits: 5 }] }))).toBe(false);
  });

  it("japonais (écriture sans espace) : logement entier ou privé du nom de la destination refusé ; destination seule admise", () => {
    const brief = avec({ destination: "東京", pays: "日本", logements: [{ texte: "パークハイアット東京", nuits: 3 }] });
    expect(requeteSansDonneeDuBrief("パークハイアット東京 レストラン", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("パークハイアット周辺のレストラン", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("東京 美術館 おすすめ", brief)).toBe(true);
  });

  it("libellé d'engagement : un fragment suffit (cyrillique compris)", () => {
    const engagement = (libelle: string): Brief => avec({ engagements: [{ libelle, date: base.arrivee, heure: "20:00", type: "reservation" }] });
    expect(requeteSansDonneeDuBrief("horaires chez Paulette", engagement("Dîner chez Paulette"))).toBe(false);
    expect(requeteSansDonneeDuBrief("Большой театр билеты", engagement("Балет в Большой театр"))).toBe(false);
  });

  it("mots de la destination et du pays : jamais des fragments ; requête sans fragment admise", () => {
    const brief = avec({ logements: [{ texte: "Leith, Édimbourg, Royaume-Uni", nuits: 5 }] });
    expect(requeteSansDonneeDuBrief("musées Édimbourg Royaume-Uni", brief)).toBe(true);
    expect(requeteSansDonneeDuBrief("bars de Leith", brief)).toBe(false);
  });

  it("texte protégé vide après normalisation (logement, libellé ou récit) : toute requête refusée", () => {
    expect(requeteSansDonneeDuBrief("musées Édimbourg", avec({ logements: [{ texte: "★ ★ ★", nuits: 5 }] }))).toBe(false);
    expect(requeteSansDonneeDuBrief("musées Édimbourg", avec({ engagements: [{ libelle: "🎟️", date: base.arrivee, heure: "20:00", type: "reservation" }] }))).toBe(false);
    expect(requeteSansDonneeDuBrief("musées Édimbourg", avec({ recit: "🎉 !!" }))).toBe(false);
  });

  it("récit court (moins de 6 mots) : comparé en entier", () => {
    expect(requeteSansDonneeDuBrief("idées anniversaire de Martine Édimbourg", avec({ recit: "Anniversaire de Martine" }))).toBe(false);
    expect(requeteSansDonneeDuBrief("jazz", avec({ recit: "Jazz" }))).toBe(false);
    expect(requeteSansDonneeDuBrief("anniversaire Édimbourg", avec({ recit: "Anniversaire de Martine" }))).toBe(true);
  });

  it(`récit long : ${MOTS_RECIT_FENETRE} mots consécutifs refusés ; moins, admis (limite documentée)`, () => {
    const brief = avec({ recit: "Nous fêtons les quarante ans de Martine avec toute la famille, et on aime les musées." });
    expect(MOTS_RECIT_FENETRE).toBe(4);
    expect(requeteSansDonneeDuBrief("quarante ans de Martine restaurant", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("restaurant avec toute la famille", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("ans de Martine", brief)).toBe(true);
  });

  it("récit cyrillique et japonais : protégés", () => {
    expect(requeteSansDonneeDuBrief("день рождения Марины ресторан", avec({ recit: "День рождения Марины" }))).toBe(false);
    expect(requeteSansDonneeDuBrief("家族で美術館が好き 東京", avec({ destination: "東京", pays: "日本", recit: "家族で美術館が好き" }))).toBe(false);
  });

  // --- Troisième tentative (bornée), bloquant 1 du head `3254723` : écritures sans espace fenêtrées par caractères ---

  it(`récit japonais long : ${FENETRE_RECIT_CARACTERES} caractères consécutifs refusés, 7 admis`, () => {
    const brief = avec({
      destination: "東京",
      pays: "日本",
      recit: "家族で東京に行きます。美術館と古い寺を巡りたいです。夜は静かな居酒屋で地元の料理を食べたいです。子供は電車が大好きです。",
    });
    expect(FENETRE_RECIT_CARACTERES).toBe(8);
    expect(requeteSansDonneeDuBrief("静かな居酒屋で地元 東京", brief)).toBe(false);
    // Espaces insérées : les caractères sont comparés bout à bout.
    expect(requeteSansDonneeDuBrief("静かな 居酒屋で 地元", brief)).toBe(false);
    // Long extrait, qui passait au head `3254723` (le récit n'y était reconnu qu'en entier par segment).
    expect(requeteSansDonneeDuBrief("夜は静かな居酒屋で地元の料理を食べたい", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("静かな居酒屋で 東京", brief)).toBe(true);
    expect(requeteSansDonneeDuBrief("東京 美術館 おすすめ", brief)).toBe(true);
  });

  it(`récit chinois long sans ponctuation : ${FENETRE_RECIT_CARACTERES} caractères consécutifs refusés, 7 admis`, () => {
    const brief = avec({ destination: "北京", pays: "中国", recit: "我们一家四口想去北京看故宫和长城晚上想吃正宗的北京烤鸭孩子喜欢动物园" });
    expect(requeteSansDonneeDuBrief("晚上想吃正宗的北京烤鸭", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("我们一家四口想去北京看故宫和长城晚上想吃正宗的北京烤鸭", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("正宗的北京烤鸭", brief)).toBe(true);
    expect(requeteSansDonneeDuBrief("北京 动物园 门票", brief)).toBe(true);
  });

  it("récit thaï : extrait de 8 caractères ou plus refusé, extrait court admis", () => {
    const brief = avec({ destination: "กรุงเทพ", pays: "ไทย", recit: "เราอยากไปวัดพระแก้วและกินอาหารริมทางที่ตลาดนัด" });
    expect(requeteSansDonneeDuBrief("กินอาหารริมทาง กรุงเทพ", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("ตลาดนัด กรุงเทพ", brief)).toBe(true);
  });

  it("récit court en écriture sans espace (moins de 8 caractères) : comparé en entier", () => {
    const brief = avec({ destination: "東京", pays: "日本", recit: "誕生日のお祝い" });
    expect(requeteSansDonneeDuBrief("誕生日のお祝い レストラン", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("誕生日 レストラン", brief)).toBe(true);
  });

  // --- Bloquant tardif du head `f06449c` : récit et requête mêlant écriture à espaces et écriture sans espace ---------

  it("récit à espaces, requête dont les mots sont collés à des caractères sans espace (avant ou après) : refusée", () => {
    const train = avec({ recit: "mon fils adore le train et les musees scientifiques" });
    expect(requeteSansDonneeDuBrief("mon fils adore 国le train 宿et les musees scientifiques", train)).toBe(false);
    expect(requeteSansDonneeDuBrief("国et les musees scientifiques宿", train)).toBe(false);
    const hotel = avec({ recit: "hotel paris reservation near station" });
    expect(requeteSansDonneeDuBrief("宿hotel paris reservation near station国", hotel)).toBe(false);
    expect(requeteSansDonneeDuBrief("호텔hotel paris reservation near", hotel)).toBe(false);
    // Trois mots consécutifs : admis (limite annoncée), collés ou non.
    expect(requeteSansDonneeDuBrief("宿hotel paris reservation", hotel)).toBe(true);
  });

  it("récit mixte « 東京hotel … » : les mots à espaces fenêtrés comme les autres, la suite sans espace par caractères", () => {
    const brief = avec({ destination: "東京", pays: "日本", recit: "東京hotel paris reservation near" });
    expect(requeteSansDonneeDuBrief("東京 hotel paris reservation near", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("東京hotel paris reservation near", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("hotel paris reservation near", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("東京 hotel paris", brief)).toBe(true);
    const long = avec({ destination: "東京", pays: "日本", recit: "家族で美術館と古い寺を巡りたい and we love trains" });
    expect(requeteSansDonneeDuBrief("美術館と古い寺を巡り", long)).toBe(false);
    expect(requeteSansDonneeDuBrief("寺and we love trains", long)).toBe(false);
    expect(requeteSansDonneeDuBrief("東京 美術館 trains", long)).toBe(true);
  });

  it("récit mixte court : les mots à espaces comparés en entier ; une suite sans espace de moins de 8 caractères n'est pas protégée (limite)", () => {
    const brief = avec({ destination: "東京", pays: "日本", recit: "誕生日のお祝い birthday" });
    expect(requeteSansDonneeDuBrief("birthday restaurant 東京", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("誕生日のお祝い birthday", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("誕生日のお祝い レストラン", brief)).toBe(true);
  });

  it(`hangul et javanais : fenêtrés par caractères (${FENETRE_RECIT_CARACTERES}), avec ou sans espace`, () => {
    const colle = avec({ destination: "서울", pays: "대한민국", recit: "가족과함께서울에서맛집" });
    expect(requeteSansDonneeDuBrief("가족과함께서울에서맛집", colle)).toBe(false);
    expect(requeteSansDonneeDuBrief("함께서울에서맛집 추천", colle)).toBe(false);
    expect(requeteSansDonneeDuBrief("서울 맛집 추천", colle)).toBe(true);
    const espace = avec({ destination: "서울", pays: "대한민국", recit: "가족과 함께 서울에서 맛집을 찾고 싶어요" });
    expect(requeteSansDonneeDuBrief("서울에서 맛집을 찾고", espace)).toBe(false);
    expect(requeteSansDonneeDuBrief("서울 맛집", espace)).toBe(true);
    // Syllabes saisies en jamos (forme décomposée) : recomposées par la normalisation.
    expect(requeteSansDonneeDuBrief("함께서울에서맛집".normalize("NFD"), colle)).toBe(false);
    const javanais = avec({ recit: "ꦏꦒꦤꦩꦱꦭꦥꦢꦠꦫꦕꦗ" });
    expect(requeteSansDonneeDuBrief("ꦱꦭꦥꦢ ꦠꦫꦕꦗ", javanais)).toBe(false);
    expect(requeteSansDonneeDuBrief("ꦱꦭꦥꦢꦠꦫꦕ", javanais)).toBe(true);
  });

  it("écriture sans espace : ponctuation et caractères de largeur nulle insérés ne cachent pas l'extrait, nettoyage compris", () => {
    const brief = avec({
      destination: "東京",
      pays: "日本",
      recit: "家族で東京に行きます。美術館と古い寺を巡りたいです。夜は静かな居酒屋で地元の料理を食べたいです。",
    });
    for (const requete of ["静かな、居酒屋で。地元", "静かな・居酒屋で「地元」", "静かな\u200b居酒屋で\u200d地元", "静か\u2060な居酒屋で\ufeff地元"]) {
      expect(requeteSansDonneeDuBrief(requete, brief), requete).toBe(false);
      expect(requeteSansDonneeDuBrief(nettoyerRequeteWeb(requete, LONGUEURS_TEXTE.requete), brief), requete).toBe(false);
    }
    expect(nettoyerRequeteWeb("静か\u2060な居酒屋で", LONGUEURS_TEXTE.requete)).toBe("静か な居酒屋で");
  });

  it("mineur 7 : le schéma des sorties borne la requête du modèle à la longueur de LONGUEURS_TEXTE.requete", () => {
    const tour = (requete: string) => lireTour(JSON.stringify({ actions: [{ type: "rechercher", requete }], candidats: [], termine: false }));
    expect(tour("a".repeat(LONGUEURS_TEXTE.requete)).valeur.actions).toHaveLength(1);
    const trop = tour("a".repeat(LONGUEURS_TEXTE.requete + 1));
    expect(trop.valeur.actions).toHaveLength(0);
    expect(trop.refuses).toBe(1);
  });

  it(`mots courts : mot de ${LONGUEUR_FRAGMENT_MIN} caractères protégé ; texte dont tous les mots hors lieu sont plus courts, comparé en entier (sans le lieu)`, () => {
    expect(LONGUEUR_FRAGMENT_MIN).toBe(3);
    const logement = (texte: string): Brief => avec({ logements: [{ texte, nuits: 5 }] });
    // Mineur 3a : « lac » protégé alors que le texte a d'autres mots.
    expect(requeteSansDonneeDuBrief("restaurant lac", logement("Hôtel du Lac"))).toBe(false);
    // Tous les mots hors lieu de moins de 3 caractères : « le 12 » comparé en entier, lieu exclu (mineur 3b).
    expect(requeteSansDonneeDuBrief("brunch le 12", logement("Le 12, Édimbourg"))).toBe(false);
    expect(requeteSansDonneeDuBrief("le marché Édimbourg", logement("Le 12, Édimbourg"))).toBe(true);
    expect(requeteSansDonneeDuBrief("zen café Édimbourg", logement("Zen Édimbourg"))).toBe(false);
    // Libellé d'engagement aux mots courts : même règle.
    const engagement = avec({ engagements: [{ libelle: "Bal à 9h", date: base.arrivee, heure: "21:00", type: "reservation" }] });
    expect(requeteSansDonneeDuBrief("bal folk Édimbourg", engagement)).toBe(false);
    expect(requeteSansDonneeDuBrief("musées Édimbourg", engagement)).toBe(true);
  });

  it("logement japonais : un nom de 2 caractères suffit (mineur 3c) ; destination seule admise", () => {
    const brief = avec({ destination: "東京", pays: "日本", logements: [{ texte: "新宿ホテル", nuits: 3 }] });
    expect(requeteSansDonneeDuBrief("新宿 レストラン", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("新 宿 ラーメン", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("東京 美術館", brief)).toBe(true);
    expect(requeteSansDonneeDuBrief("新宿hotel", avec({ logements: [{ texte: "Shinjuku hotel", nuits: 3 }] }))).toBe(false);
  });

  it("logement thaï : fenêtre de 4 caractères", () => {
    const brief = avec({ destination: "กรุงเทพ", pays: "ไทย", logements: [{ texte: "โรงแรมริมน้ำสุขุมวิท", nuits: 3 }] });
    expect(requeteSansDonneeDuBrief("ร้านอาหาร สุขุมวิท", brief)).toBe(false);
    expect(requeteSansDonneeDuBrief("ตลาดนัด กรุงเทพ", brief)).toBe(true);
  });

  it("mineur 4 : la requête est nettoyée avant le filtre, et c'est elle qui part", async () => {
    expect(nettoyerRequeteWeb(" musées\u0000 <Édimbourg> ", 200)).toBe("musées   Édimbourg");
    expect(nettoyerRequeteWeb(nettoyerRequeteWeb("a<b>c\u200b", 200), 200)).toBe(nettoyerRequeteWeb("a<b>c\u200b", 200));
    const recues: string[] = [];
    const reponses = [
      JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] }),
      // `<`, `>` et contrôles sont déjà refusés par le schéma des sorties (`texteMaison`) : seules les espaces de bord changent.
      JSON.stringify({ actions: [{ type: "rechercher", requete: "  musées Édimbourg  " }], candidats: [], termine: false }),
      JSON.stringify({ actions: [], candidats: [], termine: true }),
    ];
    const config = ConfigRechercheSchema.parse(JSON.parse(readFileSync(path.join(RACINE, "prototype/config/recherche.json"), "utf8")));
    await chercherCandidats(avec({}), {
      modeles: { envoyer: async () => ({ texte: reponses.shift() ?? '{"actions":[],"candidats":[],"termine":true}', coutUsd: 0 }) },
      modele: "fournisseur/recherche-test",
      routage: { data_collection: "deny" },
      recherche: { rechercher: async (requete) => (recues.push(requete), { resultats: [], coutUsd: 0 }) },
      lecteur: { lire: async () => ({ ok: false, raison: "not_in_search_results" }) },
      config,
    });
    expect(recues).toEqual(["musées Édimbourg"]);
  });
});

// --- Mineur 3 de la PR 326 : lecture de pages à travers la composition, adresses locales refusées --------------------


describe("p0: lecture de pages de la composition, adresses locales refusées (mineur 3 de la PR 326)", () => {
  beforeEach(() => {
    // Barrière de sortie ouverte (préversion, ni proxy ni réglage TLS) : le refus vient du lecteur, pas de la barrière.
    vi.stubEnv("HTTP_PROXY", "");
    vi.stubEnv("http_proxy", "");
    vi.stubEnv("HTTPS_PROXY", "");
    vi.stubEnv("https_proxy", "");
    vi.stubEnv("ALL_PROXY", "");
    vi.stubEnv("all_proxy", "");
    vi.stubEnv("NODE_USE_ENV_PROXY", "");
    vi.stubEnv("node_use_env_proxy", "");
    vi.stubEnv("NODE_TLS_REJECT_UNAUTHORIZED", "");
    vi.stubEnv("NODE_EXTRA_CA_CERTS", "");
    vi.stubEnv("SSL_CERT_FILE", "");
    vi.stubEnv("SSL_CERT_DIR", "");
    vi.stubEnv("OPENSSL_CONF", "");
    vi.stubEnv("SSLKEYLOGFILE", "");
    vi.stubEnv("NODE_OPTIONS", "");
    vi.stubEnv("VERCEL_ENV", "preview");
    vi.stubEnv("VERCEL_TARGET_ENV", "preview");
    vi.stubEnv("VADROUILLE_ENV", "preview");
  });

  it.each([
    ["https://127.0.0.1/", "ip_literal"],
    ["https://localhost/", "address_blocked"],
  ])("%s, pourtant parmi les résultats de recherche : refusée (%s), aucune connexion", async (url, raison) => {
    const { composition, fetchDouble } = monter([]);
    expect(await composition.agent().pages.lire(url, new Set([url]))).toEqual({ ok: false, raison });
    expect(fetchDouble).not.toHaveBeenCalled();
  });
});
