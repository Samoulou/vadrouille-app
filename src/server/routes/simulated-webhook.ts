import "server-only";

import { serverEnv, type ServerEnv } from "@/server/env";
import { cleWebhookSimule, webhookSimuleOuvert } from "@/server/env/payment";
import type { DependancesPaiement } from "@/server/payment/dependances";
import { formeSimulee } from "@/server/payment/formes";
import { verifier } from "@/server/payment/signature";

import { creerWebhook } from "./webhook-commun";

export { TAILLE_MAX_CORPS } from "./webhook-commun";

/**
 * Webhook simulé `/api/v1/webhooks/simulated` (spécification B4, B4a point 4 ; décisions 0097 B4-TL-6, B4-TL-7 et
 * B4-TL-11). Importé seulement par `src/app/api/v1/webhooks/simulated/route.ts` (`ligne/route-handlers`), qui exporte ce
 * gestionnaire pour les sept méthodes. L'ordre des contrôles est celui de la fabrique commune (`./webhook-commun.ts`,
 * décision 0140 § 2.1) ; ce module ne garde que sa configuration : prédicat `webhookSimuleOuvert`, clé
 * `cleWebhookSimule` (octets) lue à l'étape 5 seulement, vérification maison `verifier` (horloge en secondes, tolérance
 * de 300 s dans les deux sens), forme simulée des identifiants (`formeSimulee`).
 */

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

export function creerWebhookSimule(options: OptionsWebhookSimule = {}): (request: Request) => Promise<Response> {
  const verifierSignature = options.verifier ?? verifier;
  const lire = options.lireConfiguration ?? (() => configurationDepuisEnv(serverEnv()));
  return creerWebhook({
    lireConfiguration: () => {
      const configuration = lire();
      return {
        ouvert: configuration.ouvert,
        verifierSignature: () => {
          const cle = configuration.cle();
          if (cle === null) return null;
          return (corps, entete, maintenantMs) => verifierSignature(corps, entete, cle, Math.floor(maintenantMs / 1000));
        },
      };
    },
    formeAttendue: formeSimulee,
    dependances: options.dependances,
    creerDependances: options.creerDependances,
  });
}

let parDefaut: ((request: Request) => Promise<Response>) | undefined;

/** Gestionnaire du serveur (`serverEnv()`, client de `vadrouille_app`), créé au premier appel. */
export function webhookSimule(request: Request): Promise<Response> {
  parDefaut ??= creerWebhookSimule();
  return parDefaut(request);
}
