import {
  DETOUR_THRESHOLD_MINUTES,
  DayMapSchema,
  ProposalSchema,
  TripSchema,
  validateDayMap,
  type Day,
  type DayLineItem,
  type DayMap,
  type Pace,
  type Proposal,
  type Segment,
  type Stop,
  type StopFacts,
  type Trip,
} from "@/contracts";
import { budgetTrajetDuJour } from "@/domain/budget-trajet";
import { destinationColor, optionDeRepas } from "@/domain/calculs";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { Nuit } from "@/domain/entrees";
import type { JourPlanifie } from "@/domain/planification";
import { element } from "@/domain/tables";
import { arrondi5, versHeure } from "@/domain/temps";
import type { Position } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Assemblage du programme complet de P0, en mémoire (spécification P0, « Sortie 1 »), puis validation par
 * `TripSchema`, `ProposalSchema` et un `DayMapSchema` par jour **avant** la réduction. Sortie propre à P0 : il a
 * quitté `src/domain` pour `scripts/p0` avec B5a (décision 0045 § 1.5), puis `scripts/p0` pour `src/server/p0` (P0r3c-5a,
 * amendement de 0063) ; le moteur de production écrit un instantané (`TripSnapshotSchema`, B5b), et les positions sont recomposées à la lecture (B8).
 *
 * Le programme complet contient les durées de trajet (`Segment.minutes`, `Day.travelMinutes`) : il ne vit qu'en
 * mémoire. Seule sa forme réduite est écrite (`@/prototype/reduction`).
 */

/** Nombre de propositions de la présentation (cadrage § 4). */
export const NOMBRE_PROPOSITIONS = 8;

export type Raison = { raison?: string; detour?: string };

export type EntreeAssemblage = {
  tripId: string;
  brief: Brief;
  /** Logement de chaque nuit (adaptateur `vers-moteur.ts`) : étiquette des terminus, `placeId` des cartes. */
  nuits: readonly Nuit[];
  configuration: ConfigurationMoteur;
  jours: readonly JourPlanifie[];
  candidats: ReadonlyMap<string, Candidat>;
  raisons: ReadonlyMap<string, Raison>;
  mode: Segment["mode"];
  positions: ReadonlyMap<string, Position>;
};

export type ProgrammeComplet = {
  trip: Trip;
  proposals: Proposal[];
  /** Justification maison de chaque proposition (écrite sur chacune dans la forme réduite). */
  justifications: Map<string, string>;
  terminus: { jour: number; depart: string; arrivee: string }[];
  cartes: DayMap[];
};

function domaine(url: string): string {
  return new URL(url).hostname;
}

/**
 * Faits de l'étape (spécification B2, E3) : durée prévue et gratuité, comme l'ancien texte `meta` (« 1 h 30,
 * gratuit »). Le coût n'est repris que s'il est nul : la devise des prix trouvés sur le web n'est pas convertie
 * (hors périmètre de B2, B7 ou B9).
 */
function faits(candidat: Candidat, minutes: number | undefined): StopFacts {
  // `StopFacts.durationMinutes` est un entier strictement positif : une durée nulle ou non entière est omise.
  const duree = minutes !== undefined && Number.isInteger(minutes) && minutes > 0 ? minutes : undefined;
  return {
    ...(duree === undefined ? {} : { durationMinutes: duree }),
    ...(candidat.prixParPersonne === 0 ? { costPerPerson: 0 } : {}),
  };
}

function stopDe(
  id: string,
  candidat: Candidat,
  kind: Stop["kind"],
  placeId: string | undefined,
  debut: number,
  fin: number | undefined,
  raison: string | undefined,
): Stop {
  const exceptions: Stop["exceptions"] = [];
  if (candidat.aReserver) exceptions.push("toReserve");
  if (kind === "event" && candidat.evenement?.dateConfirmee !== true) exceptions.push("unconfirmed");
  return {
    id,
    kind,
    ...(placeId === undefined ? {} : { placeId }),
    name: candidat.nom,
    start: versHeure(debut),
    ...(fin === undefined ? {} : { end: versHeure(fin) }),
    facts: fin === undefined ? {} : faits(candidat, fin - debut),
    ...(raison === undefined ? {} : { reason: raison }),
    source: { label: domaine(candidat.source.url), url: candidat.source.url },
    exceptions,
    locked: false,
  };
}

export function assembler(entree: EntreeAssemblage): ProgrammeComplet {
  const { brief, nuits } = entree;
  const marge = entree.configuration.margeMinutes;
  const seuilTempsLibre = entree.configuration.seuilTempsLibreMinutes;
  const proposals: Proposal[] = [];
  const justifications = new Map<string, string>();
  const terminus: ProgrammeComplet["terminus"] = [];
  const logementTexte = (nuit: number) => element(nuits, nuit)?.etiquette ?? nuits[0]?.etiquette ?? "Logement";
  const logementPlace = (nuit: number) => element(nuits, nuit)?.placeId ?? nuits[0]?.placeId ?? "";

  const days: Day[] = entree.jours.map((jour) => {
    const s = jour.squelette;
    const items: DayLineItem[] = [{ type: "terminus", role: "start", time: versHeure(s.debut), label: logementTexte(s.logementDepart) }];
    let fin = s.debut;
    let travelMinutes = 0;
    let budget = 0;
    let budgetComplet = jour.etapes.length > 0;

    jour.etapes.forEach((etape, rang) => {
      const candidat = entree.candidats.get(etape.candidatId);
      if (candidat === undefined) throw new Error("assemblage : candidat inconnu");
      // Bornes du temps libre arrondies à 5 min : elles ne recopient pas une durée de trajet à la minute près.
      const depart = Math.floor((etape.debut - etape.trajetAvant - marge) / 5) * 5;
      if (depart - fin >= seuilTempsLibre) items.push({ type: "free", from: versHeure(fin), to: versHeure(depart) });
      const segment: Segment = { mode: entree.mode, minutes: etape.trajetAvant, estimated: false };
      items.push({ type: "segment", segment });
      travelMinutes += etape.trajetAvant;
      const kind = etape.creneau === "meal" ? "meal" : "activity";
      const raison = entree.raisons.get(candidat.id);
      const stop = stopDe(`j${s.index}-${rang + 1}`, candidat, kind, etape.placeId, etape.debut, etape.fin, raison?.raison);
      items.push({ type: "stop", stop });
      if (candidat.prixParPersonne === undefined) budgetComplet = false;
      else budget += candidat.prixParPersonne;
      fin = etape.fin;

      if (s.index <= 2 && proposals.length < NOMBRE_PROPOSITIONS && raison?.detour !== undefined) {
        const id = `p${proposals.length + 1}`;
        const option = kind === "meal" ? optionDeRepas(1, Math.max(1, etape.options)) : undefined;
        const proposition: Proposal = {
          id,
          kind,
          day: s.index,
          time: stop.start,
          // Voisins : calculés à la lecture par le moteur (B5, décision 0037 B2-TL-1), jamais écrits ici.
          neighbours: {},
          stop,
          category: candidat.categorie,
          ...(option === undefined ? {} : { option }),
          travelFromPrevious: segment,
          // En mémoire, `detour` suit la règle du contrat ; la forme réduite le porte sur chaque proposition.
          ...(etape.trajetAvant > DETOUR_THRESHOLD_MINUTES ? { detour: raison.detour } : {}),
        };
        proposals.push(proposition);
        justifications.set(id, raison.detour);
      }
    });

    const retourDepart = fin;
    items.push({ type: "segment", segment: { mode: entree.mode, minutes: jour.retour, estimated: false } });
    travelMinutes += jour.retour;
    const arrivee = Math.min(23 * 60 + 55, arrondi5(retourDepart + jour.retour));
    items.push({ type: "terminus", role: "end", time: versHeure(arrivee), label: logementTexte(s.logementArrivee) });
    terminus.push({ jour: s.index, depart: logementPlace(jour.logementDepart), arrivee: logementPlace(jour.logementArrivee) });

    const events: Stop[] = jour.evenements.flatMap((evenement, rang) => {
      const candidat = entree.candidats.get(evenement.candidatId);
      if (candidat === undefined) return [];
      return [
        stopDe(`j${s.index}-e${rang + 1}`, candidat, "event", evenement.placeId, evenement.debut, undefined, entree.raisons.get(candidat.id)?.raison),
      ];
    });
    for (const [rang, engagement] of (brief.engagements ?? []).filter((e) => e.date === s.date).entries()) {
      events.push({
        id: `j${s.index}-c${rang + 1}`,
        kind: "event",
        name: engagement.libelle,
        start: engagement.heure,
        facts: {},
        exceptions: [],
        locked: true,
        commitment: engagement.type,
      });
    }

    let surprise: Day["surprise"];
    if (jour.idee !== undefined) {
      const candidat = entree.candidats.get(jour.idee.candidatId);
      const raison = candidat === undefined ? undefined : entree.raisons.get(candidat.id)?.raison;
      if (candidat !== undefined && raison !== undefined) {
        surprise = {
          id: `j${s.index}-idee`,
          placeId: jour.idee.placeId,
          name: candidat.nom,
          facts: faits(candidat, candidat.dureeMinutes),
          reason: raison,
          source: { label: domaine(candidat.source.url), url: candidat.source.url },
        };
      }
    }

    return {
      index: s.index,
      date: s.date,
      items,
      ...(budgetComplet ? { budgetPerPerson: budget } : {}),
      events,
      generating: false,
      travelMinutes,
      travelBudgetMinutes: s.budgetTrajet,
      ...(surprise === undefined ? {} : { surprise }),
    };
  });

  const trip: Trip = {
    id: entree.tripId,
    organizationId: PROTOTYPE_ORG_ID,
    destination: brief.destination,
    destinationColor: destinationColor(brief.destination),
    start: brief.arrivee,
    end: brief.depart,
    timeZone: brief.fuseau,
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
    days,
    checklist: [],
    unlocked: true,
  };

  // Validation complète en mémoire, avant toute réduction (spécification P0, « Sortie 1 »).
  TripSchema.parse(trip);
  for (const proposition of proposals) ProposalSchema.parse(proposition);
  const cartes = days.map((day) => carteDuJour(trip.id, day, terminus, entree.positions));
  return { trip, proposals, justifications, terminus, cartes };
}

function carteDuJour(
  tripId: string,
  day: Day,
  terminus: ProgrammeComplet["terminus"],
  positions: ReadonlyMap<string, Position>,
): DayMap {
  const points: DayMap["points"] = [];
  const t = terminus.find((entree) => entree.jour === day.index);
  const ajouterTerminus = (role: "start" | "end", placeId: string | undefined) => {
    const position = placeId === undefined ? undefined : positions.get(placeId);
    if (position) points.push({ ref: { type: "terminus", role }, lat: position.lat, lng: position.lng });
  };
  ajouterTerminus("start", t?.depart);
  for (const item of day.items) {
    if (item.type !== "stop" || item.stop.placeId === undefined) continue;
    const position = positions.get(item.stop.placeId);
    if (position) points.push({ ref: { type: "stop", stopId: item.stop.id }, lat: position.lat, lng: position.lng });
  }
  ajouterTerminus("end", t?.arrivee);
  const carte = DayMapSchema.parse({ tripId, dayIndex: day.index, points });
  if (validateDayMap(day, carte, tripId).length > 0) throw new Error("assemblage : carte du jour incohérente");
  return carte;
}

// --- Programme écrit par l'IA (décision 0115 ; décision 0116 § 1.7, § 1.8, § 4.1, § 5 et § 6) ----------------------

/**
 * Créneau du programme de l'IA tel que l'assemblage le reçoit (forme structurelle de `CreneauIa`, `src/ai/sorties.ts`,
 * que ce module n'importe pas) : textes déjà contrôlés et coupés (0117 § 1), plus le `placeId` **du créneau**, posé par
 * l'appelant seulement si le lieu est vérifié (0116 § 4.4).
 */
export type CreneauAssemble = {
  readonly debut: string;
  readonly fin?: string;
  readonly nature: "arrivee" | "visite" | "repas_midi" | "repas_soir" | "apero" | "soiree" | "pause" | "depart";
  readonly lieu?: string;
  readonly quartier?: string;
  readonly pourquoi?: string;
  readonly aReserver?: boolean;
  readonly placeId?: string;
};

export type EntreeAssemblageIa = {
  tripId: string;
  brief: Brief;
  /** Journées lues, rangées par date ; créneaux **dans l'ordre écrit** (`ordreEcrit`, 0116 § 1.7), jamais retriés ici. */
  jours: readonly { readonly date: string; readonly creneaux: readonly CreneauAssemble[] }[];
  /** Bons plans contrôlés (0117 § 1) : lignes « À faire » avant le départ (0116 § 6). */
  bonsPlans: readonly string[];
  /** Identifiant de chaque logement du brief, dans son ordre (logements vérifiés à l'ouverture de l'étape). */
  logements: readonly string[];
  configuration: ConfigurationMoteur;
  mode: Segment["mode"];
  /** Temps en mémoire entre deux identifiants ; `undefined` : sans durée (0092 § 4). */
  trajets: (depuis: string, vers: string) => number | undefined;
};

export type ProgrammeCompletIa = Omit<ProgrammeComplet, "cartes">;

const NATURES_REPAS: ReadonlySet<string> = new Set(["repas_midi", "repas_soir", "apero"]);

/** Fin du jour : le contrat n'admet pas d'heure au-delà (0116 § 1.7). */
const FIN_DU_JOUR = "23:59";

const minutesDe = (heure: string) => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
const joursEntre = (debut: string, fin: string) => Math.round((Date.parse(`${fin}T00:00:00Z`) - Date.parse(`${debut}T00:00:00Z`)) / 86_400_000);

/**
 * Fin d'une étape (0116 § 1.7) : `fin` postérieure à `debut` gardée ; `fin` antérieure ou égale à `debut` lue comme
 * passant minuit, **bornée à 23:59** ; absente (ou `debut` déjà à 23:59), pas de fin.
 */
function finDeLEtape(debut: string, fin: string | undefined): string | undefined {
  if (fin === undefined) return undefined;
  if (minutesDe(fin) > minutesDe(debut)) return fin;
  return minutesDe(debut) < minutesDe(FIN_DU_JOUR) ? FIN_DU_JOUR : undefined;
}

/**
 * Assemblage du programme écrit par l'IA en `Trip`, **sans replanifier** ni retirer (0115 § 3, 0116 § 1.6) :
 * - une journée par date lue, d'indice `date − arrivée + 1` ; `arrivee` et `depart` donnent l'heure des lignes
 *   `terminus` (logement de la nuit, libellé maison), jamais une étape ni une vérification (0116 § 4.1) ;
 * - un créneau avec lieu devient une étape, dans l'ordre écrit : `meal` (midi, soir, apéro), `activity` (visite,
 *   soirée, pause avec lieu) ; nom, heures et `pourquoi` (`reason`) de l'IA, `quartier` en `facts.area`, badge
 *   `toReserve` si `aReserver` ; `placeId` seulement si le lieu est vérifié ; **jamais `toConfirm`** (calculé à la
 *   lecture, 0116 § 5.1) ;
 * - une pause sans lieu devient une ligne `free` : jusqu'à sa `fin` lue comme celle d'une étape (passant minuit :
 *   23:59) ; sans `fin`, jusqu'au `debut` du créneau suivant de l'ordre écrit, sinon 23:59 (0116 § 1.8) ; aucun
 *   créneau n'est retiré ici ;
 * - un segment avant chaque étape **avec** `placeId` et avant le retour au logement, depuis le dernier point avec
 *   identifiant : durée de `trajets`, `null` sinon (A8, 0092 § 4) ; aucun segment vers ni depuis une étape sans
 *   `placeId` ;
 * - les engagements du brief en événements du jour, comme l'assemblage de la chaîne précédente ;
 * - bons plans en lignes « À faire » avant le départ, sans `bookingUrl`, `sponsored: false` (0116 § 6, 0117) ;
 * - aucune proposition au lot 1 (l'alternative nommée par l'IA est au lot 2, 0116 § 5.2).
 */
/** Logement de départ et d'arrivée du jour `index` (1 = J1) : nuit précédente et nuit du jour, bornées au séjour. */
function logementsDuJour(brief: Brief, logements: readonly string[], index: number) {
  const nuits = brief.logements.flatMap((logement, rang) => Array.from({ length: logement.nuits }, () => ({ texte: logement.texte, placeId: logements.at(rang) ?? "" })));
  const nuit = (rang: number) => nuits.at(Math.max(0, Math.min(rang, nuits.length - 1))) ?? { texte: "Logement", placeId: "" };
  return { depart: nuit(index - 2 < 0 ? 0 : index - 2), arrivee: nuit(index - 1) };
}

/**
 * Points de trajet de chaque journée, **seule source** des paires de trajets du programme de l'IA (décision 0116 § 3.3,
 * critère A8) : logement de départ, étapes **avec** `placeId` dans l'ordre écrit, logement d'arrivée ; une étape sans
 * `placeId` est sautée (aucun trajet vers ni depuis elle). Mêmes points que les segments de `assemblerProgrammeIa`.
 */
export function pointsDeTrajet(entree: Pick<EntreeAssemblageIa, "brief" | "jours" | "logements">): string[][] {
  return entree.jours.map((jour) => {
    const { depart, arrivee } = logementsDuJour(entree.brief, entree.logements, joursEntre(entree.brief.arrivee, jour.date) + 1);
    const etapes = jour.creneaux.flatMap((creneau) =>
      creneau.nature === "arrivee" || creneau.nature === "depart" || creneau.lieu === undefined || creneau.placeId === undefined ? [] : [creneau.placeId],
    );
    return [depart.placeId, ...etapes, arrivee.placeId].filter((point) => point !== "");
  });
}

export function assemblerProgrammeIa(entree: EntreeAssemblageIa): ProgrammeCompletIa {
  const { brief } = entree;
  const dernierIndice = joursEntre(brief.arrivee, brief.depart) + 1;
  const terminus: ProgrammeComplet["terminus"] = [];

  const days: Day[] = entree.jours.map((jour) => {
    const index = joursEntre(brief.arrivee, jour.date) + 1;
    const { depart: logementDepart, arrivee: logementArrivee } = logementsDuJour(brief, entree.logements, index);
    const arrivee = jour.creneaux.find((creneau) => creneau.nature === "arrivee");
    const depart = jour.creneaux.find((creneau) => creneau.nature === "depart");
    const contenu = jour.creneaux.filter((creneau) => creneau.nature !== "arrivee" && creneau.nature !== "depart");
    const debutJour = arrivee?.debut ?? (index === 1 ? brief.heureArrivee : (contenu[0]?.debut ?? "09:00"));
    const items: DayLineItem[] = [{ type: "terminus", role: "start", time: debutJour, label: logementDepart.texte }];
    let precedent: string | undefined = logementDepart.placeId === "" ? undefined : logementDepart.placeId;
    let travelMinutes: number | null = 0;
    let derniere = debutJour;
    const segment = (vers: string | undefined): void => {
      const minutes = precedent !== undefined && vers !== undefined ? entree.trajets(precedent, vers) : undefined;
      const valeur = minutes !== undefined && Number.isInteger(minutes) && minutes >= 0 ? minutes : null;
      travelMinutes = travelMinutes === null || valeur === null ? null : travelMinutes + valeur;
      items.push({ type: "segment", segment: { mode: entree.mode, minutes: valeur, estimated: false } });
    };
    let rang = 0;
    for (const [position, creneau] of contenu.entries()) {
      if (creneau.lieu === undefined) {
        // Pause sans lieu (seule nature de `contenu` admise sans lieu par la lecture) : ligne `free`, jamais retirée.
        // 0116 § 1.8 : la `fin` lue selon § 1.7 prévaut (≤ `debut` : bornée à 23:59) ; seulement sans `fin`, le
        // `debut` du créneau suivant de l'ordre écrit, sinon 23:59.
        const suivant = contenu.at(position + 1)?.debut ?? depart?.debut;
        const jusqua =
          creneau.fin !== undefined
            ? (finDeLEtape(creneau.debut, creneau.fin) ?? FIN_DU_JOUR)
            : suivant !== undefined && minutesDe(suivant) > minutesDe(creneau.debut)
              ? suivant
              : FIN_DU_JOUR;
        items.push({ type: "free", from: creneau.debut, to: jusqua });
        derniere = jusqua;
        continue;
      }
      rang += 1;
      const kind: Stop["kind"] = NATURES_REPAS.has(creneau.nature) ? "meal" : "activity";
      const fin = finDeLEtape(creneau.debut, creneau.fin);
      const stop: Stop = {
        id: `j${index}-${rang}`,
        kind,
        ...(creneau.placeId === undefined ? {} : { placeId: creneau.placeId }),
        name: creneau.lieu,
        start: creneau.debut,
        ...(fin === undefined ? {} : { end: fin }),
        facts: {
          ...(fin === undefined ? {} : { durationMinutes: minutesDe(fin) - minutesDe(creneau.debut) }),
          ...(creneau.quartier === undefined ? {} : { area: creneau.quartier }),
        },
        ...(creneau.pourquoi === undefined ? {} : { reason: creneau.pourquoi }),
        exceptions: creneau.aReserver === true ? ["toReserve"] : [],
        locked: false,
      };
      if (creneau.placeId !== undefined) {
        segment(creneau.placeId);
        precedent = creneau.placeId;
      }
      items.push({ type: "stop", stop });
      derniere = fin ?? creneau.debut;
    }
    segment(logementArrivee.placeId === "" ? undefined : logementArrivee.placeId);
    const finJour = depart?.debut ?? (index === dernierIndice ? brief.heureDepart : derniere);
    items.push({ type: "terminus", role: "end", time: minutesDe(finJour) >= minutesDe(derniere) ? finJour : derniere, label: logementArrivee.texte });
    terminus.push({ jour: index, depart: logementDepart.placeId, arrivee: logementArrivee.placeId });
    const events: Stop[] = (brief.engagements ?? [])
      .filter((engagement) => engagement.date === jour.date)
      .map((engagement, rangEvenement) => ({
        id: `j${index}-c${rangEvenement + 1}`,
        kind: "event",
        name: engagement.libelle,
        start: engagement.heure,
        facts: {},
        exceptions: [],
        locked: true,
        commitment: engagement.type,
      }));
    return {
      index,
      date: jour.date,
      items,
      events,
      generating: false,
      travelMinutes,
      travelBudgetMinutes: budgetTrajetDuJour(paceDeRythme(brief.rythme), entree.configuration, false),
    };
  });

  const trip: Trip = {
    id: entree.tripId,
    organizationId: PROTOTYPE_ORG_ID,
    destination: brief.destination,
    destinationColor: destinationColor(brief.destination),
    start: brief.arrivee,
    end: brief.depart,
    timeZone: brief.fuseau,
    travellers: { adults: brief.voyageurs.adultes, children: brief.voyageurs.enfants },
    days,
    checklist: entree.bonsPlans.map((label, rang) => ({ id: `bon-plan-${rang + 1}`, label, when: { type: "beforeDeparture" }, done: false, sponsored: false })),
    unlocked: true,
  };
  TripSchema.parse(trip);
  return { trip, proposals: [], justifications: new Map(), terminus };
}

function paceDeRythme(rythme: Brief["rythme"]): Pace {
  return rythme === "tranquille" ? "relaxed" : rythme === "intense" ? "intense" : "balanced";
}
