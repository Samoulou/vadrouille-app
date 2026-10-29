// @vitest-environment node
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { isApiAdapter } from "@/adapters";
import { CODE_CLE_ABSENTE } from "@/ai/erreurs";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import {
  barriereApi,
  choisirVilleApiTerminal,
  rechercheVilleApiOuverte,
  suggererVillesApiTerminal,
  type DependancesVillesApi,
} from "@/server/composition/villes-api";
import { createRateLimiter, type RateLimitClient, type RateLimitPool } from "@/server/rate-limit";

/**
 * Recherche de ville de l'écran 1 de `api` (décision 0141 ; PR 880) : garde des seuils, barrière B9-TL-8 et crochet
 * `accesReelApi`, limiteur `ville-recherche`, compteurs du jour, table des 62 villes du MVP, journal `ville.refusee`.
 * Client Places, limiteur, compteurs et purge doublés : aucun appel Google, aucune base.
 */

const requete = vi.hoisted(() => ({ enTetes: async (): Promise<Headers> => new Headers() }));
vi.mock("next/headers", () => ({ headers: () => requete.enTetes() }));

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  requete.enTetes = async () => new Headers();
});

const SESSION = "jeton-session-1";
const P = "lieu_fictif_ville_api_1";
const BRANCHE = "m1h-essai";
/** Toutes les conditions d'environnement de la barrière réunies (jamais une valeur réelle). */
const ENV_REUNI = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCHE, GENERATION_APPELS_REELS: "1" };
const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });

type Fiche = { placeId: string; pays: string | null; position: { lat: number; lng: number } | null };

/** Client Places doublé, fabrique, limiteur, réservation et purge ; tous accordés par défaut. */
function doubles(fiche: Partial<Fiche> = {}) {
  const ordre: string[] = [];
  const client = {
    suggererVilles: vi.fn(async () => {
      ordre.push("google");
      return [{ placeId: P, principal: "Lisbonne", secondaire: "Portugal" }];
    }),
    ficheVille: vi.fn(async (): Promise<Fiche> => {
      ordre.push("google");
      return { placeId: P, pays: "PT", position: null, ...fiche };
    }),
  };
  const fabrique = vi.fn((...args: [unknown, unknown?]) => {
    void args;
    ordre.push("client");
    return client;
  });
  const limiteur = vi.fn<NonNullable<DependancesVillesApi["limiteur"]>>(async () => {
    ordre.push("limiteur");
    return { ok: true, value: undefined };
  });
  const reserver = vi.fn<NonNullable<DependancesVillesApi["reserver"]>>(async () => {
    ordre.push("reserver");
    return { ok: true, compte: 1 };
  });
  const purger = vi.fn(async () => {
    ordre.push("purger");
  });
  return { client, fabrique, limiteur, reserver, purger, ordre };
}

type Doubles = ReturnType<typeof doubles>;

function dependances(d: Doubles, options: Partial<DependancesVillesApi> = {}): DependancesVillesApi {
  return {
    headers: new Headers(),
    seuilsValides: () => true,
    barriere: async () => "reelle",
    client: d.fabrique as unknown as NonNullable<DependancesVillesApi["client"]>,
    limiteur: d.limiteur,
    reserver: d.reserver,
    purger: d.purger,
    ...options,
  };
}

const suggerer = (dep: DependancesVillesApi, saisie: unknown = "Lisb") => suggererVillesApiTerminal({ saisie, session: SESSION }, dep);
const choisir = (dep: DependancesVillesApi, saisie = "Lisbonne", principal = "Lisbonne") => choisirVilleApiTerminal({ placeId: P, session: SESSION, saisie, principal }, dep);

/** Lignes `ville.refusee` (et autres) écrites pendant `corps`. */
async function journal(corps: () => Promise<unknown>, evenement = "ville.refusee"): Promise<Record<string, unknown>[]> {
  const lignes: string[] = [];
  const sortie = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lignes.push(a.map(String).join(" ")));
  const erreurs = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lignes.push(a.map(String).join(" ")));
  try {
    await corps();
    return lignes.map((l) => JSON.parse(l) as Record<string, unknown>).filter((l) => l.event === evenement);
  } finally {
    sortie.mockRestore();
    erreurs.mockRestore();
  }
}

/** Pool simulé du limiteur : compteurs en mémoire par clé HMAC (premier paramètre de l'incrément). */
function poolLimiteur() {
  const compteurs = new Map<string, number>();
  const cles: string[] = [];
  const client: RateLimitClient = {
    async query(text, values) {
      if (text.startsWith("INSERT INTO action_rate_limits")) {
        const cle = String(values?.[0]);
        cles.push(cle);
        const compte = (compteurs.get(cle) ?? 0) + 1;
        compteurs.set(cle, compte);
        return { rows: [{ count: compte }] };
      }
      if (text.includes("reltuples")) return { rows: [{ n: -1 }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool: RateLimitPool = { connect: async () => client };
  return { pool, cles };
}

describe("villes api: barrière", () => {
  it("production et simulée : indisponible, aucun client construit, aucune réservation, aucun limiteur, ville.refusee barriere", async () => {
    for (const etat of ["production", "simulee"] as const) {
      const d = doubles();
      const dep = dependances(d, { barriere: async () => etat });
      const lignes = await journal(async () => {
        expect(await suggerer(dep)).toEqual({ statut: "indisponible" });
        expect(await choisir(dep)).toEqual({ statut: "indisponible" });
      });
      expect(d.fabrique).not.toHaveBeenCalled();
      expect(d.limiteur).not.toHaveBeenCalled();
      expect(d.reserver).not.toHaveBeenCalled();
      expect(d.purger).not.toHaveBeenCalled();
      expect(lignes).toEqual([
        { level: "info", event: "ville.refusee", reason: "barriere", action: "suggestions" },
        { level: "info", event: "ville.refusee", reason: "barriere", action: "choix" },
      ]);
    }
    // Barrière en erreur : fermée.
    const d = doubles();
    expect(
      await suggerer(
        dependances(d, {
          barriere: async () => {
            throw new Error("SENTINELLE");
          },
        }),
      ),
    ).toEqual({ statut: "indisponible" });
    expect(d.fabrique).not.toHaveBeenCalled();
  });

  it("réelle avec un crochet injecté vrai et des seuils injectés comme validés : client construit, limiteur puis réservation, un seul appel Google", async () => {
    const barriere = () => barriereApi({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true, cookieValide: async () => true });
    expect(await barriere()).toBe("reelle");
    const d = doubles();
    const dep = dependances(d, { seuilsValides: () => true, barriere });
    expect(await suggerer(dep)).toEqual({ statut: "ok", suggestions: [{ placeId: P, principal: "Lisbonne", secondaire: "Portugal" }] });
    expect(d.ordre).toEqual(["client", "limiteur", "reserver", "google", "purger"]);
    expect(d.client.suggererVilles).toHaveBeenCalledTimes(1);
    expect(d.client.suggererVilles).toHaveBeenCalledWith("Lisb", SESSION);
    expect(d.limiteur).toHaveBeenCalledWith({ action: "ville-recherche", headers: dep.headers });
    expect(d.reserver).toHaveBeenCalledWith("suggestions");
    // Fiche sans position (0141 § 6.3 point 3) : la fabrique reçoit toujours `{ position: false }`.
    expect(d.fabrique.mock.calls[0]?.[1]).toEqual({ position: false });
    const options = d.fabrique.mock.calls[0]?.[0] as { usage: { reserve: () => Promise<{ ok: boolean }> }; plafonds: unknown[] };
    expect(options.plafonds).toEqual([]);
    expect((await options.usage.reserve()).ok).toBe(true);
    expect((await options.usage.reserve()).ok).toBe(false);
  });

  it("conditions d'environnement réunies et plafonds non nuls, crochet par défaut : simulée, aucun client", async () => {
    const barriere = () => barriereApi({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true });
    // Seul le crochet `accesReelApi` (fermé) manque : avec un crochet vrai, la même barrière serait réelle.
    expect(await barriere()).toBe("simulee");
    expect(await barriereApi({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true, cookieValide: async () => true })).toBe("reelle");
    // Défaut complet (environnement des tests, `BRANCHE_APPELS_REELS` et `PLAFONDS_USAGE` à `null`) : jamais réelle.
    expect(["production", "simulee"]).toContain(await barriereApi());
    const d = doubles();
    expect(await suggerer(dependances(d, { seuilsValides: () => true, barriere }))).toEqual({ statut: "indisponible" });
    expect(await choisir(dependances(d, { seuilsValides: () => true, barriere }))).toEqual({ statut: "indisponible" });
    expect(d.fabrique).not.toHaveBeenCalled();
    expect(d.limiteur).not.toHaveBeenCalled();
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("seuils non validés : indisponible avant la barrière, même réelle avec un crochet vrai injecté ; aucun client, aucun limiteur, ville.refusee seuils_non_valides", async () => {
    const d = doubles();
    const barriere = vi.fn(() => barriereApi({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true, cookieValide: async () => true }));
    const dep = dependances(d, { seuilsValides: () => false, barriere });
    const lignes = await journal(async () => {
      expect(await suggerer(dep)).toEqual({ statut: "indisponible" });
      expect(await choisir(dep)).toEqual({ statut: "indisponible" });
    });
    expect(barriere).not.toHaveBeenCalled();
    expect(d.fabrique).not.toHaveBeenCalled();
    expect(d.limiteur).not.toHaveBeenCalled();
    expect(d.reserver).not.toHaveBeenCalled();
    expect(lignes).toEqual([
      { level: "info", event: "ville.refusee", reason: "seuils_non_valides", action: "suggestions" },
      { level: "info", event: "ville.refusee", reason: "seuils_non_valides", action: "choix" },
    ]);
    // Défaut de la dépendance : `SEUILS_AUTOCOMPLETION_VALIDES`, `false` dans le dépôt.
    const defaut = doubles();
    const sansSeuils: DependancesVillesApi = { ...dependances(defaut, { barriere: async () => "reelle" }), seuilsValides: undefined };
    expect(await suggerer(sansSeuils)).toEqual({ statut: "indisponible" });
    expect(defaut.fabrique).not.toHaveBeenCalled();
  });
});

describe("villes api: ordre", () => {
  it("clé absente : indisponible sans limiteur ni réservation", async () => {
    const d = doubles();
    const fabrique = vi.fn(() => {
      throw new ErreurClientGoogle(CODE_CLE_ABSENTE);
    });
    const dep = dependances(d, { client: fabrique as unknown as NonNullable<DependancesVillesApi["client"]> });
    const lignes = await journal(async () => {
      expect(await suggerer(dep)).toEqual({ statut: "indisponible" });
      expect(await choisir(dep)).toEqual({ statut: "indisponible" });
    });
    expect(d.limiteur).not.toHaveBeenCalled();
    expect(d.reserver).not.toHaveBeenCalled();
    expect(d.purger).not.toHaveBeenCalled();
    expect(lignes[0]).toEqual({ level: "warn", event: "ville.refusee", reason: "client", action: "suggestions", googleCode: CODE_CLE_ABSENTE, errorName: "ErreurClientGoogle" });
  });

  it("limiteur refusé : limite, aucune réservation du jour, aucun appel Google", async () => {
    const d = doubles();
    d.limiteur.mockResolvedValue({ ok: false, error: { code: "rate_limited", retryable: true } });
    const lignes = await journal(async () => {
      expect(await suggerer(dependances(d))).toEqual({ statut: "limite" });
      expect(await choisir(dependances(d))).toEqual({ statut: "limite" });
    });
    expect(d.reserver).not.toHaveBeenCalled();
    expect(d.client.suggererVilles).not.toHaveBeenCalled();
    expect(d.client.ficheVille).not.toHaveBeenCalled();
    expect(d.purger).not.toHaveBeenCalled();
    expect(lignes.map((l) => [l.level, l.reason])).toEqual([
      ["info", "limite"],
      ["info", "limite"],
    ]);
  });

  it("plafond du jour : limite_jour, aucun appel Google", async () => {
    const d = doubles();
    d.reserver.mockResolvedValue({ ok: false, raison: "plafond" });
    const lignes = await journal(async () => {
      expect(await suggerer(dependances(d))).toEqual({ statut: "limite_jour" });
      expect(await choisir(dependances(d))).toEqual({ statut: "limite_jour" });
    });
    expect(d.client.suggererVilles).not.toHaveBeenCalled();
    expect(d.client.ficheVille).not.toHaveBeenCalled();
    expect(d.purger).not.toHaveBeenCalled();
    expect(lignes.map((l) => [l.level, l.reason])).toEqual([
      ["info", "limite_jour"],
      ["info", "limite_jour"],
    ]);
  });

  it("compteur indisponible : indisponible, aucun appel Google", async () => {
    const d = doubles();
    d.reserver.mockResolvedValueOnce({ ok: false, raison: "indisponible" }).mockRejectedValueOnce(new TypeError("SENTINELLE"));
    const lignes = await journal(async () => {
      expect(await suggerer(dependances(d))).toEqual({ statut: "indisponible" });
      expect(await choisir(dependances(d))).toEqual({ statut: "indisponible" });
    });
    expect(d.client.suggererVilles).not.toHaveBeenCalled();
    expect(d.client.ficheVille).not.toHaveBeenCalled();
    expect(d.purger).not.toHaveBeenCalled();
    expect(lignes).toEqual([
      { level: "warn", event: "ville.refusee", reason: "compteur_indisponible", action: "suggestions" },
      { level: "warn", event: "ville.refusee", reason: "compteur_indisponible", action: "choix", errorName: "TypeError" },
    ]);
    expect(JSON.stringify(lignes)).not.toContain("SENTINELLE");
  });

  it("réservation accordée : un seul appel Google, puis la purge, qui ne change pas le résultat", async () => {
    const d = doubles();
    expect(await choisir(dependances(d))).toMatchObject({ statut: "ok" });
    expect(d.ordre).toEqual(["client", "limiteur", "reserver", "google", "purger"]);
    expect(d.client.ficheVille).toHaveBeenCalledTimes(1);
    // Purge en erreur (elle ne lève jamais ; un rejet inattendu est absorbé) : même résultat.
    const e = doubles();
    e.purger.mockRejectedValue(new Error("SENTINELLE"));
    expect(await suggerer(dependances(e))).toEqual({ statut: "ok", suggestions: [{ placeId: P, principal: "Lisbonne", secondaire: "Portugal" }] });
    expect(e.purger).toHaveBeenCalledTimes(1);
    // Erreur de Google : la réservation est déjà validée, la purge court aussi (0141 § 5.5).
    const f = doubles();
    f.client.suggererVilles.mockRejectedValueOnce(new ErreurClientGoogle("upstream_error", 403));
    const lignes = await journal(async () => expect(await suggerer(dependances(f))).toEqual({ statut: "indisponible" }));
    expect(f.ordre).toEqual(["client", "limiteur", "reserver", "purger"]);
    expect(lignes).toEqual([
      { level: "warn", event: "ville.refusee", reason: "google_erreur", action: "suggestions", googleCode: "upstream_error", httpStatus: 403, errorName: "ErreurClientGoogle" },
    ]);
  });
});

describe("villes api: choix", () => {
  it("ville des 62 dans le pays de la fiche : nom maison ; hors des 62 : hors_table sans nom ; pays hors table : pays_inconnu", async () => {
    const d = doubles();
    expect(await choisir(dependances(d), "lisb", "Lisbonne")).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "PT", timeZone: "Europe/Lisbon", nomPays: "Portugal", nomMaison: "Lisbonne" },
    });
    expect(d.client.ficheVille).toHaveBeenCalledWith(P, SESSION);
    // Valence (Espagne) : dans la table élargie du site d'essai, hors des 62 villes du MVP.
    const valence = doubles({ pays: "ES" });
    const horsTable = await journal(async () => expect(await choisir(dependances(valence), "Valence", "Valence")).toEqual({ statut: "hors_table" }));
    expect(horsTable).toEqual([{ level: "info", event: "ville.refusee", reason: "hors_table", action: "choix" }]);
    // Ville des 62 dans un autre pays que celui de la fiche : hors_table.
    expect(await choisir(dependances(doubles({ pays: "ES" })), "Lisbonne", "Lisbonne")).toEqual({ statut: "hors_table" });
    // Pays absent ou hors de la table maison : pays_inconnu.
    for (const pays of [null, "XX"]) {
      const lignes = await journal(async () => expect(await choisir(dependances(doubles({ pays })), "Lisbonne", "Lisbonne")).toEqual({ statut: "pays_inconnu" }));
      expect(lignes).toEqual([{ level: "info", event: "ville.refusee", reason: "pays_inconnu", action: "choix" }]);
    }
  });
});

describe("villes api: isolement du site d'essai", () => {
  it("aucun import de @/server/p0, de poolPrototype ni de reserverVille ; la clé HMAC, l'adresse IP et la saisie ne sont jamais journalisées", async () => {
    const lire = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
    // Spécificateurs importés (statiques, réexportations, `import()`) et noms importés, hors commentaires.
    const imports = (source: string) => [...source.matchAll(/(?:from\s+|import\s*\(\s*|import\s+)"([^"]+)"/g)].map((m) => m[1] ?? "");
    const nomsImportes = (source: string) => [...source.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s+from/g)].flatMap((m) => (m[1] ?? "").split(",").map((n) => n.trim()));
    for (const fichier of ["src/server/composition/villes-api.ts", "src/server/actions/villes.ts", "src/server/villes/compteurs.ts", "src/server/villes/recherche.ts"]) {
      const source = lire(fichier);
      expect(imports(source).length, fichier).toBeGreaterThan(0);
      for (const specificateur of imports(source)) {
        expect(specificateur, fichier).not.toMatch(/^@\/server\/p0(\/|$)|server\/p0\/|^@\/server\/usage\/neon$|villes-essai|^@\/server\/composition\/villes$/);
      }
      expect(nomsImportes(source).filter((n) => /poolPrototype|reserverVille/.test(n)), fichier).toEqual([]);
    }
    // Journal réel du limiteur et du terminal, sous une adresse et un secret sentinelles.
    const secret = randomBytes(32).toString("base64url");
    const IP = "203.0.113.77";
    const SAISIE = "Lisbsentinelle";
    const { pool, cles } = poolLimiteur();
    const limiteur = createRateLimiter({ pool, env: { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: secret } });
    const d = doubles();
    d.client.suggererVilles.mockRejectedValueOnce(new ErreurClientGoogle("upstream_error", 500));
    const lignes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void lignes.push(a.map(String).join(" ")));
    vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void lignes.push(a.map(String).join(" ")));
    const dep = dependances(d, { headers: new Headers({ "x-vercel-forwarded-for": IP }), limiteur: (r) => limiteur.check(r) });
    await suggerer(dep, SAISIE);
    await suggerer(dep, "L");
    d.reserver.mockResolvedValueOnce({ ok: false, raison: "plafond" });
    await suggerer(dep, SAISIE);
    await choisir(dependances(doubles({ pays: "ES" }), { headers: dep.headers, limiteur: (r) => limiteur.check(r) }), SAISIE, "Valence");
    vi.restoreAllMocks();
    const texte = lignes.join("\n");
    expect(lignes.length).toBeGreaterThanOrEqual(4);
    expect(cles.length).toBeGreaterThan(0);
    for (const valeur of [IP, secret, SAISIE, P, SESSION, "Valence", "Lisbonne", ...cles]) expect(texte).not.toContain(valeur);
  });
});

describe("écran 1 api: montage", () => {
  it("rechercheVilleApiOuverte et isApiAdapter : adaptateur api, seuils validés (seuilsValides) et barrière réelle (barriere) injectés : ouverte ; une seule condition manque : fermée", async () => {
    const monte = async (adaptateur: string | undefined, seuils: boolean, etat: "reelle" | "simulee" | "production") =>
      isApiAdapter(adaptateur) && (await rechercheVilleApiOuverte({ seuilsValides: () => seuils, barriere: async () => etat }));
    expect(await monte("api", true, "reelle")).toBe(true);
    expect(await monte(" api ", true, "reelle")).toBe(true);
    for (const adaptateur of [undefined, "", "mock", "prototype", "API", "apix"]) expect(await monte(adaptateur, true, "reelle"), String(adaptateur)).toBe(false);
    expect(await monte("api", false, "reelle")).toBe(false);
    expect(await monte("api", true, "simulee")).toBe(false);
    expect(await monte("api", true, "production")).toBe(false);
    // Défauts du dépôt : seuils non validés, crochet fermé.
    expect(await rechercheVilleApiOuverte()).toBe(false);
    expect(await rechercheVilleApiOuverte({ seuilsValides: () => true })).toBe(false);
    // Aucun journal à la lecture de la page.
    expect(await journal(async () => rechercheVilleApiOuverte({ seuilsValides: () => false }))).toEqual([]);
  });
});

describe("villes api: actions", () => {
  it("exception levée sous l'action serveur : indisponible, ville.refusee exception (errorName seul)", async () => {
    const { choisirVilleApi, suggererVillesApi } = await import("@/server/actions/villes");
    requete.enTetes = async () => {
      throw new TypeError("SENTINELLE Lisb");
    };
    const lignes = await journal(async () => {
      expect(await suggererVillesApi({ saisie: "Lisb", session: SESSION })).toEqual({ statut: "indisponible" });
      expect(await choisirVilleApi({ placeId: P, session: SESSION, saisie: "Lisb", principal: "Lisbonne" })).toEqual({ statut: "indisponible" });
    });
    expect(lignes).toEqual([
      { level: "warn", event: "ville.refusee", reason: "exception", action: "suggestions", errorName: "TypeError" },
      { level: "warn", event: "ville.refusee", reason: "exception", action: "choix", errorName: "TypeError" },
    ]);
    expect(JSON.stringify(lignes)).not.toContain("SENTINELLE");
    // Sans exception, l'action passe par le terminal : seuils non validés dans le dépôt, indisponible sans appel.
    requete.enTetes = async () => new Headers();
    const refus = await journal(async () => expect(await suggererVillesApi({ saisie: "Lisb", session: SESSION })).toEqual({ statut: "indisponible" }));
    expect(refus).toEqual([{ level: "info", event: "ville.refusee", reason: "seuils_non_valides", action: "suggestions" }]);
  });
});

describe("villes api: débit", () => {
  it("sans en-tête de confiance : compartiment no-trusted-ip commun, le 21e appel de la minute rend limite", async () => {
    const { pool, cles } = poolLimiteur();
    // `ci` sans `TRUSTED_IP_HEADER` : aucune adresse lue, compartiment commun.
    const limiteur = createRateLimiter({ pool, env: { VADROUILLE_ENV: "ci", [HMAC]: randomBytes(32).toString("base64url") } });
    const d = doubles();
    const statuts: string[] = [];
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    for (let i = 0; i < 21; i += 1) {
      // Adresses différentes, ignorées sans en-tête de confiance.
      const dep = dependances(d, { headers: new Headers({ "x-forwarded-for": `198.51.100.${i}`, "x-vercel-forwarded-for": `198.51.100.${i}` }), limiteur: (r) => limiteur.check(r) });
      statuts.push((i % 2 === 0 ? await suggerer(dep) : await choisir(dep)).statut);
    }
    expect(statuts.slice(0, 20).every((s) => s === "ok")).toBe(true);
    expect(statuts[20]).toBe("limite");
    expect(new Set(cles).size).toBe(1);
    expect(cles).toHaveLength(21);
    // Le 21e refus n'a ni réservé le jour ni appelé Google.
    expect(d.reserver).toHaveBeenCalledTimes(20);
    expect(d.client.suggererVilles.mock.calls.length + d.client.ficheVille.mock.calls.length).toBe(20);
  });
});
