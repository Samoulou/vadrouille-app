/**
 * Module hors ligne désigné (spécification F10, F10b ; F10-TL-4, F10-TL-5) : seul endroit de l'application qui
 * enregistre le service worker (`public/sw.js`), et seulement depuis l'écran 15 (`R15`), avec le réseau, à toute
 * date (F10-PO-8). Le service worker ne contient aucune donnée du voyage : il ne sert que la page de repli.
 *
 * Enregistrement impossible (navigateur sans service worker, stockage refusé, service workers bloqués) : aucun
 * message, l'écran fonctionne en ligne (F10-PO-8).
 */

export const SERVICE_WORKER_URL = "/sw.js";

export interface OfflineRegistrationEnv {
  navigator?: Pick<Navigator, "onLine"> & { serviceWorker?: Pick<ServiceWorkerContainer, "register"> };
}

/** Enregistre le service worker de la page de repli ; `env` remplace `window` dans les tests. */
export function registerOfflineFallback(env: OfflineRegistrationEnv = typeof window === "undefined" ? {} : window): void {
  const nav = env.navigator;
  if (!nav?.onLine || !nav.serviceWorker) return;
  try {
    nav.serviceWorker.register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" }).catch(() => {});
  } catch {
    // Enregistrement refusé : rien à dire, l'écran reste utilisable en ligne.
  }
}
