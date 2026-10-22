import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { AdapterContext } from "@/adapters/types";
import type { DeblocagesEssai } from "@/adapters/prototype-instance";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import { ouvertureP0 } from "@/server/p0/acces";

/**
 * Déblocage simulé d'un voyage d'essai retenu par cookie (spécification E2E-essai, lot 1, point à trancher « où garder
 * l'état débloqué » : proposition de la spécification, cookie signé lié au code d'accès, sans migration).
 *
 * - Cookie `__Host-p0_debloque` = `v1.<voyages>.<mac>` : `voyages` = identifiants de voyage (`TRIP_ID_PATTERN`)
 *   séparés par des virgules, triés, `MAX_VOYAGES` au plus ; `mac = hex(HMAC(K, "p0/v1/deblocage/" + organisation +
 *   "/" + voyages))`, `K = HMAC-SHA-256(code d'accès, "vadrouille/p0/deblocage/v1")`.
 * - La clé n'existe que garde du mode réel ouverte (`ouvertureP0`, sans journal) : préversion de `p0-reel` seulement,
 *   jamais en production. Garde fermée : rien n'est lu ni écrit (le droit simulé de la portée reste seul).
 * - Une rotation du code d'accès invalide tous les cookies de déblocage. Aucun montant, aucun moyen de paiement, aucune
 *   donnée personnelle : seulement des identifiants de voyage, déjà présents dans les adresses.
 * - Ni le cookie ni la clé n'atteignent un journal ou une réponse autre que l'en-tête `Set-Cookie`.
 */

export const NOM_COOKIE_DEBLOCAGE = "__Host-p0_debloque";
/** Voyages retenus au plus ; au-delà, le nouveau voyage est gardé et le premier de l'ordre de tri est retiré. */
export const MAX_VOYAGES = 20;
/** Durée du cookie : 30 jours (durée de vie d'un programme d'essai, au plus). */
export const DUREE_COOKIE_DEBLOCAGE_S = 30 * 24 * 3600;

export const OPTIONS_COOKIE_DEBLOCAGE = {
  httpOnly: true,
  secure: true,
  sameSite: "strict",
  path: "/",
  maxAge: DUREE_COOKIE_DEBLOCAGE_S,
} as const;

const ETIQUETTE_CLE = "vadrouille/p0/deblocage/v1";
const PREFIXE_SIGNE = "p0/v1/deblocage/";
const FORME = /^v1\.([A-Za-z0-9_,-]{1,1400})\.([0-9a-f]{64})$/;

const hmac = (cle: Buffer, donnee: string): Buffer => createHmac("sha256", cle).update(donnee).digest();

/** Clé de signature tirée du code d'accès. */
export function cleDeblocage(attendu: Buffer): Buffer {
  return hmac(attendu, ETIQUETTE_CLE);
}

function signer(cle: Buffer, organisation: string, voyages: string): string {
  return hmac(cle, `${PREFIXE_SIGNE}${organisation}/${voyages}`).toString("hex");
}

/** Valeur du cookie pour ces voyages (dédoublonnés, les `MAX_VOYAGES` derniers donnés, triés). */
export function valeurCookieDeblocage(cle: Buffer, organisation: string, voyages: Iterable<string>): string {
  const liste = [...new Set([...voyages].filter((id) => TRIP_ID_PATTERN.test(id)))].slice(-MAX_VOYAGES).sort().join(",");
  return `v1.${liste}.${signer(cle, organisation, liste)}`;
}

/** Voyages d'un cookie reçu : forme exacte et signature vérifiée en temps constant ; ensemble vide sinon. */
export function voyagesDuCookie(brut: unknown, cle: Buffer, organisation: string): Set<string> {
  if (typeof brut !== "string") return new Set();
  const forme = FORME.exec(brut);
  if (forme === null) return new Set();
  const liste = forme[1] ?? "";
  const ids = liste.split(",");
  if (ids.length > MAX_VOYAGES || ids.some((id) => !TRIP_ID_PATTERN.test(id))) return new Set();
  const attendue = Buffer.from(signer(cle, organisation, liste), "utf8");
  if (!timingSafeEqual(attendue, Buffer.from(forme[2] ?? "", "utf8"))) return new Set();
  return new Set(ids);
}

/** Clé de la requête, garde du mode réel ouverte ; `null` sinon (aucun journal : lecture d'affichage). */
function cle(): Buffer | null {
  const ouverture = ouvertureP0({}, false);
  return ouverture.ok ? cleDeblocage(ouverture.attendu) : null;
}

/** Déblocages de l'essai branchés sur l'adaptateur `prototype` par `src/instrumentation.ts`. */
export const deblocagesEssaiParCookie: DeblocagesEssai = {
  async lire(ctx: AdapterContext) {
    try {
      const k = cle();
      if (k === null) return new Set();
      return voyagesDuCookie((await cookies()).get(NOM_COOKIE_DEBLOCAGE)?.value, k, ctx.organizationId);
    } catch {
      return new Set();
    }
  },
  async retenir(ctx: AdapterContext, tripId: string) {
    const k = cle();
    if (k === null || !TRIP_ID_PATTERN.test(tripId)) return;
    const jar = await cookies();
    const deja = voyagesDuCookie(jar.get(NOM_COOKIE_DEBLOCAGE)?.value, k, ctx.organizationId);
    jar.set(NOM_COOKIE_DEBLOCAGE, valeurCookieDeblocage(k, ctx.organizationId, [...deja, tripId]), OPTIONS_COOKIE_DEBLOCAGE);
  },
};
