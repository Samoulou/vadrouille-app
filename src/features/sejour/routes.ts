import type { Stop } from "@/contracts";

/**
 * Adresses des écrans du voyage (décision 0015 § 1) : seul endroit qui connaît le schéma des routes.
 * Les composants Ligne reçoivent des adresses ou des fonctions qui en sont dérivées, jamais le schéma.
 * Les identifiants sont encodés ; les heures (`de`, `a`) sont des `Time` validés (`HH:MM`), écrits tels
 * quels pour que `:` ne devienne pas `%3A`. Aucun paramètre n'est un identifiant de lieu Google.
 */

export type TripRoutesBase = "/voyages" | "/dev/voyages";

export interface TripRoutes {
  /** Écran 11 « Séjour ». */
  sejour(): string;
  /** Écran 12 « Journée » du jour `n` (1 = J1). */
  jour(n: number): string;
  /** Écran 13 « Fiche étape », dans le panneau de la Journée. */
  etape(n: number, stopId: Stop["id"]): string;
  /** Écran 14 « Remplacer une étape » (F7). */
  remplacer(n: number, stopId: Stop["id"]): string;
  /** « Ajouter un lieu » du jour (F7), avec la plage de temps libre proposée. */
  ajouter(n: number, free?: { from: string; to: string }): string;
  /** Niveau supérieur du Séjour : « Mes voyages » (F11). */
  retour(): string;
}

export function tripRoutes(base: TripRoutesBase, tripId: string): TripRoutes {
  const trip = `${base}/${encodeURIComponent(tripId)}`;
  const jour = (n: number) => `${trip}/jour/${n}`;
  return {
    sejour: () => trip,
    jour,
    etape: (n, stopId) => `${jour(n)}?etape=${encodeURIComponent(stopId)}`,
    remplacer: (n, stopId) => `${jour(n)}/remplacer/${encodeURIComponent(stopId)}`,
    ajouter: (n, free) => (free ? `${jour(n)}/ajouter?de=${free.from}&a=${free.to}` : `${jour(n)}/ajouter`),
    retour: () => base,
  };
}
