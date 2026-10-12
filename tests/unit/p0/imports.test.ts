// @vitest-environment node
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import ts from "typescript";
import { describe, expect, it } from "vitest";

/**
 * `p0: aucun client réel ni accès réseau dans le code de P0a1` — liste d'autorisation des imports (décision 0032,
 * A3.2), contrôlée sur l'arbre syntaxique de chaque fichier par l'API du compilateur TypeScript. Couvre `import`,
 * `import type`, `export … from`, `import x = require()`, et refuse les constructions listées par la spécification.
 *
 * Les fichiers `*.test.ts` sont exclus, sauf pour la règle `node:net`. Les clients simulés (`*.simule.ts`) ne le
 * sont **pas** (écart plus strict de A3.2).
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const rel = (absolu: string) => path.relative(RACINE, absolu).split(path.sep).join("/");

function fichiers(dossier: string, extensions = [".ts", ".tsx"]): string[] {
  const absolu = path.join(RACINE, dossier);
  if (!existsSync(absolu)) return [];
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(rel(chemin), extensions));
    else if (extensions.some((extension) => nom.endsWith(extension)) && !nom.endsWith(".d.ts")) resultat.push(rel(chemin));
  }
  return resultat.sort();
}

const estTest = (fichier: string) => /\.test\.tsx?$/.test(fichier);

// --- Résolution des spécificateurs --------------------------------------------------------------------------

type Cible = { type: "projet"; chemin: string } | { type: "externe"; nom: string };

function resoudreProjet(base: string): string | undefined {
  for (const candidat of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) {
    const absolu = path.join(RACINE, candidat);
    if (existsSync(absolu) && statSync(absolu).isFile()) return rel(absolu);
  }
  return undefined;
}

function resoudre(depuis: string, specificateur: string): Cible {
  if (specificateur.startsWith("@/")) {
    const chemin = resoudreProjet(path.posix.join("src", specificateur.slice(2)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  if (specificateur.startsWith("./") || specificateur.startsWith("../")) {
    const chemin = resoudreProjet(path.posix.normalize(path.posix.join(path.posix.dirname(depuis), specificateur)));
    return chemin ? { type: "projet", chemin } : { type: "externe", nom: specificateur };
  }
  return { type: "externe", nom: specificateur };
}

// --- Analyse d'un fichier -----------------------------------------------------------------------------------

type Import = { specificateur: string; noeud: ts.Node; forme: string };

const IDENTIFIANTS_INTERDITS = new Set([
  "require",
  "createRequire",
  "eval",
  "fetch",
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "sendBeacon",
  "mainModule",
  "binding",
  "dlopen",
  "net",
  "undici",
]);
const PROPRIETES_INTERDITES = new Set(["constructor", "connect", "createConnection"]);

function analyser(fichier: string, source: string): { imports: Import[]; constructions: string[] } {
  const sf = ts.createSourceFile(fichier, source, ts.ScriptTarget.Latest, true, fichier.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const imports: Import[] = [];
  const constructions: string[] = [];
  const visiter = (noeud: ts.Node) => {
    if (ts.isImportDeclaration(noeud) && ts.isStringLiteral(noeud.moduleSpecifier)) {
      imports.push({ specificateur: noeud.moduleSpecifier.text, noeud, forme: noeud.getText(sf) });
    } else if (ts.isExportDeclaration(noeud) && noeud.moduleSpecifier && ts.isStringLiteral(noeud.moduleSpecifier)) {
      imports.push({ specificateur: noeud.moduleSpecifier.text, noeud, forme: noeud.getText(sf) });
    } else if (ts.isImportEqualsDeclaration(noeud) && ts.isExternalModuleReference(noeud.moduleReference)) {
      const expression = noeud.moduleReference.expression;
      imports.push({ specificateur: ts.isStringLiteral(expression) ? expression.text : "?", noeud, forme: noeud.getText(sf) });
    } else if (ts.isImportTypeNode(noeud)) {
      const argument = noeud.argument;
      const texte = ts.isLiteralTypeNode(argument) && ts.isStringLiteral(argument.literal) ? argument.literal.text : "?";
      imports.push({ specificateur: texte, noeud, forme: noeud.getText(sf) });
    }
    if (ts.isCallExpression(noeud) && noeud.expression.kind === ts.SyntaxKind.ImportKeyword) constructions.push("import() dynamique");
    if (ts.isNewExpression(noeud) && ts.isIdentifier(noeud.expression) && noeud.expression.text === "Function") constructions.push("new Function");
    if (ts.isIdentifier(noeud) && IDENTIFIANTS_INTERDITS.has(noeud.text)) constructions.push(noeud.text);
    if (ts.isPropertyAccessExpression(noeud)) {
      const nom = noeud.name.text;
      const objet = noeud.expression.getText(sf);
      if (PROPRIETES_INTERDITES.has(nom)) constructions.push(`.${nom}`);
      if (objet === "process" && nom === "env") constructions.push("process.env");
      if (objet === "import.meta" && nom === "env") constructions.push("import.meta.env");
      if (objet === "module" && nom === "require") constructions.push("module.require");
    }
    if (ts.isElementAccessExpression(noeud) && ts.isStringLiteralLike(noeud.argumentExpression)) {
      const nom = noeud.argumentExpression.text;
      if (IDENTIFIANTS_INTERDITS.has(nom) || PROPRIETES_INTERDITES.has(nom) || nom === "env") constructions.push(`["${nom}"]`);
    }
    ts.forEachChild(noeud, visiter);
  };
  visiter(sf);
  return { imports, constructions };
}

// --- Liste d'autorisation (A3.2) ----------------------------------------------------------------------------

const FEUILLES_PROTOTYPE = ["brief", "config", "candidat", "ancrage", "programme-reduit"].map((nom) => `src/prototype/${nom}.ts`);
const proto = (...noms: string[]) => noms.map((nom) => `src/prototype/${nom}.ts`);
const sous = (dossier: string) => (chemin: string) => chemin.startsWith(`${dossier}/`);

type Regle = { projet: (chemin: string) => boolean; externes: readonly string[] };

const contrats = sous("src/contracts");

function regleDe(fichier: string): Regle | undefined {
  if (FEUILLES_PROTOTYPE.includes(fichier)) return { projet: contrats, externes: ["zod"] };
  if (fichier === "src/prototype/reduction.ts") {
    return { projet: (c) => contrats(c) || proto("ancrage", "programme-reduit").includes(c), externes: ["zod"] };
  }
  if (fichier.startsWith("src/domain/")) {
    return {
      projet: (c) => contrats(c) || sous("src/domain")(c) || proto("brief", "config", "candidat", "ancrage").includes(c),
      externes: ["zod"],
    };
  }
  if (fichier.startsWith("src/ai/")) {
    return { projet: (c) => contrats(c) || sous("src/ai")(c) || proto("brief", "config", "candidat").includes(c), externes: ["zod"] };
  }
  if (fichier.startsWith("src/research/")) {
    const externes = ["zod"];
    if (fichier === "src/research/ip-guard.ts") externes.push("node:net");
    if (fichier === "src/research/extract-text.ts") externes.push("parse5");
    return {
      projet: (c) =>
        contrats(c) ||
        sous("src/ai")(c) ||
        (sous("src/research")(c) && (c !== "src/research/ip-guard.ts" || fichier === "src/research/fetch-page.ts")) ||
        proto("brief", "config", "candidat").includes(c),
      externes,
    };
  }
  if (fichier.startsWith("src/grounding/")) {
    return {
      projet: (c) => contrats(c) || sous("src/grounding")(c) || proto("brief", "config", "candidat", "ancrage").includes(c),
      externes: ["zod"],
    };
  }
  if (fichier.startsWith("scripts/p0/") && fichier.endsWith(".ts")) {
    return {
      projet: (c) =>
        contrats(c) ||
        ["src/prototype", "src/domain", "src/ai", "src/research", "src/grounding", "scripts/p0"].some((d) => sous(d)(c)),
      externes: ["zod", "node:fs", "node:fs/promises", "node:path", "node:util"],
    };
  }
  return undefined;
}

/** Contrôle d'un fichier (chemin relatif au dépôt) : liste des violations, vide si le fichier est conforme. */
function controler(fichier: string, source: string): string[] {
  const { imports, constructions } = analyser(fichier, source);
  const violations: string[] = [];
  const test = estTest(fichier);

  // Règle node:net : appliquée à tous les fichiers, tests compris.
  for (const { specificateur, forme } of imports) {
    const nu = specificateur.replace(/^node:/, "");
    if (nu === "net" || nu.startsWith("net/")) {
      const permis = fichier === "src/research/ip-guard.ts" && forme === 'import { BlockList, isIP } from "node:net";';
      if (!permis) violations.push(`node:net refusé : ${forme}`);
    }
  }
  if (!test && fichier !== "src/research/ip-guard.ts" && constructions.includes("net")) violations.push("identifiant net refusé");
  if (test) {
    // ip-guard.ts n'est importé que par fetch-page.ts et par son propre test.
    for (const { specificateur } of imports) {
      const cible = resoudre(fichier, specificateur);
      if (cible.type === "projet" && cible.chemin === "src/research/ip-guard.ts" && fichier !== "src/research/ip-guard.test.ts") {
        violations.push("ip-guard.ts importé par un test autre que le sien");
      }
    }
    return violations;
  }

  const regle = regleDe(fichier);
  if (regle === undefined) return [`fichier hors de la liste : ${fichier}`];
  for (const { specificateur, forme } of imports) {
    const cible = resoudre(fichier, specificateur);
    if (cible.type === "projet") {
      if (!regle.projet(cible.chemin)) violations.push(`import refusé : ${cible.chemin}`);
    } else if (!regle.externes.includes(cible.nom)) {
      violations.push(`module refusé : ${cible.nom}`);
    } else if (cible.nom === "node:net" && forme !== 'import { BlockList, isIP } from "node:net";') {
      violations.push(`forme refusée : ${forme}`);
    }
  }
  for (const construction of constructions) if (construction !== "net") violations.push(`construction refusée : ${construction}`);
  return violations;
}

// --- Fichiers contrôlés -------------------------------------------------------------------------------------

const DOSSIERS_P0 = ["src/prototype", "src/domain", "src/ai", "src/research", "src/grounding", "scripts/p0"];
const FICHIERS_P0 = DOSSIERS_P0.flatMap((dossier) => fichiers(dossier, [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"]));
const SOURCES_P0 = FICHIERS_P0.filter((fichier) => fichier.endsWith(".ts") && !estTest(fichier));

/** Graphe des imports de projet d'un fichier, transitif. */
function graphe(depart: string): Set<string> {
  const vus = new Set<string>([depart]);
  const pile = [depart];
  while (pile.length > 0) {
    const courant = pile.pop() as string;
    const source = readFileSync(path.join(RACINE, courant), "utf8");
    for (const { specificateur } of analyser(courant, source).imports) {
      const cible = resoudre(courant, specificateur);
      const cle = cible.type === "projet" ? cible.chemin : `externe:${cible.nom}`;
      if (vus.has(cle)) continue;
      vus.add(cle);
      if (cible.type === "projet") pile.push(cible.chemin);
    }
  }
  return vus;
}

describe("p0: aucun client réel ni accès réseau dans le code de P0a1", () => {
  it("les dossiers de P0a1 ne contiennent que des fichiers TypeScript, plus enregistrer.mjs", () => {
    const autres = FICHIERS_P0.filter((fichier) => !fichier.endsWith(".ts"));
    expect(autres).toEqual(["scripts/p0/enregistrer.mjs"]);
    expect(SOURCES_P0.length).toBeGreaterThan(30);
  });

  for (const fichier of FICHIERS_P0.filter((f) => f.endsWith(".ts"))) {
    it(`liste d'autorisation des imports : ${fichier}`, () => {
      expect(controler(fichier, readFileSync(path.join(RACINE, fichier), "utf8"))).toEqual([]);
    });
  }

  it("aucun hôte réel ni module d'environnement de clé dans le code de P0a1", () => {
    for (const fichier of SOURCES_P0) {
      const source = readFileSync(path.join(RACINE, fichier), "utf8");
      expect(source, fichier).not.toMatch(/openrouter\.ai|googleapis\.com|@\/server\/env|OPENROUTER_API_KEY|GOOGLE_MAPS_SERVER_KEY/);
    }
  });

  it("node:net seulement dans ip-guard.ts, parse5 seulement dans extract-text.ts", () => {
    const parNet: string[] = [];
    const parParse5: string[] = [];
    for (const fichier of [...fichiers("src"), ...fichiers("scripts")]) {
      const { imports } = analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8"));
      for (const { specificateur } of imports) {
        if (/^(node:)?net(\/|$)/.test(specificateur)) parNet.push(fichier);
        if (specificateur === "parse5" || specificateur.startsWith("parse5/")) parParse5.push(fichier);
      }
    }
    expect([...new Set(parNet)]).toEqual(["src/research/ip-guard.ts"]);
    expect([...new Set(parParse5)]).toEqual(["src/research/extract-text.ts"]);
  });

  it("ip-guard.ts n'est importé que par fetch-page.ts (et son test)", () => {
    const importeurs = new Set<string>();
    for (const fichier of [...fichiers("src"), ...fichiers("scripts"), ...fichiers("tests")]) {
      for (const { specificateur } of analyser(fichier, readFileSync(path.join(RACINE, fichier), "utf8")).imports) {
        const cible = resoudre(fichier, specificateur);
        if (cible.type === "projet" && cible.chemin === "src/research/ip-guard.ts") importeurs.add(fichier);
      }
    }
    expect([...importeurs].sort()).toEqual(["src/research/fetch-page.ts", "src/research/ip-guard.test.ts"]);
  });

  describe("test négatif : le contrôle échoue sur un texte source interdit", () => {
    const cas: [string, string][] = [
      ["src/research/fetch-page.ts", 'import net from "node:net";'],
      ["src/research/fetch-page.ts", 'import { BlockList } from "@/research/ip-guard";\nnet.connect(443, "10.0.0.1");'],
      ["src/research/agent.ts", 'import * as net from "node:net";'],
      ["src/research/ip-guard.ts", 'import * as net from "node:net";'],
      ["src/research/ip-guard.ts", 'import net from "net";'],
      ["src/research/ip-guard.ts", 'import { BlockList, isIP, connect } from "node:net";'],
      ["src/research/ip-guard.ts", 'import { Socket } from "node:net/x";'],
      ["src/ai/client.ts", 'import { request } from "node:https";'],
      ["src/ai/client.ts", 'import { request } from "http";'],
      ["src/ai/client.ts", 'export { lookup } from "node:dns/promises";'],
      ["src/ai/client.ts", 'import cp = require("child_process");'],
      ["src/ai/client.ts", 'import type { Agent } from "undici";'],
      ["src/ai/client.ts", 'import { generateText } from "ai";'],
      ["src/ai/client.ts", 'const m = await import("node:vm");'],
      ["src/ai/client.ts", 'const m = require("node:tls");'],
      ["src/ai/client.ts", 'import { createRequire } from "node:module";'],
      ["src/ai/client.ts", "const f = eval('1');"],
      ["src/ai/client.ts", "const f = new Function('return 1');"],
      ["src/ai/client.ts", "const f = (() => {}).constructor;"],
      ["src/ai/client.ts", "process.binding('tcp_wrap');"],
      ["src/ai/client.ts", "process.dlopen(module, 'x');"],
      ["src/ai/client.ts", "const m = process.mainModule;"],
      ["src/ai/client.ts", "const m = module.require('x');"],
      ["src/ai/client.ts", "const k = process.env.OPENROUTER_API_KEY;"],
      ["src/ai/client.ts", 'const k = process["env"];'],
      ["src/ai/client.ts", "const k = import.meta.env.X;"],
      ["src/ai/client.ts", "await fetch('https://exemple.org');"],
      ["src/ai/client.ts", "await globalThis.fetch('https://exemple.org');"],
      ["src/ai/client.ts", 'await globalThis["fetch"]("https://exemple.org");'],
      ["src/ai/client.ts", "new WebSocket('wss://exemple.org');"],
      ["src/ai/client.ts", "new XMLHttpRequest();"],
      ["src/ai/client.ts", "new EventSource('https://exemple.org');"],
      ["src/ai/client.ts", "navigator.sendBeacon('https://exemple.org', '');"],
      ["src/ai/requetes.ts", 'import { ancrer } from "@/grounding/ancrage";'],
      ["src/ai/requetes.ts", 'import type { Ancrage } from "@/prototype/ancrage";'],
      ["src/research/agent.ts", 'import { classer } from "@/domain/classement";'],
      ["src/research/agent.ts", 'import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";'],
      ["src/research/agent.ts", 'import { executer } from "../../scripts/p0/pipeline";'],
      ["src/prototype/brief.ts", 'import { CandidatSchema } from "@/prototype/candidat";'],
      ["src/prototype/programme-reduit.ts", 'import { valider } from "@/domain/validation";'],
      ["src/grounding/ancrage.ts", 'import { lireTour } from "@/ai/sorties";'],
      ["src/research/ai.simule.ts", 'import { request } from "node:https";'],
      ["scripts/p0/cli.ts", 'import { spawn } from "node:child_process";'],
      ["scripts/p0/cli.ts", 'import { registerHooks } from "node:module";'],
      ["scripts/p0/cli.ts", "const cle = process.env.GOOGLE_MAPS_SERVER_KEY;"],
      ["src/research/fetch-page.test.ts", 'import net from "node:net";'],
      ["src/research/agent.test.ts", 'import { adresseAutorisee } from "@/research/ip-guard";'],
    ];
    for (const [fichier, source] of cas) {
      it(`${fichier} : ${source.split("\n").at(-1)}`, () => {
        expect(controler(fichier, source).length).toBeGreaterThan(0);
      });
    }

    it("la forme exacte de ip-guard.ts passe", () => {
      expect(controler("src/research/ip-guard.ts", 'import { BlockList, isIP } from "node:net";')).toEqual([]);
    });
  });
});

describe("p0: graphes d'import (décision 0032, A3.2)", () => {
  it("depuis src/ai et src/research, aucun chemin n'atteint src/prototype/ancrage.ts ni src/grounding", () => {
    for (const fichier of SOURCES_P0.filter((f) => f.startsWith("src/ai/") || f.startsWith("src/research/"))) {
      const atteints = [...graphe(fichier)];
      const interdits = atteints.filter(
        (chemin) =>
          chemin === "src/prototype/ancrage.ts" ||
          chemin === "src/prototype/reduction.ts" ||
          chemin === "src/prototype/programme-reduit.ts" ||
          chemin.startsWith("src/grounding/") ||
          chemin.startsWith("src/domain/") ||
          chemin.startsWith("scripts/"),
      );
      expect(interdits, fichier).toEqual([]);
    }
  });

  it("le graphe de programme-reduit.ts ne contient que lui-même, src/contracts et zod", () => {
    const atteints = [...graphe("src/prototype/programme-reduit.ts")];
    for (const chemin of atteints) {
      expect(chemin === "src/prototype/programme-reduit.ts" || chemin.startsWith("src/contracts/") || chemin === "externe:zod", chemin).toBe(true);
    }
  });

  it("le graphe de l'application n'importe ni @/ai, @/research, @/grounding, @/domain ni scripts/ ; de src/prototype, seulement programme-reduit", () => {
    const application = fichiers("src").filter((fichier) => !DOSSIERS_P0.some((d) => fichier.startsWith(`${d}/`)) && !fichier.startsWith("src/contracts/"));
    const configs = ["next.config.ts"].filter((fichier) => existsSync(path.join(RACINE, fichier)));
    for (const fichier of [...application.filter((f) => !estTest(f)), ...configs]) {
      for (const chemin of graphe(fichier)) {
        const interdit =
          ["src/ai/", "src/research/", "src/grounding/", "src/domain/", "scripts/"].some((d) => chemin.startsWith(d)) ||
          (chemin.startsWith("src/prototype/") && chemin !== "src/prototype/programme-reduit.ts");
        expect(interdit, `${fichier} → ${chemin}`).toBe(false);
      }
    }
  });
});
