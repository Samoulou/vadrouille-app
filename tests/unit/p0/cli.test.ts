// @vitest-environment node
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CODES_SORTIE, ERREUR_MODE_REEL, principal, type Sorties } from "../../../scripts/p0/cli";
import type { Dossiers } from "../../../scripts/p0/fichiers";

/**
 * Commande `pnpm p0` : `--reel` en erreur fermée, validation de `--brief`, aucune connexion, et une exécution réelle
 * de la commande dans un sous-processus (décision 0032, A3.4).
 *
 * Doubles réseau (décision 0042, P0cS-TL-1) : `node:dns`, `node:dns/promises`, `node:http`, `node:https` et `node:tls`
 * sont remplacés par des fabriques littérales sans paramètre, dont chaque fonction de connexion lève ; les espions sont
 * créés par `vi.hoisted`, sans import du module réel. Le `fetch` global est doublé par `vi.stubGlobal`. Aucun module du
 * graphe de `scripts/p0` n'importe ces modules : ces doubles sont inertes, et la preuve réelle d'absence de connexion par
 * eux reste `tests/unit/p0/imports.test.ts`. `node:net` n'est pas doublé (le mode simulé en utilise `BlockList` et `isIP`
 * par `src/research/ip-guard.ts`, seules formes admises par sa ligne de capacité).
 *
 * « Aucune clé lue » est une preuve statique seulement : `tests/unit/p0/imports.test.ts` refuse toute lecture de nom
 * secret dans les dossiers de P0 (décision 0040 D1, option b ; décision 0042, P0cS-Q1). Le sous-processus, lancé avec un
 * environnement sans variable de clé, prouve que la commande tourne sans clé.
 */

const reseau = vi.hoisted(() => {
  const leve = () => {
    throw new Error("connexion interdite dans le mode simulé");
  };
  return {
    dnsLookup: vi.fn(leve),
    dnsPromisesLookup: vi.fn(leve),
    httpRequest: vi.fn(leve),
    httpGet: vi.fn(leve),
    httpsRequest: vi.fn(leve),
    httpsGet: vi.fn(leve),
    tlsConnect: vi.fn(leve),
    faux: vi.fn(leve),
  };
});

vi.mock("node:dns", () => ({
  default: { lookup: reseau.dnsLookup, promises: { lookup: reseau.dnsPromisesLookup } },
  lookup: reseau.dnsLookup,
  promises: { lookup: reseau.dnsPromisesLookup },
}));
vi.mock("node:dns/promises", () => ({
  default: { lookup: reseau.dnsPromisesLookup },
  lookup: reseau.dnsPromisesLookup,
}));
vi.mock("node:http", () => ({
  default: { request: reseau.httpRequest, get: reseau.httpGet },
  request: reseau.httpRequest,
  get: reseau.httpGet,
}));
vi.mock("node:https", () => ({
  default: { request: reseau.httpsRequest, get: reseau.httpsGet },
  request: reseau.httpsRequest,
  get: reseau.httpsGet,
}));
vi.mock("node:tls", () => ({
  default: { connect: reseau.tlsConnect },
  connect: reseau.tlsConnect,
}));

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

let dossierTemp: string;
let dossiers: Dossiers;

beforeEach(() => {
  for (const espion of Object.values(reseau)) espion.mockClear();
  vi.stubGlobal("fetch", reseau.faux);
  dossierTemp = mkdtempSync(path.join(realpathSync(tmpdir()), "p0-cli-"));
  for (const sous of ["briefs", "config", "fixtures"]) {
    cpSync(path.join(RACINE, "prototype", sous), path.join(dossierTemp, sous), { recursive: true });
  }
  dossiers = { racine: pathToFileURL(`${dossierTemp}/`) };
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  rmSync(dossierTemp, { recursive: true, force: true });
});

function sorties() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const s: Sorties = { stdout: (ligne) => stdout.push(ligne), stderr: (ligne) => stderr.push(ligne) };
  return { s, stdout, stderr };
}

/** Aucun double réseau appelé (espions des fabriques `vi.mock` et double du `fetch` global). */
function attendreAucuneConnexion() {
  for (const [nom, espion] of Object.entries(reseau)) expect(espion, nom).not.toHaveBeenCalled();
}

describe("p0: --reel sort toujours en erreur fermée", () => {
  const formes = [["--reel"], ["--reel", "--brief", "edimbourg-1"], ["--brief", "edimbourg-1", "--reel"], ["--reel=1"], ["--reel", "--brief", "../x"]];

  it("code real_mode_unavailable, sortie standard vide, aucun fichier écrit ni connexion (sans variables de clé)", async () => {
    for (const argv of formes) {
      const { s, stdout, stderr } = sorties();
      expect(await principal(argv, s, { dossiers }), argv.join(" ")).toBe(CODES_SORTIE.realUnavailable);
      expect(stderr).toEqual([JSON.stringify({ code: ERREUR_MODE_REEL })]);
      expect(stdout).toEqual([]);
    }
    attendreAucuneConnexion();
    // Aucun fichier écrit : pas de dossier de sorties créé.
    expect(readdirSync(dossierTemp).sort()).toEqual(["briefs", "config", "fixtures"]);
  });

  it("avec n'importe quelle configuration (même illisible) : même erreur, la configuration n'est pas lue", async () => {
    writeFileSync(path.join(dossierTemp, "config", "modeles.json"), '{"mode":"reel","host":"exemple.org"}');
    const { s, stderr } = sorties();
    expect(await principal(["--reel"], s, { dossiers })).toBe(CODES_SORTIE.realUnavailable);
    expect(stderr).toEqual([JSON.stringify({ code: ERREUR_MODE_REEL })]);
  });
});

describe("p0: le mode simulé n'ouvre aucune connexion", () => {
  it("variables de clé absentes : double réseau jamais appelé, programme et rapport écrits", async () => {
    const { s, stdout } = sorties();
    const valeur = await principal(["--brief", "edimbourg-1"], s, { dossiers, aujourdHui: () => "2026-10-12" });
    expect(valeur).toBe(CODES_SORTIE.complete);
    attendreAucuneConnexion();
    expect(stdout.map((ligne) => (JSON.parse(ligne) as { code: string }).code)).toContain("programme_written");
    const ecrits = readdirSync(path.join(dossierTemp, "sorties")).sort();
    expect(ecrits).toEqual(["proto_edimbourg_20261012_1.json", "proto_edimbourg_20261012_1.rapport.json"]);
  });

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

/** Environnement du sous-processus : `NODE_ENV` et six variables système lues par propriété littérale (0042, P0cS-TL-5). */
function environnementMinimal(): NodeJS.ProcessEnv {
  const systeme = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    SystemRoot: process.env.SystemRoot,
    TMPDIR: process.env.TMPDIR,
    TEMP: process.env.TEMP,
    TMP: process.env.TMP,
  };
  return { NODE_ENV: "test", ...Object.fromEntries(Object.entries(systeme).filter(([, valeur]) => valeur !== undefined)) };
}

describe("p0: la commande pnpm p0 tourne (sous-processus, environnement sans variable de clé)", () => {
  it("pnpm p0 --brief edimbourg-1 : code 0, programme réduit et rapport écrits", () => {
    const sortiesDir = path.join(RACINE, "prototype", "sorties");
    let avant: string[] = [];
    try {
      avant = readdirSync(sortiesDir);
    } catch {
      avant = [];
    }
    const dossierExistait = existsSync(sortiesDir);
    try {
      const resultat = spawnSync("pnpm", ["-s", "p0", "--brief", "edimbourg-1"], {
        cwd: RACINE,
        env: environnementMinimal(),
        encoding: "utf8",
        timeout: 60_000,
      });
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
    } finally {
      // Nettoyage (revue Sécurité de #180, mineur 8) : les fichiers écrits par ce test sont retirés, pour ne pas
      // approcher le plafond de 999 sorties par jour et par brief au fil des exécutions locales.
      if (existsSync(sortiesDir)) {
        for (const nom of readdirSync(sortiesDir).filter((n) => !avant.includes(n))) rmSync(path.join(sortiesDir, nom), { force: true });
        if (!dossierExistait && readdirSync(sortiesDir).length === 0) rmSync(sortiesDir, { recursive: true, force: true });
      }
    }
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
