// @vitest-environment node
import { createHmac, hkdfSync, randomBytes } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import type { HeadersLike } from "@/server/ip";
import {
  ACTION_LIMITE_VUE,
  compteValide,
  decisionVuePartagee,
  type DependancesLimiteVue,
  EN_TETE_COMPTE,
  jetonDuChemin,
  pageLimite,
  requeteComptee,
  sousCleCompte,
  valeurCompte,
} from "@/server/partage/limite-vue";
import { RATE_LIMITS } from "@/server/config/limites";
import { createRateLimiter, type RateLimitClient, type RateLimitPool, type RateLimitVerdict } from "@/server/rate-limit";

/** Environnement validé, par le type des dépendances (le module d'environnement ne s'importe pas ici). */
type ServerEnv = ReturnType<NonNullable<DependancesLimiteVue["env"]>>;

/**
 * Limite de la vue partagée et en-tête « compté » (ticket 1013, M6a ; décision 0157 § 2.1 points 2 à 6 ; spécification
 * M6 § 3.4) : ordre des contrôles, 429 fermé sur panne, préchargement, absence de clé d'adresse hors de `local` et
 * `ci`, sous-clé HKDF et fenêtre de deux minutes.
 */

const SECRET = Buffer.alloc(32, 7);
const JETON = "C".repeat(43);
const CHEMIN = `/p/${JETON}`;
const MAINTENANT = Date.parse("2026-11-01T10:00:30Z");

const env = (environment: string, trustedIpHeader: string | null = "x-vercel-forwarded-for", secret: Buffer | null = SECRET) =>
  ({ environment, trustedIpHeader, rateLimitHmacSecret: secret }) as unknown as ServerEnv;
const entetes = (valeurs: Record<string, string> = {}): HeadersLike => {
  const h = new Headers(valeurs);
  return { get: (nom: string) => h.get(nom) };
};
const ADRESSE = { "x-vercel-forwarded-for": "203.0.113.9" };

function limiteur(verdict: RateLimitVerdict | Error = { ok: true }) {
  return vi.fn(async (): Promise<RateLimitVerdict> => {
    if (verdict instanceof Error) throw verdict;
    return verdict;
  });
}

describe("décision du proxy (0157 § 2.1 ; ordre de F10-PO-15)", () => {
  it("jeton de forme aléatoire, compté et admis : en-tête « compté » du chemin", async () => {
    const l = limiteur();
    const h = entetes(ADRESSE);
    const d = await decisionVuePartagee({ pathname: CHEMIN, headers: h }, { env: () => env("staging"), limiteur: l, maintenant: () => MAINTENANT });
    expect(d).toEqual({ type: "compte", valeur: valeurCompte(SECRET, CHEMIN, MAINTENANT) });
    expect(l).toHaveBeenCalledWith({ action: ACTION_LIMITE_VUE, headers: h });
    expect(l).toHaveBeenCalledTimes(1);
  });

  it.each(["/p", "/p/", "/p/court", `/p/${"x".repeat(42)}!`, "/p/v1.abc.def", "/autre"])("%s : autre forme, la requête passe sans compter", async (pathname) => {
    const l = limiteur();
    expect(await decisionVuePartagee({ pathname, headers: entetes(ADRESSE) }, { env: () => env("staging"), limiteur: l })).toEqual({ type: "passer" });
    expect(l).not.toHaveBeenCalled();
  });

  it.each([{ "next-router-prefetch": "1" }, { purpose: "prefetch" }, { purpose: "Prefetch" }])("préchargement %j : 204, ni décompte ni lecture de l'environnement", async (h) => {
    const l = limiteur();
    const lireEnv = vi.fn(() => env("staging"));
    expect(await decisionVuePartagee({ pathname: CHEMIN, headers: entetes({ ...ADRESSE, ...(h as unknown as Record<string, string>) }) }, { env: lireEnv, limiteur: l })).toEqual({ type: "prechargement" });
    expect(l).not.toHaveBeenCalled();
    expect(lireEnv).not.toHaveBeenCalled();
  });

  it("hors de local et ci, sans clé d'adresse lisible : la requête passe sans compter ni en-tête (404 commun)", async () => {
    for (const h of [{}, { "x-vercel-forwarded-for": "" }, { "x-vercel-forwarded-for": "pas une adresse" }, { "x-forwarded-for": "203.0.113.9" }] as Record<string, string>[]) {
      const l = limiteur();
      expect(await decisionVuePartagee({ pathname: CHEMIN, headers: entetes(h) }, { env: () => env("staging"), limiteur: l }), JSON.stringify(h)).toEqual({ type: "passer" });
      expect(l).not.toHaveBeenCalled();
    }
  });

  it("en ci, sans en-tête de confiance : comptée (compartiment commun du limiteur)", async () => {
    const l = limiteur();
    const d = await decisionVuePartagee({ pathname: CHEMIN, headers: entetes() }, { env: () => env("ci", null), limiteur: l, maintenant: () => MAINTENANT });
    expect(d.type).toBe("compte");
    expect(l).toHaveBeenCalledTimes(1);
  });

  it("limite dépassée, panne du limiteur ou configuration absente : 429 (fermé)", async () => {
    const options = { pathname: CHEMIN, headers: entetes(ADRESSE) };
    expect(await decisionVuePartagee(options, { env: () => env("staging"), limiteur: limiteur({ ok: false }) })).toEqual({ type: "limite" });
    expect(await decisionVuePartagee(options, { env: () => env("staging"), limiteur: limiteur(new Error("panne")) })).toEqual({ type: "limite" });
    expect(await decisionVuePartagee(options, { env: () => env("staging", "x-vercel-forwarded-for", null), limiteur: limiteur() })).toEqual({ type: "limite" });
    expect(await decisionVuePartagee(options, { env: () => env("staging", null), limiteur: limiteur() })).toEqual({ type: "limite" });
    expect(
      await decisionVuePartagee(options, {
        env: () => {
          throw new Error("configuration");
        },
        limiteur: limiteur(),
      }),
    ).toEqual({ type: "limite" });
  });
});

describe("en-tête « compté » (0157 § 2.1 point 5)", () => {
  it("sous-clé HKDF-SHA-256, sel vide, information vadrouille/partage/compte/v1, 32 octets ; jamais la clé du limiteur", () => {
    const attendue = Buffer.from(hkdfSync("sha256", SECRET, Buffer.alloc(0), "vadrouille/partage/compte/v1", 32));
    expect(sousCleCompte(SECRET).equals(attendue)).toBe(true);
    expect(sousCleCompte(SECRET)).toHaveLength(32);
    expect(sousCleCompte(SECRET).equals(SECRET)).toBe(false);
    expect(sousCleCompte(SECRET, "v2").equals(attendue)).toBe(false);
  });

  it("valeur : v1.<HMAC base64url de « v1|minute|chemin »>, chemin sans barre finale", () => {
    const minute = Math.floor(MAINTENANT / 60_000);
    const mac = createHmac("sha256", sousCleCompte(SECRET)).update(`v1|${minute}|${CHEMIN}`).digest("base64url");
    expect(valeurCompte(SECRET, CHEMIN, MAINTENANT)).toBe(`v1.${mac}`);
    expect(valeurCompte(SECRET, `${CHEMIN}/`, MAINTENANT)).toBe(`v1.${mac}`);
    expect(valeurCompte(SECRET, `${CHEMIN}/jour/2`, MAINTENANT)).not.toBe(`v1.${mac}`);
  });

  it("valide pour la minute courante et la précédente, pour ce chemin seulement", () => {
    const valeur = valeurCompte(SECRET, CHEMIN, MAINTENANT);
    expect(compteValide(SECRET, CHEMIN, valeur, MAINTENANT)).toBe(true);
    expect(compteValide(SECRET, CHEMIN, valeur, MAINTENANT + 60_000)).toBe(true);
    expect(compteValide(SECRET, CHEMIN, valeur, MAINTENANT + 120_000)).toBe(false);
    expect(compteValide(SECRET, CHEMIN, valeur, MAINTENANT - 60_000)).toBe(false);
    expect(compteValide(SECRET, `${CHEMIN}/jour/1`, valeur, MAINTENANT)).toBe(false);
    expect(compteValide(Buffer.alloc(32, 8), CHEMIN, valeur, MAINTENANT)).toBe(false);
    expect(compteValide(SECRET, CHEMIN, null, MAINTENANT)).toBe(false);
    expect(compteValide(SECRET, CHEMIN, "", MAINTENANT)).toBe(false);
    expect(compteValide(SECRET, CHEMIN, valeur.replace(/^v1/, "v2"), MAINTENANT)).toBe(false);
    expect(compteValide(SECRET, CHEMIN, `${valeur}x`, MAINTENANT)).toBe(false);
  });

  it("vérification par la page : admise en local et ci ; ailleurs, l'en-tête valide est exigé", () => {
    const valeur = valeurCompte(SECRET, CHEMIN, MAINTENANT);
    const options = (e: ServerEnv) => ({ env: () => e, maintenant: () => MAINTENANT });
    expect(requeteComptee(entetes(), CHEMIN, options(env("local", null)))).toBe(true);
    expect(requeteComptee(entetes(), CHEMIN, options(env("ci", null)))).toBe(true);
    expect(requeteComptee(entetes(), CHEMIN, options(env("staging")))).toBe(false);
    expect(requeteComptee(entetes({ [EN_TETE_COMPTE]: valeur }), CHEMIN, options(env("staging")))).toBe(true);
    expect(requeteComptee(entetes({ [EN_TETE_COMPTE]: valeur }), `${CHEMIN}/jour/1`, options(env("staging")))).toBe(false);
    // Configuration illisible : refusée, sans lire.
    expect(requeteComptee(entetes({ [EN_TETE_COMPTE]: valeur }), CHEMIN, options(env("staging", "x-vercel-forwarded-for", null)))).toBe(false);
  });
});

describe("outils", () => {
  it("jetonDuChemin : jeton aléatoire seulement, sous /p/", () => {
    expect(jetonDuChemin(CHEMIN)).toBe(JETON);
    expect(jetonDuChemin(`${CHEMIN}/jour/3`)).toBe(JETON);
    expect(jetonDuChemin(`/x${CHEMIN}`)).toBeNull();
    expect(jetonDuChemin("/p/")).toBeNull();
  });

  it("page 429 : texte de fr.json, échappé, sans jeton ni chemin", () => {
    const page = pageLimite();
    expect(page).toContain("Trop de visites sur ce lien pour le moment.");
    expect(page).toContain("Réessaie dans une minute.");
    expect(page).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(page).not.toContain("/p/");
  });
});

describe("sous-clé mémorisée (revue du ticket 1013, mineur 1)", () => {
  it("une dérivation par étiquette et par secret ; un autre secret donne une autre sous-clé", () => {
    const premiere = sousCleCompte(SECRET);
    expect(sousCleCompte(SECRET).equals(premiere)).toBe(true);
    // Copie rendue : la modifier ne touche pas la sous-clé mémorisée.
    premiere.fill(0);
    expect(sousCleCompte(SECRET).equals(premiere)).toBe(false);
    const autre = Buffer.alloc(32, 8);
    expect(sousCleCompte(autre).equals(sousCleCompte(SECRET))).toBe(false);
    expect(sousCleCompte(autre).equals(Buffer.from(hkdfSync("sha256", autre, Buffer.alloc(0), "vadrouille/partage/compte/v1", 32)))).toBe(true);
  });
});

/**
 * Cardinalité d'`action_rate_limits` (0157 § 2.1 point 7 ; revue du ticket 1013, point 3) : 1 000 adresses simulées,
 * sur deux fenêtres de `partage-vue` (et de `partage-lien` pour un même voyage). La table simulée suit l'incrément de
 * `src/server/rate-limit.ts` (`ON CONFLICT (key)` : une ligne par clé, remise à zéro à l'échéance) et sa purge par lot ;
 * l'horloge de la table est avancée par le test. Le même scénario sur la base réelle : `tests/db/partage-api.test.ts`.
 */
describe("cardinalité d'action_rate_limits : 1 000 adresses sur deux fenêtres", () => {
  const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });
  const ENV = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: randomBytes(32).toString("base64url") };
  const VOYAGE = "44444444-4444-4444-8444-444444444444";

  function table() {
    let maintenant = 0;
    const lignes = new Map<string, { count: number; expiresAt: number }>();
    let maximum = 0;
    const client: RateLimitClient = {
      async query(text, values) {
        if (text.startsWith("INSERT INTO action_rate_limits")) {
          const cle = String(values?.[0]);
          const fenetre = Number(values?.[1]) * 1000;
          const ligne = lignes.get(cle);
          const suivante = ligne === undefined || ligne.expiresAt <= maintenant ? { count: 1, expiresAt: maintenant + fenetre } : { count: ligne.count + 1, expiresAt: ligne.expiresAt };
          lignes.set(cle, suivante);
          maximum = Math.max(maximum, lignes.size);
          return { rows: [{ count: suivante.count }] };
        }
        if (text.startsWith("DELETE FROM action_rate_limits")) {
          const expirees = [...lignes].filter(([, l]) => l.expiresAt <= maintenant).sort((a, b) => a[1].expiresAt - b[1].expiresAt);
          for (const [cle] of expirees.slice(0, Number(values?.[0]))) lignes.delete(cle);
          return { rows: [] };
        }
        if (text.includes("reltuples")) return { rows: [{ n: lignes.size }] };
        return { rows: [] };
      },
      release() {},
    };
    const pool: RateLimitPool = { connect: async () => client };
    return {
      pool,
      lignes,
      maximum: () => maximum,
      avancer: (ms: number) => {
        maintenant += ms;
      },
    };
  }

  // Une adresse IPv6 compte par préfixe /64 (`trustedIpKey`) : un préfixe distinct par adresse simulée.
  const adresse = (i: number) => `2001:db8:6a:${i.toString(16)}::1`;
  const avecAdresse = (i: number): HeadersLike => {
    const h = new Headers({ "x-vercel-forwarded-for": adresse(i) });
    return { get: (nom: string) => h.get(nom) };
  };

  it("partage-vue : une ligne par adresse, jamais une par fenêtre (1 000 lignes au plus, pas 2 000)", async () => {
    const t = table();
    const limiteur = createRateLimiter({ config: { "partage-vue": RATE_LIMITS["partage-vue"] ?? [] }, env: ENV, pool: t.pool });
    for (const fenetre of [1, 2]) {
      for (let i = 0; i < 1000; i += 1) expect(await limiteur.verdict({ action: "partage-vue", headers: avecAdresse(i) }), String(i)).toEqual({ ok: true });
      expect(t.lignes.size, `fenêtre ${fenetre}`).toBe(1000);
      for (const ligne of t.lignes.values()) expect(ligne.count).toBe(1);
      // Fenêtre suivante : au-delà des 60 secondes de la règle.
      t.avancer(61_000);
    }
    expect(t.maximum()).toBe(1000);
  });

  it("partage-lien : 1 000 adresses pour un même voyage, deux fenêtres d'un jour : 1 001 lignes au plus", async () => {
    const t = table();
    const limiteur = createRateLimiter({ config: { "partage-lien": RATE_LIMITS["partage-lien"] ?? [] }, env: ENV, pool: t.pool });
    for (let fenetre = 0; fenetre < 2; fenetre += 1) {
      for (let i = 0; i < 1000; i += 1) await limiteur.verdict({ action: "partage-lien", headers: avecAdresse(i), tripId: VOYAGE });
      // Une clé par adresse (espèce `ip`) et une seule pour le voyage (espèce `trip`, comptée après l'adresse).
      expect(t.lignes.size).toBe(1001);
      t.avancer(86_401_000);
    }
    expect(t.maximum()).toBe(1001);
  });
});
