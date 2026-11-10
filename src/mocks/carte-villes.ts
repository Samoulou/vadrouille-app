import type { Day, DayLineItem, DayMap, MapPoint, Trip } from "@/contracts";

import { MOCK_ORGANIZATION_ID } from "./edimbourg";

/**
 * Voyages simulés à plusieurs villes **avec positions**, pour la carte à plusieurs villes (décision 0150, critère 19 de
 * `specs/M4-suite-changement-de-ville.md`) : servis par la seule page de développement `/dev/carte/villes/[jeu]` (carte
 * simulée), jamais par une route produit ni par « Mes voyages ».
 *
 * Positions saisies à la main d'après la géographie publique des villes, arrondies à 3 décimales (environ 100 m) ; ni
 * copiées depuis Google Maps, ni obtenues par un service Google. Noms d'étapes entre crochets (handover § 0, règle 2).
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

type Position = readonly [lat: number, lng: number];

export interface VilleFixture {
  name: string;
  /** Nuits dans la ville (jours ordinaires, le jour d'arrivée compris). */
  nuits: number;
  hotel: Position;
  /** Positions des étapes, réparties sur les jours de la ville (deux par jour). */
  etapes: readonly Position[];
}

const ROME: VilleFixture = {
  name: "Rome",
  nuits: 2,
  hotel: [41.896, 12.492], // Monti
  etapes: [
    [41.896, 12.4928], // tout près du logement, à l'est : étiquette et marqueur voisins (critère 4)
    [41.892, 12.485], // Forum
    [41.906, 12.454], // Vatican
    [41.899, 12.473], // Panthéon
  ],
};
const FLORENCE: VilleFixture = {
  name: "Florence",
  nuits: 2,
  hotel: [43.769, 11.262], // Santa Croce
  etapes: [
    [43.768, 11.255], // Offices
    [43.776, 11.259], // Duomo
    [43.762, 11.249], // Boboli
    [43.771, 11.254],
  ],
};
const VENISE: VilleFixture = {
  name: "Venise",
  nuits: 2,
  hotel: [45.437, 12.336],
  etapes: [
    [45.434, 12.339],
    [45.441, 12.332],
    [45.438, 12.327],
    [45.432, 12.335],
  ],
};
const PARIS: VilleFixture = {
  name: "Paris",
  nuits: 2,
  hotel: [48.857, 2.352],
  etapes: [
    [48.861, 2.336], // Louvre
    [48.853, 2.349], // Notre-Dame
    [48.886, 2.343], // Montmartre
    [48.858, 2.294],
  ],
};
const BERLIN: VilleFixture = {
  name: "Berlin",
  nuits: 2,
  hotel: [52.52, 13.405],
  etapes: [
    [52.516, 13.378],
    [52.521, 13.397],
    [52.507, 13.39],
    [52.53, 13.41],
  ],
};
const VERSAILLES: VilleFixture = {
  name: "Versailles",
  nuits: 2,
  hotel: [48.804, 2.13],
  etapes: [
    [48.805, 2.12], // château
    [48.815, 2.11],
    [48.8, 2.135],
    [48.809, 2.126],
  ],
};
const COMPOSTELLE: VilleFixture = {
  name: "Saint-Jacques-de-Compostelle",
  nuits: 2,
  hotel: [42.88, -8.545],
  etapes: [
    [42.881, -8.544],
    [42.878, -8.54],
    [42.884, -8.548],
    [42.876, -8.547],
  ],
};
const VILLEFRANCHE: VilleFixture = {
  name: "Villefranche-sur-Mer",
  nuits: 2,
  hotel: [43.704, 7.311],
  etapes: [
    [43.703, 7.313],
    [43.706, 7.309],
    [43.701, 7.31],
    [43.708, 7.314],
  ],
};
const CASTELNUOVO: VilleFixture = {
  name: "Castelnuovo-del-Garda",
  nuits: 2,
  hotel: [45.437, 10.762],
  etapes: [
    [45.438, 10.76],
    [45.435, 10.765],
    [45.44, 10.766],
    [45.433, 10.759],
  ],
};

/** Date `jours` après `date` (AAAA-MM-JJ, UTC). */
function apres(date: string, jours: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + jours);
  return value.toISOString().slice(0, 10);
}

const walk = (minutes: number): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes, estimated: false } });
const stop = (id: string, name: string, start: string, end: string): DayLineItem => ({
  type: "stop",
  stop: { id, kind: "activity", name, start, end, facts: { area: "[Quartier]", durationMinutes: 60 }, exceptions: [], locked: false },
});

const point = (ref: MapPoint["ref"], [lat, lng]: Position): MapPoint => ({ ref, lat, lng });

interface JourFixture {
  day: Day;
  map: DayMap;
}

function jour(tripId: string, index: number, date: string, items: DayLineItem[], points: MapPoint[]): JourFixture {
  return {
    day: { index, date, items, events: [], generating: false, travelMinutes: 30, travelBudgetMinutes: 90 },
    map: { tripId, dayIndex: index, points },
  };
}

/** Jour ordinaire : départ du logement, deux étapes, retour au logement. */
function jourOrdinaire(tripId: string, index: number, date: string, ville: VilleFixture, rang: number): JourFixture {
  const id = (part: string) => `cv-j${index}-${part}`;
  const [a, b] = [ville.etapes[rang % ville.etapes.length]!, ville.etapes[(rang + 1) % ville.etapes.length]!];
  return jour(
    tripId,
    index,
    date,
    [
      { type: "terminus", role: "start", time: "09:00", label: `[Hôtel, ${ville.name}]` },
      walk(15),
      stop(id("matin"), `[Étape du matin, ${ville.name}]`, "09:15", "11:00"),
      walk(15),
      stop(id("apres-midi"), `[Étape de l'après-midi, ${ville.name}]`, "14:00", "16:00"),
      walk(15),
      { type: "terminus", role: "end", time: "16:15", label: `[Hôtel, ${ville.name}]` },
    ],
    [
      point({ type: "terminus", role: "start" }, ville.hotel),
      point({ type: "stop", stopId: id("matin") }, a),
      point({ type: "stop", stopId: id("apres-midi") }, b),
      point({ type: "terminus", role: "end" }, ville.hotel),
    ],
  );
}

/**
 * Jour du changement de ville : deux étapes dans la ville quittée (la première tout près du logement), la ligne « Vers
 * {ville} », une étape dans la ville d'arrivée, retour au nouveau logement (numéros 1 et 2, puis 3).
 */
function jourDeChangement(tripId: string, index: number, date: string, de: VilleFixture, vers: VilleFixture): JourFixture {
  const id = (part: string) => `cv-j${index}-${part}`;
  return jour(
    tripId,
    index,
    date,
    [
      { type: "terminus", role: "start", time: "08:30", label: `[Hôtel, ${de.name}]` },
      walk(5),
      stop(id("depart-1"), `[Première étape, ${de.name}]`, "08:35", "09:30"),
      walk(15),
      stop(id("depart-2"), `[Deuxième étape, ${de.name}]`, "09:45", "11:00"),
      { type: "free", from: "11:00", to: "12:00" },
      { type: "transfer", from: de.name, to: vers.name, source: "entered", start: "12:00", end: "14:00", label: `[Train vers ${vers.name}]` },
      { type: "free", from: "14:00", to: "15:00" },
      stop(id("arrivee"), `[Étape d'arrivée, ${vers.name}]`, "15:00", "16:30"),
      walk(10),
      { type: "terminus", role: "end", time: "16:40", label: `[Hôtel, ${vers.name}]` },
    ],
    [
      point({ type: "terminus", role: "start" }, de.hotel),
      point({ type: "stop", stopId: id("depart-1") }, de.etapes[0]!),
      point({ type: "stop", stopId: id("depart-2") }, de.etapes[1]!),
      point({ type: "stop", stopId: id("arrivee") }, vers.etapes[0]!),
      point({ type: "terminus", role: "end" }, vers.hotel),
    ],
  );
}

const DEBUT = "2027-05-04";

/** Voyage à plusieurs villes : `nuits` jours par ville, le premier jour d'une ville suivante est un changement de ville. */
export function voyage(id: string, villes: readonly VilleFixture[]): { trip: Trip; maps: DayMap[] } {
  const jours: JourFixture[] = [];
  const cities: { name: string; start: string; end: string }[] = [];
  let date = DEBUT;
  villes.forEach((ville, rang) => {
    cities.push({ name: ville.name, start: date, end: apres(date, ville.nuits) });
    for (let nuit = 0; nuit < ville.nuits; nuit += 1) {
      const index = jours.length + 1;
      const precedente = villes[rang - 1];
      jours.push(
        nuit === 0 && precedente ? jourDeChangement(id, index, date, precedente, ville) : jourOrdinaire(id, index, date, ville, nuit * 2),
      );
      date = apres(date, 1);
    }
  });
  // Jour du départ du voyage : un jour ordinaire de la dernière ville.
  const derniere = villes.at(-1)!;
  jours.push(jourOrdinaire(id, jours.length + 1, date, derniere, 1));
  return {
    trip: {
      id,
      organizationId: MOCK_ORGANIZATION_ID,
      destination: villes[0]!.name,
      destinationColor: "ocre",
      start: DEBUT,
      end: date,
      timeZone: "Europe/Rome",
      travellers: { adults: 2, children: 0 },
      cities,
      days: jours.map((entry) => entry.day),
      checklist: [],
      unlocked: true,
    },
    maps: jours.map((entry) => entry.map),
  };
}

/**
 * Variante d'un jeu où le jour `index` (un changement de ville) n'a plus d'étape avant le `transfer` : la moitié « avant »
 * se réduit au logement quitté, cadré seul au zoom 15 (décision 0150 § 3 bis).
 */
function sansEtapesAvant(jeu: { trip: Trip; maps: DayMap[] }, index: number): { trip: Trip; maps: DayMap[] } {
  const retirees = new Set([`cv-j${index}-depart-1`, `cv-j${index}-depart-2`]);
  return {
    trip: {
      ...jeu.trip,
      days: jeu.trip.days.map((day) =>
        day.index !== index
          ? day
          : {
              ...day,
              // Avant le `transfer`, ne restent que le départ du logement et le temps libre (ni étape ni trajet à pied).
              items: day.items.filter(
                (item, rang) =>
                  rang >= day.items.findIndex((candidate) => candidate.type === "transfer") || (item.type !== "stop" && item.type !== "segment"),
              ),
            },
      ),
    },
    maps: jeu.maps.map((map) =>
      map.dayIndex !== index ? map : { ...map, points: map.points.filter((point) => !(point.ref.type === "stop" && retirees.has(point.ref.stopId))) },
    ),
  };
}

/** Villes des jeux, réutilisées par les tests (variantes : même ville deux fois, logement déplacé). */
export const VILLES_CARTE = { ROME, FLORENCE, VENISE, PARIS, BERLIN, VERSAILLES, COMPOSTELLE, VILLEFRANCHE, CASTELNUOVO } as const;

/**
 * Jeux de la page `/dev/carte/villes/[jeu]` (fixtures des critères 4 à 10 de 0150) : Rome puis Florence (J3 = changement
 * de ville), Paris puis Berlin (villes éloignées), Paris puis Versailles (villes voisines), trois villes, quatre options
 * dont « Saint-Jacques-de-Compostelle », trois villes aux noms longs, Rome-Florence-Rome (même logement, « 1 et 3 »),
 * Rome puis Florence sans étape avant le `transfer` de J3 (moitié réduite à une position).
 */
export const CARTE_VILLES: Readonly<Record<string, { trip: Trip; maps: DayMap[] }>> = {
  "rome-florence": voyage("rome-florence", [ROME, FLORENCE]),
  "paris-berlin": voyage("paris-berlin", [PARIS, BERLIN]),
  "paris-versailles": voyage("paris-versailles", [PARIS, VERSAILLES]),
  "rome-florence-venise": voyage("rome-florence-venise", [ROME, FLORENCE, VENISE]),
  "rome-compostelle-florence": voyage("rome-compostelle-florence", [ROME, COMPOSTELLE, FLORENCE]),
  "noms-longs": voyage("noms-longs", [COMPOSTELLE, VILLEFRANCHE, CASTELNUOVO]),
  "rome-florence-rome": voyage("rome-florence-rome", [ROME, FLORENCE, ROME]),
  "rome-florence-sans-etape-avant": sansEtapesAvant(voyage("rome-florence-sans-etape-avant", [ROME, FLORENCE]), 3),
};
