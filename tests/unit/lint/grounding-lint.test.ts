// @vitest-environment node
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * `lint: src/grounding en liste blanche` (spécification B8, B8a point 6 ; handover § 3 ; décision 0085 § 1.10) et
 * `lint: src/server/relecture importé par la seule composition` (0085 § 1.8), sur la configuration réelle du projet.
 */
const eslint = new ESLint({ cwd: process.cwd() });
const LISTE_BLANCHE = "ligne/grounding-liste-blanche";
const RELECTURE = "ligne/relecture-imports";

async function signalements(code: string, filePath: string, regle = LISTE_BLANCHE) {
  const [result] = await eslint.lintText(code, { filePath });
  return result?.messages.filter((m) => m.ruleId === regle) ?? [];
}

const imp = (source: string) => `import { x } from "${source}";\nexport const y = x;\n`;

/** Chaque cas est joué sur un module et sur un `*.test.ts` du même dossier (« mêmes cas pour un *.test.ts »). */
const avecTest = (cas: [string, string][]): [string, string][] =>
  cas.flatMap(([fichier, source]) => [
    [fichier, source],
    [fichier.replace(/\.ts$/, ".test.ts"), source],
  ] as [string, string][]);

describe("lint: src/grounding en liste blanche", () => {
  it.each(
    avecTest([
      ["src/grounding/exemple.ts", "@/ai/client"],
      ["src/grounding/exemple.ts", "@/ai/erreurs"],
      ["src/grounding/exemple.ts", "@/research/agent"],
      ["src/grounding/exemple.ts", "@/domain/relectures"],
      ["src/grounding/exemple.ts", "@/domain/calculs"],
      ["src/grounding/exemple.ts", "../../db/schema"],
      ["src/grounding/exemple.ts", "@/prototype/brief"],
      ["src/grounding/exemple.ts", "@/prototype/ancrage"],
      ["src/grounding/exemple.ts", "@/server/env"],
      ["src/grounding/exemple.ts", "@/server/env/grounding"],
      ["src/grounding/exemple.ts", "@/server/usage/registre"],
      ["src/grounding/exemple.ts", "@/server/usage/forfait"],
      ["src/grounding/exemple.ts", "@/server/usage/port"],
      ["src/grounding/exemple.ts", "@/server/relecture/relectures"],
      ["src/grounding/exemple.ts", "drizzle-orm"],
      ["src/grounding/exemple.ts", "node:fs"],
      ["src/grounding/exemple.ts", "undici"],
      ["src/grounding/fiches.ts", "@/prototype/ancrage"],
    ]),
  )("%s : import de %s signalé", async (fichier, source) => {
    expect(await signalements(imp(source), fichier)).not.toHaveLength(0);
  });

  it.each(avecTest([["src/grounding/exemple.ts", "@/domain/relectures"], ["src/grounding/exemple.ts", "@/ai/client"]]))(
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

  it("source non littérale refusée", async () => {
    expect(await signalements("const s = 'zod';\nexport const y = () => import(s);\n", "src/grounding/exemple.ts")).not.toHaveLength(0);
  });

  it.each(
    avecTest([
      ["src/grounding/exemple.ts", "zod"],
      ["src/grounding/exemple.ts", "server-only"],
      ["src/grounding/exemple.ts", "@/contracts"],
      ["src/grounding/exemple.ts", "@/contracts/values"],
      ["src/grounding/exemple.ts", "@/grounding/interfaces"],
      ["src/grounding/exemple.ts", "./zone"],
      ["src/grounding/exemple.ts", "@/server/env/egress"],
    ]),
  )("%s : import de %s admis", async (fichier, source) => {
    expect(await signalements(imp(source), fichier)).toHaveLength(0);
  });

  it("modules de capacité : seuls places-client.ts et routes-client.ts importent la clé et le port ; leurs tests n'en héritent pas", async () => {
    for (const fichier of ["src/grounding/places-client.ts", "src/grounding/routes-client.ts"])
      for (const source of ["@/server/env/grounding", "@/server/usage/port"]) expect(await signalements(imp(source), fichier), `${fichier} ${source}`).toHaveLength(0);
    expect(await signalements(imp("@/server/env/grounding"), "src/grounding/places-client.test.ts")).not.toHaveLength(0);
    expect(await signalements(imp("@/server/usage/port"), "src/grounding/fiches.ts")).not.toHaveLength(0);
  });

  it("@/prototype/* : ancrage.ts et les modules de P0r3c (liste fermée) ; aucun autre module", async () => {
    for (const fichier of ["src/grounding/ancrage.ts", "src/grounding/ancrage-zone.ts", "src/grounding/fiches-finales.ts", "src/grounding/budget-routes.ts"])
      expect(await signalements(imp("@/prototype/ancrage"), fichier), fichier).toHaveLength(0);
    for (const fichier of ["src/grounding/zone.ts", "src/grounding/trajets.ts", "src/grounding/ancrage-production.ts", "src/grounding/nouveau.ts"])
      expect(await signalements(imp("@/prototype/ancrage"), fichier), fichier).not.toHaveLength(0);
  });

  it("tests : vitest et les modules nommés de tests/support seulement", async () => {
    expect(await signalements(imp("vitest"), "src/grounding/exemple.test.ts")).toHaveLength(0);
    for (const source of ["../../tests/support/doubles-grounding", "../../tests/support/horloge-manuelle", "../../tests/support/port-consommation-memoire"])
      expect(await signalements(imp(source), "src/grounding/exemple.test.ts"), source).toHaveLength(0);
    for (const source of ["../../tests/support/sentinelles-google", "../../tests/support/serveur-local"])
      expect(await signalements(imp(source), "src/grounding/exemple.test.ts"), source).not.toHaveLength(0);
    expect(await signalements(imp("vitest"), "src/grounding/exemple.ts")).not.toHaveLength(0);
  });

  it("module de production : de @/grounding/ancrage, les quatre noms permis seulement, par leur nom", async () => {
    const fichier = "src/grounding/exemple.ts";
    const permis = 'import { BLOC_MATRICE, cleTrajet, minutesDeTrajets, RAYON_BIAIS_METRES } from "@/grounding/ancrage";\nexport const y = [BLOC_MATRICE, cleTrajet, minutesDeTrajets, RAYON_BIAIS_METRES];\n';
    expect(await signalements(permis, fichier)).toHaveLength(0);
    for (const code of [
      'import { ancrerLogement } from "@/grounding/ancrage";\nexport const y = ancrerLogement;\n',
      'import { ficheOuNull } from "./ancrage";\nexport const y = ficheOuNull;\n',
      'import * as a from "@/grounding/ancrage";\nexport const y = a;\n',
      'export * from "@/grounding/ancrage";\n',
      'export { ancrageDeFiche } from "@/grounding/ancrage";\n',
      'export const y = () => import("@/grounding/ancrage");\n',
    ])
      expect(await signalements(code, fichier), code).not.toHaveLength(0);
    // Les modules de P0 et les tests ne sont pas soumis à la règle des quatre noms.
    expect(await signalements('import { ancrerLogement } from "@/grounding/ancrage";\nexport const y = ancrerLogement;\n', "src/grounding/ancrage-zone.ts")).toHaveLength(0);
    expect(await signalements('import { ficheOuNull } from "@/grounding/ancrage";\nexport const y = ficheOuNull;\n', "src/grounding/exemple.test.ts")).toHaveLength(0);
  });

  it("le dépôt est conforme : aucun fichier de src/grounding n'est signalé", async () => {
    const resultats = await eslint.lintFiles(["src/grounding/**/*.ts"]);
    const signales = resultats.flatMap((r) => r.messages.filter((m) => m.ruleId === LISTE_BLANCHE).map((m) => `${r.filePath}: ${m.message}`));
    expect(signales).toEqual([]);
  });
});

describe("lint: src/server/relecture importé par les deux compositions seulement (0085 § 1.8, 0100 § 5.2)", () => {
  it.each([
    "src/server/composition/p0-reel.ts",
    "src/server/composition/autre.ts",
    "src/server/composition/clients-google.ts",
    "src/server/composition/villes.ts",
    "src/server/actions/voyage.ts",
    "src/server/voyages/lecture.ts",
    "src/workflows/generation.ts",
    "src/adapters/api.ts",
    "src/adapters/index.ts",
    "src/app/page.tsx",
  ])("%s : import de @/server/relecture signalé", async (fichier) => {
    expect(await signalements(imp("@/server/relecture/relectures"), fichier, RELECTURE)).not.toHaveLength(0);
    expect(await signalements(imp("@/server/relecture/source"), fichier, RELECTURE)).not.toHaveLength(0);
    expect(await signalements('export * from "@/server/relecture/relectures";\n', fichier, RELECTURE)).not.toHaveLength(0);
  });

  it.each([
    "src/server/composition/generation.ts",
    "src/server/composition/lecture.ts",
    "src/server/relecture/source.ts",
    "src/server/relecture/relectures.test.ts",
    "tests/unit/exemple.test.ts",
  ])("%s : import admis", async (fichier) => {
    expect(await signalements(imp("@/server/relecture/relectures"), fichier, RELECTURE)).toHaveLength(0);
    expect(await signalements(imp("@/server/relecture/source"), fichier, RELECTURE)).toHaveLength(0);
  });
});

describe("lint: composition de la lecture (0100 § 5.2) : fabrique des clients Google et composition/lecture", () => {
  it.each([
    "src/server/composition/p0-reel.ts",
    "src/server/composition/autre.ts",
    "src/server/relecture/source.ts",
    "src/server/voyages/lecture.ts",
    "src/adapters/index.ts",
    "src/adapters/api.ts",
    "src/workflows/p0-run.ts",
    "src/app/page.tsx",
    // Décision 0141 § 11 ligne 3 : le cœur commun et l'action de api reçoivent la fabrique, ils ne l'importent pas.
    "src/server/villes/recherche.ts",
    "src/server/actions/villes.ts",
    "src/app/(creation)/voyages/nouveau/page.tsx",
  ])("%s : import de la fabrique commune des clients Google signalé", async (fichier) => {
    expect(await signalements(imp("@/server/composition/clients-google"), fichier, RELECTURE)).not.toHaveLength(0);
    expect(await signalements(imp("./clients-google"), "src/server/composition/autre.ts", RELECTURE)).not.toHaveLength(0);
  });

  it.each([
    "src/server/composition/lecture.ts",
    "src/server/composition/generation.ts",
    // Recherche de la ville de l'écran 1 du site d'essai (demande de Samuel du 23 octobre 2026).
    "src/server/composition/villes.ts",
    // Recherche de la ville de l'écran 1 de api (décision 0141 § 11 ligne 3, PR 885).
    "src/server/composition/villes-api.ts",
    "src/server/composition/clients-google.test.ts",
    "tests/unit/exemple.test.ts",
  ])(
    "%s : import de la fabrique commune des clients Google admis",
    async (fichier) => {
      expect(await signalements(imp("@/server/composition/clients-google"), fichier, RELECTURE)).toHaveLength(0);
    },
  );

  it.each([
    "src/server/composition/p0-reel.ts",
    "src/server/composition/generation.ts",
    "src/server/composition/clients-google.ts",
    "src/server/relecture/source.ts",
    "src/server/voyages/lecture.ts",
    "src/adapters/index.ts",
    "src/adapters/api.ts",
    "src/adapters/api-creation.ts",
    "src/app/page.tsx",
    "src/features/voyage/x.tsx",
  ])("%s : import de @/server/composition/lecture signalé", async (fichier) => {
    expect(await signalements(imp("@/server/composition/lecture"), fichier, RELECTURE)).not.toHaveLength(0);
    expect(await signalements('export * from "@/server/composition/lecture";\n', fichier, RELECTURE)).not.toHaveLength(0);
  });

  it.each(["src/instrumentation.ts", "tests/unit/server/composition-lecture.test.ts", "tests/unit/exemple.test.ts"])("%s : import de @/server/composition/lecture admis", async (fichier) => {
    expect(await signalements(imp("@/server/composition/lecture"), fichier, RELECTURE)).toHaveLength(0);
  });
});
