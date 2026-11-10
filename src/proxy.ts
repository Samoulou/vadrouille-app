import { NextResponse, type NextRequest } from "next/server";

import { apiShareAvailable } from "@/adapters/share-guard";
import {
  decisionVuePartagee,
  EN_TETE_COMPTE,
  EN_TETE_SOUS_REQUETE,
  EN_TETES_CONFIDENTIALITE,
  pageLimite,
  RETRY_AFTER_SECONDES,
} from "@/server/partage/limite-vue";

/**
 * Proxy de Next.js (runtime Node.js, seul runtime de `proxy.ts` depuis Next.js 16), limité à la vue partagée `/p/…`
 * (spécification M6 § 3.3 point 1 et § 3.4 ; décision 0157 § 2.1 ; ticket 1013, M6a). Bloc propre dans
 * `eslint.config.mjs` : ce fichier n'importe de `src/server` que `@/server/partage/limite-vue`, et de `src/adapters` que
 * `@/adapters/share-guard`.
 *
 * Toujours : l'en-tête interne « compté » est retiré de la requête reçue (aucune valeur d'un client n'atteint la page),
 * ainsi que `x-middleware-subrequest` par simple hygiène. Ce retrait **ne protège pas** contre CVE-2025-29927
 * (GHSA-f82v-jwr5-mffw, « Authorization Bypass in Next.js Middleware », publiée le 21 mars 2025 ; versions corrigées
 * 12.3.5, 13.5.9, 14.2.25 et 15.2.3, donc 16.4.1 aussi) : ce contournement faisait sauter le proxy **avant** son code.
 * La protection de la vue contre une requête qui n'est pas passée par ce proxy est ailleurs : hors de `local` et `ci`,
 * `RP` et `RPJ` exigent l'en-tête « compté » valide (HMAC du chemin et de la minute, `requeteComptee`) avant toute
 * lecture (`src/server/partage/vue.ts`) ; sans lui, 404 commun sans rien lire.
 * Garde fermée (`apiShareAvailable()` faux : `mock`, site d'essai, ou déploiement sans `TRUSTED_IP_HEADER`) : la requête
 * passe telle quelle, sans compter ; la page garde son comportement d'aujourd'hui.
 * Garde ouverte : `decisionVuePartagee` (ordre de F10-PO-15, limite `partage-vue`) ; 204 pour un préchargement, 429 pour
 * une limite dépassée ou une panne du limiteur (page minimale, `Retry-After`, en-têtes de F10-TL-8), sinon la requête
 * passe, avec l'en-tête « compté » quand elle a été comptée. Aucun journal : ni jeton, ni chemin, ni adresse.
 */
export async function proxy(request: NextRequest): Promise<NextResponse> {
  const entetes = new Headers(request.headers);
  entetes.delete(EN_TETE_COMPTE);
  entetes.delete(EN_TETE_SOUS_REQUETE);
  const passer = () => NextResponse.next({ request: { headers: entetes } });

  if (!apiShareAvailable()) return passer();

  const decision = await decisionVuePartagee({ pathname: request.nextUrl.pathname, headers: entetes });
  switch (decision.type) {
    case "prechargement":
      return new NextResponse(null, { status: 204, headers: { ...EN_TETES_CONFIDENTIALITE } });
    case "limite":
      return new NextResponse(pageLimite(), {
        status: 429,
        headers: { ...EN_TETES_CONFIDENTIALITE, "Content-Type": "text/html; charset=utf-8", "Retry-After": String(RETRY_AFTER_SECONDES) },
      });
    case "compte":
      entetes.set(EN_TETE_COMPTE, decision.valeur);
      return passer();
    case "passer":
      return passer();
  }
}

export const config = {
  matcher: ["/p/:path*"],
};
