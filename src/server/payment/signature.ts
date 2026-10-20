import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signature du webhook simulé (décision 0097 B4-TL-2) : format de Stripe, vérification maison, sans paquet `stripe`.
 * En-tête `Stripe-Signature: t=<secondes>,v1=<hex>`, HMAC-SHA-256 de `<t>.<corps brut>` sur les **octets bruts** du corps,
 * avec la **clé en octets** (ceux de `SIMULATED_WEBHOOK_SECRET` décodés par `decodeSecret`). Tolérance de 300 s dans les
 * deux sens, jamais désactivée. Analyse stricte de l'en-tête ; comparaison à temps constant de toutes les valeurs `v1`,
 * sans sortie anticipée. Aucune valeur (clé, en-tête, corps) n'est rendue, copiée ni journalisée.
 */

/** Nom de l'en-tête de signature (celui de Stripe). */
export const ENTETE_SIGNATURE = "stripe-signature";
/** Écart admis entre l'horodatage signé et l'horloge du serveur, dans les deux sens. */
export const TOLERANCE_SECONDES = 300;
/** Plafonds de l'en-tête (B4-TL-2 point 2). */
export const LONGUEUR_MAX_ENTETE = 512;
export const V1_MAX = 3;

const HORODATAGE = /^[0-9]{1,12}$/;
const V1 = /^[0-9a-f]{64}$/;

function hmac(corps: Uint8Array, cle: Buffer, horodatage: string): Buffer {
  return createHmac("sha256", cle).update(`${horodatage}.`, "utf8").update(corps).digest();
}

/** En-tête signé pour `corps` à l'instant `maintenantSecondes` (secondes entières depuis l'époque Unix). */
export function signer(corps: Uint8Array, cle: Buffer, maintenantSecondes: number): string {
  if (!Number.isSafeInteger(maintenantSecondes) || maintenantSecondes < 0) throw new TypeError("signature : horodatage invalide");
  const t = String(maintenantSecondes);
  return `t=${t},v1=${hmac(corps, cle, t).toString("hex")}`;
}

/** En-tête analysé, ou `null` au moindre écart de forme. */
function analyser(entete: string): { t: string; v1: string[] } | null {
  if (entete.length === 0 || entete.length > LONGUEUR_MAX_ENTETE) return null;
  let t: string | null = null;
  const v1: string[] = [];
  for (const element of entete.split(",")) {
    const egal = element.indexOf("=");
    if (egal <= 0) return null;
    const cle = element.slice(0, egal);
    const valeur = element.slice(egal + 1);
    if (cle === "t") {
      if (t !== null || !HORODATAGE.test(valeur) || String(Number(valeur)) !== valeur) return null;
      t = valeur;
    } else if (cle === "v1") {
      if (!V1.test(valeur)) return null;
      v1.push(valeur);
      if (v1.length > V1_MAX) return null;
    }
    // Tout autre schéma (`v0`…) est ignoré, comme Stripe.
  }
  if (t === null || v1.length === 0) return null;
  return { t, v1 };
}

/**
 * Vrai si l'en-tête porte un horodatage dans la tolérance et au moins une valeur `v1` égale au HMAC attendu. Toutes les
 * valeurs sont comparées (aucune sortie anticipée) : le temps ne dépend pas de la position d'une valeur valide.
 */
export function verifier(corps: Uint8Array, entete: string | null, cle: Buffer, maintenantSecondes: number): boolean {
  if (entete === null) return false;
  const analyse = analyser(entete);
  if (analyse === null) return false;
  if (Math.abs(maintenantSecondes - Number(analyse.t)) > TOLERANCE_SECONDES) return false;
  const attendu = hmac(corps, cle, analyse.t);
  let valide = false;
  for (const valeur of analyse.v1) {
    const recu = Buffer.from(valeur, "hex");
    const egal = recu.length === attendu.length && timingSafeEqual(recu, attendu);
    valide = valide || egal;
  }
  return valide;
}
