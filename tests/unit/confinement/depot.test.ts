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
import { ENV_ENTIER, LECTURES_ENV_SECRETES, LECTURES_ENV_TOUTES, PARAMETRES_ENV, PROPRIETES_PROCESS } from "./listes/process";
import { SPECIFICATEURS, SPECIFICATEURS_NOMINATIFS } from "./listes/specificateurs";
import { construireProgramme } from "./programme";

/**
 * Régime de confinement sur le dépôt entier (spécification P0c ; décision 0038, P0c-TL-1 point 5 et P0c-TL-5) :
 * seul fichier qui construit le programme TypeScript du dépôt, une fois par exécution.
 */

const LIGNES: readonly LigneCapacite[] = [...LIGNES_CAPACITE, ...LIGNES_CAPACITE_TEXTES];
/** Lectures de `process.env` : lignes des listes `.ts` et lignes de noms secrets lues dans les données du régime. */
const LECTURES_ENV = LECTURES_ENV_TOUTES;
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
/**
 * Fichier de l'ancienne exception de la décision 0040 D1 (section 2.4), retirée par ticket 221 (décision 0042) : il n'a plus
 * qu'une ligne ordinaire (`module:node:child_process`, `spawnSync`).
 */
const CLI_P0 = "tests/unit/p0/cli.test.ts";

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

  it("confinement: chaque ligne de 0040 D6 est bornée en nombre, forme par forme (revue du head ad0b008, bloquant 4)", () => {
    const sansNombre = LIGNES.filter((l) => l.ecart?.includes("0040 D6")).flatMap((l) =>
      l.capacites.filter((c) => c.nombre === undefined).map((c) => `${l.fichier} ${c.capacite}`),
    );
    expect(sansNombre).toEqual([]);
  });

  it("confinement: chaque écart cite une décision numérotée (0040 D5 ; revue du head ad0b008, mineur 1)", () => {
    // Depuis 0040, une PR seule (`#<n>`, `PR <n>`) ne suffit plus : chaque écart nomme la décision qui le tranche.
    const reference = /\b0\d{3}\b/;
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

  // Revue du head a89d9a5 (PR 244, mineur 2) : les lignes de noms secrets sont lues par simple conversion de type.
  it("confinement: forme des lignes lues dans donnees/lectures-env-secretes.json (contrôle d'exécution)", () => {
    const fautes: string[] = [];
    for (const l of LECTURES_ENV_SECRETES as readonly unknown[]) {
      const x = l as Record<string, unknown>;
      const noms = x.noms;
      const ok =
        typeof x.fichier === "string" &&
        Array.isArray(noms) &&
        noms.length > 0 &&
        noms.every((n: unknown) => typeof n === "string" && /^[A-Z][A-Z0-9_]*$/.test(n)) &&
        new Set(noms).size === noms.length &&
        typeof x.motif === "string" &&
        x.motif.trim() !== "" &&
        x.constante === undefined &&
        Object.keys(x).every((k) => ["fichier", "noms", "motif"].includes(k));
      if (!ok) fautes.push(JSON.stringify(l).slice(0, 120));
    }
    expect(fautes).toEqual([]);
    expect(LECTURES_ENV_SECRETES.length).toBeGreaterThan(0);
  });

  // Revue du head a89d9a5 (PR 244, mineur 7, Sécurité) : db/migrate.ts exporte la lecture de la variable de
  // vadrouille_migrator ; hors de pnpm db:migrate, seuls des fichiers de tests/ peuvent l'importer.
  it("confinement: seuls des fichiers de tests/ importent db/migrate.ts", () => {
    expect(resultats.some((r) => r.fichier === "db/migrate.ts")).toBe(true);
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "db/migrate.ts")).map((r) => r.fichier);
    expect(importeurs.length).toBeGreaterThan(0);
    expect(importeurs.filter((f) => !f.startsWith("tests/"))).toEqual([]);
  });

  // Revue du head a89d9a5 (PR 244, mineur 8, Sécurité) : `uniqueKeyName` assemble des noms en `_key` ; il reste borné
  // aux noms de contraintes du schéma.
  it("confinement: seuls des fichiers de db/schema/ importent db/schema/naming.ts", () => {
    const importeurs = resultats.filter((r) => r.imports.some((i) => i.cible === "db/schema/naming.ts")).map((r) => r.fichier);
    expect(importeurs.length).toBeGreaterThan(0);
    expect(importeurs.filter((f) => !f.startsWith("db/schema/"))).toEqual([]);
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
    // Les données de noms secrets ne portent que des noms secrets ; tout autre nom reste dans les listes `.ts`.
    expect(LECTURES_ENV_SECRETES.flatMap((l) => l.noms.filter((nom) => !estNomSecret(nom)).map((nom) => `${l.fichier} : ${nom}`))).toEqual([]);
  });

  it("aucune exception : aucun vi.stubEnv non littéral ni à nom secret admis par une ligne (0040 D1 retirée, 0042)", () => {
    // Aucun constat `stubEnv-non-litteral` n'est admis par une ligne de capacité (les tables d'`it.each` de
    // `listes/formes-tests.ts` restent jugées par le contrôle précédent).
    expect(constats.filter((c) => c.capacite === "stubEnv-non-litteral" && c.par?.startsWith("capacite:")).map(decrire)).toEqual([]);
    // Aucune ligne, dans `listes/*.ts` ni dans `donnees/lignes-textes.json`, ne porte une forme de `vi.stubEnv`.
    expect(LIGNES.flatMap((l) => l.capacites.filter((c) => c.capacite.startsWith("regime-tests:stubEnv")).map((c) => `${l.fichier} ${c.capacite}`))).toEqual(
      [],
    );
    // Aucun vi.stubEnv d'un nom secret n'est admis, où que ce soit.
    expect(constats.filter((c) => c.capacite.startsWith("stubEnv:") && c.admis).map(decrire)).toEqual([]);
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

describe("confinement: aucune exception à la section 2.4 (0040 D1 retirée par ticket 221, décision 0042)", () => {
  it("aucune ligne n'admet reflexion:Proxy ni reflexion:Reflect ; aucun écart ne cite 0040 D1", () => {
    // `LIGNES` réunit `listes/capacites.ts` et `donnees/lignes-textes.json`.
    const reflexion = LIGNES.filter((l) => l.capacites.some((c) => /^reflexion:(Proxy|Reflect)$/.test(c.capacite)));
    expect(reflexion.map((l) => l.fichier)).toEqual([]);
    const ecrits = [
      ...LIGNES.flatMap((l) => (l.ecart === undefined ? [] : [{ ou: l.fichier, texte: l.ecart }])),
      ...SPECIFICATEURS_NOMINATIFS.map((l) => ({ ou: `${l.fichier} ${l.specificateur}`, texte: l.motif })),
      ...FORMES_NOMINATIVES_TESTS.map((f) => ({ ou: f.fichier, texte: f.motif })),
    ];
    expect(ecrits.filter((e) => /0040 D1/.test(e.texte)).map((e) => e.ou)).toEqual([]);
    // cli.test.ts : aucune ligne n'admet pour lui les formes de l'ancienne exception, un texte de nom secret ou un module réseau.
    const formesD1 = /^(reflexion:|environnement:(usage|ecriture|acces-calcule)$|regime-tests:stubEnv-non-litteral$|secret:|fragment:|hote:|identifiant:fetch$|module:node:(dns|http|https|net|tls)(\/|$))/;
    expect(LIGNES.filter((l) => l.fichier === CLI_P0).flatMap((l) => l.capacites.map((c) => c.capacite)).filter((c) => formesD1.test(c))).toEqual([]);
    expect(LIGNES.filter((l) => l.fichier === CLI_P0).flatMap((l) => l.capacites.map((c) => c.capacite))).toEqual(["module:node:child_process"]);
  });

  it("cli.test.ts ne contient aucun texte de nom secret ni d'hôte surveillé, et aucune lecture calculée de process.env", () => {
    const source = lireFichier(CLI_P0);
    const arbre = ts.createSourceFile(CLI_P0, source, ts.ScriptTarget.Latest, true);
    // Aucun littéral de texte du fichier n'est un nom secret (le régime s'applique à lui-même : aucun nom n'est écrit ici).
    const litteraux: string[] = [];
    const visiter = (n: ts.Node) => {
      if (ts.isStringLiteralLike(n)) litteraux.push(n.text);
      ts.forEachChild(n, visiter);
    };
    visiter(arbre);
    expect(litteraux.length).toBeGreaterThan(0);
    expect(litteraux.filter(estNomSecret)).toEqual([]);
    const duFichier = constats.filter((c) => c.fichier === CLI_P0);
    expect(duFichier.filter((c) => c.regle === "nom-secret" || c.regle === "hote" || c.regle === "reflexion").map(decrire)).toEqual([]);
    expect(duFichier.filter((c) => c.regle === "environnement" && c.capacite !== "lecture").map(decrire)).toEqual([]);
    expect(duFichier.filter((c) => !c.admis).map(decrire)).toEqual([]);
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
