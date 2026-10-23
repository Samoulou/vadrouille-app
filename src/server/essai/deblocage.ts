import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";

import type { AdapterContext } from "@/adapters/types";
import type { DeblocagesEssai } from "@/adapters/prototype-instance";
import { TRIP_ID_PATTERN } from "@/contracts/values";
import { ouvertureP0 } from "@/server/p0/acces";

/**
 * Déblocage simulé d'un voyage d'essai retenu par cookie (décision 0124 § 2 ; spécification E2E-essai, lot 1).
 *
 * - Cookie `__Host-p0_debloque` = `v1.<échéance>.<voyages>.<mac>` : `échéance` = secondes Unix (10 chiffres) ;
 *   `voyages` = identifiants de voyage (`TRIP_ID_PATTERN`) séparés par des virgules, triés, `MAX_VOYAGES` au plus ;
 *   `mac = hex(HMAC(K, "p0/v1/deblocage/" + organisation + "/" + échéance + "/" + voyages))`,
 *   `K = HMAC-SHA-256(code d'accès, "vadrouille/p0/deblocage/v1")`.
 * - Révocation : l'échéance signée (30 jours au plus, comme `__Host-p0_acces`) borne chaque cookie, et une rotation du
 *   code d'accès les invalide tous d'un coup.
 * - Exception à l'en-tête de `src/server/p0/acces.ts` (« seul module » à manipuler le code d'accès) : ce module ne lit
 *   jamais le code ; il ne reçoit que `attendu` de `ouvertureP0` et en dérive aussitôt une clé distincte, étiquetée.
 *   L'exception est écrite dans la décision 0124 § 2 (`acces.ts` relève du lot 2a et n'est pas modifié ici).
 * - La clé n'existe que garde du mode réel ouverte (`ouvertureP0`, sans journal) : préversion de `p0-reel` seulement,
 *   jamais en production. Garde fermée : rien n'est lu ni écrit (le droit simulé de la portée reste seul).
 * - Aucun montant, aucun moyen de paiement, aucune donnée personnelle : seulement des identifiants de voyage, déjà
 *   présents dans les adresses. Ni le cookie ni la clé n'atteignent un journal ou une réponse autre que `Set-Cookie`.
 */

export const NOM_COOKIE_DEBLOCAGE = "__Host-p0_debloque";
/**
 * Voyages retenus au plus. Au-delà, on garde les `MAX_VOYAGES` derniers dans l'ordre d'ajout de `retenir` (le voyage
 * qui vient d'être débloqué est toujours gardé) ; l'ordre d'ajout n'est pas conservé dans le cookie, trié par ordre
 * alphabétique : après relecture, le retrait vise le premier identifiant dans cet ordre, pas le plus ancien.
 */
export const MAX_VOYAGES = 20;
/** Durée du cookie et de l'échéance signée : 30 jours (durée de vie d'un programme d'essai, au plus). */
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
const FORME = /^v1\.([0-9]{10})\.([A-Za-z0-9_,-]{1,1400})\.([0-9a-f]{64})$/;

const hmac = (cle: Buffer, donnee: string): Buffer => createHmac("sha256", cle).update(donnee).digest();

/** Clé de signature tirée du code d'accès. */
export function cleDeblocage(attendu: Buffer): Buffer {
  return hmac(attendu, ETIQUETTE_CLE);
}

function signer(cle: Buffer, organisation: string, echeance: string, voyages: string): string {
  return hmac(cle, `${PREFIXE_SIGNE}${organisation}/${echeance}/${voyages}`).toString("hex");
}

/** Valeur du cookie pour ces voyages (dédoublonnés, les `MAX_VOYAGES` derniers donnés, triés), échéance à 30 jours. */
export function valeurCookieDeblocage(
  cle: Buffer,
  organisation: string,
  voyages: Iterable<string>,
  maintenantMs: number,
): string {
  const liste = [...new Set([...voyages].filter((id) => TRIP_ID_PATTERN.test(id)))].slice(-MAX_VOYAGES).sort().join(",");
  const echeance = String(Math.floor(maintenantMs / 1000) + DUREE_COOKIE_DEBLOCAGE_S).padStart(10, "0");
  return `v1.${echeance}.${liste}.${signer(cle, organisation, echeance, liste)}`;
}

/**
 * Voyages d'un cookie reçu : forme exacte, signature vérifiée en temps constant, échéance dans
 * `]maintenant, maintenant + 30 jours]` ; ensemble vide sinon.
 */
export function voyagesDuCookie(brut: unknown, cle: Buffer, organisation: string, maintenantMs: number): Set<string> {
  if (typeof brut !== "string") return new Set();
  const forme = FORME.exec(brut);
  if (forme === null) return new Set();
  const echeance = forme[1] ?? "";
  const liste = forme[2] ?? "";
  const ids = liste.split(",");
  if (ids.length > MAX_VOYAGES || ids.some((id) => !TRIP_ID_PATTERN.test(id))) return new Set();
  const attendue = Buffer.from(signer(cle, organisation, echeance, liste), "utf8");
  if (!timingSafeEqual(attendue, Buffer.from(forme[3] ?? "", "utf8"))) return new Set();
  const maintenant = Math.floor(maintenantMs / 1000);
  const fin = Number(echeance);
  if (!(fin > maintenant && fin <= maintenant + DUREE_COOKIE_DEBLOCAGE_S)) return new Set();
  return new Set(ids);
}

/**
 * Clé du processus, garde du mode réel ouverte ; `null` sinon (aucun journal : lecture d'affichage). Mémorisée : la
 * garde ne dépend que de l'environnement du processus, figé pour un déploiement.
 */
let memoire: { cle: Buffer | null } | null = null;
function cle(): Buffer | null {
  if (memoire === null) {
    const ouverture = ouvertureP0({}, false);
    memoire = { cle: ouverture.ok ? cleDeblocage(ouverture.attendu) : null };
  }
  return memoire.cle;
}

/** Oublie la clé mémorisée (tests). */
export function oublierCleDeblocage(): void {
  memoire = null;
}

/** Déblocages de l'essai branchés sur l'adaptateur `prototype` par `src/instrumentation.ts`. */
export const deblocagesEssaiParCookie: DeblocagesEssai = {
  async lire(ctx: AdapterContext) {
    try {
      const k = cle();
      if (k === null) return new Set();
      return voyagesDuCookie((await cookies()).get(NOM_COOKIE_DEBLOCAGE)?.value, k, ctx.organizationId, Date.now());
    } catch {
      return new Set();
    }
  },
  async retenir(ctx: AdapterContext, tripId: string) {
    const k = cle();
    if (k === null || !TRIP_ID_PATTERN.test(tripId)) return;
    const jar = await cookies();
    const maintenant = Date.now();
    const deja = voyagesDuCookie(jar.get(NOM_COOKIE_DEBLOCAGE)?.value, k, ctx.organizationId, maintenant);
    deja.delete(tripId);
    jar.set(
      NOM_COOKIE_DEBLOCAGE,
      valeurCookieDeblocage(k, ctx.organizationId, [...deja, tripId], maintenant),
      OPTIONS_COOKIE_DEBLOCAGE,
    );
  },
};
