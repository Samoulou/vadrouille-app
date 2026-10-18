import "server-only";

import {
  CODES_ERREUR_GOOGLE,
  ErreurClientGoogle,
} from "@/grounding/enveloppe-google";
import { CODES_ERREUR_ANCRAGE, ErreurAncrage } from "@/grounding/interfaces";

/**
 * Résultat commun des fonctions de production de `src/grounding` (B8a ; décision 0085 § 1.2). Aucune exception pour
 * une erreur attendue : `{ ok: false, code, retryable }`, `code` d'une énumération fermée, jamais un message, un corps
 * ni une pile de Google. Tout ce que `valeur` porte, sauf les `placeId` et les identifiants maison, est une donnée
 * Google : en mémoire seulement, jamais dans un état sérialisé, un journal, une trace ni une entrée de `src/ai`
 * (0011 § 1 et § 3).
 */

/** `CODES_ANCRAGE` = `CODES_ERREUR_GOOGLE` ∪ `CODES_ERREUR_ANCRAGE` (0085 § 1.2) : aucun code nouveau hors de ces listes. */
export const CODES_ANCRAGE = [
  ...CODES_ERREUR_GOOGLE,
  ...CODES_ERREUR_ANCRAGE,
] as const;
export type CodeAncrage = (typeof CODES_ANCRAGE)[number];

export type EchecAncrage = {
  readonly ok: false;
  readonly code: CodeAncrage;
  readonly retryable: boolean;
};
export type ResultatAncrage<T> =
  | { readonly ok: true; readonly valeur: T }
  | EchecAncrage;

export const reussi = <T>(valeur: T): ResultatAncrage<T> => ({
  ok: true,
  valeur,
});

/**
 * **Seule** conversion d'une erreur levée en résultat (0085 § 1.2) : `ErreurClientGoogle` → son code et son
 * `retryable` ; `ErreurAncrage` → son code, non réessayable ; toute autre erreur → `upstream_error`, non réessayable.
 * Rien de l'erreur d'origine (message, cause, pile) n'est recopié. `upstream_not_found` ne sort jamais du client
 * Places (0085 § 2 point c) ; s'il arrivait ici, il serait rendu comme `upstream_error` (filet : aucune fonction ne le rend).
 */
export function echecDe(erreur: unknown): EchecAncrage {
  if (erreur instanceof ErreurClientGoogle) {
    if (erreur.code === "upstream_not_found")
      return { ok: false, code: "upstream_error", retryable: false };
    return { ok: false, code: erreur.code, retryable: erreur.retryable };
  }
  if (erreur instanceof ErreurAncrage)
    return { ok: false, code: erreur.code, retryable: false };
  return { ok: false, code: "upstream_error", retryable: false };
}

/**
 * Échec déjà converti d'une étape interne (par exemple `chargerFiches` dans `ficherSerie` ou `verifierLogement`), levé
 * pour interrompre la fonction appelante et rendu tel quel par `capturer`, sans nouvelle conversion.
 */
export class EchecRemonte extends Error {
  readonly echec: EchecAncrage;
  constructor(echec: EchecAncrage) {
    super(echec.code);
    this.echec = echec;
    this.name = "EchecRemonte";
  }
}

/** Lève l'échec d'un résultat, ou rend sa valeur. */
export function valeurOuEchec<T>(resultat: ResultatAncrage<T>): T {
  if (!resultat.ok) throw new EchecRemonte(resultat);
  return resultat.valeur;
}

/** Exécute `travail` : un `EchecRemonte` est rendu tel quel ; toute autre erreur levée est convertie par `echecDe`. */
export async function capturer<T>(
  travail: () => Promise<T>,
): Promise<ResultatAncrage<T>> {
  try {
    return reussi(await travail());
  } catch (erreur) {
    return erreur instanceof EchecRemonte ? erreur.echec : echecDe(erreur);
  }
}
