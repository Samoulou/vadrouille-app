import type { z } from "zod";

import { DETOUR_THRESHOLD_MINUTES } from "./values";

/**
 * Raffinements nommés des contrats (spécification B2, § 1 « Méthode » ; décision 0037) : chacun est écrit **une
 * fois**, ici seulement, puis appliqué par `.superRefine()` au schéma public et à son schéma de stockage dérivé.
 * Zod 4 refuse `.omit()` et `.pick()` sur un objet raffiné : les dérivations partent donc des bases non raffinées
 * (`TripBaseSchema`, `ProposalBaseSchema`) ou de `StopSchema`, qui n'a aucun raffinement, et réappliquent ces
 * fonctions.
 *
 * Les paramètres sont typés par leur forme minimale (pas d'import de `trip.ts`) : la même fonction sert au schéma
 * complet et au schéma dérivé, dont les types diffèrent.
 */

type Ctx = z.RefinementCtx;

/** `Day.events` ne contient que des étapes de `kind` « event ». */
export function refineEventKind(stop: { kind: string }, ctx: Ctx): void {
  if (stop.kind !== "event") {
    ctx.addIssue({ code: "custom", message: "Day.events ne contient que des étapes de kind « event »", path: ["kind"] });
  }
}

/** Une proposition n'est jamais un engagement (décision 0015 § 9) : `stop.commitment` absent. */
export function refineNoCommitment(proposal: { stop: { commitment?: unknown } }, ctx: Ctx): void {
  if (proposal.stop.commitment !== undefined) {
    ctx.addIssue({
      code: "custom",
      message: "une proposition n'est jamais un engagement (stop.commitment interdit)",
      path: ["stop", "commitment"],
    });
  }
}

/** `detour` obligatoire quand le trajet depuis l'étape précédente dépasse `DETOUR_THRESHOLD_MINUTES`. */
export function refineDetour(
  proposal: { travelFromPrevious?: { minutes: number }; detour?: string },
  ctx: Ctx,
): void {
  const minutes = proposal.travelFromPrevious?.minutes ?? 0;
  if (minutes > DETOUR_THRESHOLD_MINUTES && proposal.detour === undefined) {
    ctx.addIssue({
      code: "custom",
      message: `detour obligatoire quand le trajet dépasse ${DETOUR_THRESHOLD_MINUTES} min`,
      path: ["detour"],
    });
  }
}

interface ChecklistTripShape {
  days: readonly {
    items: readonly ({ type: "stop"; stop: { id: string } } | { type: string })[];
    events: readonly { id: string }[];
  }[];
  checklist: readonly { when: { type: string; day?: number }; stopId?: string }[];
}

/** E4 : un moment `tripDay` ne dépasse pas le nombre de jours du voyage (`days.length`). */
export function refineChecklistDays(trip: ChecklistTripShape, ctx: Ctx): void {
  trip.checklist.forEach((item, index) => {
    if (item.when.type === "tripDay" && item.when.day !== undefined && item.when.day > trip.days.length) {
      ctx.addIssue({
        code: "custom",
        message: "ChecklistItem.when : le jour dépasse la durée du voyage",
        path: ["checklist", index, "when", "day"],
      });
    }
  });
}

/** Identifiants des étapes et événements de tous les jours d'un voyage. */
function stopIds(trip: ChecklistTripShape): Set<string> {
  const ids = new Set<string>();
  for (const day of trip.days) {
    for (const item of day.items) if (item.type === "stop" && "stop" in item) ids.add(item.stop.id);
    for (const event of day.events) ids.add(event.id);
  }
  return ids;
}

/** E9 : `ChecklistItem.stopId` désigne une étape (ou un événement) d'un jour du voyage. */
export function refineChecklistStops(trip: ChecklistTripShape, ctx: Ctx): void {
  const ids = stopIds(trip);
  trip.checklist.forEach((item, index) => {
    if (item.stopId !== undefined && !ids.has(item.stopId)) {
      ctx.addIssue({
        code: "custom",
        message: "ChecklistItem.stopId : aucune étape du voyage ne porte cet identifiant",
        path: ["checklist", index, "stopId"],
      });
    }
  });
}

/**
 * Instantané (décision 0011, point 5) : `exceptions` ne contient jamais `toConfirm`, tiré d'horaires Google et
 * ajouté à la lecture seulement.
 */
export function refineSnapshotExceptions(stop: { exceptions: readonly string[] }, ctx: Ctx): void {
  if (stop.exceptions.includes("toConfirm")) {
    ctx.addIssue({
      code: "custom",
      message: "instantané : exceptions sans toConfirm (calculé à la lecture)",
      path: ["exceptions"],
    });
  }
}
