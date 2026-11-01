import "server-only";

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

import { SHARE_TOKEN_PATTERN } from "@/contracts/values";
import * as messages from "@/i18n/messages";
import { rateLimitSettings, serverEnv, type ServerEnv } from "@/server/env";
import { trustedIpKey, type HeadersLike } from "@/server/ip";
import { verdictRateLimit, type RateLimitRequest, type RateLimitVerdict } from "@/server/rate-limit";

/**
 * Limite de la vue partagée sur `api` (`RP`, `RPJ`) et en-tête interne « compté » (décision 0157 § 2.1 points 2 à 6,
 * S1 ; spécification M6 § 3.3 point 1 et § 3.4 ; ticket 1013, M6a). Seul module de `src/server` que `src/proxy.ts`
 * importe (bloc d'`eslint.config.mjs` propre au proxy). Une page ne sait pas répondre 429 : le proxy de Next.js
 * (runtime Node.js, seul runtime de `proxy.ts` depuis Next.js 16) compte la requête **avant** la page, dans l'ordre de
 * F10-PO-15 :
 * 1. garde (`apiShareAvailable()`, lue par le proxy) : fermée → la requête passe, la page répond 404 comme aujourd'hui ;
 * 2. forme du jeton (`SHARE_TOKEN_PATTERN`) : autre forme → la requête passe **sans compter**, la page répond 404 sans
 *    lire (critère 13 de M6a pour le jeton signé) ;
 * 3. préchargement (`Next-Router-Prefetch: 1` ou `Purpose: prefetch`) : 204 sans corps, sans compter ni lire ;
 *    `Next-Router-Prefetch` n'atteint le proxy que grâce à `skipProxyUrlNormalize` (`next.config.ts`, ticket 1029) ;
 * 4. hors de `local` et `ci`, requête sans clé d'adresse lisible (`trustedIpKey` nul) : la requête passe **sans compter**
 *    et sans l'en-tête « compté », donc la page répond le 404 commun sans lire (0157 § 2.1 point 3 : le compartiment
 *    commun `no-trusted-ip` n'est jamais atteint par `partage-vue` sur un déploiement) ;
 * 5. limite `partage-vue` (60 par minute et par adresse IP), une fois par requête : refus, panne du limiteur ou
 *    configuration absente → **429**, fermé (0157 § 2.1 point 4, écart délibéré avec F10-PO-15 pour cette seule panne) ;
 * 6. admise : la requête passe avec l'en-tête « compté » ; la page lit ensuite le lien et les vues (0158 § 3).
 *
 * **En-tête « compté »** (0157 § 2.1 point 5) : toute valeur reçue du client est supprimée par le proxy ; la valeur posée
 * est `v1.<HMAC-SHA-256 en base64url>` du message `v1|<minute UTC>|<chemin>`, sous une **sous-clé** dérivée de
 * `RATE_LIMIT_HMAC_SECRET` par HKDF-SHA-256 (jamais sous la clé du limiteur elle-même) avec :
 * - **sel** : vide (chaîne de longueur nulle ; RFC 5869 § 2.2 : équivaut à `HashLen` octets nuls) ;
 * - **information** : `vadrouille/partage/compte/v1` ;
 * - **longueur de sortie** : 32 octets.
 * **Rotation** : l'étiquette émise est `ETIQUETTE_EMISE` ; la vérification accepte les étiquettes de
 * `ETIQUETTES_ACCEPTEES`. Passer à `v2` : ajouter `v2` aux étiquettes acceptées dans un premier déploiement, puis
 * l'émettre dans le suivant ; `v1` est retirée au déploiement d'après (une requête comptée vit au plus deux minutes).
 * Sel et longueur : critères de revue de la Sécurité (0157 § 2.1 point 5). Hors de `local` et `ci`, `RP` et `RPJ`
 * vérifient l'en-tête (minute courante ou précédente, comparaison à temps constant) avant toute lecture
 * (`src/server/partage/vue.ts`) ; l'en-tête est posé sur la requête transmise, jamais sur la réponse, et n'est jamais
 * journalisé, mesuré ni exporté (aucun journal dans ce module, `no-console`).
 */

/** En-tête interne posé par le proxy sur la requête transmise (jamais sur la réponse). */
export const EN_TETE_COMPTE = "x-vadrouille-partage-compte";

/**
 * En-tête interne de Next.js (`x-middleware-subrequest`), retiré par le proxy par hygiène. Ce retrait ne protège pas
 * contre CVE-2025-29927 (corrigée dans Next.js 15.2.3, donc 16.4.1) : la protection de la vue est la vérification de
 * l'en-tête « compté » par `requeteComptee`, avant toute lecture.
 */
export const EN_TETE_SOUS_REQUETE = "x-middleware-subrequest";

/** Nom d'action du limiteur (`src/server/config/limites.ts`). */
export const ACTION_LIMITE_VUE = "partage-vue";

export const ETIQUETTE_EMISE = "v1";
export const ETIQUETTES_ACCEPTEES: readonly string[] = ["v1"];
const SEL = Buffer.alloc(0);
const LONGUEUR_SOUS_CLE = 32;
const MINUTE_MS = 60_000;

/** Durée annoncée par `Retry-After` (secondes) : la fenêtre de `partage-vue`. */
export const RETRY_AFTER_SECONDES = 60;

/** En-têtes de F10-TL-8, posés par le proxy lui-même sur ses réponses 204 et 429 (0157 § 2.1 points 5 et 6). */
export const EN_TETES_CONFIDENTIALITE: Readonly<Record<string, string>> = Object.freeze({
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "strict-origin",
  "X-Robots-Tag": "noindex, nofollow",
});

/**
 * Sous-clés dérivées pour le dernier secret vu, par étiquette (revue du ticket 1013, mineur 1 : une dérivation par
 * étiquette et par secret, et non trois par lecture). Un autre secret (rotation, tests) vide le cache.
 */
let derivees: { readonly secret: Buffer; readonly parEtiquette: Map<string, Buffer> } | undefined;

/** Sous-clé de l'en-tête « compté » (HKDF-SHA-256, sel vide, 32 octets) pour l'étiquette donnée. */
export function sousCleCompte(secret: Buffer, etiquette: string = ETIQUETTE_EMISE): Buffer {
  if (derivees === undefined || derivees.secret.length !== secret.length || !timingSafeEqual(derivees.secret, secret)) {
    derivees = { secret: Buffer.from(secret), parEtiquette: new Map() };
  }
  let sousCle = derivees.parEtiquette.get(etiquette);
  if (sousCle === undefined) {
    sousCle = Buffer.from(hkdfSync("sha256", secret, SEL, `vadrouille/partage/compte/${etiquette}`, LONGUEUR_SOUS_CLE));
    derivees.parEtiquette.set(etiquette, sousCle);
  }
  return Buffer.from(sousCle);
}

/** Chemin canonique d'une adresse de `/p/` : sans barre finale. */
export function cheminCanonique(pathname: string): string {
  const sansBarre = pathname.replace(/\/+$/, "");
  return sansBarre === "" ? "/" : sansBarre;
}

/** Valeur de l'en-tête « compté » pour un chemin, à la minute UTC de `maintenant`. */
export function valeurCompte(secret: Buffer, chemin: string, maintenant: number, etiquette: string = ETIQUETTE_EMISE): string {
  const minute = Math.floor(maintenant / MINUTE_MS);
  const mac = createHmac("sha256", sousCleCompte(secret, etiquette)).update(`${etiquette}|${minute}|${cheminCanonique(chemin)}`, "utf8").digest("base64url");
  return `${etiquette}.${mac}`;
}

/** Vrai si `valeur` est l'en-tête « compté » du chemin, pour la minute courante ou la précédente (temps constant). */
export function compteValide(secret: Buffer, chemin: string, valeur: string | null, maintenant: number): boolean {
  if (valeur === null) return false;
  const point = valeur.indexOf(".");
  const etiquette = point > 0 ? valeur.slice(0, point) : "";
  if (!ETIQUETTES_ACCEPTEES.includes(etiquette)) return false;
  const recue = Buffer.from(valeur, "utf8");
  let valide = false;
  for (const instant of [maintenant, maintenant - MINUTE_MS]) {
    const attendue = Buffer.from(valeurCompte(secret, chemin, instant, etiquette), "utf8");
    if (attendue.length === recue.length && timingSafeEqual(attendue, recue)) valide = true;
  }
  return valide;
}

/** Jeton de l'adresse `/p/<jeton>…`, s'il a la forme d'un jeton aléatoire ; `null` sinon. */
export function jetonDuChemin(pathname: string): string | null {
  const morceaux = pathname.split("/");
  if (morceaux[0] !== "" || morceaux[1] !== "p") return null;
  const jeton = morceaux[2] ?? "";
  return SHARE_TOKEN_PATTERN.test(jeton) ? jeton : null;
}

/** Requête de préchargement du routeur de Next.js : aucune lecture, aucun décompte (0157 § 2.1 point 5). */
export function estPrechargement(entetes: HeadersLike): boolean {
  return entetes.get("next-router-prefetch") === "1" || entetes.get("purpose")?.toLowerCase() === "prefetch";
}

/** Ce que le proxy fait de la requête. */
export type DecisionVue =
  /** Laisser passer, sans compter ni poser l'en-tête « compté » (la page répond selon ses propres contrôles). */
  | { readonly type: "passer" }
  /** Préchargement : 204 sans corps. */
  | { readonly type: "prechargement" }
  /** Limite dépassée, panne du limiteur ou configuration absente : 429. */
  | { readonly type: "limite" }
  /** Comptée et admise : laisser passer avec l'en-tête « compté ». */
  | { readonly type: "compte"; readonly valeur: string };

export type DependancesLimiteVue = {
  /** Environnement validé (`serverEnv()` par défaut) ; une erreur de configuration donne 429 (fermé). */
  readonly env?: () => ServerEnv;
  readonly limiteur?: (request: RateLimitRequest) => Promise<RateLimitVerdict>;
  readonly maintenant?: () => number;
};

/** Décision du proxy pour une requête de `/p/…` (garde `apiShareAvailable()` déjà ouverte). */
export async function decisionVuePartagee(requete: { readonly pathname: string; readonly headers: HeadersLike }, dependances: DependancesLimiteVue = {}): Promise<DecisionVue> {
  if (jetonDuChemin(requete.pathname) === null) return { type: "passer" };
  if (estPrechargement(requete.headers)) return { type: "prechargement" };
  let env: ServerEnv;
  let reglages: ReturnType<typeof rateLimitSettings>;
  try {
    env = (dependances.env ?? serverEnv)();
    reglages = rateLimitSettings(env);
  } catch {
    return { type: "limite" };
  }
  const localOuCi = env.environment === "local" || env.environment === "ci";
  if (!localOuCi && trustedIpKey(requete.headers, reglages.trustedIpHeader) === null) return { type: "passer" };
  const verdict = await (dependances.limiteur ?? verdictRateLimit)({ action: ACTION_LIMITE_VUE, headers: requete.headers }).catch((): RateLimitVerdict => ({ ok: false }));
  if (!verdict.ok) return { type: "limite" };
  return { type: "compte", valeur: valeurCompte(reglages.secret, requete.pathname, (dependances.maintenant ?? Date.now)()) };
}

/**
 * Vérification par `RP` et `RPJ` avant toute lecture (0157 § 2.1 point 5) : en `local` et `ci`, admise ; ailleurs,
 * l'en-tête « compté » du chemin doit être valide. Configuration illisible : refusée (404 commun, sans lire).
 */
export function requeteComptee(
  entetes: HeadersLike,
  chemin: string,
  dependances: { readonly env?: () => ServerEnv; readonly maintenant?: () => number } = {},
): boolean {
  let env: ServerEnv;
  let secret: Buffer;
  try {
    env = (dependances.env ?? serverEnv)();
    if (env.environment === "local" || env.environment === "ci") return true;
    secret = rateLimitSettings(env).secret;
  } catch {
    return false;
  }
  return compteValide(secret, chemin, entetes.get(EN_TETE_COMPTE), (dependances.maintenant ?? Date.now)());
}

/** Corps de la réponse 429 (page commune provisoire, UX/UI : U4) : texte de la spécification M6 § 7, rien sur le jeton. */
export function pageLimite(): string {
  const echapper = (texte: string) => texte.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
  const t = { titre: echapper(messages.partage.limite.titre), texte: echapper(messages.partage.limite.texte) };
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${t.titre}</title></head><body><main><h1>${t.titre}</h1><p>${t.texte}</p></main></body></html>`;
}
