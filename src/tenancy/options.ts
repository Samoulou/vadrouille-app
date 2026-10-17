import "server-only";

/**
 * Réglages de Better Auth fixés par la spécification B3 (B3b point 2), en valeurs pures, sans import de la
 * bibliothèque : testables sans elle (`tests/unit/tenancy/options.test.ts`), relus par `./auth.ts`.
 */

/** Seul en-tête d'adresse IP de confiance admis (décision 0051 § 2.1 ; `TRUSTED_IP_HEADERS` de `@/server/env`). */
export type EnteteIpDeConfiance = "x-vercel-forwarded-for";

/** Environnements où `better-auth` est admis (décision 0077 § 5.1, B3-TL-2). */
export type EnvironnementAuth = "local" | "ci";

/** Code : 6 chiffres, 10 minutes, 3 essais (B3-PO-5). */
export const CODE_CONNEXION = Object.freeze({ chiffres: 6, dureeSecondes: 10 * 60, essais: 3 });

/** Session de 7 jours, prolongée au plus une fois par jour (`expiresIn`, `updateAge`). */
export const SESSION = Object.freeze({ dureeSecondes: 7 * 24 * 60 * 60, prolongationSecondes: 24 * 60 * 60 });

/** Préfixe des cookies de la bibliothèque. */
export const PREFIXE_COOKIES = "vadrouille";

/**
 * `advanced.ipAddress.ipAddressHeaders` (décision 0051 § 2.6) : l'en-tête de confiance seul, ou une **liste vide**
 * quand il est absent. Better Auth 1.7.7 lit `ipAddressHeaders || ["x-forwarded-for"]` : une liste vide est vraie et
 * remplace le réglage par défaut, si bien qu'aucun en-tête n'est lu (vérification notée dans l'amendement de 0008) ;
 * `undefined` retomberait sur `x-forwarded-for`, forgeable par le client.
 */
export function entetesIp(entete: EnteteIpDeConfiance | null): string[] {
  return entete === null ? [] : [entete];
}

/** `advanced.useSecureCookies` : vrai hors `local`. */
export function cookiesSecurises(environnement: EnvironnementAuth): boolean {
  return environnement !== "local";
}
