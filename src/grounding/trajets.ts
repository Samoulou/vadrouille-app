import "server-only";

import { cleTrajet, minutesDeTrajets } from "@/grounding/ancrage";
import { cleMaison as cleMaisonDe, type ClientRoutes, type Coordonnees, type ModeRoutes, type PointRoutes } from "@/grounding/interfaces";
import { capturer, type ResultatAncrage } from "@/grounding/resultat";
import { distanceVolOiseauMetres } from "@/grounding/zone";

/**
 * Trajets d'un jour, en mémoire (B8a ; spécification B8, B8-PO-8 ; décision 0085 § 1.6). Durées mesurées par Routes
 * (matrice découpée par `BLOC_MATRICE`, arrondi à la minute supérieure : `minutesDeTrajets`, réutilisée de P0) ;
 * estimation **seulement** quand Routes répond sans itinéraire pour **tous** les modes admis d'une paire : distance à
 * vol d'oiseau entre les positions des fiches × 1,3, aux vitesses de `VITESSES_KMH`, arrondie au multiple de 5
 * supérieur, `estimee: true` pour chaque mode admis. Un mode mesuré n'est jamais concurrencé par un mode estimé.
 * Toute erreur, plafond ou quota rend l'échec de l'appel entier : aucune durée. Durées et positions : données Google,
 * en mémoire seulement. Un centre maison (`suggestedArea`, 0087 § 3) est envoyé à Routes en coordonnées et sert aussi
 * à l'estimation ; il n'est ni écrit ni journalisé ici.
 */

/**
 * Point d'un jour (décision 0087 § 3.2) :
 * - `placeId` et position tirée d'une fiche de la même étape (jamais du cache, 0052 § 1.3) ;
 * - ou centre maison d'un logement `suggestedArea` (`area.center`, B8-PO-15) et sa clé, produite par `cleMaison`
 *   (`interfaces.ts`, seule fonction qui la produit ; une autre valeur est refusée).
 * Routes reçoit le point et l'estimation part de sa position : toujours le même point (B8-PO-15).
 */
export type PointTrajet =
  | { readonly placeId: string; readonly position: Coordonnees }
  | { readonly cleMaison: string; readonly centreMaison: Coordonnees };

/** Clé de trajet d'un point : son `placeId`, ou sa clé maison. */
export const cleDuPoint = (point: PointTrajet): string => ("placeId" in point ? point.placeId : point.cleMaison);

export type DureeTrajet = { readonly minutes: number; readonly estimee: boolean };

/** Table en mémoire `(clé, clé, mode) → durée` (clé : `placeId` ou clé maison) ; `undefined` si inconnue (mode non admis, point absent). */
export type TableTrajets = { readonly duree: (depuis: string, vers: string, mode: ModeRoutes) => DureeTrajet | undefined };

/** Facteur de détour appliqué à la distance à vol d'oiseau (B8-PO-8). */
export const FACTEUR_DETOUR = 1.3;
/** Vitesses de l'estimation, en km/h (B8-PO-8). */
export const VITESSES_KMH: ReadonlyMap<ModeRoutes, number> = new Map([
  ["walk", 4.5],
  ["transit", 15],
  ["car", 25],
]);

/** Minutes estimées d'une paire pour un mode, au multiple de 5 supérieur. */
export function minutesEstimees(a: Coordonnees, b: Coordonnees, mode: ModeRoutes): number {
  const kilometres = (distanceVolOiseauMetres(a, b) * FACTEUR_DETOUR) / 1000;
  const vitesse = VITESSES_KMH.get(mode);
  if (vitesse === undefined) throw new RangeError("trajets: mode inconnu");
  return Math.ceil(((kilometres / vitesse) * 60) / 5) * 5;
}

export async function chargerTrajets(
  points: readonly PointTrajet[],
  modes: readonly ModeRoutes[],
  routes: ClientRoutes,
): Promise<ResultatAncrage<TableTrajets>> {
  return capturer(async () => {
    const positions = new Map<string, Coordonnees>();
    const versRoutes = new Map<string, PointRoutes>();
    for (const point of points) {
      const cle = cleDuPoint(point);
      if (positions.has(cle)) continue;
      if ("placeId" in point) {
        positions.set(cle, { lat: point.position.lat, lng: point.position.lng });
      } else {
        const centre = { lat: point.centreMaison.lat, lng: point.centreMaison.lng };
        if (point.cleMaison !== cleMaisonDe(centre)) throw new RangeError("trajets: clé maison incohérente");
        positions.set(cle, centre);
        versRoutes.set(cle, { centreMaison: centre });
      }
    }
    const ids = [...positions.keys()];
    const admis = [...new Set(modes)];
    const mesures = new Map<ModeRoutes, Map<string, number>>();
    for (const mode of admis) mesures.set(mode, ids.length < 2 ? new Map() : await minutesDeTrajets(ids, ids, mode, routes, versRoutes));

    const table = new Map<string, Map<ModeRoutes, DureeTrajet>>();
    for (const de of ids) {
      for (const vers of ids) {
        if (de === vers) continue;
        const cle = cleTrajet(de, vers);
        const parMode = new Map<ModeRoutes, DureeTrajet>();
        for (const mode of admis) {
          const minutes = mesures.get(mode)?.get(cle);
          if (minutes !== undefined) parMode.set(mode, { minutes, estimee: false });
        }
        if (parMode.size === 0) {
          const a = positions.get(de) as Coordonnees;
          const b = positions.get(vers) as Coordonnees;
          for (const mode of admis) parMode.set(mode, { minutes: minutesEstimees(a, b, mode), estimee: true });
        }
        table.set(cle, parMode);
      }
    }
    return {
      duree(depuis, vers, mode) {
        if (!admis.includes(mode) || !positions.has(depuis) || !positions.has(vers)) return undefined;
        if (depuis === vers) return { minutes: 0, estimee: false };
        return table.get(cleTrajet(depuis, vers))?.get(mode);
      },
    };
  });
}
