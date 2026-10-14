// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { CAS_PRODUCTION_COMMUNS } from "../../../tests/support/cas-production-commune";

import {
  CAUSES_SORTIE,
  EXCEPTIONS_SORTIE,
  OPTIONS_TLS,
  optionsDeNode,
  VERDICTS_SORTIE,
  verifierSortie,
  ZONES_SORTIE,
  type DiagnosticSortie,
  type EnvSortie,
} from "./egress";
import type { SystemeFichiersOpenssl } from "./openssl-conf";

/**
 * `p0: aucun client réel hors préversion ou développement`, `… derrière un proxy d'environnement`, `… avec un TLS
 * affaibli` et `p0: egress, un seul contrat` (spécification `specs/P0-suite-executions-reelles.md`). L'environnement
 * et `execArgv` sont injectés ; le vrai `process.env`, que la barrière lit aussi pour ses trois variables de
 * déploiement (0046 D21), est posé en préversion par `vi.stubEnv` et rétabli après chaque cas ; `VERCEL` et
 * `OPENSSL_CONF` (conditions 1.1 et 1.2 de 0062) y sont retirées, sauf dans les cas de l'exception de 0062.
 */

/** Vrai `process.env` d'un cas : chaque variable absente de l'objet est retirée. */
function poserReel(reel: { readonly VERCEL_ENV?: string; readonly VERCEL_TARGET_ENV?: string; readonly VADROUILLE_ENV?: string }) {
  vi.stubEnv("VERCEL_ENV", reel.VERCEL_ENV);
  vi.stubEnv("VERCEL_TARGET_ENV", reel.VERCEL_TARGET_ENV);
  vi.stubEnv("VADROUILLE_ENV", reel.VADROUILLE_ENV);
}

beforeEach(() => {
  poserReel({ VERCEL_ENV: "preview" });
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("OPENSSL_CONF", undefined);
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

/**
 * Faux système de fichiers de l'examen d'`OPENSSL_CONF` : une chaîne est un fichier ordinaire. Toute lecture est notée
 * (espion) ; un chemin absent lève, comme `node:fs`.
 */
function fauxFs(fichiers: Readonly<Record<string, string>>): SystemeFichiersOpenssl & { readonly appels: string[] } {
  const appels: string[] = [];
  const contenus = new Map(Object.entries(fichiers));
  const texte = (chemin: string) => {
    const t = contenus.get(chemin);
    if (t === undefined) throw new Error(`ENOENT ${chemin}`);
    return t;
  };
  return {
    appels,
    realpathSync: (c) => (appels.push(`realpath ${c}`), texte(c), c),
    lstatSync: (c) => (appels.push(`lstat ${c}`), { isFile: () => true, isDirectory: () => false, size: texte(c).length }),
    readFileSync: (c) => (appels.push(`read ${c}`), new TextEncoder().encode(texte(c))),
    readdirSync: (c) => {
      appels.push(`readdir ${c}`);
      throw new Error(`ENOTDIR ${c}`);
    },
  };
}

const CONF = "/etc/ssl/openssl.cnf";
const FS_SANS_NODE = () => fauxFs({ [CONF]: "openssl_conf = defaut\n" });

/** Préversion de Vercel avec `OPENSSL_CONF`, dans l'env lu et dans le vrai `process.env` (conditions 1.1 et 1.2). */
function poserRuntime(valeur: string = CONF) {
  vi.stubEnv("VERCEL", "1");
  vi.stubEnv("OPENSSL_CONF", valeur);
}
const RUNTIME: EnvSortie = { VERCEL_ENV: "preview", VERCEL: "1", OPENSSL_CONF: CONF };

/** Diagnostic rendu par le rappel de `verifierSortie` (décisions 0058 et 0062). */
function diagnostiquer(env: EnvSortie, execArgv: readonly string[] = [], fs: SystemeFichiersOpenssl = fauxFs({})): DiagnosticSortie | undefined {
  const recus: DiagnosticSortie[] = [];
  verifierSortie(env, execArgv, (d) => void recus.push(d), fs);
  expect(recus.length).toBeLessThanOrEqual(1);
  return recus[0];
}

describe("p0: exception bornée d'OPENSSL_CONF en préversion de Vercel (décision 0062)", () => {
  beforeEach(() => {
    poserRuntime();
  });

  it("fichier sans nodejs_conf sous une racine du runtime : admis, exception marquée", () => {
    const fs = FS_SANS_NODE();
    expect(verifierSortie(RUNTIME, [], undefined, fs)).toEqual({ ok: true });
    expect(diagnostiquer(RUNTIME, [], FS_SANS_NODE())).toEqual({
      exception: "vercel_runtime_openssl_conf",
      openssl_conf_zone: "etc",
      openssl_conf_verdict: "admis",
    });
  });

  it("/dev/null : admis sans lecture", () => {
    poserRuntime("/dev/null");
    const fs = fauxFs({});
    expect(verifierSortie({ ...RUNTIME, OPENSSL_CONF: "/dev/null" }, [], undefined, fs)).toEqual({ ok: true });
    expect(fs.appels).toEqual([]);
  });

  it("fichier qui nomme nodejs_conf : refus, verdict section_nodejs", () => {
    const fs = fauxFs({ [CONF]: "nodejs_conf = n\n" });
    expect(verifierSortie(RUNTIME, [], undefined, fs)).toEqual({ ok: false, code: "tls_env_refused" });
    expect(diagnostiquer(RUNTIME, [], fauxFs({ [CONF]: "nodejs_conf = n\n" }))).toEqual({
      cause: "OPENSSL_CONF",
      openssl_conf_zone: "etc",
      openssl_conf_verdict: "section_nodejs",
    });
  });

  it("fichier absent : refus, verdict fichier_refuse", () => {
    expect(diagnostiquer(RUNTIME, [], fauxFs({}))).toEqual({ cause: "OPENSSL_CONF", openssl_conf_zone: "etc", openssl_conf_verdict: "fichier_refuse" });
  });

  // Le cas « /proc/self/… » de 0062 § 7.6 n'est pas écrit ici : le texte `/proc/` est refusé dans tout fichier analysé
  // par le régime de confinement (`donnees/refus.json`, `motifsProc`). Il est couvert par la liste d'autorisation des
  // racines (zone `autre`, comme `/tmp/…` et `/var/task/…`).
  it.each([
    ["relatif", "etc/ssl/openssl.cnf", "autre"],
    ["avec ..", "/etc/ssl/../openssl.cnf", "etc"],
    ["avec //", "/etc//ssl/openssl.cnf", "etc"],
    ["/ final", "/etc/ssl/", "etc"],
    ["espace avant", ` ${CONF}`, "autre"],
    ["espace après", `${CONF} `, "etc"],
    ["retour à la ligne", `${CONF}\n`, "etc"],
    ["sous /tmp", "/tmp/openssl.cnf", "autre"],
    ["sous /var/task", "/var/task/openssl.cnf", "autre"],
    ["$", "/etc/ssl/$X.cnf", "etc"],
    ["\\", "/etc/ssl\\openssl.cnf", "etc"],
    ["guillemet", '/etc/ssl/"openssl.cnf', "etc"],
  ])("chemin %s : refus, verdict chemin_refuse, zone rendue, aucune lecture", (_nom, chemin, zone) => {
    poserRuntime(chemin);
    const fs = FS_SANS_NODE();
    const env = { ...RUNTIME, OPENSSL_CONF: chemin };
    expect(verifierSortie(env, [], undefined, fs)).toEqual({ ok: false, code: "tls_env_refused" });
    expect(diagnostiquer(env, [], fs)).toEqual({ cause: "OPENSSL_CONF", openssl_conf_zone: zone, openssl_conf_verdict: "chemin_refuse" });
    expect(fs.appels).toEqual([]);
  });

  it.each<[string, EnvSortie]>([
    ["VERCEL absente", { ...RUNTIME, VERCEL: undefined }],
    ["VERCEL vide", { ...RUNTIME, VERCEL: "" }],
    ["VERCEL=0", { ...RUNTIME, VERCEL: "0" }],
    ["VERCEL=true", { ...RUNTIME, VERCEL: "true" }],
    ["VERCEL « 1 » avec espace", { ...RUNTIME, VERCEL: "1 " }],
    ["VERCEL_ENV development", { ...RUNTIME, VERCEL_ENV: "development" }],
  ])("%s : refus, verdict hors_preview, zone rendue, aucune lecture", (_nom, env) => {
    const fs = FS_SANS_NODE();
    expect(verifierSortie(env, [], undefined, fs)).toEqual({ ok: false, code: "tls_env_refused" });
    expect(diagnostiquer(env, [], fs)).toEqual({ cause: "OPENSSL_CONF", openssl_conf_zone: "etc", openssl_conf_verdict: "hors_preview" });
    expect(fs.appels).toEqual([]);
  });

  it("l'env injecté ne peut pas ouvrir l'exception (D21) : VERCEL ou VERCEL_ENV du vrai process.env", () => {
    const variantes = [
      () => vi.stubEnv("VERCEL", undefined),
      () => vi.stubEnv("VERCEL", "0"),
      () => vi.stubEnv("VERCEL_ENV", "development"),
    ];
    for (const poserVariante of variantes) {
      poserRuntime();
      poserVariante();
      const fs = FS_SANS_NODE();
      expect(verifierSortie(RUNTIME, [], undefined, fs)).toEqual({ ok: false, code: "tls_env_refused" });
      expect(diagnostiquer(RUNTIME, [], fs)?.openssl_conf_verdict).toBe("hors_preview");
      expect(fs.appels).toEqual([]);
    }
  });

  it("vrai process.env différent de l'env injecté : refus, verdict env_differente, aucune lecture", () => {
    for (const reel of [undefined, "", "/etc/ssl/autre.cnf", `${CONF} `]) {
      vi.stubEnv("OPENSSL_CONF", reel);
      const fs = FS_SANS_NODE();
      expect(verifierSortie(RUNTIME, [], undefined, fs)).toEqual({ ok: false, code: "tls_env_refused" });
      expect(diagnostiquer(RUNTIME, [], fs)).toEqual({ cause: "OPENSSL_CONF", openssl_conf_zone: "etc", openssl_conf_verdict: "env_differente" });
      expect(fs.appels).toEqual([]);
    }
  });

  it("proxy posé : ni lecture du fichier, ni champs openssl_conf_*", () => {
    const fs = FS_SANS_NODE();
    const env = { ...RUNTIME, HTTPS_PROXY: "http://p" };
    expect(verifierSortie(env, [], undefined, fs)).toEqual({ ok: false, code: "proxy_env_refused" });
    expect(diagnostiquer(env, [], fs)).toEqual({ cause: "HTTPS_PROXY" });
    expect(diagnostiquer({ ...RUNTIME, NODE_OPTIONS: "--use-env-proxy" }, [], fs)).toEqual({ cause: "--use-env-proxy" });
    expect(fs.appels).toEqual([]);
  });

  it("l'exception ne masque ni la production, ni une autre variable TLS, ni une option TLS", () => {
    expect(verifierSortie({ ...RUNTIME, VERCEL_ENV: "production" }, [], undefined, FS_SANS_NODE())).toEqual({ ok: false, code: "production_refused" });
    for (const nom of ["NODE_TLS_REJECT_UNAUTHORIZED", "NODE_EXTRA_CA_CERTS", "SSL_CERT_FILE", "SSL_CERT_DIR", "SSLKEYLOGFILE"]) {
      const env = { ...RUNTIME, [nom]: "/etc/x" };
      expect(verifierSortie(env, [], undefined, FS_SANS_NODE())).toEqual({ ok: false, code: "tls_env_refused" });
      expect(diagnostiquer(env, [], FS_SANS_NODE())).toEqual({
        cause: nom,
        exception: "vercel_runtime_openssl_conf",
        openssl_conf_zone: "etc",
        openssl_conf_verdict: "admis",
      });
    }
    for (const option of ["--openssl-shared-config", "--openssl-config=/etc/x", "--no-openssl-shared-config"]) {
      expect(verifierSortie({ ...RUNTIME, NODE_OPTIONS: option }, [], undefined, FS_SANS_NODE())).toEqual({ ok: false, code: "tls_env_refused" });
      expect(verifierSortie(RUNTIME, [option], undefined, FS_SANS_NODE())).toEqual({ ok: false, code: "tls_env_refused" });
    }
  });

  it("NODE_EXTRA_CA_CERTS=/var/runtime/ca-cert.pem (exception de 0058 § 4, retirée) : refusé", () => {
    const env: EnvSortie = { VERCEL_ENV: "preview", VERCEL: "1", NODE_EXTRA_CA_CERTS: "/var/runtime/ca-cert.pem" };
    expect(verifierSortie(env, [], undefined, FS_SANS_NODE())).toEqual({ ok: false, code: "tls_env_refused" });
    expect(diagnostiquer(env)).toEqual({ cause: "NODE_EXTRA_CA_CERTS" });
  });

  it("le diagnostic ne contient jamais la valeur du chemin ni le contenu du fichier", () => {
    const chemin = "/etc/SENTINELLE-CHEMIN.cnf";
    poserRuntime(chemin);
    const env = { ...RUNTIME, OPENSSL_CONF: chemin };
    for (const contenu of ["# SENTINELLE-CONTENU\n", "nodejs_conf = SENTINELLE-CONTENU\n", ".include /etc/SENTINELLE-INCLUS.cnf\n"]) {
      const diagnostic = diagnostiquer(env, [], fauxFs({ [chemin]: contenu }));
      expect(JSON.stringify(diagnostic)).not.toContain("SENTINELLE");
    }
    poserRuntime("/tmp/SENTINELLE.cnf");
    expect(JSON.stringify(diagnostiquer({ ...RUNTIME, OPENSSL_CONF: "/tmp/SENTINELLE.cnf" }))).not.toContain("SENTINELLE");
  });
});

describe("p0: diagnostic de la barrière, des noms seulement (décisions 0058 et 0062)", () => {
  it("chaque nom de la liste fermée, posé seul, est rendu tel quel et sans sa valeur", () => {
    for (const nom of CAUSES_SORTIE) {
      const env: EnvSortie = nom.startsWith("--") ? { ...PREVIEW, NODE_OPTIONS: `${nom}=/SENTINELLE` } : { ...PREVIEW, [nom]: "/SENTINELLE" };
      const diagnostic = diagnostiquer(env);
      const attendu = nom === "OPENSSL_CONF" ? { cause: nom, openssl_conf_zone: "autre", openssl_conf_verdict: "hors_preview" } : { cause: nom };
      expect(diagnostic).toEqual(attendu);
      expect(JSON.stringify(diagnostic)).not.toContain("SENTINELLE");
    }
  });
  it("listes fermées de l'exception, des classes de racine et des verdicts", () => {
    expect(EXCEPTIONS_SORTIE).toEqual(["vercel_runtime_openssl_conf"]);
    expect(ZONES_SORTIE).toHaveLength(7);
    expect(VERDICTS_SORTIE).toHaveLength(7);
  });
  it("une option est nommée par son nom canonique", () => {
    expect(diagnostiquer({ ...PREVIEW, NODE_OPTIONS: "--tls_keylog=/SENTINELLE" })).toEqual({ cause: "--tls-keylog" });
    expect(diagnostiquer(PREVIEW, ["--no-use-system-ca"])).toEqual({ cause: "--use-system-ca" });
  });
  it("sortie ouverte : diagnostic vide ; production refusée : aucun diagnostic", () => {
    expect(diagnostiquer(PREVIEW)).toEqual({});
    expect(diagnostiquer({ VERCEL_ENV: "production", SSL_CERT_FILE: "/x" })).toBeUndefined();
  });
  it("le proxy l'emporte sur le TLS, comme le code", () => {
    expect(diagnostiquer({ ...PREVIEW, https_proxy: "http://p", SSL_CERT_FILE: "/x" })).toEqual({ cause: "https_proxy" });
  });
});
