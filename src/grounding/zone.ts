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
 * Lieu à regrouper : identifiant, type, position de sa fiche et, facultatif, les rangs des jours dont il est **fermé
 * pendant toute la fenêtre** (horaires de sa fiche ; aucune plage ne recouvre la fenêtre du jour). Horaires inconnus :
 * aucun jour fermé.
 */
export type LieuARegrouper<K extends string> = {
  readonly id: string;
  readonly type: K;
  readonly position: Coordonnees;
  readonly fermeLes?: readonly number[];
};

/**
 * Options du regroupement. `typesPrioritaires` : types servis d'abord quand la capacité d'un jour est inférieure à sa
 * demande (`partsDesJours`) ; les autres suivent dans l'ordre des clés des demandes.
 */
export type OptionsRegroupement<K extends string> = { readonly typesPrioritaires?: readonly K[] };

/** Nombre maximal de passes d'affinage du regroupement (centres recalculés, lieux réaffectés). */
export const PASSES_REGROUPEMENT = 10;

/**
 * Parts des jours (ticket 483) : pour chaque type (les `prioritaires` d'abord, puis dans l'ordre des clés des demandes),
 * les lieux disponibles sont distribués un à un, chaque fois au jour le moins rempli **en proportion de sa demande
 * totale** (égalité : rang du jour), sans dépasser sa demande de ce type ni sa capacité. Une pénurie se répartit ainsi
 * sur tous les jours (un lieu d'écart au plus entre deux jours qui demandent autant), au lieu de vider les derniers ; un
 * jour dont la capacité est inférieure à sa demande sert les types prioritaires d'abord (repas, en P0).
 */
function partsDesJours<K extends string>(
  jours: readonly JourARegrouper<K>[],
  disponibles: ReadonlyMap<K, number>,
  prioritaires: readonly K[],
): Map<K, number>[] {
  const etats = jours.map((jour) => {
    const demande = new Map<K, number>(Object.entries(jour.demande) as [K, number][]);
    const demandeTotale = [...demande.values()].reduce((somme, n) => somme + Math.max(0, n), 0);
    return { demande, demandeTotale, capacite: Math.max(0, jour.capacite), part: new Map<K, number>(), total: 0 };
  });
  const types = [...new Set([...prioritaires, ...etats.flatMap((etat) => [...etat.demande.keys()])])];
  for (const type of types) {
    for (let reste = disponibles.get(type) ?? 0; reste > 0; reste -= 1) {
      let choisi: (typeof etats)[number] | undefined;
      for (const etat of etats) {
        if ((etat.part.get(type) ?? 0) >= (etat.demande.get(type) ?? 0) || etat.total >= etat.capacite) continue;
        // Moins rempli en proportion : total / demandeTotale plus petit (produits croisés, sans flottants).
        if (choisi === undefined || etat.total * choisi.demandeTotale < choisi.total * etat.demandeTotale) choisi = etat;
      }
      if (choisi === undefined) break;
      choisi.part.set(type, (choisi.part.get(type) ?? 0) + 1);
      choisi.total += 1;
    }
  }
  return etats.map((etat) => etat.part);
}

/** Contexte commun des étapes du regroupement : lieux, parts, lieux retenus (première série), jours de fermeture. */
type Regroupement<K extends string> = {
  readonly lieux: readonly LieuARegrouper<K>[];
  readonly parts: readonly ReadonlyMap<K, number>[];
  /** Indices des lieux retenus, dans l'ordre d'entrée : les mieux classés de chaque type, autant que les parts. */
  readonly retenus: readonly number[];
  readonly ferme: (rang: number, indice: number) => boolean;
};

/**
 * Affectation sous les parts, du plus proche au plus éloigné : toutes les paires (jour, lieu retenu d'un type que le
 * jour attend), triées par rang de contrainte, puis par distance au centre du jour (égalité : rang du jour, puis ordre
 * d'entrée) ; une paire est prise si le lieu est libre et que la part du jour pour son type n'est pas épuisée. Rangs de
 * contrainte : d'abord les paires d'un lieu qui a un jour de fermeture, avec un jour où il est ouvert (il prend sa place
 * avant que les lieux sans contrainte ne remplissent ses jours possibles) ; puis les autres paires ouvertes ; en dernier
 * recours, les paires d'un lieu fermé ce jour-là. Le centre de chaque jour lui est affecté d'abord. Les parts d'un type somment au
 * nombre de lieux retenus de ce type et chaque jour qui en attend a une paire avec chacun : tout lieu retenu est
 * affecté. Rend, par jour, les indices des lieux.
 */
function affecter<K extends string>(r: Regroupement<K>, centres: readonly (number | undefined)[]): number[][] {
  const jours = r.parts.map((part, rang) => ({ reste: new Map(part), groupe: [] as number[], centre: centres.at(rang) }));
  const pris = new Set<number>();
  const prendre = (jour: (typeof jours)[number], indice: number) => {
    const lieu = r.lieux.at(indice);
    if (lieu === undefined || pris.has(indice)) return;
    const reste = jour.reste.get(lieu.type) ?? 0;
    if (reste <= 0) return;
    jour.reste.set(lieu.type, reste - 1);
    jour.groupe.push(indice);
    pris.add(indice);
  };
  for (const jour of jours) if (jour.centre !== undefined) prendre(jour, jour.centre);
  const paires: { jour: (typeof jours)[number]; rang: number; indice: number; contrainte: number; distance: number }[] = [];
  jours.forEach((jour, rang) => {
    const origine = jour.centre === undefined ? undefined : r.lieux.at(jour.centre);
    if (origine === undefined) return;
    for (const indice of r.retenus) {
      const lieu = r.lieux.at(indice);
      if (lieu === undefined || (r.parts.at(rang)?.get(lieu.type) ?? 0) <= 0) continue;
      const distance = distanceVolOiseauMetres(origine.position, lieu.position);
      const contrainte = r.ferme(rang, indice) ? 2 : (lieu.fermeLes?.length ?? 0) > 0 ? 0 : 1;
      paires.push({ jour, rang, indice, contrainte, distance });
    }
  });
  paires.sort((a, b) => a.contrainte - b.contrainte || a.distance - b.distance || a.rang - b.rang || a.indice - b.indice);
  for (const { jour, indice } of paires) prendre(jour, indice);
  return jours.map((jour) => jour.groupe);
}

/**
 * Lieu le plus central du groupe du jour `rang` (somme des distances aux autres la plus petite ; égalité : ordre
 * d'entrée), pris parmi les lieux ouverts ce jour-là s'il y en a.
 */
function lieuCentral<K extends string>(r: Regroupement<K>, rang: number, groupe: readonly number[]): number | undefined {
  const ouverts = groupe.filter((indice) => !r.ferme(rang, indice));
  let meilleur: number | undefined;
  let somme = Number.POSITIVE_INFINITY;
  for (const indice of [...(ouverts.length > 0 ? ouverts : groupe)].sort((a, b) => a - b)) {
    const ici = r.lieux.at(indice);
    if (ici === undefined) continue;
    let total = 0;
    for (const autre of groupe) {
      const la = r.lieux.at(autre);
      if (la !== undefined) total += distanceVolOiseauMetres(ici.position, la.position);
    }
    if (total < somme) {
      somme = total;
      meilleur = indice;
    }
  }
  return meilleur;
}

/**
 * Coût d'un regroupement, comparé dans l'ordre : lieux mis un jour où ils sont fermés, puis dispersion (somme des
 * distances de chaque lieu au centre de son jour).
 */
function coutDuRegroupement<K extends string>(r: Regroupement<K>, groupes: readonly number[][], centres: readonly (number | undefined)[]) {
  let fermes = 0;
  let dispersion = 0;
  groupes.forEach((groupe, rang) => {
    const centre = centres.at(rang);
    const origine = centre === undefined ? undefined : r.lieux.at(centre);
    for (const indice of groupe) {
      if (r.ferme(rang, indice)) fermes += 1;
      const lieu = r.lieux.at(indice);
      if (origine !== undefined && lieu !== undefined) dispersion += distanceVolOiseauMetres(origine.position, lieu.position);
    }
  });
  return { fermes, dispersion };
}

const meilleurCout = (a: { fermes: number; dispersion: number }, b: { fermes: number; dispersion: number }) =>
  a.fermes < b.fermes || (a.fermes === b.fermes && a.dispersion < b.dispersion);

/**
 * Regroupement par jour à vol d'oiseau (0053, amendement 1, point 4 ; 0055 § 6 point 4, « après les fiches » ; ticket
 * 483 et demande de Samuel du 2026-10-18 09:47 UTC : « répartis de manière cohérente, par exemple par quartier »), sur les
 * positions des fiches de l'étape finale, avant Routes, qui ne sert qu'à l'ordre final :
 * 1. **parts** : chaque jour reçoit, par type, sa part des lieux disponibles, sous sa demande et sa capacité, en
 *    proportion de sa demande (`partsDesJours`) : une pénurie touche tous les jours, jamais les derniers seulement ;
 * 2. **lieux retenus** : de chaque type, les premiers lieux dans l'ordre d'entrée (celui du classement), autant que la
 *    somme des parts de ce type ; les suivants ne sont pas regroupés. La distance range les lieux retenus entre les
 *    jours, elle n'en écarte aucun et n'en fait entrer aucun moins bien classé (cadrage § 3.7) ;
 * 3. **centres éloignés** : le premier lieu retenu d'un type attendu centre le premier jour ; chaque jour suivant est
 *    centré sur le lieu attendu le plus éloigné des centres déjà posés (un quartier par jour), pris parmi les lieux
 *    ouverts ce jour-là s'il y en a ;
 * 4. **affectation géographique** : chaque lieu va au jour dont le centre est le plus proche, du plus proche au plus
 *    éloigné, dans la limite des parts (`affecter`) ; un lieu n'est mis un jour où il est fermé (`fermeLes`) qu'en
 *    dernier recours ;
 * 5. **affinage** : chaque centre devient le lieu le plus central de son groupe, puis les lieux sont réaffectés, jusqu'à
 *    stabilité (`PASSES_REGROUPEMENT` passes au plus) ; le regroupement rendu est **le meilleur rencontré** (moins de
 *    lieux un jour de fermeture, puis dispersion la plus petite), pas le dernier.
 * Aucun lieu n'est mis dans deux jours ; un lieu non regroupé n'est pas planifié ; la capacité de la matrice du jour
 * n'est jamais dépassée. Chaque groupe est rendu dans l'ordre d'entrée. Module pur et déterministe : les positions et
 * les horaires ne sortent pas d'ici, seuls les identifiants sont rendus.
 */
export function regrouperParJour<K extends string>(
  lieux: readonly LieuARegrouper<K>[],
  jours: readonly JourARegrouper<K>[],
  options: OptionsRegroupement<K> = {},
): string[][] {
  // 1. Parts.
  const disponibles = new Map<K, number>();
  for (const lieu of lieux) disponibles.set(lieu.type, (disponibles.get(lieu.type) ?? 0) + 1);
  const parts = partsDesJours(jours, disponibles, options.typesPrioritaires ?? []);

  // 2. Lieux retenus : les mieux classés de chaque type, autant que les parts.
  const quota = new Map<K, number>();
  for (const part of parts) for (const [type, n] of part) quota.set(type, (quota.get(type) ?? 0) + n);
  const retenus: number[] = [];
  lieux.forEach((lieu, indice) => {
    const reste = quota.get(lieu.type) ?? 0;
    if (reste <= 0) return;
    quota.set(lieu.type, reste - 1);
    retenus.push(indice);
  });
  const r: Regroupement<K> = {
    lieux,
    parts,
    retenus,
    ferme: (rang, indice) => lieux.at(indice)?.fermeLes?.includes(rang) === true,
  };
  const attendu = (rang: number, indice: number) => {
    const lieu = lieux.at(indice);
    return lieu !== undefined && (parts.at(rang)?.get(lieu.type) ?? 0) > 0;
  };

  // 3. Centres éloignés, un par jour qui attend au moins un lieu ; ouverts ce jour-là s'il y en a.
  const centres: (number | undefined)[] = [];
  jours.forEach((_, rang) => {
    const poses = centres.flatMap((centre) => (centre === undefined ? [] : [centre]));
    const possibles = retenus.filter((indice) => attendu(rang, indice) && !poses.includes(indice));
    const ouverts = possibles.filter((indice) => !r.ferme(rang, indice));
    const parmi = ouverts.length > 0 ? ouverts : possibles;
    let choisi: number | undefined;
    let plusLoin = Number.NEGATIVE_INFINITY;
    for (const indice of parmi) {
      if (poses.length === 0) {
        choisi = indice;
        break;
      }
      const position = lieux.at(indice)?.position;
      if (position === undefined) continue;
      const proche = Math.min(...poses.map((pose) => distanceVolOiseauMetres(lieux.at(pose)?.position ?? position, position)));
      if (proche > plusLoin) {
        plusLoin = proche;
        choisi = indice;
      }
    }
    centres.push(choisi);
  });

  // 4 et 5. Affectation, puis affinage jusqu'à stabilité ; le meilleur regroupement rencontré est gardé.
  let groupes = affecter(r, centres);
  let meilleur = { groupes, cout: coutDuRegroupement(r, groupes, centres) };
  for (let passe = 0; passe < PASSES_REGROUPEMENT; passe += 1) {
    const nouveaux = groupes.map((groupe, rang) => lieuCentral(r, rang, groupe));
    if (nouveaux.every((centre, rang) => centre === centres.at(rang))) break;
    centres.splice(0, centres.length, ...nouveaux);
    groupes = affecter(r, centres);
    const cout = coutDuRegroupement(r, groupes, centres);
    if (meilleurCout(cout, meilleur.cout)) meilleur = { groupes, cout };
  }
  return meilleur.groupes.map((groupe) =>
    [...groupe]
      .sort((a, b) => a - b)
      .flatMap((indice) => {
        const lieu = lieux.at(indice);
        return lieu === undefined ? [] : [lieu.id];
      }),
  );
}
