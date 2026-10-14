// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { RateLimitConfig } from "@/server/config/limites";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { errorNameOf, formatLogLine, LOG_EVENTS, logEvent } from "@/server/log";
import { createRateLimiter, type RateLimitClient, type RateLimitPool, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";

/**
 * Limiteur et journal sans base (spécification B3, critères A1 « limiteur sans secret », A3 (événement), A8, A9 et
 * A14 ; décisions 0050, B3-TL-6 et B3-TL-7, et 0051, points 4.5, 6.1 et 6.2.2). La base est remplacée par un pool
 * simulé qui enregistre les requêtes ; les tests de base réels sont sous `tests/db/limiteur.test.ts`.
 */

const SENTINELLE = `sentinelle${randomBytes(8).toString("hex")}`;
const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
const secret = () => randomBytes(32).toString("base64url");
const ENV_CI = () => ({ VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: secret() });

const email = (adresse: string): CanonicalEmail => {
  const lu = parseEmailAddress(adresse);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};

const CONFIG: RateLimitConfig = {
  "essai-ip": [{ kind: "ip", windowSeconds: 600, threshold: 3 }],
  "essai-mixte": [
    { kind: "ip", windowSeconds: 600, threshold: 3 },
    { kind: "email", windowSeconds: 3600, threshold: 5 },
  ],
};

type Requete = { text: string; values?: unknown[] };

/** Pool simulé : compteurs en mémoire par clé (premier paramètre de l'incrément), estimation de lignes réglable. */
function poolSimule(options: { lignes?: number; echec?: (texte: string) => Error | undefined } = {}) {
  const requetes: Requete[] = [];
  const compteurs = new Map<string, number>();
  const liberations: unknown[] = [];
  const client: RateLimitClient = {
    async query(text, values) {
      requetes.push({ text, values });
      const erreur = options.echec?.(text);
      if (erreur) throw erreur;
      if (text.startsWith("INSERT INTO action_rate_limits")) {
        const cle = String(values?.[0]);
        const compte = (compteurs.get(cle) ?? 0) + 1;
        compteurs.set(cle, compte);
        return { rows: [{ count: compte }] };
      }
      if (text.includes("reltuples")) return { rows: [{ n: options.lignes ?? -1 }] };
      return { rows: [] };
    },
    release(error) {
      liberations.push(error);
    },
  };
  const pool: RateLimitPool = { connect: async () => client };
  const increments = () => requetes.filter((r) => r.text.startsWith("INSERT INTO action_rate_limits"));
  return { pool, requetes, compteurs, liberations, increments };
}

/** Sortie du journal capturée (`console.log` et `console.error`). */
function capturerJournal() {
  const lignes: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
  return { lignes, evenements: () => lignes.map((ligne) => JSON.parse(ligne) as Record<string, unknown>) };
}

const entetes = (valeurs: Record<string, string> = {}) => new Headers(valeurs);
const REFUS = { ok: false, error: { code: "rate_limited", retryable: true } };

afterEach(() => {
  vi.restoreAllMocks();
});

describe("limiteur (sans base)", () => {
  it("admet jusqu'au seuil, refuse au-delà (rate_limited, retryable) ; clé HMAC hexadécimale de 64 caractères", async () => {
    const { pool, increments } = poolSimule();
    capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
    const requete = { action: "essai-ip", headers: entetes({ "x-vercel-forwarded-for": "192.0.2.7" }) };
    for (let i = 0; i < 3; i += 1) expect(await limiteur.check(requete)).toEqual({ ok: true, value: undefined });
    expect(await limiteur.check(requete)).toEqual(REFUS);
    for (const r of increments()) expect(String(r.values?.[0])).toMatch(/^[0-9a-f]{64}$/);
  });

  it("clé : HMAC-SHA-256 du message rl/v1/<action>/<fenêtre>s/<espèce>", () => {
    const octets = randomBytes(32);
    expect(rateLimitMessage("request-code", 600, "ip/192.0.2.7")).toBe("rl/v1/request-code/600s/ip/192.0.2.7");
    expect(rateLimitKey(octets, "a")).toMatch(/^[0-9a-f]{64}$/);
    expect(rateLimitKey(octets, "a")).not.toBe(rateLimitKey(randomBytes(32), "a"));
    expect(rateLimitKey(octets, rateLimitMessage("a", 600, "ip/x"))).not.toBe(rateLimitKey(octets, rateLimitMessage("a", 3600, "ip/x")));
  });

  it("l'incrément s'arrête à la première clé au-dessus de son seuil : la clé e-mail n'est pas touchée", async () => {
    const { pool, increments } = poolSimule();
    capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
    const requete = { action: "essai-mixte", headers: entetes({ "x-vercel-forwarded-for": "192.0.2.7" }), email: email("a@exemple.test") };
    for (let i = 0; i < 3; i += 1) expect((await limiteur.check(requete)).ok).toBe(true);
    expect(increments()).toHaveLength(6);
    expect(await limiteur.check(requete)).toEqual(REFUS);
    expect(increments()).toHaveLength(7);
    const cleEmail = increments()[1]?.values?.[0];
    expect(increments().filter((r) => r.values?.[0] === cleEmail)).toHaveLength(3);
  });

  it("incrément et purge dans deux transactions distinctes, sous le rôle vadrouille_limiter, purge par lot de 100", async () => {
    const { pool, requetes } = poolSimule();
    capturerJournal();
    await createRateLimiter({ config: CONFIG, env: ENV_CI(), pool }).check({ action: "essai-ip", headers: entetes() });
    const textes = requetes.map((r) => r.text.split(/\s/)[0]);
    expect(textes).toEqual(["BEGIN", "SET", "INSERT", "COMMIT", "BEGIN", "SET", "DELETE", "SELECT", "COMMIT"]);
    expect(requetes.filter((r) => r.text === "SET LOCAL ROLE vadrouille_limiter")).toHaveLength(2);
    expect(requetes.find((r) => r.text.startsWith("DELETE"))?.values).toEqual([100]);
  });

  it("limiteur sans secret : refus rate_limited, événement config_missing qui nomme la variable", async () => {
    const { pool, requetes } = poolSimule();
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: { VADROUILLE_ENV: "ci" }, pool });
    expect(await limiteur.check({ action: "essai-ip", headers: entetes() })).toEqual(REFUS);
    expect(requetes).toEqual([]);
    expect(journal.evenements()).toEqual([{ level: "error", event: "config_missing", action: "essai-ip", variable: HMAC }]);
  });

  it("staging sans en-tête de confiance : refus, config_missing de TRUSTED_IP_HEADER", async () => {
    const { pool } = poolSimule();
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: { VERCEL_ENV: "preview", VERCEL: "1", [HMAC]: secret() }, pool });
    expect(await limiteur.check({ action: "essai-ip", headers: entetes() })).toEqual(REFUS);
    expect(journal.evenements()).toEqual([{ level: "error", event: "config_missing", action: "essai-ip", variable: "TRUSTED_IP_HEADER" }]);
  });

  it("configuration invalide : refus, config_invalid sans valeur", async () => {
    const { pool } = poolSimule();
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: { VADROUILLE_ENV: "ci", [HMAC]: `${SENTINELLE}!` }, pool });
    expect(await limiteur.check({ action: "essai-ip", headers: entetes() })).toEqual(REFUS);
    expect(journal.evenements()).toEqual([{ level: "error", event: "config_invalid", action: "essai-ip", variable: HMAC, rule: "secret_encoding" }]);
    expect(journal.lignes.join("\n")).not.toContain(SENTINELLE);
  });

  it("action inconnue → refus", async () => {
    const { pool, requetes } = poolSimule();
    capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
    for (const action of ["inconnue", "constructor", "__proto__", "Essai-IP"]) expect(await limiteur.check({ action, headers: entetes() })).toEqual(REFUS);
    expect(requetes).toEqual([]);
  });

  it("adresse e-mail non canonique ou absente pour une règle e-mail → refus, sans écriture ni valeur journalisée", async () => {
    const { pool, requetes } = poolSimule();
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
    const brute = `A${SENTINELLE}@Exemple.test` as never;
    expect(await limiteur.check({ action: "essai-mixte", headers: entetes(), email: brute })).toEqual(REFUS);
    expect(await limiteur.check({ action: "essai-mixte", headers: entetes() })).toEqual(REFUS);
    expect(requetes).toEqual([]);
    expect(journal.lignes.join("\n")).not.toContain(SENTINELLE);
  });

  it("compartiment commun observable : rate_limit.no_trusted_ip avec le nom d'action, sans valeur d'en-tête", async () => {
    const { pool, increments } = poolSimule();
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
    const valeurs = ["203.0.113.9", `for=${SENTINELLE}`, "198.51.100.4"];
    for (const v of valeurs) {
      await limiteur.check({ action: "essai-ip", headers: entetes({ "x-forwarded-for": v, "x-real-ip": v, forwarded: v }) });
    }
    expect(journal.evenements()).toEqual(valeurs.map(() => ({ level: "warn", event: "rate_limit.no_trusted_ip", action: "essai-ip" })));
    for (const v of valeurs) expect(journal.lignes.join("\n")).not.toContain(v);
    // Une seule clé : celle du compartiment commun.
    expect(new Set(increments().map((r) => r.values?.[0])).size).toBe(1);
  });

  it.each(["192.0.2.7:443", "[2001:db8::1]", "[2001:db8::1]:443", "fe80::1%eth0", "", "inconnu", "192.0.2.07"])(
    "en-tête de confiance %j non analysable → compartiment commun et rate_limit.no_trusted_ip",
    async (valeur) => {
      const { pool, increments } = poolSimule();
      const journal = capturerJournal();
      const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool });
      await limiteur.check({ action: "essai-ip", headers: entetes({ "x-vercel-forwarded-for": valeur }) });
      await limiteur.check({ action: "essai-ip", headers: entetes() });
      expect(journal.evenements().map((e) => e.event)).toEqual(["rate_limit.no_trusted_ip", "rate_limit.no_trusted_ip"]);
      expect(new Set(increments().map((r) => r.values?.[0])).size).toBe(1);
    },
  );

  it("alerte rate_limit.rows_high au-delà du plafond, au plus une fois par 10 minutes ; estimation inconnue (-1) → aucune", async () => {
    const haut = poolSimule({ lignes: 12 });
    const journal = capturerJournal();
    const limiteur = createRateLimiter({ config: CONFIG, env: ENV_CI(), pool: haut.pool, rowsAlert: 10 });
    const requete = { action: "essai-ip", headers: entetes({ "x-vercel-forwarded-for": "192.0.2.7" }) };
    await limiteur.check(requete);
    await limiteur.check(requete);
    expect(journal.evenements()).toEqual([{ level: "warn", event: "rate_limit.rows_high", rows: 12 }]);
    const inconnue = poolSimule({ lignes: -1 });
    await createRateLimiter({ config: CONFIG, env: ENV_CI(), pool: inconnue.pool, rowsAlert: 0 }).check(requete);
    expect(journal.evenements()).toHaveLength(1);
  });
});

describe("limitation: échec fermé si la base est indisponible", () => {
  const requete = () => ({ action: "essai-mixte", headers: entetes({ "x-vercel-forwarded-for": "192.0.2.7" }), email: email("a@exemple.test") });

  it("base injoignable → refus rate_limited, retryable, sans exception ni message de base", async () => {
    const journal = capturerJournal();
    const pool: RateLimitPool = {
      connect: () => Promise.reject(Object.assign(new Error(`connect ECONNREFUSED ${SENTINELLE}`), { name: "Error", code: "ECONNREFUSED" })),
    };
    const resultat = await createRateLimiter({ config: CONFIG, env: ENV_CI(), pool }).check(requete());
    expect(resultat).toEqual(REFUS);
    expect(JSON.stringify(resultat)).not.toContain(SENTINELLE);
    expect(journal.evenements()).toEqual([{ level: "error", event: "rate_limit.failed", action: "essai-mixte", errorName: "Error" }]);
    expect(journal.lignes.join("\n")).not.toContain(SENTINELLE);
  });

  it("erreur SQL pendant l'incrément → ROLLBACK, client libéré avec l'erreur, refus", async () => {
    const journal = capturerJournal();
    const erreur = Object.assign(new Error(`duplicate key a@exemple.test ${SENTINELLE}`), { name: "DatabaseError" });
    const { pool, requetes, liberations } = poolSimule({ echec: (texte) => (texte.startsWith("INSERT") ? erreur : undefined) });
    expect(await createRateLimiter({ config: CONFIG, env: ENV_CI(), pool }).check(requete())).toEqual(REFUS);
    expect(requetes.map((r) => r.text.split(/\s/)[0])).toEqual(["BEGIN", "SET", "INSERT", "ROLLBACK"]);
    expect(liberations).toEqual([erreur]);
    expect(journal.evenements()).toEqual([{ level: "error", event: "rate_limit.failed", action: "essai-mixte", errorName: "DatabaseError" }]);
    expect(journal.lignes.join("\n")).not.toMatch(new RegExp(`${SENTINELLE}|exemple\\.test`));
  });

  it("échec de la purge → incrément compté et décision rendue, rate_limit.purge_failed", async () => {
    const journal = capturerJournal();
    const { pool, compteurs } = poolSimule({ echec: (texte) => (texte.startsWith("DELETE") ? new Error(SENTINELLE) : undefined) });
    expect((await createRateLimiter({ config: CONFIG, env: ENV_CI(), pool }).check(requete())).ok).toBe(true);
    expect([...compteurs.values()]).toEqual([1, 1]);
    expect(journal.evenements()).toEqual([{ level: "warn", event: "rate_limit.purge_failed", errorName: "Error" }]);
    const crochet = poolSimule();
    const resultat = await createRateLimiter({
      config: CONFIG,
      env: ENV_CI(),
      pool: crochet.pool,
      beforePurge: () => {
        throw new TypeError(SENTINELLE);
      },
    }).check(requete());
    expect(resultat.ok).toBe(true);
    expect(crochet.requetes.some((r) => r.text.startsWith("DELETE"))).toBe(false);
    expect(journal.evenements().at(-1)).toEqual({ level: "warn", event: "rate_limit.purge_failed", errorName: "TypeError" });
    expect(journal.lignes.join("\n")).not.toContain(SENTINELLE);
  });
});

describe("module de journal", () => {
  it("journaux: aucun email ni code dans les journaux", () => {
    const journal = capturerJournal();
    const valeurs = ["a@exemple.test", "123456", `jeton-${SENTINELLE}`, "192.0.2.7", "2001:db8::1", "Mozilla/5.0 (X11; Linux x86_64)", secret()];
    const erreur = new Error("échec pour a@exemple.test");
    logEvent("config_invalid", {
      email: valeurs[0],
      code: valeurs[1],
      token: valeurs[2],
      ip: valeurs[3],
      action: valeurs[4],
      userAgent: valeurs[5],
      variable: valeurs[6],
      rule: valeurs[0],
      environment: valeurs[3],
      errorName: erreur.message,
      error: erreur,
      message: erreur.message,
      stack: erreur.stack,
    } as never);
    logEvent("rate_limit.failed", { errorName: errorNameOf(erreur) }, "error");
    const sortie = journal.lignes.join("\n");
    for (const v of valeurs) expect(sortie).not.toContain(v);
    expect(sortie).not.toContain("exemple.test");
    expect(journal.evenements()).toEqual([
      { level: "info", event: "config_invalid", dropped: 13 },
      { level: "error", event: "rate_limit.failed", errorName: "Error" },
    ]);
  });

  it("nom d'événement contrôlé à l'exécution : un nom inconnu devient log.unknown_event, sans le nom reçu", () => {
    const journal = capturerJournal();
    logEvent(`a@exemple.test ${SENTINELLE}` as never);
    expect(journal.evenements()).toEqual([{ level: "info", event: "log.unknown_event" }]);
    expect(journal.lignes.join("\n")).not.toContain(SENTINELLE);
    expect(formatLogLine("constructor")).toBe('{"level":"info","event":"log.unknown_event"}');
  });

  it("champs admis : motif de chaque champ, entiers sûrs positifs pour durationMs et rows", () => {
    const ligne = (champs: object) => JSON.parse(formatLogLine("rate_limit.rows_high", champs, "warn")) as Record<string, unknown>;
    expect(ligne({ rows: 12, durationMs: 0, code: "rate_limited", action: "request-code", environment: "ci", variable: "TRUSTED_IP_HEADER", rule: "missing", errorName: "TypeError" })).toEqual({
      level: "warn",
      event: "rate_limit.rows_high",
      rows: 12,
      durationMs: 0,
      code: "rate_limited",
      action: "request-code",
      environment: "ci",
      variable: "TRUSTED_IP_HEADER",
      rule: "missing",
      errorName: "TypeError",
    });
    expect(ligne({ rows: -1, durationMs: 1.5 })).toEqual({ level: "warn", event: "rate_limit.rows_high", dropped: 2 });
    expect(ligne({ rows: Number.MAX_SAFE_INTEGER + 2, durationMs: "3" })).toEqual({ level: "warn", event: "rate_limit.rows_high", dropped: 2 });
    expect(ligne({ code: "inconnu", action: "Request Code", environment: "prod", variable: "PATH", rule: "autre", errorName: "Type Error" })).toEqual({
      level: "warn",
      event: "rate_limit.rows_high",
      dropped: 6,
    });
  });

  it("errorNameOf ne lit que error.name, jamais message, code ni cause", () => {
    expect(errorNameOf(new TypeError(SENTINELLE))).toBe("TypeError");
    expect(errorNameOf({ name: `a@exemple.test`, message: SENTINELLE })).toBeUndefined();
    expect(errorNameOf("Error")).toBeUndefined();
    expect(errorNameOf(null)).toBeUndefined();
    const piege = Object.defineProperty({}, "name", {
      get() {
        throw new Error(SENTINELLE);
      },
    });
    expect(errorNameOf(piege)).toBeUndefined();
  });

  it("la liste des événements est fermée", () => {
    expect([...LOG_EVENTS]).toEqual([
      "config_missing",
      "config_invalid",
      "rate_limit.no_trusted_ip",
      "rate_limit.purge_failed",
      "rate_limit.rows_high",
      "rate_limit.failed",
      "log.unknown_event",
    ]);
  });
});
