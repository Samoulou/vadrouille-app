// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import ts from "typescript";
import { beforeAll, describe, expect, it } from "vitest";

import {
  analyser,
  analyserPackageJson,
  cleDeCapacite,
  estFichierTest,
  horsProgramme,
  idLigneCapacite,
  moduleACapacite,
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
/** Capacités de la section 3 ; toute autre clé dans une ligne demande un champ `ecart`. */
const CAPACITES_SECTION_3 = /^(module|identifiant|global|hote|fragment):/;

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
    const calcules = constats.filter((c) => c.regle === "acces-calcule");
    const parType = calcules.filter((c) => c.capacite === "type" && c.admis && !c.par).length;
    const restes = calcules.filter((c) => c.capacite === "reste" && c.admis).length;
    console.info(
      `confinement: ${analyses.length} fichiers analysés, ${horsDuProgramme.length} hors programme (règle fermée), ${duree} ms ; ` +
        `${parType} accès calculés admis par le type, ${restes} restes de déstructuration d'objet admis\n` +
        horsDuProgramme.map((f) => `  - ${f}`).join("\n"),
    );
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
    for (const f of FORMES_NOMINATIVES_TESTS) if (!utilisees.has(`forme-test:${f.fichier}:${f.forme}`)) inutiles.push(`forme-test:${f.fichier}:${f.forme}`);
    expect(inutiles).toEqual([]);
  });

  it("confinement: chaque ligne hors de la section 3 porte son écart écrit ; aucune ligne en double", () => {
    const sansEcart = LIGNES.filter((l) => l.capacites.some((c) => !CAPACITES_SECTION_3.test(c.capacite)) && !l.ecart).map((l) => l.fichier);
    expect(sansEcart).toEqual([]);
    const ids = LIGNES.flatMap((l) => l.capacites.flatMap((c) => c.formes.map((f) => idLigneCapacite(l.fichier, c.capacite, f))));
    expect(ids.length).toBe(new Set(ids).size);
    // Une clé de ligne est toujours une clé de constat (`cleDeCapacite`), jamais une forme libre.
    for (const l of LIGNES) for (const c of l.capacites) expect(cleDeCapacite("module-capacite", c.capacite)).toMatch(/:/);
  });

  it("confinement: fonctions qui reçoivent process.env entier (section 5, forme 2)", () => {
    const fonctions = new Set(resultats.flatMap((r) => r.fonctionsEnv));
    const passages = constats.filter((c) => c.regle === "environnement" && c.capacite === "entier" && c.forme.startsWith("argument:"));
    expect(passages.filter((c) => !fonctions.has(c.forme.slice("argument:".length))).map(decrire)).toEqual([]);
  });
});

type CasFermeture = { readonly id: string; readonly attendu: "refus" | "admis"; readonly fichiers: Readonly<Record<string, string>> };
const CAS_FERMETURE = (JSON.parse(readFileSync(new URL("./donnees/cas-fermeture.json", import.meta.url), "utf8")) as { cas: CasFermeture[] }).cas;

describe("confinement: fermeture transitive", () => {
  it("aucun fichier de portée test ou outil atteint depuis l'application ; aucun import de test depuis un fichier non-test", () => {
    expect(verifierFermeture(resultats, LIGNES, existe)).toEqual([]);
  });

  for (const cas of CAS_FERMETURE) {
    it(`${cas.id} (${cas.attendu})`, () => {
      const virtuels = new Map(Object.entries(cas.fichiers));
      const existeVirtuel = (c: string) => virtuels.has(c);
      const analyses = [...virtuels].map(([chemin, source]) => analyser(chemin, source, { existe: existeVirtuel, lire: (c) => virtuels.get(c) }));
      const nonResolus = analyses.flatMap((r) => r.constats).filter((c) => c.capacite === "non-resolu");
      const violations = [...verifierFermeture(analyses, LIGNES, existeVirtuel), ...nonResolus.map(decrire)];
      if (cas.attendu === "refus") expect(violations.length).toBeGreaterThan(0);
      else expect(violations).toEqual([]);
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

  it("typescript n'est importé que dans la zone de sa ligne (amendement A1 de 0038)", () => {
    const zone = SPECIFICATEURS.find((l) => l.specificateur === "typescript")?.zones ?? [];
    const importateurs = resultats.filter((r) => r.imports.some((i) => i.specificateur === "typescript" || i.specificateur.startsWith("typescript/")));
    for (const r of importateurs) {
      expect(zone.some((z) => z === r.fichier || (z.endsWith("/**") && r.fichier.startsWith(z.slice(0, -2))))).toBe(true);
    }
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

  it("les modules à capacité ne sont importés que par leurs lignes", () => {
    const hors = resultats.flatMap((r) =>
      r.imports.filter((i) => i.cible === undefined && moduleACapacite(i.specificateur)).filter(() => !LIGNES.some((l) => l.fichier === r.fichier)).map((i) => `${r.fichier} ${i.specificateur}`),
    );
    expect(hors).toEqual([]);
  });

  it("délai : la suite du dépôt reste sous le plafond de sécurité (120 s)", () => {
    expect(duree).toBeLessThan(120_000);
    expect(analyses.filter((f) => estFichierTest(f.chemin)).length).toBeGreaterThan(0);
  });
});
