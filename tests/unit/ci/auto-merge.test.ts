// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Test statique de `.github/workflows/auto-merge.yml` (décision 0055, D23, section 5 point 2) : la fusion
 * automatique n'est activée que pour une PR de base `main` ; seul déclencheur `pull_request` avec
 * `types: [labeled]` ; aucun autre workflow n'active de fusion. Lecture du texte, sans analyseur YAML, sur le
 * modèle de `tests/unit/ci/p0-purge.test.ts`.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const WORKFLOW = readFileSync(path.join(DOSSIER, "auto-merge.yml"), "utf8");

/** Condition exacte du job (D23), espaces normalisés. */
const CONDITION_ATTENDUE =
  "github.event.pull_request.base.ref == 'main' && (github.event.label.name == 'needs-review' || github.event.label.name == 'docs-only')";

/** Motifs d'activation d'une fusion interdits hors de `auto-merge.yml`. */
const MOTIFS_FUSION = ["pr merge", "--auto", "enablePullRequestAutoMerge"];

const normaliser = (texte: string): string => texte.replace(/\s+/g, " ").trim();

/** Lignes utiles : sans commentaire ni ligne vide. */
function lignesUtiles(texte: string): string[] {
  return texte
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"));
}

/** Bloc d'une clé de premier niveau (lignes indentées qui la suivent). */
function bloc(lignes: string[], cle: string): string[] {
  const debut = lignes.findIndex((l) => l.startsWith(`${cle}:`));
  if (debut < 0) return [];
  const fin = lignes.findIndex((l, i) => i > debut && /^\S/.test(l));
  return lignes.slice(debut, fin < 0 ? undefined : fin);
}

/** Écarts du texte d'`auto-merge.yml` à D23 ; tableau vide si le fichier est conforme. */
function ecartsAutoMerge(texte: string): string[] {
  const ecarts: string[] = [];
  const lignes = lignesUtiles(texte);

  const on = bloc(lignes, "on").map((l) => l.trim());
  if (
    JSON.stringify(on) !==
    JSON.stringify(["on:", "pull_request:", "types: [labeled]"])
  ) {
    ecarts.push(`déclencheurs : ${JSON.stringify(on)}`);
  }
  if (
    /pull_request_target|workflow_run|^\s*push:|workflow_dispatch|schedule:/m.test(
      lignes.join("\n"),
    )
  ) {
    ecarts.push("déclencheur interdit présent");
  }

  const conditions = lignes.filter((l) => /^\s*(-\s+)?if:/.test(l));
  if (conditions.length !== 1) {
    ecarts.push(`nombre de conditions if: ${conditions.length}`);
  } else {
    const condition = normaliser((conditions[0] ?? "").replace(/^\s*if:/, ""));
    if (condition !== CONDITION_ATTENDUE)
      ecarts.push(`condition : ${condition}`);
  }

  const commandes = lignes
    .filter((l) => /\bgh pr merge\b/.test(l))
    .map((l) => l.trim());
  if (
    JSON.stringify(commandes) !==
    JSON.stringify(['- run: gh pr merge --auto --squash "$PR" --repo "$REPO"'])
  ) {
    ecarts.push(`commande : ${JSON.stringify(commandes)}`);
  }
  return ecarts;
}

describe("ci: auto-merge.yml selon 0055 D23", () => {
  it("le fichier du dépôt est conforme", () => {
    expect(ecartsAutoMerge(WORKFLOW)).toEqual([]);
  });

  it("permissions inchangées, un seul job", () => {
    const lignes = lignesUtiles(WORKFLOW);
    expect(bloc(lignes, "permissions").map((l) => l.trim())).toEqual([
      "permissions:",
      "contents: write",
      "pull-requests: write",
    ]);
    expect(
      bloc(lignes, "jobs")
        .filter((l) => /^ {2}\S/.test(l))
        .map((l) => l.trim()),
    ).toEqual(["enable:"]);
  });

  const remplacer = (avant: string, apres: string): string => {
    expect(WORKFLOW).toContain(avant);
    return WORKFLOW.replace(avant, apres);
  };

  const negatifs: Array<[string, () => string]> = [
    [
      "condition de base retirée",
      () =>
        remplacer(
          "github.event.pull_request.base.ref == 'main' && (",
          "(",
        ).replace("'docs-only')", "'docs-only'"),
    ],
    [
      "base comparée avec !=",
      () => remplacer("base.ref == 'main'", "base.ref != 'main'"),
    ],
    [
      "base comparée à head.ref",
      () => remplacer("pull_request.base.ref", "pull_request.head.ref"),
    ],
    [
      "autre branche que main",
      () => remplacer("base.ref == 'main'", "base.ref == 'p0-reel'"),
    ],
    [
      "|| qui rend la base facultative",
      () =>
        remplacer(
          "github.event.pull_request.base.ref == 'main' && (github.event.label.name == 'needs-review' || github.event.label.name == 'docs-only')",
          "github.event.pull_request.base.ref == 'main' || github.event.label.name == 'needs-review' || github.event.label.name == 'docs-only'",
        ),
    ],
    [
      "parenthèses retirées (&& lié au seul premier libellé)",
      () =>
        remplacer(
          "&& (github.event.label.name == 'needs-review'",
          "&& github.event.label.name == 'needs-review'",
        ).replace("'docs-only')", "'docs-only'"),
    ],
    [
      "déclencheur push ajouté",
      () => remplacer("on:\n", "on:\n  push:\n    branches: [p0-reel]\n"),
    ],
    [
      "déclencheur pull_request_target",
      () => remplacer("  pull_request:\n", "  pull_request_target:\n"),
    ],
    [
      "déclencheur workflow_run ajouté",
      () => remplacer("on:\n", "on:\n  workflow_run:\n    workflows: [ci]\n"),
    ],
    [
      "type de déclencheur élargi",
      () => remplacer("types: [labeled]", "types: [labeled, synchronize]"),
    ],
    [
      "second if: ajouté",
      () =>
        remplacer(
          "    steps:\n",
          "    steps:\n      - if: always()\n        run: true\n",
        ),
    ],
    ["commande modifiée", () => remplacer("--auto --squash", "--auto --merge")],
  ];

  it.each(negatifs)("refusé : %s", (_nom, muter) => {
    const mutant = muter();
    expect(mutant).not.toBe(WORKFLOW);
    expect(ecartsAutoMerge(mutant)).not.toEqual([]);
  });

  it("espaces normalisés : une condition reformatée reste acceptée", () => {
    const reformate = remplacer(
      "if: github.event.pull_request.base.ref == 'main' && (",
      "if:   github.event.pull_request.base.ref   ==  'main'  &&  (",
    );
    expect(ecartsAutoMerge(reformate)).toEqual([]);
  });
});

describe("ci: aucune autre fusion automatique dans les workflows (0055 D23)", () => {
  it("aucun autre fichier de .github/workflows/ ne contient pr merge, --auto ni enablePullRequestAutoMerge", () => {
    const fichiers = readdirSync(DOSSIER).filter((f) => f !== "auto-merge.yml");
    expect(fichiers.length).toBeGreaterThan(0);
    for (const fichier of fichiers) {
      const texte = readFileSync(path.join(DOSSIER, fichier), "utf8");
      for (const motif of MOTIFS_FUSION) {
        expect(texte.includes(motif), `${fichier} contient « ${motif} »`).toBe(
          false,
        );
      }
    }
  });
});
