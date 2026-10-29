import { SHARE_TOKEN_PATTERN, SIGNED_SHARE_TOKEN_PATTERN } from "@/contracts/values";

/**
 * Adresses de la vue partagée (spécification F10, F10-TL-3 ; décision 0039) : seul endroit qui connaît le schéma de
 * `RP` (`/p/[token]`, Séjour partagé) et de `RPJ` (`/p/[token]/jour/[n]`, Journée partagée). Le jeton n'est placé
 * dans aucune autre adresse de l'application.
 */
export interface SharedRoutes {
  /** `RP` : Séjour partagé. */
  sejour(): string;
  /** `RPJ` : Journée partagée du jour `n` (1 = J1). */
  jour(n: number): string;
}

export function sharedRoutes(token: string): SharedRoutes {
  const base = `/p/${encodeURIComponent(token)}`;
  return {
    sejour: () => base,
    jour: (n) => `${base}/jour/${n}`,
  };
}

/**
 * Jeton lu dans l'adresse, s'il a la forme d'un jeton (`SHARE_TOKEN_PATTERN`, ou `SIGNED_SHARE_TOKEN_PATTERN` du
 * partage réel, décision 0135) ; `null` sinon (404 sans lecture). La signature est vérifiée par l'adaptateur.
 */
export function parseShareToken(value: string | null | undefined): string | null {
  return typeof value === "string" && (SHARE_TOKEN_PATTERN.test(value) || SIGNED_SHARE_TOKEN_PATTERN.test(value)) ? value : null;
}

/** `n` de `RPJ` : entier écrit sans zéro initial ; `null` sinon (404). La présence du jour est vérifiée ensuite. */
export function parseDayParam(value: string): number | null {
  return /^[1-9]\d{0,2}$/.test(value) ? Number(value) : null;
}
