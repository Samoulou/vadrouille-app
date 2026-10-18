import type { Brief as BriefContrat, Day, MobilityMode, Pace, TripCommitment } from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatEvenement, CandidatMoteur, EtatChoix, Nuit, TypeCreneau, VoyageMoteur } from "@/domain/entrees";
import type { JourPlanifie } from "@/domain/planification";
import { INCONNU, type Duree, type Plage, type Point, type Relectures, type Validite } from "@/domain/relectures";
import { element, lire } from "@/domain/tables";
import { compterParRegle, validerProgramme } from "@/domain/validation";
import type { JourSquelette } from "@/domain/squelette";
import { jourSemaine } from "@/domain/temps";
import type { AncrageResolu, Trajets } from "@/prototype/ancrage";
import type { Brief, Rythme } from "@/prototype/brief";
import type { Candidat, CandidatNote } from "@/prototype/candidat";

/**
 * Adaptateur de P0 vers les entrées du moteur (décision 0045 § 1.3, B5-TL-1) : **seul** fichier qui convertit les
 * types de P0 (`src/prototype`) en types du moteur (`src/domain/entrees.ts`). Déplacé de `scripts/p0` (P0r3c-5a,
 * amendement de 0063). Le moteur parle le vocabulaire des
 * contrats, P0 le sien ; la conversion est une fonction testée (`tests/unit/p0/vers-moteur.test.ts`), pas une copie
 * de types.
 *
 * - rythme : `tranquille`, `equilibre`, `intense` → `relaxed`, `balanced`, `intense` ;
 * - heures d'arrivée et de départ du brief de P0 → engagements `flight` aux dates d'arrivée et de départ
 *   (B5-PO-7, B5-PO-12 ; reproduit les bornes de l'ancien `squelette.ts`) ; engagements `ticket` → `ticket`,
 *   `reservation` → `booking` ;
 * - logements de P0 (texte, nombre de nuits) → une `Nuit` par nuit, avec le `placeId` de l'ancrage du logement ;
 * - ancrages et matrice de trajets → doubles en mémoire des interfaces `Relectures` (0045 § 2).
 */

export function rythmeVersPace(rythme: Rythme): Pace {
  switch (rythme) {
    case "tranquille":
      return "relaxed";
    case "equilibre":
      return "balanced";
    case "intense":
      return "intense";
  }
}

/** Voyage du moteur depuis le brief de P0. */
export function voyageDepuisBrief(brief: Brief): VoyageMoteur {
  return {
    destination: brief.destination,
    start: brief.arrivee,
    end: brief.depart,
    timeZone: brief.fuseau,
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
  };
}

/**
 * Brief des contrats depuis le brief de P0. `budgetRepas` (niveau 1 à 3) n'a pas d'équivalent en CHF : non repris
 * (le moteur ne s'en sert pas pour le budget, B5-PO-10, ni pour le classement de P0). `limits` et `inferredFields`
 * n'existent pas dans P0 : vides.
 */
export function briefDepuisBrief(brief: Brief): BriefContrat {
  return {
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
    pace: rythmeVersPace(brief.rythme),
    wishes: [...brief.envies],
    limits: [],
    mobility: [...brief.deplacements],
    inferredFields: [],
  };
}

/** Engagements des contrats : `flight` synthétiques (arrivée, puis départ), puis les engagements saisis de P0. */
export function engagementsDepuisBrief(brief: Brief): TripCommitment[] {
  return [
    { kind: "flight", label: "Arrivée", date: brief.arrivee, start: brief.heureArrivee },
    { kind: "flight", label: "Départ", date: brief.depart, start: brief.heureDepart },
    ...(brief.engagements ?? []).map(
      (engagement): TripCommitment => ({
        kind: engagement.type === "ticket" ? "ticket" : "booking",
        label: engagement.libelle,
        date: engagement.date,
        start: engagement.heure,
      }),
    ),
  ];
}

/** Une `Nuit` par nuit du séjour, dans l'ordre du brief ; `placeIds` : ancrage de chaque logement de P0. */
export function nuitsDepuisBrief(brief: Brief, placeIds: readonly string[]): Nuit[] {
  return brief.logements.flatMap((logement, index) => {
    const placeId = element(placeIds, index);
    const nuit: Nuit = { etiquette: logement.texte, ...(placeId === undefined ? {} : { placeId }) };
    return Array.from({ length: logement.nuits }, () => nuit);
  });
}

/** Types de créneaux de la première série : activités (dont l'idée du jour), repas, soirée. */
export type TypeSerie = TypeCreneau;
export const TYPES_SERIE: readonly TypeSerie[] = ["activity", "meal", "evening"];

/** `n` lieux de plus pour `type` (sans accès calculé : règle d'import des modules de P0 chargés par `pnpm p0`). */
function ajouter(demande: Readonly<Record<TypeSerie, number>>, type: TypeSerie, n: number): Record<TypeSerie, number> {
  return {
    activity: demande.activity + (type === "activity" ? n : 0),
    meal: demande.meal + (type === "meal" ? n : 0),
    evening: demande.evening + (type === "evening" ? n : 0),
  };
}

/**
 * Lieux que demande un jour, par type : un par créneau du squelette **qui tient dans la fenêtre réelle du jour**, plus
 * l'idée « Surprends-moi » (une activité). C'est la part du jour dans la **première série** (0055 § 6 point 3 : « étapes
 * du programme et 8 propositions » ; les propositions de P0 sont prises parmi les étapes planifiées, `assemblage.ts`,
 * et ne demandent aucun lieu de plus).
 *
 * Fenêtre réelle (ticket 483) : les créneaux sont parcourus dans l'ordre depuis `jour.debut` (heure d'arrivée le premier
 * jour), avec les durées par défaut de la configuration et sans trajet, selon les règles de `planifierJour` : une
 * activité finit avant la fin au plus tard du repas qui la suit (sinon avant la fin du jour), un repas commence dans sa
 * fenêtre et finit avant la fin du jour (heure de départ le dernier jour), la soirée finit avant la fin du jour. Un
 * créneau qui ne tient pas n'est pas demandé. Sans trajet, c'est une borne haute : le planificateur, qui ajoute les
 * trajets, n'en remplit jamais plus. Le nombre de créneaux reste celui du squelette (rythme) ; un nombre qui suivrait les
 * durées de visite est l'objet de la spécification PO-27 (ticket 489).
 */
export function demandeDuJour(jour: JourSquelette, configuration: ConfigurationMoteur): Record<TypeSerie, number> {
  const durees = configuration.dureesParDefaut;
  let demande: Record<TypeSerie, number> = { activity: 1, meal: 0, evening: 0 };
  let instant = jour.debut;
  jour.creneaux.forEach((creneau, rang) => {
    if (creneau.type === "activity") {
      const suivant = jour.creneaux.at(rang + 1);
      const limite = suivant?.type === "meal" ? suivant.auPlusTard : jour.fin;
      const fin = instant + durees.activity;
      if (fin > limite || fin > jour.fin) return;
      demande = ajouter(demande, "activity", 1);
      instant = fin;
      return;
    }
    const debut = Math.max(instant, creneau.auPlusTot);
    const fin = debut + (creneau.type === "meal" ? lire(durees, creneau.repas) : durees.evening);
    if ((creneau.type === "meal" && debut > creneau.auPlusTard) || fin > jour.fin) return;
    demande = ajouter(demande, creneau.type, 1);
    instant = fin;
  });
  return demande;
}

/**
 * Demande du jour ramenée à la capacité de sa matrice Routes (lieux admis en plus des logements, 0055 § 6 point 1) :
 * types pris dans l'ordre de `TYPES_SERIE`, aucun lieu au-delà de la capacité.
 */
export function demandeBornee(demande: Readonly<Record<TypeSerie, number>>, capacite: number): Record<TypeSerie, number> {
  let reste = Math.max(0, capacite);
  let bornee: Record<TypeSerie, number> = { activity: 0, meal: 0, evening: 0 };
  for (const type of TYPES_SERIE) {
    const pris = Math.min(lire(demande, type), reste);
    bornee = ajouter(bornee, type, pris);
    reste -= pris;
  }
  return bornee;
}

/**
 * Demande de la première série, jour par jour et sommée sur le séjour (ticket 483 ; correction 1 de la PR #490 : **seul
 * chemin de calcul** des cibles de recherche, pour `p0Run` comme pour `pnpm p0`). Chaque jour : `demandeDuJour`, bornée
 * par sa capacité (`demandeBornee`) si `capacites` est donné (étape finale de `p0Run`, matrice Routes du jour) ; sans
 * capacités (`pnpm p0`, une seule matrice), la demande n'est pas bornée.
 */
export function demandesDuSejour(
  jours: readonly JourSquelette[],
  configuration: ConfigurationMoteur,
  capacites?: readonly number[],
): { demandes: Record<TypeSerie, number>[]; serie: Record<TypeSerie, number>; premiereSerie: number } {
  const demandes = jours.map((jour, rang) => {
    const demande = demandeDuJour(jour, configuration);
    return capacites === undefined ? demande : demandeBornee(demande, element(capacites, rang) ?? 0);
  });
  let serie: Record<TypeSerie, number> = { activity: 0, meal: 0, evening: 0 };
  for (const demande of demandes) for (const type of TYPES_SERIE) serie = ajouter(serie, type, lire(demande, type));
  const premiereSerie = serie.activity + serie.meal + serie.evening;
  return { demandes, serie, premiereSerie };
}

/** Mode de trajet de P0 : un seul mode, celui du calcul de la matrice. */
export function modeDeTrajet(brief: Brief): MobilityMode {
  if (brief.deplacements.includes("transit")) return "transit";
  if (brief.deplacements.includes("walk")) return "walk";
  return "car";
}

function faitsDe(candidat: Candidat): CandidatMoteur["faits"] {
  // Le coût n'est repris que s'il est nul : la devise des prix trouvés sur le web n'est pas convertie (P0).
  return {
    ...(candidat.dureeMinutes === undefined ? {} : { durationMinutes: candidat.dureeMinutes }),
    ...(candidat.prixParPersonne === 0 ? { costPerPerson: 0 } : {}),
  };
}

/** Candidat noté et ancré de P0 → candidat de la réserve du moteur. */
export function candidatVersMoteur(candidat: CandidatNote, ancrage: AncrageResolu | undefined): CandidatMoteur {
  if (candidat.typeEtape === "event") throw new Error("vers-moteur : un événement n'est pas un candidat de la réserve");
  return {
    id: candidat.id,
    nom: candidat.nom,
    resume: candidat.resume,
    categorie: candidat.categorie,
    typeEtape: candidat.typeEtape,
    faits: faitsDe(candidat),
    sources: [{ url: candidat.source.url, date: candidat.source.date, classe: candidat.source.classe }],
    notes: { ...candidat.notes },
    ...(ancrage === undefined ? {} : { placeId: ancrage.placeId }),
    aReserver: candidat.aReserver,
  };
}

/** Candidat d'événement de P0 (`Candidat.evenement`) → candidat d'événement du moteur ; `undefined` sans date. */
export function evenementVersMoteur(candidat: Candidat, ancrage: AncrageResolu | undefined): CandidatEvenement | undefined {
  const info = candidat.evenement;
  if (info === undefined) return undefined;
  return {
    id: candidat.id,
    nom: candidat.nom,
    resume: candidat.resume,
    categorie: candidat.categorie,
    faits: faitsDe(candidat),
    sources: [{ url: candidat.source.url, date: candidat.source.date, classe: candidat.source.classe }],
    ...(ancrage === undefined ? {} : { placeId: ancrage.placeId }),
    aReserver: candidat.aReserver,
    evenement: { date: info.date, ...(info.heure === undefined ? {} : { heure: info.heure }), dateRelue: info.dateConfirmee },
  };
}

/**
 * Doubles en mémoire des interfaces du moteur, depuis les résultats d'ancrage et la matrice de trajets de P0 (un
 * seul mode : la durée ne dépend pas du mode demandé). Statut `ouvert` ou `ferme_temporairement` : `valide` (comme
 * `estAncre`) ; horaires `null` : `inconnu` ; plages de la date lues par jour de la semaine.
 */
export function relecturesDepuisAncrages(
  ancragesParPlace: ReadonlyMap<string, AncrageResolu>,
  nuits: readonly Nuit[],
  trajets: Trajets,
): Relectures {
  const placeDe = (point: Point): string | undefined =>
    "lieu" in point ? point.lieu : (element(nuits, point.logement)?.placeId ?? nuits[0]?.placeId);
  return {
    validite(placeId: string): Validite {
      const ancrage = ancragesParPlace.get(placeId);
      if (ancrage === undefined) return "introuvable";
      return ancrage.statut === "ferme_definitivement" ? "ferme_definitivement" : "valide";
    },
    plages(placeId: string, date: string): readonly Plage[] | typeof INCONNU {
      const horaires = ancragesParPlace.get(placeId)?.horaires;
      if (horaires === undefined || horaires === null) return INCONNU;
      const jour = jourSemaine(date);
      return horaires.filter((plage) => plage.jour === jour).map((plage) => ({ debut: plage.debut, fin: plage.fin }));
    },
    duree(depuis: Point, vers: Point): Duree | typeof INCONNU {
      const de = placeDe(depuis);
      const a = placeDe(vers);
      if (de === undefined || a === undefined) return INCONNU;
      const minutes = trajets(de, a);
      // P0 ne sait pas si une durée est estimée (0048 § 3.3) : `estimee: false`, comme ses segments.
      return minutes === undefined ? INCONNU : { minutes, estimee: false };
    },
  };
}

/**
 * Rangs des jours dont le lieu est **fermé pendant toute la fenêtre** (correction 1 de la PR #490, regroupement par
 * jour) : ses plages d'ouverture de la date sont connues et aucune ne recouvre `[debut, fin]` du jour. Horaires
 * inconnus : aucun jour (aucune contrainte, B5-PO-5).
 */
export function joursDeFermeture(
  relectures: Pick<Relectures, "plages">,
  placeId: string,
  jours: readonly { readonly date: string; readonly debut: number; readonly fin: number }[],
): number[] {
  return jours.flatMap((jour, rang) => {
    const plages = relectures.plages(placeId, jour.date);
    if (plages === INCONNU) return [];
    return plages.some((plage) => plage.debut < jour.fin && jour.debut < plage.fin) ? [] : [rang];
  });
}

/** Six compteurs du rapport de P0 (`scripts/p0/rapport.ts`) ; R3, R7 et R10 y sont « sans objet ». */
export type ViolationsP0 = { R1: number; R2: number; R4: number; R5: number; R6: number; R8: number };

export type ContexteP0 = {
  brief: Brief;
  briefMoteur: BriefContrat;
  nuits: readonly Nuit[];
  relectures: Relectures;
  configuration: ConfigurationMoteur;
  planifies: readonly JourPlanifie[];
  candidats: ReadonlyMap<string, Candidat>;
};

/**
 * Valide le programme complet de P0 par les validateurs du moteur (`validerProgramme`), puis ramène le rapport aux
 * six compteurs du rapport de P0 (décision 0045 § 1.6). Règles propres à P0 : un événement non ancré garde sa
 * source sans `placeId` (portée R1 `evenementsSansLieu: "admis"`) ; tout repas est « gardé » (P0-PO-6).
 */
export function violationsP0(jours: readonly Day[], contexte: ContexteP0): ViolationsP0 {
  const nonRelus = new Set<string>();
  for (const jour of contexte.planifies) {
    jour.evenements.forEach((evenement, rang) => {
      if (contexte.candidats.get(evenement.candidatId)?.evenement?.dateConfirmee !== true) {
        nonRelus.add(`j${jour.squelette.index}-e${rang + 1}`);
      }
    });
  }
  const choix = new Map<string, EtatChoix>();
  for (const jour of jours) for (const item of jour.items) if (item.type === "stop") choix.set(item.stop.id, "garde");
  const rapport = validerProgramme(jours, {
    voyage: { start: contexte.brief.arrivee, end: contexte.brief.depart },
    pace: contexte.briefMoteur.pace,
    configuration: contexte.configuration,
    relectures: contexte.relectures,
    modes: [modeDeTrajet(contexte.brief)],
    nuits: contexte.nuits,
    evenementsNonRelus: nonRelus,
    choix,
    porteeR1: { evenementsSansLieu: "admis" },
  });
  const compte = compterParRegle(rapport);
  return { R1: compte.R1, R2: compte.R2, R4: compte.R4, R5: compte.R5, R6: compte.R6, R8: compte.R8 };
}
