import { mapPointKey, type Day, type DayMap, type MapPointRef } from "@/contracts";

/**
 * Construction du contenu de la carte à partir de `Day.items` et de `DayMap` (spécification F4).
 * Fonctions pures, partagées par le rendu Google et la carte simulée : même numérotation,
 * mêmes marqueurs, même tracé.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

/** Marqueur d'étape : numéro = rang parmi les étapes de `day.items`, avec ou sans position. */
export interface StopMarkerSpec {
  stopId: string;
  number: number;
  name: string;
  position: LatLng;
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
}

function positionsByRef(map: DayMap | null | undefined): Map<string, LatLng> {
  const byRef = new Map<string, LatLng>();
  for (const point of map?.points ?? []) {
    byRef.set(mapPointKey(point.ref), { lat: point.lat, lng: point.lng });
  }
  return byRef;
}

const keyOf = (ref: MapPointRef) => mapPointKey(ref);
const samePosition = (a: LatLng, b: LatLng) => a.lat === b.lat && a.lng === b.lng;

/** Le segment qui précède immédiatement le terminus de retour est-il à pied ? */
function returnsOnFoot(day: Day): boolean {
  const endIndex = day.items.findIndex((item) => item.type === "terminus" && item.role === "end");
  if (endIndex <= 0) {
    return false;
  }
  const previous = day.items[endIndex - 1];
  return previous?.type === "segment" && previous.segment.mode === "walk";
}

/** Marqueurs, tracé et positions d'une journée. */
export function buildDayRoute(day: Day, map: DayMap | null | undefined): DayRoute {
  const byRef = positionsByRef(map);
  const stops: StopMarkerSpec[] = [];
  let rank = 0;
  for (const item of day.items) {
    if (item.type !== "stop") {
      continue;
    }
    rank += 1;
    const position = byRef.get(keyOf({ type: "stop", stopId: item.stop.id }));
    if (position) {
      stops.push({ stopId: item.stop.id, number: rank, name: item.stop.name, position });
    }
  }

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
  // avec le tronçon qui le touche ; les voisines d'une étape sans position sont reliées.
  const path: { position: LatLng; isEnd: boolean }[] = [];
  if (start) path.push({ position: start, isEnd: false });
  for (const stop of stops) path.push({ position: stop.position, isEnd: false });
  if (end) path.push({ position: end, isEnd: true });
  const onFoot = returnsOnFoot(day);
  const legs: RouteLeg[] = [];
  for (let i = 1; i < path.length; i += 1) {
    const from = path[i - 1]!;
    const to = path[i]!;
    legs.push({ from: from.position, to: to.position, dashed: to.isEnd && onFoot });
  }

  return {
    stops,
    termini,
    legs,
    positions: [...termini.map((terminus) => terminus.position), ...stops.map((stop) => stop.position)],
  };
}

/**
 * Vue d'ensemble : une position par étape positionnée de tous les jours, plus une par position
 * de terminus distincte (même position, même jour ou jours différents = un seul anneau).
 */
export function buildOverview(maps: DayMap[]): LatLng[] {
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
