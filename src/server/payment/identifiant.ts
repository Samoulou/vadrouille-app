import "server-only";

import { CHECKOUT_ID_PATTERN } from "@/contracts/values";

/**
 * Identifiant public d'un paiement (décision 0097 B4-TL-1) : l'`uuid` de `checkouts.id` encodé en base64url (16 octets,
 * 22 caractères, sans remplissage). Aucune colonne ni migration. Les métadonnées du prestataire, `PaymentEvent.checkoutId`
 * et `billing.checkout_id` portent l'`uuid` interne, jamais l'identifiant public. L'identifiant n'est jamais une preuve
 * d'accès : la lecture est réservée à la personne qui a commencé le paiement (contrôle applicatif `created_by`).
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `uuid` (36 caractères) vers identifiant public (22 caractères base64url) ; lève pour une entrée qui n'est pas un `uuid`. */
export function versIdentifiantPublic(uuid: string): string {
  if (!UUID.test(uuid)) throw new TypeError("identifiant de paiement : uuid attendu");
  return Buffer.from(uuid.replaceAll("-", ""), "hex").toString("base64url");
}

/**
 * Identifiant public vers `uuid` en minuscules, ou `null` : forme de `CHECKOUT_ID_PATTERN`, décodage, puis ré-encodage
 * comparé à l'entrée. 16 octets font 128 bits sur 22 × 6 = 132 bits : les 4 bits de remplissage du dernier caractère
 * doivent être nuls, toute autre forme est refusée (non canonique). Toute entrée du navigateur passe par cette fonction.
 */
export function depuisIdentifiantPublic(identifiant: unknown): string | null {
  if (typeof identifiant !== "string" || !CHECKOUT_ID_PATTERN.test(identifiant)) return null;
  const octets = Buffer.from(identifiant, "base64url");
  if (octets.length !== 16 || octets.toString("base64url") !== identifiant) return null;
  const hex = octets.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
