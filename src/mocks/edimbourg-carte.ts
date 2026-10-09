import type { DayMap, MapPoint } from "@/contracts";

import { EDIMBOURG_TRIP_ID } from "./edimbourg";

/**
 * Positions simulées des terminus et des étapes des 6 jours d'Édimbourg
 * (spécification F4, décision F4-PO-2).
 *
 * Saisies à la main d'après la géographie publique de la ville, arrondies à
 * 3 décimales (environ 100 m). Elles n'ont été ni copiées depuis Google Maps,
 * ni obtenues par un service Google. Aucune autre donnée de lieu n'est ajoutée.
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

type LatLng = readonly [lat: number, lng: number];

/** Logement simulé « [Hôtel, Old Town] ». */
const HOTEL: LatLng = [55.949, -3.186];
/** Aéroport d'Édimbourg, à l'ouest de la ville. */
const AEROPORT: LatLng = [55.95, -3.372];

const stop = (stopId: string, [lat, lng]: LatLng): MapPoint => ({ ref: { type: "stop", stopId }, lat, lng });
const start = ([lat, lng]: LatLng): MapPoint => ({ ref: { type: "terminus", role: "start" }, lat, lng });
const end = ([lat, lng]: LatLng): MapPoint => ({ ref: { type: "terminus", role: "end" }, lat, lng });

const day = (dayIndex: number, points: MapPoint[]): DayMap => ({ tripId: EDIMBOURG_TRIP_ID, dayIndex, points });

export const edimbourgCarte: DayMap[] = [
  day(1, [
    start(AEROPORT),
    stop("j1-dejeuner", [55.947, -3.196]), // Grassmarket
    stop("j1-chateau", [55.949, -3.2]), // Castle Rock
    stop("j1-diner", [55.95, -3.191]), // Old Town, près du Royal Mile
    stop("j1-tattoo", [55.949, -3.197]), // Esplanade du château
    end(HOTEL),
  ]),
  day(2, [
    start(HOTEL),
    stop("j2-royal-mile", [55.95, -3.19]),
    stop("j2-dean-village", [55.952, -3.218]), // Water of Leith
    stop("j2-dejeuner", [55.958, -3.209]), // Stockbridge
    stop("j2-jardin-botanique", [55.965, -3.209]), // Inverleith
    stop("j2-diner", [55.954, -3.198]), // New Town
    end(HOTEL),
  ]),
  day(3, [
    start(HOTEL),
    // Départ du car de l'excursion, près de la gare de Waverley : la journée se passe hors de la ville.
    stop("j3-excursion-highlands", [55.951, -3.191]),
    stop("j3-diner", [55.947, -3.195]), // Grassmarket
    end(HOTEL),
  ]),
  day(4, [
    start(HOTEL),
    stop("j4-calton-hill", [55.955, -3.183]),
    stop("j4-holyrood", [55.953, -3.172]),
    stop("j4-dejeuner", [55.951, -3.178]), // Canongate
    stop("j4-arthurs-seat", [55.944, -3.162]),
    stop("j4-diner", [55.948, -3.19]), // Old Town
    end(HOTEL),
  ]),
  day(5, [
    start(HOTEL),
    stop("j5-musee-national", [55.947, -3.19]), // Chambers Street
    stop("j5-dejeuner", [55.947, -3.193]),
    stop("j5-distillerie", [55.889, -2.891]), // East Lothian
    stop("j5-diner", [55.976, -3.17]), // Leith
    end(HOTEL),
  ]),
  day(6, [
    start(HOTEL),
    stop("j6-galerie-nationale", [55.951, -3.196]), // The Mound
    stop("j6-brunch", [55.954, -3.194]), // New Town
    end(AEROPORT),
  ]),
];
