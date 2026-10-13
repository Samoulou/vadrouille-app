/*
 * Aiguillage du service worker (spécification F10, F10b ; F10-TL-4, F10-PO-8 à F10-PO-11). Fonctions pures, sans
 * horloge ni stockage : `public/sw.js` les charge par `importScripts("/sw-route.js")`, et
 * `tests/unit/sw-route.test.ts` les exécute dans un contexte isolé.
 *
 * Trois réponses seulement :
 * - `navigation` : navigation de l'application (`/p/` compris) ; réseau, sans écriture, réponse rendue telle
 *   quelle (erreurs HTTP comprises) ; redirection vers la page de repli seulement si le réseau échoue ;
 * - `repli` : navigation vers la page de repli elle-même ; réseau, puis la coquille du cache, jamais redirigée ;
 * - `interface` : ressources de l'application sous `/_next/static/` (scripts, styles, polices) ; cache, puis
 *   réseau, sans écriture ;
 * - `aucune` : tout le reste (autre origine dont Google, requêtes de données de Next.js, actions serveur, `POST`,
 *   `/api/`) ; le service worker ne répond pas.
 */
(function (scope) {
  "use strict";

  /** Adresse de la page de repli (`R-repli`, F10-TL-3), sans paramètre. */
  var FALLBACK_PATH = "/hors-ligne";
  /** Préfixe des caches de l'interface ; le reste du nom vient des ressources enregistrées (version du build). */
  var CACHE_PREFIX = "vadrouille-interface-";
  var STATIC_PREFIX = "/_next/static/";

  /** Requête de données du routeur de Next.js (RSC, préchargement) ou action serveur : jamais servie. */
  function isNextDataRequest(url, headers) {
    if (url.searchParams.has("_rsc")) return true;
    return (
      headers.get("RSC") !== null ||
      headers.get("Next-Router-Prefetch") !== null ||
      headers.get("Next-Router-State-Tree") !== null ||
      headers.get("Next-Action") !== null
    );
  }

  /**
   * Décide de la réponse à une requête. `request` : `{ url, method, mode, headers }` (une `Request`, ou son
   * équivalent dans les tests) ; `origin` : origine de l'application.
   */
  function routeRequest(request, origin) {
    if (request.method !== "GET") return "aucune";
    var url = new URL(request.url);
    if (url.origin !== origin) return "aucune";
    if (isNextDataRequest(url, request.headers)) return "aucune";
    if (url.pathname.indexOf("/api/") === 0) return "aucune";
    if (request.mode === "navigate") return url.pathname === FALLBACK_PATH ? "repli" : "navigation";
    if (url.pathname.indexOf(STATIC_PREFIX) === 0) return "interface";
    return "aucune";
  }

  /** Seule une réponse 200 de la même origine, ni redirigée ni opaque, entre dans le cache. */
  function isCacheable(response) {
    return response.status === 200 && response.type === "basic" && !response.redirected;
  }

  /**
   * Ressources de l'application référencées par un document ou une feuille de style : adresses de la même origine
   * sous `/_next/static/`, sans doublon, triées. `base` : adresse du document ou de la feuille (les polices d'une
   * feuille de style sont relatives à elle).
   */
  function staticAssets(text, base) {
    var origin = new URL(base).origin;
    var found = {};
    var pattern = /(?:src|href)=["']([^"']+)["']|url\(\s*["']?([^"')\s]+)["']?\s*\)/g;
    var match;
    while ((match = pattern.exec(text)) !== null) {
      var raw = (match[1] || match[2] || "").replace(/&amp;/g, "&");
      var url;
      try {
        url = new URL(raw, base);
      } catch {
        continue;
      }
      if (url.origin === origin && url.pathname.indexOf(STATIC_PREFIX) === 0) found[url.pathname + url.search] = true;
    }
    return Object.keys(found).sort();
  }

  /** Nom du cache de l'interface : empreinte des adresses enregistrées (les noms de fichiers de Next.js changent à chaque build). */
  function cacheName(paths) {
    var hash = 5381;
    var text = paths.join("\n");
    for (var i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
    return CACHE_PREFIX + hash.toString(16);
  }

  /** Caches à supprimer à l'activation : les caches de l'interface, sauf le dernier créé. */
  function staleCaches(keys) {
    var ours = keys.filter(function (key) {
      return key.indexOf(CACHE_PREFIX) === 0;
    });
    return ours.slice(0, -1);
  }

  scope.vadrouilleSwRoute = {
    FALLBACK_PATH: FALLBACK_PATH,
    CACHE_PREFIX: CACHE_PREFIX,
    routeRequest: routeRequest,
    isCacheable: isCacheable,
    staticAssets: staticAssets,
    cacheName: cacheName,
    staleCaches: staleCaches,
  };
})(self);
