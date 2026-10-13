import { createHash, randomBytes } from "node:crypto";

/**
 * Jeton de partage (spécification F10, F10-TL-7) : 32 octets aléatoires en base64url, 43 caractères. Seule son
 * empreinte SHA-256 est gardée, y compris par l'adaptateur simulé ; le jeton en clair n'existe que dans la réponse
 * de `createShareLink`.
 */
export function randomShareToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Empreinte SHA-256 du jeton, en hexadécimal : seule forme gardée en mémoire (et, avec B12, en base). */
export function hashShareToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
