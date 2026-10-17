import type { Category, MobilityMode, Pace, StopKind } from "@/contracts";
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
export type LieuRetenuP0 = CandidatPourModeleP0 & { sourceDomaine: string };

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

/** Ce qu'un modèle voit d'un candidat de P0 : la projection de `vuePourModele` (cinq champs, rien d'autre). */
export function candidatPourModele(candidat: Candidat): CandidatPourModeleP0 {
  return { id: candidat.id, nom: candidat.nom, resume: candidat.resume, categorie: candidat.categorie, typeEtape: candidat.typeEtape };
}

/** Lieu retenu de P0 pour l'étape `raisons` : le candidat vu par le modèle et le domaine de sa source. */
export function lieuRetenuDepuisCandidat(candidat: Candidat): LieuRetenuP0 {
  return { ...candidatPourModele(candidat), sourceDomaine: new URL(candidat.source.url).hostname };
}
