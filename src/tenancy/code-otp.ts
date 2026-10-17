import "server-only";

import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";

import type { CanonicalEmail } from "@/server/email";

/**
 * Code de connexion stocké sous forme de **HMAC-SHA-256 à clé** (spécification B3, B3b point 2) : clé dérivée
 * `vadrouille/otp/v1` (`./cles.ts`), message `otp/v1/<forme canonique de l'adresse>/<code>`, qui lie le code à
 * l'adresse. Jamais le code en clair, jamais son SHA-256 simple (10^6 valeurs suffiraient à le renverser).
 *
 * Better Auth 1.7.7 (`storeOTP: { hash }`) ne passe que le code à la fonction de hachage, pas l'adresse (vérification
 * 7.10, amendement de 0008) : l'adresse canonique est portée par un contexte asynchrone posé par les seules opérations
 * de `src/server/auth` (`avecAdresse`). Sans ce contexte, le hachage lève : aucun code n'est stocké ni comparé.
 * La comparaison est celle de la bibliothèque (`constantTimeEqual`, temps constant ; vérification 7.10).
 */

const adresseCourante = new AsyncLocalStorage<CanonicalEmail>();

/** Exécute `fn` avec l'adresse canonique de l'opération en cours (lue par le hachage du code). */
export function avecAdresse<T>(email: CanonicalEmail, fn: () => Promise<T>): Promise<T> {
  return adresseCourante.run(email, fn);
}

/** Hors d'une opération de `src/server/auth` : aucun hachage possible. Ne porte aucune valeur. */
export class AdresseAbsenteError extends Error {
  override name = "AdresseAbsenteError";

  constructor() {
    super("Hachage du code hors d'une opération de connexion.");
  }
}

/** HMAC-SHA-256 hexadécimal de `otp/v1/<email>/<code>`. */
export function hacherCode(cle: Buffer, email: CanonicalEmail, code: string): string {
  return createHmac("sha256", cle).update(`otp/v1/${email}/${code}`, "utf8").digest("hex");
}

/** Fonction de hachage passée à `emailOTP({ storeOTP: { hash } })` : lit l'adresse du contexte, lève sans elle. */
export function hacheurCode(cle: Buffer): (code: string) => Promise<string> {
  return async (code) => {
    const email = adresseCourante.getStore();
    if (email === undefined) throw new AdresseAbsenteError();
    return hacherCode(cle, email, code);
  };
}
