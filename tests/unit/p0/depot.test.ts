// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Contrôles sur les fichiers du dépôt : aucun secret suivi, aucune sortie du prototype suivie, liste des
 * incontournables jamais lue par le script.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

function git(...args: string[]): string {
  return execFileSync("git", args, { cwd: RACINE, encoding: "utf8" });
}

/** Fichiers suivis, plus les fichiers nouveaux non ignorés (pour que le test agisse avant le commit). */
function fichiersSuivis(): string[] {
  return git("ls-files", "--cached", "--others", "--exclude-standard", "-z")
    .split("\0")
    .filter((fichier) => fichier.length > 0);
}

/** Motifs publics des préfixes de clés OpenRouter et Google. */
const MOTIFS_CLES = [/sk-or-v1-[0-9a-f]{64}/, /sk-or-[A-Za-z0-9_-]{40,}/, /AIza[0-9A-Za-z_-]{35}/];

describe("p0: aucun secret dans les fichiers suivis", () => {
  it("aucune forme de clé OpenRouter ou Google dans un fichier suivi", () => {
    const trouves: string[] = [];
    for (const fichier of fichiersSuivis()) {
      const absolu = path.join(RACINE, fichier);
      let contenu: Buffer;
      try {
        if (statSync(absolu).size > 5_000_000) continue;
        contenu = readFileSync(absolu);
      } catch {
        continue; // fichier supprimé du dossier de travail
      }
      const texte = contenu.toString("utf8");
      for (const motif of MOTIFS_CLES) if (motif.test(texte)) trouves.push(fichier);
    }
    expect(trouves).toEqual([]);
  });

  it("aucun .env suivi autre que .env.example", () => {
    const envs = fichiersSuivis().filter((fichier) => /(^|\/)\.env(\.|$)/.test(fichier));
    expect(envs).toEqual([".env.example"]);
  });

  it("les motifs reconnaissent bien une clé de forme valide (contrôle du test lui-même)", () => {
    expect(MOTIFS_CLES.some((motif) => motif.test(`sk-or-v1-${"a".repeat(64)}`))).toBe(true);
    expect(MOTIFS_CLES.some((motif) => motif.test(`AIza${"B".repeat(35)}`))).toBe(true);
  });
});

describe("ci: aucune sortie suivie par git", () => {
  it("git ls-files prototype/sorties ne renvoie rien", () => {
    expect(git("ls-files", "prototype/sorties").trim()).toBe("");
  });

  it("prototype/sorties/ est ignoré par git", () => {
    expect(readFileSync(path.join(RACINE, ".gitignore"), "utf8").split("\n")).toContain("prototype/sorties/");
    expect(git("check-ignore", "prototype/sorties/proto_x_20260101_1.json").trim()).toBe("prototype/sorties/proto_x_20260101_1.json");
  });
});

describe("p0: la liste des incontournables n'est jamais lue par le script", () => {
  /** Noms de la liste de Samuel (spécification P0) : aucun fichier lu par le script ne doit les contenir. */
  const NOMS = [
    "château d'édimbourg",
    "edinburgh castle",
    "royal mile",
    "arthur's seat",
    "holyrood",
    "calton hill",
    "dean village",
    "victoria street",
    "grassmarket",
    "national museum of scotland",
    "princes street",
    "scott monument",
    "royal botanic",
    "leith",
    "the shore",
  ];

  it("aucun fichier lu par le script (briefs, configuration, fixtures) ne contient la liste", () => {
    const lus = fichiersSuivis().filter((fichier) => /^prototype\/(briefs|config|fixtures)\//.test(fichier));
    expect(lus.length).toBeGreaterThan(8);
    for (const fichier of lus) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8").toLowerCase();
      for (const nom of NOMS) expect(texte, `${fichier} : ${nom}`).not.toContain(nom);
    }
  });

  it("le code du script ne référence aucun fichier de liste ou de grille", () => {
    const code = fichiersSuivis().filter((fichier) =>
      /^(scripts\/p0|src\/(ai|research|grounding|domain|prototype))\/.+\.(ts|mjs)$/.test(fichier) && !fichier.endsWith(".test.ts"),
    );
    for (const fichier of code) {
      const texte = readFileSync(path.join(RACINE, fichier), "utf8");
      expect(texte, fichier).not.toMatch(/incontournables?\.(json|md|txt|csv)|grille[-_]?g0|docs\/produit|specs\//i);
    }
    // Le script ne lit que trois dossiers de prototype/ (plus ses sorties).
    const fichiersScript = readFileSync(path.join(RACINE, "scripts/p0/fichiers.ts"), "utf8");
    const dossiersLus = [...fichiersScript.matchAll(/dossier\(dossiers, "([a-z]+)"\)/g)].map((m) => m[1]);
    expect(new Set(dossiersLus)).toEqual(new Set(["briefs", "config", "fixtures", "sorties"]));
  });
});
