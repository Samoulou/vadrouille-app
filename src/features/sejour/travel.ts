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
