import type { Pace, TripCommitment, Weekday } from "@/contracts";

import { budgetTrajetDuJour } from "@/domain/budget-trajet";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { logementsDuJour } from "@/domain/relectures";
import { lire } from "@/domain/tables";
import { ajouterJours, joursEntre, libelleJour, versMinutes } from "@/domain/temps";

/**
 * Squelette déterministe du séjour (spécification P0, étape 5 ; cadrage § 6.5) : terminus de chaque jour au
 * logement, fenêtres, nombre d'activités selon le rythme, créneaux repas et soirée, budget de trajet (§ 3.7).
 * Toutes les valeurs viennent de la configuration du moteur (B5-PO-1, PO-1 ; décision 0045 § 4) : aucune
 * constante ici. Les secteurs ne sont pas tirés de positions Google : ils émergent du coût de trajet du
 * classement, qui mesure la proximité à l'étape précédente.
 *
 * Reprise de P0 (B5a) ; B5b y ajoute les engagements `ticket` et `booking` (B5-PO-12).
 */

export type Creneau =
  | { type: "activity" }
  | { type: "meal"; repas: "lunch" | "dinner"; auPlusTot: number; auPlusTard: number }
  | { type: "evening"; auPlusTot: number };

export type JourSquelette = {
  /** 1 = J1. */
  index: number;
  date: string;
  weekday: Weekday;
  debut: number;
  fin: number;
  /** Index de la nuit (0 = première nuit) du logement de départ et d'arrivée du jour (B5-PO-7, 0045 § 2.2). */
  logementDepart: number;
  logementArrivee: number;
  creneaux: Creneau[];
  budgetTrajet: number;
  /** Jour complet (ni arrivée, ni départ) : la règle de temps libre minimal s'y applique. */
  complet: boolean;
  /** Temps libre minimal du jour, en minutes (0 les jours d'arrivée et de départ). */
  tempsLibreMin: number;
};

export type EntreeSquelette = {
  voyage: { start: string; end: string };
  pace: Pace;
  nombreDeNuits: number;
  engagements: readonly TripCommitment[];
  configuration: ConfigurationMoteur;
  budgetTrajetReduit: boolean;
};

/**
 * Heures qui bornent le séjour (B5-PO-7, B5-PO-12) : seul un engagement `flight` à la date d'arrivée ou de départ
 * les donne. Le premier `flight` (ordre de saisie) daté du premier jour donne l'arrivée (sa fin, sinon son début) ;
 * le dernier daté du dernier jour donne le départ (son début).
 */
export function heuresDeVol(
  voyage: { start: string; end: string },
  engagements: readonly TripCommitment[],
): { arrivee?: number; depart?: number } {
  const vols = engagements.filter((engagement) => engagement.kind === "flight");
  const arrivee = vols.find((vol) => vol.date === voyage.start);
  const depart = vols.filter((vol) => vol.date === voyage.end).at(-1);
  return {
    ...(arrivee === undefined ? {} : { arrivee: versMinutes(arrivee.end ?? arrivee.start) }),
    ...(depart === undefined ? {} : { depart: versMinutes(depart.start) }),
  };
}

export function squelette(entree: EntreeSquelette): JourSquelette[] {
  const { configuration } = entree;
  const nombreJours = joursEntre(entree.voyage.start, entree.voyage.end) + 1;
  const activites = lire(configuration.activitesParRythme, entree.pace);
  const matin = Math.ceil(activites / 2);
  const debutJour = versMinutes(configuration.fenetreJour.debut);
  const finJour = versMinutes(configuration.fenetreJour.fin);
  const dejeuner = {
    type: "meal",
    repas: "lunch",
    auPlusTot: versMinutes(configuration.repas.lunch.auPlusTot),
    auPlusTard: versMinutes(configuration.repas.lunch.auPlusTard),
  } as const;
  const diner = {
    type: "meal",
    repas: "dinner",
    auPlusTot: versMinutes(configuration.repas.dinner.auPlusTot),
    auPlusTard: versMinutes(configuration.repas.dinner.auPlusTard),
  } as const;
  const soiree = { type: "evening", auPlusTot: versMinutes(configuration.debutSoiree) } as const;
  const vols = heuresDeVol(entree.voyage, entree.engagements);
  const budget = budgetTrajetDuJour(entree.pace, configuration, entree.budgetTrajetReduit);

  return Array.from({ length: nombreJours }, (_, index) => {
    const date = ajouterJours(entree.voyage.start, index);
    const premier = index === 0;
    const dernier = index === nombreJours - 1;
    const creneaux: Creneau[] = [
      ...Array.from({ length: matin }, () => ({ type: "activity" }) as const),
      dejeuner,
      ...Array.from({ length: activites - matin }, () => ({ type: "activity" }) as const),
      diner,
      ...(entree.pace !== "relaxed" && !dernier ? [soiree] : []),
    ];
    // `index` compte les jours de 0 à N, comme 0045 § 2.2.
    const logements = logementsDuJour(index, entree.nombreDeNuits);
    return {
      index: index + 1,
      date,
      weekday: libelleJour(date),
      debut: premier && vols.arrivee !== undefined ? Math.max(debutJour, vols.arrivee) : debutJour,
      fin: dernier && vols.depart !== undefined ? Math.min(finJour, vols.depart) : finJour,
      logementDepart: logements.depart,
      logementArrivee: logements.arrivee,
      creneaux,
      budgetTrajet: budget,
      complet: !premier && !dernier,
      tempsLibreMin: !premier && !dernier ? lire(configuration.tempsLibreMinParRythme, entree.pace) : 0,
    };
  });
}
