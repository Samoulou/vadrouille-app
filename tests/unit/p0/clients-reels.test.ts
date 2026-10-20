// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it, vi } from "vitest";

import * as modeles from "@/ai/openrouter-client";
import * as places from "@/grounding/places-client";
import * as routes from "@/grounding/routes-client";
import * as transport from "@/research/undici-transport";

/**
 * Tests transverses des clients réels de P0r1 (ticket 267) : chargement sans accès réseau, aucune option TLS dans les
 * modules de capacité, importateurs des modules de capacité (leurs seuls tests), gardes « aucune clé » de Vitest et de
 * Playwright.
 */

const { reseau, echoue } = vi.hoisted(() => {
  const etat = { appels: [] as string[] };
  return {
    reseau: etat,
    echoue: (nom: string) => () => {
      etat.appels.push(nom);
      throw new Error(`${nom} appelé au chargement`);
    },
  };
});

vi.mock("node:http", () => ({ request: echoue("http.request"), get: echoue("http.get"), Agent: class {} }));
vi.mock("node:https", () => ({ request: echoue("https.request"), get: echoue("https.get"), Agent: class {} }));
vi.mock("node:net", () => ({ connect: echoue("net.connect"), createConnection: echoue("net.createConnection"), Socket: class {} }));
vi.mock("node:dns", () => ({ lookup: echoue("dns.lookup"), resolve: echoue("dns.resolve") }));
vi.mock("node:dns/promises", () => ({ lookup: echoue("dns.promises.lookup"), resolve: echoue("dns.promises.resolve") }));

const fetchGlobal = vi.hoisted(() => ({ appels: 0 }));
vi.stubGlobal("fetch", () => {
  fetchGlobal.appels += 1;
  throw new Error("fetch global appelé au chargement");
});
afterAll(() => {
  vi.unstubAllGlobals();
});

const RACINE = path.join(import.meta.dirname, "../../..");
const lire = (fichier: string) => readFileSync(path.join(RACINE, fichier), "utf8");

const CLIENT_MODELES = "src/ai/openrouter-client.ts";
const MODULES_CAPACITE = [CLIENT_MODELES, "src/grounding/places-client.ts", "src/grounding/routes-client.ts", "src/research/undici-transport.ts"];

describe("p0: aucun accès réseau au chargement des dépendances", () => {
  it("importer les quatre modules de capacité (et `ai`, le fournisseur, `undici`) n'appelle ni fetch, ni http, ni https, ni net, ni dns", async () => {
    // Imports statiques (après les doubles, hissés par Vitest) : à ce point, les modules et leurs dépendances sont chargés.
    const modules = await Promise.all([modeles, places, routes, transport]);
    expect(modules.every((m) => typeof m === "object")).toBe(true);
    expect(fetchGlobal.appels).toBe(0);
    expect(reseau.appels).toEqual([]);
  });
});

/** Options et noms qui affaibliraient TLS (spécification de P0r1, « TLS affaibli ») : refusés dans les modules de capacité. */
const MOTIF_TLS =
  /rejectUnauthorized|checkServerIdentity|minVersion|maxVersion|secureProtocol|secureOptions|ciphers|\bca\s*:|\bcert\s*:|\bpfx\s*:|NODE_TLS|setDefaultCACertificates|allowInsecure|insecureHTTPParser|\btls\b/;

describe("p0: aucune option TLS dans les modules de capacité", () => {
  it.each([...MODULES_CAPACITE, "src/grounding/enveloppe-google.ts"])("%s : aucune option TLS", (fichier) => {
    expect(lire(fichier)).not.toMatch(MOTIF_TLS);
  });

  it.each([
    "new Agent({ connect: { rejectUnauthorized: false } })",
    "new Agent({ connect: { ca: pem } })",
    "new Agent({ connect: { checkServerIdentity: () => undefined } })",
    "new Agent({ connect: { minVersion: 'TLSv1' } })",
    "new Agent({ connect: { ciphers: 'NULL' } })",
    "new Agent({ connect: { secureOptions: 0 } })",
    "tls.setDefaultCACertificates([])",
    "new Agent({ connect: { insecureHTTPParser: true } })",
  ])("cas négatif détecté : %s", (texte) => {
    expect(texte).toMatch(MOTIF_TLS);
  });
});

function fichiers(dossier: string): string[] {
  const absolu = path.join(RACINE, dossier);
  const resultat: string[] = [];
  for (const nom of readdirSync(absolu)) {
    if (nom === "node_modules" || nom.startsWith(".")) continue;
    const chemin = path.join(absolu, nom);
    if (statSync(chemin).isDirectory()) resultat.push(...fichiers(path.relative(RACINE, chemin)));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(nom)) resultat.push(path.relative(RACINE, chemin).split(path.sep).join("/"));
  }
  return resultat;
}

describe("p0: modules de capacité branchés à aucun point d'entrée", () => {
  it("seuls leurs propres tests, les tests transverses de P0r1 et la composition du mode réel importent les quatre modules de capacité", () => {
    const importateurs = new Map<string, string[]>(MODULES_CAPACITE.map((m) => [m, []]));
    for (const fichier of [...fichiers("src"), ...fichiers("scripts"), ...fichiers("tests"), ...fichiers("db")]) {
      const source = lire(fichier);
      for (const m of source.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
        const specificateur = m[1] ?? "";
        let cible: string;
        if (specificateur.startsWith("@/")) cible = `src/${specificateur.slice(2)}`;
        else if (specificateur.startsWith(".")) cible = path.posix.normalize(path.posix.join(path.posix.dirname(fichier), specificateur));
        else continue;
        for (const capacite of MODULES_CAPACITE) {
          if (cible === capacite || `${cible}.ts` === capacite) importateurs.get(capacite)?.push(fichier);
        }
      }
    }
    // P0r3c-3 (0055 § 3 point 2) : la composition du mode réel est désormais le seul importateur hors des tests.
    const COMPOSITION = "src/server/composition/p0-reel.ts";
    // B8b (0100 § 5.1) : la fabrique commune des clients Google, importée par les deux compositions, nomme Places et Routes.
    const FABRIQUE = "src/server/composition/clients-google.ts";
    // B9c : la composition de la génération nomme le client de modèles et le transport de lecture de pages (variante réelle, derrière la barrière B9-TL-8).
    const GENERATION = "src/server/composition/generation.ts";
    const tries = Object.fromEntries([...importateurs].map(([m, liste]) => [m, [...liste].sort()]));
    expect(tries).toEqual({
      [CLIENT_MODELES]: [CLIENT_MODELES.replace(/\.ts$/, ".test.ts"), COMPOSITION, GENERATION, "tests/unit/p0/clients-reels.test.ts", "tests/unit/p0/sentinelles-google.test.ts"].sort(),
      "src/grounding/places-client.ts": ["src/grounding/places-client.test.ts", COMPOSITION, FABRIQUE, "tests/unit/p0/clients-reels.test.ts", "tests/unit/p0/sentinelles-google.test.ts"].sort(),
      "src/grounding/routes-client.ts": ["src/grounding/routes-client.test.ts", COMPOSITION, FABRIQUE, "tests/unit/p0/clients-reels.test.ts", "tests/unit/p0/sentinelles-google.test.ts"].sort(),
      "src/research/undici-transport.ts": ["src/research/undici-transport.test.ts", COMPOSITION, GENERATION, "tests/unit/p0/clients-reels.test.ts", "tests/unit/p0/undici-contrat.test.ts"].sort(),
    });
  });
});

describe("p0: aucune clé dans l'environnement des tests (mise en place)", () => {
  it.each(["tests/unit/setup.ts", "playwright.config.ts"])("%s échoue si une clé de service est posée", (fichier) => {
    const source = lire(fichier);
    expect(source).toMatch(/import \{ clesDeServicePosees \} from "(@\/server\/env\/garde-cles|\.\/src\/server\/env\/garde-cles)";/);
    expect(source).toMatch(/if \(\w+\.length > 0\) \{\s*throw new Error\(/);
  });
});
