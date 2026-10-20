import "server-only";

import type { TransportWebhook } from "./simulated-provider";

/**
 * Transport HTTP du prestataire simulé (décision 0097 B4-TL-3 point 2) : `POST` vers `APP_URL` + chemin fixe, adresse
 * prise dans `APP_URL` validée par `src/server/env` (jamais dans la requête), `redirect: "error"`, délai de 5 s, aucun
 * cookie, aucun en-tête reçu retransmis. Seul le statut est rendu ; le corps de la réponse n'est pas lu.
 */

export const CHEMIN_WEBHOOK_SIMULE = "/api/v1/webhooks/simulated";
export const DELAI_LIVRAISON_MS = 5_000;

export function transportHttp(appUrl: string): TransportWebhook {
  const adresse = new URL(CHEMIN_WEBHOOK_SIMULE, appUrl).href;
  return async ({ corps, entetes }) => {
    const reponse = await fetch(adresse, {
      method: "POST",
      body: new Uint8Array(corps),
      headers: { ...entetes },
      redirect: "error",
      credentials: "omit",
      cache: "no-store",
      signal: AbortSignal.timeout(DELAI_LIVRAISON_MS),
    });
    await reponse.body?.cancel().catch(() => undefined);
    return reponse.status;
  };
}
