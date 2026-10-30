import type { Pace, StopSnapshot } from "@/contracts";

import { budgetParPersonne, minutesDeTrajet } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { EtatsDeChoix, Nuit } from "@/domain/entrees";
import { etapesDuJour, type JourProgramme } from "@/domain/programme";
import {
  dansLesPlages,
  INCONNU,
  logementsDuJour,
  trajetLePlusRapide,
  type ModeTrajet,
  type Point,
  type Relectures,
} from "@/domain/relectures";
import { element, lire } from "@/domain/tables";
import { versMinutes } from "@/domain/temps";
import { etapesVerrouilleesModifiees } from "@/domain/verrous";
import { controlerVersion } from "@/domain/version";

/**
 * Validateurs R1 à R10 (cadrage § 8 ; règles fonctionnelles B5-PO-4 à B5-PO-11 ; décision 0045), sur un jour ou
 * sur un programme. Ils produisent un **rapport en mémoire** : une liste d'entrées `{ regle, etape | jour }`, un
 * code par règle d'une énumération fermée, sans sous-cause, sans horaire, durée, `placeId` ni statut (0011 points
 * 2 et 4). Le rapport n'est jamais écrit.
 */

export const CODES_REGLE = ["R1", "R2", "R3", "R4", "R5", "R6", "R7", "R8", "R9", "R10"] as const;
export type CodeRegle = (typeof CODES_REGLE)[number];

/** Entrée du rapport : la règle, et l'étape ou le jour en cause (aucun des deux pour R10, qui porte sur le voyage). */
export type EntreeRapport = { regle: CodeRegle; etape?: string; jour?: number };
export type RapportValidation = readonly EntreeRapport[];

/**
 * Portée de R1 (B5-PO-4). `ajouts` : lieu ajouté par la personne — valeur par défaut **provisoire, non tranchée**
 * (question 1 de la spécification, Q332 à Samuel) : `placeId` contrôlé s'il existe, aucune source exigée.
 * `evenementsSansLieu` : `violation` (B5-PO-4) ; `admis` reproduit la règle de P0 (un événement non ancré garde
 * sa source et n'a pas de `placeId`), utilisée par l'adaptateur de `scripts/p0` seulement.
 */
export type PorteeR1 = { ajouts: "lieu" | "complete" | "aucune"; evenementsSansLieu: "violation" | "admis" };
export const PORTEE_R1_PAR_DEFAUT: PorteeR1 = { ajouts: "lieu", evenementsSansLieu: "violation" };

export type ContexteValidation = {
  voyage: { start: string; end: string };
  pace: Pace;
  configuration: ConfigurationMoteur;
  relectures: Relectures;
  /** Modes admis (`Brief.mobility`) : R5 prend le plus rapide qui a une durée connue (B5-PO-6). */
  modes: readonly ModeTrajet[];
  nuits: readonly Nuit[];
  /** Identifiants des événements dont la page relue ne confirme pas la date (R2). */
  evenementsNonRelus: ReadonlySet<string>;
  /** États de choix des étapes de repas et de soirée (R7, B5-PO-8). */
  choix: EtatsDeChoix;
  /** Identifiants des étapes ajoutées par la personne (R1, B5-PO-4). */
  ajouts?: ReadonlySet<string>;
  porteeR1?: Partial<PorteeR1>;
  /** Programme de base : R3 compare le programme validé (brouillon des jours touchés) à celui-ci. */
  base?: readonly JourProgramme[];
  /** R10 : version de base du patch et version courante du voyage. */
  versions?: { base: number; courante: number };
};

/**
 * URL de source (R1) : `https` seulement, sans identifiants, nom d'hôte non vide, 2 048 caractères au plus. Copie
 * de `urlSourceValide` de `src/prototype/programme-reduit.ts`, que `src/domain` n'a pas le droit d'importer
 * (décision 0032, A3.2) : `tests/unit/p0/copies.test.ts` vérifie les deux sur une même table.
 */
export function urlSourceValide(url: string): boolean {
  if (url.length > 2048) return false;
  let valeur: URL;
  try {
    valeur = new URL(url);
  } catch {
    return false;
  }
  return valeur.protocol === "https:" && valeur.username === "" && valeur.password === "" && valeur.hostname !== "";
}

const sourceValide = (lieu: { source?: { url: string } }) => lieu.source !== undefined && urlSourceValide(lieu.source.url);

function lieuValide(relectures: Relectures, placeId: string | undefined): boolean {
  return placeId !== undefined && relectures.validite(placeId) === "valide";
}

/** Étape de soirée : activité qui commence au début de soirée de la configuration ou après (B5-PO-1). */
function estSoiree(stop: StopSnapshot, configuration: ConfigurationMoteur): boolean {
  return stop.kind === "activity" && versMinutes(stop.start) >= versMinutes(configuration.debutSoiree);
}

/** Départ prévu vers une étape, sur la grille de 5 minutes du planificateur (bornes du temps libre, P0). */
function departVers(debut: number, trajet: number, marge: number): number {
  return Math.floor((debut - trajet - marge) / 5) * 5;
}

function regleR1(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  const portee = { ...PORTEE_R1_PAR_DEFAUT, ...contexte.porteeR1 };
  const { relectures } = contexte;
  for (const stop of etapesDuJour(jour)) {
    // Un engagement est la réservation de la personne : ni lieu ni source contrôlés (B5-PO-4).
    if (stop.commitment !== undefined) continue;
    if (contexte.ajouts?.has(stop.id) === true && portee.ajouts !== "complete") {
      if (portee.ajouts === "lieu" && stop.placeId !== undefined && !lieuValide(relectures, stop.placeId)) {
        entrees.push({ regle: "R1", etape: stop.id });
      }
      continue;
    }
    if (!lieuValide(relectures, stop.placeId) || !sourceValide(stop)) entrees.push({ regle: "R1", etape: stop.id });
  }
  for (const evenement of jour.events) {
    if (evenement.commitment !== undefined) continue;
    const lieu =
      evenement.placeId === undefined ? portee.evenementsSansLieu === "admis" : lieuValide(relectures, evenement.placeId);
    if (!lieu || !sourceValide(evenement)) entrees.push({ regle: "R1", etape: evenement.id });
  }
  if (jour.surprise !== undefined && (!lieuValide(relectures, jour.surprise.placeId) || !sourceValide(jour.surprise))) {
    entrees.push({ regle: "R1", etape: jour.surprise.id });
  }
}

function regleR2(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  const horsSejour = jour.date < contexte.voyage.start || jour.date > contexte.voyage.end;
  for (const evenement of jour.events) {
    const nonRelu = contexte.evenementsNonRelus.has(evenement.id) && !evenement.exceptions.includes("unconfirmed");
    if (horsSejour || nonRelu) entrees.push({ regle: "R2", etape: evenement.id });
  }
}

function regleR4(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  for (const stop of etapesDuJour(jour)) {
    // Étape verrouillée ou engagement hors des heures connues : reste en place, marqué `toConfirm` (B5-PO-5).
    if (stop.placeId === undefined || stop.end === undefined || stop.locked || stop.commitment !== undefined) continue;
    const dedans = dansLesPlages(contexte.relectures.plages(stop.placeId, jour.date), versMinutes(stop.start), versMinutes(stop.end));
    // Plages inconnues : conforme, marqué `toConfirm` en mémoire (`aConfirmer`, calculs.ts).
    if (dedans === false) entrees.push({ regle: "R4", etape: stop.id });
  }
}

function regleR5(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  const etapes = etapesDuJour(jour);
  for (let rang = 1; rang < etapes.length; rang += 1) {
    const avant = etapes.at(rang - 1);
    const apres = etapes.at(rang);
    if (avant?.placeId === undefined || apres?.placeId === undefined || avant.end === undefined) continue;
    const trajet = trajetLePlusRapide(contexte.relectures, { lieu: avant.placeId }, { lieu: apres.placeId }, contexte.modes);
    if (trajet === INCONNU || versMinutes(apres.start) < versMinutes(avant.end) + trajet.minutes + contexte.configuration.margeMinutes) {
      entrees.push({ regle: "R5", etape: apres.id });
    }
  }
}

function regleR6(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  const logements = logementsDuJour(jour.index - 1, contexte.nuits.length);
  const depart = element(contexte.nuits, logements.depart);
  const arrivee = element(contexte.nuits, logements.arrivee);
  const premier = jour.items.at(0);
  const dernier = jour.items.at(-1);
  const conforme =
    premier?.type === "terminus" &&
    premier.role === "start" &&
    dernier?.type === "terminus" &&
    dernier.role === "end" &&
    depart !== undefined &&
    arrivee !== undefined &&
    premier.label === depart.etiquette &&
    dernier.label === arrivee.etiquette;
  if (!conforme) entrees.push({ regle: "R6", jour: jour.index });
}

function regleR7(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  for (const stop of etapesDuJour(jour)) {
    if (stop.kind !== "meal" && !estSoiree(stop, contexte.configuration)) continue;
    const admis = stop.commitment !== undefined || contexte.choix.has(stop.id) || contexte.ajouts?.has(stop.id) === true;
    if (!admis) entrees.push({ regle: "R7", etape: stop.id });
  }
}

function regleR8(jour: JourProgramme, contexte: ContexteValidation, entrees: EntreeRapport[]): void {
  const { configuration } = contexte;
  const etapes = etapesDuJour(jour);
  // Rythme : activités du rythme, plus une soirée (B5-PO-9).
  if (etapes.filter((stop) => stop.kind === "activity").length > lire(configuration.activitesParRythme, contexte.pace) + 1) {
    entrees.push({ regle: "R8", jour: jour.index });
  }
  // Temps libre minimal d'un jour complet : fenêtre du jour − étapes − trajets.
  const complet = jour.date !== contexte.voyage.start && jour.date !== contexte.voyage.end;
  const trajets = minutesDeTrajet(jour, contexte.nuits.length, contexte.relectures, contexte.modes);
  if (complet && trajets !== INCONNU) {
    const occupe = etapes.reduce((total, stop) => total + (stop.end ? versMinutes(stop.end) - versMinutes(stop.start) : 0), 0);
    const libre = versMinutes(configuration.fenetreJour.fin) - versMinutes(configuration.fenetreJour.debut) - occupe - trajets;
    if (libre < lire(configuration.tempsLibreMinParRythme, contexte.pace)) entrees.push({ regle: "R8", jour: jour.index });
  }
  // Aucun trou : un écart de `seuilTempsLibreMinutes` ou plus avant une étape est écrit comme temps libre.
  const logements = logementsDuJour(jour.index - 1, contexte.nuits.length);
  let precedent: { fin: number; point: Point } | undefined;
  let trou = false;
  for (const item of jour.items) {
    if (item.type === "terminus" && item.role === "start") {
      precedent = { fin: versMinutes(item.time), point: { logement: logements.depart } };
    } else if (item.type === "free" || item.type === "openMeal") {
      precedent = undefined;
    } else if (item.type === "transfer") {
      // Changement de ville (décision 0151 § 4) : aucun trajet n'est calculé d'une ville à l'autre ; la première étape
      // après l'arrivée n'a pas d'élément précédent (spécification M4 § 7.3).
      precedent = undefined;
    } else if (item.type === "stop") {
      const stop = item.stop;
      if (precedent !== undefined && stop.placeId !== undefined) {
        const trajet = trajetLePlusRapide(contexte.relectures, precedent.point, { lieu: stop.placeId }, contexte.modes);
        if (trajet !== INCONNU) {
          const depart = departVers(versMinutes(stop.start), trajet.minutes, configuration.margeMinutes);
          if (depart - precedent.fin >= configuration.seuilTempsLibreMinutes) trou = true;
        }
      }
      precedent =
        stop.end === undefined || stop.placeId === undefined ? undefined : { fin: versMinutes(stop.end), point: { lieu: stop.placeId } };
    }
  }
  if (trou) entrees.push({ regle: "R8", jour: jour.index });
}

/** R9 : porte sur un jour recomposé (`Day`, qui a `generating`) ; un instantané n'a pas de budget à contrôler. */
function regleR9(jour: JourProgramme, entrees: EntreeRapport[]): void {
  if (jour.generating === undefined) return;
  if (jour.budgetPerPerson !== budgetParPersonne(jour)) entrees.push({ regle: "R9", jour: jour.index });
}

/** Règles d'un jour : R1, R2, R4 à R9. */
export function validerJour(jour: JourProgramme, contexte: ContexteValidation): EntreeRapport[] {
  const entrees: EntreeRapport[] = [];
  regleR1(jour, contexte, entrees);
  regleR2(jour, contexte, entrees);
  regleR4(jour, contexte, entrees);
  regleR5(jour, contexte, entrees);
  regleR6(jour, contexte, entrees);
  regleR7(jour, contexte, entrees);
  regleR8(jour, contexte, entrees);
  regleR9(jour, entrees);
  return entrees;
}

/** Règles d'un programme : celles de chaque jour, R3 (si un programme de base est fourni) et R10 (si des versions le sont). */
export function validerProgramme(jours: readonly JourProgramme[], contexte: ContexteValidation): RapportValidation {
  const entrees: EntreeRapport[] = [];
  if (contexte.versions !== undefined && !controlerVersion(contexte.versions.base, contexte.versions.courante).ok) {
    entrees.push({ regle: "R10" });
  }
  if (contexte.base !== undefined) {
    for (const etape of etapesVerrouilleesModifiees(contexte.base, jours)) entrees.push({ regle: "R3", etape });
  }
  for (const jour of jours) entrees.push(...validerJour(jour, contexte));
  return entrees;
}

/**
 * Une entrée bloque-t-elle la production de la version ? Non pour un conflit entre deux étapes verrouillées : une
 * entrée R5 dont l'étape d'arrivée et l'étape précédente du jour sont toutes deux `locked` (B5-PO-6, 0045 § 8).
 */
export function estBloquante(entree: EntreeRapport, jours: readonly JourProgramme[]): boolean {
  if (entree.regle !== "R5" || entree.etape === undefined) return true;
  for (const jour of jours) {
    const etapes = etapesDuJour(jour);
    const rang = etapes.findIndex((stop) => stop.id === entree.etape);
    if (rang < 1) continue;
    return !(etapes.at(rang - 1)?.locked === true && etapes.at(rang)?.locked === true);
  }
  return true;
}

/** Nombre d'entrées par règle (rapport de P0, tableaux de bord). */
export function compterParRegle(rapport: RapportValidation): Record<CodeRegle, number> {
  const compte = { R1: 0, R2: 0, R3: 0, R4: 0, R5: 0, R6: 0, R7: 0, R8: 0, R9: 0, R10: 0 };
  for (const { regle } of rapport) {
    switch (regle) {
      case "R1":
        compte.R1 += 1;
        break;
      case "R2":
        compte.R2 += 1;
        break;
      case "R3":
        compte.R3 += 1;
        break;
      case "R4":
        compte.R4 += 1;
        break;
      case "R5":
        compte.R5 += 1;
        break;
      case "R6":
        compte.R6 += 1;
        break;
      case "R7":
        compte.R7 += 1;
        break;
      case "R8":
        compte.R8 += 1;
        break;
      case "R9":
        compte.R9 += 1;
        break;
      case "R10":
        compte.R10 += 1;
        break;
    }
  }
  return compte;
}
