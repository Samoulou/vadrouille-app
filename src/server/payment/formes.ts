import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { CheckoutOutcome } from "@/contracts/values";

/**
 * Identifiants du prestataire simulé (décision 0097 B4-TL-10) : session `cs_sim_` (16 octets aléatoires en base64url),
 * événement `evt_sim_` **déterministe** (32 premiers caractères hexadécimaux du SHA-256 de `<uuid du paiement>:<issue>`),
 * pour que rejouer une issue réémette le même événement (B4-PO-11) et qu'une autre issue en donne un autre. Le webhook
 * simulé refuse un identifiant sans cette forme (A17) ; le webhook Stripe refuse l'inverse (C7, `formeStripe` ci-dessous).
 */

export const SESSION_SIMULEE = /^cs_sim_[A-Za-z0-9_-]{22,64}$/;
export const EVENEMENT_SIMULE = /^evt_sim_[0-9a-f]{32}$/;

export function idSessionSimulee(): string {
  return `cs_sim_${randomBytes(16).toString("base64url")}`;
}

export function idEvenementSimule(checkoutUuid: string, issue: CheckoutOutcome): string {
  return `evt_sim_${createHash("sha256").update(`${checkoutUuid}:${issue}`, "utf8").digest("hex").slice(0, 32)}`;
}

/** Vrai si l'événement et sa session (si présente) ont la forme simulée. */
export function formeSimulee(eventId: string, sessionId: string | undefined): boolean {
  return EVENEMENT_SIMULE.test(eventId) && (sessionId === undefined || SESSION_SIMULEE.test(sessionId));
}

/**
 * Identifiants de Stripe en mode test (décision 0140 § 8, critère C7) : événement `evt_` suivi de 1 à 255 caractères
 * alphanumériques (forme déjà admise par le journal), session `cs_test_` seulement (une session `cs_live_` n'a rien à
 * faire en mode test).
 */
export const EVENEMENT_STRIPE = /^evt_[A-Za-z0-9]{1,255}$/;
export const SESSION_STRIPE = /^cs_test_[A-Za-z0-9]{1,255}$/;

/**
 * Vrai si l'événement et sa session (si présente) ont la forme de Stripe **et n'ont pas** la forme simulée : les deux
 * exclusions explicites rendent le refus d'un identifiant simulé indépendant des motifs (un `evt_sim_…` ne passe jamais,
 * même si un motif s'élargit). Aucun identifiant n'est admis à la fois par `formeSimulee` et `formeStripe` (test).
 */
export function formeStripe(eventId: string, sessionId: string | undefined): boolean {
  if (!EVENEMENT_STRIPE.test(eventId) || EVENEMENT_SIMULE.test(eventId)) return false;
  return sessionId === undefined || (SESSION_STRIPE.test(sessionId) && !SESSION_SIMULEE.test(sessionId));
}
