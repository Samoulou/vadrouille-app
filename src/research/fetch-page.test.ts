// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  analyserUrl,
  creerLecteurPages,
  DELAI_MAX_MS,
  ENTETE_ACCEPT,
  TAILLE_MAX_OCTETS,
  TYPES_CONTENU_ADMIS,
  USER_AGENT,
  type CoucheHttp,
  type RequeteHttp,
  type Resolveur,
} from "./fetch-page";

const PUBLIQUE = "45.10.20.30";

function resolveur(table: Record<string, string[]>): Resolveur {
  const parHote = new Map(Object.entries(table));
  return async (hote) => {
    const adresses = parHote.get(hote);
    if (adresses === undefined) throw new Error("introuvable");
    return adresses;
  };
}

async function* corps(...morceaux: (string | Uint8Array)[]): AsyncIterable<Uint8Array> {
  for (const morceau of morceaux) yield typeof morceau === "string" ? new TextEncoder().encode(morceau) : morceau;
}

type Page = { statut?: number; entetes?: Record<string, string>; corps?: () => AsyncIterable<Uint8Array> };

function http(pages: Record<string, Page>, capture: RequeteHttp[] = []): CoucheHttp {
  const parUrl = new Map(Object.entries(pages));
  return async (requete) => {
    capture.push(requete);
    const page = parUrl.get(`https://${requete.nomHote}${requete.chemin}`);
    if (page === undefined) return { statut: 404, entetes: {}, corps: corps() };
    return {
      statut: page.statut ?? 200,
      entetes: page.entetes ?? { "content-type": "text/html" },
      corps: page.corps?.() ?? corps("<p>Bonjour</p>"),
    };
  };
}

const lire = async (url: string, options: { dns?: Record<string, string[]>; pages?: Record<string, Page>; autorisees?: string[] } = {}) => {
  const capture: RequeteHttp[] = [];
  const lecteur = creerLecteurPages({
    resoudre: resolveur(options.dns ?? { "exemple.org": [PUBLIQUE] }),
    http: http(options.pages ?? { [url]: {} }, capture),
  });
  const resultat = await lecteur.lire(url, new Set(options.autorisees ?? [url]));
  return { resultat, capture };
};

afterEach(() => {
  vi.useRealTimers();
});

describe("recherche: le lecteur de pages refuse les adresses internes", () => {
  it("refuse si une seule des adresses résolues est interdite", async () => {
    const { resultat, capture } = await lire("https://exemple.org/", { dns: { "exemple.org": [PUBLIQUE, "10.0.0.1"] } });
    expect(resultat).toEqual({ ok: false, raison: "address_blocked" });
    expect(capture).toHaveLength(0);
  });

  it("refuse une adresse IPv6 hors 2000::/3 et accepte une adresse unicast globale", async () => {
    expect((await lire("https://exemple.org/", { dns: { "exemple.org": ["4000::1"] } })).resultat).toEqual({
      ok: false,
      raison: "address_blocked",
    });
    expect((await lire("https://exemple.org/", { dns: { "exemple.org": ["2a00:1450:4001::1"] } })).resultat.ok).toBe(true);
  });

  it("refuse une redirection d'une URL publique vers une IP privée", async () => {
    const { resultat } = await lire("https://exemple.org/", {
      dns: { "exemple.org": [PUBLIQUE], "interne.example": ["192.168.1.10"] },
      pages: { "https://exemple.org/": { statut: 302, entetes: { location: "https://interne.example/admin" } } },
    });
    expect(resultat).toEqual({ ok: false, raison: "address_blocked" });
    const litterale = await lire("https://exemple.org/", {
      pages: { "https://exemple.org/": { statut: 301, entetes: { location: "https://169.254.169.254/latest" } } },
    });
    expect(litterale.resultat).toEqual({ ok: false, raison: "ip_literal" });
  });
});

describe("recherche: le lecteur de pages refuse les formes d'adresse alternatives, les ports non standard et les réponses trop grosses après décompression", () => {
  // Décision 0096 § 1 (B7-TL-5). Ce test est écrit EN PREMIER : l'admission du type (`estTypeAdmis`) et son traitement
  // (`extraireTexte` ou texte brut) sont deux endroits distincts ; n'élargir que le premier lirait la page comme du texte.
  it("lit application/xhtml+xml comme text/html (texte identique à celui de la même page servie en text/html)", async () => {
    const page =
      '<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>T</title><script>alert(1)</script></head><body><p>Texte <b>utile</b></p><style>x{}</style></body></html>';
    const lectureHtml = await lire("https://exemple.org/", {
      pages: {
        "https://exemple.org/": {
          entetes: { "content-type": "text/html" },
          corps: () => corps(page),
        },
      },
    });
    for (const type of [
      "application/xhtml+xml",
      "application/xhtml+xml; charset=utf-8",
      "APPLICATION/XHTML+XML;charset=UTF-8",
      " Application/Xhtml+Xml ; q=1",
    ]) {
      const lectureXhtml = await lire("https://exemple.org/", {
        pages: {
          "https://exemple.org/": {
            entetes: { "content-type": type },
            corps: () => corps(page),
          },
        },
      });
      expect(lectureXhtml.resultat, type).toEqual(lectureHtml.resultat);
    }
    expect(lectureHtml.resultat.ok).toBe(true);
    if (lectureHtml.resultat.ok) {
      expect(lectureHtml.resultat.texte).toContain("Texte utile");
      expect(lectureHtml.resultat.texte).not.toMatch(/[<>]|alert/);
    }
  });

  it("n'envoie que les types admis dans l'en-tête accept (constante du module)", async () => {
    const { capture } = await lire("https://exemple.org/");
    expect(ENTETE_ACCEPT).toBe("text/html, application/xhtml+xml, text/plain");
    expect(TYPES_CONTENU_ADMIS).toEqual([
      "text/html",
      "application/xhtml+xml",
      "text/plain",
    ]);
    expect(capture[0]?.entetes.accept).toBe(ENTETE_ACCEPT);
  });

  it.each([
    "application/xml",
    "text/xml",
    "image/svg+xml",
    "application/json",
    "application/xhtml",
    "application/xhtml+xml+x",
    "text/html+xml",
  ])("refuse le type %s (content_type), sans lire le corps", async (type) => {
    let lu = false;
    const { resultat } = await lire("https://exemple.org/", {
      pages: {
        "https://exemple.org/": {
          entetes: { "content-type": type },
          corps: () => ({
            [Symbol.asyncIterator]() {
              lu = true;
              return corps("<p>x</p>")[Symbol.asyncIterator]();
            },
          }),
        },
      },
    });
    expect(resultat).toEqual({ ok: false, raison: "content_type" });
    expect(lu).toBe(false);
  });

  it("lit une page application/xhtml+xml avec <?xml?>, DOCTYPE à entité et CDATA sans résoudre d'entité ni ouvrir le réseau", async () => {
    const page =
      '<?xml version="1.0"?><!DOCTYPE html [<!ENTITY secret SYSTEM "file:///etc/passwd"><!ENTITY ext SYSTEM "https://interne.example/x">]>' +
      '<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Avant &secret; &ext; apres</p><![CDATA[contenu cdata]]></body></html>';
    const capture: RequeteHttp[] = [];
    const resolus: string[] = [];
    const lecteur = creerLecteurPages({
      resoudre: async (hote) => {
        resolus.push(hote);
        return [PUBLIQUE];
      },
      http: http(
        {
          "https://exemple.org/": {
            entetes: { "content-type": "application/xhtml+xml" },
            corps: () => corps(page),
          },
        },
        capture,
      ),
    });
    const resultat = await lecteur.lire(
      "https://exemple.org/",
      new Set(["https://exemple.org/"]),
    );
    expect(resultat.ok).toBe(true);
    if (resultat.ok) {
      expect(resultat.texte).toContain("Avant");
      expect(resultat.texte).toContain("apres");
      expect(resultat.texte).not.toContain("root:");
    }
    // Une seule requête, un seul nom résolu : aucune entité n'a déclenché d'accès.
    expect(capture).toHaveLength(1);
    expect(resolus).toEqual(["exemple.org"]);
  });

  it("refuse une page application/xhtml+xml en gzip de plus de 2 Mo une fois décompressée", async () => {
    const compresse = gzipSync(Buffer.alloc(TAILLE_MAX_OCTETS + 1024, 97));
    expect(compresse.byteLength).toBeLessThan(TAILLE_MAX_OCTETS);
    const { resultat } = await lire("https://exemple.org/", {
      pages: {
        "https://exemple.org/": {
          entetes: {
            "content-type": "application/xhtml+xml",
            "content-encoding": "gzip",
          },
          corps: () => corps(new Uint8Array(compresse)),
        },
      },
    });
    expect(resultat).toEqual({ ok: false, raison: "too_large" });
  });

  it.each([
    ["http://exemple.org/", "scheme"],
    ["https://exemple.org:80/", "port"],
    ["https://exemple.org:8443/", "port"],
    ["https://exemple.org:444/", "port"],
  ])("refuse %s (%s), sans aucune requête", async (url, raison) => {
    const { resultat, capture } = await lire(url);
    expect(resultat).toEqual({ ok: false, raison });
    expect(capture).toHaveLength(0);
  });

  it("refuse une redirection vers http:// ou vers le port 80", async () => {
    for (const location of [
      "http://exemple.org/suite",
      "https://exemple.org:80/suite",
      "https://exemple.org:8443/suite",
    ]) {
      const { resultat } = await lire("https://exemple.org/", {
        pages: {
          "https://exemple.org/": { statut: 302, entetes: { location } },
        },
      });
      expect(resultat.ok, location).toBe(false);
      if (!resultat.ok) expect(["scheme", "port"]).toContain(resultat.raison);
    }
  });

  it.each([
    ["http://exemple.org/", "scheme"],
    ["file:///etc/passwd", "scheme"],
    ["data:text/html,bonjour", "scheme"],
    ["ftp://exemple.org/", "scheme"],
    ["javascript:alert(1)", "scheme"],
    ["https://moi:secret@exemple.org/", "credentials"],
    ["https://exemple.org:8443/", "port"],
    ["https://2130706433/", "ip_literal"],
    ["https://0177.0.0.1/", "ip_literal"],
    ["https://0x7f.1/", "ip_literal"],
    ["https://127.0.0.1/", "ip_literal"],
    ["https://[::1]/", "bracketed_host"],
    ["https://[::ffff:127.0.0.1]/", "bracketed_host"],
    ["https://[::ffff:7f00:1]/", "bracketed_host"],
    ["https://[fe80::1%25eth0]/", "bracketed_host"],
    ["https://[exemple.com]/", "bracketed_host"],
  ])("refuse %s (%s), sans aucune requête", async (url, raison) => {
    const { resultat, capture } = await lire(url);
    expect(resultat).toEqual({ ok: false, raison });
    expect(capture).toHaveLength(0);
  });

  it("normalise le nom d'hôte avant la résolution (minuscules, point final, IDN)", async () => {
    expect(analyserUrl("https://EXEMPLE.org./a").hote).toBe("exemple.org");
    expect(analyserUrl("https://bücher.example/a").hote).toBe(
      "xn--bcher-kva.example",
    );
    const resolus: string[] = [];
    const lecteur = creerLecteurPages({
      resoudre: async (hote) => {
        resolus.push(hote);
        return [PUBLIQUE];
      },
      http: http({ "https://xn--bcher-kva.example/a": {} }),
    });
    const resultat = await lecteur.lire(
      "https://BÜCHER.example./a",
      new Set(["https://bücher.example/a"]),
    );
    expect(resultat.ok).toBe(true);
    expect(resolus).toEqual(["xn--bcher-kva.example"]);
  });

  it("coupe une page géante à 2 Mo et l'ignore", async () => {
    const morceau = new Uint8Array(512 * 1024).fill(97);
    const { resultat } = await lire("https://exemple.org/", {
      pages: { "https://exemple.org/": { entetes: { "content-type": "text/plain" }, corps: () => corps(morceau, morceau, morceau, morceau, morceau) } },
    });
    expect(resultat).toEqual({ ok: false, raison: "too_large" });
  });

  it("refuse un corps compressé qui dépasse 2 Mo une fois décompressé", async () => {
    const compresse = gzipSync(Buffer.alloc(TAILLE_MAX_OCTETS + 1024, 97));
    expect(compresse.byteLength).toBeLessThan(TAILLE_MAX_OCTETS);
    const { resultat } = await lire("https://exemple.org/", {
      pages: {
        "https://exemple.org/": {
          entetes: { "content-type": "text/plain", "content-encoding": "gzip" },
          corps: () => corps(new Uint8Array(compresse)),
        },
      },
    });
    expect(resultat).toEqual({ ok: false, raison: "too_large" });
  });

  it("décompresse lui-même un petit corps gzip et refuse un codage inconnu", async () => {
    const compresse = new Uint8Array(gzipSync(Buffer.from("Texte compressé")));
    const ok = await lire("https://exemple.org/", {
      pages: { "https://exemple.org/": { entetes: { "content-type": "text/plain", "content-encoding": "gzip" }, corps: () => corps(compresse) } },
    });
    expect(ok.resultat).toEqual({ ok: true, texte: "Texte compressé" });
    const br = await lire("https://exemple.org/", {
      pages: { "https://exemple.org/": { entetes: { "content-type": "text/plain", "content-encoding": "br" } } },
    });
    expect(br.resultat).toEqual({ ok: false, raison: "content_encoding" });
  });

  it("ignore un Content-Type application/octet-stream sans lire le corps", async () => {
    let lu = false;
    const { resultat } = await lire("https://exemple.org/", {
      pages: {
        "https://exemple.org/": {
          entetes: { "content-type": "application/octet-stream" },
          corps: () => ({
            [Symbol.asyncIterator]() {
              lu = true;
              return corps("x")[Symbol.asyncIterator]();
            },
          }),
        },
      },
    });
    expect(resultat).toEqual({ ok: false, raison: "content_type" });
    expect(lu).toBe(false);
  });
});

describe("p0: lecture de pages, garde SSRF", () => {
  it("lit une page publique autorisée et n'en rend que le texte", async () => {
    const { resultat } = await lire("https://exemple.org/page", {
      pages: {
        "https://exemple.org/page": {
          corps: () =>
            corps("<html><script>alert(1)</script><p>Texte utile</p></html>"),
        },
      },
    });
    expect(resultat).toEqual({ ok: true, texte: "Texte utile" });
  });

  it("p0: aucune URL lue hors des résultats de recherche (not_in_search_results)", async () => {
    const { resultat, capture } = await lire("https://exemple.org/autre", {
      autorisees: ["https://exemple.org/page"],
    });
    expect(resultat).toEqual({ ok: false, raison: "not_in_search_results" });
    expect(capture).toHaveLength(0);
  });

  it("suit 3 redirections au plus et refuse la quatrième", async () => {
    const chaine = (n: number): Record<string, Page> =>
      Object.fromEntries(
        Array.from({ length: n + 1 }, (_, i) => [
          `https://exemple.org/${i}`,
          i < n ? { statut: 302, entetes: { location: `/${i + 1}` } } : {},
        ]),
      );
    expect(
      (await lire("https://exemple.org/0", { pages: chaine(3) })).resultat.ok,
    ).toBe(true);
    expect(
      (await lire("https://exemple.org/0", { pages: chaine(4) })).resultat,
    ).toEqual({ ok: false, raison: "too_many_redirects" });
  });

  it("coupe à 10 s une résolution DNS lente", async () => {
    vi.useFakeTimers();
    const lecteur = creerLecteurPages({ resoudre: () => new Promise(() => undefined), http: http({}) });
    const promesse = lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]));
    await vi.advanceTimersByTimeAsync(DELAI_MAX_MS + 1);
    await expect(promesse).resolves.toEqual({ ok: false, raison: "timeout" });
  });

  it("coupe à 10 s un corps envoyé lentement", async () => {
    vi.useFakeTimers();
    const lent: AsyncIterable<Uint8Array> = {
      [Symbol.asyncIterator]() {
        let premier = true;
        return {
          next: () => {
            if (premier) {
              premier = false;
              return Promise.resolve({ value: new TextEncoder().encode("début"), done: false });
            }
            return new Promise(() => undefined);
          },
        };
      },
    };
    const lecteur = creerLecteurPages({
      resoudre: resolveur({ "exemple.org": [PUBLIQUE] }),
      http: async () => ({ statut: 200, entetes: { "content-type": "text/plain" }, corps: lent }),
    });
    const promesse = lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]));
    await vi.advanceTimersByTimeAsync(DELAI_MAX_MS + 1);
    await expect(promesse).resolves.toEqual({ ok: false, raison: "timeout" });
  });

  it("n'envoie ni cookie, ni en-tête Authorization, avec un User-Agent fixe", async () => {
    const { capture } = await lire("https://exemple.org/", {
      pages: { "https://exemple.org/": { entetes: { "content-type": "text/html", "set-cookie": "a=b" } } },
    });
    const noms = Object.keys(capture[0]?.entetes ?? {}).map((nom) => nom.toLowerCase());
    expect(noms).not.toContain("cookie");
    expect(noms).not.toContain("authorization");
    expect(capture[0]?.entetes["user-agent"]).toBe(USER_AGENT);
  });

  it("le module de lecture n'importe aucun module d'environnement ni process.env", () => {
    const source = readFileSync(join(process.cwd(), "src/research/fetch-page.ts"), "utf8");
    expect(source).not.toMatch(/process\.env|@\/server\/env|import\.meta\.env/);
  });

  it("raison proxy_required quand la sortie exige un proxy non vérifié", async () => {
    const lecteur = creerLecteurPages({ resoudre: resolveur({}), http: http({}), sortieParProxy: true });
    expect(await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]))).toEqual({ ok: false, raison: "proxy_required" });
  });
});

describe("recherche: le lecteur de pages refuse les adresses internes", () => {
  it("se connecte à l'adresse vérifiée, avec le nom d'hôte pour TLS et SNI", async () => {
    let appels = 0;
    const capture: RequeteHttp[] = [];
    const lecteur = creerLecteurPages({
      // Première résolution publique, toute résolution suivante privée (« DNS rebinding »).
      resoudre: async () => (appels++ === 0 ? [PUBLIQUE] : ["127.0.0.1"]),
      http: http({ "https://exemple.org/": {} }, capture),
    });
    const resultat = await lecteur.lire("https://exemple.org/", new Set(["https://exemple.org/"]));
    expect(resultat.ok).toBe(true);
    expect(appels).toBe(1);
    expect(capture).toHaveLength(1);
    expect(capture[0]).toMatchObject({ adresse: PUBLIQUE, port: 443, nomHote: "exemple.org", chemin: "/" });
  });
});

describe("p0: lecture de pages, variables de proxy ignorées", () => {
  it("avec HTTPS_PROXY et HTTP_PROXY posées, la connexion part directement vers l'adresse vérifiée", async () => {
    vi.stubEnv("HTTPS_PROXY", "http://proxy.example:3128");
    vi.stubEnv("HTTP_PROXY", "http://proxy.example:3128");
    try {
      const { resultat, capture } = await lire("https://exemple.org/");
      expect(resultat.ok).toBe(true);
      expect(capture.map((requete) => requete.adresse)).toEqual([PUBLIQUE]);
      expect(JSON.stringify(capture.map((requete) => ({ ...requete, signal: undefined })))).not.toContain("proxy");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
