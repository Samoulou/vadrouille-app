import "server-only";

import { createHash, randomBytes } from "node:crypto";

import type { CheckoutOutcome } from "@/contracts/values";

/**
 * Identifiants du prestataire simulé (décision 0097 B4-TL-10) : session `cs_sim_` (16 octets aléatoires en base64url),
 * événement `evt_sim_` **déterministe** (32 premiers caractères hexadécimaux du SHA-256 de `<uuid du paiement>:<issue>`),
 * pour que rejouer une issue réémette le même événement (B4-PO-11) et qu'une autre issue en donne un autre. Le webhook
 * simulé refuse un identifiant sans cette forme (A17) ; le webhook Stripe de B4c refusera l'inverse (C7).
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
