import type { Trip } from "@/contracts";
import { ouvert } from "@/domain/planification";
import { ACTIVITES_PAR_RYTHME, DEBUT_JOUR, FIN_JOUR, MARGE_MINUTES, TEMPS_LIBRE_MIN } from "@/domain/squelette";
import { jourSemaine, versMinutes } from "@/domain/temps";
import type { AncrageResolu, Trajets } from "@/prototype/ancrage";
import { estAncre } from "@/prototype/ancrage";
import type { Brief } from "@/prototype/brief";
import { lire } from "@/domain/tables";

/**
 * Validateurs R1, R2, R4, R5, R6 et R8 du cadrage (§ 8) sur le programme complet, en mémoire (spécification P0,
 * étape 10). R3 et R10 sont sans objet sans révision ; R7 est sans objet dans P0 (P0-PO-6, état « après tri, tout
 * gardé ») ; R9 n'est calculé que si une source donne un prix.
 *
 * Ils renvoient des **compteurs** par règle, sans détail par lieu : le rapport ne contient que ces nombres.
 */

export const REGLES = ["R1", "R2", "R4", "R5", "R6", "R8"] as const;
export type Regle = (typeof REGLES)[number];
export type Violations = Record<Regle, number>;

export type ContexteValidation = {
  brief: Brief;
  /** Ancrages en mémoire, par `placeId`. */
  ancrages: ReadonlyMap<string, AncrageResolu>;
  trajets: Trajets;
  /** `placeId` des logements de départ et d'arrivée attendus, par jour. */
  terminus: readonly { jour: number; depart: string; arrivee: string }[];
  /** `placeId` attendus des logements, par jour (squelette). */
  logementsAttendus: readonly { jour: number; depart: string; arrivee: string }[];
  /** Identifiants des événements dont la page relue ne confirme pas la date. */
  evenementsNonConfirmes: ReadonlySet<string>;
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

export function valider(trip: Trip, contexte: ContexteValidation): Violations {
  const violations: Violations = { R1: 0, R2: 0, R4: 0, R5: 0, R6: 0, R8: 0 };
  const { brief } = contexte;

  for (const day of trip.days) {
    const stops = day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
    const jour = jourSemaine(day.date);

    // R1 : tout lieu est ancré (identifiant valide, non fermé définitivement) et a une source web.
    for (const stop of [...stops, ...(day.surprise ? [{ ...day.surprise, kind: "activity" as const }] : [])]) {
      const ancrage = stop.placeId === undefined ? undefined : contexte.ancrages.get(stop.placeId);
      if (!estAncre(ancrage) || stop.source === undefined || !urlSourceValide(stop.source.url)) violations.R1 += 1;
    }
    for (const evenement of day.events) {
      if (evenement.commitment !== undefined) continue;
      const lieuInvalide = evenement.placeId !== undefined && !estAncre(contexte.ancrages.get(evenement.placeId));
      if (lieuInvalide || evenement.source === undefined || !urlSourceValide(evenement.source.url)) violations.R1 += 1;
    }

    // R2 : aucun événement hors du séjour ; un événement sans date confirmée porte « unconfirmed ».
    for (const evenement of day.events) {
      if (day.date < brief.arrivee || day.date > brief.depart) violations.R2 += 1;
      if (contexte.evenementsNonConfirmes.has(evenement.id) && !evenement.exceptions.includes("unconfirmed")) {
        violations.R2 += 1;
      }
    }

    // R4 : horaires d'ouverture respectés (sinon l'étape aurait dû être retirée : le prototype ne marque jamais « à confirmer »).
    for (const stop of stops) {
      if (stop.placeId === undefined || stop.end === undefined) continue;
      const ancrage = contexte.ancrages.get(stop.placeId);
      if (ancrage && !ouvert(ancrage.horaires, jour, versMinutes(stop.start), versMinutes(stop.end))) violations.R4 += 1;
    }

    // R5 : trajets faisables avec marge entre étapes consécutives.
    for (let index = 1; index < stops.length; index += 1) {
      const avant = stops.at(index - 1);
      const apres = stops.at(index);
      if (!avant?.placeId || !apres?.placeId || !avant.end) continue;
      const trajet = contexte.trajets(avant.placeId, apres.placeId);
      if (trajet === undefined || versMinutes(apres.start) < versMinutes(avant.end) + trajet + MARGE_MINUTES) violations.R5 += 1;
    }

    // R6 : chaque journée part du bon logement et y revient.
    const premier = day.items[0];
    const dernier = day.items.at(-1);
    const attendu = contexte.logementsAttendus.find((entree) => entree.jour === day.index);
    const ecrit = contexte.terminus.find((entree) => entree.jour === day.index);
    if (
      premier?.type !== "terminus" ||
      premier.role !== "start" ||
      dernier?.type !== "terminus" ||
      dernier.role !== "end" ||
      attendu === undefined ||
      ecrit === undefined ||
      attendu.depart !== ecrit.depart ||
      attendu.arrivee !== ecrit.arrivee
    ) {
      violations.R6 += 1;
    }

    // R8 : rythme respecté (nombre d'activités) et temps libre minimal sur un jour complet.
    // La soirée est une étape de kind « activity » : elle s'ajoute au nombre d'activités du rythme.
    const activites = stops.filter((stop) => stop.kind === "activity").length;
    if (activites > lire(ACTIVITES_PAR_RYTHME, brief.rythme) + 1) violations.R8 += 1;
    const complet = day.date !== brief.arrivee && day.date !== brief.depart;
    if (complet) {
      // Temps libre = fenêtre du jour − étapes − trajets (même définition que le planificateur).
      const etapes = stops.reduce((total, stop) => total + (stop.end ? versMinutes(stop.end) - versMinutes(stop.start) : 0), 0);
      const libre = FIN_JOUR - DEBUT_JOUR - etapes - day.travelMinutes;
      if (libre < lire(TEMPS_LIBRE_MIN, brief.rythme)) violations.R8 += 1;
    }
  }
  return violations;
}
