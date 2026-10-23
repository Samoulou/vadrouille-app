import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { choisirVilleEssai, LIMITES_VILLE, suggererVillesEssai, type DependancesVilles } from "@/server/composition/villes";
import { valeurCookieAcces } from "@/server/p0/acces";
import type { DemandeVille, ResultatVille } from "@/server/usage/neon";

/**
 * Recherche de ville du site d'essai (demande de Samuel du 23 octobre 2026) : même barrière que le lancement (garde du
 * mode réel ouverte et cookie d'accès valide), un appel Google par action au plus, et seules des valeurs maison (et le
 * `placeId`) rendues au navigateur. Client Places doublé : aucun appel réel.
 */

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({ P0_RUN_TOKEN: 0, P0_DATABASE_URL: 0 });
const T0 = Date.UTC(2026, 9, 23, 15);
const CODE = randomBytes(32);
const ENV: NodeJS.ProcessEnv = {
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "p0-reel",
  P0_REAL_RUNS: "enabled",
  [NOM_BASE]: "postgres://exemple.invalid/p0",
  [NOM_CODE]: CODE.toString("hex"),
};
const SESSION = "jeton-session-1";
const P = "lieu_fictif_ville_essai_1";

type Fiche = { placeId: string; pays: string | null; position: { lat: number; lng: number } };

function doubles(fiche: Partial<Fiche> = {}, suggestions = [{ placeId: P, principal: "Valence", secondaire: "Espagne" }]) {
  const client = {
    suggererVilles: vi.fn(async () => suggestions),
    ficheVille: vi.fn(async (): Promise<Fiche> => ({ placeId: P, pays: "ES", position: { lat: 39.47, lng: -0.38 }, ...fiche })),
  };
  const fabrique = vi.fn<(options: unknown) => typeof client>(() => client);
  return { client, fabrique };
}

const COOKIE_VALIDE = valeurCookieAcces(CODE, T0);

/** Réservation doublée : accordée par défaut (le plafond persistant est testé à part, et en base dans `tests/db`). */
const accordee = () => vi.fn<(demande: DemandeVille) => Promise<ResultatVille>>(async () => ({ ok: true }));

function dependances(
  fabrique: DependancesVilles["client"],
  options: { cookie?: string | undefined; env?: NodeJS.ProcessEnv; reserver?: DependancesVilles["reserver"] } = {},
): DependancesVilles {
  const cookie = "cookie" in options ? options.cookie : COOKIE_VALIDE;
  return { env: options.env ?? ENV, execArgv: [], maintenant: () => T0, cookie, client: fabrique, reserver: options.reserver ?? accordee() };
}

describe("recherche de ville : barrière du lancement", () => {
  it("garde fermée (production, mode réel désactivé) : « indisponible », aucune réservation, aucun client créé", async () => {
    const { fabrique } = doubles();
    const reserver = accordee();
    for (const env of [{ ...ENV, VERCEL_ENV: "production" }, { ...ENV, P0_REAL_RUNS: undefined }]) {
      expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dependances(fabrique, { env, reserver }))).toEqual({ statut: "indisponible" });
      expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dependances(fabrique, { env, reserver }))).toEqual({
        statut: "indisponible",
      });
    }
    expect(reserver).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("cookie absent, expiré ou signé par un autre code : « acces », aucune réservation, aucun client créé", async () => {
    const { fabrique } = doubles();
    const reserver = accordee();
    for (const cookie of [undefined, "x", valeurCookieAcces(CODE, T0 - 13 * 3_600_000), valeurCookieAcces(randomBytes(32), T0)]) {
      expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dependances(fabrique, { cookie, reserver }))).toEqual({ statut: "acces" });
      expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "" }, dependances(fabrique, { cookie, reserver }))).toEqual({ statut: "acces" });
    }
    expect(reserver).not.toHaveBeenCalled();
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("entrées non fiables revalidées avant la barrière : saisie, jeton et identifiant mal formés refusés, sans appel", async () => {
    const { fabrique } = doubles();
    const dep = dependances(fabrique);
    for (const entree of [
      { saisie: "V", session: SESSION },
      { saisie: "x".repeat(81), session: SESSION },
      { saisie: 42, session: SESSION },
      { saisie: "Valen", session: "a b" },
      { saisie: "Valen", session: undefined },
    ]) {
      expect(await suggererVillesEssai(entree, dep), JSON.stringify(entree)).toEqual({ statut: "entree_invalide" });
    }
    for (const entree of [
      { placeId: "a/b", session: SESSION, saisie: "Valen", principal: "" },
      { placeId: P, session: "x".repeat(37), saisie: "Valen", principal: "" },
      { placeId: P, session: SESSION, saisie: "", principal: "" },
      { placeId: null, session: SESSION, saisie: "Valen", principal: "" },
    ]) {
      expect(await choisirVilleEssai(entree, dep), JSON.stringify(entree)).toEqual({ statut: "entree_invalide" });
    }
    expect(fabrique).not.toHaveBeenCalled();
  });
});

describe("recherche de ville : suggestions et choix", () => {
  it("barrière ouverte : suggestions du client, un port en mémoire borné à une réservation", async () => {
    const { client, fabrique } = doubles();
    expect(await suggererVillesEssai({ saisie: " Valen ", session: SESSION }, dependances(fabrique))).toEqual({
      statut: "ok",
      suggestions: [{ placeId: P, principal: "Valence", secondaire: "Espagne" }],
    });
    expect(client.suggererVilles).toHaveBeenCalledWith("Valen", SESSION);
    const options = fabrique.mock.calls[0]?.[0] as unknown as { usage: { reserve: () => Promise<{ ok: boolean }> }; plafonds: unknown[] };
    expect(options.plafonds).toEqual([]);
    expect((await options.usage.reserve()).ok).toBe(true);
    expect((await options.usage.reserve()).ok).toBe(false);
  });

  it("client en erreur : « indisponible », sans détail", async () => {
    const { client, fabrique } = doubles();
    client.suggererVilles.mockRejectedValueOnce(new Error("SENTINELLE"));
    client.ficheVille.mockRejectedValueOnce(new Error("SENTINELLE"));
    expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dependances(fabrique))).toEqual({ statut: "indisponible" });
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dependances(fabrique))).toEqual({ statut: "indisponible" });
  });

  it("Valence (Espagne) : nom maison de la table d'après le texte principal, pays et fuseau maison", async () => {
    const { client, fabrique } = doubles();
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dependances(fabrique))).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "ES", timeZone: "Europe/Madrid", nomPays: "Espagne", nomMaison: "Valence" },
    });
    expect(client.ficheVille).toHaveBeenCalledWith(P, SESSION);
    // Le texte tapé prime : « valencia » est une clé de la table en Espagne.
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "valencia", principal: "SENTINELLE" }, dependances(fabrique))).toMatchObject({
      ville: { nomMaison: "Valence" },
    });
  });

  it("Valencia (Venezuela) : la table espagnole ne s'applique pas ; nom maison absent, fuseau du pays", async () => {
    const { fabrique } = doubles({ pays: "VE", position: { lat: 10.16, lng: -68.0 } });
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valencia", principal: "Valencia" }, dependances(fabrique))).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "VE", timeZone: "America/Caracas", nomPays: "Venezuela", nomMaison: null },
    });
  });

  it("ville d'Asie hors de la table (Hoi An) : pays et fuseau maison, nom maison absent", async () => {
    const { fabrique } = doubles({ pays: "VN", position: { lat: 15.88, lng: 108.33 } });
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Hoi An", principal: "Hội An" }, dependances(fabrique))).toEqual({
      statut: "ok",
      ville: { placeId: P, country: "VN", timeZone: "Asia/Ho_Chi_Minh", nomPays: "Viêt Nam", nomMaison: null },
    });
  });

  it("pays à plusieurs fuseaux, ville hors de la table : fuseau du repère maison le plus proche de la position", async () => {
    const { fabrique } = doubles({ pays: "US", position: { lat: 35.6, lng: -82.55 } });
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Asheville", principal: "Asheville" }, dependances(fabrique))).toMatchObject({
      ville: { country: "US", timeZone: "America/New_York", nomMaison: null },
    });
  });

  it("pays absent de la fiche ou hors de la table maison : « pays_inconnu »", async () => {
    for (const pays of [null, "XX"]) {
      const { fabrique } = doubles({ pays });
      expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dependances(fabrique)), String(pays)).toEqual({
        statut: "pays_inconnu",
      });
    }
  });
});

describe("recherche de ville : plafond persistant (décision 0129 § 3)", () => {
  it("chaque action réserve avant l'appel : action, empreinte du cookie (64 hexadécimaux, stable, ni le cookie ni le code), coût au prix plein", async () => {
    const { fabrique } = doubles();
    const reserver = accordee();
    const dep = dependances(fabrique, { reserver });
    await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dep);
    await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dep);
    const [suggestions, choix] = reserver.mock.calls.map(([demande]) => demande);
    expect(suggestions).toMatchObject({ action: "suggestions", coutGoogleMicros: 2_830 });
    expect(choix).toMatchObject({ action: "choix", coutGoogleMicros: 5_000 });
    expect(suggestions?.empreinte).toMatch(/^[0-9a-f]{64}$/);
    expect(choix?.empreinte).toBe(suggestions?.empreinte);
    expect(suggestions?.empreinte).not.toContain(CODE.toString("hex"));
    expect(COOKIE_VALIDE).not.toContain(suggestions?.empreinte ?? "");
    // Autre cookie valide (autre expiration) : autre empreinte, débit compté à part.
    const autre = accordee();
    await suggererVillesEssai({ saisie: "Valen", session: SESSION }, { ...dependances(fabrique, { reserver: autre }), cookie: valeurCookieAcces(CODE, T0 - 60_000) });
    expect(autre.mock.calls[0]?.[0].empreinte).not.toBe(suggestions?.empreinte);
  });

  it("Nème appel refusé sans appel Google : au-delà du plafond du jour, « limite », le client n'est plus appelé", async () => {
    const { client, fabrique } = doubles();
    let accordees = 0;
    const plafond = 3;
    const reserver = vi.fn(async (): Promise<ResultatVille> => (accordees < plafond ? (accordees++, { ok: true }) : { ok: false, code: "ville_jour_atteint" }));
    const dep = dependances(fabrique, { reserver });
    for (let i = 0; i < plafond; i++) expect((await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dep)).statut).toBe("ok");
    expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dep)).toEqual({ statut: "limite" });
    expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dep)).toEqual({ statut: "limite" });
    expect(client.suggererVilles).toHaveBeenCalledTimes(plafond);
    expect(client.ficheVille).not.toHaveBeenCalled();
    expect(fabrique).toHaveBeenCalledTimes(plafond);
  });

  it("débit du cookie atteint : « limite », sans appel", async () => {
    const { fabrique } = doubles();
    const reserver = vi.fn(async (): Promise<ResultatVille> => ({ ok: false, code: "ville_debit_atteint" }));
    expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dependances(fabrique, { reserver }))).toEqual({ statut: "limite" });
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("échec fermé : base indisponible (migration 0019 absente comprise) ou réservation en erreur, « indisponible », sans appel", async () => {
    const { fabrique } = doubles();
    for (const reserver of [
      vi.fn(async (): Promise<ResultatVille> => ({ ok: false, code: "usage_unavailable" })),
      vi.fn(async (): Promise<ResultatVille> => {
        throw new Error("SENTINELLE");
      }),
    ]) {
      expect(await suggererVillesEssai({ saisie: "Valen", session: SESSION }, dependances(fabrique, { reserver }))).toEqual({ statut: "indisponible" });
      expect(await choisirVilleEssai({ placeId: P, session: SESSION, saisie: "Valen", principal: "Valence" }, dependances(fabrique, { reserver }))).toEqual({
        statut: "indisponible",
      });
    }
    expect(fabrique).not.toHaveBeenCalled();
  });

  it("limites : un jour au plafond, au prix plein, reste sous 20 USD sur un mois de 31 jours (0027 § 2)", () => {
    const jourMicros = LIMITES_VILLE.suggestionsParJour * 2_830 + LIMITES_VILLE.choixParJour * 5_000;
    expect(jourMicros).toBe(624_500);
    expect(jourMicros * 31).toBeLessThan(20_000_000);
  });
});
