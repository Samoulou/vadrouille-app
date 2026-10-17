import "server-only";

import { z } from "zod";

import { LONGUEURS_TEXTE, TYPES_CRENEAU, texteMaison, type TypeCreneau } from "@/ai/candidat";
import { ETAPES_REQUETE, type ClientModeles, type EtapeRequete } from "@/ai/client";
import { creerCoucheIa, type ReglageEtape, type ReglagesIa } from "@/ai/couche";
import { EntreeModelesSchema, type CandidatPourModele, type LieuRetenu } from "@/ai/entrees";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { BriefRequestSchema, CategorySchema, type Category } from "@/contracts";
import { chercherCandidats, creneauDe } from "@/research/agent";
import type { BornesRecherche } from "@/research/bornes";
import { CLASSES_SOURCE, type CandidatRecherche, type ClasseSource } from "@/research/candidat";
import type { LecteurPages } from "@/research/fetch-page";

/**
 * Harnais du jeu d'évaluation `evals/` (spécification B7, B7c point 4 et B7-PO-9 ; cadrage § 8). Fait tourner les
 * étapes de B7 (structuration, plan, recherche, notation, raisons) sur un cas du jeu et rend des **mesures** : taux de
 * sorties valides par étape, candidats trouvés par type de créneau, part des sources officielles, indépendantes et
 * génériques, couverture des catégories et des incontournables attendus (comparés par nom maison), candidats dans une
 * limite du brief, coût et durée par étape, versions des prompts et modèles.
 *
 * **Aucune mesure d'ancrage** (taux d'ancrage, candidats écartés par Google : données dérivées de Google, 0011 § 2,
 * S4) et **aucun nom de lieu** dans les mesures : elles se commitent dans `evals/resultats/` pour comparer les
 * versions ; les candidats eux-mêmes ne sortent pas de ce module. Aucune étape Google n'est appelée : le harnais n'a ni
 * client Places ni client Routes.
 *
 * Mode simulé par défaut : les clients (modèles, recherche web, lecteur de pages) sont des doubles sur fixtures,
 * passés par l'appelant (`tests/unit/evals/`). Le lancement réel (vrai fournisseur, préversion, à la main) attend la
 * réponse de Samuel (question 6 de la spécification B7 : budget et plafond par exécution) ; ce module ne lit aucune
 * clé ni configuration.
 */

/** Étapes mesurées (B7-PO-9) ; `quartier` relève de `suggererQuartier` (B7b) et n'est pas mesurée ici. */
export const ETAPES_EVALUEES = ["structuration", "plan", "recherche", "notation", "raisons"] as const satisfies readonly EtapeRequete[];
export type EtapeEvaluee = (typeof ETAPES_EVALUEES)[number];

export const TYPES_CAS = ["reference", "cas-limite"] as const;

/** Un cas du jeu : demande de structuration, entrée des autres étapes, attentes maison. */
export const CasEvaluationSchema = z.strictObject({
  schema: z.literal(1),
  /** Identifiant du cas (nom de fichier), sans nom de lieu obligatoire : il figure dans les mesures. */
  id: z.string().regex(/^[a-z0-9-]{1,60}$/),
  type: z.enum(TYPES_CAS),
  /** Ligne du cadrage § 8 couverte, ou origine du brief de référence. */
  cas: z.string().min(1).max(300),
  /** Jeu de doubles du mode simulé (`prototype/fixtures/<type>/<nom>.json` ou `evals/simule/<nom>/`). */
  simulation: z.string().regex(/^[a-z0-9-]{1,40}$/),
  demande: BriefRequestSchema,
  entree: EntreeModelesSchema,
  attentes: z.strictObject({
    /** Catégories que les candidats devraient couvrir. */
    categories: z.array(CategorySchema).max(8),
    /** Incontournables attendus (liste de Samuel, 0027 § 6, quand elle existe pour la destination), par nom maison. */
    incontournables: z.array(texteMaison(LONGUEURS_TEXTE.nom)).max(30),
  }),
});
export type CasEvaluation = z.infer<typeof CasEvaluationSchema>;

const ratio = z.number().min(0).max(1);
const MesuresEtapeSchema = z.strictObject({
  appels: z.number().int().nonnegative(),
  /** Part des sorties valides (`null` : étape non appelée). */
  tauxValides: ratio.nullable(),
  coutMicros: z.number().int().nonnegative(),
  dureeMs: z.number().int().nonnegative(),
});

/** Mesures d'un cas : liste fermée de clés ; ni nom de lieu, ni URL, ni compteur d'ancrage. */
export const MesuresCasSchema = z.strictObject({
  cas: z.string().regex(/^[a-z0-9-]{1,60}$/),
  prompts: z.record(z.string().regex(/^[a-z_-]{1,40}$/), z.number().int().positive()),
  modeles: z.strictObject(Object.fromEntries(ETAPES_EVALUEES.map((etape) => [etape, z.string().max(120)])) as Record<EtapeEvaluee, z.ZodString>),
  etapes: z.strictObject(Object.fromEntries(ETAPES_EVALUEES.map((etape) => [etape, MesuresEtapeSchema])) as Record<EtapeEvaluee, typeof MesuresEtapeSchema>),
  candidatsParCreneau: z.strictObject({ activity: z.number().int().nonnegative(), meal: z.number().int().nonnegative(), evening: z.number().int().nonnegative() }),
  partSources: z.strictObject({ officielle: ratio, independante: ratio, generique: ratio }).nullable(),
  couvertureCategories: ratio.nullable(),
  couvertureIncontournables: ratio.nullable(),
  candidatsDansUneLimite: z.number().int().nonnegative(),
});
export type MesuresCas = z.infer<typeof MesuresCasSchema>;

export type DependancesEvaluation = {
  readonly modeles: ClientModeles;
  readonly recherche: ClientRechercheWeb;
  readonly lecteur: LecteurPages;
  readonly reglages: ReglagesIa & { readonly recherche: ReglageEtape };
  readonly bornes: BornesRecherche;
  /** Horloge des durées (injectée : constante en mode simulé, pour des mesures reproductibles). */
  readonly maintenant: () => number;
};

/** Nom comparé : minuscules, sans accents ni ponctuation. */
const normaliser = (nom: string) =>
  nom
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();

const micros = (usd: number) => Math.round(usd * 1_000_000);

type Compte = { appels: number; coutMicros: number; dureeMs: number };

/** Décorateur du client de modèles : appels, coût et durée par étape, versions des prompts ; aucun texte gardé. */
function instrumenter(modeles: ClientModeles, maintenant: () => number) {
  const comptes = new Map<EtapeRequete, Compte>(ETAPES_REQUETE.map((etape) => [etape, { appels: 0, coutMicros: 0, dureeMs: 0 }]));
  const prompts = new Map<string, number>();
  const client: ClientModeles = {
    async envoyer(requete) {
      const debut = maintenant();
      const reponse = await modeles.envoyer(requete);
      const compte = comptes.get(requete.etape);
      if (compte !== undefined) {
        compte.appels += 1;
        compte.coutMicros += micros(reponse.coutUsd);
        compte.dureeMs += Math.max(0, maintenant() - debut);
      }
      prompts.set(requete.prompt.id, requete.prompt.version);
      return reponse;
    },
  };
  return { client, comptes, prompts };
}

function partSources(candidats: readonly CandidatRecherche[]): MesuresCas["partSources"] {
  if (candidats.length === 0) return null;
  const parClasse = new Map<ClasseSource, number>(CLASSES_SOURCE.map((classe) => [classe, 0]));
  for (const candidat of candidats) parClasse.set(candidat.source.classe, (parClasse.get(candidat.source.classe) ?? 0) + 1);
  const part = (classe: ClasseSource) => (parClasse.get(classe) ?? 0) / candidats.length;
  return { officielle: part("officielle"), independante: part("independante"), generique: part("generique") };
}

function couvertureIncontournables(candidats: readonly CandidatRecherche[], attendus: readonly string[]): number | null {
  if (attendus.length === 0) return null;
  const noms = candidats.map((candidat) => normaliser(candidat.nom));
  const trouves = attendus.filter((attendu) => {
    const cle = normaliser(attendu);
    return noms.some((nom) => nom.includes(cle) || cle.includes(nom));
  });
  return trouves.length / attendus.length;
}

const vue = (candidat: CandidatRecherche): CandidatPourModele => ({
  id: candidat.id,
  nom: candidat.nom,
  resume: candidat.resume,
  categorie: candidat.categorie,
  typeEtape: candidat.typeEtape,
});

const lieuRetenu = (candidat: CandidatRecherche): LieuRetenu => ({ ...vue(candidat), sourceDomaine: new URL(candidat.source.url).hostname });

/** Taille d'un lot de notation du harnais (au plus `MAX_CANDIDATS_NOTATION` de la couche). */
export const LOT_NOTATION_EVALUATION = 10;

/**
 * Fait tourner les cinq étapes sur un cas et rend ses mesures (validées par `MesuresCasSchema` : une clé de plus, un
 * texte libre ou un compteur d'ancrage ne peut pas y entrer).
 */
export async function evaluerCas(cas: CasEvaluation, dependances: DependancesEvaluation): Promise<MesuresCas> {
  const { client, comptes, prompts } = instrumenter(dependances.modeles, dependances.maintenant);
  const couche = creerCoucheIa({ modeles: client, reglages: dependances.reglages });
  const valides = new Map<EtapeEvaluee, { lus: number; valides: number }>(ETAPES_EVALUEES.map((etape) => [etape, { lus: 0, valides: 0 }]));
  const noter = (etape: EtapeEvaluee, valide: boolean) => {
    const v = valides.get(etape);
    if (v === undefined) return;
    v.lus += 1;
    if (valide) v.valides += 1;
  };

  noter("structuration", (await couche.structurerBrief(cas.demande)).ok);

  // Plan et recherche : l'agent de production, avec le client instrumenté et les doubles de recherche et de pages.
  const debutRecherche = dependances.maintenant();
  let coutRechercheWebMicros = 0;
  const rechercheWeb: ClientRechercheWeb = {
    async rechercher(requete) {
      const reponse = await dependances.recherche.rechercher(requete);
      coutRechercheWebMicros += micros(reponse.coutUsd);
      return reponse;
    },
  };
  const { candidats, compteurs } = await chercherCandidats(cas.entree, {
    modeles: client,
    modele: dependances.reglages.recherche.modele,
    routage: dependances.reglages.recherche.routage,
    recherche: rechercheWeb,
    lecteur: dependances.lecteur,
    bornes: dependances.bornes,
  });
  const dureeRecherche = Math.max(0, dependances.maintenant() - debutRecherche);
  noter("plan", compteurs.sortiesIllisibles.plan === 0);
  for (let tour = 0; tour < compteurs.tours; tour += 1) noter("recherche", tour >= compteurs.sortiesIllisibles.recherche);

  // Notation par lots, puis raisons des candidats notés.
  const notes = new Set<string>();
  for (let i = 0; i < candidats.length; i += LOT_NOTATION_EVALUATION) {
    const lot = candidats.slice(i, i + LOT_NOTATION_EVALUATION);
    const resultat = await couche.noter({ entree: cas.entree, candidats: lot.map(vue) });
    noter("notation", resultat.ok);
    if (resultat.ok) for (const id of resultat.valeur.notes.keys()) notes.add(id);
  }
  const retenus = candidats.filter((candidat) => notes.has(candidat.id));
  if (retenus.length > 0) noter("raisons", (await couche.rediger({ entree: cas.entree, lieux: retenus.map(lieuRetenu) })).ok);

  const compte = (etape: EtapeEvaluee): Compte => comptes.get(etape) ?? { appels: 0, coutMicros: 0, dureeMs: 0 };
  const etapes = Object.fromEntries(
    ETAPES_EVALUEES.map((etape) => {
      const c = compte(etape);
      const v = valides.get(etape) ?? { lus: 0, valides: 0 };
      const recherche = etape === "recherche";
      return [
        etape,
        {
          appels: c.appels,
          tauxValides: v.lus === 0 ? null : v.valides / v.lus,
          coutMicros: c.coutMicros + (recherche ? coutRechercheWebMicros : 0),
          // Recherche : durée de l'agent hors appels du plan (comptés à part).
          dureeMs: recherche ? Math.max(0, dureeRecherche - compte("plan").dureeMs) : c.dureeMs,
        },
      ];
    }),
  ) as MesuresCas["etapes"];

  const parCreneau = new Map<TypeCreneau, number>(TYPES_CRENEAU.map((creneau) => [creneau, 0]));
  for (const candidat of candidats) {
    const creneau = creneauDe(candidat.typeEtape);
    parCreneau.set(creneau, (parCreneau.get(creneau) ?? 0) + 1);
  }
  const categories = new Set<Category>(candidats.map((candidat) => candidat.categorie));
  const limites = new Set<Category>(cas.entree.limites ?? []);

  return MesuresCasSchema.parse({
    cas: cas.id,
    prompts: Object.fromEntries([...prompts.entries()].sort(([a], [b]) => a.localeCompare(b))),
    modeles: {
      structuration: dependances.reglages.structuration.modele,
      plan: dependances.reglages.recherche.modele,
      recherche: dependances.reglages.recherche.modele,
      notation: dependances.reglages.notation.modele,
      raisons: dependances.reglages.raisons.modele,
    },
    etapes,
    candidatsParCreneau: { activity: parCreneau.get("activity") ?? 0, meal: parCreneau.get("meal") ?? 0, evening: parCreneau.get("evening") ?? 0 },
    partSources: partSources(candidats),
    couvertureCategories: cas.attentes.categories.length === 0 ? null : cas.attentes.categories.filter((c) => categories.has(c)).length / cas.attentes.categories.length,
    couvertureIncontournables: couvertureIncontournables(candidats, cas.attentes.incontournables),
    candidatsDansUneLimite: candidats.filter((candidat) => limites.has(candidat.categorie)).length,
  });
}
