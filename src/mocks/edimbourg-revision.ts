import type { Day, DayLineItem, RevisionFixtures, Stop } from "@/contracts";

import { edimbourg } from "./edimbourg";

/**
 * Jeu simulé de révision d'Édimbourg (spécification F7, « Jeu simulé de révision » ; décision 0016 § 6).
 *
 * Phase 0 : aucun moteur ni réserve réelle. Un aperçu vient d'un brouillon précalculé ; une étape sans brouillon
 * reçoit « aucune option compatible ». Contenus entre crochets (règle d'or 2), sources `https://example.org/mock/…`,
 * `placeId` fictifs (préfixe `mock_`). Le voyage débloqué en hérite (même jeu, voir `src/adapters/mock.ts`).
 *
 * F7a : remplacement de « [Dean Village] » (J2). F7b : déplacement de « [Jardin botanique royal] » (J2). F7c y
 * ajoute recherche et ajouts.
 *
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

const j2 = edimbourg.days.find((day) => day.index === 2) as Day;
const j4 = edimbourg.days.find((day) => day.index === 4) as Day;

function stopOf(day: Day, stopId: string): Stop {
  const item = day.items.find((candidate) => candidate.type === "stop" && candidate.stop.id === stopId);
  if (item?.type !== "stop") throw new Error(`étape ${stopId} absente du jour ${day.index}`);
  return item.stop;
}

/** Étape `stop` d'un jour, sous forme de changement `unchanged` (« Ce qui ne bouge pas »), hors `except`. */
function unchangedOf(day: Day, except: string): { type: "unchanged"; label: string; time: string }[] {
  return day.items.flatMap((item) =>
    item.type === "stop" && item.stop.id !== except ? [{ type: "unchanged" as const, label: item.stop.name, time: item.stop.start }] : [],
  );
}

/**
 * Proposition de la réserve pour « [Dean Village] » : identifiant distinct de l'étape remplacée (une étape
 * remplacée n'est pas la même étape, décision 0037 B2-TL-3), « À réserver » (cadrage § 3.4).
 */
export const degustationStockbridge: Stop = {
  id: "j2-degustation-stockbridge",
  kind: "activity",
  placeId: "mock_place_epicerie_stockbridge",
  name: "[Dégustation dans une épicerie fine de Stockbridge]",
  start: "10:55",
  end: "11:50",
  facts: { area: "[Stockbridge]", durationMinutes: 55, costPerPerson: 15 },
  reason: "[Tu as demandé une dégustation : une épicerie fine à deux pas de ton déjeuner]",
  source: { label: "[Site de l'épicerie]", url: "https://example.org/mock/epicerie-stockbridge" },
  exceptions: ["toReserve"],
  locked: false,
};

/** J2 avec la dégustation à la place de Dean Village : 20 → 25 min à pied avant, 15 → 10 min après, +15 CHF. */
function j2AvecDegustation(): Day {
  const deanIndex = j2.items.findIndex((item) => item.type === "stop" && item.stop.id === "j2-dean-village");
  const items = j2.items.map((item, index): DayLineItem => {
    if (index === deanIndex) return { type: "stop", stop: degustationStockbridge };
    if (index === deanIndex - 1) return { type: "segment", segment: { mode: "walk", minutes: 25, estimated: false } };
    if (index === deanIndex + 1) return { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } };
    return item;
  });
  return { ...j2, items, budgetPerPerson: (j2.budgetPerPerson ?? 0) + 15 };
}

// --- Déplacer « [Jardin botanique royal] » (J2, 13:25 – 15:00), F7b ------------------------------------------------

const JARDIN = "j2-jardin-botanique";
const jardin = stopOf(j2, JARDIN);

/**
 * J2 sans le jardin : le temps libre commence à la fin du déjeuner (13:15) ; le trajet à pied de 10 min vers le
 * jardin disparaît (85 → 75 min). Dîner inchangé à 19:00.
 */
function j2SansJardin(): Day {
  const index = j2.items.findIndex((item) => item.type === "stop" && item.stop.id === JARDIN);
  const dejeuner = j2.items[index - 2];
  if (dejeuner?.type !== "stop" || !dejeuner.stop.end) throw new Error("J2 : déjeuner attendu avant le jardin");
  const items = j2.items.flatMap((item, position): DayLineItem[] => {
    if (position === index - 1 || position === index) return [];
    if (position === index + 1 && item.type === "free") return [{ type: "free", from: dejeuner.stop.end ?? item.from, to: item.to }];
    return [item];
  });
  return { ...j2, items, travelMinutes: j2.travelMinutes! - 10 };
}

/** Jardin déplacé au J4, vers 15:45 : 15:45 – 17:15, après « [Arthur's Seat] » (même durée, 1 h 30). */
const jardinJ4: Stop = { ...jardin, start: "15:45", end: "17:15" };

/**
 * J4 avec le jardin après « [Arthur's Seat] » : environ 15 min en transports publics pour y aller, temps libre
 * 17:15 – 18:50, puis environ 10 min en transports publics vers le dîner, inchangé à 19:00 (au lieu de 15 min à
 * pied). Trajets du jour : 80 → 90 min, dans le budget.
 */
function j4AvecJardin(): Day {
  const index = j4.items.findIndex((item) => item.type === "free");
  const free = j4.items[index];
  if (free?.type !== "free" || j4.items[index + 1]?.type !== "segment") throw new Error("J4 : temps libre suivi d'un trajet attendu");
  const items: DayLineItem[] = [
    ...j4.items.slice(0, index),
    { type: "segment", segment: { mode: "transit", minutes: 15, estimated: true } },
    { type: "stop", stop: jardinJ4 },
    { type: "free", from: "17:15", to: "18:50" },
    { type: "segment", segment: { mode: "transit", minutes: 10, estimated: true } },
    ...j4.items.slice(index + 2),
  ];
  return { ...j4, items, travelMinutes: j4.travelMinutes! + 15 - 15 + 10 };
}

const j4Diner = stopOf(j4, "j4-diner");

export const edimbourgRevision: RevisionFixtures = {
  replacements: [
    {
      stopId: "j2-dean-village",
      draft: {
        days: [j2AvecDegustation()],
        changes: [
          { type: "replaced", time: "10:55", before: "[Dean Village]", after: degustationStockbridge.name },
          { type: "segment", label: degustationStockbridge.name, before: 20, after: 25, estimated: false },
          { type: "segment", label: "[Café de Stockbridge]", before: 15, after: 10, estimated: false },
          { type: "budget", deltaPerPerson: 15 },
          { type: "unchanged", label: "[Royal Mile]", time: "09:15" },
          { type: "unchanged", label: "[Café de Stockbridge]", time: "12:05" },
          { type: "unchanged", label: "[Jardin botanique royal]", time: "13:25" },
          { type: "unchanged", label: "[Bonne table de New Town]", time: "19:00" },
        ],
        changedStopIds: [degustationStockbridge.id],
        targetStopId: degustationStockbridge.id,
        proposal: degustationStockbridge,
        fromReserve: true,
      },
    },
  ],
  moves: [
    {
      options: {
        stopId: JARDIN,
        days: [
          { index: 1, points: [{ id: "j1-1615", time: "16:15" }] },
          // Jour d'origine : l'étape n'y a pas d'autre place (« complet »).
          { index: 2, points: [] },
          { index: 3, points: [] },
          { index: 4, points: [{ id: "j4-1545", time: "15:45" }] },
          { index: 5, points: [{ id: "j5-1600", time: "16:00" }] },
          { index: 6, points: [] },
        ],
      },
      // Phase 0 : seul le point du J4 a un brouillon (spécification F7, « Jeu simulé de révision ») ; les points
      // du J1 et du J5 répondent « aucune option compatible ».
      drafts: [
        {
          pointId: "j4-1545",
          draft: {
            days: [j2SansJardin(), j4AvecJardin()],
            changes: [
              { type: "moved", label: jardin.name, before: { day: 2, time: jardin.start }, after: { day: 4, time: jardinJ4.start } },
              { type: "segment", label: jardin.name, before: 10, after: 15, estimated: true },
              { type: "segment", label: j4Diner.name, before: 15, after: 10, estimated: true },
              ...unchangedOf(j2, JARDIN),
              ...unchangedOf(j4, JARDIN),
            ],
            changedStopIds: [JARDIN],
            targetStopId: JARDIN,
          },
        },
      ],
    },
  ],
};
