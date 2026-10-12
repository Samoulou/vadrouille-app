// @vitest-environment node
import { spawnSync } from "node:child_process";
import dns from "node:dns";
import { cpSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import tls from "node:tls";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CODES_SORTIE, ERREUR_MODE_REEL, principal, type Sorties } from "../../../scripts/p0/cli";
import type { Dossiers } from "../../../scripts/p0/fichiers";

/**
 * Commande `pnpm p0` : `--reel` en erreur fermée, validation de `--brief`, aucune clé lue, aucune connexion, et
 * une exécution réelle de la commande dans un sous-processus (décision 0032, A3.4).
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const VARIABLES_DE_CLE = ["OPENROUTER_API_KEY", "GOOGLE_MAPS_SERVER_KEY"];

let dossierTemp: string;
let dossiers: Dossiers;

beforeEach(() => {
  dossierTemp = mkdtempSync(path.join(realpathSync(tmpdir()), "p0-cli-"));
  for (const sous of ["briefs", "config", "fixtures"]) {
    cpSync(path.join(RACINE, "prototype", sous), path.join(dossierTemp, sous), { recursive: true });
  }
  dossiers = { racine: pathToFileURL(`${dossierTemp}/`) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  rmSync(dossierTemp, { recursive: true, force: true });
});

function sorties() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const s: Sorties = { stdout: (ligne) => stdout.push(ligne), stderr: (ligne) => stderr.push(ligne) };
  return { s, stdout, stderr };
}

/** Enregistre toute lecture des variables de clé pendant `travail`. */
async function surveillerEnv<T>(travail: () => Promise<T>): Promise<{ valeur: T; lues: string[] }> {
  const lues: string[] = [];
  const original = process.env;
  process.env = new Proxy(original, {
    get(cible, nom, recepteur) {
      if (typeof nom === "string" && VARIABLES_DE_CLE.includes(nom)) lues.push(nom);
      return Reflect.get(cible, nom, recepteur);
    },
    has(cible, nom) {
      if (typeof nom === "string" && VARIABLES_DE_CLE.includes(nom)) lues.push(nom);
      return Reflect.has(cible, nom);
    },
    ownKeys(cible) {
      lues.push("*");
      return Reflect.ownKeys(cible);
    },
  });
  try {
    return { valeur: await travail(), lues };
  } finally {
    process.env = original;
  }
}

/** Double réseau : tout appel lève. */
function interdireReseau() {
  const leve = () => {
    throw new Error("connexion interdite dans le mode simulé");
  };
  const espions = [
    vi.spyOn(net, "connect").mockImplementation(leve),
    vi.spyOn(net, "createConnection").mockImplementation(leve),
    vi.spyOn(tls, "connect").mockImplementation(leve),
    vi.spyOn(http, "request").mockImplementation(leve),
    vi.spyOn(http, "get").mockImplementation(leve),
    vi.spyOn(https, "request").mockImplementation(leve),
    vi.spyOn(https, "get").mockImplementation(leve),
    vi.spyOn(dns, "lookup").mockImplementation(leve),
    vi.spyOn(dns.promises, "lookup").mockImplementation(leve),
  ];
  const fetch = vi.fn(leve);
  vi.stubGlobal("fetch", fetch);
  return [...espions, fetch];
}

describe("p0: --reel sort toujours en erreur fermée", () => {
  const formes = [["--reel"], ["--reel", "--brief", "edimbourg-1"], ["--brief", "edimbourg-1", "--reel"], ["--reel=1"], ["--reel", "--brief", "../x"]];

  for (const avecCles of [false, true]) {
    it(`code real_mode_unavailable, aucune lecture de clé ni connexion (${avecCles ? "avec" : "sans"} variables de clé)`, async () => {
      if (avecCles) for (const nom of VARIABLES_DE_CLE) vi.stubEnv(nom, `valeur-de-test-${nom}`);
      const reseau = interdireReseau();
      for (const argv of formes) {
        const { s, stdout, stderr } = sorties();
        const { valeur, lues } = await surveillerEnv(() => principal(argv, s, { dossiers }));
        expect(valeur).toBe(CODES_SORTIE.realUnavailable);
        expect(stderr).toEqual([JSON.stringify({ code: ERREUR_MODE_REEL })]);
        expect(stdout).toEqual([]);
        expect(lues).toEqual([]);
      }
      for (const espion of reseau) expect(espion).not.toHaveBeenCalled();
      // Aucun fichier écrit : pas de dossier de sorties créé.
      expect(readdirSync(dossierTemp).sort()).toEqual(["briefs", "config", "fixtures"]);
    });
  }

  it("avec n'importe quelle configuration (même illisible) : même erreur, la configuration n'est pas lue", async () => {
    writeFileSync(path.join(dossierTemp, "config", "modeles.json"), '{"mode":"reel","host":"exemple.org"}');
    const { s, stderr } = sorties();
    expect(await principal(["--reel"], s, { dossiers })).toBe(CODES_SORTIE.realUnavailable);
    expect(stderr).toEqual([JSON.stringify({ code: ERREUR_MODE_REEL })]);
  });
});

describe("p0: le mode simulé ne lit aucune clé et n'ouvre aucune connexion", () => {
  for (const avecCles of [false, true]) {
    it(`variables de clé ${avecCles ? "présentes" : "absentes"} : jamais lues ; double réseau jamais appelé`, async () => {
      if (avecCles) for (const nom of VARIABLES_DE_CLE) vi.stubEnv(nom, `valeur-de-test-${nom}`);
      const reseau = interdireReseau();
      const { s, stdout } = sorties();
      const { valeur, lues } = await surveillerEnv(() =>
        principal(["--brief", "edimbourg-1"], s, { dossiers, aujourdHui: () => "2026-10-12" }),
      );
      expect(valeur).toBe(CODES_SORTIE.complete);
      expect(lues).toEqual([]);
      for (const espion of reseau) expect(espion).not.toHaveBeenCalled();
      expect(stdout.map((ligne) => (JSON.parse(ligne) as { code: string }).code)).toContain("programme_written");
      const ecrits = readdirSync(path.join(dossierTemp, "sorties")).sort();
      expect(ecrits).toEqual(["proto_edimbourg_20261012_1.json", "proto_edimbourg_20261012_1.rapport.json"]);
      if (avecCles) {
        const tout = [...stdout, ...ecrits.map((nom) => readFileSync(path.join(dossierTemp, "sorties", nom), "utf8"))].join("\n");
        for (const nom of VARIABLES_DE_CLE) expect(tout).not.toContain(`valeur-de-test-${nom}`);
      }
    });
  }

  it("deux exécutions le même jour prennent deux numéros", async () => {
    const options = { dossiers, aujourdHui: () => "2026-10-12" };
    expect(await principal(["--brief", "edimbourg-2", "--variante", "a"], sorties().s, options)).toBe(0);
    expect(await principal(["--brief", "edimbourg-2"], sorties().s, options)).toBe(0);
    expect(readdirSync(path.join(dossierTemp, "sorties")).filter((nom) => !nom.includes("rapport")).sort()).toEqual([
      "proto_edimbourg_20261012_1.json",
      "proto_edimbourg_20261012_2.json",
    ]);
  });
});

describe("p0: --brief n'accepte qu'un nom", () => {
  const cas: [string, string][] = [
    ["../x", "brief_name_invalid"],
    ["../../package", "brief_name_invalid"],
    ["/etc/passwd", "brief_name_invalid"],
    ["Edimbourg-1", "brief_name_invalid"],
    ["edimbourg-1.json", "brief_name_invalid"],
    ["a".repeat(33), "brief_name_invalid"],
    ["", "brief_name_invalid"],
    ["inconnu", "brief_not_found"],
  ];
  for (const [nom, code] of cas) {
    it(`${JSON.stringify(nom.slice(0, 20))} : ${code}`, async () => {
      const { s, stdout } = sorties();
      expect(await principal(["--brief", nom], s, { dossiers })).toBe(CODES_SORTIE.failed);
      expect(stdout.at(-1)).toBe(JSON.stringify({ code }));
    });
  }

  it("un fichier hors de la liste du dossier n'est jamais ouvert, même s'il existe à côté", async () => {
    writeFileSync(path.join(dossierTemp, "secret.json"), "{}");
    const { s, stdout } = sorties();
    expect(await principal(["--brief", "secret"], s, { dossiers })).toBe(CODES_SORTIE.failed);
    expect(stdout.at(-1)).toBe(JSON.stringify({ code: "brief_not_found" }));
  });

  it("usage : --brief absent, option inconnue, argument positionnel, variante inconnue", async () => {
    for (const argv of [[], ["--brief"], ["--brief", "edimbourg-1", "--mode", "reel"], ["edimbourg-1"], ["--brief", "edimbourg-1", "--variante", "c"]]) {
      const { s, stdout } = sorties();
      expect(await principal(argv, s, { dossiers }), argv.join(" ")).toBe(CODES_SORTIE.usage);
      expect(stdout).toEqual([JSON.stringify({ code: "usage" })]);
    }
  });
});

describe("p0: la commande pnpm p0 tourne (sous-processus, environnement sans variable de clé)", () => {
  it("pnpm p0 --brief edimbourg-1 : code 0, programme réduit et rapport écrits", () => {
    const sortiesDir = path.join(RACINE, "prototype", "sorties");
    let avant: string[] = [];
    try {
      avant = readdirSync(sortiesDir);
    } catch {
      avant = [];
    }
    const env: NodeJS.ProcessEnv = { NODE_ENV: "test" };
    for (const nom of ["PATH", "HOME", "SystemRoot", "TMPDIR", "TEMP", "TMP"]) {
      const valeur = process.env[nom];
      if (valeur !== undefined) env[nom] = valeur;
    }
    const resultat = spawnSync("pnpm", ["-s", "p0", "--brief", "edimbourg-1"], { cwd: RACINE, env, encoding: "utf8", timeout: 60_000 });
    expect(resultat.status, resultat.stderr).toBe(0);
    const codes = resultat.stdout
      .trim()
      .split("\n")
      .map((ligne) => (JSON.parse(ligne) as { code: string }).code);
    expect(codes).toContain("programme_written");
    expect(codes).toContain("report_written");
    const nouveaux = readdirSync(sortiesDir).filter((nom) => !avant.includes(nom));
    expect(nouveaux.filter((nom) => nom.endsWith(".rapport.json"))).toHaveLength(1);
    expect(nouveaux.filter((nom) => !nom.endsWith(".rapport.json"))).toHaveLength(1);
    // Seul avertissement toléré sur la sortie d'erreur : le type de module de package.json (noté dans la PR).
    const avertissements = resultat.stderr.split("\n").filter((ligne) => /Warning/.test(ligne));
    for (const ligne of avertissements) expect(ligne).toMatch(/MODULE_TYPELESS_PACKAGE_JSON|ExperimentalWarning/);
  });

  it("pnpm p0 --reel : code 2 et real_mode_unavailable", () => {
    const resultat = spawnSync("pnpm", ["-s", "p0", "--reel"], {
      cwd: RACINE,
      env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "" },
      encoding: "utf8",
      timeout: 60_000,
    });
    expect(resultat.status).toBe(2);
    expect(resultat.stderr).toContain(JSON.stringify({ code: ERREUR_MODE_REEL }));
  });
});
