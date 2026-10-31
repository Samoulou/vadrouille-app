import type { Day, DayMap, Trip } from "@/contracts";
import { villesDeLaDate } from "@/domain/villes-du-voyage";
import { CARTE_VILLES, VILLES_CARTE, voyage, type VilleFixture } from "@/mocks/carte-villes";

/**
 * Données des tests de la carte à plusieurs villes (décision 0150, critère 19 de M4-suite) : jeux de
 * `src/mocks/carte-villes.ts` (positions saisies à la main, aucune donnée Google) et variantes.
 */
export { CARTE_VILLES, VILLES_CARTE, voyage };

/** Rome du 2027-05-04, Florence à partir du 2027-05-06 : J3 est le jour du changement de ville. */
export const romeFlorence = CARTE_VILLES["rome-florence"]!;
export const parisBerlin = CARTE_VILLES["paris-berlin"]!;

/** Ville de chaque jour, par la fonction pure du domaine (comme `TripShell`). */
export function villesParJour(trip: Trip) {
  return trip.days.map((day) => villesDeLaDate(trip.cities ?? [], day.date));
}

export const nomsDesVilles = (trip: Trip) => (trip.cities ?? []).map((city) => city.name);

/** Rome, Florence, Rome : même logement à Rome, ou un autre logement au second séjour. */
export function romeFlorenceRome(memeLogement: boolean) {
  const rome2: VilleFixture = memeLogement ? VILLES_CARTE.ROME : { ...VILLES_CARTE.ROME, hotel: [41.903, 12.48] };
  return voyage(`rome-florence-rome-${memeLogement ? "meme" : "autre"}`, [VILLES_CARTE.ROME, VILLES_CARTE.FLORENCE, rome2]);
}

export const jourDe = (trip: Trip, index: number): Day => trip.days.find((day) => day.index === index)!;
export const carteDe = (maps: readonly DayMap[], index: number): DayMap => maps.find((map) => map.dayIndex === index)!;

/** Copie de positions où le terminus `role` du jour `index` est déplacé (deux positions de logement pour une ville). */
export function deplacerTerminus(maps: readonly DayMap[], index: number, role: "start" | "end", lat: number, lng: number): DayMap[] {
  return maps.map((map) =>
    map.dayIndex !== index
      ? map
      : { ...map, points: map.points.map((point) => (point.ref.type === "terminus" && point.ref.role === role ? { ...point, lat, lng } : point)) },
  );
}

/** Copie d'un jour sans les étapes `stopIds` (ligne et positions). */
export function sansEtapes(trip: Trip, maps: readonly DayMap[], index: number, stopIds: readonly string[]) {
  const garder = (id: string) => !stopIds.includes(id);
  return {
    trip: {
      ...trip,
      days: trip.days.map((day) =>
        day.index !== index ? day : { ...day, items: day.items.filter((item) => item.type !== "stop" || garder(item.stop.id)) },
      ),
    },
    maps: maps.map((map) =>
      map.dayIndex !== index ? map : { ...map, points: map.points.filter((point) => point.ref.type !== "stop" || garder(point.ref.stopId)) },
    ),
  };
}
