import type { Category, Commitment, MobilityMode, Pace, StopKind } from "@/contracts";
import type { Brief, Rythme } from "@/prototype/brief";
import type { Candidat } from "@/prototype/candidat";

/**
 * Adaptateur de P0 vers les types de production de la couche IA (décision 0077 § 1 point 5 ; amende la spécification
 * B7a point 2 comme 0063 l'a fait pour `vers-moteur.ts`) : **seul** fichier qui convertit le brief, la configuration et
 * les candidats de P0 (`src/prototype`) vers ce que reçoivent `src/ai` et `src/research`. Un seul adaptateur pour
 * `pnpm p0` (`scripts/p0/pipeline.ts`) et `p0Run` (`src/workflows/p0-run.ts`, `src/server/composition/p0-reel.ts`).
 *
 * Même régime que `vers-moteur.ts` : chargé par `pnpm p0` sous Node nu (exception nominative de
 * `ligne/require-server-only`), module pur, n'importe que `@/contracts` et, **en `import type`**, les feuilles
 * `brief` et `candidat` de `src/prototype`. Il n'importe ni `src/ai` ni `src/research` (aucun fichier de l'application
 * ne les atteint hors des ponts de P0, 0048 § 1) : les types rendus sont **structurels**, et leur égalité avec
 * `EntreeModeles`, `CandidatPourModele`, `LieuRetenu`, `ComplementP0`, `BornesRecherche` et `DonneesProtegees` est
 * vérifiée dans `tests/unit/p0/vers-couche-ia.test.ts`.
 *
 * - rythme : `tranquille`, `equilibre`, `intense` → `relaxed`, `balanced`, `intense` (le constructeur de requêtes le
 *   rend dans le libellé de P0 : octets des requêtes de P0 inchangés) ;
 * - récit et logements du brief → `ComplementP0`, **jamais** un champ de l'entrée (B7-PO-1) ;
 * - configuration de recherche → bornes, sans délai ;
 * - candidat de P0 → projection de `vuePourModele` (cinq champs) ; lieu retenu → plus le domaine de sa source.
 */

/** Forme d'`EntreeModeles` (`src/ai/entrees.ts`). */
export type EntreeModelesP0 = {
  destination: string;
  pays?: string;
  arrivee: string;
  depart: string;
  voyageurs: { adultes: number; enfants: number };
  rythme: Pace;
  envies: Category[];
  limites?: Category[];
  deplacements: MobilityMode[];
  budgetRepas?: 1 | 2 | 3;
  budgetRepasChf?: number;
};

/** Forme de `ComplementP0` (`src/ai/complement-p0.ts`). */
export type ComplementP0Structurel = { readonly recit?: string; readonly logements: readonly string[] };

/** Forme de `CandidatPourModele` (`src/ai/entrees.ts`). */
export type CandidatPourModeleP0 = { id: string; nom: string; resume: string; categorie: Category; typeEtape: StopKind };

/** Forme de `LieuRetenu` (`src/ai/entrees.ts`). */
export type LieuRetenuP0 = CandidatPourModeleP0 & { sourceDomaine: string; secteur?: string; incontournable?: true };

/** Forme de `BornesRecherche` (`src/research/bornes.ts`), sans délai. */
export type BornesRechercheP0 = {
  ciblesParCreneau: { activity: number; meal: number; evening: number };
  totalCandidats: number;
  toursMax: number;
  ageSourceMaxJours: number;
};

/** Forme de `DonneesProtegees` (`src/research/agent.ts`). */
export type DonneesProtegeesP0 = {
  readonly destination: string;
  readonly pays?: string;
  readonly logements?: readonly { readonly texte: string }[];
  readonly engagements?: readonly { readonly libelle: string }[];
  readonly recit?: string;
};

function paceDepuisRythme(rythme: Rythme): Pace {
  switch (rythme) {
    case "tranquille":
      return "relaxed";
    case "equilibre":
      return "balanced";
    case "intense":
      return "intense";
  }
}

/**
 * Entrée de production depuis le brief de P0 : ville, dates, voyageurs, rythme, envies, déplacements, budget des repas
 * (niveau de P0). Ni récit, ni logement, ni engagement, ni fuseau, ni heure : `complementDepuisBrief` porte les deux
 * premiers, pour P0 seulement.
 */
export function entreeModelesDepuisBrief(brief: Brief): EntreeModelesP0 {
  return {
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    voyageurs: { adultes: brief.voyageurs.adultes, enfants: brief.voyageurs.enfants },
    rythme: paceDepuisRythme(brief.rythme),
    envies: [...brief.envies],
    deplacements: [...brief.deplacements],
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
  };
}

/** Récit et textes des logements du brief de P0 (`ComplementP0`), transmis seulement par `pnpm p0` et `p0Run`. */
export function complementDepuisBrief(brief: Brief): ComplementP0Structurel {
  return {
    logements: brief.logements.map((logement) => logement.texte),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  };
}

/** Textes que les requêtes web de l'agent ne doivent jamais reprendre (filtre de la PR 326, inchangé). */
export function donneesProtegeesDepuisBrief(brief: Brief): DonneesProtegeesP0 {
  return {
    destination: brief.destination,
    pays: brief.pays,
    logements: brief.logements.map((logement) => ({ texte: logement.texte })),
    ...(brief.engagements === undefined ? {} : { engagements: brief.engagements.map((engagement) => ({ libelle: engagement.libelle })) }),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  };
}

/** Bornes de recherche depuis `recherche.json` de P0 (forme structurelle de `ConfigRecherche`) ; aucun délai. */
export function bornesDepuisConfig(config: {
  readonly ciblesParCreneau: { readonly activity: number; readonly meal: number; readonly evening: number };
  readonly totalCandidats: number;
  readonly toursMax: number;
  readonly ageSourceMaxJours: number;
}): BornesRechercheP0 {
  return {
    ciblesParCreneau: { activity: config.ciblesParCreneau.activity, meal: config.ciblesParCreneau.meal, evening: config.ciblesParCreneau.evening },
    totalCandidats: config.totalCandidats,
    toursMax: config.toursMax,
    ageSourceMaxJours: config.ageSourceMaxJours,
  };
}

/**
 * Marge des cibles de la recherche sur la demande du séjour, en pour cent (ticket 483) : couvre les candidats perdus à
 * l'ancrage (non résolus, hors zone), à la notation (sans note, `slotFit` qui ne convient pas) et aux fiches (fermés).
 */
export const MARGE_CIBLES_POURCENT = 30;

/**
 * Bornes de recherche de l'exécution comptée **calculées depuis la demande du séjour** (ticket 483 ; essai rome-1 du
 * 2026-10-18 : 23 candidats pour 32 lieux demandés, derniers jours vides) : par créneau, la plus grande de la cible de
 * `recherche.json` et de la demande de la première série (`demandeDuJour` bornée, sommée sur les jours) augmentée de
 * `MARGE_CIBLES_POURCENT` (arrondi au-dessus). Total visé : le plus grand du total de `recherche.json` et de la somme des
 * cibles. Le tout borné par `plafond` (candidats que l'exécution peut trouver et ancrer) : au-delà, chaque cible est
 * réduite en proportion (arrondi au-dessous). `toursMax` et `ageSourceMaxJours` restent ceux de la configuration.
 * Plafond inférieur à 1 (aucun candidat ancrable, par exemple `placesTextSearch − 2 × logements` ≤ 0) : `null`, l'appelant
 * s'arrête au lieu de chercher (mineur 10 de la revue de la PR #490). Seul chemin de calcul des cibles, pour `p0Run`
 * comme pour `pnpm p0` (mineur 3) ; la demande vient de `demandesDuSejour` (`vers-moteur.ts`).
 */
export function bornesDepuisDemande(
  config: Parameters<typeof bornesDepuisConfig>[0],
  demande: { readonly activity: number; readonly meal: number; readonly evening: number },
  plafond: number,
): BornesRechercheP0 | null {
  if (!(Math.floor(plafond) >= 1)) return null;
  const base = bornesDepuisConfig(config);
  // Entiers seulement : 10 × 130 / 100 = 13 exactement, sans erreur d'arrondi flottant.
  const avecMarge = (valeur: number) => Math.ceil((Math.max(0, valeur) * (100 + MARGE_CIBLES_POURCENT)) / 100);
  let activity = Math.max(base.ciblesParCreneau.activity, avecMarge(demande.activity));
  let meal = Math.max(base.ciblesParCreneau.meal, avecMarge(demande.meal));
  let evening = Math.max(base.ciblesParCreneau.evening, avecMarge(demande.evening));
  const maximum = Math.floor(plafond);
  const somme = activity + meal + evening;
  if (somme > maximum) {
    const reduire = (valeur: number) => Math.floor((valeur * maximum) / somme);
    activity = reduire(activity);
    meal = reduire(meal);
    evening = reduire(evening);
  }
  if (activity + meal + evening === 0) activity = 1;
  const total = Math.min(maximum, Math.max(base.totalCandidats, activity + meal + evening));
  return { ...base, ciblesParCreneau: { activity, meal, evening }, totalCandidats: total };
}

/** Ce qu'un modèle voit d'un candidat de P0 : la projection de `vuePourModele` (cinq champs, rien d'autre). */
export function candidatPourModele(candidat: Candidat): CandidatPourModeleP0 {
  return { id: candidat.id, nom: candidat.nom, resume: candidat.resume, categorie: candidat.categorie, typeEtape: candidat.typeEtape };
}

/**
 * Lieu retenu de P0 pour l'étape `raisons` : le candidat vu par le modèle et le domaine de sa source ; quand le candidat
 * enrichi les porte (décision 0094 § 1 point 6), son secteur maison et sa qualité d'incontournable du plan, lus dans le
 * candidat lui-même. Ni prix, ni horaires, ni conseil : le prompt `raisons` ne les reçoit pas.
 */
export function lieuRetenuDepuisCandidat(candidat: Candidat): LieuRetenuP0 {
  return {
    ...candidatPourModele(candidat),
    sourceDomaine: new URL(candidat.source.url).hostname,
    ...(candidat.secteur === undefined ? {} : { secteur: candidat.secteur }),
    ...(candidat.incontournable === undefined ? {} : { incontournable: true as const }),
  };
}

/** Forme d'`EntreeProgramme` (`src/ai/entrees.ts`) : toutes les saisies du brief de P0 (décision 0115 § 2). */
export type EntreeProgrammeP0 = {
  destination: string;
  pays: string;
  arrivee: string;
  depart: string;
  heureArrivee: string;
  heureDepart: string;
  voyageurs: { adultes: number; enfants: number };
  rythme: Rythme;
  envies: Category[];
  aEviter?: Category[];
  deplacements: MobilityMode[];
  budgetRepas?: 1 | 2 | 3;
  logements: { texte: string; nuits: number }[];
  engagements?: { libelle: string; date: string; heure: string; type: Commitment }[];
  recit?: string;
};

/**
 * Entrée du prompt `programme` depuis le brief de P0 (décision 0115 § 2 ; décision de Samuel du 2026-10-21 : l'IA reçoit
 * **toutes** les saisies du questionnaire, récit et logement compris, **jamais une donnée Google**). Copie champ par
 * champ : ni fuseau (aucun usage par le modèle), ni `schema`. Les catégories « à éviter » (`aEviter`, lot 5 de
 * E2E-essai) sont recopiées quand la personne en a saisi, absentes sinon. Seul chemin de construction, pour `p0Run`.
 */
export function entreeProgrammeDepuisBrief(brief: Brief): EntreeProgrammeP0 {
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
