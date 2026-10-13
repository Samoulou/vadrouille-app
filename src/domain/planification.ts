import { classer, type ParametresClassement } from "@/domain/classement";
import { DUREES, MARGE_MINUTES, type Creneau, type JourSquelette } from "@/domain/squelette";
import { arrondi5, versMinutes } from "@/domain/temps";
import type { AncrageResolu, PlageOuverture, Trajets } from "@/prototype/ancrage";
import type { Candidat, CandidatNote, TypeCreneau } from "@/prototype/candidat";
import { element, lire } from "@/domain/tables";

/**
 * Planification déterministe (spécification P0, étapes 7 et 8) : pour chaque jour du squelette, chaque créneau
 * reçoit le premier candidat du classement qui tient dans la journée, respecte les horaires d'ouverture (R4) et
 * laisse la marge de trajet (R5) ; sinon le candidat suivant (aucune réparation par un modèle, P0-PO-7). Un
 * créneau sans candidat reste vide (« aucune option compatible », PO-6) : jamais de relance de la recherche.
 *
 * Les horaires d'ouverture et les durées de trajet sont lus **en mémoire** ; rien de ce module ne les écrit.
 */

export type EtapePlanifiee = {
  candidatId: string;
  placeId: string;
  creneau: TypeCreneau;
  repas?: "lunch" | "dinner";
  debut: number;
  fin: number;
  /** Minutes de trajet depuis l'étape précédente ou le logement (mémoire seulement). */
  trajetAvant: number;
  /** Repas : nombre d'options classées pour ce créneau, 3 au plus (cadrage § 3.4). */
  options: number;
};

export type EvenementPlanifie = { candidatId: string; placeId?: string; debut: number };

export type JourPlanifie = {
  squelette: JourSquelette;
  logementDepart: string;
  logementArrivee: string;
  etapes: EtapePlanifiee[];
  /** Minutes du retour au logement (mémoire seulement). */
  retour: number;
  idee?: { candidatId: string; placeId: string };
  evenements: EvenementPlanifie[];
};

export type EntreePlanification = {
  jours: JourSquelette[];
  /** Candidats **ancrés** et notés. */
  candidats: readonly CandidatNote[];
  ancrages: ReadonlyMap<string, AncrageResolu>;
  /** Événements trouvés (ancrés ou non), avec leur ancrage s'il existe. */
  evenements: readonly Candidat[];
  /** `placeId` de chaque logement, dans l'ordre du brief. */
  logements: readonly string[];
  trajets: Trajets;
  parametres: ParametresClassement;
  arrivee: string;
  depart: string;
};

/** Vrai si l'étape tient entièrement dans une plage d'ouverture du jour (horaires inconnus : aucune contrainte). */
export function ouvert(horaires: readonly PlageOuverture[] | null, jour: number, debut: number, fin: number): boolean {
  if (horaires === null) return true;
  return horaires.some((plage) => plage.jour === jour && plage.debut <= debut && fin <= plage.fin);
}

function dureeDe(candidat: CandidatNote, creneau: Creneau): number {
  if (creneau.type === "meal") return lire(DUREES, creneau.repas);
  if (creneau.type === "evening") return DUREES.evening;
  return candidat.dureeMinutes ?? DUREES.activity;
}

function admisPourCreneau(candidat: CandidatNote, creneau: Creneau): boolean {
  if (!candidat.notes.slotFit.includes(creneau.type)) return false;
  if (creneau.type === "meal") return candidat.typeEtape === "meal";
  return candidat.typeEtape === "activity";
}

export function planifier(entree: EntreePlanification): JourPlanifie[] {
  const utilises = new Set<string>();
  const placeDe = (candidat: { id: string }) => entree.ancrages.get(candidat.id)?.placeId;
  const resultat: JourPlanifie[] = [];

  for (const jour of entree.jours) {
    const logementDepart = element(entree.logements, jour.logementDepart) ?? entree.logements[0] ?? "";
    const logementArrivee = element(entree.logements, jour.logementArrivee) ?? entree.logements[0] ?? "";
    const etapes: EtapePlanifiee[] = [];
    let position = logementDepart;
    let instant = jour.debut;
    /** Minutes occupées (trajets et étapes) : le temps libre minimal du rythme est gardé (R8). */
    let occupe = 0;

    jour.creneaux.forEach((creneau, rang) => {
      const suivant = jour.creneaux.at(rang + 1);
      const limite = suivant?.type === "meal" ? suivant.auPlusTard : jour.fin;
      const type: TypeCreneau = creneau.type;
      const depuis = position;
      const admis = entree.candidats.filter((candidat) => !utilises.has(candidat.id) && admisPourCreneau(candidat, creneau));
      // Soirée : la proximité se mesure au logement du soir (cadrage § 3.7).
      const reference = creneau.type === "evening" ? logementArrivee : depuis;
      const classes = classer(
        admis,
        type,
        (candidat) => {
          const place = placeDe(candidat);
          return place === undefined ? undefined : entree.trajets(reference, place);
        },
        entree.parametres,
      );
      const faisables = classes.flatMap((candidat) => {
        const place = placeDe(candidat);
        const ancrage = entree.ancrages.get(candidat.id);
        if (place === undefined || ancrage === undefined) return [];
        const trajet = entree.trajets(depuis, place);
        const retour = entree.trajets(place, logementArrivee);
        if (trajet === undefined || retour === undefined) return [];
        const auPlusTot = creneau.type === "activity" ? 0 : creneau.auPlusTot;
        const debut = arrondi5(Math.max(instant + trajet + MARGE_MINUTES, auPlusTot));
        if (creneau.type === "meal" && debut > creneau.auPlusTard) return [];
        const duree = dureeDe(candidat, creneau);
        const fin = debut + duree;
        if (fin + retour + MARGE_MINUTES > jour.fin) return [];
        if (jour.fin - jour.debut - (occupe + trajet + duree + retour) < jour.tempsLibreMin) return [];
        if (creneau.type === "activity" && fin > limite) return [];
        if (!ouvert(ancrage.horaires, jour.jourSemaine, debut, fin)) return [];
        return [{ candidat, place, trajet, debut, fin }];
      });
      const choix = faisables[0];
      if (choix === undefined) return;
      utilises.add(choix.candidat.id);
      etapes.push({
        candidatId: choix.candidat.id,
        placeId: choix.place,
        creneau: type,
        ...(creneau.type === "meal" ? { repas: creneau.repas } : {}),
        debut: choix.debut,
        fin: choix.fin,
        trajetAvant: choix.trajet,
        options: Math.min(3, faisables.length),
      });
      position = choix.place;
      instant = choix.fin;
      occupe += choix.trajet + (choix.fin - choix.debut);
    });

    const retour = entree.trajets(position, logementArrivee) ?? 0;

    // Idée « Surprends-moi » : la meilleure activité restante, près du logement du jour (une par jour au plus).
    const restantes = entree.candidats.filter(
      (candidat) => !utilises.has(candidat.id) && candidat.typeEtape === "activity" && candidat.notes.slotFit.includes("activity"),
    );
    const [ideeChoisie] = classer(
      restantes,
      "surprise",
      (candidat) => {
        const place = placeDe(candidat);
        return place === undefined ? undefined : entree.trajets(logementArrivee, place);
      },
      entree.parametres,
    );
    let idee: JourPlanifie["idee"];
    const placeIdee = ideeChoisie === undefined ? undefined : placeDe(ideeChoisie);
    if (ideeChoisie !== undefined && placeIdee !== undefined) {
      utilises.add(ideeChoisie.id);
      idee = { candidatId: ideeChoisie.id, placeId: placeIdee };
    }

    // Événements du jour, aux dates du séjour seulement (R2), avec une heure lue sur la page.
    const evenements: EvenementPlanifie[] = entree.evenements.flatMap((evenement) => {
      const info = evenement.evenement;
      if (info === undefined || info.heure === undefined || info.date !== jour.date) return [];
      if (info.date < entree.arrivee || info.date > entree.depart) return [];
      const placeId = placeDe(evenement);
      return [{ candidatId: evenement.id, ...(placeId === undefined ? {} : { placeId }), debut: versMinutes(info.heure) }];
    });

    resultat.push({ squelette: jour, logementDepart, logementArrivee, etapes, retour, ...(idee ? { idee } : {}), evenements });
  }
  return resultat;
}
