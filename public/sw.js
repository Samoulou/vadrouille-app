/*
 * Service worker de Vadrouille (spécification F10, F10b ; F10-TL-4). Enregistré seulement par l'écran 15
 * (`src/lib/offline/register.ts`). Il ne sert qu'une chose : la page de repli `/hors-ligne` quand une navigation
 * échoue faute de réseau. Aucune donnée du voyage, aucune réponse d'une autre origine (Google compris), aucun
 * document autre que la coquille de la page de repli, aucune requête de données de Next.js ; ni IndexedDB, ni Web
 * Storage, ni cookie, ni lecture de l'heure (F10-PO-11, décision de Samuel sur Q137 et Q139).
 */
importScripts("/sw-route.js");

var route = self.vadrouilleSwRoute;

/** Lit une ressource pour l'enregistrer : réponse 200 de la même origine, ni redirigée ni opaque, sinon rien. */
function fetchCacheable(url) {
  return fetch(url, { cache: "no-store", credentials: "omit" }).then(function (response) {
    if (!route.isCacheable(response)) throw new Error("ressource non enregistrable");
    return response;
  });
}

/**
 * Installation : la coquille de la page de repli et les scripts, styles et polices qu'elle référence, dans un cache
 * nommé d'après ces ressources (les noms de fichiers de Next.js changent à chaque build).
 */
function precache() {
  var origin = self.location.origin;
  var shellUrl = origin + route.FALLBACK_PATH;
  return fetchCacheable(shellUrl).then(function (shell) {
    return shell
      .clone()
      .text()
      .then(function (html) {
        var assets = route.staticAssets(html, shellUrl);
        var styles = assets.filter(function (path) {
          return /\.css(\?|$)/.test(path);
        });
        return Promise.all(
          styles.map(function (path) {
            return fetchCacheable(origin + path).then(function (response) {
              return response.text().then(function (css) {
                return route.staticAssets(css, origin + path);
              });
            });
          }),
        ).then(function (nested) {
          var all = assets.concat.apply(assets, nested).filter(function (path, index, list) {
            return list.indexOf(path) === index;
          });
          all.sort();
          var name = route.cacheName(all);
          // Cache recréé de zéro : l'ordre de création des caches désigne le plus récent à l'activation.
          return caches.delete(name).then(function () {
            return caches.open(name).then(function (cache) {
              return Promise.all(
                all.map(function (path) {
                  return fetchCacheable(origin + path).then(function (response) {
                    return cache.put(origin + path, response);
                  });
                }),
              ).then(function () {
                return cache.put(shellUrl, shell);
              });
            });
          });
        });
      });
  });
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    precache().then(function () {
      return self.skipWaiting();
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        route.staleCaches(keys).map(function (key) {
          return caches.delete(key);
        }),
      );
    }),
  );
});

/** Coquille de la page de repli enregistrée à l'installation. */
function shell() {
  return caches.match(self.location.origin + route.FALLBACK_PATH).then(function (response) {
    return response || Response.error();
  });
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var kind = route.routeRequest(request, self.location.origin);
  if (kind === "navigation") {
    // Réseau d'abord, réponse rendue telle quelle (404 et 500 compris) ; redirection sans paramètre si le réseau
    // échoue : l'adresse demandée n'est jamais gardée (elle peut contenir un jeton de partage).
    event.respondWith(
      fetch(request).catch(function () {
        return Response.redirect(self.location.origin + route.FALLBACK_PATH, 302);
      }),
    );
  } else if (kind === "repli") {
    // Jamais redirigée vers elle-même : la coquille du cache, servie directement.
    event.respondWith(fetch(request).catch(shell));
  } else if (kind === "interface") {
    event.respondWith(
      caches.match(request).then(function (cached) {
        return cached || fetch(request);
      }),
    );
  }
  // Tout le reste : aucune réponse du service worker, le navigateur passe par le réseau.
});
