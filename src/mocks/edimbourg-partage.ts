import { EDIMBOURG_DEBLOQUE_TRIP_ID, MOCK_ORGANIZATION_ID, MOCK_USER_ID } from "./edimbourg";

/**
 * Liens de partage fixes du voyage débloqué simulé (spécification F10, F10-PO-18) : chaque portée de simulation
 * les contient, `reset` les rétablit. Les jetons sont **publics** (dépôt public) : la garde fermée du partage
 * (`shareAvailable()`, F10-TL-7) les rend inopérants sur tout déploiement de production. Ce module ne s'importe que
 * depuis `src/adapters` et les tests (règle ESLint sur `src/mocks`).
 *
 * Le cas « expiré » n'a pas de jeton dédié : il se teste en avançant l'horloge de la portée au-delà de la fin du
 * partage (2026-10-03, F10-PO-21).
 */

/** Jeton du lien valide, actif depuis le 2026-08-01T12:00:00+01:00. */
export const SHARE_TOKEN_VALIDE = "partage-valide-mock-edimbourg-0000000000000";

/** Jeton d'un lien désactivé : il répond comme un jeton inconnu. */
export const SHARE_TOKEN_DESACTIVE = "partage-desactive-mock-edimbourg-0000000000";

export interface FixedShareLink {
  token: string;
  tripId: string;
  organizationId: string;
  userId: string;
  /** Instant ISO de création. */
  createdAt: string;
  /** Instant ISO de désactivation ; absent : lien actif. */
  revokedAt?: string;
}

export const FIXED_SHARE_LINKS: readonly FixedShareLink[] = [
  {
    token: SHARE_TOKEN_DESACTIVE,
    tripId: EDIMBOURG_DEBLOQUE_TRIP_ID,
    organizationId: MOCK_ORGANIZATION_ID,
    userId: MOCK_USER_ID,
    createdAt: "2026-07-20T12:00:00+01:00",
    revokedAt: "2026-08-01T11:00:00+01:00",
  },
  {
    token: SHARE_TOKEN_VALIDE,
    tripId: EDIMBOURG_DEBLOQUE_TRIP_ID,
    organizationId: MOCK_ORGANIZATION_ID,
    userId: MOCK_USER_ID,
    createdAt: "2026-08-01T12:00:00+01:00",
  },
];
