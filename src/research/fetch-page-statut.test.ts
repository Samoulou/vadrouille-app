// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ADRESSE_BRUTE_MAX,
  creerVerificateurStatut,
  DELAI_STATUT_MS,
  DOMAINES_GOOGLE,
  ENTETES_STATUT,
  estHoteGoogle,
  reduireSite,
  SITE_LONGUEUR_MAX,
  SUFFIXES_NON_PUBLICS,
  USER_AGENT,
  type CoucheHttp,
  type DependancesLecteur,
  type RequeteHttp,
  type Resolveur,
} from "./fetch-page";

/**
 * Point d'entrée « statut seulement » de `fetch-page.ts` (lot 2a : la spécification P0-programme-par-ia § 11.3, A14, A16 à
 * A18, A23 ; décision 0121 § 3 ; verdict de la Sécurité 0122 § 1). Résolveur et couche HTTP **simulés** : aucune
 * connexion, aucune résolution réelle. Les tests de `lire` (`fetch-page.test.ts`) restent inchangés.
 */

const PUBLIQUE = "45.10.20.30";
const SITE = "https://site-officiel.example.org/";

afterEach(() => {
  vi.useRealTimers();
});

type Reponse = { statut?: number; entetes?: Record<string, string>; octets?: number };

/** Corps simulé qui compte les morceaux réellement consommés (aucun ne doit l'être). */
function corpsCompte(octets: number, compteur: { lus: number }): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      for (let envoyes = 0; envoyes < octets; envoyes += 64 * 1024) {
        compteur.lus += 1;
        yield new Uint8Array(Math.min(64 * 1024, octets - envoyes));
      }
    },
  };
}

type Banc = {
  dependances: DependancesLecteur;
  requetes: RequeteHttp[];
  resolutions: string[];
  fermetures: { n: number };
  corpsLu: { lus: number };
};

function banc(options: { dns?: Record<string, string[]>; pages?: Record<string, Reponse>; http?: CoucheHttp; refus?: DependancesLecteur["refus"] } = {}): Banc {
  const requetes: RequeteHttp[] = [];
  const resolutions: string[] = [];
  const fermetures = { n: 0 };
  const corpsLu = { lus: 0 };
  const table = new Map(Object.entries(options.dns ?? { "site-officiel.example.org": [PUBLIQUE] }));
  const resoudre: Resolveur = async (hote) => {
    resolutions.push(hote);
    const adresses = table.get(hote);
    if (adresses === undefined) throw new Error("dns_failed");
    return adresses;
  };
  const pages = new Map(Object.entries(options.pages ?? { [SITE]: {} }));
  const http: CoucheHttp =
    options.http ??
    (async (requete) => {
      requetes.push(requete);
      const page = pages.get(`https://${requete.nomHote}${requete.chemin}`) ?? { statut: 404 };
      return {
        statut: page.statut ?? 200,
        entetes: page.entetes ?? { "content-type": "text/html" },
        corps: corpsCompte(page.octets ?? 1024, corpsLu),
        fermer: async () => {
          fermetures.n += 1;
        },
      };
    });
  return { dependances: { resoudre, http, ...(options.refus === undefined ? {} : { refus: options.refus }) }, requetes, resolutions, fermetures, corpsLu };
}

const verifier = async (adresse: string, options: Parameters<typeof banc>[0] = {}) => {
  const b = banc(options);
  const resultat = await creerVerificateurStatut(b.dependances).verifier(adresse);
  return { resultat, ...b };
};

describe("sites: forme de l'adresse proposée par l'IA (A14 ; 0122 § 1 conditions 3 et 4)", () => {
  it("programme: site de forme invalide retiré (schémas, port, identifiants, IP littérale, crochets, %)", () => {
    for (const brut of [
      "http://site-officiel.example.org/",
      "javascript:alert(1)",
      "data:text/html,<p>x</p>",
      "ftp://site-officiel.example.org/",
      "https://site-officiel.example.org:8443/",
      "https://moi:secret@site-officiel.example.org/",
      "https://45.10.20.30/",
      "https://2130706433/",
      "https://[2001:db8::1]/",
      "https://site%2eofficiel.example.org/",
      "pas une adresse",
      "",
    ]) {
      expect(reduireSite(brut), brut).toBeUndefined();
    }
    for (const brut of [undefined, null, 42, {}, ["https://site-officiel.example.org/"]]) expect(reduireSite(brut)).toBeUndefined();
    expect(reduireSite(`https://site-officiel.example.org/${"a".repeat(ADRESSE_BRUTE_MAX)}`)).toBeUndefined();
  });

  it("sites: hôte d'une seule étiquette et suffixe non public refusés sans résolution", async () => {
    const refuses = ["https://intranet/", ...SUFFIXES_NON_PUBLICS.map((suffixe) => `https://machine.${suffixe}/`), "https://localhost/"];
    for (const brut of refuses) expect(reduireSite(brut), brut).toBeUndefined();
    // Resserrement de la correction 1 de #694 (mineur Sécurité) : suffixes d'usage interne.
    for (const suffixe of ["lan", "corp", "intranet", "private", "localdomain", "home"]) {
      expect(SUFFIXES_NON_PUBLICS, suffixe).toContain(suffixe);
      expect(reduireSite(`https://nas.${suffixe}/`), suffixe).toBeUndefined();
    }
    // Un nom public dont une étiquette intérieure porte ces mots reste admis (seules les dernières étiquettes comptent).
    expect(reduireSite("https://home.example.org/")).toBe("https://home.example.org/");
    // Le vérificateur refait le contrôle : rien n'est résolu ni demandé.
    for (const brut of refuses) {
      const { resultat, resolutions, requetes } = await verifier(brut, { dns: { intranet: [PUBLIQUE], localhost: [PUBLIQUE] } });
      expect(resultat, brut).toEqual({ ok: false });
      expect(resolutions, brut).toEqual([]);
      expect(requetes, brut).toEqual([]);
    }
  });

  it("sites: hôte Google refusé à la forme (liste fermée de 0122 § 1 condition 4)", () => {
    const google = [
      "https://google.it/",
      "https://www.google.com/maps/place/x",
      "https://maps.google.com/",
      "https://google.co.uk/",
      "https://www.google.com.au/",
      "https://googleusercontent.com/x",
      "https://lh3.googleusercontent.com/x",
      "https://sites.google/x",
      ...DOMAINES_GOOGLE.map((domaine) => `https://${domaine}/x`),
      "https://maps.app.goo.gl/abc",
      "https://cdn.gstatic.com/x",
      "https://WWW.GOOGLE.FR./",
    ];
    for (const brut of google) expect(reduireSite(brut), brut).toBeUndefined();
    expect(estHoteGoogle("maps.google.com")).toBe(true);
    expect(estHoteGoogle("goo.gl")).toBe(true);
    expect(estHoteGoogle("sub.g.page")).toBe(true);
    // Resserrement de la correction 1 de #694 (mineur Sécurité) : services de Google ajoutés, sous-domaines compris.
    for (const hote of ["cafe.business.site", "app.page.link", "www.youtube.com", "m.youtube.com", "youtu.be"]) expect(estHoteGoogle(hote), hote).toBe(true);
    // Jamais par sous-chaîne : un domaine qui finit par les mêmes lettres sans point reste admis.
    for (const hote of ["notyoutube.com", "mybusiness.site.example.org", "homepage.link.example.org"]) expect(estHoteGoogle(hote), hote).toBe(false);
    // Comparaison par étiquette ou par suffixe précédé d'un point, jamais par sous-chaîne.
    expect(estHoteGoogle("notgoogle.com")).toBe(false);
    expect(estHoteGoogle("mygoo.gl.example.org")).toBe(false);
    expect(estHoteGoogle("xg.co")).toBe(false);
    expect(reduireSite("https://notgoogle.com/")).toBe("https://notgoogle.com/");
  });

  it("sites: réduction (paramètres et fragment retirés, hôte en minuscules) ; 300 caractères mesurés après réduction", () => {
    expect(reduireSite("https://WWW.Musee-Officiel.example.org/visite/fr.html?lang=fr&utm_source=x#horaires")).toBe("https://www.musee-officiel.example.org/visite/fr.html");
    expect(reduireSite("https://site-officiel.example.org")).toBe("https://site-officiel.example.org/");
    expect(reduireSite("https://site-officiel.example.org./?")).toBe("https://site-officiel.example.org/");
    expect(reduireSite("https://site-officiel.example.org:443/a")).toBe("https://site-officiel.example.org/a");
    // Hôte IDN : forme ASCII (punycode) rendue par URL.
    expect(reduireSite("https://müsee.example.org/")).toBe("https://xn--msee-0ra.example.org/");
    const base = "https://site-officiel.example.org/";
    const chemin = "a".repeat(SITE_LONGUEUR_MAX - base.length);
    expect(reduireSite(`${base}${chemin}`)).toBe(`${base}${chemin}`);
    expect(reduireSite(`${base}${chemin}b`)).toBeUndefined();
    // Plus long seulement à cause de ses paramètres : gardé réduit.
    expect(reduireSite(`${base}${chemin}?${"p".repeat(500)}#f`)).toBe(`${base}${chemin}`);
    // Idempotente : l'adresse réduite se réduit en elle-même.
    for (const brut of ["https://site-officiel.example.org/a?b#c", "https://müsee.example.org/"]) {
      const reduite = reduireSite(brut)!;
      expect(reduireSite(reduite)).toBe(reduite);
    }
  });
});

describe("sites: requête bornée (A16 à A18, A23 ; 0122 § 1 conditions 5 à 10)", () => {
  it("sites: hôte privé refusé sans connexion (une seule adresse interdite suffit)", async () => {
    for (const adresses of [["10.0.0.1"], ["127.0.0.1"], ["169.254.169.254"], ["192.168.1.1"], ["::1"], ["fc00::1"], [PUBLIQUE, "10.0.0.1"], ["fe80::1", PUBLIQUE]]) {
      const { resultat, requetes } = await verifier(SITE, { dns: { "site-officiel.example.org": adresses } });
      expect(resultat, adresses.join(",")).toEqual({ ok: false });
      expect(requetes, adresses.join(",")).toEqual([]);
    }
    // DNS en échec ou vide : refus, aucune connexion.
    for (const dns of [{}, { "site-officiel.example.org": [] }] as Record<string, string[]>[]) {
      const { resultat, requetes } = await verifier(SITE, { dns });
      expect(resultat).toEqual({ ok: false });
      expect(requetes).toEqual([]);
    }
  });

  it("sites: connexion à l'adresse vérifiée, nom d'hôte pour TLS, chemin de l'adresse réduite", async () => {
    const { resultat, requetes } = await verifier("https://site-officiel.example.org/visite", { pages: { "https://site-officiel.example.org/visite": {} } });
    expect(resultat).toEqual({ ok: true });
    expect(requetes).toHaveLength(1);
    expect(requetes[0]).toMatchObject({ adresse: PUBLIQUE, port: 443, nomHote: "site-officiel.example.org", chemin: "/visite" });
  });

  it("sites: adresse non réduite refusée par le vérificateur (seule une adresse réduite part)", async () => {
    for (const adresse of ["https://site-officiel.example.org/?a=1", "https://site-officiel.example.org/#x", "https://Site-Officiel.example.org/", "http://site-officiel.example.org/"]) {
      const { resultat, requetes, resolutions } = await verifier(adresse);
      expect(resultat, adresse).toEqual({ ok: false });
      expect(requetes.length + resolutions.length, adresse).toBe(0);
    }
  });

  it("sites: redirections bornées, chaque saut recontrôlé", async () => {
    const dns = {
      "site-officiel.example.org": [PUBLIQUE],
      "billetterie.example.net": [PUBLIQUE],
      "prive.example.net": ["10.1.2.3"],
      "maps.google.com": [PUBLIQUE],
      "sub.goo.gl": [PUBLIQUE],
      "g.page": [PUBLIQUE],
      intranet: [PUBLIQUE],
    };
    const redirige = (location: string, statut = 302): Reponse => ({ statut, entetes: { location } });
    // Redirection admise vers un autre domaine, avec requête gardée pour ce saut seulement : 2xx final, gardé.
    const admise = await verifier(SITE, { dns, pages: { [SITE]: redirige("https://billetterie.example.net/achat?ref=1"), "https://billetterie.example.net/achat?ref=1": {} } });
    expect(admise.resultat).toEqual({ ok: true });
    expect(admise.requetes.map((r) => `${r.nomHote}${r.chemin}`)).toEqual(["site-officiel.example.org/", "billetterie.example.net/achat?ref=1"]);
    expect(admise.fermetures.n).toBe(2);
    // Refus : http:, port, IP privée, Google (à chaque saut), une étiquette, destination trop longue.
    for (const location of [
      "http://billetterie.example.net/",
      "https://billetterie.example.net:8443/",
      "https://prive.example.net/",
      "https://10.0.0.1/",
      "https://maps.google.com/",
      "https://sub.goo.gl/x",
      "https://g.page/x",
      "https://intranet/",
      `https://billetterie.example.net/${"a".repeat(ADRESSE_BRUTE_MAX)}`,
    ]) {
      const { resultat, requetes } = await verifier(SITE, { dns, pages: { [SITE]: redirige(location), [location]: {} } });
      expect(resultat, location).toEqual({ ok: false });
      expect(requetes, location).toHaveLength(1);
    }
    // 3 redirections admises, la 4e refusée.
    const chaine = (n: number) =>
      Object.fromEntries([...Array.from({ length: n }, (_, i) => [i === 0 ? SITE : `${SITE}r${i}`, redirige(`${SITE}r${i + 1}`)]), [`${SITE}r${n}`, {}]]);
    expect((await verifier(SITE, { dns, pages: chaine(3) })).resultat).toEqual({ ok: true });
    const quatre = await verifier(SITE, { dns, pages: chaine(4) });
    expect(quatre.resultat).toEqual({ ok: false });
    expect(quatre.requetes).toHaveLength(4);
  });

  it("sites: redirection 300 ou 305 refusée ; 3xx sans Location refusé", async () => {
    for (const statut of [300, 304, 305, 306]) {
      const { resultat } = await verifier(SITE, { pages: { [SITE]: { statut, entetes: { location: `${SITE}ailleurs` } }, [`${SITE}ailleurs`]: {} } });
      expect(resultat, String(statut)).toEqual({ ok: false });
    }
    for (const statut of [301, 302, 303, 307, 308]) {
      const { resultat, requetes } = await verifier(SITE, { pages: { [SITE]: { statut, entetes: {} } } });
      expect(resultat, String(statut)).toEqual({ ok: false });
      expect(requetes).toHaveLength(1);
    }
  });

  it("sites: seul un statut 2xx garde le site", async () => {
    for (const statut of [200, 204, 299]) expect((await verifier(SITE, { pages: { [SITE]: { statut } } })).resultat, String(statut)).toEqual({ ok: true });
    for (const statut of [100, 199, 301, 400, 403, 404, 410, 429, 500, 503]) expect((await verifier(SITE, { pages: { [SITE]: { statut } } })).resultat, String(statut)).toEqual({ ok: false });
    // Erreur TLS ou réseau du transport : refus.
    const tls = banc({ http: async () => Promise.reject(Object.assign(new Error("certificate has expired"), { code: "CERT_HAS_EXPIRED" })) });
    expect(await creerVerificateurStatut(tls.dependances).verifier(SITE)).toEqual({ ok: false });
  });

  it("sites: statut seulement, type ignoré, corps non lu ou abandonné à 64 Kio, 5 s", async () => {
    // Type de contenu ignoré : PDF, image, sans type.
    for (const entetes of [{ "content-type": "application/pdf" }, { "content-type": "image/png" }, {}, { "content-encoding": "br" }] as Record<string, string>[]) {
      expect((await verifier(SITE, { pages: { [SITE]: { entetes } } })).resultat, JSON.stringify(entetes)).toEqual({ ok: true });
    }
    // Corps de 3 Mio : aucun octet lu (connexion fermée dès le statut), site gardé, pas de `too_large`.
    const gros = await verifier(SITE, { pages: { [SITE]: { octets: 3 * 1024 * 1024 } } });
    expect(gros.resultat).toEqual({ ok: true });
    expect(gros.corpsLu.lus).toBe(0);
    expect(gros.fermetures.n).toBe(1);
    // Aucune liste `urlsAutorisees` : le point d'entrée n'en reçoit pas.
    expect(creerVerificateurStatut(banc().dependances).verifier.length).toBeLessThanOrEqual(2);
  });

  it("sites: réponse après 6 s vidée (5 s, pas 10 s) ; réponse à 4 s gardée", async () => {
    vi.useFakeTimers();
    const lente = (delai: number): CoucheHttp => (requete) =>
      new Promise((resolve, reject) => {
        const minuterie = setTimeout(() => resolve({ statut: 200, entetes: {}, corps: corpsCompte(0, { lus: 0 }) }), delai);
        requete.signal.addEventListener("abort", () => {
          clearTimeout(minuterie);
          reject(new Error("aborted"));
        });
      });
    const apres6 = creerVerificateurStatut(banc({ http: lente(6_000) }).dependances).verifier(SITE);
    await vi.advanceTimersByTimeAsync(DELAI_STATUT_MS + 1);
    expect(await apres6).toEqual({ ok: false });
    const a4 = creerVerificateurStatut(banc({ http: lente(4_000) }).dependances).verifier(SITE);
    await vi.advanceTimersByTimeAsync(4_001);
    expect(await a4).toEqual({ ok: true });
    expect(DELAI_STATUT_MS).toBe(5_000);
  });

  it("sites: en-têtes envoyés : User-Agent, Accept et Accept-Encoding seulement, constants ; aucune décompression", async () => {
    const { requetes } = await verifier(SITE, { pages: { [SITE]: { entetes: { "content-encoding": "gzip", "set-cookie": "a=b" } } } });
    expect(Object.keys(requetes[0]!.entetes).sort()).toEqual(["accept", "accept-encoding", "user-agent"]);
    expect(requetes[0]!.entetes).toEqual({ "user-agent": USER_AGENT, accept: "*/*", "accept-encoding": "identity" });
    expect(Object.isFrozen(ENTETES_STATUT)).toBe(true);
    // Un cookie reçu n'est jamais renvoyé au saut suivant.
    const { requetes: sauts } = await verifier(SITE, {
      pages: { [SITE]: { statut: 302, entetes: { location: `${SITE}suite`, "set-cookie": "session=1" } }, [`${SITE}suite`]: {} },
    });
    expect(sauts).toHaveLength(2);
    for (const saut of sauts) expect(Object.keys(saut.entetes).sort()).toEqual(["accept", "accept-encoding", "user-agent"]);
  });

  it("sites: aucune requête hors mode réel (barrière fermée : zéro résolution, zéro connexion)", async () => {
    for (const refus of ["production_refused", "proxy_required", "tls_env_refused"] as const) {
      const b = banc({ refus });
      const verificateur = creerVerificateurStatut(b.dependances);
      expect(verificateur.barriereFermee).toBe(true);
      expect(await verificateur.verifier(SITE)).toEqual({ ok: false });
      expect(b.resolutions).toEqual([]);
      expect(b.requetes).toEqual([]);
    }
    const proxy = banc();
    expect(creerVerificateurStatut({ ...proxy.dependances, sortieParProxy: true }).barriereFermee).toBe(true);
    expect(creerVerificateurStatut(banc().dependances).barriereFermee).toBe(false);
  });

  it("sites: erreur du transport sans adresse ni message dans le résultat", async () => {
    const SENTINELLE = "SENTINELLE-ADRESSE-site-officiel.example.org/secret";
    const b = banc({ http: async () => Promise.reject(new Error(SENTINELLE)) });
    const resultat = await creerVerificateurStatut(b.dependances).verifier(SITE);
    expect(resultat).toEqual({ ok: false });
    expect(Object.keys(resultat)).toEqual(["ok"]);
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE");
  });

  it("sites: abandon externe, aucun Agent ouvert (réponse tardive fermée)", async () => {
    let resoudreTardive: (() => void) | undefined;
    const fermetures = { n: 0 };
    const http: CoucheHttp = () =>
      new Promise((resolve) => {
        resoudreTardive = () =>
          resolve({
            statut: 200,
            entetes: {},
            corps: corpsCompte(0, { lus: 0 }),
            fermer: async () => {
              fermetures.n += 1;
            },
          });
      });
    const controleur = new AbortController();
    const enCours = creerVerificateurStatut(banc({ http }).dependances).verifier(SITE, controleur.signal);
    await vi.waitFor(() => expect(resoudreTardive).toBeDefined());
    controleur.abort();
    expect(await enCours).toEqual({ ok: false });
    // La réponse arrive après l'abandon : elle est fermée (son Agent détruit), jamais gardée.
    resoudreTardive!();
    await vi.waitFor(() => expect(fermetures.n).toBe(1));
  });
});
