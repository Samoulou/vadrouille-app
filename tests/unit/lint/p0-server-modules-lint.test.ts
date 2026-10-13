// @vitest-environment node
import { readdirSync } from "node:fs";
import { join } from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * B1 (#188, correction 2), amendement de la décision 0006 du 2026-10-13 :
 * 1. garde de remplacement de l'exception nominative de `ligne/require-server-only` : ni `src/ai`, ni
 *    `src/research`, ni `src/grounding` (alias ou chemin relatif) depuis `src/app`, `src/components`,
 *    `src/features`, `src/lib`, `src/analytics`, `src/i18n`, `src/dev` (`src/hooks` n'existe pas) ;
 * 2. liste fermée : seuls les 20 modules de phase 0 venus de `main` sont exemptés ; un 21e fichier sans
 *    `import "server-only"` est refusé.
 * Configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });

const IMPORTS = ["no-restricted-imports", "@typescript-eslint/no-restricted-imports"];
const SERVER_ONLY = "ligne/require-server-only";

async function importMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId !== null && IMPORTS.includes(m.ruleId)) ?? [];
}

async function serverOnlyMessages(code: string, filePath: string) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === SERVER_ONLY) ?? [];
}

const CLIENT_FILES = [
  "src/app/page.tsx",
  "src/app/dev/exemple/page.tsx",
  "src/app/voyages/[id]/exemple.tsx",
  "src/app/voyages/page.tsx",
  "src/app/(creation)/exemple/page.tsx",
  "src/app/not-found.tsx",
  "src/components/ligne/Exemple.tsx",
  "src/components/carte/exemple.ts",
  "src/features/presentation/Exemple.tsx",
  "src/features/compte/Exemple.tsx",
  "src/features/etats/Exemple.tsx",
  "src/lib/exemple.ts",
  "src/analytics/exemple.ts",
  "src/i18n/exemple.ts",
  "src/dev/Exemple.tsx",
  "src/dev/EtatsShowcase.tsx",
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
];

const ALLOWED = ["@/lib/exemple", "../aide/exemple", "./grounding-note", "@/adapters", "../airline/x"];

describe("src/ai, src/research et src/grounding restent hors du code client (0006, amendement du 2026-10-13)", () => {
  for (const filePath of CLIENT_FILES) {
    it.each(FORBIDDEN)(`import de %s refusé dans ${filePath}`, async (source) => {
      const messages = await importMessages(`import { x } from "${source}";\nexport const y = x;\n`, filePath);
      expect(messages.some((m) => m.message.includes("src/ai, src/research et src/grounding"))).toBe(true);
      expect(messages.every((m) => m.severity === 2)).toBe(true);
    });
  }

  it.each(CLIENT_FILES)("import type et réexport refusés aussi dans %s", async (filePath) => {
    expect(await importMessages(`import type { X } from "@/ai/sorties";\nexport type Y = X;\n`, filePath)).not.toHaveLength(0);
    expect(await importMessages(`export { x } from "@/research/sources";\n`, filePath)).not.toHaveLength(0);
  });

  it.each(ALLOWED)("un chemin voisin (%s) n'est pas visé", async (source) => {
    const messages = await importMessages(`import { x } from "${source}";\nexport const y = x;\n`, "src/lib/exemple.ts");
    expect(messages.filter((m) => m.message.includes("src/ai, src/research et src/grounding"))).toHaveLength(0);
  });

  it("hors périmètre : src/server, src/adapters, src/ai entre eux, tests", async () => {
    for (const filePath of ["src/server/exemple.ts", "src/adapters/exemple.ts", "src/ai/exemple.ts", "src/lib/exemple.test.ts"]) {
      const messages = await importMessages(`import { x } from "@/research/sources";\nexport const y = x;\n`, filePath);
      expect(messages.filter((m) => m.message.includes("src/ai, src/research et src/grounding")), filePath).toHaveLength(0);
    }
  });
});

/** Les 20 modules de phase 0 exemptés (fusion de main dans B1, #188). Toute modification de la liste passe en revue. */
const EXEMPTED = [
  "src/ai/client.ts",
  "src/ai/modeles.simule.ts",
  "src/ai/prompts/notation.ts",
  "src/ai/prompts/plan.ts",
  "src/ai/prompts/raisons.ts",
  "src/ai/prompts/recherche.ts",
  "src/ai/requetes.ts",
  "src/ai/sorties.ts",
  "src/grounding/ancrage.ts",
  "src/grounding/interfaces.ts",
  "src/grounding/places.simule.ts",
  "src/grounding/routes.simule.ts",
  "src/research/agent.ts",
  "src/research/extract-text.ts",
  "src/research/fetch-page.ts",
  "src/research/ip-guard.ts",
  "src/research/pages.simule.ts",
  "src/research/recherche-web.simule.ts",
  "src/research/recherche-web.ts",
  "src/research/sources.ts",
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(js|jsx|ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name) ? [path] : [];
  });
}

describe("exception de server-only : liste fermée de 20 fichiers", () => {
  const WITHOUT = "export const x = 1;\n";

  it("la liste compte exactement 20 fichiers, tous présents dans le dépôt", () => {
    expect(EXEMPTED).toHaveLength(20);
    expect(new Set(EXEMPTED).size).toBe(20);
    const present = ["src/ai", "src/research", "src/grounding"].flatMap(sourceFiles);
    for (const filePath of EXEMPTED) expect(present, filePath).toContain(filePath);
  });

  it("aucun autre fichier de src/ai, src/research, src/grounding n'est exempté", async () => {
    const present = ["src/ai", "src/research", "src/grounding"].flatMap(sourceFiles);
    for (const filePath of present) {
      const config = await eslint.calculateConfigForFile(filePath);
      const exempted = config?.rules?.[SERVER_ONLY] === undefined;
      expect(exempted, filePath).toBe(EXEMPTED.includes(filePath));
    }
  });

  it.each(EXEMPTED)("%s, de la liste, n'est pas signalé", async (filePath) => {
    expect(await serverOnlyMessages(WITHOUT, filePath)).toHaveLength(0);
  });

  it.each([
    "src/ai/client2.ts",
    "src/ai/prompts/nouveau.ts",
    "src/ai/fournisseur/anthropic.ts",
    "src/research/nouveau.ts",
    "src/grounding/places.ts",
    "src/grounding/routes.ts",
  ])("un 21e fichier (%s) sans import \"server-only\" est refusé", async (filePath) => {
    const messages = await serverOnlyMessages(WITHOUT, filePath);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.severity).toBe(2);
  });
});
