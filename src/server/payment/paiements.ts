import "server-only";

import {
  CheckoutRequestSchema,
  CheckoutStartSchema,
  CheckoutStatusSchema,
  OfferSchema,
  fail,
  ok,
  type CheckoutStart,
  type CheckoutStatus,
  type Offer,
  type Result,
} from "@/contracts";
import type { AdapterContext } from "@/adapters/types";
import type { CheckoutOutcome, CheckoutStatusCode } from "@/contracts/values";

import { dureeVieDe, offreDe, transactionOrganisation, type DependancesPaiement, type Executeur } from "./dependances";
import { depuisIdentifiantPublic, versIdentifiantPublic } from "./identifiant";

/**
 * Cas d'usage du paiement serveur lus ou écrits sous `withOrg` (spécification B4, B4a point 2 ; décisions 0097 B4-TL-1,
 * B4-TL-3 et B4-TL-5) : offre, création d'un paiement (`createCheckout`), statut (`getCheckoutStatus`), droit
 * (`getEntitlement`) et demande d'une issue simulée (`simulateOutcome`). Aucun de ces cas n'écrit de droit ni de statut :
 * seul le webhook le fait (`./webhook.ts`, B4-PO-2). Une erreur de base ou de prestataire devient `provider_error`
 * (`retryable: true`) ; ni message, ni pile, ni corps de réponse ne sortent d'ici.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Prestataire du paiement : crée la session d'un paiement déjà écrit et rend son identifiant (écrit une seule fois). */
export type PrestatairePaiement = {
  creerSession(paiement: { readonly checkoutId: string }): Promise<string>;
};

/** Ce que le prestataire simulé reçoit pour émettre l'événement d'une issue : l'instantané du paiement lu en base. */
export type PaiementAEmettre = {
  readonly checkoutId: string;
  readonly sessionId: string;
  readonly amount: number;
  readonly currency: string;
};

/** Prestataire simulé (B4-TL-3) : émet, signe et livre l'événement d'une issue ; vrai si le webhook a répondu `200`. */
export type PrestataireSimule = PrestatairePaiement & {
  emettre(paiement: PaiementAEmettre, issue: CheckoutOutcome): Promise<boolean>;
};

/** Ligne de `checkouts` telle que lue par ces cas d'usage. */
export type LignePaiement = {
  readonly id: string;
  readonly tripId: string;
  readonly requestId: string;
  readonly method: string;
  readonly status: CheckoutStatusCode;
  readonly priceVariant: string;
  readonly amount: number;
  readonly currency: string;
  readonly sessionId: string | null;
  readonly createdMs: number;
};

export const COLONNES_PAIEMENT = `id::text AS id, trip_id::text AS trip_id, request_id::text AS request_id, method, status, price_variant,
  amount_cents, currency, stripe_checkout_session_id, floor(extract(epoch FROM created_at) * 1000)::bigint AS created_ms`;

export function lignePaiement(row: Record<string, unknown>): LignePaiement {
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    requestId: String(row.request_id),
    method: String(row.method),
    status: String(row.status) as CheckoutStatusCode,
    priceVariant: String(row.price_variant),
    amount: Number(row.amount_cents),
    currency: String(row.currency),
    sessionId: row.stripe_checkout_session_id === null ? null : String(row.stripe_checkout_session_id),
    createdMs: Number(row.created_ms),
  };
}

const ERREUR_PRESTATAIRE: Result<never> = { ok: false, error: { code: "provider_error", retryable: true } };

/** Droit `tripUnlocked` du voyage dans l'organisation de la transaction : son identifiant, ou `null`. */
export async function lireDroitVoyage(executeur: Executeur, tripId: string): Promise<string | null> {
  const { rows } = await executeur.query("SELECT id::text AS id FROM entitlements WHERE trip_id = $1 AND kind = 'tripUnlocked'", [tripId]);
  return rows.length === 0 ? null : String(rows[0]?.id);
}

/** Vrai si le voyage existe dans l'organisation de la transaction (RLS). */
async function voyageExiste(executeur: Executeur, tripId: string): Promise<boolean> {
  return (await executeur.query("SELECT 1 FROM trips WHERE id = $1", [tripId])).rows.length > 0;
}

/**
 * Statut lu (B4-PO-4) : un paiement `pending` dont la durée de vie est passée est **lu** `expired`, sans écriture
 * (`vadrouille_app` ne peut pas écrire le statut), sauf si un `checkoutCompleted` non payé est enregistré pour lui
 * (paiement asynchrone en cours : il reste `pending`).
 */
async function statutLu(executeur: Executeur, ligne: LignePaiement, deps: DependancesPaiement): Promise<CheckoutStatusCode> {
  if (ligne.status !== "pending" || deps.maintenant() < ligne.createdMs + dureeVieDe(deps)) return ligne.status;
  const enCours = await executeur.query(
    "SELECT 1 FROM billing WHERE checkout_id = $1 AND type = 'checkoutCompleted' AND outcome = 'ignored' LIMIT 1",
    [ligne.id],
  );
  return enCours.rows.length > 0 ? "pending" : "expired";
}

/** Paiement commencé par la personne de la transaction (B4-PO-7 : lecture réservée à `created_by`), ou `null`. */
async function paiementDeLaPersonne(executeur: Executeur, checkoutUuid: string, userId: string): Promise<LignePaiement | null> {
  const { rows } = await executeur.query(`SELECT ${COLONNES_PAIEMENT} FROM checkouts WHERE id = $1 AND created_by = $2`, [checkoutUuid, userId]);
  return rows.length === 0 ? null : lignePaiement(rows[0] as Record<string, unknown>);
}

function vue(ligne: LignePaiement, status: CheckoutStatusCode): Result<CheckoutStatus> {
  const valide = CheckoutStatusSchema.safeParse({
    checkoutId: versIdentifiantPublic(ligne.id),
    tripId: ligne.tripId,
    method: ligne.method,
    status,
    priceVariant: ligne.priceVariant,
    amount: ligne.amount,
    currency: ligne.currency,
  });
  return valide.success ? ok(valide.data) : ERREUR_PRESTATAIRE;
}

function depart(ligne: LignePaiement, cheminSimulation: (tripId: string, checkoutId: string) => string): Result<CheckoutStart> {
  const checkoutId = versIdentifiantPublic(ligne.id);
  const valide = CheckoutStartSchema.safeParse({ checkoutId, redirectUrl: cheminSimulation(ligne.tripId, checkoutId) });
  return valide.success ? ok(valide.data) : ERREUR_PRESTATAIRE;
}

export function creerCasPaiement(deps: DependancesPaiement) {
  const enOrganisation = transactionOrganisation(deps);

  /** Refus du limiteur (`rate_limited`), ou `null` si l'appel est admis. */
  async function limiter(action: "payment-start" | "payment-simulate"): Promise<Result<never> | null> {
    if (deps.limiteur === undefined) return null;
    const decision = await deps.limiteur(action);
    return decision.ok ? null : { ok: false, error: decision.error };
  }

  async function getCheckoutStatus(ctx: AdapterContext, checkoutId: string): Promise<Result<CheckoutStatus>> {
    const uuid = depuisIdentifiantPublic(checkoutId);
    if (uuid === null) return fail("not_found");
    try {
      return await enOrganisation(ctx, async (executeur) => {
        const ligne = await paiementDeLaPersonne(executeur, uuid, ctx.userId);
        if (ligne === null) return fail("not_found");
        return vue(ligne, await statutLu(executeur, ligne, deps));
      });
    } catch {
      return ERREUR_PRESTATAIRE;
    }
  }

  return {
    async getOffer(ctx: AdapterContext, tripId: string): Promise<Result<Offer>> {
      if (!UUID.test(tripId)) return fail("not_found");
      try {
        const existe = await enOrganisation(ctx, (executeur) => voyageExiste(executeur, tripId));
        if (!existe) return fail("not_found");
        return ok(OfferSchema.parse({ tripId, ...offreDe(deps) }));
      } catch {
        return ERREUR_PRESTATAIRE;
      }
    },

    /**
     * Commencer un paiement (B4-PO-6 à B4-PO-9) : personne de rôle `owner` seulement (sinon `not_found`, comme un voyage
     * inconnu) ; idempotence par (organisation, `requestId`) ; `already_unlocked` sans écrire si le voyage a son droit ;
     * ligne `checkouts` écrite avec l'instantané du prix de la configuration, puis identifiant de session écrit une
     * seule fois (le défaut `gen_random_uuid()` de `checkouts.id` n'est jamais remplacé : B4-TL-1 point 4).
     */
    async createCheckout(
      ctx: AdapterContext,
      request: unknown,
      prestataire: PrestatairePaiement,
      cheminSimulation: (tripId: string, checkoutId: string) => string,
    ): Promise<Result<CheckoutStart>> {
      const lu = CheckoutRequestSchema.safeParse(request);
      if (!lu.success) return fail("validation_failed");
      const { tripId, method, requestId } = lu.data;
      if (ctx.role !== "owner" || !UUID.test(tripId)) return fail("not_found");
      const refus = await limiter("payment-start");
      if (refus !== null) return refus;
      const offre = offreDe(deps);
      try {
        return await enOrganisation(ctx, async (executeur): Promise<Result<CheckoutStart>> => {
          if (!(await voyageExiste(executeur, tripId))) return fail("not_found");
          const memeDemande = async (): Promise<Result<CheckoutStart> | null> => {
            const { rows } = await executeur.query(`SELECT ${COLONNES_PAIEMENT} FROM checkouts WHERE request_id = $1`, [requestId]);
            if (rows.length === 0) return null;
            const ligne = lignePaiement(rows[0] as Record<string, unknown>);
            if (ligne.tripId !== tripId || ligne.method !== method) return fail("validation_failed");
            if (ligne.sessionId === null) return ERREUR_PRESTATAIRE;
            return depart(ligne, cheminSimulation);
          };
          const deja = await memeDemande();
          if (deja !== null) return deja;
          if ((await lireDroitVoyage(executeur, tripId)) !== null) return fail("already_unlocked");
          const instant = new Date(deps.maintenant()).toISOString();
          const insere = await executeur.query(
            `INSERT INTO checkouts (organization_id, trip_id, request_id, price_variant, amount_cents, currency, method, created_by, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::timestamptz, $9::timestamptz)
             ON CONFLICT (organization_id, request_id) DO NOTHING
             RETURNING ${COLONNES_PAIEMENT}`,
            [ctx.organizationId, tripId, requestId, offre.priceVariant, offre.amount, offre.currency, method, ctx.userId, instant],
          );
          // Même `requestId` arrivé en même temps : la ligne de l'autre appel fait foi.
          if (insere.rows.length === 0) return (await memeDemande()) ?? ERREUR_PRESTATAIRE;
          const ligne = lignePaiement(insere.rows[0] as Record<string, unknown>);
          const session = await prestataire.creerSession({ checkoutId: ligne.id });
          await executeur.query("UPDATE checkouts SET stripe_checkout_session_id = $1 WHERE id = $2", [session, ligne.id]);
          return depart(ligne, cheminSimulation);
        });
      } catch {
        return ERREUR_PRESTATAIRE;
      }
    },

    getCheckoutStatus,

    /** Droit du voyage pour l'organisation entière (B4-PO-7) ; un identifiant qui n'est pas un `uuid` n'a aucun droit. */
    async getEntitlement(ctx: AdapterContext, tripId: string): Promise<{ unlocked: boolean }> {
      if (!UUID.test(tripId)) return { unlocked: false };
      return enOrganisation(ctx, async (executeur) => ({ unlocked: (await lireDroitVoyage(executeur, tripId)) !== null }));
    },

    /**
     * Demande d'une issue au prestataire simulé (B4-PO-2, B4-PO-3, B4-PO-11 ; B4-TL-3 point 3). La seule entrée du
     * client est l'issue ; le montant, la devise et la session viennent de la ligne lue en base. Le prestataire n'émet
     * que pour un paiement lu `pending` de la personne connectée (une réussite n'est donc jamais émise après
     * l'expiration), ou pour rejouer l'issue déjà appliquée (même événement, B4-PO-11). Rien n'est écrit ici : le
     * statut rendu est relu après la livraison au webhook.
     */
    async simulateOutcome(ctx: AdapterContext, checkoutId: string, issue: CheckoutOutcome, prestataire: PrestataireSimule): Promise<Result<CheckoutStatus>> {
      const refus = await limiter("payment-simulate");
      if (refus !== null) return refus;
      const uuid = depuisIdentifiantPublic(checkoutId);
      if (uuid === null) return fail("not_found");
      let aEmettre: PaiementAEmettre | null;
      try {
        const lecture = await enOrganisation(ctx, async (executeur) => {
          const ligne = await paiementDeLaPersonne(executeur, uuid, ctx.userId);
          if (ligne === null) return null;
          return { ligne, statut: await statutLu(executeur, ligne, deps) };
        });
        if (lecture === null) return fail("not_found");
        const { ligne, statut } = lecture;
        const rejeu = ISSUE_APPLIQUEE[issue].includes(ligne.status);
        if (statut !== "pending" && !rejeu) return vue(ligne, statut);
        if (ligne.sessionId === null) return ERREUR_PRESTATAIRE;
        aEmettre = { checkoutId: ligne.id, sessionId: ligne.sessionId, amount: ligne.amount, currency: ligne.currency };
      } catch {
        return ERREUR_PRESTATAIRE;
      }
      let livre = false;
      try {
        livre = await prestataire.emettre(aEmettre, issue);
      } catch {
        livre = false;
      }
      if (!livre) return ERREUR_PRESTATAIRE;
      return getCheckoutStatus(ctx, checkoutId);
    },
  };
}

/** Statuts qu'une issue a déjà produits : demander de nouveau cette issue rejoue le même événement (B4-PO-11). */
const ISSUE_APPLIQUEE: Readonly<Record<CheckoutOutcome, readonly CheckoutStatusCode[]>> = {
  succeeded: ["succeeded", "duplicate"],
  declined: ["declined"],
  cancelled: ["cancelled"],
};

export type CasPaiement = ReturnType<typeof creerCasPaiement>;
