import type { Day, DayLineItem, Segment, Stop } from "@/contracts";
import { segmentLabel } from "@/components/ligne/DayLine";
import { format, messages } from "@/i18n";
import { formatDuree } from "@/lib/duree";

/**
 * Fonctions pures de la Journée (spécification F5, F5-PO-5, F5-PO-6) : seuil du budget de trajet,
 * plus long trajet vers une étape, ligne trajet et budget. Les valeurs viennent toujours des données
 * (Q8) ; les textes sont composés ici depuis fr.json, jamais stockés dans les données.
 */

const t = messages.sejour.journee;

/** Montant en francs, formaté par l'interface (handover § 9). */
export function formatMontant(amount: number): string {
  return new Intl.NumberFormat("fr-CH").format(amount);
}

/** Dépassement strict : `travelMinutes` > `travelBudgetMinutes` (égalité : pas de bandeau). */
export function isOverTravelBudget(day: Pick<Day, "travelMinutes" | "travelBudgetMinutes">): boolean {
  return day.travelMinutes > day.travelBudgetMinutes;
}

/**
 * Plus long segment immédiatement suivi d'une étape (`type: "stop"`), avec cette étape ; à égalité,
 * le premier. `null` sans segment suivi d'une étape.
 */
export function longestSegmentToStop(items: readonly DayLineItem[]): { segment: Segment; stop: Stop } | null {
  let best: { segment: Segment; stop: Stop } | null = null;
  for (let index = 0; index < items.length - 1; index += 1) {
    const item = items[index];
    const next = items[index + 1];
    if (item?.type !== "segment" || next?.type !== "stop") continue;
    if (!best || item.segment.minutes > best.segment.minutes) {
      best = { segment: item.segment, stop: next.stop };
    }
  }
  return best;
}

/**
 * Texte du bandeau de trajet (F5-PO-6, provisoire UX/UI), ou `null` sans dépassement :
 * « {trajet} de trajet ce jour, au-delà des {budget} prévues pour ton rythme. Le plus long : {segment}, vers {nom}. »
 */
export function travelBannerMessage(day: Day): string | null {
  if (!isOverTravelBudget(day)) return null;
  const first = format(t.bandeauTrajet, {
    trajet: formatDuree(day.travelMinutes),
    budget: formatDuree(day.travelBudgetMinutes),
  });
  const longest = longestSegmentToStop(day.items);
  if (!longest) return first;
  return `${first} ${format(t.bandeauPlusLong, { segment: segmentLabel(longest.segment), name: longest.stop.name })}`;
}

/** Ligne sous le titre du jour : « 1 h 25 de trajet · environ 95 CHF par personne » (budget s'il est défini). */
export function dayTravelLine(day: Pick<Day, "travelMinutes" | "budgetPerPerson">): string {
  const duree = formatDuree(day.travelMinutes);
  return day.budgetPerPerson === undefined
    ? format(t.trajet, { duree })
    : format(t.trajetBudget, { duree, montant: formatMontant(day.budgetPerPerson) });
}

/**
 * « Pour y aller » d'une étape de `items` (F5-PO-9) : le segment le plus proche avant l'étape, sans autre
 * étape entre eux, et son origine, l'étape ou le terminus qui précède ce segment (un temps libre ou un
 * créneau de repas pas encore choisi n'en est pas une, décision 0015 § 2). `null` si l'étape n'est pas
 * dans `items` (événement de `Day.events`) ou n'a pas de segment avant elle.
 */
export function pathTo(items: readonly DayLineItem[], stopId: string): { segment: Segment; origin?: string } | null {
  const index = items.findIndex((item) => item.type === "stop" && item.stop.id === stopId);
  if (index < 0) return null;
  let segmentIndex = -1;
  for (let i = index - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.type === "segment") {
      segmentIndex = i;
      break;
    }
    if (item?.type === "stop" || item?.type === "terminus") return null;
  }
  const found = items[segmentIndex];
  if (found?.type !== "segment") return null;
  for (let i = segmentIndex - 1; i >= 0; i -= 1) {
    const item = items[i];
    if (item?.type === "stop") return { segment: found.segment, origin: item.stop.name };
    if (item?.type === "terminus") return { segment: found.segment, origin: item.label };
  }
  return { segment: found.segment };
}

/** Texte de « Pour y aller » : « À pied, 20 min depuis [Royal Mile] », ou le segment seul sans origine. */
export function pathToLabel(path: { segment: Segment; origin?: string }): string {
  const segment = segmentLabel(path.segment);
  return path.origin === undefined
    ? segment
    : format(messages.sejour.fiche.pourYAllerDepuis, { segment, origin: path.origin });
}
