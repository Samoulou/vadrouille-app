import "server-only";

import { CRITERES, type CriteresRapport, type ExecutionSuivie, type ValeurCritere } from "@/contracts/prototype-suivi";
import * as messages from "@/i18n/messages";
import { placeIdsDuProgramme, ProgrammeReduitSchema, type ProgrammeReduit } from "@/prototype/programme-reduit";

/**
 * Rapport d'une exécution finie, sans donnée Google (spécification `specs/P0-suite-2.md`, « Page de lancement » ;
 * décision 0046, D24, S4 et verdict Sécurité P0-Q32, points 1 et 3 ; contenu par défaut tant que Q368 et la question
 * ouverte 8 de 0046 sont sans réponse). Module pur : calculé à l'affichage, en mémoire, jamais écrit en base.
 *
 * Contenu, et rien d'autre : identité de l'exécution (mode, brief, variante, jour de quota, commit), issue, code
 * d'arrêt de S4, critères A1 à A9 **en oui ou non** (« non relevé » pour A9 tant que le canari n'est pas écrit, et pour
 * A1, A2 et A6 si le programme n'est plus lisible), date de la dernière purge réussie. Jamais : coût ni durée en valeur
 * (question ouverte 8), coût Google (Q368), nombre de cases « aucune option compatible » (verdict 3), compteur
 * d'ancrage (Q258), `placeId`, nom, adresse, position ou texte du programme.
 *
 * - A1, A2 et A6 : calculés sur le contenu stocké (forme réduite, sans positions). Les positions ne sont pas lues
 *   (0052 S6) : chaque `placeId` du programme reçoit une position fictive le temps du contrôle de schéma ; leur
 *   présence réelle est garantie par l'écriture, positions et programme ensemble ou rien (0052 § 1.1). La
 *   recomposition complète (positions et durées relues) est celle de la source Neon de P0r4.
 * - A3, A4 et A5 : garantis par construction (validation R1 à R10 en mémoire avant l'écriture) : « oui » si et
 *   seulement si un programme est écrit.
 * - A7 et A8 : « oui » si et seulement si un programme est écrit (S4 : les plafonds de 3 USD et de 15 min arrêtent
 *   l'exécution sans programme).
 */

const t = messages.prototype.lancement.rapport;

const oui = (vrai: boolean): ValeurCritere => (vrai ? "oui" : "non");

/** Contenu stocké contrôlé par le schéma de la forme réduite (positions fictives), ou `null` s'il ne le passe pas. */
function programmeControle(contenu: unknown): ProgrammeReduit | null {
  if (typeof contenu !== "object" || contenu === null || Array.isArray(contenu) || Object.hasOwn(contenu, "positions")) return null;
  let lieux: Set<string>;
  try {
    lieux = placeIdsDuProgramme(contenu as Omit<ProgrammeReduit, "positions">);
  } catch {
    return null;
  }
  const positions = Object.fromEntries([...lieux].map((placeId) => [placeId, { lat: 0, lng: 0 }]));
  const lu = ProgrammeReduitSchema.safeParse({ ...contenu, positions });
  return lu.success ? lu.data : null;
}

/** A2 (R1) : chaque étape de lieu, et l'idée « Surprends-moi », a un `placeId` et une source ; un événement a sa source. */
function etapesDeLieuSourcees(programme: ProgrammeReduit): boolean {
  return programme.trip.days.every(
    (jour) =>
      jour.items.every((ligne) => ligne.type !== "stop" || (ligne.stop.placeId !== undefined && ligne.stop.source !== undefined)) &&
      jour.events.every((evenement) => evenement.source !== undefined) &&
      (jour.surprise === undefined || jour.surprise.placeId !== undefined),
  );
}

/** A6 : au plus 8 propositions (schéma), chacune ancrée ; les manquantes sont des cases « aucune option compatible ». */
function propositionsAncrees(programme: ProgrammeReduit): boolean {
  return programme.proposals.every((proposition) => proposition.stop.placeId !== undefined);
}

/**
 * Critères d'une exécution finie. `contenu` : contenu stocké du programme (`null` s'il n'y en a pas ou plus). Une
 * exécution en cours n'a pas de rapport (erreur de programmation).
 */
export function criteresDuRapport(execution: ExecutionSuivie, contenu: unknown): CriteresRapport {
  if (execution.statut === "en_cours") throw new Error("rapport : exécution en cours");
  const ecrit = execution.statut === "programme_ecrit";
  let a1: ValeurCritere = "non";
  let a2: ValeurCritere = "non";
  let a6: ValeurCritere = "non";
  if (ecrit && contenu === null) {
    a1 = a2 = a6 = "non_releve";
  } else if (ecrit) {
    const programme = programmeControle(contenu);
    a1 = oui(programme !== null);
    a2 = oui(programme !== null && etapesDeLieuSourcees(programme));
    a6 = oui(programme !== null && propositionsAncrees(programme));
  }
  return {
    A1: a1,
    A2: a2,
    A3: oui(ecrit),
    A4: oui(ecrit),
    A5: oui(ecrit),
    A6: a6,
    A7: oui(ecrit),
    A8: oui(ecrit),
    A9: execution.canaryOk === null ? "non_releve" : oui(execution.canaryOk),
  };
}

/** Texte de « Copier le rapport » : lignes fixes, valeurs de listes fermées et identifiants seulement. */
export function texteDuRapport(execution: ExecutionSuivie, criteres: CriteresRapport, dernierePurge: string | null): string {
  const lignes = [
    t.titre,
    `${t.mode} : ${t.modes[execution.mode]}`,
    `${t.brief} : ${execution.brief}`,
    `${t.variante} : ${execution.variante}`,
    `${t.jourQuota} : ${execution.jourQuota}`,
    `${t.commit} : ${execution.commitSha}`,
    `${t.issue} : ${execution.statut === "programme_ecrit" ? t.issues.programme_ecrit : t.issues.arretee}`,
    ...(execution.codeArret === null ? [] : [`${t.codeArret} : ${execution.codeArret}`]),
    ...CRITERES.map((critere) => `${critere} ${t.criteres[critere]} : ${t.valeurs[criteres[critere]]}`),
    `${t.dernierePurge} : ${dernierePurge ?? t.aucunePurge}`,
  ];
  return lignes.join("\n");
}
