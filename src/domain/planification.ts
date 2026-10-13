import { classer, type ParametresClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatEvenement, CandidatMoteur, TypeCreneau } from "@/domain/entrees";
import { dansLesPlages, INCONNU, type ModeTrajet, type Point, type Relectures } from "@/domain/relectures";
import type { BlocFixe, Creneau, JourSquelette } from "@/domain/squelette";
import { lire } from "@/domain/tables";
import { arrondi5, versMinutes } from "@/domain/temps";

/**
 * Planification déterministe (spécification P0, étapes 7 et 8 ; spécification B5b, point 3) : pour chaque jour du
 * squelette, chaque créneau reçoit le premier candidat du classement qui tient dans la journée, respecte les horaires
 * d'ouverture (R4) et laisse la marge de trajet (R5) ; sinon le candidat suivant (réparation par l'option suivante,
 * sans modèle, P0-PO-7). Un créneau sans candidat reste vide (« aucune option compatible », PO-6) : jamais de
 * relance de la recherche.
 *
 * Validité des lieux, horaires d'ouverture et durées de trajet sont lus **en mémoire** par les interfaces injectées
 * (`relectures.ts`, décision 0045 § 2) ; rien de ce module ne les écrit.
 *
 * Un seul cœur, `planifierJour`, sert deux appelants (décision 0045 § 1.1, un seul moteur) :
 * - `planifier`, la planification de P0 (un seul mode, aucun bloc fixe, tout repas admis), dont la sortie est
 *   inchangée depuis B5a ;
 * - la génération de B5b (`generation.ts`) : mode le plus rapide parmi les modes admis (B5-PO-6), blocs fixes
 *   (engagements, étapes verrouillées ; B5-PO-11, B5-PO-12), repas et soirées seulement s'ils sont choisis (B5-PO-8),
 *   repas laissé ouvert (`openMeal`) quand aucun candidat ne convient.
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
  /** Mode du trajet depuis l'élément précédent (B5-PO-6) ; P0 : son seul mode. */
  modeAvant: ModeTrajet;
  /** Repas : nombre d'options classées pour ce créneau, 3 au plus (cadrage § 3.4). */
  options: number;
};

export type EvenementPlanifie = { candidatId: string; placeId?: string; debut: number };

/** Élément d'un jour planifié, dans l'ordre de la ligne. */
export type ElementPlanifie =
  | { genre: "candidat"; etape: EtapePlanifiee }
  | { genre: "fixe"; bloc: BlocFixe; trajetAvant?: { mode: ModeTrajet; minutes: number } }
  | { genre: "repasLibre"; repas: "lunch" | "dinner"; debut: number; fin: number };

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
  /** Mode de trajet du calcul de P0 (un seul mode). */
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

/** Trajet en mémoire : mode et minutes, ou `undefined` si aucune durée n'est connue (jamais estimée, B5-PO-6). */
export type Trajet = (depuis: Point, vers: Point) => { mode: ModeTrajet; minutes: number } | undefined;

export type ContexteJour = {
  candidats: readonly CandidatMoteur[];
  relectures: Relectures;
  trajet: Trajet;
  parametres: ParametresClassement;
  configuration: ConfigurationMoteur;
  /** Candidats déjà retenus (tous jours confondus) : jamais deux fois dans le voyage. Complété par le cœur. */
  utilises: Set<string>;
  /** Filtre d'admission propre à l'appelant (B5b : repas et soirée choisis, source `https:`, exclusions). */
  admis?: (candidat: CandidatMoteur, creneau: Creneau) => boolean;
  /** Repas sans candidat : laissé ouvert (`openMeal`, B5-PO-8). P0 : faux (créneau omis). */
  repasLibres?: boolean;
};

export type ResultatJour = {
  elements: ElementPlanifie[];
  /** Fin du dernier élément du jour. */
  instant: number;
  /** Trajet de retour au logement du soir ; absent si aucune durée n'est connue. */
  retour?: { mode: ModeTrajet; minutes: number };
};

/**
 * Cœur de la planification d'un jour. Sans bloc fixe ni repas libre, et avec le seul mode de P0, il reproduit la
 * planification de P0 à l'identique (`planifier`).
 *
 * Avec des blocs fixes : un candidat doit finir, trajet et marge compris, avant le prochain bloc ; si aucun candidat
 * du créneau ne tient avant ce bloc, le bloc est posé et le créneau est retenté après lui.
 */
export function planifierJour(jour: JourSquelette, contexte: ContexteJour): ResultatJour {
  const { relectures, configuration } = contexte;
  const marge = configuration.margeMinutes;
  const lieuValide = (candidat: { placeId?: string }): string | undefined =>
    candidat.placeId !== undefined && relectures.validite(candidat.placeId) === "valide" ? candidat.placeId : undefined;
  const logementDepart: Point = { logement: jour.logementDepart };
  const logementArrivee: Point = { logement: jour.logementArrivee };
  const elements: ElementPlanifie[] = [];
  const fixes = [...(jour.fixes ?? [])];
  let position: Point = logementDepart;
  let instant = jour.debut;
  /** Minutes occupées (trajets, étapes, blocs fixes) : le temps libre minimal du rythme est gardé (R8). */
  let occupe = fixes.reduce((total, bloc) => total + (bloc.fin - bloc.debut), 0);

  const poserBloc = (bloc: BlocFixe) => {
    const placeId = bloc.stop.placeId;
    const aller = placeId === undefined ? undefined : contexte.trajet(position, { lieu: placeId });
    elements.push({ genre: "fixe", bloc, ...(aller === undefined ? {} : { trajetAvant: aller }) });
    if (aller !== undefined) occupe += aller.minutes;
    if (placeId !== undefined) position = { lieu: placeId };
    instant = Math.max(instant, bloc.fin);
  };

  jour.creneaux.forEach((creneau, rang) => {
    const suivant = jour.creneaux.at(rang + 1);
    const limite = suivant?.type === "meal" ? suivant.auPlusTard : jour.fin;
    const type: TypeCreneau = creneau.type;

    for (;;) {
      const prochain = fixes.at(0);
      const depuis = position;
      const admis = contexte.candidats.filter(
        (candidat) =>
          !contexte.utilises.has(candidat.id) &&
          admisPourCreneau(candidat, creneau) &&
          (contexte.admis === undefined || contexte.admis(candidat, creneau)),
      );
      // Soirée : la proximité se mesure au logement du soir (cadrage § 3.7).
      const reference = creneau.type === "evening" ? logementArrivee : depuis;
      const classes = classer(
        admis,
        type,
        (candidat) => {
          const place = lieuValide(candidat);
          return place === undefined ? undefined : contexte.trajet(reference, { lieu: place })?.minutes;
        },
        contexte.parametres,
      );
      const faisables = classes.flatMap((candidat) => {
        const place = lieuValide(candidat);
        if (place === undefined) return [];
        const aller = contexte.trajet(depuis, { lieu: place });
        const retour = contexte.trajet({ lieu: place }, logementArrivee);
        if (aller === undefined || retour === undefined) return [];
        const auPlusTot = creneau.type === "activity" ? 0 : creneau.auPlusTot;
        const debut = arrondi5(Math.max(instant + aller.minutes + marge, auPlusTot));
        if (creneau.type === "meal" && debut > creneau.auPlusTard) return [];
        const duree = dureeDe(candidat, creneau, configuration);
        const fin = debut + duree;
        if (fin + retour.minutes + marge > jour.fin) return [];
        if (jour.fin - jour.debut - (occupe + aller.minutes + duree + retour.minutes) < jour.tempsLibreMin) return [];
        if (creneau.type === "activity" && fin > limite) return [];
        if (prochain !== undefined) {
          const placeBloc = prochain.stop.placeId;
          const versBloc = placeBloc === undefined ? { minutes: 0 } : contexte.trajet({ lieu: place }, { lieu: placeBloc });
          if (versBloc === undefined || fin + versBloc.minutes + marge > prochain.debut) return [];
        }
        if (!ouvert(relectures, place, jour.date, debut, fin)) return [];
        return [{ candidat, place, aller, debut, fin }];
      });
      const choix = faisables[0];
      if (choix !== undefined) {
        contexte.utilises.add(choix.candidat.id);
        elements.push({
          genre: "candidat",
          etape: {
            candidatId: choix.candidat.id,
            placeId: choix.place,
            creneau: type,
            ...(creneau.type === "meal" ? { repas: creneau.repas } : {}),
            debut: choix.debut,
            fin: choix.fin,
            trajetAvant: choix.aller.minutes,
            modeAvant: choix.aller.mode,
            options: Math.min(3, faisables.length),
          },
        });
        position = { lieu: choix.place };
        instant = choix.fin;
        occupe += choix.aller.minutes + (choix.fin - choix.debut);
        return;
      }
      // Repas sans candidat : laissé ouvert (B5-PO-8), s'il tient dans sa fenêtre, dans le jour et avant le prochain bloc.
      if (creneau.type === "meal" && contexte.repasLibres === true) {
        const debut = arrondi5(Math.max(instant + marge, creneau.auPlusTot));
        const fin = debut + lire(configuration.dureesParDefaut, creneau.repas);
        const retour = contexte.trajet(position, logementArrivee)?.minutes ?? 0;
        const avantBloc = prochain === undefined || fin + marge <= prochain.debut;
        if (debut <= creneau.auPlusTard && fin + retour + marge <= jour.fin && avantBloc) {
          elements.push({ genre: "repasLibre", repas: creneau.repas, debut, fin });
          instant = fin;
          occupe += fin - debut;
          return;
        }
      }
      // Rien ne tient avant le prochain bloc fixe : le bloc est posé, le créneau est retenté après lui.
      if (prochain === undefined) return;
      fixes.shift();
      poserBloc(prochain);
    }
  });
  for (const bloc of fixes) poserBloc(bloc);

  const retour = contexte.trajet(position, logementArrivee);
  return { elements, instant, ...(retour === undefined ? {} : { retour }) };
}

/** Planification de P0 : un seul mode, aucun bloc fixe, tout repas admis ; idée et événements selon P0. */
export function planifier(entree: EntreePlanification): JourPlanifie[] {
  const { relectures } = entree;
  const utilises = new Set<string>();
  const lieuValide = (candidat: { placeId?: string }): string | undefined =>
    candidat.placeId !== undefined && relectures.validite(candidat.placeId) === "valide" ? candidat.placeId : undefined;
  const trajet: Trajet = (depuis, vers) => {
    const minutes = relectures.duree(depuis, vers, entree.mode);
    return minutes === INCONNU ? undefined : { mode: entree.mode, minutes };
  };
  const resultat: JourPlanifie[] = [];

  for (const jour of entree.jours) {
    const logementArrivee: Point = { logement: jour.logementArrivee };
    const planifie = planifierJour(jour, {
      candidats: entree.candidats,
      relectures,
      trajet,
      parametres: entree.parametres,
      configuration: entree.configuration,
      utilises,
    });
    const etapes = planifie.elements.flatMap((element) => (element.genre === "candidat" ? [element.etape] : []));
    const retour = planifie.retour?.minutes ?? 0;

    // Idée « Surprends-moi » de P0 : la meilleure activité restante, près du logement du jour (une par jour au plus).
    const restantes = entree.candidats.filter(
      (candidat) => !utilises.has(candidat.id) && candidat.typeEtape === "activity" && candidat.notes.slotFit.includes("activity"),
    );
    const [ideeChoisie] = classer(
      restantes,
      "surprise",
      (candidat) => {
        const place = lieuValide(candidat);
        return place === undefined ? undefined : trajet(logementArrivee, { lieu: place })?.minutes;
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
