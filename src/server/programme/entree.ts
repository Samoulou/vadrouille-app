import type { Category, Commitment, MobilityMode } from "@/contracts";
import type { BriefEssai, BriefProgramme, RythmeEssai } from "@/server/programme/forme";

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

/**
 * Forme d'`EntreeProgrammeV5` (`src/ai/entrees.ts`, M4a) : les saisies communes de la v4, sans `logements`, plus `villes`,
 * `changements` (sans libellé) et `engagements[].fin`. Égalité de types vérifiée par `tests/unit/programme/cadrage.test.ts`.
 */
export type EntreeProgrammeV5 = Omit<EntreeProgramme, "logements" | "engagements"> & {
  villes: { nom: string; arrivee: string; nuits: number; logement: string }[];
  changements: { date: string; de: string; vers: string; source: "saisi" | "estime"; depart: string; arrivee?: string; activitesMax: number }[];
  engagements?: { libelle: string; date: string; heure: string; fin?: string; type: Commitment }[];
};

/**
 * Entrée du prompt `programme` v5 depuis le `BriefProgramme` (décision 0148 § 8 point 3 ; verdict 0149 § 1.3 point 1 et
 * § 1.2) : copie **champ par champ**, construite depuis la **table des villes** (`villes`, noms maison posés par
 * `briefProgrammeDepuisFormulaire`) et les changements du domaine. **Jamais** un libellé de billet devenu changement de
 * ville (`billets` n'est pas lu), jamais une ville par créneau, jamais une donnée Google ; ni fuseau, ni `schema`, ni mode.
 * Le récit n'y entre que s'il est dans le brief, c'est-à-dire si la garde `RECIT_API_AUTORISE` l'a laissé lire (0139 § 1.2),
 * et jamais avec `{ recit: false }` : brief de la requête `revision` v3 (garde du récit, 0149 § 1.3 point 7).
 */
export function entreeProgrammeV5DepuisBrief(brief: BriefProgramme, options: { readonly recit: boolean } = { recit: true }): EntreeProgrammeV5 {
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
    villes: brief.villes.map((ville) => ({ nom: ville.nom, arrivee: ville.arrivee, nuits: ville.nuits, logement: ville.logement })),
    changements: brief.changements.map((changement) => ({
      date: changement.date,
      de: changement.de,
      vers: changement.vers,
      source: changement.source === "entered" ? ("saisi" as const) : ("estime" as const),
      depart: changement.depart,
      ...(changement.arrivee === undefined ? {} : { arrivee: changement.arrivee }),
      activitesMax: changement.activitesMax,
    })),
    ...(brief.engagements === undefined
      ? {}
      : {
          engagements: brief.engagements.map((engagement) => ({
            libelle: engagement.libelle,
            date: engagement.date,
            heure: engagement.heure,
            ...(engagement.fin === undefined ? {} : { fin: engagement.fin }),
            type: engagement.type,
          })),
        }),
    ...(brief.recit === undefined || !options.recit ? {} : { recit: brief.recit }),
  };
}
