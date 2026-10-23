import "server-only";

import type { Pace, TripCommitment } from "@/contracts";
import { classer, ConfigClassementSchema, type ConfigClassement, type ParametresClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatEvenement, CandidatMoteur } from "@/domain/entrees";
import { identifiantVoyage, identifiantVoyageSaisi } from "@/domain/identifiant";
import { planifier, type JourPlanifie } from "@/domain/planification";
import type { ModeTrajet, Relectures } from "@/domain/relectures";
import { squelette, type JourSquelette } from "@/domain/squelette";
import type { TypeSerie } from "@/server/p0/vers-moteur";

/**
 * Passage au moteur de l'étape finale de `p0Run` (P0r3c-5, ticket 352 ; décision 0063 point 10 et réponse 2 du Tech
 * Lead à la revue de la PR 348 ; 0055 § 6 points 1, 3 et 4 ; 0011 § 7). `src/workflows/p0-run.ts` est un pont qui
 * n'atteint jamais `src/domain` qu'à travers `src/server` (0048 § 1, bloquant 1 de la PR 348) : ce module est ce
 * passage, avec `assemblage.ts` et `vers-moteur.ts`. **Moteur seulement** : squelette, classement, planification et
 * identifiant, déterministes, en mémoire, sans appel ni écriture ; il ne voit que des types du moteur (jamais une
 * réponse Google brute : les fiches arrivent par les `Relectures` construites par `vers-moteur.ts`).
 */


/** Formule de classement de `prototype/config/classement.json`, validée par le schéma du moteur ; invalide : `undefined`. */
export function lireClassement(brut: unknown): ConfigClassement | undefined {
  const lu = ConfigClassementSchema.safeParse(brut);
  return lu.success ? lu.data : undefined;
}

export type EntreeJours = {
  readonly voyage: { readonly start: string; readonly end: string };
  readonly pace: Pace;
  readonly nombreDeNuits: number;
  readonly engagements: readonly TripCommitment[];
  readonly configuration: ConfigurationMoteur;
};

/** Squelette du séjour, celui de P0 (`squelette`, budget de trajet entier). */
export function joursDuSejour(entree: EntreeJours): JourSquelette[] {
  return squelette({ ...entree, budgetTrajetReduit: false });
}

/** Candidat admis pour un type de créneau (mêmes règles que `planifierJour`). */
function admis(candidat: CandidatMoteur, type: TypeSerie): boolean {
  if (!candidat.notes.slotFit.includes(type)) return false;
  return type === "meal" ? candidat.typeEtape === "meal" : candidat.typeEtape === "activity";
}

/**
 * Classement de l'étape finale **avant les fiches** (0055 § 6 point 3 : fiches « dans l'ordre du classement »), par type
 * de créneau : formule de `classement.json` sans coût de trajet, aucune position n'étant connue avant la fiche (la
 * distance reste un coût, appliqué ensuite par la planification sur les durées Routes ; cadrage § 3.7). Un candidat
 * peut figurer dans plusieurs listes ; l'appelant ne le retient qu'une fois.
 */
export function classementParType(candidats: readonly CandidatMoteur[], parametres: ParametresClassement): Record<TypeSerie, CandidatMoteur[]> {
  const par = (type: TypeSerie) =>
    classer(
      candidats.filter((candidat) => admis(candidat, type)),
      type,
      () => 0,
      parametres,
    );
  return { activity: par("activity"), meal: par("meal"), evening: par("evening") };
}

export type EntreeJour = {
  readonly jour: JourSquelette;
  /** Candidats regroupés pour ce jour, avec leur `placeId` de la fiche de l'étape finale. */
  readonly candidats: readonly CandidatMoteur[];
  readonly evenements: readonly CandidatEvenement[];
  readonly relectures: Relectures;
  readonly mode: ModeTrajet;
  readonly parametres: ParametresClassement;
  readonly configuration: ConfigurationMoteur;
  readonly voyage: { readonly start: string; readonly end: string };
};

/**
 * Planification d'un jour par le moteur de P0 (`planifier`), sur les seuls candidats de son groupe : leurs durées sont
 * celles de la matrice Routes du jour, et un candidat d'un autre groupe n'a pas de durée connue depuis ce jour.
 */
export function planifierLeJour(entree: EntreeJour): JourPlanifie {
  const [jour] = planifier({ ...entree, jours: [entree.jour] });
  if (jour === undefined) throw new Error("moteur : jour non planifié");
  return jour;
}

/**
 * Identifiant du voyage : `proto_<destination>_<jour de quota>_<rang de l'exécution dans le jour>`. Plusieurs exécutions
 * par jour de quota depuis la décision 0071 : le rang (`numeroDuJour`, lu en base) rend l'identifiant unique. Au-delà
 * de 999 exécutions le même jour, `identifiantVoyage` refuse (l'exécution s'arrête `pipeline_failed`, sans programme).
 */
export function identifiantDuVoyage(destination: string, jourQuota: string, numeroDuJour: number): string {
  return identifiantVoyage(destination, jourQuota, numeroDuJour);
}

/**
 * Identifiant du voyage d'une exécution lancée depuis l'app sur un brief saisi (décision 0125 § 2) :
 * `proto_<destination>_<uuid de l'exécution>`, le même au lancement (écran 5) et à l'écriture du programme.
 */
export function identifiantDuVoyageSaisi(destination: string, runId: string): string {
  return identifiantVoyageSaisi(destination, runId);
}
