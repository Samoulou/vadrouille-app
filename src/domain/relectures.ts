import type { MobilityMode } from "@/contracts";

/**
 * Interfaces injectées des données dérivées de Google (décision 0045, B5-TL-2) : **synchrones et en mémoire**. Le
 * serveur (B8) fait ses relectures Places et Routes avant d'appeler le moteur, puis lui passe ces fonctions, qui
 * lisent une table en mémoire. Dans B5, ce sont des doubles de test à valeurs sentinelles.
 *
 * Aucun champ de forme Google. Le moteur n'appelle ces fonctions que pendant un calcul et ne renvoie jamais leurs
 * valeurs dans une sortie d'écriture ni dans le rapport de validation (décision 0011, points 2, 4 et 5).
 */

export const INCONNU = "inconnu";
export type Inconnu = typeof INCONNU;

/** Un lieu (`placeId`) ou le logement d'une nuit (index de la nuit, 0 = première nuit). */
export type Point = { readonly lieu: string } | { readonly logement: number };

export type Validite = "valide" | "ferme_definitivement" | "introuvable" | Inconnu;

/** Plage d'ouverture d'une date, en minutes depuis minuit du jour ; `fin` ≤ 2 880 (ouverture après minuit). */
export type Plage = { readonly debut: number; readonly fin: number };

export type ModeTrajet = MobilityMode;

/**
 * Durée d'un trajet (décision 0048 § 3) : minutes et indication « estimée » (B8 estime à partir des coordonnées
 * quand Routes ne répond pas, 0011 point 5). Le moteur n'estime jamais lui-même ; une durée estimée est une durée
 * connue (seul `inconnu` rend un trajet non planifiable).
 */
export type Duree = { readonly minutes: number; readonly estimee: boolean };

export type Relectures = {
  validite(placeId: string): Validite;
  /** Plages demandées **par date** (AAAA-MM-JJ) : B8 peut y refléter une fermeture temporaire. */
  plages(placeId: string, date: string): readonly Plage[] | Inconnu;
  duree(depuis: Point, vers: Point, mode: ModeTrajet): Duree | Inconnu;
};

/** Ordre de départage des modes à durée égale (B5-PO-6) : marche, puis transports publics, puis voiture. */
export const ORDRE_MODES: readonly ModeTrajet[] = ["walk", "transit", "car"];

/** Deux points désignent-ils le même endroit ? (même lieu, ou même nuit). */
export function memePoint(a: Point, b: Point): boolean {
  if ("lieu" in a && "lieu" in b) return a.lieu === b.lieu;
  if ("logement" in a && "logement" in b) return a.logement === b.logement;
  return false;
}

/**
 * Trajet le plus rapide parmi les modes admis dont l'interface donne une durée (B5-PO-6) ; à égalité, l'ordre de
 * `ORDRE_MODES`. Le choix se fait sur `minutes` seules ; `estimee` est celle du mode retenu (0048 § 3.2). Aucun mode
 * admis avec une durée connue : `inconnu` (jamais estimé par le moteur).
 */
export function trajetLePlusRapide(
  relectures: Relectures,
  depuis: Point,
  vers: Point,
  modes: readonly ModeTrajet[],
): { mode: ModeTrajet; minutes: number; estimee: boolean } | Inconnu {
  let meilleur: { mode: ModeTrajet; minutes: number; estimee: boolean } | undefined;
  for (const mode of ORDRE_MODES) {
    if (!modes.includes(mode)) continue;
    const duree = relectures.duree(depuis, vers, mode);
    if (duree === INCONNU) continue;
    if (meilleur === undefined || duree.minutes < meilleur.minutes) meilleur = { mode, minutes: duree.minutes, estimee: duree.estimee };
  }
  return meilleur ?? INCONNU;
}

/** Vrai si `[debut, fin]` tient dans une plage connue ; plages inconnues : `inconnu` (aucune contrainte, B5-PO-5). */
export function dansLesPlages(plages: readonly Plage[] | Inconnu, debut: number, fin: number): boolean | Inconnu {
  if (plages === INCONNU) return INCONNU;
  return plages.some((plage) => plage.debut <= debut && fin <= plage.fin);
}

/** Logements d'un jour (0045 § 2.2) : jour `j` de 0 à `N`, départ `max(j − 1, 0)`, arrivée `min(j, N − 1)`. */
export function logementsDuJour(jour: number, nombreDeNuits: number): { depart: number; arrivee: number } {
  const derniere = Math.max(nombreDeNuits - 1, 0);
  return { depart: Math.min(Math.max(jour - 1, 0), derniere), arrivee: Math.min(Math.max(jour, 0), derniere) };
}
