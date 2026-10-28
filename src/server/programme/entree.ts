import type { Category, Commitment, MobilityMode } from "@/contracts";
import type { BriefEssai, RythmeEssai } from "@/server/programme/forme";

/**
 * Entrée du prompt `programme` depuis le brief de l'essai (décision 0115 § 2) : code tiré de
 * `src/server/p0/vers-couche-ia.ts` par M1a-1 (décision 0136 § 1.1), sans changement, partagé par `p0Run` et la vraie
 * app ; `vers-couche-ia.ts` le réexporte (`EntreeProgrammeP0` y reste le nom de `EntreeProgramme`).
 *
 * Module pur, chargé par `pnpm p0` sous Node nu (exception nominative de `ligne/require-server-only`) : n'importe que
 * `@/contracts` et `forme.ts`, en type seulement. Le type rendu est **structurel** : son égalité avec `EntreeProgramme`
 * de `src/ai/entrees.ts` (que ce module n'importe pas) est vérifiée dans `tests/unit/p0/vers-couche-ia.test.ts`.
 */

/** Forme d'`EntreeProgramme` (`src/ai/entrees.ts`) : toutes les saisies du brief de l'essai (décision 0115 § 2). */
export type EntreeProgramme = {
  destination: string;
  pays: string;
  arrivee: string;
  depart: string;
  heureArrivee: string;
  heureDepart: string;
  voyageurs: { adultes: number; enfants: number };
  rythme: RythmeEssai;
  envies: Category[];
  aEviter?: Category[];
  deplacements: MobilityMode[];
  budgetRepas?: 1 | 2 | 3;
  logements: { texte: string; nuits: number }[];
  engagements?: { libelle: string; date: string; heure: string; type: Commitment }[];
  recit?: string;
};

/**
 * Entrée du prompt `programme` depuis le brief de l'essai (décision 0115 § 2 ; décision de Samuel du 2026-10-21 : l'IA
 * reçoit **toutes** les saisies du questionnaire, récit et logement compris, **jamais une donnée Google**). Copie champ
 * par champ : ni fuseau (aucun usage par le modèle), ni `schema`. Les catégories « à éviter » (`aEviter`, lot 5 de
 * E2E-essai) sont recopiées quand la personne en a saisi, absentes sinon. Seul chemin de construction, pour `p0Run`.
 */
export function entreeProgrammeDepuisBrief(brief: BriefEssai): EntreeProgramme {
  return {
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    heureArrivee: brief.heureArrivee,
    heureDepart: brief.heureDepart,
    voyageurs: { adultes: brief.voyageurs.adultes, enfants: brief.voyageurs.enfants },
    rythme: brief.rythme,
    envies: [...brief.envies],
    ...(brief.aEviter === undefined ? {} : { aEviter: [...brief.aEviter] }),
    deplacements: [...brief.deplacements],
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
    logements: brief.logements.map((logement) => ({ texte: logement.texte, nuits: logement.nuits })),
    ...(brief.engagements === undefined
      ? {}
      : { engagements: brief.engagements.map((engagement) => ({ libelle: engagement.libelle, date: engagement.date, heure: engagement.heure, type: engagement.type })) }),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  };
}
