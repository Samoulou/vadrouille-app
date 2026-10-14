import { randomBytes } from "node:crypto";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import type { RateLimitConfig } from "@/server/config/limites";
import { type CanonicalEmail, parseEmailAddress, rateLimitEmailKey } from "@/server/email";
import { createRateLimiter, type RateLimiter, type RateLimiterOptions, type RateLimitPool, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";

import { createDatabase } from "../../db/index";
import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Limiteur sur la base réelle (spécification B3, critères A4 à A7 ; décisions 0050, B3-TL-6 et amendement de 0007, et
 * 0051, point 6.2.2). Le limiteur passe par la fabrique gardée de `db/connection.ts` (rôle `vadrouille_app`, puis
 * `SET LOCAL ROLE vadrouille_limiter`) ; seul le rôle de test (`admin`) lit la table, recule les fenêtres par SQL (jamais
 * par l'horloge du processus) et lance `ANALYZE`. Chaque test a ses propres noms d'action : aucun compteur partagé.
 * Le secret est tiré à l'exécution ; adresses en `exemple.test` et IP des plages de documentation.
 */

const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
const SECRET = randomBytes(32);
const ENV = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: SECRET.toString("base64url") };
const SUFFIXE = randomBytes(4).toString("hex");
const action = (nom: string) => `t-${nom}-${SUFFIXE}`;
const ENTETE = "x-vercel-forwarded-for";

let admin: DbClient;
const pools: { end(): Promise<void> }[] = [];

/** Nouveau pool de `vadrouille_app` (fabrique gardée) : une « reconstruction du module » par appel. */
function nouveauPool(): RateLimitPool {
  const pool = createDatabase("vadrouille_app").$client;
  pools.push(pool);
  return pool;
}

function limiteur(config: RateLimitConfig, options: Partial<RateLimiterOptions> = {}): RateLimiter {
  return createRateLimiter({ config, env: ENV, pool: nouveauPool(), ...options });
}

const email = (adresse: string): CanonicalEmail => {
  const lu = parseEmailAddress(adresse);
  if (!lu.ok) throw new Error("adresse refusée");
  return lu.email;
};

const cleIp = (nom: string, fenetre: number, ip: string) => rateLimitKey(SECRET, rateLimitMessage(nom, fenetre, `ip/${ip}`));
const cleEmail = (nom: string, fenetre: number, adresse: CanonicalEmail) => rateLimitKey(SECRET, rateLimitMessage(nom, fenetre, `email/${rateLimitEmailKey(adresse)}`));
const cleCommune = (nom: string, fenetre: number) => rateLimitKey(SECRET, rateLimitMessage(nom, fenetre, "no-trusted-ip"));

async function compteur(cle: string): Promise<number | undefined> {
  const { rows } = await admin.query("SELECT count FROM action_rate_limits WHERE key = $1", [cle]);
  return rows[0]?.count as number | undefined;
}

/** Recule fenêtre et échéance de 15 minutes, par SQL, sous le rôle de test. */
async function reculer(cles: readonly string[]): Promise<void> {
  await admin.query(
    "UPDATE action_rate_limits SET expires_at = expires_at - interval '15 minutes', window_start = window_start - interval '15 minutes' WHERE key = ANY($1::text[])",
    [cles],
  );
}

const capturer = () => {
  const lignes: string[] = [];
  vi.spyOn(console, "log").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => void lignes.push(args.map(String).join(" ")));
  return lignes;
};

beforeAll(async () => {
  admin = await connect("admin");
});

beforeEach(async () => {
  // Isolement : aucune entrée échue d'un autre test ne compte dans le lot de purge d'un test.
  await admin.query("DELETE FROM action_rate_limits WHERE expires_at <= now()");
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await Promise.all(pools.splice(0).map((pool) => pool.end().catch(() => undefined)));
  await closeAll();
});

describe("limiteur", () => {
  it("auth: sans en-tête de confiance, la limite reste appliquée", async () => {
    capturer();
    const nom = action("a4");
    const l = limiteur({ [nom]: [{ kind: "ip", windowSeconds: 600, threshold: 3 }] });
    const forges = (i: number) =>
      new Headers({ "x-forwarded-for": `198.51.100.${i}`, "x-real-ip": `203.0.113.${i}`, forwarded: `for=192.0.2.${i}` });
    const resultats = [];
    for (let i = 1; i <= 6; i += 1) resultats.push((await l.check({ action: nom, headers: forges(i) })).ok);
    expect(resultats).toEqual([true, true, true, false, false, false]);
    expect(await compteur(cleCommune(nom, 600))).toBe(6);
  });

  it("l'incrément s'arrête à la première clé au-dessus de son seuil : compteur de la clé e-mail inchangé", async () => {
    capturer();
    const nom = action("arret");
    const l = limiteur({
      [nom]: [
        { kind: "ip", windowSeconds: 600, threshold: 2 },
        { kind: "email", windowSeconds: 3600, threshold: 10 },
      ],
    });
    const adresse = email("arret@exemple.test");
    const requete = { action: nom, headers: new Headers({ [ENTETE]: "192.0.2.50" }), email: adresse };
    expect((await l.check(requete)).ok).toBe(true);
    expect((await l.check(requete)).ok).toBe(true);
    expect(await l.check(requete)).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(await compteur(cleIp(nom, 600, "192.0.2.50"))).toBe(3);
    expect(await compteur(cleEmail(nom, 3600, adresse))).toBe(2);
  });

  it("une adresse non canonique est refusée sans aucune écriture", async () => {
    capturer();
    const nom = action("canon");
    const l = limiteur({ [nom]: [{ kind: "email", windowSeconds: 3600, threshold: 5 }] });
    const avant = (await admin.query("SELECT count(*)::int AS n FROM action_rate_limits")).rows[0]?.n as number;
    const brute = " Canon@Exemple.test" as never;
    expect((await l.check({ action: nom, headers: new Headers(), email: brute })).ok).toBe(false);
    expect((await admin.query("SELECT count(*)::int AS n FROM action_rate_limits")).rows[0]?.n).toBe(avant);
  });
});

describe("auth: aucune adresse IP ni email en clair dans les limiteurs", () => {
  it("aucune ligne ne contient une sentinelle, sa forme normalisée, ni son encodage hexadécimal ou base64", async () => {
    capturer();
    const marque = randomBytes(4).toString("hex");
    const ip = "192.0.2.77";
    const ip6 = `2001:db8:${marque.slice(0, 4)}:1::7`;
    const adresse = `Sentinelle.${marque}+tag@Exemple.test`;
    const nomA = action("a5a");
    const nomB = action("a5b");
    const config: RateLimitConfig = {
      [nomA]: [
        { kind: "ip", windowSeconds: 600, threshold: 10 },
        { kind: "email", windowSeconds: 3600, threshold: 10 },
      ],
      [nomB]: [
        { kind: "ip", windowSeconds: 600, threshold: 10 },
        { kind: "ip", windowSeconds: 3600, threshold: 10 },
      ],
    };
    const l = limiteur(config);
    const canon = email(adresse);
    for (const valeur of [ip, ip6]) {
      await l.check({ action: nomA, headers: new Headers({ [ENTETE]: valeur }), email: canon });
      await l.check({ action: nomB, headers: new Headers({ [ENTETE]: valeur }) });
    }
    const { rows } = await admin.query("SELECT row_to_json(l)::text AS ligne FROM action_rate_limits l");
    const lignes = rows.map((r) => String(r.ligne)).join("\n").toLowerCase();
    const formes = [ip, ip6, `2001:db8:${marque.slice(0, 4)}:1::/64`, adresse, canon, rateLimitEmailKey(canon), marque].flatMap((v) => [
      v.toLowerCase(),
      Buffer.from(v).toString("hex"),
      Buffer.from(v).toString("base64").toLowerCase(),
      Buffer.from(v).toString("base64url").toLowerCase(),
    ]);
    for (const forme of formes) expect(lignes).not.toContain(forme);
    // Une même valeur : deux clés pour deux actions, et pour deux fenêtres d'une même action.
    const cles = [cleIp(nomA, 600, ip), cleIp(nomB, 600, ip), cleIp(nomB, 3600, ip)];
    expect(new Set(cles).size).toBe(3);
    for (const cle of cles) expect(await compteur(cle)).toBe(1);
  });
});

describe("limitation: les fenêtres expirées sont purgées à l'écriture", () => {
  it("l'entrée de 10 minutes échue disparaît ; celle d'une heure reste avec son compteur, qui continue de refuser", async () => {
    capturer();
    const nom = action("a6");
    const autre = action("a6x");
    const adresse = email("purge@exemple.test");
    const l = limiteur({
      [nom]: [
        { kind: "ip", windowSeconds: 600, threshold: 5 },
        { kind: "email", windowSeconds: 3600, threshold: 2 },
      ],
      [autre]: [{ kind: "ip", windowSeconds: 600, threshold: 5 }],
    });
    expect((await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.60" }), email: adresse })).ok).toBe(true);
    const court = cleIp(nom, 600, "192.0.2.60");
    const long = cleEmail(nom, 3600, adresse);
    await reculer([court, long]);
    expect((await l.check({ action: autre, headers: new Headers({ [ENTETE]: "192.0.2.61" }) })).ok).toBe(true);
    expect(await compteur(court)).toBeUndefined();
    expect(await compteur(long)).toBe(1);
    expect((await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.62" }), email: adresse })).ok).toBe(true);
    expect((await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.63" }), email: adresse })).ok).toBe(false);
    expect(await compteur(long)).toBe(3);
  });

  it("une purge supprime au plus 100 lignes, les plus anciennes échéances d'abord (150 échues → 50 restent)", async () => {
    capturer();
    const prefixe = `a6-lot-${SUFFIXE}-`;
    await admin.query(
      `INSERT INTO action_rate_limits (key, window_start, expires_at, count)
       SELECT $1 || g, now() - interval '2 hours', now() - interval '1 hour' - g * interval '1 second', 1 FROM generate_series(1, 150) g`,
      [prefixe],
    );
    const nom = action("a6lot");
    expect((await limiteur({ [nom]: [{ kind: "ip", windowSeconds: 600, threshold: 5 }] }).check({ action: nom, headers: new Headers() })).ok).toBe(true);
    const { rows } = await admin.query("SELECT key FROM action_rate_limits WHERE key LIKE $1 || '%'", [prefixe]);
    const restants = rows.map((r) => Number(String(r.key).slice(prefixe.length))).sort((a, b) => a - b);
    // Échéance d'autant plus ancienne que g est grand : les 100 plus anciennes (g de 51 à 150) sont parties.
    expect(restants).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));
  });

  it("une erreur forcée dans la purge laisse l'incrément compté et la décision rendue, et écrit rate_limit.purge_failed", async () => {
    const lignes = capturer();
    const nom = action("a6err");
    const l = limiteur(
      { [nom]: [{ kind: "ip", windowSeconds: 600, threshold: 1 }] },
      {
        beforePurge: () => {
          throw new Error("purge forcée");
        },
      },
    );
    const requete = { action: nom, headers: new Headers({ [ENTETE]: "192.0.2.64" }) };
    expect((await l.check(requete)).ok).toBe(true);
    expect((await l.check(requete)).ok).toBe(false);
    expect(await compteur(cleIp(nom, 600, "192.0.2.64"))).toBe(2);
    expect(lignes.map((ligne) => JSON.parse(ligne) as { event: string }).filter((e) => e.event === "rate_limit.purge_failed")).toHaveLength(2);
  });
});

describe("limitation: compteurs durables", () => {
  it("un compteur atteint survit à un nouveau pool ; 1 000 clés écrites par le limiteur ; seules les échues sont purgées", async () => {
    capturer();
    const court = action("a7c");
    const long = action("a7l");
    const purge = action("a7p");
    const config: RateLimitConfig = {
      [court]: [{ kind: "ip", windowSeconds: 600, threshold: 2 }],
      [long]: [{ kind: "ip", windowSeconds: 3600, threshold: 2 }],
      [purge]: [{ kind: "ip", windowSeconds: 600, threshold: 1_000 }],
    };
    const atteint = { headers: new Headers({ [ENTETE]: "192.0.2.70" }) };
    const premier = limiteur(config);
    for (let i = 0; i < 3; i += 1) {
      await premier.check({ action: court, ...atteint });
      await premier.check({ action: long, ...atteint });
    }
    // Reconstruction : nouveau limiteur, nouveau pool ; les compteurs sont en base.
    const second = limiteur(config);
    expect((await second.check({ action: court, ...atteint })).ok).toBe(false);
    expect((await second.check({ action: long, ...atteint })).ok).toBe(false);
    const cleCourtAtteint = cleIp(court, 600, "192.0.2.70");
    const cleLongAtteint = cleIp(long, 3600, "192.0.2.70");
    expect(await compteur(cleCourtAtteint)).toBe(4);
    expect(await compteur(cleLongAtteint)).toBe(4);

    // 1 000 clés écrites par le limiteur (chemin réel) : 500 de 10 minutes, 500 d'une heure, une adresse /64 par clé.
    const ip = (i: number) => `2001:db8:${(0x1000 + i).toString(16)}::1`;
    const ipCle = (i: number) => `2001:db8:${(0x1000 + i).toString(16)}::/64`;
    for (let i = 0; i < 500; i += 1) {
      await second.check({ action: court, headers: new Headers({ [ENTETE]: ip(i) }) });
      await second.check({ action: long, headers: new Headers({ [ENTETE]: ip(i) }) });
    }
    const courtes = Array.from({ length: 500 }, (_, i) => cleIp(court, 600, ipCle(i)));
    const longues = Array.from({ length: 500 }, (_, i) => cleIp(long, 3600, ipCle(i)));
    const presentes = async (cles: readonly string[]) =>
      (await admin.query("SELECT count(*)::int AS n FROM action_rate_limits WHERE key = ANY($1::text[])", [cles])).rows[0]?.n as number;
    expect(await presentes(courtes)).toBe(500);
    expect(await presentes(longues)).toBe(500);

    // Les 500 de 10 minutes deviennent échues (SQL, rôle de test) ; la clé atteinte de 10 minutes n'est pas reculée.
    await reculer(courtes);
    let ecritures = 0;
    while ((await presentes(courtes)) > 0 && ecritures < 20) {
      await second.check({ action: purge, headers: new Headers({ [ENTETE]: "192.0.2.71" }) });
      ecritures += 1;
    }
    expect(ecritures).toBeGreaterThanOrEqual(5);
    expect(await presentes(courtes)).toBe(0);

    // Aucune entrée de fenêtre en cours n'a disparu ni changé de compteur.
    expect(await compteur(cleCourtAtteint)).toBe(4);
    expect(await compteur(cleLongAtteint)).toBe(4);
    const { rows } = await admin.query("SELECT count(*)::int AS n, min(count) AS bas, max(count) AS haut FROM action_rate_limits WHERE key = ANY($1::text[])", [longues]);
    expect(rows[0]).toEqual({ n: 500, bas: 1, haut: 1 });
  });
});

describe("limitation: alerte au-delà du plafond de lignes", () => {
  it("après ANALYZE, l'estimation au-delà du seuil injecté écrit rate_limit.rows_high, une seule fois par 10 minutes", async () => {
    const lignes = capturer();
    const nom = action("plafond");
    const l = limiteur({ [nom]: [{ kind: "ip", windowSeconds: 600, threshold: 100 }] }, { rowsAlert: 0 });
    await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.80" }) });
    await admin.query("ANALYZE action_rate_limits");
    await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.80" }) });
    await l.check({ action: nom, headers: new Headers({ [ENTETE]: "192.0.2.80" }) });
    const alertes = lignes.map((ligne) => JSON.parse(ligne) as { event: string; rows?: number }).filter((e) => e.event === "rate_limit.rows_high");
    expect(alertes).toHaveLength(1);
    expect(Object.keys(alertes[0] ?? {}).sort()).toEqual(["event", "level", "rows"]);
    expect(alertes[0]?.rows).toBeGreaterThan(0);
  });
});
