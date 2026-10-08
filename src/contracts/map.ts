import { z } from "zod";

import type { Day } from "./trip";

/**
 * Positions d'une journée pour la carte (spécification F4, proposition F4-TL-1).
 *
 * Contrat séparé de `Stop` : F1 refuse toute coordonnée dans `Stop` pour qu'on n'y
 * glisse pas de contenus Google. Les positions vivent ici, sont chargées à la demande
 * pour l'affichage et ne sont jamais persistées côté client (handover § 8).
 * Objets stricts : un champ inconnu (`name`, `rating`, `photos`…) est refusé.
 */

export const MapPointRefSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("stop"), stopId: z.string().min(1) }),
  z.strictObject({ type: z.literal("terminus"), role: z.enum(["start", "end"]) }),
]);
export type MapPointRef = z.infer<typeof MapPointRefSchema>;

export const MapPointSchema = z.strictObject({
  ref: MapPointRefSchema,
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
export type MapPoint = z.infer<typeof MapPointSchema>;

/** Clé unique d'une référence : « stop:<id> » ou « terminus:<role> ». */
export function mapPointKey(ref: MapPointRef): string {
  return ref.type === "stop" ? `stop:${ref.stopId}` : `terminus:${ref.role}`;
}

export const DayMapSchema = z
  .strictObject({
    tripId: z.string().min(1),
    /** 1 = J1, comme `Day.index`. */
    dayIndex: z.number().int().positive(),
    points: z.array(MapPointSchema),
  })
  .superRefine((map, ctx) => {
    const seen = new Set<string>();
    map.points.forEach((point, index) => {
      const key = mapPointKey(point.ref);
      if (seen.has(key)) {
        ctx.addIssue({ code: "custom", message: `deux points pour la même référence (${key})`, path: ["points", index, "ref"] });
      }
      seen.add(key);
    });
  });
export type DayMap = z.infer<typeof DayMapSchema>;

/**
 * Vérifie ce que le schéma seul ne peut pas vérifier : `tripId` et `dayIndex`
 * correspondent au jour, et chaque `stopId` désigne un élément `type: "stop"`
 * de `day.items`. Renvoie la liste des problèmes (vide si tout concorde).
 * `Day` ne porte pas l'identifiant du voyage : l'appelant le fournit.
 */
export function validateDayMap(day: Day, map: DayMap, tripId: string): string[] {
  const issues: string[] = [];
  if (map.tripId !== tripId) {
    issues.push(`tripId « ${map.tripId} » différent du voyage « ${tripId} »`);
  }
  if (map.dayIndex !== day.index) {
    issues.push(`dayIndex ${map.dayIndex} différent du jour ${day.index}`);
  }
  const stopIds = new Set(day.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])));
  for (const point of map.points) {
    if (point.ref.type === "stop" && !stopIds.has(point.ref.stopId)) {
      issues.push(`stopId « ${point.ref.stopId} » absent des étapes du jour ${day.index}`);
    }
  }
  return issues;
}
