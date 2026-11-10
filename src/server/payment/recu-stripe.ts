import "server-only";

import { recuStripeAdmis } from "@/contracts/values";
import { logEvent } from "@/server/log";

import { transactionWebhook, type DependancesPaiement } from "./dependances";
import { versIdentifiantPublic } from "./identifiant";
import type { PrestatairePaiement } from "./paiements";
import type { RecuAConserver } from "./webhook";

/**
 * Conservation du lien du reçu de Stripe (spécification B4, B4e ; décision 0144 § 5.1 option B et § 5.3 point 4),
 * fournie au traitement des événements par la **seule route Stripe** (`src/server/routes/stripe-webhook.ts`, par
 * `composerConserverRecuStripe` de `composition-stripe.ts`). Appelée une fois, **après** la validation de la transaction
 * qui accorde le droit : `adresseRecu` (hors transaction, délai de 2 s, aucune relance), `recuStripeAdmis`, puis une
 * transaction courte sous `vadrouille_webhook`, organisation positionnée, qui écrit le lien **une seule fois**
 * (`… AND stripe_receipt_url IS NULL` ; le déclencheur `checkouts_receipt_once` de la migration 0025 refuse toute
 * réécriture).
 *
 * **Durée totale bornée** à `DUREE_MAX_RECU_MS` : l'ensemble est en course contre une minuterie, libérée dès la fin de la
 * course (aucune minuterie pendante). La minuterie n'abandonne que l'attente : l'appel HTTP reste borné par son propre
 * délai, la transaction n'est pas ouverte si l'échéance est passée (vérifiée avant `BEGIN` et avant l'`UPDATE`), et une
 * transaction ouverte est bornée par la base (`statement_timeout` de 1 s, `idle_in_transaction_session_timeout` de 2 s).
 *
 * **Panne sans effet** sur le droit ni sur la réponse : rien n'est levé ; une seule ligne `payment.receipt_unavailable`
 * (niveau `warn`, champs `eventId` et `reason` seulement, raison de `RAISONS_RECU`) ; **jamais le lien**, ni l'identifiant
 * de session, ni un message d'erreur. Aucune relance programmée.
 */

/** Durée totale de la conservation (0144 § 5.3 point 4). */
export const DUREE_MAX_RECU_MS = 3_000;

/** Raisons fermées de la ligne `payment.receipt_unavailable` (égalité avec `LOG_RECEIPT_REASONS` vérifiée par le test). */
export const RAISONS_RECU = ["provider_error", "refused", "db_error", "timeout"] as const;
export type RaisonRecu = (typeof RAISONS_RECU)[number];

export type OptionsConserverRecu = {
  /** Prestataire du reçu, construit à l'appel (une construction qui lève vaut `provider_error`). */
  readonly prestataire: () => Pick<PrestatairePaiement, "adresseRecu">;
  /** Durée totale (défaut : `DUREE_MAX_RECU_MS`) ; les tests la raccourcissent. */
  readonly dureeMaxMs?: number;
  /** Horloge monotone en millisecondes (défaut : `performance.now`), pour l'échéance. */
  readonly horloge?: () => number;
};

/** Échéance passée avant `BEGIN` ou avant l'`UPDATE` : la transaction est abandonnée sans rien écrire. */
class EcheancePassee extends Error {
  override name = "EcheancePassee";
}

export function creerConserverRecu(deps: DependancesPaiement, options: OptionsConserverRecu): (recu: RecuAConserver) => Promise<void> {
  const duree = options.dureeMaxMs ?? DUREE_MAX_RECU_MS;
  const horloge = options.horloge ?? (() => performance.now());

  return async (recu) => {
    const echeance = horloge() + duree;
    const passee = () => horloge() >= echeance;

    const travail = async (): Promise<RaisonRecu | null> => {
      let lien: string;
      try {
        const lu = await options.prestataire().adresseRecu(recu.sessionId, {
          id: recu.checkoutId,
          checkoutId: versIdentifiantPublic(recu.checkoutId),
          tripId: recu.tripId,
        });
        if (!lu.ok) return "provider_error";
        if (!recuStripeAdmis(lu.value)) return "refused";
        lien = lu.value;
      } catch {
        return "provider_error";
      }
      if (passee()) return "timeout";
      try {
        await transactionWebhook(deps, async (executeur) => {
          // Organisation d'abord : sans elle, la politique RLS `checkouts_webhook` ne laisse voir aucune ligne.
          await executeur.query("SELECT set_config('app.organization_id', $1, true)", [recu.organizationId]);
          await executeur.query("SET LOCAL statement_timeout = '1s'");
          await executeur.query("SET LOCAL idle_in_transaction_session_timeout = '2s'");
          if (passee()) throw new EcheancePassee();
          await executeur.query("UPDATE public.checkouts SET stripe_receipt_url = $1 WHERE id = $2 AND stripe_receipt_url IS NULL", [lien, recu.checkoutId]);
        });
      } catch (erreur) {
        return erreur instanceof EcheancePassee ? "timeout" : "db_error";
      }
      return null;
    };

    let minuterie: ReturnType<typeof setTimeout> | undefined;
    const delai = new Promise<RaisonRecu>((resolve) => {
      minuterie = setTimeout(() => resolve("timeout"), duree);
    });
    let raison: RaisonRecu | null;
    try {
      raison = await Promise.race([travail().catch((): RaisonRecu => "db_error"), delai]);
    } catch {
      raison = "db_error";
    } finally {
      clearTimeout(minuterie);
    }
    if (raison !== null) logEvent("payment.receipt_unavailable", { eventId: recu.eventId, reason: raison }, "warn");
  };
}
