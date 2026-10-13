import { z } from "zod";

import type { CandidatMoteur, TypeCreneau } from "@/domain/entrees";
import { joursEntre } from "@/domain/temps";
import { lire } from "@/domain/tables";

/**
 * Classement déterministe (spécification P0, étape 7 ; cadrage § 3.7). La formule vit dans `classement.json`
 * (A2), jamais dans un prompt ; le coût de trajet n'est jamais donné à un modèle.
 *
 * score = envies + incontournable − risque « Pas pour moi » + classe de source − source ancienne
 *         − coût d'une minute de trajet (selon le type d'étape) × minutes.
 * La distance est un coût, pas un filtre : un incontournable loin reste classé.
 */

const poids = z.number().finite().min(0).max(100);
const poidsSigne = z.number().finite().min(-100).max(100);
const coutMinute = z.number().finite().min(0).max(10);

/**
 * Formule de classement (fichier `prototype/config/classement.json`, propriétaire ia-recherche, décision 0032 A2) :
 * nombres bornés et énumérations fermées, **aucune chaîne libre**. Le schéma vit dans `src/domain`, seul module qui
 * l'applique (décision 0045 § 1.4, amendement de 0032 A2) ; jamais écrit dans un prompt. Les clés `activity`,
 * `meal`, `evening` sont celles de `TYPES_CRENEAU`, et `officielle`, `independante`, `generique` celles de
 * `CLASSES_SOURCE` (`entrees.ts`).
 */
export const ConfigClassementSchema = z.strictObject({
  schema: z.literal(1),
  poids: z.strictObject({
    /** Bonus quand le candidat correspond aux envies. */
    matchesWishes: poids,
    /** Bonus d'un incontournable. */
    mustSee: poids,
    /** Malus par point de risque « Pas pour moi » au-dessus de 1. */
    notForMeRisk: poids,
    /** Bonus ou malus selon la classe de la source. */
    source: z.strictObject({ officielle: poidsSigne, independante: poidsSigne, generique: poidsSigne }),
    /** Malus d'une source plus ancienne que `ageSourceMaxJours`. */
    sourceAncienne: poids,
  }),
  /** Traitement d'un candidat qui ne correspond pas aux envies : écarté, ou seulement pénalisé. */
  matchesWishesNon: z.enum(["exclure", "penaliser"]),
  /** Malus d'un candidat qui ne correspond pas aux envies, quand il est pénalisé. */
  penaliteHorsEnvies: poids,
  /** Les incontournables passent avant les autres activités, ou seulement par leur poids. */
  prioriteMustSee: z.enum(["avant", "poids"]),
  /** Coût d'une minute de trajet, par type d'étape (cadrage § 3.7 : la distance est un coût, pas un filtre). */
  coutTrajetParMinute: z.strictObject({ activity: coutMinute, meal: coutMinute, evening: coutMinute, surprise: coutMinute }),
});
export type ConfigClassement = z.infer<typeof ConfigClassementSchema>;

export type ParametresClassement = {
  classement: ConfigClassement;
  ageSourceMaxJours: number;
  /** Date de référence (AAAA-MM-JJ), passée en entrée : jamais lue sur une horloge (0045 § 3.4). */
  dateReference: string;
};

/** Candidat classé : notes et sources suffisent (candidat de la réserve ou d'idée). */
export type CandidatClasse = Pick<CandidatMoteur, "id" | "notes" | "sources">;

/** Candidat admis au classement : `matchesWishes` à « non » l'en écarte si la formule le demande. */
export function estAdmis(candidat: CandidatClasse, parametres: ParametresClassement): boolean {
  return candidat.notes.matchesWishes || parametres.classement.matchesWishesNon !== "exclure";
}

/** Score sans trajet. */
export function scoreBase(candidat: CandidatClasse, parametres: ParametresClassement): number {
  const { poids, penaliteHorsEnvies } = parametres.classement;
  const { notes } = candidat;
  let score = notes.matchesWishes ? poids.matchesWishes : -penaliteHorsEnvies;
  if (notes.mustSee) score += poids.mustSee;
  score -= poids.notForMeRisk * (notes.notForMeRisk - 1);
  // Source principale : la première (P0 n'en a qu'une ; B5b fixera la règle à plusieurs sources).
  const source = candidat.sources.at(0);
  if (source !== undefined) {
    score += lire(poids.source, source.classe);
    if (joursEntre(source.date, parametres.dateReference) > parametres.ageSourceMaxJours) score -= poids.sourceAncienne;
  }
  return score;
}

export type TypeCout = TypeCreneau | "surprise";

/** Score avec le coût de trajet du type d'étape. */
export function score(
  candidat: CandidatClasse,
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
export function classer<C extends CandidatClasse>(
  candidats: readonly C[],
  type: TypeCout,
  trajet: (candidat: C) => number | undefined,
  parametres: ParametresClassement,
): C[] {
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
