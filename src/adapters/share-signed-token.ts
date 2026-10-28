import { createHmac, timingSafeEqual } from "node:crypto";

import { SIGNED_SHARE_TOKEN_PATTERN, TRIP_ID_PATTERN } from "@/contracts/values";

/**
 * Jeton de partage **signé, sans stockage** (décision 0135, qui amende 0039 F10-TL-7 pour l'adaptateur réel du site
 * d'essai). Aucune table : le serveur ne garde rien ; le jeton porte ce qu'il faut pour relire le voyage, et la
 * signature garantit qu'il a été produit par ce serveur.
 *
 * - Forme : `v1.<charge>.<mac>` (`SIGNED_SHARE_TOKEN_PATTERN`).
 * - `charge` = base64url (sans remplissage) de `<voyage>~<organisation>~<dernier jour>` : identifiant du voyage
 *   (`TRIP_ID_PATTERN`), identifiant technique de l'organisation (même alphabet), dernier jour de validité (date ISO,
 *   `accessUntil(trip.end, accessDaysAfterReturn)`). Ni personne, ni adresse électronique, ni nom.
 * - `mac` = base64url de `HMAC-SHA-256(K, "vadrouille/partage/v1." + charge)` : la charge **encodée** est signée telle
 *   quelle (aucune mise en forme canonique à refaire). Vérification en temps constant (`timingSafeEqual`).
 * - `K` (32 octets au moins) est fourni par l'appelant ; ce module ne lit ni l'environnement ni l'horloge.
 *
 * Aucun journal (lint `no-console`) : ni le jeton, ni la charge, ni la clé n'en sortent.
 */

const PREFIXE_SIGNE = "vadrouille/partage/v1.";
/** Organisation : identifiant technique (uuid en base, `mock_org_…` en simulation), même alphabet que le voyage. */
const ORGANISATION = /^[A-Za-z0-9_-]{1,64}$/;
const DATE_ISO = /^\d{4}-\d{2}-\d{2}$/;
const SEPARATEUR = "~";
/** Longueur minimale de la clé : 32 octets (même seuil que `decodeSecret`, `src/server/env`). */
export const SHARE_KEY_MIN_BYTES = 32;

/** Contenu signé d'un jeton. */
export interface SignedSharePayload {
  readonly tripId: string;
  readonly organizationId: string;
  /** Dernier jour de validité, à l'heure de la destination (décision 0039, F10-TL-7 point 2 ; A4). */
  readonly expiresOn: string;
}

function dateIsoValide(value: string): boolean {
  if (!DATE_ISO.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function chargeValide(payload: SignedSharePayload): boolean {
  return TRIP_ID_PATTERN.test(payload.tripId) && ORGANISATION.test(payload.organizationId) && dateIsoValide(payload.expiresOn);
}

function mac(key: Buffer, charge: string): Buffer {
  return createHmac("sha256", key).update(PREFIXE_SIGNE + charge, "utf8").digest();
}

function assertKey(key: Buffer): void {
  if (key.length < SHARE_KEY_MIN_BYTES) throw new Error("clé de partage trop courte");
}

/** Jeton signé pour ce voyage ; lève une erreur pour une charge mal formée ou une clé trop courte (jamais un jeton faux). */
export function signShareToken(key: Buffer, payload: SignedSharePayload): string {
  assertKey(key);
  if (!chargeValide(payload)) throw new Error("charge de partage mal formée");
  const charge = Buffer.from([payload.tripId, payload.organizationId, payload.expiresOn].join(SEPARATEUR), "utf8").toString("base64url");
  const token = `v1.${charge}.${mac(key, charge).toString("base64url")}`;
  if (!SIGNED_SHARE_TOKEN_PATTERN.test(token)) throw new Error("charge de partage trop longue");
  return token;
}

/**
 * Contenu d'un jeton reçu : forme exacte, signature vérifiée en temps constant **avant** tout décodage de la charge,
 * puis charge décodée et contrôlée. `null` pour tout jeton mal formé, altéré ou signé par une autre clé, sans dire
 * lequel. L'expiration n'est pas contrôlée ici : elle dépend du fuseau du voyage (adaptateur).
 */
export function verifyShareToken(key: Buffer, token: unknown): SignedSharePayload | null {
  if (key.length < SHARE_KEY_MIN_BYTES) return null;
  if (typeof token !== "string" || !SIGNED_SHARE_TOKEN_PATTERN.test(token)) return null;
  const [, charge = "", recu = ""] = token.split(".");
  const attendu = mac(key, charge);
  const recuOctets = Buffer.from(recu, "base64url");
  // Encodage strict : un mac dont la réécriture diffère (bits de remplissage) est refusé.
  if (recuOctets.length !== attendu.length || recuOctets.toString("base64url") !== recu) return null;
  if (!timingSafeEqual(recuOctets, attendu)) return null;
  const octets = Buffer.from(charge, "base64url");
  if (octets.toString("base64url") !== charge) return null;
  const parties = octets.toString("utf8").split(SEPARATEUR);
  if (parties.length !== 3) return null;
  const [tripId = "", organizationId = "", expiresOn = ""] = parties;
  const payload: SignedSharePayload = { tripId, organizationId, expiresOn };
  return chargeValide(payload) ? payload : null;
}
