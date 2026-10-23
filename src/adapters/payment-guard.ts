import { isProductionDeployment, prototypeAdapterAllowed } from "@/dev/flags";

/**
 * Garde du paiement simulé (décision 0020 § 2.3), **fermée par défaut**, fonctions pures.
 *
 * Ouvrir le paiement simulé sur un déploiement de production demande la décision de Samuel (Q131),
 * puis un amendement écrit de la décision 0020 : une variable ne suffit pas.
 */

/** Valeur normalisée d'une variable de choix d'adaptateur : absente ou vide = `mock`. */
export function adapterChoice(value: string | undefined): string {
  return value?.trim() || "mock";
}

/**
 * Vrai quand l'adaptateur de données est `prototype` (spécification P0, P0b1), sans lever d'erreur ni consulter
 * la liste blanche : `getTripAdapter()` et `getRequestContext()` la consultent, et lèvent hors liste blanche.
 */
export function isPrototypeAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "prototype";
}

/**
 * Faux sur tout déploiement de production (`VADROUILLE_ENV` ou `VERCEL_ENV` à `production`), quels que
 * soient `NODE_ENV` et le drapeau ; sinon vrai seulement en `development` ou `test`, ou avec
 * `VADROUILLE_DEMO_PAYMENT` à exactement `1` (posé par `playwright.config.ts` seulement).
 */
export function paymentDemoAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (isProductionDeployment(env)) return false;
  return env.NODE_ENV === "development" || env.NODE_ENV === "test" || env.VADROUILLE_DEMO_PAYMENT === "1";
}

/**
 * Seule fonction que consultent les pages, les actions, `DeckEnd` (par sa page) et la section
 * « Démonstration » : `PAYMENT_ADAPTER` vaut `mock`, aucun déploiement de production, puis l'un des deux cas :
 * - adaptateur de données `mock` et paiement simulé autorisé (`paymentDemoAllowed`) ;
 * - adaptateur de données `prototype` dans sa liste blanche (`prototypeAdapterAllowed` : préversion, `development`,
 *   `test` ou CI ; jamais la production) : déblocage simulé d'un voyage d'essai (spécification E2E-essai, lot 1), sans
 *   prestataire, sans e-mail, sans écriture en base.
 * Toute autre combinaison ferme (sans quoi `getRequestContext()` lèverait et la page répondrait 500).
 */
export function paymentAvailable(env: NodeJS.ProcessEnv = process.env): boolean {
  if (adapterChoice(env.PAYMENT_ADAPTER) !== "mock" || isProductionDeployment(env)) return false;
  const donnees = adapterChoice(env.DATA_ADAPTER);
  if (donnees === "mock") return paymentDemoAllowed(env);
  return donnees === "prototype" && prototypeAdapterAllowed(env);
}
