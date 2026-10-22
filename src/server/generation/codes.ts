import "server-only";

import { LectureIllisible } from "./illisible";
import { CODES_ARRET, type CodeArret } from "./raison-echec";

/**
 * Codes d'arrêt d'une étape (décision 0081 B9-TL-3 point 1 (4) : « une erreur ne sort que par un code fermé »). Toute valeur
 * qui n'est pas dans `CODES_ARRET` (le jeu du `CHECK` de la migration 0012) devient `upstream_error` : ni message, ni pile,
 * ni donnée de lieu ne sort d'une étape, même si le fournisseur en a mis dans son erreur.
 */

const CODES: ReadonlySet<string> = new Set(CODES_ARRET);

/** Code fermé d'une valeur quelconque ; `upstream_error` si elle n'en est pas un. */
export function codeFerme(valeur: unknown): CodeArret {
  return typeof valeur === "string" && CODES.has(valeur) ? (valeur as CodeArret) : "upstream_error";
}

/** Arrêt d'une étape sur un code fermé (plafond, quota, erreur de fournisseur, échéance, garde). Aucun autre texte. */
export class ArretEtape extends Error {
  readonly code: CodeArret;
  constructor(code: unknown) {
    const ferme = codeFerme(code);
    super(ferme);
    this.code = ferme;
    this.name = "ArretEtape";
  }
}

/** Vrai pour un arrêt à code fermé attendu : `ArretEtape`, ou lecture illisible (`invalid_input`, module feuille `illisible.ts`). */
export const estArret = (erreur: unknown): erreur is ArretEtape | LectureIllisible => erreur instanceof ArretEtape || erreur instanceof LectureIllisible;

/** Code fermé d'une erreur levée : celui d'un `ArretEtape` ou d'une erreur qui porte un `code` fermé, sinon `upstream_error`. */
export function codeDeErreur(erreur: unknown): CodeArret {
  if (erreur instanceof ArretEtape) return erreur.code;
  try {
    const code: unknown = erreur instanceof Error ? (erreur as { code?: unknown }).code : undefined;
    return codeFerme(code);
  } catch {
    return "upstream_error";
  }
}
