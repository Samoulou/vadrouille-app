import { joursEntre } from "@/domain/temps";
import type { CandidatNote, TypeCreneau } from "@/prototype/candidat";
import type { ConfigClassement } from "@/prototype/config";
import { lire } from "@/domain/tables";

/**
 * Classement déterministe (spécification P0, étape 7 ; cadrage § 3.7). La formule vit dans `classement.json`
 * (A2), jamais dans un prompt ; le coût de trajet n'est jamais donné à un modèle.
 *
 * score = envies + incontournable − risque « Pas pour moi » + classe de source − source ancienne
 *         − coût d'une minute de trajet (selon le type d'étape) × minutes.
 * La distance est un coût, pas un filtre : un incontournable loin reste classé.
 */

export type ParametresClassement = {
  classement: ConfigClassement;
  ageSourceMaxJours: number;
  dateExecution: string;
};

/** Candidat admis au classement : `matchesWishes` à « non » l'en écarte si la formule le demande. */
export function estAdmis(candidat: CandidatNote, parametres: ParametresClassement): boolean {
  return candidat.notes.matchesWishes || parametres.classement.matchesWishesNon !== "exclure";
}

/** Score sans trajet. */
export function scoreBase(candidat: CandidatNote, parametres: ParametresClassement): number {
  const { poids, penaliteHorsEnvies } = parametres.classement;
  const { notes } = candidat;
  let score = notes.matchesWishes ? poids.matchesWishes : -penaliteHorsEnvies;
  if (notes.mustSee) score += poids.mustSee;
  score -= poids.notForMeRisk * (notes.notForMeRisk - 1);
  score += lire(poids.source, candidat.source.classe);
  if (joursEntre(candidat.source.date, parametres.dateExecution) > parametres.ageSourceMaxJours) {
    score -= poids.sourceAncienne;
  }
  return score;
}

export type TypeCout = TypeCreneau | "surprise";

/** Score avec le coût de trajet du type d'étape. */
export function score(
  candidat: CandidatNote,
  minutesDeTrajet: number,
  type: TypeCout,
  parametres: ParametresClassement,
): number {
  return scoreBase(candidat, parametres) - lire(parametres.classement.coutTrajetParMinute, type) * minutesDeTrajet;
}

/**
 * Ordonne des candidats pour un créneau : incontournables d'abord si la formule le demande (activités et idées
 * seulement), puis score décroissant, puis identifiant (ordre total, donc déterministe).
 */
export function classer(
  candidats: readonly CandidatNote[],
  type: TypeCout,
  trajet: (candidat: CandidatNote) => number | undefined,
  parametres: ParametresClassement,
): CandidatNote[] {
  const avecScore = candidats.flatMap((candidat) => {
    if (!estAdmis(candidat, parametres)) return [];
    const minutes = trajet(candidat);
    if (minutes === undefined) return [];
    return [{ candidat, valeur: score(candidat, minutes, type, parametres) }];
  });
  const prioriteIncontournable =
    parametres.classement.prioriteMustSee === "avant" && (type === "activity" || type === "surprise");
  avecScore.sort((a, b) => {
    if (prioriteIncontournable && a.candidat.notes.mustSee !== b.candidat.notes.mustSee) {
      return a.candidat.notes.mustSee ? -1 : 1;
    }
    if (a.valeur !== b.valeur) return b.valeur - a.valeur;
    return a.candidat.id < b.candidat.id ? -1 : a.candidat.id > b.candidat.id ? 1 : 0;
  });
  return avecScore.map((entree) => entree.candidat);
}
