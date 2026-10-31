// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { FINS_MODELE, MAX_TOKENS } from "@/ai/client";
import { RATE_LIMITS, type RateLimitConfig } from "@/server/config/limites";
import { type CanonicalEmail, parseEmailAddress } from "@/server/email";
import { errorNameOf, formatLogLine, LOG_EVENTS, LOG_LIEU_REASONS, LOG_VILLE_API_REASONS, LOG_FICHES_REASONS, LOG_FINISH_REASONS, LOG_POSITIONS_REASONS, LOG_PROVIDER_ERROR_CLASSES, LOG_READ_REASONS, logEvent, MAX_JETONS_JOURNAL } from "@/server/log";
import { NIVEAUX_VILLE_API } from "@/server/composition/villes-api";
import { createRateLimiter, type RateLimitClient, type RateLimitPool, rateLimitKey, rateLimitMessage, reglesOrdonnees } from "@/server/rate-limit";

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

// Décision 0141 § 10, T22 : nom du `describe` et du test exigés par la décision.
describe("journal: ville.refusee", () => {
  it("motifs fermés, googleCode et httpStatus admis ; saisie, placeId et adresse retirés ; niveaux info et warn du § 6.3 point 4", () => {
    expect([...LOG_VILLE_API_REASONS]).toEqual([
      "entree_invalide",
      "seuils_non_valides",
      "barriere",
      "client",
      "limite",
      "limite_jour",
      "compteur_indisponible",
      "google_erreur",
      "pays_inconnu",
      "hors_table",
      "exception",
    ]);
    for (const reason of LOG_VILLE_API_REASONS) {
      expect(JSON.parse(formatLogLine("ville.refusee", { reason, action: "choix" }, "info")), reason).toEqual({ level: "info", event: "ville.refusee", reason, action: "choix" });
    }
    const ligne = formatLogLine(
      "ville.refusee",
      {
        reason: "google_erreur",
        action: "suggestions",
        googleCode: "upstream_error",
        httpStatus: 403,
        errorName: "ErreurClientGoogle",
        saisie: "SENTINELLE-SAISIE",
        placeId: "SENTINELLE-LIEU",
        ip: "203.0.113.7",
        key: "SENTINELLE-CLE",
        guard: "production",
      },
      "warn",
    );
    expect(JSON.parse(ligne)).toEqual({
      level: "warn",
      event: "ville.refusee",
      reason: "google_erreur",
      action: "suggestions",
      googleCode: "upstream_error",
      httpStatus: 403,
      errorName: "ErreurClientGoogle",
      dropped: 5,
    });
    expect(ligne).not.toMatch(/SENTINELLE|203\.0\.113/);
    // Motifs du site d'essai refusés sur `api`, et inversement ; codes hors liste retirés.
    for (const reason of ["garde", "acces", "prix", "reservation", "usage_unavailable", "SENTINELLE"]) {
      expect(JSON.parse(formatLogLine("ville.refusee", { reason }))).toEqual({ level: "info", event: "ville.refusee", dropped: 1 });
    }
    expect(JSON.parse(formatLogLine("p0.ville_refusee", { reason: "hors_table" }))).toEqual({ level: "info", event: "p0.ville_refusee", dropped: 1 });
    expect(JSON.parse(formatLogLine("ville.refusee", { googleCode: "SENTINELLE", httpStatus: 42 }))).toEqual({ level: "info", event: "ville.refusee", dropped: 2 });
    // Purge en échec : `errorName` seul.
    expect(JSON.parse(formatLogLine("ville.purge_failed", { errorName: "Error", reason: "barriere", rows: 3 }, "warn"))).toEqual({
      level: "warn",
      event: "ville.purge_failed",
      errorName: "Error",
      dropped: 2,
    });
    // Niveaux du § 6.3 point 4 : écrits par le terminal de api (`tests/unit/composition/villes-api.test.ts`), une seule table.
    expect(NIVEAUX_VILLE_API).toEqual({
      info: ["entree_invalide", "seuils_non_valides", "barriere", "limite", "limite_jour", "pays_inconnu", "hors_table"],
      warn: ["client", "compteur_indisponible", "google_erreur", "exception"],
    });
    expect([...NIVEAUX_VILLE_API.info, ...NIVEAUX_VILLE_API.warn].sort()).toEqual([...LOG_VILLE_API_REASONS].sort());
  });

  // Verdict 0122 § 2.1 point 4 : aucun compteur par motif, aucune adresse ni aucun statut sur la ligne des sites.
});

describe("limiteur: configuration", () => {
  it("ville-recherche : une règle ip, 60 s, 20", () => {
    // Recherche de ville de l'écran 1 de `api` (décision 0141 § 4.1, T19 ; PR 885) : suggestions et choix confondus.
    expect(RATE_LIMITS["ville-recherche"]).toEqual([{ kind: "ip", windowSeconds: 60, threshold: 20 }]);
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

  it("ticket 407 : deadlineStop, entier positif ou nul, admis sur p0.research_done ; toute autre valeur retirée", () => {
    const ligne = (champs: object) => JSON.parse(formatLogLine("p0.research_done", champs, "warn")) as Record<string, unknown>;
    expect(ligne({ deadlineStop: 1, errorName: "ErreurOpenRouter" })).toEqual({ level: "warn", event: "p0.research_done", deadlineStop: 1, errorName: "ErreurOpenRouter" });
    expect(ligne({ deadlineStop: 0 })).toEqual({ level: "warn", event: "p0.research_done", deadlineStop: 0 });
    expect(ligne({ deadlineStop: -1 })).toEqual({ level: "warn", event: "p0.research_done", dropped: 1 });
    expect(ligne({ deadlineStop: "1" })).toEqual({ level: "warn", event: "p0.research_done", dropped: 1 });
  });

  it.each(["sectors", "mustSees", "mustSeesWithoutCandidate", "candidatesGrouped", "sectorUnknown"])(
    "amendement 3 (P0S2-PO-25) : %s, entier positif ou nul, admis sur p0.research_done ; négatif, chaîne, non-entier ou nom retirés",
    (champ) => {
      const ligne = (valeur: unknown) => JSON.parse(formatLogLine("p0.research_done", { [champ]: valeur }, "info")) as Record<string, unknown>;
      expect(ligne(0)).toEqual({ level: "info", event: "p0.research_done", [champ]: 0 });
      expect(ligne(6)).toEqual({ level: "info", event: "p0.research_done", [champ]: 6 });
      for (const refusee of [-1, 1.5, "3", "La Rome antique", null, Number.NaN]) {
        expect(ligne(refusee), String(refusee)).toEqual({ level: "info", event: "p0.research_done", dropped: 1 });
      }
    },
  );

  it.each(["fieldsRemoved", "textsCut"])("ticket 595 : %s, entier positif ou nul, admis sur p0.research_done ; négatif, chaîne, non-entier ou texte retirés", (champ) => {
    const ligne = (valeur: unknown) => JSON.parse(formatLogLine("p0.research_done", { [champ]: valeur }, "info")) as Record<string, unknown>;
    expect(ligne(0)).toEqual({ level: "info", event: "p0.research_done", [champ]: 0 });
    expect(ligne(7)).toEqual({ level: "info", event: "p0.research_done", [champ]: 7 });
    for (const refusee of [-1, 1.5, "3", "horaires", null, Number.NaN]) {
      expect(ligne(refusee), String(refusee)).toEqual({ level: "info", event: "p0.research_done", dropped: 1 });
    }
  });

  // Décision 0116 § 4.4 et verdict 0117 § 4 : compteurs maison de `p0.programme_written`, des entiers positifs ou nuls.
  // Lot 2a (décision 0121 § 2.3, verdict 0122 § 2.1) : `sites*`, même règle.
  // Décision 0130 § 2 : `inputTokens` et `outputTokens` de la rédaction, même règle (bornés en plus, test suivant).
  it.each(["days", "slots", "placesToVerify", "daysRemoved", "slotsRemoved", "modelCalls", "unverifiedForCap", "sitesProposed", "sitesChecked", "sitesRemoved", "sitesUnchecked", "inputTokens", "outputTokens"])(
    "décision 0116 : %s, entier positif ou nul, admis sur p0.programme_written ; négatif, chaîne, non-entier ou nom retirés",
    (champ) => {
      const ligne = (valeur: unknown) => JSON.parse(formatLogLine("p0.programme_written", { [champ]: valeur }, "info")) as Record<string, unknown>;
      expect(ligne(0)).toEqual({ level: "info", event: "p0.programme_written", [champ]: 0 });
      expect(ligne(12)).toEqual({ level: "info", event: "p0.programme_written", [champ]: 12 });
      for (const refusee of [-1, 1.5, "3", "Colisée", null, Number.NaN]) {
        expect(ligne(refusee), String(refusee)).toEqual({ level: "info", event: "p0.programme_written", dropped: 1 });
      }
    },
  );

  // Décision 0130 § 2 : jetons bornés par la même valeur que le client (`MAX_TOKENS`).
  it("journal: inputTokens et outputTokens au plus MAX_TOKENS ; au-delà, retirés", () => {
    expect(MAX_JETONS_JOURNAL).toBe(MAX_TOKENS);
    for (const champ of ["inputTokens", "outputTokens"]) {
      const ligne = (valeur: unknown) => JSON.parse(formatLogLine("p0.programme_written", { [champ]: valeur }, "warn")) as Record<string, unknown>;
      expect(ligne(MAX_TOKENS)).toEqual({ level: "warn", event: "p0.programme_written", [champ]: MAX_TOKENS });
      expect(ligne(MAX_TOKENS + 1)).toEqual({ level: "warn", event: "p0.programme_written", dropped: 1 });
    }
  });

  // Décision 0130 § 2 : raison de fin de la rédaction, liste fermée copiée de `FINS_MODELE`.
  it("journal: finishReason, liste fermée égale à FINS_MODELE ; toute autre valeur retirée", () => {
    expect([...LOG_FINISH_REASONS]).toEqual([...FINS_MODELE]);
    const ligne = (valeur: unknown) => JSON.parse(formatLogLine("p0.programme_written", { finishReason: valeur }, "warn")) as Record<string, unknown>;
    for (const fin of FINS_MODELE) expect(ligne(fin)).toEqual({ level: "warn", event: "p0.programme_written", finishReason: fin });
    for (const refusee of ["max_tokens", "LENGTH", "Colisée", "", 1, null]) {
      expect(ligne(refusee), String(refusee)).toEqual({ level: "warn", event: "p0.programme_written", dropped: 1 });
    }
  });

  // B4c (PR 863 ; décision 0140 § 1.2) : `errorClass`, liste fermée, admis sur `payment.provider_failed` seulement.
  it("journal: errorClass, liste fermée sur payment.provider_failed ; toute autre valeur, ou tout autre événement, retiré", () => {
    const ligne = (event: "payment.provider_failed" | "payment.alert", valeur: unknown) => JSON.parse(formatLogLine(event, { errorClass: valeur }, "warn")) as Record<string, unknown>;
    expect(LOG_PROVIDER_ERROR_CLASSES).toHaveLength(10);
    for (const classe of LOG_PROVIDER_ERROR_CLASSES) {
      expect(ligne("payment.provider_failed", classe)).toEqual({ level: "warn", event: "payment.provider_failed", errorClass: classe });
      expect(ligne("payment.alert", classe)).toEqual({ level: "warn", event: "payment.alert", dropped: 1 });
    }
    for (const refusee of ["StripeError", "stripeapierror", "Invalid API Key provided: sk_x", "", 1, null]) {
      expect(ligne("payment.provider_failed", refusee), String(refusee)).toEqual({ level: "warn", event: "payment.provider_failed", dropped: 1 });
    }
  });

  // Verdict 0117 § 4 : aucun compteur de verdict de vérification n'est admis par le journal.
  it("journal: aucun compteur de verdict (verifies, introuvables, fermes, horsZone retirés)", () => {
    const ligne = JSON.parse(
      formatLogLine("p0.programme_written", { days: 3, verified: 4, verifies: 4, introuvables: 1, notFound: 1, fermes: 1, closed: 1, horsZone: 1, outOfZone: 1 }, "info"),
    ) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "info", event: "p0.programme_written", days: 3, dropped: 8 });
  });

  // Constat du 2026-10-25 : `googleCode` et `httpStatus` admis sur `p0.ville_refusee` seulement, listes fermées.
  it("journal: p0.ville_refusee, motif, code Google et code HTTP fermés ; ailleurs retirés", () => {
    const ligne = JSON.parse(
      formatLogLine("p0.ville_refusee", { reason: "google_erreur", action: "suggestions", googleCode: "upstream_error", httpStatus: 403, saisie: "Tro" }, "warn"),
    ) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "warn", event: "p0.ville_refusee", reason: "google_erreur", action: "suggestions", googleCode: "upstream_error", httpStatus: 403, dropped: 1 });
    const refus = JSON.parse(formatLogLine("p0.ville_refusee", { reason: "Tro", googleCode: "SENTINELLE", httpStatus: 42 }, "warn")) as Record<string, unknown>;
    expect(refus).toEqual({ level: "warn", event: "p0.ville_refusee", dropped: 3 });
    const ailleurs = JSON.parse(formatLogLine("p0.step_failed", { googleCode: "upstream_error", httpStatus: 403, reason: "garde" }, "warn")) as Record<string, unknown>;
    expect(ailleurs).toEqual({ level: "warn", event: "p0.step_failed", dropped: 3 });
  });

  // Décision 0141 § 6.3 point 4 (T22, PR 885 ; Sécurité, mineur 6) : tables étendues pour `ville.refusee`.
  it("journal: sites sans motif, adresse, hôte ni statut (champs inconnus retirés)", () => {
    const ligne = JSON.parse(
      formatLogLine(
        "p0.programme_written",
        { sitesProposed: 3, sitesChecked: 2, sitesRemoved: 1, sitesUnchecked: 1, sitesBlocked: 1, sitesTimeout: 1, sitesRedirect: 1, httpStatus: 403, site: "https://lieu.example.org/", host: "lieu.example.org" },
        "info",
      ),
    ) as Record<string, unknown>;
    expect(ligne).toEqual({ level: "info", event: "p0.programme_written", sitesProposed: 3, sitesChecked: 2, sitesRemoved: 1, sitesUnchecked: 1, dropped: 6 });
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
      // P0r3b (décision 0055, section 1 points 2 et 3) : garde du mode réel fermée, code fermé seulement.
      "p0.guard_closed",
      // Ticket 400 : fin de la recherche de p0Run, compteurs de l'agent seulement (des nombres).
      "p0.research_done",
      // Décision 0116 § 4.4 et 0117 § 4 : fin de etapeProgramme, compteurs maison seulement (des nombres).
      "p0.programme_written",
      // Décision 0074 : branchement de la lecture des programmes réels impossible, nom d'erreur seulement.
      "p0.read_unavailable",
      // Décision 0124 § 2 : branchement du cookie de déblocage de l'essai impossible, nom d'erreur seulement.
      "essai.unlock_unavailable",
      // Décision 0125 § 2 : branchement de la création d'un voyage d'essai impossible, nom d'erreur seulement.
      "essai.creation_unavailable",
      "essai.photo_unavailable",
      // B3b : adresse refusée, envoi désactivé, journal de Better Auth, échec d'une opération ou de la purge (aucune valeur).
      "email.address_refused",
      "email.transport_disabled",
      // B3b-envoi : enveloppe refusée avant l'envoi (aucune valeur).
      "email.envelope_refused",
      // B3d (M2a) : envoi réel accepté, plafond du jour atteint, refus de Resend, refus avant le transport (codes fermés).
      "email.sent",
      "email.cap_reached",
      "email.provider_refused",
      "email.transport_refused",
      // B3d (revue de la PR 850, mineur 1) : purge du plafond global en échec, nom d'erreur seulement.
      "email.purge_failed",
      // M7a : e-mail « propositions prêtes » non envoyé (base, composition ou transport), nom d'erreur seulement.
      "email.notification_failed",
      "auth.library_log",
      "auth.operation_failed",
      "auth.purge_failed",
      "voyages.read_failed",
      "voyages.relecture_refused",
      "voyages.fiches_non_relues",
      "voyages.positions_non_ecrites",
      "voyages.action_failed",
      // Ticket 493 : arrêt d'une étape de p0Run, phase, classe et code fermés seulement (verdict Sécurité S4 attendu).
      "p0.step_failed",
      "p0.ville_refusee",
      // M1f (décision 0141 § 6.3 point 4, PR 885) : recherche de ville de api, refus et purge des compteurs en échec.
      "ville.refusee",
      "ville.purge_failed",
      // B4a (décision 0097 B4-TL-11 point 1 et B4-TL-13 point 4) : alertes de paiement, échec de la suite, webhook fermé
      // par une configuration invalide (identifiants internes et codes fermés seulement).
      "payment.alert",
      "payment.followup_failed",
      "payment.webhook_config_invalid",
      // B4c (PR 863 ; décision 0140 § 1.2) : échec d'un appel au prestataire Stripe, classe d'erreur de la liste fermée seulement.
      "payment.provider_failed",
      // B9d (décision 0087 § 1.4) : voyage complet bloqué, identifiants internes et code fermé seulement.
      "generation.full_stuck",
      // M1a-2 (décision 0136 § 2 ; verdict 0139 § 2, attente étendue, Q649) : fin de l'étape e de generateProgramme,
      // compteurs maison en liste fermée par événement, aucun identifiant.
      "generation.programme_written",
      // B10b (décision 0119 § 1.3 ; verdict 0120 S1 point 1 et S7) : recalcul d'un tri, identifiants internes, nom d'erreur et
      // nombre de jours touchés seulement.
      "recalcul.not_created",
      "recalcul.start_failed",
      "recalcul.unlock_failed",
      "voyages.stop_reported",
      // M5d-1 (décision 0147 § 3 et § 14, ticket 939) : recherche d'un lieu à soi, raison fermée, nombre de résultats,
      // code Google et statut HTTP seulement (aucun texte saisi, aucun nom, aucun identifiant de lieu).
      "lieu.recherche",
      // M5d-4 (décision 0155 § 2.4) : lieux à soi réinjectés par la révision M1b, deux compteurs seulement.
      "recalcul.lieux_a_soi",
      "calendrier.version_unavailable",
      "log.unknown_event",
    ]);
  });

  describe("raison fermée par événement (B6a, B8b)", () => {
    const READ = ["time_zone_missing", "snapshot_invalid", "checklist_orphan", "proposal_invalid", "proposal_day_missing", "stay_missing", "mobility_invalid", "travel_unknown", "output_invalid", "quota_reached", "unavailable"];
    const FICHES = ["cap_reached", "quota_reached", "unavailable"];
    const POSITIONS = ["perimees", "base", "exception"];
    const admises = (evenement: string, reason: string) => JSON.parse(formatLogLine(evenement, { reason })) as { reason?: string; dropped?: number };

    it("les trois listes sont fixées", () => {
      expect([...LOG_READ_REASONS]).toEqual(READ);
      expect([...LOG_FICHES_REASONS]).toEqual(FICHES);
      expect([...LOG_POSITIONS_REASONS]).toEqual(POSITIONS);
    });

    it.each([
      ["voyages.read_failed", READ, [...FICHES, ...POSITIONS].filter((r) => !READ.includes(r))],
      ["voyages.relecture_refused", READ, [...FICHES, ...POSITIONS].filter((r) => !READ.includes(r))],
      ["voyages.fiches_non_relues", FICHES, [...READ, ...POSITIONS].filter((r) => !FICHES.includes(r))],
      ["voyages.positions_non_ecrites", POSITIONS, [...READ, ...FICHES]],
    ])("%s : seules ses raisons passent, celles d'un autre événement sont retirées", (evenement, siennes, autres) => {
      for (const reason of siennes) expect(admises(evenement, reason), reason).toEqual({ level: "info", event: evenement, reason });
      for (const reason of autres) expect(admises(evenement, reason), reason).toEqual({ level: "info", event: evenement, dropped: 1 });
      expect(admises(evenement, "SENTINELLE").dropped).toBe(1);
    });

    it("un événement sans raison admise retire `reason`", () => {
      expect(admises("p0.research_done", "unavailable").dropped).toBe(1);
    });

    it("voyages.positions_non_ecrites : ni identifiant ni valeur ne passent, seule la raison est conservée", () => {
      const ligneBrute = formatLogLine("voyages.positions_non_ecrites", { reason: "base", placeId: "SENTINELLE-LIEU", lat: 55.9, message: "SENTINELLE-MESSAGE" }, "warn");
      expect(JSON.parse(ligneBrute)).toEqual({ level: "warn", event: "voyages.positions_non_ecrites", reason: "base", dropped: 3 });
      expect(ligneBrute).not.toContain("SENTINELLE");
    });
  });
});

describe("limiteur: espèce trip (M5d-1, ticket 939 ; décision 0147 § 6.4 point 1)", () => {
  const TRIP = "0D000000-0000-4000-8000-0000000000AA";
  const CONFIG_VOYAGE: RateLimitConfig = {
    "essai-voyage": [
      { kind: "trip", windowSeconds: 86_400, threshold: 2 },
      { kind: "ip", windowSeconds: 60, threshold: 3 },
    ],
  };

  it("règles ordonnées ip, email, trip quelle que soit la configuration ; message rl/v1/<action>/86400s/trip/<uuid en minuscules>", () => {
    expect(reglesOrdonnees(CONFIG_VOYAGE["essai-voyage"] ?? []).map((r) => r.kind)).toEqual(["ip", "trip"]);
    expect(reglesOrdonnees(RATE_LIMITS["lieu-recherche"] ?? []).map((r) => r.kind)).toEqual(["ip", "trip"]);
    const octets = randomBytes(32);
    const env = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: octets.toString("base64url") };
    const { pool, increments } = poolSimule();
    return (async () => {
      const limiteur = createRateLimiter({ pool, env, config: CONFIG_VOYAGE });
      expect(await limiteur.verdict({ action: "essai-voyage", headers: entetes({ "x-vercel-forwarded-for": "192.0.2.7" }), tripId: TRIP })).toEqual({ ok: true });
      const cles = increments().map((r) => r.values?.[0]);
      expect(cles).toEqual([
        rateLimitKey(octets, rateLimitMessage("essai-voyage", 60, "ip/192.0.2.7")),
        rateLimitKey(octets, rateLimitMessage("essai-voyage", 86_400, `trip/${TRIP.toLowerCase()}`)),
      ]);
      expect(rateLimitMessage("lieu-recherche", 86_400, `trip/${TRIP.toLowerCase()}`)).toBe(`rl/v1/lieu-recherche/86400s/trip/${TRIP.toLowerCase()}`);
    })();
  });

  it("sans identifiant de voyage lisible : refus fermé, rate_limit.failed MissingTripId, aucun incrément", async () => {
    for (const tripId of [undefined, "", "voyage-1", `${TRIP}x`]) {
      const { pool, increments } = poolSimule();
      const journal = capturerJournal();
      const limiteur = createRateLimiter({ pool, env: ENV_CI(), config: CONFIG_VOYAGE });
      const verdict = await limiteur.verdict({ action: "essai-voyage", headers: entetes(), ...(tripId === undefined ? {} : { tripId }) });
      expect(verdict.ok, String(tripId)).toBe(false);
      expect(await limiteur.check({ action: "essai-voyage", headers: entetes(), ...(tripId === undefined ? {} : { tripId }) })).toEqual(REFUS);
      expect(increments()).toEqual([]);
      expect(journal.evenements()[0]).toMatchObject({ event: "rate_limit.failed", action: "essai-voyage", errorName: "MissingTripId" });
      expect(journal.lignes.join("\n")).not.toContain("voyage-1");
      vi.restoreAllMocks();
    }
  });

  it("verdict : espèce de la règle qui refuse ; un refus ip n'incrémente pas la règle trip ; check rend le refus habituel", async () => {
    const { pool, increments } = poolSimule();
    const limiteur = createRateLimiter({ pool, env: ENV_CI(), config: CONFIG_VOYAGE });
    const depuis = (ip: string) => ({ action: "essai-voyage", headers: entetes({ "x-vercel-forwarded-for": ip }), tripId: TRIP });
    expect(await limiteur.verdict(depuis("192.0.2.1"))).toEqual({ ok: true });
    expect(await limiteur.verdict(depuis("192.0.2.2"))).toEqual({ ok: true });
    expect(await limiteur.verdict(depuis("192.0.2.3"))).toEqual({ ok: false, kind: "trip" });
    expect(await limiteur.check(depuis("192.0.2.4"))).toEqual(REFUS);
    // Même adresse : la 4e est refusée par la règle ip, et la clé trip n'est pas incrémentée.
    const { pool: pool2, increments: increments2 } = poolSimule();
    const limiteur2 = createRateLimiter({ pool: pool2, env: ENV_CI(), config: { "essai-voyage": [{ kind: "trip", windowSeconds: 86_400, threshold: 99 }, { kind: "ip", windowSeconds: 60, threshold: 3 }] } });
    for (let i = 0; i < 3; i += 1) expect(await limiteur2.verdict(depuis("192.0.2.9"))).toEqual({ ok: true });
    expect(await limiteur2.verdict(depuis("192.0.2.9"))).toEqual({ ok: false, kind: "ip" });
    expect(increments2()).toHaveLength(7);
    expect(increments()).toHaveLength(8);
  });

  it("calendrier : configuration de la spécification M6 § 4 (30 par voyage et par heure) ; clé rl/v1/calendrier/3600s/trip/<uuid>", async () => {
    expect(RATE_LIMITS.calendrier).toEqual([{ kind: "trip", windowSeconds: 3600, threshold: 30 }]);
    const octets = randomBytes(32);
    const env = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: octets.toString("base64url") };
    const { pool, increments } = poolSimule();
    const limiteur = createRateLimiter({ pool, env, config: RATE_LIMITS });
    expect(await limiteur.verdict({ action: "calendrier", headers: entetes(), tripId: TRIP })).toEqual({ ok: true });
    expect(increments().map((r) => r.values?.[0])).toEqual([rateLimitKey(octets, rateLimitMessage("calendrier", 3600, `trip/${TRIP.toLowerCase()}`))]);
    expect(rateLimitMessage("calendrier", 3600, `trip/${TRIP.toLowerCase()}`)).toBe(`rl/v1/calendrier/3600s/trip/${TRIP.toLowerCase()}`);
  });

  it("lieu-recherche : configuration de 0147 § 6.4 (5 par minute par adresse, 20 par voyage et par 24 heures)", () => {
    expect(RATE_LIMITS["lieu-recherche"]).toEqual([
      { kind: "ip", windowSeconds: 60, threshold: 5 },
      { kind: "trip", windowSeconds: 86_400, threshold: 20 },
    ]);
  });
});

describe("journal: lieu.recherche (M5d-1, ticket 939 ; décision 0147 § 12 S1 point 5)", () => {
  const lire = (champs: Record<string, unknown>) => JSON.parse(formatLogLine("lieu.recherche", champs)) as Record<string, unknown>;

  it("raisons fermées ; raison hors liste retirée", () => {
    expect([...LOG_LIEU_REASONS]).toEqual([
      "ok",
      "aucun_resultat",
      "entree_invalide",
      "non_debloque",
      "seuils_non_valides",
      "barriere",
      "client",
      "limite",
      "limite_voyage",
      "limite_jour",
      "compteur_indisponible",
      "google_erreur",
      "exception",
    ]);
    expect(lire({ reason: "ok", places: 3 })).toMatchObject({ event: "lieu.recherche", reason: "ok", places: 3 });
    expect(lire({ reason: SENTINELLE }).reason).toBeUndefined();
  });

  it("champs admis seulement (places, reason, googleCode, httpStatus, errorName) : requête, ville, placeId, nom, voyage, organisation retirés ; places en texte retiré", () => {
    const ligne = lire({
      reason: "google_erreur",
      googleCode: "upstream_error",
      httpStatus: 503,
      errorName: "ErreurClientGoogle",
      query: SENTINELLE,
      city: SENTINELLE,
      placeId: SENTINELLE,
      name: SENTINELLE,
      tripId: "0d000000-0000-4000-8000-0000000000aa",
      organizationId: "0d000000-0000-4000-8000-000000000001",
      action: "search-places",
    });
    expect(ligne).toMatchObject({ event: "lieu.recherche", reason: "google_erreur", googleCode: "upstream_error", httpStatus: 503, errorName: "ErreurClientGoogle" });
    for (const champ of ["query", "city", "placeId", "name", "tripId", "organizationId", "action"]) expect(ligne[champ], champ).toBeUndefined();
    expect(JSON.stringify(ligne)).not.toContain(SENTINELLE);
    expect(lire({ reason: "ok", places: SENTINELLE }).places).toBeUndefined();
  });
});
