import "server-only";

import type { PaymentEvent } from "@/contracts/billing";
import type { CheckoutStatusCode } from "@/contracts/values";
import { logEvent, type LogFields } from "@/server/log";

import { dureeVieDe, transactionWebhook, type DependancesPaiement, type Executeur } from "./dependances";
import { COLONNES_PAIEMENT, lignePaiement, lireDroitVoyage, type LignePaiement } from "./paiements";
import { lancerSuite, suiteSansEffet, type VoyageDebloque } from "./suite";

/**
 * Traitement d'un événement de paiement vérifié (spécification B4, B4a point 2 ; handover § 8, workflow 6, étape 2, et
 * § 9 ; décisions 0097 B4-TL-4, B4-TL-10, B4-TL-12 et B4-TL-13). Commun au webhook simulé et, en B4c, au webhook
 * Stripe. **Une seule transaction** `READ COMMITTED` sous `SET LOCAL ROLE vadrouille_webhook`, dans cet ordre :
 * (1) organisation retrouvée par `checkout_organization` (jamais par les métadonnées), `app.organization_id` posé ;
 * (2) verrou consultatif du voyage ; (3) ligne `billing` de l'événement déjà enregistrée : rien n'est écrit ;
 * (4) contrôles du handover § 9 ; (5) lecture du droit ; (6) ligne `billing` ; (7) statut du paiement ; (8) droit
 * `tripUnlocked`. Puis, hors de la transaction, les alertes, la conservation du reçu de Stripe (route Stripe seulement,
 * décision 0144 § 5.3 point 4) et la suite (option B : la réponse ne dépend ni du reçu ni de la suite). Toute panne lève : rien n'est validé, le webhook répond `500` et le prestataire relivre (B4-PO-13).
 */

/** Codes des contrôles (handover § 9 ; B4-TL-13), écrits dans `billing.outcome_code` d'une ligne `rejected`. */
export const CODES_CONTROLE = [
  "provider_mismatch",
  "livemode",
  "session_mismatch",
  "checkout_mismatch",
  "trip_mismatch",
  "payment_status",
  "amount_mismatch",
  "currency_mismatch",
] as const;
export type CodeControle = (typeof CODES_CONTROLE)[number];

/** Codes d'alerte de ce module (égalité avec `LOG_ALERT_CODES` de `src/server/log.ts` vérifiée par le test). */
export const CODES_ALERTE_PAIEMENT = [...CODES_CONTROLE, "unknown_checkout", "duplicate_payment", "paid_after_failure", "refund", "dispute"] as const;
type CodeAlerte = (typeof CODES_ALERTE_PAIEMENT)[number];

export type OptionsTraitement = {
  /**
   * Forme des identifiants attendue par la route (B4-TL-10) : simulée pour le webhook simulé, Stripe pour le webhook
   * Stripe ; une forme refusée donne `provider_mismatch` si la session est connue.
   */
  readonly formeAttendue: (eventId: string, sessionId: string | undefined) => boolean;
  /**
   * Conservation du lien du reçu (B4e ; décision 0144 § 5.3 point 4), fournie **par la seule route Stripe** : appelée une
   * fois, **après** la validation de la transaction et les alertes, pour un paiement réussi dont ce paiement-ci a accordé
   * le droit et dont le lien est encore `NULL` ; toute erreur est avalée (la réponse et le droit n'en dépendent pas).
   * Absente (route simulée) : aucun appel.
   */
  readonly conserverRecu?: (recu: RecuAConserver) => Promise<void>;
};

/** Ce que la conservation du reçu reçoit : identifiants internes seulement, jamais un lien (0144 § 5.3 point 4). */
export type RecuAConserver = {
  /** `uuid` interne du paiement (`checkouts.id`). */
  readonly checkoutId: string;
  readonly sessionId: string;
  readonly tripId: string;
  readonly organizationId: string;
  readonly eventId: string;
};

/** Issue de la transaction du webhook : la suite à lancer et le reçu à conserver, chacun facultatif. */
type IssueTransaction = { readonly suite: VoyageDebloque | null; readonly recu: RecuAConserver | null };
const SANS_SUITE: IssueTransaction = { suite: null, recu: null };

type Issue = "granted" | "alreadyGranted" | "ignored" | "rejected";

const ECHECS: readonly CheckoutStatusCode[] = ["declined", "cancelled", "expired"];

const reussite = (evenement: PaymentEvent) => evenement.type === "checkoutCompleted" || evenement.type === "asyncPaymentSucceeded";

/** Premier contrôle en échec, ou `null`. Les contrôles de montant et de statut ne portent que sur une réussite. */
function controler(evenement: PaymentEvent, ligne: LignePaiement, options: OptionsTraitement, voyageVisible: boolean): CodeControle | null {
  if (!options.formeAttendue(evenement.eventId, evenement.checkoutSessionId)) return "provider_mismatch";
  if (evenement.livemode) return "livemode";
  if (evenement.checkoutSessionId !== ligne.sessionId) return "session_mismatch";
  if (reussite(evenement) ? evenement.checkoutId !== ligne.id : evenement.checkoutId !== undefined && evenement.checkoutId !== ligne.id) {
    return "checkout_mismatch";
  }
  if (!voyageVisible) return "trip_mismatch";
  if (!reussite(evenement)) return null;
  // `checkoutCompleted` non payé (moyen asynchrone en cours) n'est pas un refus : il est `ignored` (B4-PO-4).
  const enCours = evenement.type === "checkoutCompleted" && evenement.paymentStatus === "unpaid";
  if (evenement.paymentStatus !== "paid" && !enCours) return "payment_status";
  if (enCours) return null;
  if (evenement.amount !== ligne.amount) return "amount_mismatch";
  if (evenement.currency !== ligne.currency.toUpperCase()) return "currency_mismatch";
  return null;
}

async function enregistrer(
  executeur: Executeur,
  organisation: string,
  evenement: PaymentEvent,
  checkoutId: string,
  issue: Issue,
  code: CodeControle | null,
): Promise<string | null> {
  const { rows } = await executeur.query(
    `INSERT INTO billing (organization_id, stripe_event_id, type, livemode, checkout_id, amount_cents, currency, outcome, outcome_code)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     ON CONFLICT (stripe_event_id) DO NOTHING
     RETURNING id::text AS id`,
    [organisation, evenement.eventId, evenement.type, evenement.livemode, checkoutId, evenement.amount ?? null, evenement.currency ?? null, issue, code],
  );
  return rows.length === 0 ? null : String(rows[0]?.id);
}

async function changerStatut(executeur: Executeur, ligne: LignePaiement, statut: CheckoutStatusCode): Promise<void> {
  if (statut === ligne.status) return;
  await executeur.query("UPDATE checkouts SET status = $2, updated_at = now() WHERE id = $1", [ligne.id, statut]);
}

export async function handlePaymentEvent(deps: DependancesPaiement, evenement: PaymentEvent, options: OptionsTraitement): Promise<void> {
  const alertes: LogFields[] = [];
  const alerter = (alertCode: CodeAlerte, checkoutId?: string) =>
    alertes.push({ eventId: evenement.eventId, eventType: evenement.type, alertCode, ...(checkoutId === undefined ? {} : { checkoutId }) });
  const sansSession = () => alerter(evenement.type === "refund" || evenement.type === "dispute" ? evenement.type : "unknown_checkout");

  const { suite, recu } = await transactionWebhook(deps, async (executeur): Promise<IssueTransaction> => {
    const session = evenement.checkoutSessionId;
    // Session inconnue : aucune organisation, donc rien d'écrit et aucun verrou (handover § 9, A9). Un événement `other`
    // sans session (type hors de `checkout.session.*`, `charge.*` des remboursements et litiges à part) ne concerne aucun
    // paiement : ni ligne ni alerte, pour que le flux complet de Stripe (B4c) ne produise pas d'alertes `unknown_checkout`.
    if (session === undefined) {
      if (evenement.type !== "other") sansSession();
      return SANS_SUITE;
    }
    const organisation = (await executeur.query("SELECT public.checkout_organization($1)::text AS org", [session])).rows[0]?.org;
    if (typeof organisation !== "string") {
      sansSession();
      return SANS_SUITE;
    }
    await executeur.query("SELECT set_config('app.organization_id', $1, true)", [organisation]);
    const voyage = (await executeur.query("SELECT trip_id::text AS trip_id FROM checkouts WHERE stripe_checkout_session_id = $1", [session])).rows[0]
      ?.trip_id;
    if (typeof voyage !== "string") {
      sansSession();
      return SANS_SUITE;
    }
    // (2) Sérialisation des événements d'un même voyage (B4-TL-4) ; relecture du paiement après le verrou.
    await executeur.query("SELECT pg_advisory_xact_lock(hashtextextended('entitlement:' || $1::text, 0))", [voyage]);
    const brute = (await executeur.query(`SELECT ${COLONNES_PAIEMENT} FROM checkouts WHERE stripe_checkout_session_id = $1`, [session])).rows[0];
    if (brute === undefined) {
      sansSession();
      return SANS_SUITE;
    }
    const ligne = lignePaiement(brute as Record<string, unknown>);
    /** Vrai si le droit `droit` a été accordé par ce paiement-ci (`entitlements.billing_id → billing.checkout_id`). */
    const accordeParCePaiement = async (droit: string): Promise<boolean> => {
      const source = await executeur.query("SELECT b.checkout_id::text AS checkout_id FROM entitlements e JOIN billing b ON b.id = e.billing_id WHERE e.id = $1", [
        droit,
      ]);
      return source.rows[0]?.checkout_id === ligne.id;
    };
    /**
     * Reçu à conserver (0144 § 5.3 point 4) : seulement si la route le demande, pour une réussite payée dont ce paiement-ci a
     * accordé le droit, et si le lien est encore `NULL` (relu ici, sous le verrou du voyage).
     */
    const recuAConserver = async (accorde: boolean): Promise<RecuAConserver | null> => {
      if (options.conserverRecu === undefined || !accorde || !reussite(evenement) || evenement.paymentStatus !== "paid" || ligne.sessionId === null) return null;
      const vide = (await executeur.query("SELECT stripe_receipt_url IS NULL AS vide FROM checkouts WHERE id = $1", [ligne.id])).rows[0]?.vide;
      if (vide !== true) return null;
      return { checkoutId: ligne.id, sessionId: ligne.sessionId, tripId: ligne.tripId, organizationId: organisation, eventId: evenement.eventId };
    };
    const droitDe = async (): Promise<IssueTransaction> => {
      const droit = await lireDroitVoyage(executeur, ligne.tripId);
      if (droit === null) return SANS_SUITE;
      // Rejeu : le reçu n'est demandé que si le droit vient de ce paiement (jamais pour le rejeu d'un `duplicate`).
      const recu = options.conserverRecu === undefined ? null : await recuAConserver(await accordeParCePaiement(droit));
      return { suite: { entitlementId: droit, tripId: ligne.tripId, organizationId: organisation }, recu };
    };

    // (3) Événement déjà enregistré : rien n'est réécrit ; la suite est rejouée pour `granted` et `alreadyGranted`.
    const deja = (await executeur.query("SELECT outcome FROM billing WHERE stripe_event_id = $1", [evenement.eventId])).rows[0];
    if (deja !== undefined) return deja.outcome === "granted" || deja.outcome === "alreadyGranted" ? droitDe() : SANS_SUITE;

    // (4) Contrôles, chacun contre la ligne `checkouts` lue sous RLS.
    const voyageVisible = (await executeur.query("SELECT 1 FROM trips WHERE id = $1", [ligne.tripId])).rows.length > 0;
    const code = controler(evenement, ligne, options, voyageVisible);
    if (code !== null) {
      if ((await enregistrer(executeur, organisation, evenement, ligne.id, "rejected", code)) !== null) alerter(code, ligne.id);
      return SANS_SUITE;
    }

    const expireParLeTemps = deps.maintenant() >= ligne.createdMs + dureeVieDe(deps);
    if (reussite(evenement) && evenement.paymentStatus === "paid") {
      // (5) Droit existant : second paiement (`duplicate`, `alreadyGranted`) ou nouvelle réussite du même paiement.
      const droit = await lireDroitVoyage(executeur, ligne.tripId);
      const memePaiement = droit !== null && (await accordeParCePaiement(droit));
      // Paiement encaissé après un échec affiché (B4-PO-5) : le droit est accordé quand même, et signalé.
      let echecAffiche = ECHECS.includes(ligne.status);
      if (!echecAffiche && ligne.status === "pending" && expireParLeTemps) {
        // Écart connu avec `statutLu` (`paiements.ts`), qui exige `type = 'checkoutCompleted'` : `vadrouille_webhook` ne
        // lit que `id`, `stripe_event_id`, `checkout_id` et `outcome` de `billing` (0001_securite.sql). Un `other` avec
        // session enregistré sur ce paiement masque donc l'alerte `paid_after_failure` (le droit est accordé quand même).
        // Aligner demande le droit `SELECT (type)` pour ce rôle, donc une migration : reporté à B4b (PR #582, mineur 2).
        const enCours = await executeur.query("SELECT 1 FROM billing WHERE checkout_id = $1 AND outcome = 'ignored' LIMIT 1", [ligne.id]);
        echecAffiche = enCours.rows.length === 0;
      }
      const issue: Issue = droit === null ? "granted" : "alreadyGranted";
      // (6) et (7).
      const billing = await enregistrer(executeur, organisation, evenement, ligne.id, issue, null);
      if (billing === null) return SANS_SUITE;
      await changerStatut(executeur, ligne, droit === null || memePaiement ? "succeeded" : "duplicate");
      await deps.apresEnregistrement?.();
      if (echecAffiche) alerter("paid_after_failure", ligne.id);
      if (droit !== null) {
        if (!memePaiement) alerter("duplicate_payment", ligne.id);
        return { suite: { entitlementId: droit, tripId: ligne.tripId, organizationId: organisation }, recu: await recuAConserver(memePaiement) };
      }
      // (8) Droit ; l'unicité de `entitlements` reste le filet (une violation annule tout : 500, relivraison).
      const cree = await executeur.query(
        "INSERT INTO entitlements (organization_id, trip_id, kind, billing_id) VALUES ($1, $2, 'tripUnlocked', $3) RETURNING id::text AS id",
        [organisation, ligne.tripId, billing],
      );
      return { suite: { entitlementId: String(cree.rows[0]?.id), tripId: ligne.tripId, organizationId: organisation }, recu: await recuAConserver(true) };
    }

    // Événements sans droit : `ignored`, statut tiré de l'événement pour un paiement encore `pending` (B4-PO-4).
    if ((await enregistrer(executeur, organisation, evenement, ligne.id, "ignored", null)) === null) return SANS_SUITE;
    if (ligne.status === "pending") {
      if (evenement.type === "asyncPaymentFailed") await changerStatut(executeur, ligne, "declined");
      if (evenement.type === "checkoutExpired") await changerStatut(executeur, ligne, expireParLeTemps ? "expired" : "cancelled");
    }
    if (evenement.type === "refund" || evenement.type === "dispute") alerter(evenement.type, ligne.id);
    return SANS_SUITE;
  });

  // Après la validation seulement : une transaction annulée n'alerte pas (l'événement sera relivré).
  for (const champs of alertes) logEvent("payment.alert", champs, "error");
  // Reçu (0144 § 5.3 point 4) : après la validation et les alertes ; une panne est avalée, la réponse reste `200`.
  if (recu !== null && options.conserverRecu !== undefined) {
    try {
      await options.conserverRecu(recu);
    } catch {
      // Sans effet sur le droit ni sur la réponse ; `conserverRecu` journalise lui-même sa panne (code fixe).
    }
  }
  if (suite !== null) await lancerSuite(deps.suite ?? suiteSansEffet, suite);
}
