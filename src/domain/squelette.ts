import { ajouterJours, joursEntre, jourSemaine, libelleJour, versMinutes } from "@/domain/temps";
import type { Weekday } from "@/contracts";
import { BUDGET_TRAJET_PAR_RYTHME, type Brief, type Rythme } from "@/prototype/brief";

/**
 * Squelette déterministe du séjour (spécification P0, étape 5 ; cadrage § 6.5) : terminus de chaque jour au
 * logement, fenêtres, nombre d'activités selon le rythme, créneaux repas et soirée, budget de trajet (§ 3.7).
 * Les secteurs ne sont pas tirés de positions Google : ils émergent du coût de trajet du classement, qui mesure
 * la proximité à l'étape précédente.
 */

/** Activités par jour complet, selon le rythme (« pas plus de deux visites par jour » en rythme tranquille). */
export const ACTIVITES_PAR_RYTHME: Record<Rythme, number> = { tranquille: 2, equilibre: 3, intense: 4 };

/** Temps libre minimal d'un jour complet, en minutes (R8). */
export const TEMPS_LIBRE_MIN: Record<Rythme, number> = { tranquille: 120, equilibre: 60, intense: 30 };

/** Fenêtre d'un jour complet. */
export const DEBUT_JOUR = versMinutes("09:00");
export const FIN_JOUR = versMinutes("22:30");

/** Marge entre l'arrivée et le début d'une étape (R5). */
export const MARGE_MINUTES = 5;

export const DUREES = { activity: 90, lunch: 75, dinner: 90, evening: 90 } as const;

export type Creneau =
  | { type: "activity" }
  | { type: "meal"; repas: "lunch" | "dinner"; auPlusTot: number; auPlusTard: number }
  | { type: "evening"; auPlusTot: number };

export type JourSquelette = {
  index: number;
  date: string;
  weekday: Weekday;
  /** 0 = dimanche. */
  jourSemaine: number;
  debut: number;
  fin: number;
  /** Index du logement (ordre du brief) au départ et au retour du jour. */
  logementDepart: number;
  logementArrivee: number;
  creneaux: Creneau[];
  budgetTrajet: number;
  /** Jour complet (ni arrivée, ni départ) : la règle de temps libre minimal s'y applique. */
  complet: boolean;
  /** Temps libre minimal du jour, en minutes (0 les jours d'arrivée et de départ). */
  tempsLibreMin: number;
};

const DEJEUNER = { type: "meal", repas: "lunch", auPlusTot: versMinutes("12:00"), auPlusTard: versMinutes("14:00") } as const;
const DINER = { type: "meal", repas: "dinner", auPlusTot: versMinutes("18:30"), auPlusTard: versMinutes("20:45") } as const;
const SOIREE = { type: "evening", auPlusTot: versMinutes("20:30") } as const;

/** Logement de chaque nuit, dans l'ordre du brief. */
function logementsParNuit(brief: Brief): number[] {
  return brief.logements.flatMap((logement, index) => Array.from({ length: logement.nuits }, () => index));
}

export function squelette(brief: Brief): JourSquelette[] {
  const nuits = logementsParNuit(brief);
  const nombreJours = joursEntre(brief.arrivee, brief.depart) + 1;
  const activites = ACTIVITES_PAR_RYTHME[brief.rythme];
  const matin = Math.ceil(activites / 2);
  return Array.from({ length: nombreJours }, (_, index) => {
    const date = ajouterJours(brief.arrivee, index);
    const premier = index === 0;
    const dernier = index === nombreJours - 1;
    const creneaux: Creneau[] = [
      ...Array.from({ length: matin }, () => ({ type: "activity" }) as const),
      DEJEUNER,
      ...Array.from({ length: activites - matin }, () => ({ type: "activity" }) as const),
      DINER,
      ...(brief.rythme !== "tranquille" && !dernier ? [SOIREE] : []),
    ];
    return {
      index: index + 1,
      date,
      weekday: libelleJour(date),
      jourSemaine: jourSemaine(date),
      debut: premier ? Math.max(DEBUT_JOUR, versMinutes(brief.heureArrivee)) : DEBUT_JOUR,
      fin: dernier ? Math.min(FIN_JOUR, versMinutes(brief.heureDepart)) : FIN_JOUR,
      logementDepart: premier ? (nuits[0] ?? 0) : (nuits[index - 1] ?? 0),
      logementArrivee: dernier ? (nuits[index - 1] ?? nuits[0] ?? 0) : (nuits[index] ?? 0),
      creneaux,
      budgetTrajet: BUDGET_TRAJET_PAR_RYTHME[brief.rythme],
      complet: !premier && !dernier,
      tempsLibreMin: !premier && !dernier ? TEMPS_LIBRE_MIN[brief.rythme] : 0,
    };
  });
}
