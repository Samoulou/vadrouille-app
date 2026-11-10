import type { Day, DayLineItem, Stop } from "@/contracts";

/** Minutes depuis minuit d'une heure « HH:MM ». Seule définition pour l'écran « Ajouter un lieu » et l'adaptateur `mock`. */
export const versMinutes = (heure: string): number => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));

/** « HH:MM » depuis des minutes (0 à 1 439). */
export const versHeure = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

/**
 * Pose d'un lieu ajouté, déjà construit, dans une journée (M5d ; décision 0154 § 3, revue de la PR 973, bloquant 1) :
 * fonction pure **unique**, appelée par l'adaptateur `mock` (`poserAjoutSimule`, `src/adapters/mock-lieux.ts`) et par
 * l'écran « Ajouter un lieu » sur `mock` (`apercuSurJourAffiche`, `src/features/sejour/ajouter-lieu.ts`), pour que les
 * deux ne divergent pas. Dans `src/lib` (et non `src/domain`) : `src/domain` n'est atteint hors de `src/server` que par
 * des arêtes décidées (0048 § 1), et cette pose n'est pas une règle du moteur. Elle n'est **pas** le modèle d'`api` :
 * sur `api`, le moteur pose l'étape et l'aperçu du serveur fait foi (addendum 0147, A.7).
 *
 * Un repas (`kind: "meal"`) prend la place du repas pas encore choisi de la même heure ; sinon, l'étape est posée dans le
 * temps libre qui la contient (`start` à `end`), coupé autour d'elle. Sans place : `null`. Aucune durée n'est calculée ici.
 */
export function poserEtapeDansJour(day: Day, stop: Stop): Day | null {
  const debut = versMinutes(stop.start);
  const fin = versMinutes(stop.end ?? stop.start);
  const items: DayLineItem[] = [...day.items];
  const repas = stop.kind === "meal" ? items.findIndex((item) => item.type === "openMeal" && item.time === stop.start) : -1;
  if (repas !== -1) {
    items.splice(repas, 1, { type: "stop", stop });
    return { ...day, items };
  }
  const libre = items.findIndex((item) => item.type === "free" && versMinutes(item.from) <= debut && fin <= versMinutes(item.to));
  const temps = libre === -1 ? undefined : items.at(libre);
  if (temps?.type !== "free") return null;
  items.splice(
    libre,
    1,
    ...(versMinutes(temps.from) < debut ? [{ type: "free" as const, from: temps.from, to: stop.start }] : []),
    { type: "stop", stop },
    ...(fin < versMinutes(temps.to) ? [{ type: "free" as const, from: stop.end ?? stop.start, to: temps.to }] : []),
  );
  return { ...day, items };
}
