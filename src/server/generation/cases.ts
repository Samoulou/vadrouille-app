import "server-only";

import { ProposalRecordSchema, type Category, type DaySnapshot, type ProposalRecord, type SegmentSnapshot, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { MAX_PREVIEW_SLOTS } from "@/contracts/values";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { JourSquelette } from "@/domain/squelette";
import { versHeure, versMinutes } from "@/domain/temps";

/**
 * Les 8 cases de l'aperçu (spécification B9, B9-PO-5 et PO-6 ; critère `aperçu: huit cases, jamais un lieu non ancré`) :
 * étapes `activity` et `meal` de la version 1, dans l'ordre chronologique (jour, puis heure de début), en commençant par le
 * jour 1 ; les engagements, logements et événements ne sont pas des cases. Une case `proposal` porte un `ProposalRecord`
 * validé (raison et détour compris). Moins de 8 étapes ancrées et rédigées : cases `noOption` à la suite (`day`, `time`,
 * `kind` du créneau manquant, pris dans le squelette), jamais un lieu non ancré.
 *
 * Écart signalé dans la PR : « un repas avec options compte une case par option » (B9-PO-5, en attendant Q57) n'est pas
 * applicable : `PreviewSlotsSchema` interdit deux cases au même créneau (jour, heure) ; un repas compte une case.
 */

export type CaseApercu =
  | {
      readonly type: "proposal";
      readonly position: number;
      readonly day: number;
      readonly time: string;
      readonly kind: "activity" | "meal";
      readonly candidatId: string;
      readonly contenu: ProposalRecord;
    }
  | { readonly type: "noOption"; readonly position: number; readonly day: number; readonly time: string; readonly kind: "activity" | "meal" };

export type LieuDeCase = {
  readonly candidatId: string;
  readonly categorie: Category;
  readonly raison: string;
  readonly detour: string;
};

/** Étape retenue d'un jour, avec le trajet qui la précède dans la ligne du jour. */
type EtapeDeCase = { readonly jour: DaySnapshot; readonly stop: StopSnapshot; readonly trajet: SegmentSnapshot | undefined };

function etapesDuJour(jour: DaySnapshot): EtapeDeCase[] {
  const etapes: EtapeDeCase[] = [];
  jour.items.forEach((item, rang) => {
    if (item.type !== "stop" || (item.stop.kind !== "activity" && item.stop.kind !== "meal")) return;
    const avant = jour.items.at(rang - 1);
    etapes.push({ jour, stop: item.stop, trajet: rang > 0 && avant?.type === "segment" ? avant.segment : undefined });
  });
  return etapes;
}

/** « HH:MM » d'un instant de la journée, ou `undefined` au-delà de minuit. */
const heureDuJour = (minutes: number): string | undefined => (minutes >= 0 && minutes <= 23 * 60 + 59 ? versHeure(minutes) : undefined);

/** Créneaux attendus du squelette (jour, heure, type), dans l'ordre : activités et repas des jours planifiés. */
export function creneauxAttendus(jours: readonly JourSquelette[], configuration: ConfigurationMoteur): { day: number; time: string; kind: "activity" | "meal" }[] {
  const durees = configuration.dureesParDefaut;
  const attendus: { day: number; time: string; kind: "activity" | "meal" }[] = [];
  for (const jour of jours) {
    let instant = jour.debut;
    for (const creneau of jour.creneaux) {
      if (creneau.type === "activity") {
        const heure = heureDuJour(instant);
        if (heure !== undefined) attendus.push({ day: jour.index, time: heure, kind: "activity" });
        instant += durees.activity;
      } else if (creneau.type === "meal") {
        const debut = Math.max(instant, creneau.auPlusTot);
        const heure = heureDuJour(debut);
        if (heure !== undefined) attendus.push({ day: jour.index, time: heure, kind: "meal" });
        instant = debut + durees[creneau.repas];
      } else {
        instant = Math.max(instant, creneau.auPlusTot) + durees.evening;
      }
    }
  }
  return attendus;
}

export type EntreeCases = {
  readonly instantane: TripSnapshot;
  /** Jours planifiés (indices, 1 = J1). */
  readonly jours: readonly number[];
  /** Lieu de chaque étape par `stop.id` : seules les étapes qui y figurent sont des propositions. */
  readonly lieux: ReadonlyMap<string, LieuDeCase>;
  readonly squelette: readonly JourSquelette[];
  readonly configuration: ConfigurationMoteur;
};

/** Heures de repli d'une case `noOption` quand le squelette n'a plus de créneau libre (jamais deux cases au même créneau). */
const HEURES_DE_REPLI = ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30", "18:00", "19:30", "21:00"] as const;

export function composerCases(entree: EntreeCases): CaseApercu[] {
  const retenues = entree.instantane.days
    .filter((jour) => entree.jours.includes(jour.index))
    .flatMap(etapesDuJour)
    .filter(({ stop }) => entree.lieux.has(stop.id) && stop.placeId !== undefined)
    .sort((a, b) => a.jour.index - b.jour.index || versMinutes(a.stop.start) - versMinutes(b.stop.start))
    .slice(0, MAX_PREVIEW_SLOTS);

  const cases: CaseApercu[] = retenues.map(({ jour, stop, trajet }, rang) => {
    const lieu = entree.lieux.get(stop.id) as LieuDeCase;
    const kind = stop.kind as "activity" | "meal";
    const contenu = ProposalRecordSchema.parse({
      id: stop.id,
      kind,
      day: jour.index,
      time: stop.start,
      stop: { ...stop, reason: lieu.raison },
      category: lieu.categorie,
      ...(trajet === undefined ? {} : { travelFromPrevious: trajet }),
      detour: lieu.detour,
    });
    return { type: "proposal", position: rang + 1, day: jour.index, time: stop.start, kind, candidatId: lieu.candidatId, contenu };
  });

  const pris = new Set(cases.map((c) => `${c.day}|${c.time}`));
  const manquants = creneauxAttendus(entree.squelette.filter((jour) => entree.jours.includes(jour.index)), entree.configuration);
  const dernier = Math.max(...entree.jours);
  for (const attendu of manquants) {
    if (cases.length >= MAX_PREVIEW_SLOTS) break;
    const cle = `${attendu.day}|${attendu.time}`;
    if (pris.has(cle)) continue;
    pris.add(cle);
    cases.push({ type: "noOption", position: cases.length + 1, day: attendu.day, time: attendu.time, kind: attendu.kind });
  }
  for (const heure of HEURES_DE_REPLI) {
    if (cases.length >= MAX_PREVIEW_SLOTS) break;
    const cle = `${dernier}|${heure}`;
    if (pris.has(cle)) continue;
    pris.add(cle);
    cases.push({ type: "noOption", position: cases.length + 1, day: dernier, time: heure, kind: cases.length % 2 === 0 ? "activity" : "meal" });
  }
  return cases;
}
