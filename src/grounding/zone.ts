import "server-only";

import type { Coordonnees, RectangleZone } from "@/grounding/interfaces";

/**
 * Zone du séjour et distances à vol d'oiseau de `p0Run` (décision 0055, section 6 points 3 et 4 ; 0053, amendement 1,
 * point 4). Module pur : calculs en mémoire, aucun appel, aucune écriture. Les positions qu'il reçoit sont des données
 * Google : elles ne sortent pas de `src/grounding` et du moteur, et n'atteignent jamais un prompt.
 */

/** Rayon moyen de la Terre (UGGI), en mètres. */
export const RAYON_TERRE_METRES = 6_371_008.8;

const RADIANS = Math.PI / 180;

/** Cosinus minimal de la latitude : près d'un pôle, la largeur en longitude est bornée au lieu de diverger. */
const COS_MIN = 0.01;

/** Distance à vol d'oiseau (formule de haversine), en mètres. */
export function distanceVolOiseauMetres(a: Coordonnees, b: Coordonnees): number {
  const dLat = (b.lat - a.lat) * RADIANS;
  const dLng = (b.lng - a.lng) * RADIANS;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * RADIANS) * Math.cos(b.lat * RADIANS) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_METRES * Math.asin(Math.min(1, Math.sqrt(h)));
}

const borner = (valeur: number, min: number, max: number) => Math.min(max, Math.max(min, valeur));

/**
 * Rectangle englobant les cercles de rayon `rayonMetres` autour des logements (0055 § 6 point 3). Les bornes sont
 * ramenées dans [-90, 90] et [-180, 180] : près d'un pôle ou de l'antiméridien, la zone est **plus petite** que les
 * cercles, jamais plus grande (la restriction ne s'ouvre jamais par ce calcul). Au moins un logement, positions finies.
 */
export function zoneDuSejour(logements: readonly Coordonnees[], rayonMetres: number): RectangleZone {
  if (logements.length === 0 || !Number.isFinite(rayonMetres) || rayonMetres <= 0) throw new RangeError("zone: logements ou rayon invalides");
  let sud = 90;
  let nord = -90;
  let ouest = 180;
  let est = -180;
  for (const { lat, lng } of logements) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new RangeError("zone: position invalide");
    const dLat = rayonMetres / RAYON_TERRE_METRES / RADIANS;
    const dLng = dLat / Math.max(Math.cos(lat * RADIANS), COS_MIN);
    sud = Math.min(sud, borner(lat - dLat, -90, 90));
    nord = Math.max(nord, borner(lat + dLat, -90, 90));
    ouest = Math.min(ouest, borner(lng - dLng, -180, 180));
    est = Math.max(est, borner(lng + dLng, -180, 180));
  }
  return { sudOuest: { lat: sud, lng: ouest }, nordEst: { lat: nord, lng: est } };
}

/** Vrai si la position est dans le rectangle, bords compris. */
export function dansZone(position: Coordonnees, zone: RectangleZone): boolean {
  return (
    position.lat >= zone.sudOuest.lat && position.lat <= zone.nordEst.lat && position.lng >= zone.sudOuest.lng && position.lng <= zone.nordEst.lng
  );
}

/**
 * Ordre provisoire à vol d'oiseau (0053, amendement 1, point 4, second temps) : plus proche voisin depuis `depart`,
 * sur les positions des fiches de l'étape finale. Il ne sert qu'à limiter les paires envoyées à Routes, qui fixe
 * l'ordre final ; égalité de distance : ordre d'entrée (déterministe).
 */
export function ordreVolOiseau<T extends { readonly position: Coordonnees }>(depart: Coordonnees, lieux: readonly T[]): T[] {
  const restants = [...lieux];
  const ordre: T[] = [];
  let ici = depart;
  while (restants.length > 0) {
    let meilleur = 0;
    let distance = Number.POSITIVE_INFINITY;
    restants.forEach((lieu, indice) => {
      const d = distanceVolOiseauMetres(ici, lieu.position);
      if (d < distance) {
        distance = d;
        meilleur = indice;
      }
    });
    const [suivant] = restants.splice(meilleur, 1);
    if (suivant === undefined) break;
    ordre.push(suivant);
    ici = suivant.position;
  }
  return ordre;
}

/** Demande d'un jour par type de créneau, et nombre de lieux que sa matrice Routes admet en plus de ses logements. */
export type JourARegrouper<K extends string> = { readonly demande: Readonly<Record<K, number>>; readonly capacite: number };

/**
 * Regroupement par jour à vol d'oiseau (0053, amendement 1, point 4 ; 0055 § 6 point 4, « après les fiches ») : sur les
 * positions des fiches de l'étape finale, avant Routes, qui ne sert qu'à l'ordre final. Jour après jour : le premier
 * lieu restant (ordre d'entrée, celui du classement) ouvre le jour ; puis, tant qu'un type reste demandé et que la
 * capacité du jour le permet, le lieu restant le plus proche à vol d'oiseau du premier, d'un type encore demandé
 * (égalité : ordre d'entrée). Aucun lieu n'est mis dans deux jours ; un lieu non regroupé n'est pas planifié. Module
 * pur : les positions ne sortent pas d'ici, seuls les identifiants sont rendus.
 */
export function regrouperParJour<K extends string, T extends { readonly id: string; readonly type: K; readonly position: Coordonnees }>(
  lieux: readonly T[],
  jours: readonly JourARegrouper<K>[],
): string[][] {
  const restants = [...lieux];
  return jours.map(({ demande, capacite }) => {
    const reste = new Map<K, number>(Object.entries(demande) as [K, number][]);
    const voulu = (lieu: T) => (reste.get(lieu.type) ?? 0) > 0;
    const groupe: string[] = [];
    const prendre = (indice: number) => {
      const [lieu] = restants.splice(indice, 1);
      if (lieu === undefined) return undefined;
      reste.set(lieu.type, (reste.get(lieu.type) ?? 0) - 1);
      groupe.push(lieu.id);
      return lieu;
    };
    if (capacite <= 0) return groupe;
    const premierIndice = restants.findIndex(voulu);
    if (premierIndice < 0) return groupe;
    const premier = prendre(premierIndice);
    if (premier === undefined) return groupe;
    while (groupe.length < capacite) {
      let meilleur = -1;
      let distance = Number.POSITIVE_INFINITY;
      restants.forEach((lieu, indice) => {
        if (!voulu(lieu)) return;
        const d = distanceVolOiseauMetres(premier.position, lieu.position);
        if (d < distance) {
          distance = d;
          meilleur = indice;
        }
      });
      if (meilleur < 0) break;
      prendre(meilleur);
    }
    return groupe;
  });
}
