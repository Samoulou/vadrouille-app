// @vitest-environment node
import { describe, expect, it } from "vitest";

import { boundsOf, buildOverview } from "@/components/carte";
import type { DayMap, MapPoint } from "@/contracts";

/**
 * M4c, critère 18 (spécification M4 § 7.8) : la vue d'ensemble d'un voyage à plusieurs villes cadre toutes les étapes et
 * tous les logements de toutes les villes. `buildOverview` réunit déjà les points de toutes les cartes du voyage : le
 * cadrage est donc satisfait sans toucher à `src/components/carte/` (hors du périmètre de M4c ; carte à plusieurs villes :
 * décision 0150, M4-suite-carte). Coordonnées fictives (jamais de donnée Google dans le dépôt).
 */
const etape = (stopId: string, lat: number, lng: number): MapPoint => ({ ref: { type: "stop", stopId }, lat, lng });
const terminus = (role: "start" | "end", lat: number, lng: number): MapPoint => ({ ref: { type: "terminus", role }, lat, lng });

const ROME = { lat: 41.9, lng: 12.5 };
const FLORENCE = { lat: 43.77, lng: 11.25 };

const cartes: DayMap[] = [
  { tripId: "t", dayIndex: 1, points: [terminus("start", ROME.lat, ROME.lng), etape("r1", 41.89, 12.49), terminus("end", ROME.lat, ROME.lng)] },
  { tripId: "t", dayIndex: 2, points: [terminus("start", ROME.lat, ROME.lng), etape("r2", 41.91, 12.45), terminus("end", ROME.lat, ROME.lng)] },
  // Journée de changement de ville : départ du logement de Rome, arrivée au logement de Florence.
  { tripId: "t", dayIndex: 3, points: [terminus("start", ROME.lat, ROME.lng), etape("f1", 43.77, 11.26), terminus("end", FLORENCE.lat, FLORENCE.lng)] },
  { tripId: "t", dayIndex: 4, points: [terminus("start", FLORENCE.lat, FLORENCE.lng), etape("f2", 43.76, 11.24), terminus("end", FLORENCE.lat, FLORENCE.lng)] },
];

describe("Vue d'ensemble : plusieurs villes", () => {
  it("contient toutes les étapes et les logements des deux villes, une seule fois chacun", () => {
    const anneaux = buildOverview(cartes);
    expect(anneaux).toHaveLength(2 + 4);
    expect(anneaux).toContainEqual(ROME);
    expect(anneaux).toContainEqual(FLORENCE);
  });

  it("le cadrage couvre Rome et Florence", () => {
    const cadre = boundsOf(buildOverview(cartes));
    expect(cadre).not.toBeNull();
    expect(cadre?.south).toBeLessThanOrEqual(41.89);
    expect(cadre?.north).toBeGreaterThanOrEqual(43.77);
    expect(cadre?.west).toBeLessThanOrEqual(11.24);
    expect(cadre?.east).toBeGreaterThanOrEqual(12.5);
  });
});
