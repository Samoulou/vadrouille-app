import "server-only";

import { serverEnv, ServerEnvError, type ServerEnv } from "@/server/env";
import { cleWebhookSimule, webhookSimuleOuvert } from "@/server/env/payment";
import { logEvent } from "@/server/log";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { analyserEvenement } from "@/server/payment/evenement";
import { formeSimulee } from "@/server/payment/formes";
import { ENTETE_SIGNATURE, verifier } from "@/server/payment/signature";
import { handlePaymentEvent } from "@/server/payment/webhook";
import { withOrg } from "@/server/with-org";

import { createDatabase } from "../../../db/index.ts";

/**
 * Webhook simulé `/api/v1/webhooks/simulated` (spécification B4, B4a point 4 ; décisions 0097 B4-TL-6, B4-TL-7 et
 * B4-TL-11). Importé seulement par `src/app/api/v1/webhooks/simulated/route.ts` (`ligne/route-handlers`), qui exporte ce
 * gestionnaire pour les sept méthodes. **Ordre unique des contrôles**, chacun court-circuitant les suivants :
 * 1. webhook fermé (`webhookSimuleOuvert`, configuration invalide comprise) : `404` pour toute méthode, corps vide,
 *    sans lire ni le corps ni un en-tête ;
 * 2. méthode autre que `POST` : `405` (`Allow: POST`) ;
 * 3. type de média autre que `application/json` (paramètres et casse ignorés) : `400` ;
 * 4. taille : `Content-Length`, puis lecture en flux coupée à 64 Kio : `413` ;
 * 5. signature et tolérance (la clé n'est lue qu'ici) : `400` ;
 * 6. corps signé illisible ou non analysable en `PaymentEvent` : `400` ;
 * 7. seulement alors, la base (`handlePaymentEvent`) : `200`, ou `500` sur une panne (le prestataire relivre).
 * Aucun accès à la base avant l'étape 5 : une signature fausse coûte un HMAC (pas de limiteur, B4-TL-6 point 3).
 * Corps constants, sans identifiant, message ni valeur reçue ; `Cache-Control: no-store` partout.
 */

/** Taille maximale du corps (B4-TL-6 point 1). */
export const TAILLE_MAX_CORPS = 64 * 1024;

const ENTETES_COMMUNS = { "cache-control": "no-store" } as const;

function json(status: number, corps: Record<string, unknown>, entetes: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corps), { status, headers: { ...ENTETES_COMMUNS, "content-type": "application/json", ...entetes } });
}

const ferme = () => new Response(null, { status: 404, headers: ENTETES_COMMUNS });
const requeteInvalide = () => json(400, { error: "invalid_request" });

/** Type de média `application/json`, paramètres (`; charset=utf-8`) et casse ignorés. */
function typeJson(valeur: string | null): boolean {
  return valeur !== null && valeur.split(";")[0]?.trim().toLowerCase() === "application/json";
}

/** Corps brut lu en flux, ou `null` au-delà de `TAILLE_MAX_CORPS` (lecture interrompue). */
async function lireCorps(request: Request): Promise<Uint8Array | null> {
  const annonce = request.headers.get("content-length");
  if (annonce !== null && (!/^[0-9]+$/.test(annonce.trim()) || Number(annonce.trim()) > TAILLE_MAX_CORPS)) return null;
  if (request.body === null) return new Uint8Array(0);
  const lecteur = request.body.getReader();
  const morceaux: Uint8Array[] = [];
  let taille = 0;
  for (;;) {
    const { done, value } = await lecteur.read();
    if (done) break;
    taille += value.byteLength;
    if (taille > TAILLE_MAX_CORPS) {
      await lecteur.cancel().catch(() => undefined);
      return null;
    }
    morceaux.push(value);
  }
  return Buffer.concat(morceaux);
}

/**
 * Configuration du webhook lue à chaque requête : le prédicat (étape 1) et l'accès à la clé (étape 5 seulement).
 * Une `ServerEnvError` levée par la lecture ferme le webhook et est journalisée.
 */
export type ConfigurationWebhook = { readonly ouvert: boolean; readonly cle: () => Buffer | null };

/** Configuration tirée d'un `ServerEnv` validé : prédicat `webhookSimuleOuvert`, clé par `cleWebhookSimule` à l'appel. */
export function configurationDepuisEnv(env: ServerEnv): ConfigurationWebhook {
  return { ouvert: webhookSimuleOuvert(env), cle: () => cleWebhookSimule(env) };
}

export type OptionsWebhookSimule = {
  /**
   * Configuration (défaut : `configurationDepuisEnv(serverEnv())`). Les tests de base l'injectent avec une clé tirée au
   * hasard (A22) : ils ne passent ni par `process.env` ni par `@/server/env`.
   */
  readonly lireConfiguration?: () => ConfigurationWebhook;
  /** Dépendances des cas d'usage (défaut : `creerDependances()`, appelée à la première requête qui atteint l'étape 7). */
  readonly dependances?: DependancesPaiement;
  /** Fabrique des dépendances par défaut (client de `vadrouille_app`, horloge système) ; espion des tests. */
  readonly creerDependances?: () => DependancesPaiement;
  /** Vérification de la signature (défaut : `verifier` de `src/server/payment/signature.ts` ; espion des tests). */
  readonly verifier?: typeof verifier;
};

/** Dépendances par défaut : client de `vadrouille_app` (lève si sa variable manque), `withOrg`, horloge système. */
function dependancesParDefaut(): DependancesPaiement {
  return { database: createDatabase("vadrouille_app"), withOrg, maintenant: () => Date.now() };
}

export function creerWebhookSimule(options: OptionsWebhookSimule = {}): (request: Request) => Promise<Response> {
  let dependances = options.dependances;
  const creerDependances = options.creerDependances ?? dependancesParDefaut;
  const verifierSignature = options.verifier ?? verifier;
  return async (request) => {
    // 1. Fermé : aucun en-tête ni corps lu. Une configuration invalide ferme aussi, mais pas en silence.
    let configuration: ConfigurationWebhook;
    try {
      configuration = (options.lireConfiguration ?? (() => configurationDepuisEnv(serverEnv())))();
    } catch (error) {
      if (error instanceof ServerEnvError) logEvent("payment.webhook_config_invalid", { rule: error.rule, variable: error.variable }, "warn");
      return ferme();
    }
    if (!configuration.ouvert) return ferme();
    // 2 à 4.
    if (request.method !== "POST") return json(405, { error: "method_not_allowed" }, { allow: "POST" });
    if (!typeJson(request.headers.get("content-type"))) return requeteInvalide();
    const corps = await lireCorps(request);
    if (corps === null) return json(413, { error: "payload_too_large" });
    // 5. Signature : la clé n'est lue qu'ici. L'horloge est lue sans créer les dépendances par défaut : une requête mal
    // signée ne touche jamais à la configuration de la base (B4-TL-11 point 1 : `400`, jamais `500`).
    const cle = configuration.cle();
    const maintenant = Math.floor((dependances === undefined ? Date.now() : dependances.maintenant()) / 1000);
    if (cle === null || !verifierSignature(corps, request.headers.get(ENTETE_SIGNATURE), cle, maintenant)) return requeteInvalide();
    // 6. Analyse du corps signé.
    let brut: unknown;
    try {
      brut = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(corps));
    } catch {
      return requeteInvalide();
    }
    const evenement = analyserEvenement(brut);
    if (evenement === null) return requeteInvalide();
    // 7. Base. Les dépendances par défaut (client de `vadrouille_app`) ne sont créées qu'ici, dans le `try` : une variable
    // de base absente donne `500`, comme une base indisponible.
    try {
      const deps = (dependances ??= creerDependances());
      await handlePaymentEvent(deps, evenement, { formeAttendue: formeSimulee });
    } catch {
      return json(500, { error: "server_error" });
    }
    return json(200, { received: true });
  };
}

let parDefaut: ((request: Request) => Promise<Response>) | undefined;

/** Gestionnaire du serveur (`serverEnv()`, client de `vadrouille_app`), créé au premier appel. */
export function webhookSimule(request: Request): Promise<Response> {
  parDefaut ??= creerWebhookSimule();
  return parDefaut(request);
}
