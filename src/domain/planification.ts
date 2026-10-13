import { classer, type ParametresClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatEvenement, CandidatMoteur, TypeCreneau } from "@/domain/entrees";
import { dansLesPlages, INCONNU, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";
import type { Creneau, JourSquelette } from "@/domain/squelette";
import { lire } from "@/domain/tables";
import { arrondi5, versMinutes } from "@/domain/temps";

/**
 * Planification déterministe (spécification P0, étapes 7 et 8) : pour chaque jour du squelette, chaque créneau
 * reçoit le premier candidat du classement qui tient dans la journée, respecte les horaires d'ouverture (R4) et
 * laisse la marge de trajet (R5) ; sinon le candidat suivant (aucune réparation par un modèle, P0-PO-7). Un
 * créneau sans candidat reste vide (« aucune option compatible », PO-6) : jamais de relance de la recherche.
 *
 * Validité des lieux, horaires d'ouverture et durées de trajet sont lus **en mémoire** par les interfaces injectées
 * (`relectures.ts`, décision 0045 § 2) ; rien de ce module ne les écrit. Reprise de P0 ; B5b y applique B5-PO-6
 * (mode le plus rapide), B5-PO-12 (engagements) et B5-PO-16 (idées reçues déjà écrites).
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
  /** Index de la nuit du logement de départ et d'arrivée (0045 § 2.2). */
  logementDepart: number;
  logementArrivee: number;
  etapes: EtapePlanifiee[];
  /** Minutes du retour au logement (mémoire seulement). */
  retour: number;
  idee?: { candidatId: string; placeId: string };
  evenements: EvenementPlanifie[];
};

export type EntreePlanification = {
  jours: readonly JourSquelette[];
  /** Candidats notés de la réserve ; seuls ceux qui ont un `placeId` valide sont planifiés (R1). */
  candidats: readonly CandidatMoteur[];
  /** Événements trouvés (ancrés ou non). */
  evenements: readonly CandidatEvenement[];
  relectures: Relectures;
  /** Mode de trajet du calcul (reprise de P0 ; B5b applique B5-PO-6). */
  mode: ModeTrajet;
  parametres: ParametresClassement;
  configuration: ConfigurationMoteur;
  voyage: { start: string; end: string };
};

/** Vrai si l'étape tient dans une plage d'ouverture de la date (plages inconnues : aucune contrainte, B5-PO-5). */
export function ouvert(relectures: Relectures, placeId: string, date: string, debut: number, fin: number): boolean {
  return dansLesPlages(relectures.plages(placeId, date), debut, fin) !== false;
}

function dureeDe(candidat: CandidatMoteur, creneau: Creneau, configuration: ConfigurationMoteur): number {
  const durees = configuration.dureesParDefaut;
  if (creneau.type === "meal") return lire(durees, creneau.repas);
  if (creneau.type === "evening") return durees.evening;
  return candidat.faits.durationMinutes ?? durees.activity;
}

function admisPourCreneau(candidat: CandidatMoteur, creneau: Creneau): boolean {
  if (!candidat.notes.slotFit.includes(creneau.type)) return false;
  if (creneau.type === "meal") return candidat.typeEtape === "meal";
  return candidat.typeEtape === "activity";
}

export function planifier(entree: EntreePlanification): JourPlanifie[] {
  const { relectures, configuration } = entree;
  const marge = configuration.margeMinutes;
  const utilises = new Set<string>();
  const lieuValide = (candidat: { placeId?: string }): string | undefined =>
    candidat.placeId !== undefined && relectures.validite(candidat.placeId) === "valide" ? candidat.placeId : undefined;
  const trajet = (depuis: Point, vers: Point): number | undefined => {
    const minutes = relectures.duree(depuis, vers, entree.mode);
    return minutes === INCONNU ? undefined : minutes;
  };
  const resultat: JourPlanifie[] = [];

  for (const jour of entree.jours) {
    const logementDepart: Point = { logement: jour.logementDepart };
    const logementArrivee: Point = { logement: jour.logementArrivee };
    const etapes: EtapePlanifiee[] = [];
    let position: Point = logementDepart;
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
          const place = lieuValide(candidat);
          return place === undefined ? undefined : trajet(reference, { lieu: place });
        },
        entree.parametres,
      );
      const faisables = classes.flatMap((candidat) => {
        const place = lieuValide(candidat);
        if (place === undefined) return [];
        const aller = trajet(depuis, { lieu: place });
        const retour = trajet({ lieu: place }, logementArrivee);
        if (aller === undefined || retour === undefined) return [];
        const auPlusTot = creneau.type === "activity" ? 0 : creneau.auPlusTot;
        const debut = arrondi5(Math.max(instant + aller + marge, auPlusTot));
        if (creneau.type === "meal" && debut > creneau.auPlusTard) return [];
        const duree = dureeDe(candidat, creneau, configuration);
        const fin = debut + duree;
        if (fin + retour + marge > jour.fin) return [];
        if (jour.fin - jour.debut - (occupe + aller + duree + retour) < jour.tempsLibreMin) return [];
        if (creneau.type === "activity" && fin > limite) return [];
        if (!ouvert(relectures, place, jour.date, debut, fin)) return [];
        return [{ candidat, place, aller, debut, fin }];
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
        trajetAvant: choix.aller,
        options: Math.min(3, faisables.length),
      });
      position = { lieu: choix.place };
      instant = choix.fin;
      occupe += choix.aller + (choix.fin - choix.debut);
    });

    const retour = trajet(position, logementArrivee) ?? 0;

    // Idée « Surprends-moi » : la meilleure activité restante, près du logement du jour (une par jour au plus).
    const restantes = entree.candidats.filter(
      (candidat) => !utilises.has(candidat.id) && candidat.typeEtape === "activity" && candidat.notes.slotFit.includes("activity"),
    );
    const [ideeChoisie] = classer(
      restantes,
      "surprise",
      (candidat) => {
        const place = lieuValide(candidat);
        return place === undefined ? undefined : trajet(logementArrivee, { lieu: place });
      },
      entree.parametres,
    );
    let idee: JourPlanifie["idee"];
    const placeIdee = ideeChoisie === undefined ? undefined : lieuValide(ideeChoisie);
    if (ideeChoisie !== undefined && placeIdee !== undefined) {
      utilises.add(ideeChoisie.id);
      idee = { candidatId: ideeChoisie.id, placeId: placeIdee };
    }

    // Événements du jour, aux dates du séjour seulement (R2), avec une heure lue sur la page.
    const evenements: EvenementPlanifie[] = entree.evenements.flatMap((evenement) => {
      const info = evenement.evenement;
      if (info.heure === undefined || info.date !== jour.date) return [];
      if (info.date < entree.voyage.start || info.date > entree.voyage.end) return [];
      const placeId = evenement.placeId;
      return [{ candidatId: evenement.id, ...(placeId === undefined ? {} : { placeId }), debut: versMinutes(info.heure) }];
    });

    resultat.push({
      squelette: jour,
      logementDepart: jour.logementDepart,
      logementArrivee: jour.logementArrivee,
      etapes,
      retour,
      ...(idee ? { idee } : {}),
      evenements,
    });
  }
  return resultat;
}
