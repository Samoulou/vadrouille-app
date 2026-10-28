// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * B1 (#188, corrections 2 et 3), amendement de la décision 0006 du 2026-10-13 :
 * 1. garde de remplacement de l'exception nominative de `ligne/require-server-only` : `ligne/no-p0-server-modules`
 *    refuse `src/ai`, `src/research` et `src/grounding` (alias normalisé, chemin relatif) dans tout
 *    fichier hors des dossiers serveur, `db/`, `scripts/` et des tests, sous toutes les formes de chargement
 *    (import statique ou de type, réexport, `import()`, `next/dynamic`, `require()`) ; seul un bloc de la
 *    configuration la règle, aucun bloc plus bas ne la remplace ;
 * 2. liste fermée : seuls les 20 modules de phase 0 venus de `main` sont exemptés (26 depuis B7a, ticket 423 ; 27 depuis le prompt `programme`, décision 0115 ; 28 depuis le prompt `revision`, décision 0126) ; un 21e fichier sans
 *    `import "server-only"` est refusé.
 * Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

const GUARD = "ligne/no-p0-server-modules";
const SERVER_ONLY = "ligne/require-server-only";

/** Règles de la configuration calculée d'un fichier, lues par `Map` (objet `any` d'ESLint : spécification P0c, 2.6). */
const rulesOf = (config: { rules?: Record<string, unknown> } | undefined) => new Map(Object.entries(config?.rules ?? {}));

async function guardMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === GUARD) ?? [];
}

async function serverOnlyMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === SERVER_ONLY) ?? [];
}

/** Fichiers dans le périmètre : tous les dossiers chargés (ou chargeables) par le navigateur, listés ou non. */
const IN_SCOPE = [
  "src/app/page.tsx",
  "src/app/dev/exemple/page.tsx",
  "src/app/voyages/[id]/exemple.tsx",
  "src/app/voyages/page.tsx",
  "src/app/(creation)/exemple/page.tsx",
  "src/app/hors-ligne/page.tsx",
  "src/app/not-found.tsx",
  "src/components/ligne/Exemple.tsx",
  "src/components/carte/exemple.ts",
  "src/features/presentation/Exemple.tsx",
  "src/features/compte/Exemple.tsx",
  "src/features/etats/Exemple.tsx",
  "src/features/creation/Exemple.tsx",
  "src/lib/exemple.ts",
  "src/lib/offline/register.ts",
  "src/analytics/exemple.ts",
  "src/i18n/exemple.ts",
  "src/dev/Exemple.tsx",
  "src/dev/EtatsShowcase.tsx",
  // Dossiers sans garde avant la correction 3 (revue du 2026-10-13 09:21).
  "src/adapters/exemple.ts",
  "src/adapters/mock-payment.ts",
  "src/prototype/exemple.ts",
  "src/domain/exemple.ts",
  "src/config/exemple.ts",
  "src/mocks/exemple.ts",
  "src/contracts/exemple.ts",
  "src/hooks/useExemple.ts",
  "src/nouveau-dossier/exemple.tsx",
  "prototype/exemple.js",
];

const FORBIDDEN = [
  "@/ai/client",
  "@/ai/prompts/plan",
  "@/ai",
  "@/research/fetch-page",
  "@/research",
  "@/grounding/ancrage",
  "@/grounding",
  "../ai/client",
  "../../ai/prompts/plan",
  "../../research/agent",
  "../../../grounding/places.simule",
  "../../src/grounding",
  "./ai/client",
  "@/../src/ai/client",
  "@/./ai/client",
  "@/../src/research",
  // Correction 4 (Q327) : segments `..`, `.` ou `//` dans un chemin alias, normalisés avant le test.
  "@/lib/../ai/client",
  "@/lib/x/../../research/a",
  "@//ai/client",
  "@/../src/ai",
  "@/./ai",
];

/** Toutes les formes de chargement d'un module (`S` est remplacé par la source). */
const FORMS: Array<[string, string]> = [
  ["import statique", `import { x } from "S";\nexport const y = x;\n`],
  ["import nu", `import "S";\n`],
  ["import de type", `import type { X } from "S";\nexport type Y = X;\n`],
  ["réexport", `export { x } from "S";\n`],
  ["réexport global", `export * from "S";\n`],
  ["import()", `export async function f() {\n  return await import("S");\n}\n`],
  ["import() d'un gabarit", "export const f = (n: string) => import(`S/${n}`);\n"],
  [
    "next/dynamic",
    `import dynamic from "next/dynamic";\nexport const C = dynamic(() => import("S"));\n`,
  ],
  ["require()", `export const m = require("S");\n`],
  ["import = require()", `import m = require("S");\nexport const y = m;\n`],
  ["typeof import()", `export type M = typeof import("S");\n`],
];

describe("src/ai, src/research et src/grounding restent hors du code client (0006, amendement du 2026-10-13)", () => {
  for (const filePath of IN_SCOPE) {
    it.each(FORBIDDEN)(`import de %s refusé dans ${filePath}`, async (source) => {
      const messages = await guardMessages(`import { x } from "${source}";\nexport const y = x;\n`, filePath);
      expect(messages).toHaveLength(1);
      expect(messages[0]?.severity).toBe(2);
      expect(messages[0]?.message).toContain("src/ai, src/research et src/grounding");
    });

    it.each(FORMS)(`%s refusé dans ${filePath}`, async (_label, template) => {
      for (const source of ["@/ai/client", "../research/sources", "@/../src/grounding/ancrage"]) {
        const messages = await guardMessages(template.replaceAll("S", source), filePath);
        expect(messages, source).toHaveLength(1);
        expect(messages[0]?.severity, source).toBe(2);
      }
    });
  }

  it.each([
    "@/lib/exemple",
    "../aide/exemple",
    "./grounding-note",
    "@/adapters",
    "../airline/x",
    "@/aide",
    "@/researcher/x",
    "@/lib/ai-utils",
    "@/airline",
    "next/dynamic",
  ])("un chemin voisin (%s) n'est pas visé", async (source) => {
    for (const [label, template] of FORMS) {
      expect(await guardMessages(template.replaceAll("S", source), "src/lib/exemple.ts"), label).toHaveLength(0);
    }
  });

  it("un import() dont la source n'est pas fixe n'est pas lu (limite consignée dans 0006)", async () => {
    const code = `export const f = (n: string) => import(n);\nexport const g = (n: string) => require(n);\n`;
    expect(await guardMessages(code, "src/lib/exemple.ts")).toHaveLength(0);
  });

  it.each([
    "src/server/exemple.ts",
    "src/server/actions/exemple.ts",
    "src/tenancy/exemple.ts",
    "src/ai/exemple.ts",
    "src/research/exemple.ts",
    "src/grounding/exemple.ts",
    "src/workflows/exemple.ts",
    "db/exemple.ts",
    "scripts/p0/exemple.ts",
    "tests/unit/exemple.test.ts",
    "src/lib/exemple.test.ts",
    "src/features/x/Exemple.spec.tsx",
  ])("hors périmètre : %s", async (filePath) => {
    for (const [label, template] of FORMS) {
      expect(await guardMessages(template.replaceAll("S", "@/research/sources"), filePath), label).toHaveLength(0);
    }
  });

  it("aucun bloc plus bas ne remplace la règle : elle est active sur chaque fichier réel du périmètre", async () => {
    const skipped = /^(src\/(server|tenancy|ai|research|grounding|workflows)|db|scripts|tests)\//;
    const files = ["src", "prototype", "public", "eslint-rules"]
      .flatMap((dir) => sourceFiles(dir, /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/))
      .filter((f) => !skipped.test(f) && !/\.(test|spec)\.(ts|tsx)$/.test(f));
    expect(files.length).toBeGreaterThan(100);
    for (const filePath of [...files, ...IN_SCOPE]) {
      // Sorties générées et ignorées par ESLint (`globalIgnores`, ex. les routes du SDK `workflow` produites par le
      // build, décision 0063) : aucune configuration n'y est calculée ; elles ne sont pas commitées.
      if (await eslint.isPathIgnored(filePath)) continue;
      const rules = rulesOf(await eslint.calculateConfigForFile(filePath));
      expect(rules.get(GUARD), filePath).toEqual([2]);
    }
  });
});

/**
 * Les modules de phase 0 exemptés de `src/ai`, `src/research` et `src/grounding` : les 20 de la fusion de main dans B1
 * (#188), puis B7a (ticket 423, décision 0077 § 1 points 3 et 4, § 3 point 1) : `src/research/recherche-web.ts` devient
 * `src/ai/recherche-web.ts`, et six modules chargés par `pnpm p0` s'ajoutent (copies tenues égales, prompts
 * `structuration` et `quartier`, `erreurs.ts`) ; puis le prompt `programme` (décision 0115, chargé par `requetes.ts`).
 * Toute modification de la liste passe en revue.
 */
const EXEMPTED = [
  "src/ai/candidat.ts",
  "src/ai/client.ts",
  "src/ai/erreurs.ts",
  "src/ai/modeles.simule.ts",
  "src/ai/prompts/notation.ts",
  "src/ai/prompts/plan.ts",
  "src/ai/prompts/programme.ts",
  "src/ai/prompts/revision.ts",
  "src/ai/prompts/quartier.ts",
  "src/ai/prompts/raisons.ts",
  "src/ai/prompts/recherche.ts",
  "src/ai/prompts/structuration.ts",
  "src/ai/recherche-web.ts",
  "src/ai/reglages.ts",
  "src/ai/requetes.ts",
  "src/ai/sorties.ts",
  "src/grounding/ancrage.ts",
  "src/grounding/interfaces.ts",
  "src/grounding/places.simule.ts",
  "src/grounding/routes.simule.ts",
  "src/research/agent.ts",
  "src/research/candidat.ts",
  "src/research/extract-text.ts",
  "src/research/fetch-page.ts",
  "src/research/ip-guard.ts",
  "src/research/pages.simule.ts",
  "src/research/recherche-web.simule.ts",
  "src/research/sources.ts",
];

/** Adaptateurs de P0 de `src/server/p0` exemptés (P0r3c-5a, puis B7a : `vers-couche-ia.ts`, décision 0077 § 1 point 5). */
const EXEMPTED_SERVEUR_P0 = ["src/server/p0/assemblage.ts", "src/server/p0/vers-moteur.ts", "src/server/p0/vers-couche-ia.ts"];

/** Code partagé de `src/server/programme` chargé par `pnpm p0`, exempté (décision 0136 § 1.5, M1a-1). */
const EXEMPTED_SERVEUR_PROGRAMME = ["src/server/programme/forme.ts", "src/server/programme/entree.ts", "src/server/programme/assemblage.ts"];

function sourceFiles(dir: string, extensions = /\.(js|jsx|ts|tsx)$/): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extensions);
    return extensions.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("exception de server-only : liste fermée de 28 fichiers (20 de B1, puis B7a, puis les prompts programme et revision)", () => {
  const WITHOUT = "export const x = 1;\n";

  it("la liste compte exactement 28 fichiers, tous présents dans le dépôt", () => {
    expect(EXEMPTED).toHaveLength(28);
    expect(new Set(EXEMPTED).size).toBe(28);
    const present = ["src/ai", "src/research", "src/grounding"].flatMap((dir) => sourceFiles(dir));
    for (const filePath of EXEMPTED) expect(present, filePath).toContain(filePath);
  });

  it("aucun autre fichier de src/ai, src/research, src/grounding n'est exempté", async () => {
    const present = ["src/ai", "src/research", "src/grounding"].flatMap((dir) => sourceFiles(dir));
    for (const filePath of present) {
      const rules = rulesOf(await eslint.calculateConfigForFile(filePath));
      const exempted = rules.get(SERVER_ONLY) === undefined;
      expect(exempted, filePath).toBe(EXEMPTED.includes(filePath));
    }
  });

  it.each(EXEMPTED)("%s, de la liste, n'est pas signalé", async (filePath) => {
    expect(await serverOnlyMessages(WITHOUT, filePath)).toHaveLength(0);
  });

  it("src/server/p0 : seuls assemblage, vers-moteur et vers-couche-ia (B7a) sont exemptés, et tous sont présents", async () => {
    const present = sourceFiles("src/server/p0");
    for (const filePath of EXEMPTED_SERVEUR_P0) expect(present, filePath).toContain(filePath);
    for (const filePath of present) {
      const rules = rulesOf(await eslint.calculateConfigForFile(filePath));
      expect(rules.get(SERVER_ONLY) === undefined, filePath).toBe(EXEMPTED_SERVEUR_P0.includes(filePath));
    }
  });

  it("src/server/programme : seuls forme, entree et assemblage sont exemptés, et tous sont présents", async () => {
    const present = sourceFiles("src/server/programme");
    for (const filePath of EXEMPTED_SERVEUR_PROGRAMME) expect(present, filePath).toContain(filePath);
    for (const filePath of present) {
      const rules = rulesOf(await eslint.calculateConfigForFile(filePath));
      expect(rules.get(SERVER_ONLY) === undefined, filePath).toBe(EXEMPTED_SERVEUR_PROGRAMME.includes(filePath));
    }
  });

  it.each([
    "src/ai/client2.ts",
    "src/ai/prompts/nouveau.ts",
    "src/ai/fournisseur/anthropic.ts",
    "src/research/nouveau.ts",
    "src/grounding/places.ts",
    "src/grounding/routes.ts",
  ])("un fichier hors de la liste (%s) sans import \"server-only\" est refusé", async (filePath) => {
    const messages = await serverOnlyMessages(WITHOUT, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });
});
