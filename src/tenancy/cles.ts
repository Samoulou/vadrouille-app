import "server-only";

import { hkdfSync } from "node:crypto";

/**
 * Séparation des usages de `BETTER_AUTH_SECRET` (spécification B3, B3b point 2 ; décision 0051 § 5). Aucun usage ne
 * reçoit le secret brut : chaque usage reçoit une clé dérivée par HKDF-SHA-256, `ikm` = octets décodés du secret
 * (`decodeSecret`, B3-TL-5), `salt` = tampon vide, `info` = étiquette de l'usage, 32 octets.
 *
 * Étiquettes : constantes de ce seul module, jamais construites à partir d'une entrée (0051 § 5.2) ; un usage nouveau
 * prend une étiquette nouvelle (`vadrouille/<usage>/v1`), un changement de format change la version (`v2`).
 */
export const ETIQUETTES_HKDF = Object.freeze({
  /** Secret transmis à Better Auth (signature des cookies, chiffrement interne), encodé en base64url sans remplissage. */
  betterAuth: "vadrouille/better-auth/v1",
  /** Clé du HMAC du code de connexion, gardée en tampon. */
  otp: "vadrouille/otp/v1",
} as const);

export type UsageCle = keyof typeof ETIQUETTES_HKDF;

const LONGUEUR_CLE = 32;
const SEL_VIDE = Buffer.alloc(0);

/** Clé de 32 octets de l'usage `usage` ; `hkdfSync` rend un `ArrayBuffer`, converti par `Buffer.from` (0051 § 5.5). */
export function deriverCle(secret: Buffer, usage: UsageCle): Buffer {
  return Buffer.from(hkdfSync("sha256", secret, SEL_VIDE, ETIQUETTES_HKDF[usage], LONGUEUR_CLE));
}

/** Option `secret` de Better Auth : clé `vadrouille/better-auth/v1`, en base64url sans remplissage. */
export function secretBetterAuth(secret: Buffer): string {
  return deriverCle(secret, "betterAuth").toString("base64url");
}

/** Clé du HMAC du code : `vadrouille/otp/v1`, tampon. */
export function cleCodeConnexion(secret: Buffer): Buffer {
  return deriverCle(secret, "otp");
}
