import type { Day, DayLineItem, Proposal, Segment, Stop, SurpriseIdea, Trip } from "@/contracts";

/**
 * Voyage simulé à Édimbourg (spécification F1).
 *
 * Voyage de référence du cadrage § 2 : du samedi 29 août au jeudi 3 septembre
 * 2026, arrivée à midi le J1, Tattoo le samedi à 21:30, une journée
 * d'excursion dans les Highlands, une distillerie accessible en transports
 * publics.
 *
 * Les maquettes ne sont pas encore exportées dans `docs/ux/maquettes/` (Q12) :
 * tout contenu non vérifié est écrit entre crochets (handover § 0, règle 2).
 * Aucun appel à Google n'a servi à construire ce jeu : les `placeId` sont
 * fictifs (préfixe `mock_`), sans note, horaire d'ouverture, photo ni
 * coordonnée. Les montants sont des nombres, formatés par l'interface.
 *
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

export const MOCK_ORGANIZATION_ID = "mock_org_personnelle";
export const EDIMBOURG_TRIP_ID = "mock_trip_edimbourg";

/**
 * Budget de trajet du rythme « équilibré » (environ 1 h 30 par jour, cadrage
 * § 3.7). Valeur simulée en attendant le calibrage (Q8) : l'interface la lit
 * dans `Day.travelBudgetMinutes`, jamais en dur.
 */
const SIMULATED_TRAVEL_BUDGET_MINUTES = 90;

// --- Aides de construction -------------------------------------------------

const segment = (mode: Segment["mode"], minutes: number, estimated = false): DayLineItem => ({
  type: "segment",
  segment: { mode, minutes, estimated },
});
const walk = (minutes: number) => segment("walk", minutes);
const free = (from: string, to: string): DayLineItem => ({ type: "free", from, to });
const at = (stop: Stop): DayLineItem => ({ type: "stop", stop });
const startAt = (time: string, label: string): DayLineItem => ({
  type: "terminus",
  role: "start",
  time,
  label,
});
const endAt = (time: string, label: string): DayLineItem => ({
  type: "terminus",
  role: "end",
  time,
  label,
});

const HOTEL = "[Hôtel, Old Town]";

// --- Étapes ----------------------------------------------------------------

// J1 — samedi 29 août : arrivée à midi, château, Tattoo à 21:30.
const j1Dejeuner: Stop = {
  id: "j1-dejeuner",
  kind: "meal",
  placeId: "mock_place_grassmarket_dejeuner",
  name: "[Petite adresse du Grassmarket]",
  start: "12:45",
  end: "13:45",
  meta: "[Grassmarket, cuisine écossaise, 1 h]",
  reason: "[Tu as demandé des adresses simples le midi]",
  exceptions: [],
  locked: false,
};
const j1Chateau: Stop = {
  id: "j1-chateau",
  kind: "activity",
  placeId: "mock_place_chateau",
  name: "[Château d'Édimbourg]",
  start: "14:00",
  end: "16:00",
  meta: "[Old Town, 2 h, billet]",
  reason: "[Tu as choisi l'histoire : le site le plus ancien de la ville]",
  exceptions: ["toReserve"],
  locked: false,
};
const j1Diner: Stop = {
  id: "j1-diner",
  kind: "meal",
  placeId: "mock_place_old_town_diner",
  name: "[Bonne table de l'Old Town]",
  start: "18:45",
  end: "20:15",
  meta: "[Old Town, cuisine écossaise moderne, 1 h 30]",
  reason: "[Tu as choisi une bonne table avant le Tattoo, à 15 min à pied]",
  exceptions: ["toReserve"],
  locked: false,
};
const j1DinerOption2: Stop = {
  id: "j1-diner-option-2",
  kind: "meal",
  placeId: "mock_place_old_town_diner_2",
  name: "[Bistrot de Victoria Street]",
  start: "18:45",
  end: "20:15",
  meta: "[Old Town, bistrot, 1 h 30]",
  reason: "[Tu as choisi une bonne table avant le Tattoo, à 10 min à pied]",
  exceptions: ["toReserve"],
  locked: false,
};
const j1Tattoo: Stop = {
  id: "j1-tattoo",
  kind: "event",
  placeId: "mock_place_esplanade",
  name: "[Royal Edinburgh Military Tattoo]",
  start: "21:30",
  end: "23:00",
  meta: "[Esplanade du château, 1 h 30, billets réservés]",
  reason: "[Ton engagement : billets déjà réservés pour le samedi]",
  source: { label: "[Site officiel du Tattoo]", url: "https://example.org/mock/tattoo" },
  verifiedAt: "2026-08-20",
  exceptions: [],
  locked: true,
  /** Engagement saisi par la personne (décision 0015 § 9) : billets déjà pris (« À faire avant de partir »). */
  commitment: "ticket",
};

// J2 — dimanche 30 août : Old Town, Dean Village, Stockbridge.
const j2RoyalMile: Stop = {
  id: "j2-royal-mile",
  kind: "activity",
  placeId: "mock_place_royal_mile",
  name: "[Royal Mile]",
  start: "09:15",
  end: "10:30",
  meta: "[Old Town, 1 h 15, gratuit]",
  reason: "[Tu as choisi la flânerie dans les vieux quartiers]",
  exceptions: [],
  locked: false,
};
const j2DeanVillage: Stop = {
  id: "j2-dean-village",
  kind: "activity",
  placeId: "mock_place_dean_village",
  name: "[Dean Village]",
  start: "10:50",
  end: "11:50",
  meta: "[Water of Leith, 1 h, gratuit]",
  reason: "[Tu as choisi les balades : un village au bord de l'eau en pleine ville]",
  exceptions: [],
  locked: false,
};
const j2Dejeuner: Stop = {
  id: "j2-dejeuner",
  kind: "meal",
  name: "[Café de Stockbridge]",
  start: "12:05",
  end: "13:15",
  meta: "[Stockbridge, brunch, 1 h]",
  reason: "[Tu as demandé des adresses simples le midi]",
  exceptions: [],
  locked: false,
};
const j2Jardin: Stop = {
  id: "j2-jardin-botanique",
  kind: "activity",
  placeId: "mock_place_jardin_botanique",
  name: "[Jardin botanique royal]",
  start: "13:25",
  end: "15:00",
  meta: "[Inverleith, 1 h 30, gratuit]",
  reason: "[Tu as choisi les parcs et jardins]",
  exceptions: [],
  locked: false,
};
const j2Diner: Stop = {
  id: "j2-diner",
  kind: "meal",
  name: "[Bonne table de New Town]",
  start: "19:00",
  end: "20:30",
  meta: "[New Town, fruits de mer, 1 h 30]",
  reason: "[Tu as choisi une bonne table le dimanche soir]",
  exceptions: ["toReserve"],
  locked: false,
};
const j2Concert: Stop = {
  id: "j2-concert-orgue",
  kind: "event",
  name: "[Concert d'orgue à St Giles]",
  start: "18:00",
  end: "19:00",
  meta: "[Old Town, 1 h]",
  reason: "[Tu as choisi la musique]",
  exceptions: ["unconfirmed"],
  locked: false,
};

// J3 — lundi 31 août : excursion dans les Highlands.
const j3Excursion: Stop = {
  id: "j3-excursion-highlands",
  kind: "activity",
  name: "[Excursion guidée dans les Highlands]",
  start: "08:00",
  end: "20:00",
  meta: "[Journée entière en car, Glencoe et Loch Ness]",
  reason: "[Tu as demandé une journée dans les Highlands]",
  exceptions: ["toReserve"],
  locked: false,
};
const j3Diner: Stop = {
  id: "j3-diner",
  kind: "meal",
  name: "[Pub du Grassmarket]",
  start: "20:30",
  end: "21:30",
  meta: "[Grassmarket, pub, 1 h]",
  reason: "[Près de l'arrivée du car, pour une soirée simple]",
  exceptions: [],
  locked: false,
};

// J4 — mardi 1er septembre : Calton Hill, Holyrood, Arthur's Seat.
const j4CaltonHill: Stop = {
  id: "j4-calton-hill",
  kind: "activity",
  placeId: "mock_place_calton_hill",
  name: "[Calton Hill]",
  start: "09:15",
  end: "10:15",
  meta: "[New Town, 1 h, gratuit]",
  reason: "[Tu as choisi les points de vue]",
  exceptions: [],
  locked: false,
};
const j4Holyrood: Stop = {
  id: "j4-holyrood",
  kind: "activity",
  placeId: "mock_place_holyrood",
  name: "[Palais de Holyrood]",
  start: "10:35",
  end: "12:00",
  meta: "[Holyrood, 1 h 30, billet]",
  reason: "[Tu as choisi l'histoire]",
  exceptions: ["toConfirm"],
  locked: false,
};
const j4Dejeuner: Stop = {
  id: "j4-dejeuner",
  kind: "meal",
  name: "[Café de Canongate]",
  start: "12:10",
  end: "13:10",
  meta: "[Canongate, soupes et sandwichs, 1 h]",
  reason: "[Sur ton chemin entre Holyrood et Arthur's Seat]",
  exceptions: [],
  locked: false,
};
const j4ArthursSeat: Stop = {
  id: "j4-arthurs-seat",
  kind: "activity",
  placeId: "mock_place_arthurs_seat",
  name: "[Arthur's Seat]",
  start: "13:20",
  end: "15:30",
  meta: "[Holyrood Park, 2 h, gratuit]",
  reason: "[Tu as choisi les balades : le point de vue le plus connu de la ville]",
  exceptions: [],
  locked: false,
};
const j4Diner: Stop = {
  id: "j4-diner",
  kind: "meal",
  name: "[Petite adresse de l'Old Town]",
  start: "19:00",
  end: "20:15",
  meta: "[Old Town, cuisine végétarienne, 1 h 15]",
  reason: "[Tu as demandé des adresses simples en semaine]",
  exceptions: [],
  locked: false,
};
const j4Marche: Stop = {
  id: "j4-marche-leith",
  kind: "event",
  name: "[Marché nocturne de Leith]",
  start: "17:00",
  end: "21:00",
  meta: "[Leith, 4 h]",
  reason: "[Tu as choisi les marchés]",
  exceptions: ["unconfirmed"],
  locked: false,
};

// J5 — mercredi 2 septembre : musée et distillerie en transports publics.
const j5Musee: Stop = {
  id: "j5-musee-national",
  kind: "activity",
  placeId: "mock_place_musee_national",
  name: "[Musée national d'Écosse]",
  start: "09:45",
  end: "11:30",
  meta: "[Old Town, 1 h 45, gratuit]",
  reason: "[Tu as choisi l'histoire]",
  exceptions: [],
  locked: false,
};
const j5Dejeuner: Stop = {
  id: "j5-dejeuner",
  kind: "meal",
  name: "[Petite adresse de Chambers Street]",
  start: "11:40",
  end: "12:30",
  meta: "[Old Town, cuisine écossaise, 50 min]",
  reason: "[Avant le bus pour la distillerie]",
  exceptions: [],
  locked: false,
};
const j5Distillerie: Stop = {
  id: "j5-distillerie",
  kind: "activity",
  placeId: "mock_place_distillerie",
  name: "[Distillerie accessible en bus]",
  start: "13:30",
  end: "15:00",
  meta: "[East Lothian, 1 h 30, dégustation]",
  reason: "[Tu as demandé une distillerie sans voiture]",
  source: { label: "[Site de la distillerie]", url: "https://example.org/mock/distillerie" },
  verifiedAt: "2026-08-15",
  exceptions: ["toReserve", "toConfirm"],
  locked: false,
};
const j5Diner: Stop = {
  id: "j5-diner",
  kind: "meal",
  name: "[Occasion spéciale à Leith]",
  start: "19:00",
  end: "21:00",
  meta: "[Leith, menu dégustation, 2 h]",
  reason: "[Tu as demandé une occasion spéciale pour l'avant-dernier soir]",
  exceptions: ["toReserve"],
  locked: false,
};

// J6 — jeudi 3 septembre : galerie, brunch, départ.
const j6Galerie: Stop = {
  id: "j6-galerie-nationale",
  kind: "activity",
  placeId: "mock_place_galerie_nationale",
  name: "[Galerie nationale d'Écosse]",
  start: "09:15",
  end: "11:00",
  meta: "[Princes Street, 1 h 45, gratuit]",
  reason: "[Tu as choisi la peinture]",
  exceptions: [],
  locked: false,
};
const j6Brunch: Stop = {
  id: "j6-brunch",
  kind: "meal",
  name: "[Brunch de New Town]",
  start: "11:15",
  end: "12:15",
  meta: "[New Town, brunch, 1 h]",
  reason: "[Près de la gare avant le départ]",
  exceptions: [],
  locked: false,
};

// --- Idées « Surprends-moi » (décision 0015 § 3) ------------------------------

// Hors programme, avec justification et source (simulées, entre crochets).
const j2Surprise: SurpriseIdea = {
  id: "j2-surprise-circus-lane",
  placeId: "mock_place_circus_lane",
  name: "[Circus Lane]",
  meta: "[Stockbridge, 20 min, gratuit]",
  reason: "[Tu as choisi les balades : une ruelle fleurie à deux pas de ton déjeuner]",
  source: { label: "[Office du tourisme d'Édimbourg]", url: "https://example.org/mock/circus-lane" },
  verifiedAt: "2026-08-18",
};
const j4Surprise: SurpriseIdea = {
  id: "j4-surprise-dunbars-close",
  placeId: "mock_place_dunbars_close",
  name: "[Jardin de Dunbar's Close]",
  meta: "[Canongate, 20 min, gratuit]",
  reason: "[Tu as choisi les parcs et jardins : un jardin caché sur ton chemin vers Holyrood]",
  source: { label: "[Site du jardin]", url: "https://example.org/mock/dunbars-close" },
};

// --- Jours -----------------------------------------------------------------

const days: Day[] = [
  {
    index: 1,
    date: "2026-08-29",
    weekday: "sam.",
    title: "Samedi 29 août",
    items: [
      startAt("12:00", "[Arrivée, aéroport d'Édimbourg]"),
      segment("car", 35, true),
      at(j1Dejeuner),
      walk(15),
      at(j1Chateau),
      free("16:00", "18:30"),
      walk(10),
      at(j1Diner),
      walk(15),
      free("20:30", "21:15"),
      at(j1Tattoo),
      walk(15),
      endAt("23:15", HOTEL),
    ],
    budgetPerPerson: 120,
    events: [],
    generating: false,
    travelMinutes: 90,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
  {
    index: 2,
    date: "2026-08-30",
    weekday: "dim.",
    title: "Dimanche 30 août",
    items: [
      startAt("09:00", HOTEL),
      walk(10),
      at(j2RoyalMile),
      walk(20),
      at(j2DeanVillage),
      walk(15),
      at(j2Dejeuner),
      walk(10),
      at(j2Jardin),
      free("15:00", "18:30"),
      segment("transit", 20, true),
      at(j2Diner),
      walk(10),
      endAt("20:45", HOTEL),
    ],
    budgetPerPerson: 95,
    events: [j2Concert],
    surprise: j2Surprise,
    generating: false,
    travelMinutes: 85,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
  {
    index: 3,
    date: "2026-08-31",
    weekday: "lun.",
    title: "Lundi 31 août",
    items: [
      startAt("07:30", HOTEL),
      walk(15),
      at(j3Excursion),
      walk(15),
      at(j3Diner),
      walk(10),
      endAt("21:45", HOTEL),
    ],
    budgetPerPerson: 160,
    events: [],
    generating: false,
    travelMinutes: 40,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
  {
    index: 4,
    date: "2026-09-01",
    weekday: "mar.",
    title: "Mardi 1er septembre",
    items: [
      startAt("09:00", HOTEL),
      walk(15),
      at(j4CaltonHill),
      walk(20),
      at(j4Holyrood),
      walk(10),
      at(j4Dejeuner),
      walk(10),
      at(j4ArthursSeat),
      free("15:30", "18:45"),
      walk(15),
      at(j4Diner),
      walk(10),
      endAt("20:30", HOTEL),
    ],
    budgetPerPerson: 70,
    events: [j4Marche],
    surprise: j4Surprise,
    generating: false,
    travelMinutes: 80,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
  {
    index: 5,
    date: "2026-09-02",
    weekday: "mer.",
    title: "Mercredi 2 septembre",
    items: [
      startAt("09:30", HOTEL),
      walk(15),
      at(j5Musee),
      walk(10),
      at(j5Dejeuner),
      segment("transit", 50, true),
      at(j5Distillerie),
      segment("transit", 50, true),
      free("15:50", "18:30"),
      segment("transit", 20),
      at(j5Diner),
      segment("transit", 20),
      endAt("21:20", HOTEL),
    ],
    budgetPerPerson: 150,
    events: [],
    generating: false,
    // Dépasse volontairement le budget : la distillerie justifie le trajet
    // (écran 12, StatusBanner « temps de trajet au-delà du rythme »).
    travelMinutes: 165,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
  {
    index: 6,
    date: "2026-09-03",
    weekday: "jeu.",
    title: "Jeudi 3 septembre",
    items: [
      startAt("09:00", HOTEL),
      walk(15),
      at(j6Galerie),
      walk(15),
      at(j6Brunch),
      free("12:15", "13:15"),
      segment("car", 35, true),
      endAt("13:50", "[Départ, aéroport d'Édimbourg]"),
    ],
    budgetPerPerson: 45,
    events: [],
    generating: false,
    travelMinutes: 65,
    travelBudgetMinutes: SIMULATED_TRAVEL_BUDGET_MINUTES,
  },
];

// --- Voyage ----------------------------------------------------------------

export const edimbourg: Trip = {
  id: EDIMBOURG_TRIP_ID,
  organizationId: MOCK_ORGANIZATION_ID,
  destination: "Édimbourg",
  // Couleur de destination à aligner sur les maquettes (Q12).
  destinationColor: "bruyere",
  start: "2026-08-29",
  end: "2026-09-03",
  travellers: { adults: 2, children: 0 },
  days,
  checklist: [
    {
      id: "check-tattoo",
      label: "[Billets du Tattoo]",
      when: "[Déjà réservé]",
      done: true,
      sponsored: false,
    },
    {
      id: "check-excursion",
      label: "[Excursion dans les Highlands]",
      when: "[Au plus tôt]",
      done: false,
      bookingUrl: "https://example.org/mock/excursion",
      sponsored: false,
    },
    {
      id: "check-chateau",
      label: "[Château d'Édimbourg]",
      when: "[Une semaine avant]",
      done: false,
      bookingUrl: "https://example.org/mock/chateau",
      sponsored: false,
    },
    {
      id: "check-distillerie",
      label: "[Visite de la distillerie]",
      when: "[Une semaine avant]",
      done: false,
      bookingUrl: "https://example.org/mock/distillerie",
      sponsored: false,
    },
    {
      id: "check-assurance",
      label: "[Assurance voyage]",
      when: "[Avant le départ]",
      done: false,
      bookingUrl: "https://example.org/mock/assurance",
      sponsored: true,
    },
  ],
  unlocked: false,
};

// --- Propositions (« Tes premières propositions », 8 cartes, D11) ----------

export const propositions: Proposal[] = [
  {
    id: "prop-j1-chateau",
    kind: "activity",
    day: 1,
    weekday: "sam.",
    time: j1Chateau.start,
    context: "[Après ton déjeuner au Grassmarket]",
    stop: j1Chateau,
    category: "museum",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
  {
    id: "prop-j1-diner-1",
    kind: "meal",
    day: 1,
    weekday: "sam.",
    time: j1Diner.start,
    context: "[Avant le Tattoo]",
    stop: j1Diner,
    category: "restaurant",
    option: { index: 1, total: 2 },
    travelFromPrevious: { mode: "walk", minutes: 10, estimated: false },
  },
  {
    id: "prop-j1-diner-2",
    kind: "meal",
    day: 1,
    weekday: "sam.",
    time: j1DinerOption2.start,
    context: "[Avant le Tattoo]",
    stop: j1DinerOption2,
    category: "restaurant",
    option: { index: 2, total: 2 },
    travelFromPrevious: { mode: "walk", minutes: 10, estimated: false },
  },
  {
    id: "prop-j2-dean-village",
    kind: "activity",
    day: 2,
    weekday: "dim.",
    time: j2DeanVillage.start,
    context: "[Entre le Royal Mile et ton déjeuner]",
    stop: j2DeanVillage,
    category: "walk",
    travelFromPrevious: { mode: "walk", minutes: 20, estimated: false },
  },
  {
    id: "prop-j2-jardin-botanique",
    kind: "activity",
    day: 2,
    weekday: "dim.",
    time: j2Jardin.start,
    context: "[Après ton déjeuner à Stockbridge]",
    stop: j2Jardin,
    category: "nature",
    travelFromPrevious: { mode: "walk", minutes: 10, estimated: false },
  },
  {
    id: "prop-j4-arthurs-seat",
    kind: "activity",
    day: 4,
    weekday: "mar.",
    time: j4ArthursSeat.start,
    context: "[Entre ton déjeuner et ton temps libre]",
    stop: j4ArthursSeat,
    category: "nature",
    travelFromPrevious: { mode: "walk", minutes: 10, estimated: false },
  },
  {
    id: "prop-j5-musee-national",
    kind: "activity",
    day: 5,
    weekday: "mer.",
    time: j5Musee.start,
    context: "[Avant ton déjeuner]",
    stop: j5Musee,
    category: "museum",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
  {
    id: "prop-j5-distillerie",
    kind: "activity",
    day: 5,
    weekday: "mer.",
    time: j5Distillerie.start,
    context: "[Entre ton déjeuner et ton temps libre]",
    stop: j5Distillerie,
    category: "tasting",
    travelFromPrevious: { mode: "transit", minutes: 50, estimated: true },
    detour: "[La distillerie la plus proche accessible sans voiture]",
  },
];

// --- Voyage débloqué (écran 6b, décision 0013 § 3.6) -----------------------

export const EDIMBOURG_DEBLOQUE_TRIP_ID = "mock_trip_edimbourg_debloque";

/**
 * Même voyage, débloqué, dérivé du premier (pas de copie) : le J6 est encore en préparation
 * (`generating: true`) et n'a aucune proposition. Sert l'écran 6b « Suite du tri ».
 */
export const edimbourgDebloque: Trip = {
  ...edimbourg,
  id: EDIMBOURG_DEBLOQUE_TRIP_ID,
  unlocked: true,
  days: edimbourg.days.map((day) => (day.index === 6 ? { ...day, generating: true } : day)),
};

// Options 2 et 3 du dîner du J3, hors programme (un créneau de repas à 3 options).
const j3DinerOption2: Stop = {
  id: "j3-diner-option-2",
  kind: "meal",
  placeId: "mock_place_grassmarket_diner_2",
  name: "[Brasserie du Grassmarket]",
  start: "20:30",
  end: "21:30",
  meta: "[Grassmarket, brasserie, 1 h]",
  reason: "[Près de l'arrivée du car, à 5 min à pied]",
  exceptions: [],
  locked: false,
};
const j3DinerOption3: Stop = {
  id: "j3-diner-option-3",
  kind: "meal",
  placeId: "mock_place_cowgate_diner",
  name: "[Petite adresse de Cowgate]",
  start: "20:30",
  end: "21:30",
  meta: "[Cowgate, cuisine écossaise, 1 h]",
  reason: "[Près de l'arrivée du car, à 10 min à pied]",
  exceptions: ["toConfirm"],
  locked: false,
};

const j3DinerOptions: Proposal[] = [j3Diner, j3DinerOption2, j3DinerOption3].map((stop, i) => ({
  id: `prop-j3-diner-${i + 1}`,
  kind: "meal",
  day: 3,
  weekday: "lun.",
  time: stop.start,
  context: "[Après le retour du car]",
  stop,
  category: "restaurant",
  option: { index: i + 1, total: 3 },
  travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
}));

/**
 * Propositions de la suite du tri : 7 cartes des jours 3 et 4, hors aperçu (Arthur's Seat, déjà
 * présenté, n'y figure pas), dont un dîner à 3 options et deux activités `nature`.
 */
export const propositionsDebloque: Proposal[] = [
  {
    id: "prop-j3-excursion-highlands",
    kind: "activity",
    day: 3,
    weekday: "lun.",
    time: j3Excursion.start,
    context: "[Ta journée dans les Highlands]",
    stop: j3Excursion,
    category: "nature",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
  ...j3DinerOptions,
  {
    id: "prop-j4-calton-hill",
    kind: "activity",
    day: 4,
    weekday: "mar.",
    time: j4CaltonHill.start,
    context: "[Pour commencer la journée]",
    stop: j4CaltonHill,
    category: "nature",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
  {
    id: "prop-j4-holyrood",
    kind: "activity",
    day: 4,
    weekday: "mar.",
    time: j4Holyrood.start,
    context: "[Entre Calton Hill et ton déjeuner]",
    stop: j4Holyrood,
    category: "museum",
    travelFromPrevious: { mode: "walk", minutes: 20, estimated: false },
  },
  {
    id: "prop-j4-diner",
    kind: "meal",
    day: 4,
    weekday: "mar.",
    time: j4Diner.start,
    context: "[Après ton temps libre]",
    stop: j4Diner,
    category: "restaurant",
    travelFromPrevious: { mode: "walk", minutes: 15, estimated: false },
  },
];
