import type { Pace, StopSnapshot, TripCommitment, Weekday } from "@/contracts";

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
 * Reprise de P0 (B5a) ; B5b y ajoute les engagements `ticket` et `booking` (B5-PO-12) par
 * `squeletteAvecEngagements`, et le retrait des créneaux pris par un bloc fixe (`retirerCreneaux`). `squelette`
 * reste celui de P0 : les briefs de P0 n'ont pas d'engagement, et son assemblage les place en événements.
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
  /** Blocs fixes du jour, triés par début (engagements, B5-PO-12 ; étapes gardées d'un jour replanifié). */
  fixes?: BlocFixe[];
};

/**
 * Bloc fixe d'un jour : un engagement posé par le squelette (B5-PO-12), ou une étape verrouillée ou un engagement
 * d'un jour replanifié (B5-PO-11). Le planificateur ne le déplace jamais et ne le remplace jamais ; il planifie les
 * créneaux autour. `id` absent : étape nouvelle, identifiant attribué à la construction du jour.
 */
export type BlocFixe = {
  id?: string;
  stop: Omit<StopSnapshot, "id">;
  debut: number;
  /** Fin occupée : `end` de l'étape, sinon la durée par défaut de son type (B5-PO-1). */
  fin: number;
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

/** Fenêtre de repas de la configuration qui contient `debut`, s'il y en a une. */
export function repasDeLHeure(debut: number, configuration: ConfigurationMoteur): "lunch" | "dinner" | undefined {
  for (const repas of ["lunch", "dinner"] as const) {
    const fenetre = lire(configuration.repas, repas);
    if (versMinutes(fenetre.auPlusTot) <= debut && debut <= versMinutes(fenetre.auPlusTard)) return repas;
  }
  return undefined;
}

/** Fin occupée d'une étape fixe : son heure de fin, sinon sa durée par défaut (B5-PO-1). */
export function finOccupee(stop: Pick<StopSnapshot, "kind" | "start" | "end">, configuration: ConfigurationMoteur): number {
  const debut = versMinutes(stop.start);
  if (stop.end !== undefined) return Math.max(debut, versMinutes(stop.end));
  const durees = configuration.dureesParDefaut;
  if (stop.kind !== "meal") return debut + durees.activity;
  return debut + lire(durees, repasDeLHeure(debut, configuration) ?? "dinner");
}

/**
 * Étape d'un engagement de l'écran 1 (B5-PO-12) : `ticket` → activité `commitment: "ticket"` ; `booking` →
 * `commitment: "reservation"`, repas si son début tombe dans une fenêtre de repas, sinon activité. Nom : le libellé
 * saisi. Verrouillée à sa création (0015 § 9). `flight` n'est pas une étape : `undefined`.
 */
export function blocEngagement(engagement: TripCommitment, configuration: ConfigurationMoteur): BlocFixe | undefined {
  if (engagement.kind === "flight") return undefined;
  const debut = versMinutes(engagement.start);
  const kind = engagement.kind === "booking" && repasDeLHeure(debut, configuration) !== undefined ? "meal" : "activity";
  const stop: BlocFixe["stop"] = {
    kind,
    name: engagement.label,
    start: engagement.start,
    ...(engagement.end === undefined ? {} : { end: engagement.end }),
    facts: {},
    exceptions: [],
    locked: true,
    commitment: engagement.kind === "ticket" ? "ticket" : "reservation",
  };
  return { stop, debut, fin: finOccupee(stop, configuration) };
}

/**
 * Créneaux d'un jour après la pose de blocs fixes : un repas fixe prend la place du repas de sa fenêtre (B5-PO-12) ;
 * une activité fixe qui commence au début de soirée ou après prend la soirée, sinon une activité du matin (avant la
 * fenêtre du déjeuner) ou de l'après-midi, à défaut l'autre moitié. Le nombre d'activités du rythme est ainsi
 * gardé (R8). Un événement ne prend aucun créneau.
 */
export function retirerCreneaux(
  creneaux: readonly Creneau[],
  blocs: readonly BlocFixe[],
  configuration: ConfigurationMoteur,
): Creneau[] {
  const restants = [...creneaux];
  const debutDejeuner = versMinutes(configuration.repas.lunch.auPlusTot);
  const debutSoiree = versMinutes(configuration.debutSoiree);
  for (const bloc of blocs) {
    let rang = -1;
    if (bloc.stop.kind === "meal") {
      const repas = repasDeLHeure(bloc.debut, configuration);
      rang = restants.findIndex((creneau) => creneau.type === "meal" && creneau.repas === repas);
    } else if (bloc.stop.kind === "activity") {
      if (bloc.debut >= debutSoiree) rang = restants.findIndex((creneau) => creneau.type === "evening");
      if (rang < 0) {
        const dejeuner = restants.findIndex((creneau) => creneau.type === "meal" && creneau.repas === "lunch");
        const coupure = dejeuner < 0 ? restants.length : dejeuner;
        const matin = restants.findLastIndex((creneau, index) => creneau.type === "activity" && index < coupure);
        const apresMidi = restants.findLastIndex((creneau, index) => creneau.type === "activity" && index > coupure);
        rang = bloc.debut < debutDejeuner ? (matin >= 0 ? matin : apresMidi) : apresMidi >= 0 ? apresMidi : matin;
      }
    }
    if (rang >= 0) restants.splice(rang, 1);
  }
  return restants;
}

/**
 * Squelette du moteur de production (B5b) : celui de `squelette`, plus les engagements `ticket` et `booking` posés
 * et verrouillés à leur date et heure (B5-PO-12), qui prennent leur créneau. Un engagement daté hors du séjour n'est
 * pas posé.
 */
export function squeletteAvecEngagements(entree: EntreeSquelette): JourSquelette[] {
  return squelette(entree).map((jour) => {
    const blocs = entree.engagements
      .filter((engagement) => engagement.date === jour.date)
      .flatMap((engagement) => blocEngagement(engagement, entree.configuration) ?? [])
      .sort((a, b) => a.debut - b.debut);
    return { ...jour, creneaux: retirerCreneaux(jour.creneaux, blocs, entree.configuration), fixes: blocs };
  });
}
