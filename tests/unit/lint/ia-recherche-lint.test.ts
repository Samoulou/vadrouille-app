// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `lint: src/ai et src/research en liste blanche` (spécification B7a point 5 ; handover § 3, tableaux « Liste
 * blanche » et « Liste noire ») et règle d'import de `@/ai/complement-p0` (décision 0077 § 1 point 5), sur la
 * configuration réelle du projet. Le test d'imports de P0 (`tests/unit/p0/imports.test.ts`) reste en place à côté.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const LISTE_BLANCHE = "ligne/ia-recherche-liste-blanche";
const COMPLEMENT = "ligne/complement-p0-imports";

async function signalements(
  code: string,
  filePath: string,
  regle = LISTE_BLANCHE,
) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === regle) ?? [];
}

const imp = (source: string) =>
  `import { x } from "${source}";\nexport const y = x;\n`;

/** Chaque cas est joué sur un module et sur un `*.test.ts` du même dossier (« mêmes cas pour un *.test.ts »). */
const avecTest = (cas: [string, string][]): [string, string][] =>
  cas.flatMap(
    ([fichier, source]) =>
      [
        [fichier, source],
        [fichier.replace(/\.ts$/, ".test.ts"), source],
      ] as [string, string][],
  );

describe("lint: src/ai et src/research en liste blanche", () => {
  const REFUSES = avecTest([
    // src/ai
    ["src/ai/exemple.ts", "@/grounding/ancrage"],
    ["src/ai/exemple.ts", "@/grounding/interfaces"],
    ["src/ai/exemple.ts", "../../db/schema"],
    ["src/ai/exemple.ts", "@/prototype/brief"],
    ["src/ai/exemple.ts", "@/prototype/config"],
    ["src/ai/exemple.ts", "@/server/env"],
    ["src/ai/exemple.ts", "@/server/env/grounding"],
    ["src/ai/exemple.ts", "@/server/usage/registre"],
    ["src/ai/exemple.ts", "@/server/usage/journal-postgres"],
    ["src/ai/exemple.ts", "drizzle-orm"],
    ["src/ai/exemple.ts", "@/research/agent"],
    ["src/ai/exemple.ts", "@/server/env/egress"],
    ["src/ai/exemple.ts", "ai"],
    ["src/ai/exemple.ts", "undici"],
    ["src/ai/exemple.ts", "node:dns/promises"],
    ["src/ai/exemple.ts", "node:net"],
    ["src/ai/prompts/exemple.ts", "../../prototype/brief"],
    // src/research
    ["src/research/exemple.ts", "@/grounding/ancrage"],
    ["src/research/exemple.ts", "../../db/schema"],
    ["src/research/exemple.ts", "@/prototype/candidat"],
    ["src/research/exemple.ts", "@/server/usage"],
    ["src/research/exemple.ts", "@/server/usage/port"],
    ["src/research/exemple.ts", "ai"],
    ["src/research/exemple.ts", "undici"],
    ["src/research/exemple.ts", "node:dns/promises"],
    ["src/research/exemple.ts", "node:net"],
    ["src/research/exemple.ts", "@/server/env/egress"],
    ["src/research/exemple.ts", "@/server/env/ai"],
    ["src/research/exemple.ts", "drizzle-orm"],
    ["src/research/fetch-page.ts", "undici"],
    ["src/research/ip-guard.ts", "undici"],
    ["src/research/undici-transport.ts", "node:net"],
  ]);
  it.each(REFUSES)("%s : import de %s signalé", async (fichier, source) => {
    expect(await signalements(imp(source), fichier)).not.toHaveLength(0);
  });

  it.each(
    avecTest([
      ["src/ai/exemple.ts", "@/grounding/ancrage"],
      ["src/research/exemple.ts", "@/prototype/brief"],
    ]),
  )(
    "%s : toutes les formes de chargement de %s sont signalées",
    async (fichier, source) => {
      for (const code of [
        `import type { X } from "${source}";\nexport type Y = X;\n`,
        `export { x } from "${source}";\n`,
        `export * from "${source}";\n`,
        `export const y = () => import("${source}");\n`,
        `export const y = require("${source}");\n`,
        `export type Y = import("${source}").X;\n`,
      ])
        expect(await signalements(code, fichier), code).not.toHaveLength(0);
    },
  );

  const ADMIS = avecTest([
    ["src/ai/exemple.ts", "zod"],
    ["src/ai/exemple.ts", "server-only"],
    ["src/ai/exemple.ts", "@/contracts"],
    ["src/ai/exemple.ts", "@/contracts/values"],
    ["src/ai/exemple.ts", "@/ai/client"],
    ["src/ai/exemple.ts", "@/ai/prompts/plan"],
    ["src/ai/prompts/exemple.ts", "../client"],
    ["src/ai/exemple.ts", "@/server/env/ai"],
    ["src/ai/exemple.ts", "@/server/usage/port"],
    ["src/research/exemple.ts", "@/ai/candidat"],
    ["src/research/exemple.ts", "@/research/fetch-page"],
    ["src/research/exemple.ts", "./fetch-page"],
    ["src/research/exemple.ts", "@/contracts"],
    ["src/research/exemple.ts", "zod"],
  ]).concat([
    // Modules de capacité (sans leur test, qui n'hérite pas de leurs capacités).
    ["src/research/ip-guard.ts", "node:net"],
    ["src/research/extract-text.ts", "parse5"],
  ]);
  it.each(ADMIS)("%s : import de %s admis", async (fichier, source) => {
    expect(await signalements(imp(source), fichier)).toHaveLength(0);
  });

  it("modules de capacité : seuls les fichiers nommés importent le transport et la barrière ; le SDK de modèles nulle part ailleurs", async () => {
    // Le module de capacité du client de modèles (seul admis pour le SDK et la barrière sous src/ai) est couvert par le
    // cas « le dépôt est conforme » ci-dessous : il importe les trois et n'est pas signalé.
    for (const source of ["ai", "@/server/env/egress"])
      expect(
        await signalements(imp(source), "src/ai/autre.ts"),
        source,
      ).not.toHaveLength(0);
    for (const source of [
      "undici",
      "node:dns/promises",
      "@/server/env/egress",
    ]) {
      expect(
        await signalements(imp(source), "src/research/undici-transport.ts"),
        source,
      ).toHaveLength(0);
      expect(
        await signalements(imp(source), "src/research/autre.ts"),
        source,
      ).not.toHaveLength(0);
    }
    // Le test d'un module de capacité n'hérite pas de ses capacités.
    expect(
      await signalements(
        imp("undici"),
        "src/research/undici-transport.test.ts",
      ),
    ).not.toHaveLength(0);
  });

  it("un fichier qui n'importe que la liste blanche passe (module et test)", async () => {
    const code = [
      'import "server-only";',
      'import { z } from "zod";',
      'import type { Category } from "@/contracts";',
      'import type { ClientModeles } from "@/ai/client";',
      "export const S = z.string();",
      "export type T = { c: Category; m: ClientModeles };",
      "",
    ].join("\n");
    expect(await signalements(code, "src/ai/exemple.ts")).toHaveLength(0);
    expect(await signalements(code, "src/research/exemple.ts")).toHaveLength(0);
    const test = `${code}import { it } from "vitest";\nimport { journalDePrompts } from "../../tests/support/journal-prompts";\nit("x", () => void journalDePrompts);\n`;
    expect(await signalements(test, "src/ai/exemple.test.ts")).toHaveLength(0);
    expect(
      await signalements(test, "src/research/exemple.test.ts"),
    ).toHaveLength(0);
  });

  it("tests : vitest et les modules nommés de tests/support seulement ; vitest refusé hors des tests", async () => {
    expect(
      await signalements(imp("vitest"), "src/ai/exemple.ts"),
    ).not.toHaveLength(0);
    expect(
      await signalements(
        imp("../../tests/support/horloge-manuelle"),
        "src/ai/exemple.test.ts",
      ),
    ).toHaveLength(0);
    expect(
      await signalements(
        imp("../../tests/support/sentinelles-google"),
        "src/research/exemple.test.ts",
      ),
    ).toHaveLength(0);
    expect(
      await signalements(
        imp("../../tests/support/cas-production-commune"),
        "src/ai/exemple.test.ts",
      ),
    ).not.toHaveLength(0);
    expect(
      await signalements(
        imp("../../tests/unit/p0/harnais"),
        "src/ai/exemple.test.ts",
      ),
    ).not.toHaveLength(0);
    expect(
      await signalements(imp("node:fs"), "src/ai/exemple.test.ts"),
    ).not.toHaveLength(0);
  });

  it("hors de src/ai et src/research, la règle ne s'applique pas", async () => {
    expect(
      await signalements(imp("@/prototype/brief"), "src/server/p0/exemple.ts"),
    ).toHaveLength(0);
    expect(
      await signalements(imp("drizzle-orm"), "src/server/exemple.ts"),
    ).toHaveLength(0);
  });

  it("le dépôt est conforme : aucun fichier de src/ai ni de src/research n'est signalé", async () => {
    const resultats = await eslint.lintFiles([
      "src/ai/**/*.ts",
      "src/research/**/*.ts",
    ]);
    const signales = resultats.flatMap((r) =>
      r.messages
        .filter((m) => m.ruleId === LISTE_BLANCHE || m.ruleId === COMPLEMENT)
        .map((m) => `${r.filePath}: ${m.message}`),
    );
    expect(signales).toEqual([]);
    expect(resultats.length).toBeGreaterThan(20);
  });
});

describe("lint: @/ai/complement-p0 confiné aux appels directs de P0 (décision 0077 § 1 point 5)", () => {
  const code =
    'import type { ComplementP0 } from "@/ai/complement-p0";\nexport type X = ComplementP0;\n';
  it.each([
    "src/ai/requetes.ts",
    "src/server/p0/vers-couche-ia.ts",
    "src/server/p0/autre.ts",
    "scripts/p0/pipeline.ts",
    "src/workflows/p0-run.ts",
    "src/server/composition/p0-reel.ts",
    "tests/unit/p0/exemple.test.ts",
    "tests/support/exemple.ts",
    "src/ai/exemple.test.ts",
  ])("%s : admis", async (fichier) => {
    expect(await signalements(code, fichier, COMPLEMENT)).toHaveLength(0);
  });

  it.each([
    "src/ai/couche.ts",
    "src/ai/noter-candidats.ts",
    "src/ai/entrees.ts",
    "src/research/agent.ts",
    "src/workflows/autre.ts",
    "src/server/composition/autre.ts",
    "src/server/actions/exemple.ts",
    "src/features/exemple.ts",
    "scripts/autre.ts",
  ])("%s : signalé", async (fichier) => {
    expect(await signalements(code, fichier, COMPLEMENT)).not.toHaveLength(0);
  });

  it("chemin relatif, import() et require() : même règle", async () => {
    expect(
      await signalements(
        'export const x = () => import("../ai/complement-p0");\n',
        "src/research/x.ts",
        COMPLEMENT,
      ),
    ).not.toHaveLength(0);
    expect(
      await signalements(
        'export const x = require("./complement-p0");\n',
        "src/ai/couche.ts",
        COMPLEMENT,
      ),
    ).not.toHaveLength(0);
    expect(
      await signalements(
        'import type { ComplementP0 } from "./complement-p0";\nexport type X = ComplementP0;\n',
        "src/ai/requetes.ts",
        COMPLEMENT,
      ),
    ).toHaveLength(0);
  });
});
