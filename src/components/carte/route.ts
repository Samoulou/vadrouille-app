import type { MapPointRef } from "@/contracts";
import { mapPointKey } from "@/contracts/values";

/**
 * Construction du contenu de la carte à partir de `Day.items` et de `DayMap` (spécification F4).
 * Fonctions pures, partagées par le rendu Google et la carte simulée : même numérotation,
 * mêmes marqueurs, même tracé.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/**
 * Élément de la ligne du jour tel que la carte le lit : `DayLineItem` en est un sous-type, comme l'élément de la vue
 * partagée converti par `SharedShell` (étape désignée par sa clé locale, spécification F10, F10-TL-14). La carte ne
 * lit que l'identifiant et le nom d'une étape, le rôle d'un terminus et le mode d'un segment.
 */
export type RouteItem =
  | { type: "stop"; stop: { id: string; name: string } }
  | { type: "terminus"; role: "start" | "end" }
  | { type: "segment"; segment: { mode: "walk" | "transit" | "car" } }
  | { type: "free" }
  | { type: "openMeal" }
  /**
   * Changement de ville (décision 0148 § 1) : pas une étape, donc ni marqueur ni numéro. `buildDayRoute` coupe le tracé
   * à travers lui : aucun tronçon d'une ville à l'autre (0148 § 7.2 point 2, 0151 § 4).
   */
  | { type: "transfer" };

/** Jour tel que la carte le lit : `Day` en est un sous-type. */
export interface RouteDay {
  /** 1 = J1. */
  index: number;
  items: readonly RouteItem[];
}

/** Positions d'un jour telles que la carte les lit : `DayMap` en est un sous-type. */
export interface RouteMap {
  dayIndex: number;
  points: readonly { ref: MapPointRef; lat: number; lng: number }[];
}

/**
 * Moitié de la journée d'un changement de ville (décision 0150 § 3 point 4) : « avant » = terminus `start` et étapes
 * placées avant le `transfer` dans `day.items` ; « après » = étapes placées après lui et terminus `end`.
 */
export type Moitie = "avant" | "apres";

/** Marqueur d'étape : numéro = rang parmi les étapes de `day.items`, avec ou sans position. */
export interface StopMarkerSpec {
  stopId: string;
  number: number;
  name: string;
  position: LatLng;
  /** Moitié de l'étape, seulement le jour d'un changement de ville (`transfer` dans `day.items`). */
  moitie?: Moitie;
}

/** Marqueur de terminus ; départ et retour à la même position = un seul marqueur. */
export interface TerminusMarkerSpec {
  roles: ("start" | "end")[];
  position: LatLng;
}

/** Tronçon droit entre deux positions (phase 0 : aucun itinéraire réel). */
export interface RouteLeg {
  from: LatLng;
  to: LatLng;
  /** Seul le dernier tronçon vers le logement, quand on y rentre à pied (F4-PO-6). */
  dashed: boolean;
}

export interface DayRoute {
  stops: StopMarkerSpec[];
  termini: TerminusMarkerSpec[];
  legs: RouteLeg[];
  /** Toutes les positions affichées (terminus compris), pour le cadrage. */
  positions: LatLng[];
  /** Positions de chaque moitié, seulement le jour d'un changement de ville (décision 0150 § 3 point 4). */
  moities?: Record<Moitie, LatLng[]>;
}

function positionsByRef(map: RouteMap | null | undefined): Map<string, LatLng> {
  const byRef = new Map<string, LatLng>();
  for (const point of map?.points ?? []) {
    byRef.set(mapPointKey(point.ref), { lat: point.lat, lng: point.lng });
  }
  return byRef;
}

const keyOf = (ref: MapPointRef) => mapPointKey(ref);
const samePosition = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

/** Le segment qui précède immédiatement le terminus de retour est-il à pied ? */
function returnsOnFoot(day: RouteDay): boolean {
  const endIndex = day.items.findIndex((item) => item.type === "terminus" && item.role === "end");
  if (endIndex <= 0) {
    return false;
  }
  const previous = day.items[endIndex - 1];
  return previous?.type === "segment" && previous.segment.mode === "walk";
}

/** Marqueurs, tracé et positions d'une journée. */
export function buildDayRoute(day: RouteDay, map: RouteMap | null | undefined): DayRoute {
  const byRef = positionsByRef(map);
  // Jour d'un changement de ville : une étape est « avant » ou « après » selon sa place par rapport au `transfer`.
  const transferAt = day.items.findIndex((item) => item.type === "transfer");
  const stops: StopMarkerSpec[] = [];
  let rank = 0;
  day.items.forEach((item, at) => {
    if (item.type !== "stop") {
      return;
    }
    rank += 1;
    const position = byRef.get(keyOf({ type: "stop", stopId: item.stop.id }));
    if (position) {
      const moitie: Moitie | undefined = transferAt < 0 ? undefined : at < transferAt ? "avant" : "apres";
      stops.push({ stopId: item.stop.id, number: rank, name: item.stop.name, position, ...(moitie ? { moitie } : {}) });
    }
  });

  const start = byRef.get(keyOf({ type: "terminus", role: "start" }));
  const end = byRef.get(keyOf({ type: "terminus", role: "end" }));
  const termini: TerminusMarkerSpec[] = [];
  if (start && end && samePosition(start, end)) {
    termini.push({ roles: ["start", "end"], position: start });
  } else {
    if (start) termini.push({ roles: ["start"], position: start });
    if (end) termini.push({ roles: ["end"], position: end });
  }

  // Tracé : départ, étapes positionnées dans l'ordre, retour. Un terminus sans position est omis
  // avec le tronçon qui le touche ; les voisines d'une étape sans position sont reliées. Le jour d'un
  // changement de ville, aucun tronçon ne relie la moitié « avant » à la moitié « après » (0151 § 4).
  const path: { position: LatLng; isEnd: boolean; moitie: Moitie }[] = [];
  if (start) path.push({ position: start, isEnd: false, moitie: "avant" });
  for (const stop of stops) path.push({ position: stop.position, isEnd: false, moitie: stop.moitie ?? "avant" });
  if (end) path.push({ position: end, isEnd: true, moitie: transferAt < 0 ? "avant" : "apres" });
  const onFoot = returnsOnFoot(day);
  const legs: RouteLeg[] = [];
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1]!;
    const to = path[i]!;
    if (from.moitie !== to.moitie) continue;
    legs.push({ from: from.position, to: to.position, dashed: to.isEnd && onFoot });
  }

  const route: DayRoute = {
    stops,
    termini,
    legs,
    positions: [...termini.map((terminus) => terminus.position), ...stops.map((stop) => stop.position)],
  };
  if (transferAt >= 0) {
    route.moities = {
      avant: [...(start ? [start] : []), ...stops.filter((stop) => stop.moitie === "avant").map((stop) => stop.position)],
      apres: [...stops.filter((stop) => stop.moitie === "apres").map((stop) => stop.position), ...(end ? [end] : [])],
    };
  }
  return route;
}

/**
 * Moitié cadrée à l'ouverture de la Journée d'un changement de ville (décision 0150 § 3 point 4) : celle de l'étape
 * sélectionnée si elle est positionnée ; sinon « avant » si elle a une étape positionnée, sinon « après » si elle en a une ;
 * sinon `null` (toute la journée). `null` aussi pour un jour sans changement de ville.
 */
export function moitieInitiale(route: DayRoute, selectedStopId?: string): Moitie | null {
  if (!route.moities) return null;
  const selected = selectedStopId === undefined ? undefined : route.stops.find((stop) => stop.stopId === selectedStopId);
  if (selected?.moitie) return selected.moitie;
  if (route.stops.some((stop) => stop.moitie === "avant")) return "avant";
  if (route.stops.some((stop) => stop.moitie === "apres")) return "apres";
  return null;
}

/**
 * Vue d'ensemble : une position par étape positionnée de tous les jours, plus une par position
 * de terminus distincte (même position, même jour ou jours différents = un seul anneau).
 */
export function buildOverview(maps: readonly RouteMap[]): LatLng[] {
  const rings: LatLng[] = [];
  const termini: LatLng[] = [];
  for (const map of maps) {
    for (const point of map.points) {
      const position = { lat: point.lat, lng: point.lng };
      if (point.ref.type === "stop") {
        rings.push(position);
      } else if (!termini.some((known) => samePosition(known, position))) {
        termini.push(position);
      }
    }
  }
  return [...termini, ...rings];
}

/** Seuil d'affichage des anneaux d'une ville sur la carte d'ensemble à plusieurs villes (décision 0150 § 2 point 3). */
export const ZOOM_ANNEAUX_PAR_VILLE = 10;

/** Zoom d'un cadrage réduit à une seule position (décision 0150 § 3 bis). */
export const ZOOM_POSITION_SEULE = 15;

/**
 * Ville d'un jour telle que la carte la lit : résultat de `villesDeLaDate` (`src/domain/villes-du-voyage.ts`), reçu de
 * `TripShell` et jamais recalculé ici. Forme reprise en type seulement : hors de `src/server`, seul
 * `src/features/voyage/villes.ts` atteint `src/domain` (décision 0048 § 1, `tests/unit/p0/imports.test.ts`) ; un
 * `VilleDeLaDate` de forme différente ne passerait plus `tsc` à l'appel de `DayMap` dans `TripShell`.
 */
export type VilleDuJour = { readonly ville: string } | { readonly de: string; readonly vers: string } | undefined;

/**
 * Repère de ville (décision 0150 § 2 point 1) : terminus du logement d'une ville. Le premier (`primary`) porte l'étiquette
 * « {n} · {ville} » et le nom accessible ; une position supplémentaire de la même ville est un terminus masqué.
 */
export interface CityMarkerSpec {
  key: string;
  /** Nom maison de `Trip.cities`. */
  city: string;
  /** Numéros de la ville dans l'ordre du voyage (1 = première) : deux quand le même logement revient (« 1 et 3 »). */
  numbers: number[];
  position: LatLng;
  primary: boolean;
}

/** Anneau d'une étape, rattaché à sa ville (nom maison). */
export interface CityRing {
  position: LatLng;
  city: string;
}

export interface CityOverview {
  /** Repères, dans l'ordre des villes (repère nommé d'abord, puis ses positions supplémentaires). */
  markers: CityMarkerSpec[];
  rings: CityRing[];
  /** Positions de chaque ville distincte (logements et étapes), dans l'ordre de première apparition. */
  cities: { city: string; positions: LatLng[] }[];
  /** Toutes les positions (cadrage « Toutes les villes »). */
  all: LatLng[];
}

/**
 * Groupes par ville de la carte d'ensemble (décision 0150 § 2) : `villesParJour[i]` est la ville du jour `days[i]`
 * (`villesDeLaDate`), `villes` les noms de `Trip.cities` dans l'ordre. Le jour d'un changement de ville, le terminus `start`
 * et les étapes avant le `transfer` vont à la ville quittée, le reste à la ville d'arrivée. Positions de la relecture
 * existante, jamais écrites.
 */
export function buildCityOverview(
  days: readonly RouteDay[],
  maps: readonly RouteMap[],
  villesParJour: readonly VilleDuJour[],
  villes: readonly string[],
): CityOverview {
  const lodgings: LatLng[][] = villes.map(() => []);
  const ringsOf: LatLng[][] = villes.map(() => []);
  const last = villes.length - 1;
  let stay = 0;
  days.forEach((day, rang) => {
    const ville = villesParJour[rang];
    let before = stay;
    // Séjour courant suivi dans l'ordre des jours : une même ville peut revenir (Rome, Florence, Rome).
    if (ville && "de" in ville) {
      before = stay;
      stay = Math.min(stay + 1, last);
    } else if (ville && villes[stay] !== ville.ville) {
      const suivant = villes.findIndex((nom, index) => index > stay && nom === ville.ville);
      if (suivant >= 0) stay = suivant;
      before = stay;
    }
    const after = stay;
    const map = maps.find((candidate) => candidate.dayIndex === day.index);
    if (!map) return;
    const transferAt = day.items.findIndex((item) => item.type === "transfer");
    const stopAt = new Map<string, number>();
    day.items.forEach((item, at) => {
      if (item.type === "stop") stopAt.set(item.stop.id, at);
    });
    for (const point of map.points) {
      const position = { lat: point.lat, lng: point.lng };
      if (point.ref.type === "terminus") {
        const sejour = point.ref.role === "start" ? before : after;
        if (!lodgings[sejour]!.some((known) => samePosition(known, position))) lodgings[sejour]!.push(position);
      } else {
        const at = stopAt.get(point.ref.stopId) ?? -1;
        ringsOf[transferAt >= 0 && at < transferAt ? before : after]!.push(position);
      }
    }
  });

  const markers: CityMarkerSpec[] = [];
  villes.forEach((city, sejour) => {
    const [first, ...others] = lodgings[sejour]!;
    if (!first) return;
    // Même ville, même logement qu'un séjour précédent : une seule étiquette « 1 et 3 · Rome ».
    const same = markers.find((marker) => marker.primary && marker.city === city && samePosition(marker.position, first));
    if (same) same.numbers.push(sejour + 1);
    else markers.push({ key: `ville-${sejour + 1}`, city, numbers: [sejour + 1], position: first, primary: true });
    others.forEach((position, index) => {
      if (!markers.some((marker) => samePosition(marker.position, position))) {
        markers.push({ key: `ville-${sejour + 1}-${index + 2}`, city, numbers: [sejour + 1], position, primary: false });
      }
    });
  });

  const rings: CityRing[] = villes.flatMap((city, sejour) => ringsOf[sejour]!.map((position) => ({ position, city })));
  const cities: CityOverview["cities"] = [];
  villes.forEach((city, sejour) => {
    let entry = cities.find((candidate) => candidate.city === city);
    if (!entry) {
      entry = { city, positions: [] };
      cities.push(entry);
    }
    entry.positions.push(...lodgings[sejour]!, ...ringsOf[sejour]!);
  });
  return { markers, rings, cities, all: [...lodgings.flat(), ...ringsOf.flat()] };
}

/**
 * Anneau d'une ville dessiné (décision 0150 § 2 point 3) : toujours sur la vue de sa ville ; sinon à partir du zoom
 * `ZOOM_ANNEAUX_PAR_VILLE`, jamais tant que le zoom est inconnu.
 */
export function anneauVisible(zoom: number | null | undefined, city: string, cityView?: string): boolean {
  if (cityView !== undefined && city === cityView) return true;
  return zoom !== null && zoom !== undefined && zoom >= ZOOM_ANNEAUX_PAR_VILLE;
}

/** Marge en pixels CSS de chaque côté (même forme que `FitPadding` de `types.ts`). */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** Taille du monde en pixels au zoom `zoom` (tuile de 256 px). */
const worldSize = (zoom: number) => 256 * 2 ** zoom;
const MAX_LAT = 85.05112878;

/**
 * Centre de carte qui place `target` au milieu de la zone non couverte par `insets` (décision 0015 § 4).
 * Décalage en pixels `((right − left) / 2, (bottom − top) / 2)` depuis la cible (y vers le bas),
 * converti en latitude et longitude en projection Web Mercator au zoom courant. Inserts nuls : la cible.
 */
export function offsetCenter(target: LatLng, insets: Insets | undefined, zoom: number): LatLng {
  if (!insets) return { ...target };
  const dx = (insets.right - insets.left) / 2;
  const dy = (insets.bottom - insets.top) / 2;
  if (dx === 0 && dy === 0) return { ...target };
  const size = worldSize(zoom);
  const lat = Math.max(-MAX_LAT, Math.min(MAX_LAT, target.lat));
  const sin = Math.sin((lat * Math.PI) / 180);
  const x = ((target.lng + 180) / 360) * size + dx;
  const y = (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * size + dy;
  const lng = (x / size) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * y) / size;
  return { lat: (Math.atan(Math.sinh(n)) * 180) / Math.PI, lng };
}

export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/** Boîte englobante des positions, `null` sans position. */
export function boundsOf(positions: LatLng[]): Bounds | null {
  if (positions.length === 0) {
    return null;
  }
  return positions.reduce<Bounds>(
    (box, { lat, lng }) => ({
      north: Math.max(box.north, lat),
      south: Math.min(box.south, lat),
      east: Math.max(box.east, lng),
      west: Math.min(box.west, lng),
    }),
    { north: -90, south: 90, east: -180, west: 180 },
  );
}

/** Mètres par degré de latitude (sphère moyenne). */
const METRES_PAR_DEGRE = 111_320;

/**
 * Boîte d'un cercle de `radiusM` mètres autour de `center` (zone d'un quartier, `AreaMap`), en deux coins opposés :
 * cadrage de la carte Google (`fitBounds`). La longitude est corrigée par la latitude.
 */
export function areaCorners(center: LatLng, radiusM: number): LatLng[] {
  const dLat = radiusM / METRES_PAR_DEGRE;
  const dLng = dLat / Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  return [
    { lat: center.lat - dLat, lng: center.lng - dLng },
    { lat: center.lat + dLat, lng: center.lng + dLng },
  ];
}

/** Rayon en degrés de latitude d'un cercle de `radiusM` mètres : carte simulée, projection équirectangulaire. */
export function areaRadiusDegrees(radiusM: number): number {
  return radiusM / METRES_PAR_DEGRE;
}
