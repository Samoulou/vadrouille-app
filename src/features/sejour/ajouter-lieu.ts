import type { Day, DayLineItem, Meal, RevisionPreview, Stop, SurpriseIdea } from "@/contracts";
import { poserEtapeDansJour, versMinutes } from "@/lib/pose-ajout";

/**
 * Fonctions pures de l'écran « Ajouter un lieu » (tâche M5d-2, ticket 961 ; spécification M5 § 6, M5-PO-12 ; F7,
 * F7-PO-8 et F7-PO-11 ; décision 0147 § 3, § 11 et addendum A.5). Aucune donnée Google n'y entre : seuls les jours du
 * programme (contenu maison), les heures et les durées prévues.
 */

/** Durées prévues par type (minutes), lues côté serveur dans `dureesParDefaut` du moteur. */
export type DureesPrevues = { readonly activity: number; readonly lunch: number; readonly dinner: number };

/** Moment où l'on peut ajouter un lieu : un temps libre, ou un repas pas encore choisi (F7-PO-11). */
export type MomentAjout =
  | { readonly id: string; readonly type: "libre"; readonly from: string; readonly to: string }
  | { readonly id: string; readonly type: "repas"; readonly time: string; readonly meal: Meal };

/**
 * Entrée désignée par l'adresse : `?de=&a=` (lien « Idées » d'un temps libre), `?de=&repas=` (repas pas encore choisi) ou
 * `?idee=` (« Ajouter à ma journée » de « Surprends-moi », F7-PO-8).
 */
export type EntreeAjout =
  | { readonly type: "libre"; readonly from: string; readonly to: string }
  | { readonly type: "repas"; readonly time: string; readonly meal: Meal }
  | { readonly type: "idee"; readonly id: string };

const HEURE = /^([01][0-9]|2[0-3]):[0-5][0-9]$/;
/** Identifiant interne d'une idée (jamais un `placeId` ni un nom, F7 § « Données »). */
const IDEE = /^[A-Za-z0-9_-]{1,128}$/;



const premier = (valeur: string | string[] | undefined): string | undefined => (Array.isArray(valeur) ? valeur[0] : valeur);

/**
 * Lit les paramètres de l'adresse (F7-PO-8). Un paramètre mal formé (heure hors `HH:MM`, `repas` inconnu, plage vide,
 * identifiant d'idée hors motif) ou inconnu de l'écran est ignoré : `invalide` demande de remplacer l'adresse sans eux,
 * sans erreur. Qu'une idée existe dans le jour se vérifie ensuite (`ideeDeLEntree`).
 */
export function lireEntree(params: Readonly<Record<string, string | string[] | undefined>>): { entree: EntreeAjout | null; invalide: boolean } {
  const de = premier(params.de);
  const a = premier(params.a);
  const repas = premier(params.repas);
  const idee = premier(params.idee);
  const presents = Object.entries(params).some(([, valeur]) => valeur !== undefined);
  if (idee !== undefined && IDEE.test(idee)) {
    return { entree: { type: "idee", id: idee }, invalide: Object.keys(params).some((cle) => cle !== "idee" && params[cle] !== undefined) };
  }
  if (de !== undefined && HEURE.test(de)) {
    if (a !== undefined && HEURE.test(a) && repas === undefined && versMinutes(a) > versMinutes(de)) {
      return { entree: { type: "libre", from: de, to: a }, invalide: Object.keys(params).some((cle) => cle !== "de" && cle !== "a" && params[cle] !== undefined) };
    }
    if ((repas === "lunch" || repas === "dinner") && a === undefined) {
      return { entree: { type: "repas", time: de, meal: repas }, invalide: Object.keys(params).some((cle) => cle !== "de" && cle !== "repas" && params[cle] !== undefined) };
    }
  }
  return { entree: null, invalide: presents };
}

/**
 * Idée « Surprends-moi » désignée par `?idee=` : celle du jour si l'identifiant est le sien, sinon `null` (paramètre
 * ignoré, F7-PO-8). Une idée n'a pas de `placeId` à reprendre (décision 0154 § 6 point 2) : son nom, contenu maison
 * (décision 0015 § 3), préremplit « Lieu à ajouter » et « Nom dans ton programme » (M5-PO-10, F7-PO-10) ; le lieu écrit
 * est le résultat que la personne choisit après « Rechercher ».
 */
export function ideeDeLEntree(day: Day, entree: EntreeAjout | null): SurpriseIdea | null {
  if (entree?.type !== "idee") return null;
  const idee = day.surprise;
  return idee?.id === entree.id ? idee : null;
}

/** Temps libres et repas pas encore choisis du jour, dans l'ordre de la ligne du jour. */
export function momentsDuJour(day: Day): MomentAjout[] {
  return day.items.flatMap((item): MomentAjout[] => {
    if (item.type === "free") return [{ id: `libre-${item.from}-${item.to}`, type: "libre", from: item.from, to: item.to }];
    if (item.type === "openMeal") return [{ id: `repas-${item.time}`, type: "repas", time: item.time, meal: item.meal }];
    return [];
  });
}

/** Heure et type de l'étape ajoutée pour ce moment : début du temps libre (`activity`), ou heure du repas (`meal`). */
export function demandeDuMoment(moment: MomentAjout): { time: string; kind: "activity" | "meal" } {
  return moment.type === "libre" ? { time: moment.from, kind: "activity" } : { time: moment.time, kind: "meal" };
}

const assezLong = (moment: MomentAjout, durees: DureesPrevues): boolean =>
  moment.type === "libre" && versMinutes(moment.to) - versMinutes(moment.from) >= durees.activity;

/**
 * Moment proposé (M5-PO-12) : celui que désigne l'entrée s'il existe et, pour un temps libre, s'il est assez long ; sinon
 * le premier temps libre du jour qui dure au moins la durée prévue d'une activité ; sinon aucun (la personne choisit
 * dans la liste des moments du jour).
 */
export function momentPropose(moments: readonly MomentAjout[], entree: EntreeAjout | null, durees: DureesPrevues): MomentAjout | null {
  if (entree?.type === "libre") {
    const designe = moments.find((moment) => moment.type === "libre" && moment.from === entree.from && moment.to === entree.to);
    if (designe && assezLong(designe, durees)) return designe;
  }
  if (entree?.type === "repas") {
    const designe = moments.find((moment) => moment.type === "repas" && moment.time === entree.time && moment.meal === entree.meal);
    if (designe) return designe;
  }
  return moments.find((moment) => assezLong(moment, durees)) ?? null;
}

/** Étape visée d'un aperçu d'ajout, dans son jour. */
export function etapeAjoutee(preview: RevisionPreview): { day: Day; stop: Stop } | null {
  for (const day of preview.days) {
    for (const item of day.items) if (item.type === "stop" && item.stop.id === preview.targetStopId) return { day, stop: item.stop };
  }
  return null;
}

/**
 * Trajet du lieu ajouté vers ou depuis une voisine, sans durée connue (addendum 0147, A.5) : en partant de l'étape
 * ajoutée, on saute les temps libres et les repas pas encore choisis ; un segment estimé, ou une étape (ou un logement)
 * atteinte sans segment, rend `true`. Le bord de la journée ou un changement de ville ne comptent pas.
 */
function trajetInconnu(items: readonly DayLineItem[], depart: number, pas: 1 | -1): boolean {
  for (let index = depart + pas; index >= 0 && index < items.length; index += pas) {
    const item = items[index];
    if (item === undefined || item.type === "free" || item.type === "openMeal") continue;
    if (item.type === "segment") return item.segment.estimated || item.segment.minutes === null;
    if (item.type === "transfer") return false;
    return true;
  }
  return false;
}

/** L'aperçu dit « Temps de trajet calculé après l'ajout » (0147 § 4 point 3, addendum A.5) : un trajet du lieu ajouté est inconnu ou estimé. */
export function trajetsCalculesApres(preview: RevisionPreview): boolean {
  const cible = etapeAjoutee(preview);
  if (cible === null) return false;
  const rang = cible.day.items.findIndex((item) => item.type === "stop" && item.stop.id === cible.stop.id);
  return trajetInconnu(cible.day.items, rang, -1) || trajetInconnu(cible.day.items, rang, 1);
}

/**
 * Jours de l'aperçu avec l'identifiant de l'étape écrite (`ajout-<requestId>`, décision 0147 § 3 point 5) à la place de
 * celui de l'aperçu (addendum A.1 : identifiant aléatoire) : surlignage et focus visent l'étape que la relecture rendra.
 */
export function joursAvecEtapeEcrite(preview: RevisionPreview, stopId: string): Day[] {
  return preview.days.map((day) => ({
    ...day,
    items: day.items.map((item) => (item.type === "stop" && item.stop.id === preview.targetStopId ? { ...item, stop: { ...item.stop, id: stopId } } : item)),
  }));
}

/**
 * Aperçu d'ajout sur **`mock` seulement**, reporté sur le jour affiché (décision 0154 § 3, M5d-3) : le jeu simulé ne garde
 * aucun ajout, son aperçu part donc du jour simulé et ne montre que le dernier lieu ajouté. L'étape de l'aperçu est posée
 * dans le jour affiché, qui garde les ajouts précédents en mémoire de la page, par la même fonction pure que l'adaptateur
 * `mock` (`poserEtapeDansJour`, `src/lib/pose-ajout.ts`). Recharger la page rétablit le jeu simulé. Sans place dans le
 * jour affiché (cas que les moments proposés écartent), l'aperçu est rendu tel quel.
 *
 * Jamais sur `api`, et `api` ne doit pas s'en inspirer : son aperçu vient du moteur, qui peut replanifier d'autres étapes,
 * et fait foi (0154 § 3 ; addendum 0147, A.7).
 */
export function apercuSurJourAffiche(preview: RevisionPreview, affiche: Day): RevisionPreview {
  const cible = etapeAjoutee(preview);
  if (cible === null || cible.day.index !== affiche.index) return preview;
  const pose = poserEtapeDansJour(affiche, cible.stop);
  if (pose === null) return preview;
  return { ...preview, days: preview.days.map((day) => (day.index === affiche.index ? pose : day)) };
}
