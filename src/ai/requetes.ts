import type { EtapeRequete, Message, RequeteModele } from "@/ai/client";
import type { TypeCreneau } from "@/ai/candidat";
import type { ComplementP0 } from "@/ai/complement-p0";
import type { CandidatPourModele, EntreeModeles, EntreeQuartier, LieuRetenu } from "@/ai/entrees";
import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_QUARTIER } from "@/ai/prompts/quartier";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { PROMPT_STRUCTURATION } from "@/ai/prompts/structuration";
import type { ResultatWeb } from "@/ai/recherche-web";
import type { Routage } from "@/ai/reglages";
import type { BriefRequest, Pace } from "@/contracts";

/**
 * Constructeur de prompts typé (spécification P0, étapes 2, 3, 6 et 9 ; spécification B7a, point 3 : six étapes). Seul
 * point où un texte destiné à un modèle est composé. Il ne reçoit que des types maison (`src/ai/entrees.ts`, construits
 * sur `src/contracts`), les résultats bornés de la recherche web et le texte des pages lues : `src/ai` ne peut importer
 * ni `@/grounding`, ni `src/prototype` (règles d'import de B7a), donc aucune donnée Google ne peut y entrer. Chaque vue
 * est une **projection** : un champ en trop dans un objet reçu n'atteint jamais un prompt.
 *
 * `ComplementP0` (récit et logements du brief de P0) est un argument distinct et facultatif, transmis seulement par les
 * appels directs de `pnpm p0` et de `p0Run` (décision 0077 § 1 point 5) ; `creerCoucheIa` ne le passe jamais.
 */

export const DEBUT_DONNEES = "<<<DONNEES>>>";
export const FIN_DONNEES = "<<<FIN>>>";

/**
 * Encadre des données : JSON dont `<` et `>` sont échappés, pour qu'aucune donnée (texte d'une page web
 * compris) ne puisse fermer le cadre ni ressembler à une balise.
 */
export function encadrer(donnees: unknown): string {
  const json = JSON.stringify(donnees).replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
  return `${DEBUT_DONNEES}\n${json}\n${FIN_DONNEES}`;
}

/** Relit les données d'un message (utilisé par le double sur fixtures). */
export function donneesDe(contenu: string): unknown {
  const debut = contenu.indexOf(DEBUT_DONNEES);
  const fin = contenu.lastIndexOf(FIN_DONNEES);
  if (debut === -1 || fin === -1 || fin < debut) return undefined;
  return JSON.parse(contenu.slice(debut + DEBUT_DONNEES.length, fin));
}

/**
 * Rythme dans la vue des modèles : le libellé de P0 (`tranquille`, `equilibre`, `intense`), pour que les requêtes de P0
 * restent identiques octet pour octet après la conversion vers les types de production (0077 § 1 point 5). Inverse de
 * `rythmeVersPace` (`src/server/p0/vers-moteur.ts`), vérifié par `tests/unit/p0/vers-couche-ia.test.ts`.
 */
export function rythmePourModele(rythme: Pace): "tranquille" | "equilibre" | "intense" {
  switch (rythme) {
    case "relaxed":
      return "tranquille";
    case "balanced":
      return "equilibre";
    case "intense":
      return "intense";
  }
}

/** Champs du voyage vus par toutes les étapes qui reçoivent `EntreeModeles`, dans l'ordre de la vue de P0. */
function vueVoyage(entree: EntreeModeles) {
  return {
    destination: entree.destination,
    ...(entree.pays === undefined ? {} : { pays: entree.pays }),
    arrivee: entree.arrivee,
    depart: entree.depart,
    voyageurs: { adultes: entree.voyageurs.adultes, enfants: entree.voyageurs.enfants },
    rythme: rythmePourModele(entree.rythme),
    envies: [...entree.envies],
    ...(entree.limites === undefined ? {} : { limites: [...entree.limites] }),
    deplacements: [...entree.deplacements],
    ...(entree.budgetRepas === undefined ? {} : { budgetRepas: entree.budgetRepas }),
    ...(entree.budgetRepasChf === undefined ? {} : { budgetRepasChf: entree.budgetRepasChf }),
  };
}

/**
 * Ce qu'un modèle voit du voyage (notation, raisons) : `EntreeModeles` (B7-PO-1) ; pour P0 seulement, les logements et
 * le récit de `ComplementP0` (Q197). Sans complément : ni récit, ni logement.
 */
export function briefPourModele(entree: EntreeModeles, complement?: ComplementP0) {
  return {
    ...vueVoyage(entree),
    ...(complement === undefined ? {} : { logements: [...complement.logements] }),
    ...(complement?.recit === undefined ? {} : { recit: complement.recit }),
  };
}

/**
 * Ce que voient les modèles des étapes qui composent les requêtes web (plan et recherche) : jamais les logements
 * (correction 2 de la PR 326). Les requêtes partent chez le moteur de recherche du fournisseur (Exa), hors du réglage
 * `data_collection: "deny"` : le modèle ne peut pas recopier un texte qu'il ne voit pas. Les engagements n'entrent dans
 * aucune vue. Pour P0 seulement, le récit de `ComplementP0` reste visible (Q197) ; ce qui peut en partir est borné par
 * `requeteSansDonneeDuBrief` (`src/research/agent.ts`) : au plus 3 mots consécutifs (écriture à espaces) ou
 * 7 caractères consécutifs (chinois, japonais, thaï, lao, khmer, birman, javanais, balinais, hangul), ou des mots épars,
 * y compris dans un récit qui mêle les deux sortes d'écriture. Flux accepté par Samuel le 2026-10-14 (Q427).
 */
export function briefPourRecherche(entree: EntreeModeles, complement?: ComplementP0) {
  return {
    ...vueVoyage(entree),
    ...(complement?.recit === undefined ? {} : { recit: complement.recit }),
  };
}

/** Ce qu'un modèle voit d'un candidat : projection sur les cinq champs de `CandidatPourModele`, rien d'autre. */
function vueCandidat(candidat: CandidatPourModele): CandidatPourModele {
  return { id: candidat.id, nom: candidat.nom, resume: candidat.resume, categorie: candidat.categorie, typeEtape: candidat.typeEtape };
}

type Prompt = { id: string; version: number; texte: string };

function requete(etape: EtapeRequete, prompt: Prompt, modele: string, routage: Routage, donnees: unknown): RequeteModele {
  const messages: Message[] = [
    { role: "system", contenu: prompt.texte },
    { role: "user", contenu: encadrer(donnees) },
  ];
  return { etape, modele, routage: { ...routage }, prompt: { id: prompt.id, version: prompt.version }, messages };
}

export function requetePlan(entree: EntreeModeles, modele: string, routage: Routage, complement?: ComplementP0): RequeteModele {
  return requete("plan", PROMPT_PLAN, modele, routage, { brief: briefPourRecherche(entree, complement) });
}

export type PageLue = { url: string; texte: string };

export function requeteRecherche(
  donnees: {
    entree: EntreeModeles;
    tour: number;
    plan: readonly { requete: string; creneau: string }[];
    resultats: readonly ResultatWeb[];
    pages: readonly PageLue[];
    dejaTrouves: readonly string[];
    manquants: Record<TypeCreneau, number>;
  },
  modele: string,
  routage: Routage,
  complement?: ComplementP0,
): RequeteModele {
  return requete("recherche", PROMPT_RECHERCHE, modele, routage, {
    brief: briefPourRecherche(donnees.entree, complement),
    tour: donnees.tour,
    plan: donnees.plan.map((ligne) => ({ requete: ligne.requete, creneau: ligne.creneau })),
    resultats: donnees.resultats.map((resultat) => ({ url: resultat.url, titre: resultat.titre, extrait: resultat.extrait })),
    pages: donnees.pages.map((page) => ({ url: page.url, texte: page.texte })),
    dejaTrouves: [...donnees.dejaTrouves],
    manquants: { activity: donnees.manquants.activity, meal: donnees.manquants.meal, evening: donnees.manquants.evening },
  });
}

export function requeteNotation(
  entree: EntreeModeles,
  lot: readonly CandidatPourModele[],
  modele: string,
  routage: Routage,
  complement?: ComplementP0,
): RequeteModele {
  return requete("notation", PROMPT_NOTATION, modele, routage, {
    brief: briefPourModele(entree, complement),
    candidats: lot.map(vueCandidat),
  });
}

export function requeteRaisons(
  entree: EntreeModeles,
  lieux: readonly LieuRetenu[],
  modele: string,
  routage: Routage,
  complement?: ComplementP0,
): RequeteModele {
  return requete("raisons", PROMPT_RAISONS, modele, routage, {
    brief: briefPourModele(entree, complement),
    lieux: lieux.map((lieu) => ({ ...vueCandidat(lieu), sourceDomaine: lieu.sourceDomaine })),
  });
}

/**
 * Structuration du brief (B7-PO-2) : la `BriefRequest` du contrat, récit compris (seule étape qui le reçoit,
 * B7-PO-1), en projection sur ses champs.
 */
export function requeteStructuration(demande: BriefRequest, modele: string, routage: Routage): RequeteModele {
  return requete("structuration", PROMPT_STRUCTURATION, modele, routage, {
    story: demande.story,
    trip: {
      destination: demande.trip.destination,
      start: demande.trip.start,
      end: demande.trip.end,
      otherCities: demande.trip.otherCities.map((ville) => ({ name: ville.name, arrival: ville.arrival })),
    },
  });
}

/** Quartier conseillé (B7-PO-3) : `EntreeQuartier` et les résultats bornés de la recherche de logements. */
export function requeteQuartier(entree: EntreeQuartier, resultats: readonly ResultatWeb[], modele: string, routage: Routage): RequeteModele {
  return requete("quartier", PROMPT_QUARTIER, modele, routage, {
    ville: entree.ville,
    debut: entree.debut,
    fin: entree.fin,
    resultats: resultats.map((resultat) => ({ url: resultat.url, titre: resultat.titre, extrait: resultat.extrait })),
  });
}
