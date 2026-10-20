import "server-only";

import { ProposalRecordSchema, type Category, type DaySnapshot, type ProposalRecord, type SegmentSnapshot, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { MAX_PREVIEW_SLOTS } from "@/contracts/values";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { finOccupee, type JourSquelette } from "@/domain/squelette";
import { versHeure, versMinutes } from "@/domain/temps";

/**
 * Les 8 cases de l'aperçu (spécification B9, B9-PO-5 et PO-6 ; critère `aperçu: huit cases, jamais un lieu non ancré`) :
 * étapes `activity` et `meal` de la version 1, dans l'ordre chronologique (jour, puis heure de début), en commençant par le
 * jour 1 ; les engagements, logements et événements ne sont pas des cases. Une case `proposal` porte un `ProposalRecord`
 * validé (raison et détour compris). Moins de 8 étapes ancrées et rédigées : cases `noOption` à la suite (`day`, `time`,
 * `kind` du créneau manquant, pris dans le squelette : d'abord les créneaux attendus restés libres, puis les créneaux de repli ;
 * décision 0105 § 4.1), jamais un lieu non ancré. Une case `noOption` n'est jamais posée dans l'intervalle (début à fin) d'une
 * étape, d'un événement, d'un engagement ou d'un repas du jour (0106 § 6.1 ; comparaison sur les intervalles de l'instantané,
 * jamais sur l'heure de début seule) ; si les heures libres ne suffisent pas, il y a moins de huit cases (`incomplete`, 0105
 * § 8 point 3), jamais une case en chevauchement.
 *
 * Repas (0106 § 4, **provisoire jusqu'à la réponse de Samuel à la question 57**, qu'elle ne préjuge pas) : une case par repas
 * (l'option que le moteur retient ; `PreviewSlotsSchema` interdit deux cases au même créneau).
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

/** Pas, en minutes, des créneaux de repli d'une case `noOption` quand le squelette n'en a plus de libre. */
const PAS_DE_REPLI = 30;

/**
 * Créneaux de repli, **tirés du squelette** (jamais des heures fixes) : pour chaque jour planifié, chaque demi-heure de sa
 * fenêtre (`debut` à `fin`), de type `meal` quand elle tombe dans la fenêtre d'un repas du jour, `activity` sinon.
 */
function creneauxDeRepli(jours: readonly JourSquelette[]): { day: number; time: string; kind: "activity" | "meal" }[] {
  const repli: { day: number; time: string; kind: "activity" | "meal" }[] = [];
  for (const jour of jours) {
    const repas = jour.creneaux.flatMap((creneau) => (creneau.type === "meal" ? [{ de: creneau.auPlusTot, a: creneau.auPlusTard }] : []));
    for (let instant = Math.ceil(jour.debut / PAS_DE_REPLI) * PAS_DE_REPLI; instant < jour.fin; instant += PAS_DE_REPLI) {
      const heure = heureDuJour(instant);
      if (heure === undefined) continue;
      repli.push({ day: jour.index, time: heure, kind: repas.some(({ de, a }) => instant >= de && instant <= a) ? "meal" : "activity" });
    }
  }
  return repli;
}

type Intervalle = { readonly debut: number; readonly fin: number };

/** Intervalles occupés `[début, fin[` d'un jour de l'instantané, en minutes : étapes (engagements et repas compris) et événements. */
function intervallesOccupes(jour: DaySnapshot, configuration: ConfigurationMoteur): Intervalle[] {
  const etapes = [...jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])), ...jour.events];
  return etapes.map((stop) => ({ debut: versMinutes(stop.start), fin: finOccupee(stop, configuration) }));
}

/**
 * Vrai si l'heure tombe dans l'intervalle d'une étape, d'un événement, d'un engagement ou d'un repas de ce jour (0106 § 6.1).
 * Seule l'heure de début de la case est testée, pas sa durée : une étape qui commence à 10:15 ne bloque pas la case de
 * 10:00. Choix assumé (0106 § 6.1 ne compare que l'heure de la case ; mineur 2 de la revue du head 0b2897a) : une case
 * `noOption` est un repère horaire, pas une plage réservée.
 */
function creneauOccupe(occupes: ReadonlyMap<number, readonly Intervalle[]>, day: number, time: string): boolean {
  const instant = versMinutes(time);
  return (occupes.get(day) ?? []).some(({ debut, fin }) => instant >= debut && instant < Math.max(fin, debut + 1));
}

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

  const occupes = new Map(entree.instantane.days.filter((jour) => entree.jours.includes(jour.index)).map((jour) => [jour.index, intervallesOccupes(jour, entree.configuration)] as const));
  // Une case par `(jour, heure)` (contrat `PreviewSlotsSchema`) et jamais dans un intervalle occupé (0106 § 6.1).
  const pris = new Set(cases.map((c) => `${c.day}|${c.time}`));
  const libre = (day: number, time: string) => !pris.has(`${day}|${time}`) && !creneauOccupe(occupes, day, time);
  const manquants = creneauxAttendus(entree.squelette.filter((jour) => entree.jours.includes(jour.index)), entree.configuration);
  const planifies = entree.squelette.filter((jour) => entree.jours.includes(jour.index));
  for (const attendu of manquants) {
    if (cases.length >= MAX_PREVIEW_SLOTS) break;
    if (!libre(attendu.day, attendu.time)) continue;
    pris.add(`${attendu.day}|${attendu.time}`);
    cases.push({ type: "noOption", position: cases.length + 1, day: attendu.day, time: attendu.time, kind: attendu.kind });
  }
  for (const repli of creneauxDeRepli(planifies)) {
    if (cases.length >= MAX_PREVIEW_SLOTS) break;
    if (!libre(repli.day, repli.time)) continue;
    pris.add(`${repli.day}|${repli.time}`);
    cases.push({ type: "noOption", position: cases.length + 1, ...repli });
  }
  return cases;
}
