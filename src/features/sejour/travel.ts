import type { Day, DayLineItem, Segment, Stop } from "@/contracts";
import { segmentLabel } from "@/components/ligne/DayLine";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { formatDuree } from "@/lib/duree";
import { formatNombre } from "@/lib/nombre";

/**
 * Fonctions pures de la Journée (spécification F5, F5-PO-5, F5-PO-6) : seuil du budget de trajet,
 * plus long trajet vers une étape, ligne trajet et budget. Les valeurs viennent toujours des données
 * (Q8) ; les textes sont composés ici depuis fr.json, jamais stockés dans les données.
 */

const t = messages.sejour.journee;

/**
 * Montant en francs, formaté par l'interface (handover § 9) avec `formatNombre`, indépendant de l'ICU
 * (F-ICU, ticket 171) : arrondi au franc (« environ … CHF »), milliers séparés par U+202F.
 */
export function formatMontant(amount: number): string {
  return formatNombre(Math.round(amount));
}

/**
 * Dépassement strict : `travelMinutes` > `travelBudgetMinutes` (égalité : pas de bandeau). Total indisponible
 * (`null`, décision 0092 § 4) : pas de bandeau, rien n'est déduit d'un total incomplet.
 */
export function isOverTravelBudget(day: Pick<Day, "travelMinutes" | "travelBudgetMinutes">): boolean {
  return day.travelMinutes !== null && day.travelMinutes > day.travelBudgetMinutes;
}

/**
 * Plus long segment immédiatement suivi d'une étape (`type: "stop"`), avec cette étape ; à égalité,
 * le premier. `null` sans segment suivi d'une étape. Un segment sans durée (décision 0092) n'est jamais retenu.
 */
export function longestSegmentToStop(items: readonly DayLineItem[]): { segment: Segment; stop: Stop } | null {
  let best: { segment: Segment; stop: Stop } | null = null;
  for (let index = 0; index < items.length - 1; index += 1) {
    const item = items[index];
    const next = items[index + 1];
    if (item?.type !== "segment" || next?.type !== "stop" || item.segment.minutes === null) continue;
    if (!best || item.segment.minutes > (best.segment.minutes ?? 0)) {
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
    trajet: formatDuree(day.travelMinutes ?? 0),
    budget: formatDuree(day.travelBudgetMinutes),
  });
  const longest = longestSegmentToStop(day.items);
  if (!longest) return first;
  return `${first} ${format(t.bandeauPlusLong, { segment: segmentLabel(longest.segment), name: longest.stop.name })}`;
}

/**
 * Journée sans aucune durée de trajet connue : aucune ligne de trajet et un total nul. C'est le cas des programmes
 * réels servis sans relecture des durées (adaptateur `prototype` sans carte, décision 0074) : l'interface n'affiche
 * alors aucune durée, plutôt qu'un « 0 min de trajet » qui serait inventé.
 *
 * **Déduction assumée** (décision 0074, point 4) : le contrat `Day` ne distingue pas « inconnu » de « zéro », et
 * l'étendre toucherait tous les adaptateurs pour un cas de la préversion. Une journée sans aucun trajet (une seule
 * étape, ou aucune, avec l'adaptateur simulé) n'affiche donc pas non plus « 0 min de trajet » : il n'y a aucun
 * trajet à décrire, et rien d'utile n'est perdu. Testé dans `JourneePanel.test.tsx` et `SejourPanel.test.tsx`.
 *
 * Total indisponible (`travelMinutes: null`, un trajet du jour sans durée, prototype seulement, décision 0092 § 4) :
 * même rendu, aucun total n'est affiché.
 */
export function withoutTravel(day: Pick<Day, "items" | "travelMinutes">): boolean {
  return day.travelMinutes === null || (day.travelMinutes === 0 && !day.items.some((item) => item.type === "segment"));
}

/**
 * Ligne sous le titre du jour : « 1 h 25 de trajet · environ 95 CHF par personne » (budget s'il est défini). Sans
 * durée connue (`withoutTravel`) : le budget seul, ou `null` (la ligne n'est pas rendue).
 */
export function dayTravelLine(day: Pick<Day, "items" | "travelMinutes" | "budgetPerPerson">): string | null {
  if (withoutTravel(day)) {
    return day.budgetPerPerson === undefined ? null : format(t.budgetSeul, { montant: formatMontant(day.budgetPerPerson) });
  }
  const duree = formatDuree(day.travelMinutes ?? 0);
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

const ts = messages.sejour.sejour;

/**
 * Ligne de budget du Séjour (F5-PO-3) : « Budget estimé : environ {total} CHF par personne », total des
 * `budgetPerPerson` définis, suivi de « (sans le jour {n}) » pour chaque jour sans budget ; `null` si aucun
 * jour n'a de budget (la ligne n'est pas rendue).
 */
export function tripBudgetLine(days: readonly Pick<Day, "index" | "budgetPerPerson">[]): string | null {
  const budgeted = days.filter((day) => day.budgetPerPerson !== undefined);
  if (budgeted.length === 0) return null;
  const total = budgeted.reduce((sum, day) => sum + (day.budgetPerPerson ?? 0), 0);
  const missing = days.filter((day) => day.budgetPerPerson === undefined).map((day) => format(ts.budgetSansJour, { n: day.index }));
  return [format(ts.budget, { montant: formatMontant(total) }), ...missing].join(" ");
}

/**
 * Résumé d'un jour dans « Jour par jour » (F5-PO-3, provisoire UX/UI) : « 6 étapes · 1 h 30 de trajet » ; le nombre
 * d'étapes seul sans durée connue (`withoutTravel`, décision 0074).
 */
export function daySummary(day: Pick<Day, "items" | "travelMinutes">): string {
  if (withoutTravel(day)) return dayStopCount(day);
  return format(ts.jourParJour.resume, { etapes: dayStopCount(day), duree: formatDuree(day.travelMinutes ?? 0) });
}

/**
 * Nombre d'étapes d'un jour : « Aucune étape », « 1 étape », « 6 étapes ». Seul résumé de « Jour par jour » dans la
 * vue partagée, qui ne reçoit aucune durée de trajet totale (F10c).
 */
export function dayStopCount(day: { items: readonly { type: string }[] }): string {
  const count = day.items.filter((item) => item.type === "stop").length;
  if (count === 0) return ts.jourParJour.etapes.aucune;
  return count === 1 ? ts.jourParJour.etapes.un : format(ts.jourParJour.etapes.plusieurs, { n: count });
}

/** Événements de tous les jours (`Day.events`) pour « Pendant ton séjour » : par jour, puis par heure de début. */
export function tripEvents<E extends Pick<Stop, "start">, D extends { index: number; events: readonly E[] }>(
  days: readonly D[],
): { day: D; event: D["events"][number] }[] {
  return [...days]
    .sort((a, b) => a.index - b.index)
    .flatMap((day) => [...day.events].sort((a, b) => a.start.localeCompare(b.start)).map((event) => ({ day, event })));
}
