import type { ConfigurationMoteur } from "@/domain/configuration";
import type { TypeCreneau } from "@/domain/entrees";
import type { JourSquelette } from "@/domain/squelette";
import { lire } from "@/domain/tables";

/**
 * Demande d'un jour à la recherche et à l'ancrage (ticket 483 ; décisions 0055 § 6 point 3 et 0088 § 5 et § 8) : **module
 * unique**, importé par P0 (`src/server/p0/vers-moteur.ts`, qui le ré-exporte) et par la génération du MVP
 * (`src/server/relecture/planification.ts`, B9c). Fonctions pures du domaine : aucune donnée de lieu, aucun accès. Le test
 * de la borne (`tests/unit/p0/borne-demande-du-jour.test.ts`) vaut pour les deux.
 */

/** Types de créneaux de la première série : activités (dont l'idée du jour), repas, soirée. */
export type TypeSerie = TypeCreneau;
export const TYPES_SERIE: readonly TypeSerie[] = ["activity", "meal", "evening"];

/** `n` lieux de plus pour `type` (sans accès calculé : règle d'import des modules de P0 chargés par `pnpm p0`). */
export function ajouter(demande: Readonly<Record<TypeSerie, number>>, type: TypeSerie, n: number): Record<TypeSerie, number> {
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
