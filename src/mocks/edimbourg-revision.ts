import type { Day, DayLineItem, RevisionFixtures, Stop } from "@/contracts";

import { edimbourg } from "./edimbourg";

/**
 * Jeu simulé de révision d'Édimbourg (spécification F7, « Jeu simulé de révision » ; décision 0016 § 6).
 *
 * Phase 0 : aucun moteur ni réserve réelle. Un aperçu vient d'un brouillon précalculé ; une étape sans brouillon
 * reçoit « aucune option compatible ». Contenus entre crochets (règle d'or 2), sources `https://example.org/mock/…`,
 * `placeId` fictifs (préfixe `mock_`). Le voyage débloqué en hérite (même jeu, voir `src/adapters/mock.ts`).
 *
 * F7a : remplacement de « [Dean Village] » (J2). F7b et F7c y ajoutent déplacements, recherche et ajouts.
 *
 * Ce module ne s'importe que depuis `src/adapters` et les tests (règle ESLint).
 */

const j2 = edimbourg.days.find((day) => day.index === 2) as Day;

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
};
