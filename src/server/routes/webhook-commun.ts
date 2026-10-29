import "server-only";

import { ServerEnvError } from "@/server/env";
import { logEvent } from "@/server/log";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { analyserEvenement } from "@/server/payment/evenement";
import { ENTETE_SIGNATURE } from "@/server/payment/signature";
import { creerSuiteVoyageComplet } from "@/server/payment/suite-voyage-complet";
import { handlePaymentEvent, type OptionsTraitement } from "@/server/payment/webhook";
import { withOrg } from "@/server/with-org";

import { createDatabase } from "../../../db/index.ts";

/**
 * Fabrique commune des webhooks du paiement (décision 0140 § 2.1 ; ordre de 0097 B4-TL-11), employée par le webhook
 * simulé (`./simulated-webhook.ts`) et par le webhook Stripe (`./stripe-webhook.ts`), qui ne gardent que leur
 * configuration. **Ordre unique des contrôles**, chacun court-circuitant les suivants :
 * 1. webhook fermé (prédicat de la route, configuration invalide comprise) : `404` pour toute méthode, corps vide,
 *    sans lire ni le corps ni un en-tête ; une `ServerEnvError` est journalisée (`payment.webhook_config_invalid`) ;
 * 2. méthode autre que `POST` : `405` (`Allow: POST`) ;
 * 3. type de média autre que `application/json` (paramètres et casse ignorés) : `400` ;
 * 4. taille : `Content-Length`, puis lecture en flux coupée à 64 Kio : `413` ;
 * 5. signature et tolérance : la fermeture de vérification de la route (qui seule tient sa clé) n'est demandée qu'ici ;
 *    `null` ou faux : `400` ;
 * 6. corps signé illisible ou non analysable en `PaymentEvent` : `400` ;
 * 7. seulement alors, la base (`handlePaymentEvent`, forme attendue de la route) : `200`, ou `500` sur une panne.
 * La fabrique ne connaît **aucune clé** ; elle ne garde ni ne journalise jamais le corps, un en-tête ou une clé.
 * Corps constants, sans identifiant, message ni valeur reçue ; `Cache-Control: no-store` partout.
 */

/** Taille maximale du corps (B4-TL-6 point 1). */
export const TAILLE_MAX_CORPS = 64 * 1024;

/** Vérification de la signature d'une route : corps brut, en-tête de signature, horloge en millisecondes. */
export type VerificationSignature = (corps: Uint8Array, entete: string | null, maintenantMs: number) => boolean;

/**
 * Configuration lue à chaque requête : le prédicat (étape 1) et la fermeture de vérification (étape 5 seulement), qui
 * tient la clé de sa route, ou `null` (clé indisponible : `400`).
 */
export type ConfigurationWebhookCommun = { readonly ouvert: boolean; readonly verifierSignature: () => VerificationSignature | null };

export type OptionsWebhookCommun = {
  readonly lireConfiguration: () => ConfigurationWebhookCommun;
  /** Forme des identifiants attendue par la route (B4-TL-10 ; `formeSimulee` ou `formeStripe`). */
  readonly formeAttendue: OptionsTraitement["formeAttendue"];
  /** Dépendances des cas d'usage injectées (tests) ; leur horloge sert aussi à la vérification de la signature. */
  readonly dependances?: DependancesPaiement;
  /**
   * Fabrique des dépendances (défaut : `dependancesWebhookParDefaut`), appelée à la première requête qui atteint
   * l'étape 7 ; espion des tests.
   */
  readonly creerDependances?: () => DependancesPaiement;
};

/** Dépendances par défaut : client de `vadrouille_app` (lève si sa variable manque), `withOrg`, horloge système. */
export function dependancesWebhookParDefaut(): DependancesPaiement {
  // Suite de B9d : le voyage complet est créé et démarré par la réconciliation, dans le contexte système de l'organisation.
  return { database: createDatabase("vadrouille_app"), withOrg, maintenant: () => Date.now(), suite: creerSuiteVoyageComplet() };
}

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

export function creerWebhook(options: OptionsWebhookCommun): (request: Request) => Promise<Response> {
  let dependances = options.dependances;
  return async (request) => {
    // 1. Fermé : aucun en-tête ni corps lu. Une configuration invalide ferme aussi, mais pas en silence.
    let configuration: ConfigurationWebhookCommun;
    try {
      configuration = options.lireConfiguration();
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
    // 5. Signature : la clé n'est lue qu'ici, par la fermeture de la route. L'horloge est lue sans créer les dépendances
    // par défaut : une requête mal signée ne touche jamais à la configuration de la base (B4-TL-11 point 1 : `400`).
    const verifierSignature = configuration.verifierSignature();
    const maintenantMs = dependances === undefined ? Date.now() : dependances.maintenant();
    if (verifierSignature === null || !verifierSignature(corps, request.headers.get(ENTETE_SIGNATURE), maintenantMs)) return requeteInvalide();
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
      const deps = (dependances ??= (options.creerDependances ?? dependancesWebhookParDefaut)());
      await handlePaymentEvent(deps, evenement, { formeAttendue: options.formeAttendue });
    } catch {
      return json(500, { error: "server_error" });
    }
    return json(200, { received: true });
  };
}
