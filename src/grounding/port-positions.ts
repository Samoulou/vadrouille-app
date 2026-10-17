import "server-only";

import type { Coordonnees } from "@/grounding/interfaces";

/**
 * Port du cache de positions `place_coordinates` (décision 0060 § 1.1, B8-TL-2 ; 0011 § 6 amendée par 0060 § 1.5).
 * Déclarations de type seules : aucune valeur, aucune fonction, aucune constante exportée. Implémenté par le seul
 * `src/server/positions/cache-positions.ts` (B8c), injecté par la composition (B8b, B9) ; hors de `src/grounding`, ce
 * fichier ne s'importe qu'en `import type` (0060 § 1.4).
 *
 * Ce que `lire` rend est une donnée dérivée de Google : en mémoire seulement, jamais dans un état sérialisé, un
 * journal, une trace, un prompt ; affichée sur la seule carte Google (`CLAUDE.md`, 0011 § 6).
 */

/** Marque nominale (ambiante, aucun code émis) : une position lue n'est jamais réécrite (0060 § 1.1 et § 1.3). */
declare const marqueFiche: unique symbol;

/**
 * Position tirée d'une fiche Place Details de l'opération en cours ; jamais produite par `lire`. Ne s'obtient que par
 * une assertion de type vers cette marque, permise dans le seul module de `src/grounding` qui convertit une réponse
 * Place Details (B8a ou B8b ; test `coordonnées: écrites par un seul module, en paramètres liés`).
 */
export type PositionGoogleFraiche = Coordonnees & { readonly [marqueFiche]: true };

/**
 * Codes fermés d'un échec du port : entrée refusée avant toute requête, positions trop anciennes pour être écrites
 * (plus de 60 minutes, ou plus d'une minute dans le futur), erreur de la base.
 */
export type CodeEchecPositions = "entree_invalide" | "perimees" | "base";

/**
 * Résultat du port. `retryable` ne vise que la transaction entière : après une erreur de la base, la transaction de
 * `withOrg` est annulée ; l'appelant rejoue toute l'opération dans une nouvelle transaction, jamais le seul appel.
 */
export type ResultatPositions<T> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly code: CodeEchecPositions; readonly retryable: boolean };

export type PortPositions = {
  /** Positions vivantes de l'organisation courante ; un placeId absent du cache est absent de la Map. */
  lire(placeIds: readonly string[]): Promise<ResultatPositions<ReadonlyMap<string, Coordonnees>>>;
  /** Écrit des positions tirées d'une réponse Google obtenue au plus tôt à `obtenuesA` (ms depuis l'époque Unix). */
  ecrire(positions: ReadonlyMap<string, PositionGoogleFraiche>, obtenuesA: number): Promise<ResultatPositions<void>>;
};
