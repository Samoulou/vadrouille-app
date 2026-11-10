import "server-only";

import type { AdapterContext, MemberRole } from "@/adapters/types";
import type { Result } from "@/contracts";
import { parseEmailAddress } from "@/server/email";
import { errorNameOf, logEvent } from "@/server/log";
import { oublierDansLeLimiteur, type PersonneDuLimiteur } from "@/server/rate-limit";
import { executeurSql, withOrg } from "@/server/with-org";

import { createDatabase } from "../../../db/index.ts";

/**
 * « Supprimer mon compte » (spécification M9 § 4 et § 6.3 ; handover back-end § 12, étapes 1 à 5 ; ticket 1106, M9b).
 * Seul module hors de `db/` qui nomme `purge_organization_data` (décision 0007), et seul qui supprime des lignes
 * d'authentification d'une personne (étape 2).
 *
 * **Option A de Q48** (comportement par défaut révocable, M9-PO-8 ; la décision reste à Samuel) : `billing` et
 * `usage_ledger` ne sont pas touchés, et la ligne `organizations` reste, en « suppression en cours », sans adhésion ni
 * donnée personnelle (nom fixe, slug aléatoire : `src/tenancy/creation-compte.ts`). Aucune migration.
 *
 * Étapes, toutes rejouables :
 * 1. **Marque et purge métier**, une transaction `withOrg` (rôle `vadrouille_app`, contexte de la session) : refus si un
 *    paiement est en attente (§ 4.3 point 4, proposition ; forme T6 à confirmer), puis `SET LOCAL ROLE
 *    vadrouille_account_admin` et `purge_organization_data`, qui pose `deletion_requested_at` et supprime les données
 *    métier, `place_coordinates` comprise depuis la migration 0028 (décision 0167). Dès la validation de cette transaction,
 *    toute session de l'organisation est refusée (`readSession`) et aucune nouvelle session ne peut être créée.
 * 2. **Authentification**, sous `vadrouille_auth` puis `vadrouille_limiter` : `sessions` (toutes, tous appareils),
 *    `accounts`, `verifications` de l'adresse, entrées du limiteur de la personne (clés par adresse et par identifiant),
 *    puis, **dans une même transaction**, adhésions et `users`. Cette dernière transaction évite l'état « personne sans
 *    adhésion », d'où aucune reprise n'est possible (`OrganisationAbsenteError` à la connexion). L'adresse est lue dans
 *    `users`, supprimée en dernier : elle reste lisible tant qu'il reste quelque chose à supprimer.
 * 3. **Organisation** : rien (option A).
 * 4. **Reprise** : chaque tentative relit l'état sous `vadrouille_auth` et rejoue les étapes 1 et 2 ; une personne déjà
 *    supprimée termine sans erreur. `supprimer` fait lui-même une seconde tentative après une erreur (handover § 12, point
 *    4) ; `reprendre` est le point d'appel de `verifyCode` (`src/server/auth/reprise.ts`), sans session. Rejouer l'étape 1
 *    efface aussi une ligne métier qu'une génération en cours aurait écrite après la première purge (§ 4.3 point 4 ; point
 *    SP3 de 0167), avant la suppression de `users` que cette ligne bloquerait.
 *
 * Organisation à plusieurs membres (hors MVP, handover § 12, dernier paragraphe) : jamais purgée. Un conseiller y perd sa
 * seule adhésion ; son propriétaire est refusé (`forbidden`), l'invariant « exactement un propriétaire » interdisant de
 * retirer son adhésion sans transfert, qui n'est pas spécifié. L'action, elle, refuse tout rôle autre que propriétaire
 * (§ 6.3, critère 10) : ce retrait n'est atteint que par le cas d'usage (critère 9, « base seulement »).
 *
 * Aucun journal d'une adresse, d'un identifiant ou d'un contenu : `compte.suppression_failed` ne porte que `errorName`.
 */

type Contexte = Pick<AdapterContext, "organizationId" | "userId">;

/** Ce que la base dit de la personne et de l'organisation du contexte, lu sous `vadrouille_auth`. */
export type EtatCompte =
  | { readonly existe: false }
  | {
      readonly existe: true;
      readonly email: string;
      /** Adhésion de la personne à l'organisation du contexte, `null` si elle n'en a pas. */
      readonly role: "owner" | "member" | null;
      readonly autresMembres: number;
      /** Autres organisations dont la personne est propriétaire (hors MVP : aucune). */
      readonly autresProprietes: number;
      readonly personnelle: boolean;
      readonly enSuppression: boolean;
    };

/** Suite donnée à un état : rien à faire, refus, retrait de la seule adhésion, ou suppression du compte. */
export type DecisionSuppression = "absent" | "forbidden" | "retrait" | "suppression";

export function deciderSuppression(etat: EtatCompte): DecisionSuppression {
  if (!etat.existe) return "absent";
  if (etat.role === null) return "forbidden";
  if (etat.autresMembres > 0) return etat.role === "member" ? "retrait" : "forbidden";
  if (etat.role !== "owner" || !etat.personnelle || etat.autresProprietes > 0) return "forbidden";
  return "suppression";
}

/** Opérations de base de la suppression, injectables une à une (tests : ordre, panne entre deux suppressions). */
export type PortsSuppression = {
  readonly etat: (ctx: Contexte) => Promise<EtatCompte>;
  /** Organisation personnelle de la personne si elle est en suppression, sinon `null` (reprise de `verifyCode`). */
  readonly organisationEnSuppression: (userId: string) => Promise<string | null>;
  /** Étape 1. `paiement_en_attente` : rien n'est marqué ni supprimé. */
  readonly purger: (ctx: Contexte) => Promise<"purge" | "paiement_en_attente">;
  readonly supprimerSessions: (userId: string) => Promise<void>;
  readonly supprimerComptes: (userId: string) => Promise<void>;
  readonly supprimerVerifications: (email: string) => Promise<void>;
  readonly oublierLimiteur: (personne: { readonly email: string; readonly userId: string }) => Promise<void>;
  /** Adhésions puis `users`, dans une même transaction. */
  readonly supprimerAdhesionsEtPersonne: (userId: string) => Promise<void>;
  /** Retrait de la seule adhésion `member` de la personne à l'organisation du contexte. */
  readonly retirerAdhesion: (ctx: Contexte) => Promise<void>;
};

export type ResultatSuppression =
  | { readonly ok: true; readonly issue: "supprime" | "deja_supprime" | "adhesion_retiree" }
  | { readonly ok: false; readonly code: "forbidden" | "paiement_en_attente" };

export type SuppressionCompte = {
  /** Contrôle d'accès seul (refus gratuit, avant la connexion récente et le limiteur) ; rien n'est écrit. */
  readonly decision: (ctx: Contexte) => Promise<DecisionSuppression>;
  /** Étapes 1 et 2 pour la personne du contexte ; une seconde tentative après une erreur, puis l'erreur est relancée. */
  readonly supprimer: (ctx: Contexte) => Promise<ResultatSuppression>;
  /** Reprise sans session : sans effet si l'organisation personnelle de la personne n'est pas en suppression. Peut lever. */
  readonly reprendre: (userId: string) => Promise<void>;
};

/** Tentatives de `supprimer` : la première, puis une relance (handover § 12, point 4). */
export const TENTATIVES_SUPPRESSION = 2;

export function creerSuppressionCompte(ports: PortsSuppression): SuppressionCompte {
  async function tentative(ctx: Contexte): Promise<ResultatSuppression> {
    const etat = await ports.etat(ctx);
    const decision = deciderSuppression(etat);
    if (!etat.existe || decision === "absent") return { ok: true, issue: "deja_supprime" };
    if (decision === "forbidden") return { ok: false, code: "forbidden" };
    if (decision === "retrait") {
      await ports.retirerAdhesion(ctx);
      return { ok: true, issue: "adhesion_retiree" };
    }
    // Étape 1.
    if ((await ports.purger(ctx)) === "paiement_en_attente") return { ok: false, code: "paiement_en_attente" };
    // Étape 2, dans l'ordre du handover § 12 ; chaque suppression vise des lignes qui peuvent déjà manquer.
    await ports.supprimerSessions(ctx.userId);
    await ports.supprimerComptes(ctx.userId);
    await ports.supprimerVerifications(etat.email);
    await ports.oublierLimiteur({ email: etat.email, userId: ctx.userId });
    await ports.supprimerAdhesionsEtPersonne(ctx.userId);
    return { ok: true, issue: "supprime" };
  }

  async function supprimer(ctx: Contexte): Promise<ResultatSuppression> {
    for (let essai = 1; ; essai += 1) {
      try {
        return await tentative(ctx);
      } catch (erreur) {
        if (essai >= TENTATIVES_SUPPRESSION) throw erreur;
      }
    }
  }

  return {
    decision: async (ctx) => deciderSuppression(await ports.etat(ctx)),
    supprimer,
    async reprendre(userId) {
      const organizationId = await ports.organisationEnSuppression(userId);
      if (organizationId === null) return;
      await supprimer({ organizationId, userId });
    },
  };
}

// --- Base ---------------------------------------------------------------------------------------------------------

/**
 * Durée pendant laquelle un paiement `pending` est tenu pour « en attente » : celle de la session de paiement chez
 * Stripe (`EXPIRATION_SESSION_S` de `src/server/payment/stripe.ts` : 30 minutes de vie et 120 secondes de marge ; égalité
 * testée). Au-delà, il est lu `expired` (B4-PO-4), sauf paiement asynchrone en cours.
 */
export const PAIEMENT_EN_ATTENTE_S = 30 * 60 + 120;

/**
 * Paiement en attente de l'organisation (§ 4.3 point 4) : `pending` et session non expirée (horloge de la base), ou
 * `pending` avec un `checkoutCompleted` non payé enregistré (paiement asynchrone en cours, même règle que `statutLu` de
 * `src/server/payment/paiements.ts`).
 */
export const SQL_PAIEMENT_EN_ATTENTE = `SELECT 1 FROM checkouts c WHERE c.organization_id = $1 AND c.status = 'pending'
  AND (c.created_at > now() - make_interval(secs => $2::double precision)
    OR EXISTS (SELECT 1 FROM billing b WHERE b.checkout_id = c.id AND b.type = 'checkoutCompleted' AND b.outcome = 'ignored'))
  LIMIT 1`;

const SQL_ROLE_PURGE = "SET LOCAL ROLE vadrouille_account_admin";
const SQL_PURGE = "SELECT public.purge_organization_data($1)";

/** Identifiant de vérification de Better Auth 1.7.7 pour une adresse (`identifiantCode` de `src/server/auth`). */
export const identifiantDeVerification = (email: string): string => `sign-in-otp-${email}`;

/** Client et pool minimaux (`pg.PoolClient`, `pg.Pool`), comme ceux du limiteur. */
export type ClientAuth = { query(texte: string, valeurs?: unknown[]): Promise<{ rows: unknown[] }>; release(erreur?: Error | boolean): void };
export type PoolAuth = { query(texte: string, valeurs?: unknown[]): Promise<{ rows: unknown[] }>; connect(): Promise<ClientAuth> };

export type BaseSuppression = {
  /** Pool du rôle `vadrouille_auth` (`createDatabase("vadrouille_auth").$client`). */
  readonly auth: PoolAuth;
  /** Contexte d'organisation sur le rôle `vadrouille_app` (`withOrg` du serveur, ou celui d'un test sur son client). */
  readonly avecOrg: typeof withOrg;
  /** Suppression des entrées du limiteur de la personne (`oublierDansLeLimiteur`, rôle `vadrouille_limiter`). */
  readonly oublier: (personne: PersonneDuLimiteur) => Promise<void>;
};

type LigneEtat = { email: string; role: string | null; autres_membres: number; autres_proprietes: number; kind: string | null; en_suppression: boolean | null };

const SQL_ETAT = `SELECT u.email,
  (SELECT m.role FROM memberships m WHERE m.user_id = u.id AND m.organization_id = $2::uuid LIMIT 1) AS role,
  (SELECT count(*)::int FROM memberships m WHERE m.organization_id = $2::uuid AND m.user_id <> u.id) AS autres_membres,
  (SELECT count(*)::int FROM memberships m WHERE m.user_id = u.id AND m.role = 'owner' AND m.organization_id <> $2::uuid) AS autres_proprietes,
  (SELECT o.kind FROM organizations o WHERE o.id = $2::uuid) AS kind,
  (SELECT o.deletion_requested_at IS NOT NULL FROM organizations o WHERE o.id = $2::uuid) AS en_suppression
  FROM users u WHERE u.id = $1::uuid`;

const SQL_ORGANISATION_EN_SUPPRESSION = `SELECT o.id::text AS id FROM memberships m JOIN organizations o ON o.id = m.organization_id
  WHERE m.user_id = $1::uuid AND m.role = 'owner' AND o.kind = 'personal' AND o.deletion_requested_at IS NOT NULL
  ORDER BY o.created_at, o.id LIMIT 1`;

/** Suppressions de l'étape 2 et retrait d'une adhésion de conseiller (tests : rien d'autre n'est supprimé sous `vadrouille_auth`). */
export const REQUETES_SUPPRESSION = Object.freeze({
  sessions: "DELETE FROM sessions WHERE user_id = $1::uuid",
  comptes: "DELETE FROM accounts WHERE user_id = $1::uuid",
  verifications: "DELETE FROM verifications WHERE identifier = $1",
  adhesions: "DELETE FROM memberships WHERE user_id = $1::uuid",
  personne: "DELETE FROM users WHERE id = $1::uuid",
  adhesionDeConseiller: "DELETE FROM memberships WHERE organization_id = $1::uuid AND user_id = $2::uuid AND role = 'member'",
});

/** Ports sur la base : paramètres liés seulement, aucun droit nouveau (droits de B1 de `vadrouille_auth`, 0007). */
export function portsSuppressionSur(base: BaseSuppression): PortsSuppression {
  const { auth } = base;
  return {
    async etat(ctx) {
      const lu = await auth.query(SQL_ETAT, [ctx.userId, ctx.organizationId]);
      const ligne = lu.rows[0] as LigneEtat | undefined;
      if (ligne === undefined) return { existe: false };
      return {
        existe: true,
        email: ligne.email,
        role: ligne.role === "owner" || ligne.role === "member" ? ligne.role : null,
        autresMembres: Number(ligne.autres_membres),
        autresProprietes: Number(ligne.autres_proprietes),
        personnelle: ligne.kind === "personal",
        enSuppression: ligne.en_suppression === true,
      };
    },
    async organisationEnSuppression(userId) {
      const lu = await auth.query(SQL_ORGANISATION_EN_SUPPRESSION, [userId]);
      const id = (lu.rows[0] as { id?: unknown } | undefined)?.id;
      return typeof id === "string" ? id : null;
    },
    purger: (ctx) =>
      base.avecOrg(ctx, async (tx) => {
        const executeur = executeurSql(tx);
        const attente = await executeur.query(SQL_PAIEMENT_EN_ATTENTE, [ctx.organizationId, PAIEMENT_EN_ATTENTE_S]);
        if (attente.rows.length > 0) return "paiement_en_attente";
        await executeur.query(SQL_ROLE_PURGE);
        await executeur.query(SQL_PURGE, [ctx.organizationId]);
        return "purge";
      }),
    async supprimerSessions(userId) {
      await auth.query(REQUETES_SUPPRESSION.sessions, [userId]);
    },
    async supprimerComptes(userId) {
      await auth.query(REQUETES_SUPPRESSION.comptes, [userId]);
    },
    async supprimerVerifications(email) {
      await auth.query(REQUETES_SUPPRESSION.verifications, [identifiantDeVerification(email)]);
    },
    async oublierLimiteur({ email, userId }) {
      // Le limiteur refuse toute adresse non canonique : aucune entrée n'existe sous une telle adresse.
      const lu = parseEmailAddress(email);
      if (lu.ok && lu.email === email) await base.oublier({ email: lu.email, userId });
    },
    async supprimerAdhesionsEtPersonne(userId) {
      const client = await auth.connect();
      try {
        await client.query("BEGIN");
        await client.query(REQUETES_SUPPRESSION.adhesions, [userId]);
        await client.query(REQUETES_SUPPRESSION.personne, [userId]);
        await client.query("COMMIT");
        client.release();
      } catch (erreur) {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release(erreur instanceof Error ? erreur : true);
        throw erreur;
      }
    },
    async retirerAdhesion(ctx) {
      await auth.query(REQUETES_SUPPRESSION.adhesionDeConseiller, [ctx.organizationId, ctx.userId]);
    },
  };
}

/** Bornes du pool `vadrouille_auth` de la suppression (mêmes garde-fous que les pools de `src/server/auth`). */
const POOL_SUPPRESSION = { max: 2, connectionTimeoutMillis: 5_000, query_timeout: 10_000 } as const;

let parDefaut: SuppressionCompte | undefined;

/** Cas d'usage du serveur : pool `vadrouille_auth` de `db/index.ts` (créé au premier appel), `withOrg`, limiteur du serveur. */
export function suppressionCompte(): SuppressionCompte {
  parDefaut ??= creerSuppressionCompte(
    portsSuppressionSur({ auth: createDatabase("vadrouille_auth", undefined, POOL_SUPPRESSION).$client, avecOrg: withOrg, oublier: oublierDansLeLimiteur }),
  );
  return parDefaut;
}

// --- Action -------------------------------------------------------------------------------------------------------

/** Nom d'action du limiteur (`src/server/config/limites.ts`). */
export const ACTION_LIMITEUR_SUPPRESSION = "suppression";

/** Champ de l'erreur `forbidden` d'un paiement en attente (forme T6 proposée : « `forbidden` avec une raison »). */
export const CHAMP_PAIEMENT_EN_ATTENTE = "payment";

export type CompteSupprime = { deleted: true };

/** Session lue : identifiants seulement, jamais le jeton. */
export type SessionSuppression = { readonly sessionId: string; readonly userId: string; readonly organizationId: string; readonly role: MemberRole };

/** Dépendances de l'action `deleteAccount`, injectables par les tests (aucune base, aucun `process.env`). */
export type DependancesActionSuppression = {
  /** Adaptateur `api` avec la connexion réelle seulement (`mock` : suppression non proposée, § 6.4 critère 10). */
  readonly disponible: () => boolean;
  /** Session du cookie de la requête, `null` sans session. */
  readonly session: () => Promise<SessionSuppression | null>;
  readonly connexionRecente: (sessionId: string, maintenant: Date) => Promise<boolean>;
  readonly limiteur: (userId: string) => Promise<{ readonly ok: boolean }>;
  readonly compte: Pick<SuppressionCompte, "decision" | "supprimer">;
  readonly maintenant: () => Date;
  /** Efface le cookie de la session supprimée ; un échec est ignoré (la session n'existe plus en base). */
  readonly effacerCookie: () => Promise<void>;
};

const INTERNE: Result<never> = Object.freeze({ ok: false, error: Object.freeze({ code: "internal", retryable: true }) }) as Result<never>;
const refus = (code: "not_found" | "unauthenticated" | "forbidden" | "reauthentication_required"): Result<never> => ({ ok: false, error: { code } });

function echec(erreur: unknown): Result<never> {
  const errorName = errorNameOf(erreur);
  logEvent("compte.suppression_failed", errorName === undefined ? {} : { errorName }, "error");
  return INTERNE;
}

/**
 * Cœur de l'action `deleteAccount` (`src/server/actions/compte.ts`). Aucune entrée : l'organisation et la personne
 * viennent de la session seule (§ 6.1). Contrôles, dans cet ordre, tous avant la moindre suppression :
 * 1. adaptateur `api` et connexion réelle, sinon `not_found` ;
 * 2. session, sinon `unauthenticated` (second onglet après la suppression : § 4.3 point 2) ;
 * 3. rôle `owner`, sinon `forbidden` (conseiller) ;
 * 4. organisation personnelle à un seul membre (M9-PO-2), sinon `forbidden` ;
 * 5. connexion récente (`reauthentification.ts`, moins de 10 minutes), sinon `reauthentication_required` ;
 * 6. limite `suppression` par personne, sinon `rate_limited` : seul refus qui débite ;
 * 7. paiement en attente : `forbidden`, `field: "payment"`, `retryable: true` (forme T6 à confirmer), rien supprimé.
 * Échec de la base après la relance interne : `internal` (`retryable: true`) et une ligne `compte.suppression_failed`.
 */
export async function supprimerMonCompte(d: DependancesActionSuppression): Promise<Result<CompteSupprime>> {
  if (!d.disponible()) return refus("not_found");
  let session: SessionSuppression | null;
  try {
    session = await d.session();
  } catch (erreur) {
    return echec(erreur);
  }
  if (session === null) return refus("unauthenticated");
  if (session.role !== "owner") return refus("forbidden");
  const ctx: Contexte = { organizationId: session.organizationId, userId: session.userId };
  try {
    if ((await d.compte.decision(ctx)) !== "suppression") return refus("forbidden");
  } catch (erreur) {
    return echec(erreur);
  }
  if (!(await d.connexionRecente(session.sessionId, d.maintenant()))) return refus("reauthentication_required");
  if (!(await d.limiteur(ctx.userId)).ok) return { ok: false, error: { code: "rate_limited", retryable: true } };
  let resultat: ResultatSuppression;
  try {
    resultat = await d.compte.supprimer(ctx);
  } catch (erreur) {
    return echec(erreur);
  }
  if (!resultat.ok) {
    if (resultat.code === "paiement_en_attente") return { ok: false, error: { code: "forbidden", field: CHAMP_PAIEMENT_EN_ATTENTE, retryable: true } };
    return refus("forbidden");
  }
  await d.effacerCookie().catch(() => undefined);
  return { ok: true, value: { deleted: true } };
}
