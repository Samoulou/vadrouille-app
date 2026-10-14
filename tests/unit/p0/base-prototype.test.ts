// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Gardes statiques de la base du prototype (décision 0046 ; P0r2) : masques de l'ancrage, portée de
 * `store_prototype_coordinates` (S6), table de travail lue par aucun rapport, coordonnées confinées à
 * `place_coordinates`, et garde du dépôt (identifiants de lieu Google, coordonnées, URL de base Neon).
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const CE_FICHIER = "tests/unit/p0/base-prototype.test.ts";

/** Fichiers suivis et nouveaux non ignorés (le test agit avant le commit). */
function fichiers(): string[] {
  return execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { cwd: RACINE, encoding: "utf8" })
    .split("\0")
    .filter((f) => f.length > 0);
}

function lire(fichier: string): string | null {
  try {
    return readFileSync(path.join(RACINE, fichier), "utf8");
  } catch {
    return null; // supprimé du dossier de travail
  }
}

const TEXTE = /\.(ts|tsx|mts|mjs|cjs|js|json|sql|ya?ml|sh|md|css|html|txt)$/;

describe("ancrage: masques de champs exacts", () => {
  it("Text Search « IDs only » et Place Details : égalité de chaîne avec 0046 D15 point 8", () => {
    // Lu dans la source : seuls les tests nommés par `tests/unit/p0/clients-reels.test.ts` importent le client réel.
    const source = lire("src/grounding/places-client.ts") ?? "";
    const constante = (nom: string) => new RegExp(`^export const ${nom} = "([^"]*)";$`, "m").exec(source)?.[1];
    expect(constante("MASQUE_TEXT_SEARCH")).toBe("places.id");
    expect(constante("MASQUE_DETAILS")).toBe("id,businessStatus,location,regularOpeningHours");
    // Le client Places n'envoie aucun autre masque.
    expect([...source.matchAll(/masque: ([A-Za-z_]+)/g)].map((m) => m[1])).toEqual(["MASQUE_TEXT_SEARCH", "MASQUE_DETAILS"]);
  });
});

describe("imports: store_prototype_coordinates nommée par un seul module (S6 de 0046, resserrée par 0052 § 1.10)", () => {
  const MODULE = "src/adapters/prototype-ecriture.ts";
  /** Seul importateur admis hors des tests : l'étape finale de `p0Run` (0052 § 1.10). */
  const IMPORTATEUR = "src/workflows/p0-run.ts";

  it("hors de db/ et de tests/db/, seul src/adapters/prototype-ecriture.ts nomme la fonction", () => {
    const nom = ["store", "prototype", "coordinates"].join("_");
    const hors = fichiers().filter(
      (f) =>
        TEXTE.test(f) &&
        !f.endsWith(".md") &&
        !f.startsWith("db/") &&
        !f.startsWith("tests/db/") &&
        !f.startsWith("docs/") &&
        !f.startsWith("specs/") &&
        f !== CE_FICHIER &&
        (lire(f) ?? "").includes(nom),
    );
    expect(hors).toEqual([MODULE]);
  });

  it("le module n'est importé que par src/workflows/p0-run.ts et les tests ; ni src/adapters/index.ts, ni src/server", () => {
    // Toute mention du chemin du module (import statique, dynamique, `export … from`, `vi.mock`) compte.
    const chemin = /["'](?:@\/adapters\/prototype-ecriture|(?:\.\.?\/)+(?:[\w-]+\/)*prototype-ecriture)(?:\.ts)?["']/;
    const importateurs = fichiers().filter((f) => /\.(ts|tsx|mts|mjs|cjs|js)$/.test(f) && f !== MODULE && chemin.test(lire(f) ?? ""));
    const horsTests = importateurs.filter((f) => !f.startsWith("tests/") && !/\.test\.tsx?$/.test(f));
    expect(horsTests.filter((f) => f !== IMPORTATEUR)).toEqual([]);
    // Contrôle du motif lui-même.
    expect(chemin.test('import { ecrireProgramme } from "@/adapters/prototype-ecriture";')).toBe(true);
    expect(chemin.test('export * from "./prototype-ecriture";')).toBe(true);
    expect(chemin.test('import type { X } from "@/contracts/prototype-ecriture";')).toBe(false);
  });

  it("le module commence par import \"server-only\" et le contrat n'est pas réexporté par src/contracts/index.ts", () => {
    expect((lire(MODULE) ?? "").startsWith('import "server-only";\n')).toBe(true);
    expect(lire("src/contracts/index.ts") ?? "").not.toContain("prototype-ecriture");
    expect(lire("src/adapters/index.ts") ?? "").not.toContain("prototype-ecriture");
  });
});

describe("p0: run_candidates lue par aucun rapport", () => {
  it("aucun module de scripts/ ni de src/ ne nomme la table de travail", () => {
    const hors = fichiers().filter((f) => /^(scripts|src)\//.test(f) && TEXTE.test(f) && (lire(f) ?? "").includes("run_candidates"));
    expect(hors).toEqual([]);
  });
});

describe("p0: aucune coordonnée hors de place_coordinates", () => {
  it("seule la migration de place_coordinates crée des colonnes lat et lng", () => {
    const migrations = fichiers().filter((f) => /^db\/migrations\/.+\.sql$/.test(f));
    const avecCoordonnees = migrations.filter((f) => /\b(lat|lng|latitude|longitude)\s+(double|numeric|real|float)/i.test(lire(f) ?? ""));
    expect(avecCoordonnees).toEqual(["db/migrations/0002_place_coordinates.sql"]);
    const schema = lire("db/schema.ts") ?? "";
    expect(schema).not.toMatch(/\b(lat|lng|latitude|longitude)\b/);
  });
});

describe("ci: garde du dépôt (identifiants de lieu Google, coordonnées, URL de base Neon)", () => {
  // Motifs construits à l'exécution : ce fichier ne contient pas lui-même les formes qu'il refuse.
  const PLACE_ID = new RegExp(`\\b(${["Ch", "IJ"].join("")}|${["Gh", "IJ"].join("")})[A-Za-z0-9_-]{20,}`);
  const NEON = new RegExp(["neon", "tech"].join("\\."), "i");
  const COORDONNEE = /"?(lat|latitude)"?\s*:\s*-?\d{1,2}\.\d{4,}/;
  /** Coordonnées fictives ou simulées, relevées le 2026-10-14 (P0r2) : toute autre occurrence fait échouer. */
  const COORDONNEES_ADMISES = [
    "prototype/fixtures/places/edimbourg.json",
    "prototype/programmes-test/proto_test_20261012_1.json",
    "src/components/carte/AreaMap.test.tsx",
    "src/components/carte/simulated-model.test.ts",
    "src/grounding/places-client.test.ts",
    "src/mocks/creation-edimbourg.ts",
    "src/prototype/programme-reduit.test.ts",
    "tests/unit/p0/copies.test.ts",
  ];

  it("aucun identifiant de lieu Google réel ni URL de base Neon dans un fichier du dépôt", () => {
    const trouves = fichiers().filter((f) => TEXTE.test(f) && f !== CE_FICHIER && (PLACE_ID.test(lire(f) ?? "") || NEON.test(lire(f) ?? "")));
    expect(trouves).toEqual([]);
  });

  it("aucune coordonnée hors des fichiers fictifs relevés", () => {
    const trouves = fichiers().filter((f) => TEXTE.test(f) && !f.endsWith(".md") && f !== CE_FICHIER && COORDONNEE.test(lire(f) ?? ""));
    expect(trouves.filter((f) => !COORDONNEES_ADMISES.includes(f))).toEqual([]);
  });

  it("les motifs reconnaissent bien les formes refusées (contrôle du test lui-même)", () => {
    expect(PLACE_ID.test(`${["Ch", "IJ"].join("")}N1t_tDeuEmsRUsoyG83frY4`)).toBe(true);
    expect(PLACE_ID.test("SENTINELLE_PLACE_ID_001")).toBe(false);
    expect(NEON.test(`ep-x.eu-central-1.aws.${["neon", "tech"].join(".")}`)).toBe(true);
    expect(COORDONNEE.test('"lat": 55.9533123')).toBe(true);
  });
});
