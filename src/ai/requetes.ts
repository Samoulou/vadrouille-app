import type { EtapeRequete, Message, RequeteModele } from "@/ai/client";
import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import type { Brief } from "@/prototype/brief";
import type { Candidat, TypeCreneau } from "@/prototype/candidat";
import { vuePourModele } from "@/prototype/candidat";
import type { Routage } from "@/prototype/config";

/**
 * Constructeurs de requêtes (spécification P0, étapes 2, 3, 6 et 9). Seul point où un texte destiné à un modèle
 * est composé. Ils ne reçoivent que le brief, les résultats de la recherche web et des vues de candidats
 * (`vuePourModele`) : `src/ai` ne peut importer ni `@/prototype/ancrage`, ni `@/grounding` (test du graphe
 * d'import), donc aucune donnée Google ne peut y entrer.
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

/** Ce qu'un modèle voit du brief : le brief tel quel, récit compris (Q197), rien d'autre. */
export function briefPourModele(brief: Brief) {
  return {
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    voyageurs: brief.voyageurs,
    rythme: brief.rythme,
    envies: brief.envies,
    deplacements: brief.deplacements,
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
    logements: brief.logements.map((logement) => logement.texte),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  };
}

/**
 * Ce que voient les modèles des étapes qui composent les requêtes web (plan et recherche) : le brief sans les logements
 * (correction 2 de la PR 326). Les requêtes partent chez le moteur de recherche du fournisseur (Exa), hors du réglage
 * `data_collection: "deny"` : le modèle ne peut pas recopier un texte qu'il ne voit pas. Les engagements n'entrent dans
 * aucune vue. Le récit libre reste visible (Q197) ; ce qui peut en partir est borné par `requeteSansDonneeDuBrief`
 * (`src/research/agent.ts`) : au plus 3 mots consécutifs (écriture à espaces) ou 7 caractères consécutifs (chinois,
 * japonais, thaï, lao, khmer, birman), ou des mots épars. Flux accepté par Samuel le 2026-10-14 (Q427).
 */
export function briefPourRecherche(brief: Brief): Omit<ReturnType<typeof briefPourModele>, "logements"> {
  return {
    destination: brief.destination,
    pays: brief.pays,
    arrivee: brief.arrivee,
    depart: brief.depart,
    voyageurs: brief.voyageurs,
    rythme: brief.rythme,
    envies: brief.envies,
    deplacements: brief.deplacements,
    ...(brief.budgetRepas === undefined ? {} : { budgetRepas: brief.budgetRepas }),
    ...(brief.recit === undefined ? {} : { recit: brief.recit }),
  };
}

type Prompt = { id: string; version: number; texte: string };

function requete(etape: EtapeRequete, prompt: Prompt, modele: string, routage: Routage, donnees: unknown): RequeteModele {
  const messages: Message[] = [
    { role: "system", contenu: prompt.texte },
    { role: "user", contenu: encadrer(donnees) },
  ];
  return { etape, modele, routage: { ...routage }, prompt: { id: prompt.id, version: prompt.version }, messages };
}

export function requetePlan(brief: Brief, modele: string, routage: Routage): RequeteModele {
  return requete("plan", PROMPT_PLAN, modele, routage, { brief: briefPourRecherche(brief) });
}

export type ResultatRecherche = { url: string; titre: string; extrait: string };
export type PageLue = { url: string; texte: string };

export function requeteRecherche(
  entree: {
    brief: Brief;
    tour: number;
    plan: readonly { requete: string; creneau: string }[];
    resultats: readonly ResultatRecherche[];
    pages: readonly PageLue[];
    dejaTrouves: readonly string[];
    manquants: Record<TypeCreneau, number>;
  },
  modele: string,
  routage: Routage,
): RequeteModele {
  return requete("recherche", PROMPT_RECHERCHE, modele, routage, {
    brief: briefPourRecherche(entree.brief),
    tour: entree.tour,
    plan: entree.plan,
    resultats: entree.resultats,
    pages: entree.pages,
    dejaTrouves: entree.dejaTrouves,
    manquants: entree.manquants,
  });
}

export function requeteNotation(brief: Brief, lot: readonly Candidat[], modele: string, routage: Routage): RequeteModele {
  return requete("notation", PROMPT_NOTATION, modele, routage, {
    brief: briefPourModele(brief),
    candidats: lot.map(vuePourModele),
  });
}

export function requeteRaisons(brief: Brief, retenus: readonly Candidat[], modele: string, routage: Routage): RequeteModele {
  return requete("raisons", PROMPT_RAISONS, modele, routage, {
    brief: briefPourModele(brief),
    lieux: retenus.map((candidat) => ({ ...vuePourModele(candidat), sourceDomaine: new URL(candidat.source.url).hostname })),
  });
}
