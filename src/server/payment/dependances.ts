import "server-only";

import type { OfferConfig, Result } from "@/contracts";
import { OFFER_CONFIG } from "@/server/config/offer";
import { executeurSql, type withOrg } from "@/server/with-org";

import type { Database } from "../../../db/index.ts";

import type { SuiteVoyageDebloque } from "./suite";

/**
 * Dépendances des cas d'usage du paiement serveur (spécification B4, B4a point 2 ; décision 0097 B4-TL-5) : reçues en
 * paramètres, si bien que les tests de `pnpm test:db` n'ont besoin ni de serveur ni de variables d'environnement.
 */

/** Durée de vie d'un paiement (B4-PO-4 : 30 minutes, `checkoutTtlMs` de 0020 § 6, repris ; égalité testée). */
export const DUREE_VIE_PAIEMENT_MS = 30 * 60_000;

/** Exécuteur de requêtes à paramètres liés (`executeurSql` de `with-org.ts`). */
export type Executeur = ReturnType<typeof executeurSql>;

/** Actions du limiteur des cas d'usage (`src/server/config/limites.ts`). */
export type ActionLimitee = "payment-start" | "payment-simulate";

export type DependancesPaiement = {
  /** Client du rôle `vadrouille_app` (`db/index.ts`) ; le webhook y prend `vadrouille_webhook` par `SET LOCAL ROLE`. */
  readonly database: Database;
  /**
   * Transaction de l'organisation (`withOrg` de `src/server/with-org.ts` sur le même rôle) ; injectée comme pour les
   * autres cas d'usage (sa fabrique liée à un client est réservée à son module et aux tests : `tests/unit/auth/points-injection.test.ts`).
   */
  readonly withOrg: typeof withOrg;
  /** Horloge, en millisecondes depuis l'époque Unix. */
  readonly maintenant: () => number;
  /** Configuration de l'offre (défaut : `OFFER_CONFIG`) : seule source du prix, copiée en instantané (B4-PO-9). */
  readonly offre?: OfferConfig;
  readonly dureeVieMs?: number;
  /** Limiteur des actions (B4-TL-6 point 2) ; absent : aucun limiteur (tests). */
  readonly limiteur?: (action: ActionLimitee) => Promise<Result<void>>;
  /** Suite « voyage débloqué » (B4-TL-12) ; défaut : la suite sans effet de B4a. */
  readonly suite?: SuiteVoyageDebloque;
  /** Crochet de test (critère A7) : appelé dans la transaction du webhook, après `billing` et avant le droit. */
  readonly apresEnregistrement?: () => void | Promise<void>;
};

/** Configuration effective de l'offre. */
export const offreDe = (deps: DependancesPaiement): OfferConfig => deps.offre ?? OFFER_CONFIG;
export const dureeVieDe = (deps: DependancesPaiement): number => deps.dureeVieMs ?? DUREE_VIE_PAIEMENT_MS;

/** Transaction de l'organisation de la personne (`withOrg`), avec un exécuteur à paramètres liés. */
export function transactionOrganisation(deps: DependancesPaiement) {
  return <T>(ctx: { organizationId: string; userId: string }, fn: (executeur: Executeur) => Promise<T>): Promise<T> =>
    deps.withOrg(ctx, (tx) => fn(executeurSql(tx)));
}

/**
 * Transaction du webhook (B4-TL-4) : niveau `READ COMMITTED` (écrit explicitement : le verrou et la relecture le
 * supposent), rôle `vadrouille_webhook` pris par `SET LOCAL ROLE` depuis `vadrouille_app`, sans organisation posée.
 */
export function transactionWebhook<T>(deps: DependancesPaiement, fn: (executeur: Executeur) => Promise<T>): Promise<T> {
  return deps.database.transaction(
    async (tx) => {
      const executeur = executeurSql(tx);
      await executeur.query("SET LOCAL ROLE vadrouille_webhook");
      return fn(executeur);
    },
    { isolationLevel: "read committed" },
  );
}
