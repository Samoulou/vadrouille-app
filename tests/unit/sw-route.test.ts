// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";

import { describe, expect, it } from "vitest";

/**
 * Aiguillage du service worker (spécification F10, F10b ; F10-TL-4, critère C26) : `public/sw-route.js`, script
 * classique chargé par `public/sw.js`, exécuté ici dans un contexte isolé (seuls `URL` et `self` y sont fournis :
 * ni horloge, ni stockage).
 */

interface SwRoute {
  FALLBACK_PATH: string;
  CACHE_PREFIX: string;
  routeRequest(request: { url: string; method: string; mode: string; headers: Headers }, origin: string): string;
  isCacheable(response: { status: number; type: string; redirected: boolean }): boolean;
  staticAssets(text: string, base: string): string[];
  cacheName(paths: string[]): string;
  staleCaches(keys: string[]): string[];
}

function loadRoute(): SwRoute {
  const source = readFileSync(join(process.cwd(), "public", "sw-route.js"), "utf8");
  const self: { vadrouilleSwRoute?: SwRoute } = {};
  runInNewContext(source, { self, URL });
  if (!self.vadrouilleSwRoute) throw new Error("aiguillage absent");
  return self.vadrouilleSwRoute;
}

const route = loadRoute();
const ORIGIN = "https://vadrouille.example";

function request(path: string, init: { method?: string; mode?: string; headers?: Record<string, string> } = {}) {
  return {
    url: path.startsWith("http") ? path : `${ORIGIN}${path}`,
    method: init.method ?? "GET",
    mode: init.mode ?? "no-cors",
    headers: new Headers(init.headers ?? {}),
  };
}

const navigate = (path: string) => request(path, { mode: "navigate" });

describe("service worker : aiguillage (F10-TL-4)", () => {
  it("page de repli à /hors-ligne, caches préfixés", () => {
    expect(route.FALLBACK_PATH).toBe("/hors-ligne");
    expect(route.CACHE_PREFIX).toBe("vadrouille-interface-");
  });

  it.each([
    "/",
    "/voyages/mock_trip_edimbourg",
    "/voyages/mock_trip_edimbourg/aujourdhui",
    "/voyages/mock_trip_edimbourg/jour/2?etape=x",
    "/voyages/inconnu/aujourdhui",
    "/p/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd",
    "/p/AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcd/jour/2",
    "/dev/composants",
  ])("navigation de l'origine vers %s : réseau, page de repli si échec", (path) => {
    expect(route.routeRequest(navigate(path), ORIGIN)).toBe("navigation");
  });

  it("navigation vers /hors-ligne : servie depuis le cache si le réseau échoue, jamais redirigée", () => {
    expect(route.routeRequest(navigate("/hors-ligne"), ORIGIN)).toBe("repli");
  });

  it.each(["/_next/static/chunks/app.js", "/_next/static/css/app.css", "/_next/static/media/hanken.woff2"])(
    "%s : ressource de l'interface",
    (path) => {
      expect(route.routeRequest(request(path), ORIGIN)).toBe("interface");
    },
  );

  it.each([
    ["requête RSC (paramètre _rsc)", request("/voyages/mock_trip_edimbourg?_rsc=abc")],
    ["requête RSC (en-tête RSC)", request("/voyages/mock_trip_edimbourg", { headers: { RSC: "1" } })],
    ["préchargement du routeur", request("/voyages/mock_trip_edimbourg", { headers: { "Next-Router-Prefetch": "1" } })],
    ["état du routeur", request("/voyages/mock_trip_edimbourg", { headers: { "Next-Router-State-Tree": "x" } })],
    ["navigation RSC (en-tête RSC)", request("/p/x", { mode: "navigate", headers: { RSC: "1" } })],
    ["action serveur", request("/voyages/mock_trip_edimbourg", { method: "POST", headers: { "Next-Action": "a" } })],
    ["POST", request("/voyages/mock_trip_edimbourg", { method: "POST" })],
    ["POST d'une navigation", request("/voyages/mock_trip_edimbourg", { method: "POST", mode: "navigate" })],
    ["/api/", request("/api/simulation")],
    ["autre ressource de l'origine", request("/icons/icone-192.png")],
    ["manifeste", request("/manifest.webmanifest")],
    ["autre origine", request("https://example.org/_next/static/chunks/app.js")],
    ["navigation d'une autre origine", navigate("https://example.org/")],
    ["Maps JavaScript", request("https://maps.googleapis.com/maps/api/js?key=x")],
    ["tuiles et images de Maps", request("https://maps.gstatic.com/mapfiles/x.png")],
    ["données de lieux", request("https://places.googleapis.com/v1/places/x")],
    ["polices de Google", request("https://fonts.gstatic.com/s/hanken/x.woff2")],
  ])("%s : aucune réponse du service worker", (_name, req) => {
    expect(route.routeRequest(req, ORIGIN)).toBe("aucune");
  });

  it("aucune règle n'écrit un document de /voyages/, /p/ ou /dev/ : seules la coquille et l'interface s'enregistrent", () => {
    for (const path of ["/voyages/x", "/voyages/x/aujourdhui", "/p/x", "/p/x/jour/2", "/dev/carte"]) {
      for (const req of [navigate(path), request(path), request(`${path}?_rsc=1`)]) {
        expect(["navigation", "aucune"]).toContain(route.routeRequest(req, ORIGIN));
      }
    }
  });

  it("ne met en cache qu'une réponse 200 de la même origine, ni redirigée ni opaque (C26)", () => {
    expect(route.isCacheable({ status: 200, type: "basic", redirected: false })).toBe(true);
    expect(route.isCacheable({ status: 404, type: "basic", redirected: false })).toBe(false);
    expect(route.isCacheable({ status: 500, type: "basic", redirected: false })).toBe(false);
    expect(route.isCacheable({ status: 200, type: "basic", redirected: true })).toBe(false);
    expect(route.isCacheable({ status: 0, type: "opaque", redirected: false })).toBe(false);
    expect(route.isCacheable({ status: 0, type: "opaqueredirect", redirected: false })).toBe(false);
    expect(route.isCacheable({ status: 200, type: "cors", redirected: false })).toBe(false);
  });

  it("ressources d'un document : scripts, styles et polices de l'application seulement, sans doublon", () => {
    const html = `<link rel="stylesheet" href="/_next/static/css/a.css?dpl=1&amp;x=2"/>
      <link rel="preload" as="font" href="/_next/static/media/h.woff2"/>
      <script src="/_next/static/chunks/b.js"></script><script src="/_next/static/chunks/b.js"></script>
      <script src="https://maps.googleapis.com/maps/api/js"></script>
      <link rel="manifest" href="/manifest.webmanifest"/><a href="/voyages/x">x</a>`;
    expect(route.staticAssets(html, `${ORIGIN}/hors-ligne`)).toEqual([
      "/_next/static/chunks/b.js",
      "/_next/static/css/a.css?dpl=1&x=2",
      "/_next/static/media/h.woff2",
    ]);
  });

  it("polices d'une feuille de style : adresses relatives à la feuille", () => {
    const css = `@font-face{src:url(../media/h.woff2) format("woff2")}@font-face{src:url("https://fonts.gstatic.com/x.woff2")}`;
    expect(route.staticAssets(css, `${ORIGIN}/_next/static/css/a.css`)).toEqual(["/_next/static/media/h.woff2"]);
  });

  it("nom du cache : stable pour les mêmes ressources, différent pour un autre build", () => {
    const a = route.cacheName(["/_next/static/chunks/a.js"]);
    expect(a).toMatch(/^vadrouille-interface-[0-9a-f]+$/);
    expect(route.cacheName(["/_next/static/chunks/a.js"])).toBe(a);
    expect(route.cacheName(["/_next/static/chunks/b.js"])).not.toBe(a);
  });

  it("activation : supprime les caches de l'interface des builds précédents, garde le dernier créé", () => {
    expect(route.staleCaches(["vadrouille-interface-1", "autre", "vadrouille-interface-2", "vadrouille-interface-3"])).toEqual([
      "vadrouille-interface-1",
      "vadrouille-interface-2",
    ]);
    expect(route.staleCaches(["vadrouille-interface-1"])).toEqual([]);
    expect(route.staleCaches([])).toEqual([]);
  });
});

describe("service worker : sources (F10-PO-11)", () => {
  const sw = readFileSync(join(process.cwd(), "public", "sw.js"), "utf8");
  const swRoute = readFileSync(join(process.cwd(), "public", "sw-route.js"), "utf8");

  it("n'importe que l'aiguillage de l'application", () => {
    expect(sw.match(/importScripts\(([^)]*)\)/g)).toEqual(['importScripts("/sw-route.js")']);
  });

  it.each([
    ["IndexedDB", /indexedDB/],
    ["Web Storage", /localStorage|sessionStorage/],
    ["cookie", /cookie/i],
    ["heure", /Date|performance\.now/],
    ["adresse d'une autre origine", /https?:\/\//],
  ])("ni %s dans le code exécuté", (_name, pattern) => {
    const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code(sw)).not.toMatch(pattern);
    expect(code(swRoute)).not.toMatch(pattern);
  });
});
