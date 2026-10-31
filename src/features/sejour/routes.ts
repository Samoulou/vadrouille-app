import type { Meal, Stop } from "@/contracts";

/**
 * Adresses des écrans du voyage (décision 0015 § 1) : seul endroit qui connaît le schéma des routes.
 * Les composants Ligne reçoivent des adresses ou des fonctions qui en sont dérivées, jamais le schéma.
 * Les identifiants sont encodés ; les heures (`de`, `a`) sont des `Time` validés (`HH:MM`), écrits tels
 * quels pour que `:` ne devienne pas `%3A`. Aucun paramètre n'est un identifiant de lieu Google.
 */

/**
 * `/dev/carte/villes` : voyages simulés à plusieurs villes avec positions, carte simulée (décision 0150, page de
 * développement de M4-suite-carte) ; comme `/dev/voyages`, ni « Pendant le voyage » ni versions.
 */
export type TripRoutesBase = "/voyages" | "/dev/voyages" | "/dev/carte/villes";

/**
 * Numéro de jour d'une adresse `/jour/{n}` : entier écrit sans zéro initial, trois chiffres au plus. Seule forme admise
 * par les pages (`dayFromParam`, redirection vers l'écran 4) et par `normaliserSuite` (revue consolidée du head
 * `2b80bd7` de la PR 452, mineurs 7 et 14).
 */
export const DAY_PARAM_PATTERN = /^[1-9][0-9]{0,2}$/;

export interface TripRoutes {
  /** Écran 11 « Séjour ». */
  sejour(): string;
  /** Écran 12 « Journée » du jour `n` (1 = J1). */
  jour(n: number): string;
  /** Écran 13 « Fiche étape », dans le panneau de la Journée. */
  etape(n: number, stopId: Stop["id"]): string;
  /** Écran 14 « Remplacer une étape » (F7). */
  remplacer(n: number, stopId: Stop["id"]): string;
  /**
   * « Ajouter un lieu » du jour (F7, F7-PO-8) : avec la plage d'un temps libre (lien « Idées », `?de=&a=`) ou le repas pas
   * encore choisi (« Choisir », `?de=&repas=`, M5d-3). Heures « HH:MM » et repas écrits tels quels, comme pour « Idées ».
   */
  ajouter(n: number, moment?: { from: string; to: string } | { time: string; meal: Meal }): string;
  /**
   * Niveau supérieur du Séjour : « Mes voyages » (`R17`). Toujours `/voyages`, quelle que soit la base : `R17`
   * n'a pas de pendant de développement (décision 0021 § 6, qui renomme `retour()`).
   */
  mesVoyages(): string;
  /**
   * Écran 15 « Pendant le voyage » (`R15`, F10-TL-3) ; `null` avec la base `/dev/voyages`, qui n'a pas de page
   * `R15` (F10-PO-7) : aucun lien ne mène alors à une 404.
   */
  aujourdhui(): string | null;
  /**
   * « Versions du programme » (M5b, spécification M5 § 4 ; décision 0147 § 5.3 point 3) ; `null` avec la base
   * `/dev/voyages`, qui n'a pas de page des versions : aucun lien ne mène alors à une 404.
   */
  versions(): string | null;
}

/** `R17` « Mes voyages » : seul endroit qui écrit cette adresse (décision 0021 § 6). */
export function mesVoyagesRoute(): string {
  return "/voyages";
}

export function tripRoutes(base: TripRoutesBase, tripId: string): TripRoutes {
  const trip = `${base}/${encodeURIComponent(tripId)}`;
  const jour = (n: number) => `${trip}/jour/${n}`;
  return {
    sejour: () => trip,
    jour,
    etape: (n, stopId) => `${jour(n)}?etape=${encodeURIComponent(stopId)}`,
    remplacer: (n, stopId) => `${jour(n)}/remplacer/${encodeURIComponent(stopId)}`,
    ajouter: (n, moment) =>
      moment === undefined
        ? `${jour(n)}/ajouter`
        : "meal" in moment
          ? `${jour(n)}/ajouter?de=${moment.time}&repas=${moment.meal}`
          : `${jour(n)}/ajouter?de=${moment.from}&a=${moment.to}`,
    mesVoyages: mesVoyagesRoute,
    aujourdhui: () => (base === "/voyages" ? `${trip}/aujourdhui` : null),
    versions: () => (base === "/voyages" ? `${trip}/versions` : null),
  };
}
