// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import {
  analyser,
  analyserPackageJson,
  estFichierTest,
  estNomSecret,
  horsProgramme,
  idLigneCapacite,
  lireCas,
  nomsSecretsDesListes,
  paquetDe,
  type Constat,
  type Resultat,
} from "./analyse";
import { estAnalyse, fichiersSuivis, lireFichier, RACINE, type FichierSuivi } from "./fichiers";
import { verifierFermeture } from "./graphe";
import { LIGNES_CAPACITE, LIGNES_CAPACITE_TEXTES, type LigneCapacite } from "./listes/capacites";
import { FORMES_NOMINATIVES_TESTS } from "./listes/formes-tests";
import { CONSTRUITS, PAQUETS } from "./listes/paquets";
import { ENV_ENTIER, LECTURES_ENV, PARAMETRES_ENV, PROPRIETES_PROCESS } from "./listes/process";
import { SPECIFICATEURS, SPECIFICATEURS_NOMINATIFS } from "./listes/specificateurs";
import { construireProgramme } from "./programme";

/**
 * Régime de confinement sur le dépôt entier (spécification P0c ; décision 0038, P0c-TL-1 point 5 et P0c-TL-5) :
 * seul fichier qui construit le programme TypeScript du dépôt, une fois par exécution.
 */

const LIGNES: readonly LigneCapacite[] = [...LIGNES_CAPACITE, ...LIGNES_CAPACITE_TEXTES];
/**
 * Fichiers des tableaux de la section 3 (exceptions de `40b6738`, lignes du régime lui-même) et de la section 9
 * (`scripts/p0/enregistrer.mjs`) : seules lignes admises sans champ `ecart` (mineur 4 de la revue du head `eb7e3bf`).
 */
const FICHIERS_SECTION_3 = [
  "scripts/serve-standalone.mjs",
  "tests/perf/lighthouse-helpers.ts",
  "tests/unit/ci/visual-update.test.ts",
  "tests/unit/debloquer-regles.test.ts",
  "src/lib/large-screen.test.tsx",
  "src/adapters/simulation.ts",
  "src/components/carte/GoogleMapRenderer.tsx",
  "src/app/fonts.ts",
  "tests/e2e/carte-helpers.ts",
  "tests/e2e/carte.e2e.spec.ts",
  "src/prototype/config.ts",
  "src/prototype/config.test.ts",
  "tests/unit/confinement/fichiers.ts",
  "tests/support/serveur-local.ts",
  "scripts/p0/enregistrer.mjs",
];
/** Ligne d'exception de la décision 0040 D1 (seule exception à la section 2.4, transitoire). */
const LIGNE_D1 = "tests/unit/p0/cli.test.ts";

let suivis: FichierSuivi[];
let analyses: FichierSuivi[];
let resultats: Resultat[];
let constats: Constat[];
let horsDuProgramme: string[];
let existe: (chemin: string) => boolean;
let duree = 0;

beforeAll(() => {
  const debut = Date.now();
  suivis = fichiersSuivis();
  const ensemble = new Set(suivis.map((f) => f.chemin));
  existe = (chemin) => ensemble.has(chemin);
  analyses = suivis.filter((f) => estAnalyse(f.chemin));
  const { programme, verificateur, racines } = construireProgramme(ensemble);
  resultats = [];
  horsDuProgramme = [];
  for (const { chemin } of analyses) {
    const racine = racines.has(chemin);
    if (horsProgramme(chemin, racine)) horsDuProgramme.push(chemin);
    const arbre = racine && !horsProgramme(chemin, racine) ? programme.getSourceFile(path.join(RACINE, chemin)) : undefined;
    resultats.push(
      analyser(chemin, lireFichier(chemin), {
        existe,
        lire: (c) => (ensemble.has(c) ? lireFichier(c) : undefined),
        racine,
        ...(arbre ? { verificateur, arbre } : {}),
      }),
    );
  }
  constats = resultats.flatMap((r) => r.constats);
  duree = Date.now() - debut;
}, 120_000);

const decrire = (c: Constat) => `${c.fichier}:${c.ligne} [${c.regle}] ${c.capacite} — ${c.forme}`;

describe("confinement: dépôt", () => {
  it("énumère les fichiers suivis : liste non vide, aucun lien symbolique analysé", () => {
    expect(analyses.length).toBeGreaterThan(0);
    expect(analyses.filter((f) => f.mode === "120000").map((f) => f.chemin)).toEqual([]);
    // Fichiers hors programme (règle fermée, 0038 TL-5 point 2) : les `.mjs`, `scripts/p0/**` et les zones sensibles.
    expect(horsDuProgramme.length).toBeGreaterThan(0);
  });

  it("confinement: aucune capacité hors des lignes nominatives", () => {
    expect(constats.filter((c) => !c.admis).map(decrire)).toEqual([]);
  });

  it("confinement: aucune ligne inutile", () => {
    const utilisees = new Set(constats.flatMap((c) => (c.par ? [c.par] : [])));
    const inutiles: string[] = [];
    for (const ligne of LIGNES) {
      for (const { capacite, formes } of ligne.capacites) {
        for (const forme of formes) {
          const id = idLigneCapacite(ligne.fichier, capacite, forme);
          if (!utilisees.has(id)) inutiles.push(id);
        }
      }
    }
    for (const l of PROPRIETES_PROCESS) if (!utilisees.has(`process:${l.fichier}:${l.propriete}`)) inutiles.push(`process:${l.fichier}:${l.propriete}`);
    for (const l of LECTURES_ENV) for (const nom of l.noms) if (!utilisees.has(`env:${l.fichier}:${nom}`)) inutiles.push(`env:${l.fichier}:${nom}`);
    for (const l of ENV_ENTIER) for (const forme of l.formes) if (!utilisees.has(`env-entier:${l.fichier}:${forme}`)) inutiles.push(`env-entier:${l.fichier}:${forme}`);
    for (const l of PARAMETRES_ENV) {
      const r = resultats.find((x) => x.fichier === l.fichier);
      if (!r?.fonctionsEnv.includes(l.fonction)) inutiles.push(`parametre-env:${l.fichier}:${l.fonction}`);
    }
    for (const l of SPECIFICATEURS) if (!utilisees.has(`spec:${l.specificateur}`)) inutiles.push(`spec:${l.specificateur}`);
    for (const l of SPECIFICATEURS_NOMINATIFS) {
      if (!utilisees.has(`spec-nominatif:${l.fichier}:${l.specificateur}`)) inutiles.push(`spec-nominatif:${l.fichier}:${l.specificateur}`);
    }
    for (const l of SPECIFICATEURS_NOMINATIFS) {
      for (const nom of l.noms) if (!utilisees.has(`spec-nom:${l.fichier}:${l.specificateur}:${nom}`)) inutiles.push(`spec-nom:${l.fichier}:${l.specificateur}:${nom}`);
    }
    for (const f of FORMES_NOMINATIVES_TESTS) if (!utilisees.has(`forme-test:${f.fichier}:${f.forme}`)) inutiles.push(`forme-test:${f.fichier}:${f.forme}`);
    expect(inutiles).toEqual([]);
  });

  it("confinement: chaque ligne hors des tableaux des sections 3 et 9 porte son écart écrit ; aucune ligne en double", () => {
    expect(LIGNES.filter((l) => !l.ecart && !FICHIERS_SECTION_3.includes(l.fichier)).map((l) => l.fichier)).toEqual([]);
    // Chaque fichier des tableaux a sa ligne (comparaison à la liste exacte, pas à un préfixe de clé).
    expect(FICHIERS_SECTION_3.filter((f) => !LIGNES.some((l) => l.fichier === f && !l.ecart))).toEqual([]);
    const ids = LIGNES.flatMap((l) => l.capacites.flatMap((c) => c.formes.map((f) => idLigneCapacite(l.fichier, c.capacite, f))));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("confinement: chaque écart cite une décision ou une PR (0040 D5)", () => {
    // `PR <n>` vaut `#<n>` : la règle ESLint `ligne/no-hardcoded-colors` prend `#180` pour une couleur.
    const reference = /\b0\d{3}\b|#\d+|\bPR \d+/;
    const ecarts = [
      ...LIGNES.flatMap((l) => (l.ecart === undefined ? [] : [{ ou: l.fichier, texte: l.ecart }])),
      ...SPECIFICATEURS_NOMINATIFS.map((l) => ({ ou: `${l.fichier} ${l.specificateur}`, texte: l.motif })),
      ...FORMES_NOMINATIVES_TESTS.filter((f) => f.motif.startsWith("écart")).map((f) => ({ ou: f.fichier, texte: f.motif })),
    ];
    expect(ecarts.filter((e) => !reference.test(e.texte)).map((e) => e.ou)).toEqual([]);
  });

  it("confinement: forme des lignes lues dans donnees/lignes-textes.json (contrôle d'exécution)", () => {
    const fautes: string[] = [];
    for (const l of LIGNES_CAPACITE_TEXTES as readonly unknown[]) {
      const x = l as Record<string, unknown>;
      const capacites = x.capacites;
      const ok =
        typeof x.fichier === "string" &&
        (x.portee === "test" || x.portee === "outil" || x.portee === "application") &&
        typeof x.usage === "string" &&
        (x.ecart === undefined || typeof x.ecart === "string") &&
        Array.isArray(capacites) &&
        capacites.length > 0 &&
        capacites.every((c: Record<string, unknown>) =>
          typeof c.capacite === "string" &&
          /^(hote|fragment|secret|global):/.test(c.capacite) &&
          Array.isArray(c.formes) &&
          c.formes.length > 0 &&
          c.formes.every((f: unknown) => typeof f === "string") &&
          (c.nombre === undefined || (typeof c.nombre === "number" && Number.isInteger(c.nombre) && c.nombre > 0)),
        ) &&
        Object.keys(x).every((k) => ["fichier", "portee", "usage", "capacites", "ecart"].includes(k));
      if (!ok) fautes.push(JSON.stringify(l).slice(0, 120));
    }
    expect(fautes).toEqual([]);
  });

  it("confinement: fonctions qui reçoivent process.env entier (section 5, forme 2)", () => {
    const fonctions = new Set(resultats.flatMap((r) => r.fonctionsEnv));
    const passages = constats.filter((c) => c.regle === "environnement" && c.capacite === "entier" && c.forme.startsWith("argument:"));
    expect(passages.filter((c) => !fonctions.has(c.forme.slice("argument:".length))).map(decrire)).toEqual([]);
  });
});

const CAS_FERMETURE = lireCas("cas-fermeture.json");

describe("confinement: fermeture transitive", () => {
  it("aucun fichier de portée test ou outil atteint depuis l'application ; aucun import de test depuis un fichier non-test", () => {
    expect(verifierFermeture(resultats, LIGNES, existe)).toEqual([]);
  });

  for (const cas of CAS_FERMETURE) {
    it(`${cas.id} (${cas.attendu}${cas.regle ? ` par ${cas.regle}` : ""})`, () => {
      const virtuels = new Map([[cas.chemin, cas.source], ...Object.entries(cas.fichiers ?? {})]);
      const existeVirtuel = (c: string) => virtuels.has(c);
      const analyses = [...virtuels].map(([chemin, source]) => analyser(chemin, source, { existe: existeVirtuel, lire: (c) => virtuels.get(c) }));
      // Violations typées (règle, fichier) : fermeture, plus les spécificateurs non résolus de l'analyseur.
      const violations = [
        ...verifierFermeture(analyses, LIGNES, existeVirtuel),
        ...analyses.flatMap((r) => r.constats).filter((c) => c.capacite === "non-resolu").map((c) => ({ fichier: c.fichier, regle: c.regle, message: decrire(c) })),
      ];
      if (cas.attendu === "refus") {
        expect(violations.filter((v) => v.regle === cas.regle && v.fichier === cas.chemin).length, JSON.stringify(violations)).toBeGreaterThan(0);
      } else expect(violations).toEqual([]);
    });
  }
});

describe("confinement: spécificateurs et paquets (dépôt)", () => {
  it("package.json : clés, pnpm, versions exactes, aucun script de cycle de vie, liste des paquets", () => {
    const resultat = analyserPackageJson(lireFichier("package.json"), PAQUETS, CONSTRUITS);
    expect(resultat.filter((c) => !c.admis).map((c) => `${c.capacite} — ${c.forme}`)).toEqual([]);
  });

  it("aucune dépendance fantôme : chaque spécificateur tiers appartient à un paquet déclaré", () => {
    const json = JSON.parse(lireFichier("package.json")) as { dependencies: Record<string, string>; devDependencies: Record<string, string> };
    const declares = new Set([...Object.keys(json.dependencies), ...Object.keys(json.devDependencies)]);
    const fantomes = resultats.flatMap((r) =>
      r.imports
        .filter((i) => i.cible === undefined && !i.specificateur.startsWith("node:") && !i.specificateur.startsWith("@/") && !i.specificateur.startsWith("."))
        .filter((i) => !declares.has(paquetDe(i.specificateur)))
        .map((i) => `${r.fichier}:${i.ligne} ${i.specificateur}`),
    );
    expect(fantomes).toEqual([]);
  });

  it("aucun fichier .npmrc, .yarnrc ou pnpm-workspace.yaml suivi", () => {
    expect(suivis.map((f) => f.chemin).filter((c) => /(^|\/)(\.npmrc|\.yarnrc[^/]*|pnpm-workspace\.yaml)$/.test(c))).toEqual([]);
  });
});

type CasListesEnv = {
  readonly id: string;
  readonly lectures: readonly { fichier: string; noms: string[] }[];
  readonly tables: readonly { fichier: string; valeur: string }[];
  readonly attendu: "refus" | "admis";
};
const CAS_LISTES_ENV = (JSON.parse(readFileSync(new URL("./donnees/cas-listes-env.json", import.meta.url), "utf8")) as { cas: CasListesEnv[] }).cas;

describe("confinement: noms secrets dans les listes (section 5 ; bloquant 3 de la revue du head eb7e3bf)", () => {
  it("aucun nom de LECTURES_ENV ni de table de vi.stubEnv n'est secret hors de src/server/env/", () => {
    const tables = FORMES_NOMINATIVES_TESTS.filter((f) => f.forme === "stubEnv-table");
    expect(nomsSecretsDesListes(LECTURES_ENV, tables)).toEqual([]);
  });

  it("seule exception : les vi.stubEnv de VARIABLES_DE_CLE de cli.test.ts (0040 D1)", () => {
    const parLigne = constats.filter((c) => c.capacite === "stubEnv-non-litteral" && c.par?.startsWith("capacite:"));
    expect([...new Set(parLigne.map((c) => c.par))]).toEqual([
      idLigneCapacite(LIGNE_D1, "regime-tests:stubEnv-non-litteral", "vi.stubEnv(nom, `valeur-de-test-${nom}`) (for…of VARIABLES_DE_CLE)"),
    ]);
    expect(parLigne).toHaveLength(2);
    // Aucun vi.stubEnv littéral d'un nom secret n'est admis, où que ce soit.
    expect(constats.filter((c) => c.regle === "nom-secret" && c.capacite.startsWith("stubEnv:")).map(decrire)).toEqual([]);
  });

  for (const cas of CAS_LISTES_ENV) {
    it(`${cas.id} (${cas.attendu})`, () => {
      const violations = nomsSecretsDesListes(cas.lectures, cas.tables);
      if (cas.attendu === "refus") expect(violations.length).toBeGreaterThan(0);
      else expect(violations).toEqual([]);
    });
  }
});

describe("confinement: exception unique à la section 2.4 (0040 D1)", () => {
  it("aucune autre ligne n'admet reflexion:Proxy ni reflexion:Reflect", () => {
    const autres = LIGNES.filter((l) => l.fichier !== LIGNE_D1 && l.capacites.some((c) => /^reflexion:(Proxy|Reflect)$/.test(c.capacite)));
    expect(autres.map((l) => l.fichier)).toEqual([]);
    const d1 = LIGNES.find((l) => l.fichier === LIGNE_D1);
    expect(d1?.ecart).toMatch(/0040 D1/);
    // Chaque forme d'exception de D1 est bornée en nombre.
    for (const c of d1?.capacites ?? []) if (/^(reflexion|environnement|regime-tests):/.test(c.capacite)) expect(c.nombre, c.capacite).toBeDefined();
  });

  it("textes de noms secrets de cli.test.ts : seuls éléments du tableau VARIABLES_DE_CLE", () => {
    const source = lireFichier(LIGNE_D1);
    const arbre = ts.createSourceFile(LIGNE_D1, source, ts.ScriptTarget.Latest, true);
    let ligneDeclaration = -1;
    let elements: string[] = [];
    for (const instruction of arbre.statements) {
      if (!ts.isVariableStatement(instruction)) continue;
      for (const d of instruction.declarationList.declarations) {
        if (ts.isIdentifier(d.name) && d.name.text === "VARIABLES_DE_CLE" && d.initializer && ts.isArrayLiteralExpression(d.initializer)) {
          ligneDeclaration = arbre.getLineAndCharacterOfPosition(d.getStart(arbre)).line + 1;
          elements = d.initializer.elements.map((e) => (ts.isStringLiteral(e) ? e.text : "?"));
        }
      }
    }
    // Les noms ne sont pas écrits ici (le régime s'applique à lui-même) : deux éléments, tous deux des noms secrets.
    expect(elements).toHaveLength(2);
    expect(elements.every(estNomSecret)).toBe(true);
    const textes = constats.filter((c) => c.fichier === LIGNE_D1 && (c.regle === "nom-secret" || c.regle === "hote") && c.par);
    expect(textes.length).toBeGreaterThan(0);
    expect(textes.filter((c) => c.ligne !== ligneDeclaration).map(decrire)).toEqual([]);
  });
});

describe("confinement: le régime s'applique à lui-même", () => {
  const DU_REGIME = (chemin: string) => chemin.startsWith("tests/unit/confinement/") || chemin.startsWith("tests/support/");

  it("ses fichiers .ts sont analysés comme les autres, sans exclusion nominative", () => {
    const fichiers = analyses.map((f) => f.chemin).filter(DU_REGIME);
    for (const attendu of [
      "tests/unit/confinement/analyse.ts",
      "tests/unit/confinement/graphe.ts",
      "tests/unit/confinement/fichiers.ts",
      "tests/unit/confinement/programme.ts",
      "tests/unit/confinement/depot.test.ts",
      "tests/support/serveur-local.ts",
    ]) {
      expect(fichiers).toContain(attendu);
    }
    expect(resultats.filter((r) => DU_REGIME(r.fichier)).length).toBe(fichiers.length);
  });

  it("ni hôte surveillé, ni nom secret, ni texte refusé ; seules capacités : ses deux lignes", () => {
    const duRegime = constats.filter((c) => DU_REGIME(c.fichier));
    expect(duRegime.filter((c) => c.regle === "hote" || c.regle === "nom-secret" || c.regle === "texte-interdit").map(decrire)).toEqual([]);
    const capacites = duRegime.filter((c) => c.par?.startsWith("capacite:")).map((c) => c.par);
    expect([...new Set(capacites)].sort()).toEqual([
      idLigneCapacite("tests/support/serveur-local.ts", "module:node:http", "createServer"),
      idLigneCapacite("tests/unit/confinement/fichiers.ts", "module:node:child_process", "execFileSync"),
    ]);
  });

  it("typescript n'est importé que dans la zone de sa ligne, et chaque fichier nommé de la zone l'importe (amendement A1 de 0038)", () => {
    const zone = SPECIFICATEURS.find((l) => l.specificateur === "typescript")?.zones ?? [];
    const importateurs = resultats
      .filter((r) => r.imports.some((i) => i.specificateur === "typescript" || i.specificateur.startsWith("typescript/")))
      .map((r) => r.fichier);
    for (const f of importateurs) expect(zone.some((z) => z === f || (z.endsWith("/**") && f.startsWith(z.slice(0, -2)))), f).toBe(true);
    // Mineur 8 : les fichiers nommés (sans motif) sont vérifiés un à un ; un fichier qui ne l'importe plus sort de la zone.
    expect(zone.filter((z) => !z.includes("*") && !importateurs.includes(z))).toEqual([]);
  });

  it("énumérateur : execFileSync(\"git\", [\"ls-files\", \"-z\", \"-s\"], …) sans shell ; serveur local sur 127.0.0.1, port 0", () => {
    const appels = (chemin: string, nom: string) => {
      const arbre = ts.createSourceFile(chemin, lireFichier(chemin), ts.ScriptTarget.Latest, true);
      const trouves: ts.CallExpression[] = [];
      const visiter = (n: ts.Node) => {
        if (ts.isCallExpression(n)) {
          const e = n.expression;
          if ((ts.isIdentifier(e) && e.text === nom) || (ts.isPropertyAccessExpression(e) && e.name.text === nom)) trouves.push(n);
        }
        ts.forEachChild(n, visiter);
      };
      visiter(arbre);
      return trouves.map((a) => a.arguments.map((x) => x.getText(arbre)));
    };
    const git = appels("tests/unit/confinement/fichiers.ts", "execFileSync");
    expect(git).toHaveLength(1);
    expect(git[0]?.slice(0, 2)).toEqual(['"git"', '["ls-files", "-z", "-s"]']);
    expect(git[0]?.[2]).not.toMatch(/shell/);
    expect(appels("tests/support/serveur-local.ts", "createServer")).toHaveLength(1);
    const ecoute = appels("tests/support/serveur-local.ts", "listen");
    expect(ecoute).toHaveLength(1);
    expect(ecoute[0]?.slice(0, 2)).toEqual(["0", '"127.0.0.1"']);
  });

  it("délai : la suite du dépôt reste sous le plafond de sécurité (120 s)", () => {
    expect(duree).toBeLessThan(120_000);
    expect(analyses.filter((f) => estFichierTest(f.chemin)).length).toBeGreaterThan(0);
  });
});
