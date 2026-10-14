// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAS_PRODUCTION_COMMUNS } from "../../../tests/support/cas-production-commune";


import { OPTIONS_TLS, optionsDeNode, verifierSortie, type EnvSortie } from "./egress";

/**
 * `p0: aucun client réel hors préversion ou développement`, `… derrière un proxy d'environnement`, `… avec un TLS
 * affaibli` et `p0: egress, un seul contrat` (spécification `specs/P0-suite-executions-reelles.md`). L'environnement
 * et `execArgv` sont injectés ; le vrai `process.env`, que la barrière lit aussi pour ses trois variables de
 * déploiement (0046 D21), est posé en préversion par `vi.stubEnv` et rétabli après chaque cas.
 */

/** Vrai `process.env` d'un cas : chaque variable absente de l'objet est retirée. */
function poserReel(reel: { readonly VERCEL_ENV?: string; readonly VERCEL_TARGET_ENV?: string; readonly VADROUILLE_ENV?: string }) {
  vi.stubEnv("VERCEL_ENV", reel.VERCEL_ENV);
  vi.stubEnv("VERCEL_TARGET_ENV", reel.VERCEL_TARGET_ENV);
  vi.stubEnv("VADROUILLE_ENV", reel.VADROUILLE_ENV);
}

beforeEach(() => {
  poserReel({ VERCEL_ENV: "preview" });
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const PREVIEW: EnvSortie = { VERCEL_ENV: "preview" };
const sortie = (env: EnvSortie, execArgv: readonly string[] = []) => verifierSortie(env, execArgv);

describe("p0: aucun client réel hors préversion ou développement (liste d'autorisation de VERCEL_ENV)", () => {
  const refuses: [string, EnvSortie][] = [
    ["VERCEL_ENV absente", {}],
    ["VERCEL_ENV vide", { VERCEL_ENV: "" }],
    ["production", { VERCEL_ENV: "production" }],
    ["Production", { VERCEL_ENV: "Production" }],
    ["« preview» précédé d'une espace", { VERCEL_ENV: " preview" }],
    ["« preview » suivi d'une espace", { VERCEL_ENV: "preview " }],
    ["valeur inconnue", { VERCEL_ENV: "staging" }],
    ["VERCEL_TARGET_ENV vide", { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "" }],
    ["VERCEL_TARGET_ENV production", { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "production" }],
    ["environnement personnalisé", { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "p0-reel" }],
    ["VADROUILLE_ENV production", { VERCEL_ENV: "preview", VADROUILLE_ENV: "production" }],
    ["development et VADROUILLE_ENV production", { VERCEL_ENV: "development", VADROUILLE_ENV: "production" }],
    // Comparaison normalisée de VADROUILLE_ENV (liste de refus) : casse, espaces, retour à la ligne, forme Unicode.
    ["VADROUILLE_ENV Production", { VERCEL_ENV: "preview", VADROUILLE_ENV: "Production" }],
    ["VADROUILLE_ENV PRODUCTION", { VERCEL_ENV: "preview", VADROUILLE_ENV: "PRODUCTION" }],
    ["VADROUILLE_ENV précédée d'une espace", { VERCEL_ENV: "preview", VADROUILLE_ENV: " production" }],
    ["VADROUILLE_ENV suivie d'un retour à la ligne", { VERCEL_ENV: "preview", VADROUILLE_ENV: "production\n" }],
    ["VADROUILLE_ENV en lettres pleine chasse", { VERCEL_ENV: "preview", VADROUILLE_ENV: "\uFF50roduction" }],
  ];
  it.each(refuses)("%s : production_refused", (_nom, env) => {
    expect(sortie(env)).toEqual({ ok: false, code: "production_refused" });
  });

  it.each<[string, EnvSortie]>([
    ["preview", { VERCEL_ENV: "preview" }],
    ["development", { VERCEL_ENV: "development" }],
    ["preview avec VERCEL_TARGET_ENV égale", { VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" }],
    ["development avec VERCEL_TARGET_ENV égale", { VERCEL_ENV: "development", VERCEL_TARGET_ENV: "development" }],
    ["VADROUILLE_ENV staging", { VERCEL_ENV: "preview", VADROUILLE_ENV: "staging" }],
  ])("%s : admis", (_nom, env) => {
    expect(sortie(env)).toEqual({ ok: true });
  });
});

describe("p0: aucun client réel derrière un proxy d'environnement", () => {
  const VARIABLES = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NODE_USE_ENV_PROXY"];
  for (const nom of VARIABLES) {
    for (const graphie of [nom, nom.toLowerCase()]) {
      it(`${graphie} posée seule : proxy_env_refused`, () => {
        expect(sortie({ ...PREVIEW, [graphie]: "http://127.0.0.1:3128" })).toEqual({ ok: false, code: "proxy_env_refused" });
      });
      it(`${graphie} vide : pas de refus`, () => {
        expect(sortie({ ...PREVIEW, [graphie]: "" })).toEqual({ ok: true });
      });
      it(`${graphie} faite d'une espace : refus`, () => {
        expect(sortie({ ...PREVIEW, [graphie]: " " })).toEqual({ ok: false, code: "proxy_env_refused" });
      });
    }
  }
  it("NO_PROXY=* ne lève pas le refus", () => {
    expect(sortie({ ...PREVIEW, HTTPS_PROXY: "http://p", NO_PROXY: "*", no_proxy: "*" })).toEqual({ ok: false, code: "proxy_env_refused" });
  });
  it("NO_PROXY seule : pas de refus", () => {
    expect(sortie({ ...PREVIEW, NO_PROXY: "*", no_proxy: "*" })).toEqual({ ok: true });
  });
  it.each([
    ["NODE_OPTIONS=--use-env-proxy", { ...PREVIEW, NODE_OPTIONS: "--use-env-proxy" }, []],
    ["NODE_OPTIONS avec d'autres options", { ...PREVIEW, NODE_OPTIONS: "--max-old-space-size=4096 --use-env-proxy" }, []],
    ["NODE_OPTIONS avec _", { ...PREVIEW, NODE_OPTIONS: "--use_env_proxy" }, []],
    ["execArgv", PREVIEW, ["--use-env-proxy"]],
  ] as [string, EnvSortie, string[]][])("%s : proxy_env_refused", (_nom, env, execArgv) => {
    expect(sortie(env, execArgv)).toEqual({ ok: false, code: "proxy_env_refused" });
  });
});

describe("p0: aucun client réel avec un TLS affaibli", () => {
  const VARIABLES = ["NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "OPENSSL_CONF", "SSLKEYLOGFILE"];
  it.each(VARIABLES)("%s posée seule : tls_env_refused", (nom) => {
    expect(sortie({ ...PREVIEW, [nom]: "1" })).toEqual({ ok: false, code: "tls_env_refused" });
  });
  it.each(VARIABLES)("%s vide : pas de refus", (nom) => {
    expect(sortie({ ...PREVIEW, [nom]: "" })).toEqual({ ok: true });
  });
  it("les noms sont comparés exactement (Node et OpenSSL ne lisent que les majuscules)", () => {
    expect(sortie({ ...PREVIEW, node_tls_reject_unauthorized: "0" })).toEqual({ ok: true });
  });
  it("la liste des options interdites est celle de la spécification", () => {
    expect([...OPTIONS_TLS].sort()).toEqual(
      [
        "--use-openssl-ca",
        "--use-system-ca",
        "--openssl-config",
        "--openssl-legacy-provider",
        "--openssl-shared-config",
        "--tls-keylog",
        "--tls-min-v1.0",
        "--tls-min-v1.1",
        "--tls-cipher-list",
        "--insecure-http-parser",
      ].sort(),
    );
  });
  for (const option of OPTIONS_TLS) {
    it(`${option} dans NODE_OPTIONS, avec et sans =valeur : refus`, () => {
      expect(sortie({ ...PREVIEW, NODE_OPTIONS: option })).toEqual({ ok: false, code: "tls_env_refused" });
      expect(sortie({ ...PREVIEW, NODE_OPTIONS: `${option}=x` })).toEqual({ ok: false, code: "tls_env_refused" });
    });
    it(`${option} dans execArgv injecté : refus`, () => {
      expect(sortie(PREVIEW, ["--conditions=react-server", option])).toEqual({ ok: false, code: "tls_env_refused" });
    });
  }
  it("graphie avec _ et option entre guillemets : refus", () => {
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: "--tls_cipher_list=x" })).toEqual({ ok: false, code: "tls_env_refused" });
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: '"--use-openssl-ca"' })).toEqual({ ok: false, code: "tls_env_refused" });
  });
  it("une option voisine n'est pas confondue (comparaison de l'option entière)", () => {
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: "--tls-min-v1.2 --max-old-space-size=4096" })).toEqual({ ok: true });
    expect(optionsDeNode("--disable-warning=ExperimentalWarning", [])).toEqual(new Set(["--disable-warning"]));
  });
});

describe("p0: egress, un seul contrat", () => {
  it("un seul code, dans l'ordre production, proxy, TLS", () => {
    const tout: EnvSortie = { VERCEL_ENV: "production", HTTPS_PROXY: "http://p", SSL_CERT_FILE: "/x" };
    expect(sortie(tout)).toEqual({ ok: false, code: "production_refused" });
    expect(sortie({ ...tout, VERCEL_ENV: "preview" })).toEqual({ ok: false, code: "proxy_env_refused" });
    expect(sortie({ ...tout, VERCEL_ENV: "preview", HTTPS_PROXY: "" })).toEqual({ ok: false, code: "tls_env_refused" });
  });
  it("le résultat ne contient jamais une valeur lue", () => {
    const resultat = sortie({ VERCEL_ENV: "preview", HTTPS_PROXY: "http://SENTINELLE-PROXY:3128" });
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE");
  });
});

describe("p0: egress refuse la production même avec un env injecté (0046 D21)", () => {
  it.each(["VERCEL_ENV", "VERCEL_TARGET_ENV", "VADROUILLE_ENV"] as const)(
    "%s « production » dans le vrai process.env, env injecté « preview » : production_refused",
    (nom) => {
      poserReel({ VERCEL_ENV: "preview", [nom]: "production" });
      expect(sortie({ VERCEL_ENV: "preview", VERCEL_TARGET_ENV: "preview" })).toEqual({ ok: false, code: "production_refused" });
    },
  );

  it.each(CAS_PRODUCTION_COMMUNS.map((cas) => [cas.nom, cas] as const))("table commune avec la garde de connexion : %s", (_nom, cas) => {
    poserReel(cas.reel);
    const attendu = cas.egress === "ok" ? { ok: true } : { ok: false, code: cas.egress };
    expect(sortie(cas.injecte)).toEqual(attendu);
  });

  it("le vrai process.env est relu à chaque appel, jamais mis en cache", () => {
    expect(sortie(PREVIEW)).toEqual({ ok: true });
    poserReel({ VERCEL_ENV: "production" });
    expect(sortie(PREVIEW)).toEqual({ ok: false, code: "production_refused" });
    poserReel({ VERCEL_ENV: "preview" });
    expect(sortie(PREVIEW)).toEqual({ ok: true });
  });
});

describe("p0: formes --no-… de NODE_OPTIONS et d'execArgv (bloquant 3, renvoyé à P0r2 par 0049 T)", () => {
  it.each([
    ["--no-use-openssl-ca", "tls_env_refused"],
    ["--no_use_openssl_ca", "tls_env_refused"],
    ["--no-tls-keylog=/tmp/cles", "tls_env_refused"],
    ['"--no-insecure-http-parser"', "tls_env_refused"],
    ["--no-no-tls-cipher-list", "tls_env_refused"],
    ["--no-use-env-proxy", "proxy_env_refused"],
    ["--no_use_env_proxy", "proxy_env_refused"],
  ] as const)("%s dans NODE_OPTIONS : %s (forme niée d'une option interdite, échec fermé)", (option, code) => {
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: `--max-old-space-size=4096 ${option}` })).toEqual({ ok: false, code });
  });

  it("forme niée dans execArgv injecté : refus", () => {
    expect(sortie(PREVIEW, ["--no-use-system-ca"])).toEqual({ ok: false, code: "tls_env_refused" });
  });

  it("la forme niée ajoute le nom de base, sans confondre une option voisine", () => {
    expect(optionsDeNode("--no-tls-min-v1.2 --no-warnings", [])).toEqual(new Set(["--no-tls-min-v1.2", "--tls-min-v1.2", "--no-warnings", "--warnings"]));
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: "--no-warnings --no-deprecation" })).toEqual({ ok: true });
    expect(sortie({ ...PREVIEW, NODE_OPTIONS: "--no-tls-min-v1.2" })).toEqual({ ok: true });
  });
});
