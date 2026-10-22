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
    // B8a (décision 0085 § 2, soumis au verdict de la Sécurité) : un masque fermé par méthode, `position` (`id,location`)
    // et `identifiant` (`id`) en plus ; la composition de P0 ne les appelle pas (`tests/unit/p0/b8a-isolement.test.ts`).
    expect(constante("MASQUE_POSITION")).toBe("id,location");
    expect(constante("MASQUE_IDENTIFIANT")).toBe("id");
    // Le client Places n'envoie aucun autre masque.
    expect([...source.matchAll(/masque: ([A-Za-z_]+)/g)].map((m) => m[1])).toEqual(["MASQUE_TEXT_SEARCH", "MASQUE_DETAILS", "MASQUE_POSITION", "MASQUE_IDENTIFIANT"]);
  });
});

describe("imports: table des temps de trajet nommée par deux modules seulement (décision 0092 § 5)", () => {
  /** Seuls modules hors de `db/` et `tests/db/` qui nomment la table : l'écriture et la lecture des programmes réels. */
  const ADMIS = ["src/adapters/prototype-ecriture.ts", "src/adapters/prototype-lecture.ts"];
  const nom = ["prototype", "trajets"].join(".");

  it("hors de db/ et de tests/db/ (et de la documentation), seuls prototype-ecriture.ts et prototype-lecture.ts nomment la table", () => {
    const nommant: string[] = [];
    for (const f of fichiers()) {
      if (!TEXTE.test(f) || f.endsWith(".md") || f === CE_FICHIER) continue;
      if (["db/", "tests/db/", "docs/", "specs/"].some((d) => f.startsWith(d))) continue;
      if ((lire(f) ?? "").includes(nom)) nommant.push(f);
    }
    expect(nommant.sort()).toEqual([...ADMIS].sort());
  });
});

describe("imports: store_prototype_coordinates nommée par un seul module (S6 de 0046, resserrée par 0052 § 1.10)", () => {
  const MODULE = "src/adapters/prototype-ecriture.ts";
  /** Seul importateur admis hors des tests : l'étape finale de `p0Run` (0052 § 1.10). */
  const IMPORTATEUR = "src/workflows/p0-run.ts";

  const nom = ["store", "prototype", "coordinates"].join("_");
  // Décision 0057 (§ 4, R8 ; « Tests imposés ») : le relevé `db-releve` trouve chaque surcharge de la fonction par son
  // nom dans `pg_proc` (jamais par une signature écrite), et son test recopie les cas figés du § 5.5. Lecture du
  // catalogue seulement : ni appel ni import de la fonction. Admission : décision 0057, § 4 (R8).
  const RELEVE = [".github/workflows/db-releve.yml", "tests/unit/ci/db-releve.test.ts"];
  // Décision 0056 (§ 4.6 point 1 ; ticket 363) : la coupure `db-reverrouillage` contrôle chaque surcharge trouvée par
  // son nom dans `pg_proc` ; son test recopie le texte figé. Ni appel ni import. Admission : décision 0066 (bornes : § 2).
  const REVERROUILLAGE = [".github/workflows/db-reverrouillage.yml", "tests/unit/ci/db-reverrouillage.test.ts"];
  /** Nombre exact de mentions du nom dans le test statique de `db-reverrouillage` (0066 § 2 point 4). */
  const MENTIONS_TEST_REVERROUILLAGE = 1;
  const IMPORTS_TEST_REVERROUILLAGE = new Set(["node:crypto", "node:fs", "node:path", "node:url", "vitest", "../../support/workflows"]);
  const compte = (texte: string, motif: string) => texte.split(motif).length - 1;

  /**
   * Contrôle S6 en fonction pure (0066 § 2) : `contenus` associe chaque fichier du périmètre (hors de `db/`,
   * `tests/db/`, `docs/`, `specs/`, du Markdown et de ce fichier) à son texte ; rend la liste des écarts.
   */
  function ecartsS6(contenus: ReadonlyMap<string, string>): string[] {
    const e: string[] = [];
    const nommant = [...contenus].filter(([, texte]) => texte.includes(nom)).map(([f]) => f);
    const hors = nommant.filter((f) => f !== MODULE && !RELEVE.includes(f) && !REVERROUILLAGE.includes(f));
    for (const f of hors) e.push(`fichier hors de la liste admise : ${f}`);
    if (!nommant.includes(MODULE)) e.push("module appelant absent");
    const appel = new RegExp(`${nom}\\s*\\(`);
    // db-releve.yml (0057) : une seule mention, jamais suivie de `(`.
    const releve = contenus.get(RELEVE[0]!) ?? "";
    if (compte(releve, nom) !== 1 || appel.test(releve)) e.push("db-releve.yml : mention hors borne");
    // db-reverrouillage.yml (0066 § 2 points 1 à 3).
    const yaml = contenus.get(REVERROUILLAGE[0]!) ?? "";
    if (compte(yaml, nom) !== 2) e.push("db-reverrouillage.yml : nombre de mentions");
    if (compte(yaml, `p.proname = '${nom}'`) !== 2) e.push("db-reverrouillage.yml : mention hors de p.proname");
    if (appel.test(yaml) || /regproc/i.test(yaml)) e.push("db-reverrouillage.yml : signature ou appel");
    if (/\bGRANT\s/i.test(yaml)) e.push("db-reverrouillage.yml : GRANT");
    // Test statique (0066 § 2 points 4 et 5).
    const test = contenus.get(REVERROUILLAGE[1]!) ?? "";
    if (compte(test, nom) !== MENTIONS_TEST_REVERROUILLAGE) e.push("db-reverrouillage.test.ts : nombre de mentions");
    const imports = [...test.matchAll(/(?:^import\s(?:[^;]*?\sfrom\s)?|\bimport\(|\brequire\()\s*["']([^"']+)["']/gm)].map((m) => m[1]!);
    if (imports.length === 0 || imports.some((i) => !IMPORTS_TEST_REVERROUILLAGE.has(i))) e.push("db-reverrouillage.test.ts : import hors liste");
    return e;
  }

  function perimetre(): Map<string, string> {
    const contenus = new Map<string, string>();
    for (const f of fichiers()) {
      if (!TEXTE.test(f) || f.endsWith(".md") || f === CE_FICHIER) continue;
      if (["db/", "tests/db/", "docs/", "specs/"].some((d) => f.startsWith(d))) continue;
      const texte = lire(f);
      if (texte !== null) contenus.set(f, texte);
    }
    return contenus;
  }

  it("hors de db/ et de tests/db/, seul src/adapters/prototype-ecriture.ts nomme la fonction (exceptions de 0057 et 0066, bornées)", () => {
    expect(ecartsS6(perimetre())).toEqual([]);
  });

  it("contrôle S6 : cas négatifs de la décision 0066 § 2", () => {
    const depot = perimetre();
    const [wf, test] = REVERROUILLAGE as [string, string];
    const avec = (fichier: string, avant: string, apres: string) => {
      const texte = depot.get(fichier) ?? "";
      expect(compte(texte, avant), avant).toBe(1);
      return new Map(depot).set(fichier, texte.replace(avant, () => apres));
    };
    const message = "'aucune surcharge de la fonction d''écriture des positions'";
    const cas: [string, Map<string, string>, string][] = [
      ["troisième mention dans un commentaire", avec(wf, "# Fichier sous .github/workflows/", `# ${nom}\n# Fichier sous .github/workflows/`), "nombre de mentions"],
      [
        "mention hors de p.proname à compte égal",
        new Map(depot).set(wf, (depot.get(wf) ?? "").replace(`p.proname = '${nom}') THEN`, () => "p.proname LIKE 'store_prototype%') THEN").replace(message, () => `'aucune surcharge de ${nom}'`)),
        "mention hors de p.proname",
      ],
      ["regprocedure dans le workflow", avec(wf, "# Fichier sous .github/workflows/", `# SELECT 'public.${nom}(uuid, text, double precision, double precision)'::pg_catalog.regprocedure\n# Fichier sous .github/workflows/`), "signature ou appel"],
      ["GRANT dans le workflow", avec(wf, "# Fichier sous .github/workflows/", "# GRANT EXECUTE au prototype\n# Fichier sous .github/workflows/"), "GRANT"],
      ["mention de plus dans le test statique", avec(test, "// @vitest-environment node\n", `// @vitest-environment node\n// ${nom}\n`), "db-reverrouillage.test.ts : nombre de mentions"],
      ["import de pg dans le test statique", avec(test, 'import { describe, expect, it } from "vitest";\n', 'import { describe, expect, it } from "vitest";\nimport pg from "pg";\n'), "import hors liste"],
      ["nom dans tests/support/workflows.ts", new Map(depot).set("tests/support/workflows.ts", `${depot.get("tests/support/workflows.ts") ?? ""}\n// ${nom}\n`), "fichier hors de la liste admise : tests/support/workflows.ts"],
    ];
    for (const [libelle, contenus, attendu] of cas) {
      expect(contenus, libelle).not.toEqual(depot);
      expect(ecartsS6(contenus).join(" | "), libelle).toContain(attendu);
    }
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
  // Seule exception nominative : l'adaptateur de la table de travail (P0r3c-4, décision 0063 point 9), importé par
  // `src/workflows/p0-run.ts` et, pour la seule suppression des candidats dans la transaction du programme,
  // `src/adapters/prototype-ecriture.ts` (constat A de 0103 ; admission : décision 0107) ; aucun rapport ni script ne la lit.
  const ADAPTATEUR_TRAVAIL = "src/adapters/prototype-travail.ts";
  /** Importeurs admis hors des tests (0063 point 9 ; 0107 : `prototype-ecriture.ts`, constat A de 0103). */
  const IMPORTEURS_TRAVAIL = ["src/adapters/prototype-ecriture.ts", "src/workflows/p0-run.ts"];

  /**
   * Vrai si `fichier` nomme l'adaptateur par un spécificateur de module (import statique ou dynamique,
   * `export … from`, `vi.mock`, `require`), quelle qu'en soit la forme : `@/adapters/prototype-travail` ou relatif
   * (`./`, `../`), extension `.ts` facultative. Le spécificateur relatif est résolu depuis le dossier du fichier.
   */
  function nommeAdaptateurTravail(fichier: string, texte: string): boolean {
    const cible = ADAPTATEUR_TRAVAIL.replace(/\.ts$/, "");
    for (const m of texte.matchAll(/["'`]((?:@\/|\.\.?\/)[^"'`$\s]*prototype-travail(?:\.ts)?)["'`]/g)) {
      const spec = m[1]!.replace(/\.ts$/, "");
      const resolu = spec.startsWith("@/") ? `src/${spec.slice(2)}` : path.posix.normalize(path.posix.join(path.posix.dirname(fichier), spec));
      if (resolu === cible) return true;
    }
    return false;
  }

  const estTest = (f: string) => f.startsWith("tests/") || /\.test\.tsx?$/.test(f);

  it("aucun module de scripts/ ni de src/ ne nomme la table de travail, hors son adaptateur", () => {
    const hors = fichiers().filter((f) => /^(scripts|src)\//.test(f) && TEXTE.test(f) && f !== ADAPTATEUR_TRAVAIL && (lire(f) ?? "").includes("run_candidates"));
    expect(hors).toEqual([]);
  });

  // Décision 0094 § 11 et verdict de la Sécurité 0103 (question 1, condition 8 ; question 3, condition 1) : la table du
  // plan de secteurs suit la même garde, avec le même module nommé ; aucun rapport, script ni autre module ne la nomme.
  it("p0: run_secteurs lue par aucun rapport : aucun module de scripts/ ni de src/ ne nomme la table du plan, hors son adaptateur", () => {
    const hors = fichiers().filter((f) => /^(scripts|src)\//.test(f) && TEXTE.test(f) && f !== ADAPTATEUR_TRAVAIL && (lire(f) ?? "").includes("run_secteurs"));
    expect(hors).toEqual([]);
    // L'adaptateur, lui, la nomme (contrôle de la garde : elle porte sur le bon nom de table).
    expect(lire(ADAPTATEUR_TRAVAIL) ?? "").toContain("prototype.run_secteurs");
    for (const rapport of ["src/server/p0/rapport.ts", "scripts/p0/rapport.ts"]) expect(lire(rapport) ?? "", rapport).not.toMatch(/run_secteurs|run_candidates/);
  });

  it("l'adaptateur de la table de travail n'est importé que par p0Run et l'écriture du programme (0107), hors tests", () => {
    const importeurs = fichiers().filter(
      (f) => /^(scripts|src)\//.test(f) && TEXTE.test(f) && f !== ADAPTATEUR_TRAVAIL && !estTest(f) && nommeAdaptateurTravail(f, lire(f) ?? ""),
    );
    expect(importeurs.sort()).toEqual(IMPORTEURS_TRAVAIL);
  });

  it("contrôle du motif : toute forme de spécificateur est reconnue, le contrat ne l'est pas", () => {
    // Positifs : alias, relatif depuis le dossier, relatif remontant, extension, `vi.mock`, import dynamique (guillemets ou obliques), `export … from`, `require`.
    expect(nommeAdaptateurTravail("src/workflows/p0-run.ts", 'import { lireCandidats } from "@/adapters/prototype-travail";')).toBe(true);
    expect(nommeAdaptateurTravail("src/adapters/prototype-ecriture.ts", 'import { supprimerCandidatsDansTransaction } from "./prototype-travail";')).toBe(true);
    expect(nommeAdaptateurTravail("src/adapters/x.ts", "import { y } from './prototype-travail.ts';")).toBe(true);
    expect(nommeAdaptateurTravail("src/server/p0/x.ts", 'export * from "../../adapters/prototype-travail";')).toBe(true);
    expect(nommeAdaptateurTravail("scripts/p0/x.ts", 'await import("../../src/adapters/prototype-travail");')).toBe(true);
    expect(nommeAdaptateurTravail("src/app/x.ts", 'vi.mock("@/adapters/prototype-travail.ts", () => ({}));')).toBe(true);
    expect(nommeAdaptateurTravail("src/server/x.ts", "await import(`@/adapters/prototype-travail`);")).toBe(true);
    expect(nommeAdaptateurTravail("src/workflows/x.ts", 'const t = require("../adapters/prototype-travail");')).toBe(true);
    // Négatifs : le contrat (alias ou relatif), un autre module, une mention hors spécificateur.
    expect(nommeAdaptateurTravail("src/adapters/x.ts", 'import type { LigneCandidat } from "@/contracts/prototype-travail";')).toBe(false);
    expect(nommeAdaptateurTravail("src/contracts/x.ts", 'import type { PhaseTravail } from "./prototype-travail";')).toBe(false);
    expect(nommeAdaptateurTravail("src/adapters/x.ts", 'import { z } from "./prototype-travail-bis";')).toBe(false);
    expect(nommeAdaptateurTravail("src/adapters/x.ts", "// voir src/adapters/prototype-travail.ts")).toBe(false);
    // Les tests sont exclus de la garde, pas les modules dont le nom contient « test ».
    expect(estTest("src/adapters/prototype-ecriture.test.ts")).toBe(true);
    expect(estTest("tests/unit/workflows/p0-run.test.ts")).toBe(true);
    expect(estTest("src/adapters/prototype-ecriture.ts")).toBe(false);
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
    // Ticket 691 (spécification E2E-essai, lot 1) : copie des positions fictives du programme de test ci-dessus.
    "prototype/programmes-essai/proto_essai_20271010_1.json",
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
