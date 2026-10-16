import "server-only";

import { z } from "zod";

import { avecGardeDataCollection, type ClientModeles, type ReponseModele } from "@/ai/client";
import { CODES_ERREUR_IA, REESSAYABLES, type CodeErreurIa, type ResultatIa } from "@/ai/erreurs";
import {
  CandidatPourModeleSchema,
  EntreeModelesSchema,
  EntreeQuartierSchema,
  LieuRetenuSchema,
  type CandidatPourModele,
  type EntreeModeles,
  type EntreeQuartier,
  type LieuRetenu,
} from "@/ai/entrees";
import { creerNoterCandidats } from "@/ai/noter-candidats";
import { LONGUEURS_RESULTAT, type ResultatWeb } from "@/ai/recherche-web";
import { creerRedigerRaisons } from "@/ai/rediger-raisons";
import type { Routage } from "@/ai/reglages";
import { requetePlan, requeteQuartier, requeteStructuration } from "@/ai/requetes";
import {
  lireBriefDeduit,
  lireNotes,
  lirePlan,
  lireQuartier,
  lireRaisons,
  racineLisible,
  type Lecture,
  type LogementPropose,
  type RequetePlan,
  type ZoneProposee,
} from "@/ai/sorties";
import { BriefRequestSchema, type BriefRequest, type InferredBrief } from "@/contracts";
import type { Notes } from "@/ai/candidat";

/**
 * Couche IA de production (décision 0077 § 2) : **une** fabrique, `creerCoucheIa({ modeles, reglages })`, dont chaque
 * méthode est une étape IA. Aucune dépendance de recherche web ni de page : les étapes qui cherchent (`recherche`,
 * `quartier`) sont orchestrées par `src/research` (B7b), qui passe ici des résultats déjà bornés, comme données.
 *
 * - **Entrées strictes** (§ 2 point 5) : chaque méthode valide son entrée par un `z.strictObject` **avant** toute
 *   requête ; une clé en trop, une clé de la liste interdite (`CLES_INTERDITES_ENTREE`, handover § 8, plus le récit, le
 *   logement et les clés de `ComplementP0`) à n'importe quel niveau, donne `invalid_input` sans requête.
 *   `ComplementP0` n'est jamais reçu ni passé ici (§ 1 point 5).
 * - **Résultat** (§ 2 point 1) : `ResultatIa<T>` ; aucune exception pour une erreur attendue (un code de
 *   `CODES_ERREUR_IA` porté par l'erreur du client) ; une exception inattendue n'est pas convertie, elle se propage.
 * - **Sorties** (§ 2 point 4) : une réponse illisible donne `model_output_invalid` ; des éléments refusés parmi d'autres
 *   lus restent une réussite, avec leur compte (`refuses`).
 * - **Un seul chemin d'envoi** (§ 2 point 3) : `noter` et `rediger` composent `creerNoterCandidats` et
 *   `creerRedigerRaisons` ; `planifierRecherche` compose `requetePlan` et `lirePlan`.
 * - Chaque requête passe par `avecGardeDataCollection` (décision 0032, A2).
 */

/** Modèle et routage d'une étape, lus dans la configuration (B7b : `src/server/config/ia.ts` ; P0 : son adaptateur). */
export type ReglageEtape = { readonly modele: string; readonly routage: Routage };

/** Réglages par étape de la couche IA (0077 § 2 point 2). Les étapes `recherche` restent à `src/research` (B7b). */
export type ReglagesIa = {
  readonly structuration: ReglageEtape;
  readonly quartier: ReglageEtape;
  readonly plan: ReglageEtape;
  readonly notation: ReglageEtape;
  readonly raisons: ReglageEtape;
};

export type DependancesCoucheIa = { readonly modeles: ClientModeles; readonly reglages: ReglagesIa };

/** Nombre maximal de candidats d'un lot de notation (borne de l'entrée, au-dessus des lots de P0). */
export const MAX_CANDIDATS_NOTATION = 50;
/** Nombre maximal de lieux dont on rédige les raisons en un appel. */
export const MAX_LIEUX_RAISONS = 50;
/** Nombre maximal de résultats de recherche web passés à l'étape `quartier`. */
export const MAX_RESULTATS_QUARTIER = 30;

/**
 * Clés refusées à n'importe quel niveau d'une entrée (0077 § 2 point 5) : liste du handover back-end § 8
 * (`workflows: aucune donnée Google dans l'état sérialisé`), identifiant de lieu Google, puis récit, logement,
 * engagement et email (B7-PO-1) et les clés de `ComplementP0` (0077 § 1 point 5). Seule exception : `story` à la racine
 * de l'entrée de `structurerBrief` (le récit ne part qu'à la structuration, B7-PO-1).
 */
export const CLES_INTERDITES_ENTREE = [
  "rating",
  "userRatingCount",
  "openingHours",
  "regularOpeningHours",
  "currentOpeningHours",
  "businessStatus",
  "priceLevel",
  "photos",
  "phone",
  "nationalPhoneNumber",
  "internationalPhoneNumber",
  "address",
  "formattedAddress",
  "displayName",
  "reviews",
  "lat",
  "lng",
  "latitude",
  "longitude",
  "location",
  "viewport",
  "duration",
  "staticDuration",
  "distanceMeters",
  "polyline",
  "placeId",
  "story",
  "recit",
  "logements",
  "logement",
  "lodging",
  "lodgings",
  "commitments",
  "engagements",
  "email",
] as const;

const INTERDITES: ReadonlySet<string> = new Set(CLES_INTERDITES_ENTREE);

/** Vrai si une clé interdite apparaît à un niveau quelconque ; `admisesALaRacine` : clés tolérées au premier niveau. */
function porteCleInterdite(valeur: unknown, admisesALaRacine: ReadonlySet<string> = new Set()): boolean {
  const pile: { noeud: unknown; racine: boolean }[] = [{ noeud: valeur, racine: true }];
  while (pile.length > 0) {
    const courant = pile.pop();
    if (courant === undefined) break;
    const { noeud, racine } = courant;
    if (Array.isArray(noeud)) {
      for (const enfant of noeud) pile.push({ noeud: enfant, racine: false });
      continue;
    }
    if (noeud === null || typeof noeud !== "object") continue;
    for (const [cle, enfant] of Object.entries(noeud)) {
      if (INTERDITES.has(cle) && !(racine && admisesALaRacine.has(cle))) return true;
      pile.push({ noeud: enfant, racine: false });
    }
  }
  return false;
}

// --- Schémas d'entrée des cinq méthodes ----------------------------------------

const ResultatWebSchema = z.strictObject({
  url: z.string().min(1).max(LONGUEURS_RESULTAT.url),
  titre: z.string().max(LONGUEURS_RESULTAT.titre),
  extrait: z.string().max(LONGUEURS_RESULTAT.extrait),
});

const idsUniques = (elements: readonly { readonly id: string }[]) => new Set(elements.map((element) => element.id)).size === elements.length;

const EntreeQuartierCoucheSchema = z.strictObject({
  quartier: EntreeQuartierSchema,
  resultats: z.array(ResultatWebSchema).max(MAX_RESULTATS_QUARTIER),
});
const EntreePlanSchema = z.strictObject({ entree: EntreeModelesSchema });
const EntreeNoterSchema = z.strictObject({
  entree: EntreeModelesSchema,
  candidats: z.array(CandidatPourModeleSchema).min(1).max(MAX_CANDIDATS_NOTATION).refine(idsUniques, "identifiants uniques"),
});
const EntreeRedigerSchema = z.strictObject({
  entree: EntreeModelesSchema,
  lieux: z.array(LieuRetenuSchema).min(1).max(MAX_LIEUX_RAISONS).refine(idsUniques, "identifiants uniques"),
});

// --- Types exposés ------------------------------------------------------------

export type EntreeProposerQuartier = { readonly quartier: EntreeQuartier; readonly resultats: readonly ResultatWeb[] };
export type QuartierLu = { readonly zone: ZoneProposee | null; readonly logements: readonly LogementPropose[]; readonly refuses: number };
export type PlanLu = { readonly requetes: readonly RequetePlan[]; readonly refuses: number };
export type NotesLues = { readonly notes: ReadonlyMap<string, Notes>; readonly refuses: number };
export type RaisonsLues = { readonly raisons: ReadonlyMap<string, { raison: string; detour: string }>; readonly refuses: number };

export type CoucheIa = {
  /** Brief déduit du récit (B7-PO-2) ; sortie non conforme : `model_output_invalid` (aucun brief partiel). */
  structurerBrief(entree: BriefRequest): Promise<ResultatIa<InferredBrief>>;
  /** Zone conseillée ou « aucune zone » (`zone: null`, que B7b traduit en `no_option`) et logements (B7-PO-3). */
  proposerQuartier(entree: EntreeProposerQuartier): Promise<ResultatIa<QuartierLu>>;
  /** Requêtes de recherche typées d'une ville. */
  planifierRecherche(entree: { readonly entree: EntreeModeles }): Promise<ResultatIa<PlanLu>>;
  /** Notes par identifiant d'un lot de candidats. */
  noter(entree: { readonly entree: EntreeModeles; readonly candidats: readonly CandidatPourModele[] }): Promise<ResultatIa<NotesLues>>;
  /** Raison et détour par identifiant des seuls lieux retenus. */
  rediger(entree: { readonly entree: EntreeModeles; readonly lieux: readonly LieuRetenu[] }): Promise<ResultatIa<RaisonsLues>>;
};

// --- Conversion des erreurs attendues ------------------------------------------

const CODES: ReadonlySet<string> = new Set(CODES_ERREUR_IA);
const CODES_REESSAYABLES: ReadonlySet<string> = new Set(REESSAYABLES);

function estCodeIa(code: unknown): code is CodeErreurIa {
  return typeof code === "string" && CODES.has(code);
}

function echec<T>(code: CodeErreurIa): ResultatIa<T> {
  return { ok: false, code, retryable: CODES_REESSAYABLES.has(code) };
}

/**
 * Envoie la requête et lit la réponse. Une erreur levée par le client qui porte un code fermé de `CODES_ERREUR_IA`
 * devient un échec ; toute autre exception (défaut de programmation) se propage telle quelle (0077 § 2 point 1).
 */
async function appeler<L, T>(envoi: () => Promise<ReponseModele>, lire: (texte: string) => Lecture<L>, rendre: (lecture: Lecture<L>) => T): Promise<ResultatIa<T>> {
  let reponse: ReponseModele;
  try {
    reponse = await envoi();
  } catch (erreur) {
    if (erreur instanceof Error && "code" in erreur && estCodeIa(erreur.code)) return echec(erreur.code);
    throw erreur;
  }
  const lecture = lire(reponse.texte);
  if (lecture.illisible === true) return echec("model_output_invalid");
  return { ok: true, valeur: rendre(lecture) };
}

/** Valide l'entrée : clé interdite à un niveau quelconque, puis schéma strict. */
function valider<T>(schema: z.ZodType<T>, entree: unknown, admisesALaRacine?: ReadonlySet<string>): T | undefined {
  if (porteCleInterdite(entree, admisesALaRacine)) return undefined;
  const resultat = schema.safeParse(entree);
  return resultat.success ? resultat.data : undefined;
}

const RECIT_A_LA_RACINE: ReadonlySet<string> = new Set(["story"]);

export function creerCoucheIa({ modeles, reglages }: DependancesCoucheIa): CoucheIa {
  const client = avecGardeDataCollection(modeles);
  const noterLot = creerNoterCandidats(client, reglages.notation);
  const redigerLieux = creerRedigerRaisons(client, reglages.raisons);

  return {
    async structurerBrief(entree) {
      const demande = valider(BriefRequestSchema, entree, RECIT_A_LA_RACINE);
      if (demande === undefined) return echec("invalid_input");
      const { modele, routage } = reglages.structuration;
      return appeler(
        () => client.envoyer(requeteStructuration(demande, modele, routage)),
        lireBriefDeduit,
        (lecture) => lecture.valeur as InferredBrief,
      );
    },

    async proposerQuartier(entree) {
      const lue = valider(EntreeQuartierCoucheSchema, entree);
      if (lue === undefined) return echec("invalid_input");
      const { modele, routage } = reglages.quartier;
      return appeler(
        () => client.envoyer(requeteQuartier(lue.quartier, lue.resultats, modele, routage)),
        lireQuartier,
        (lecture) => ({ zone: lecture.valeur.zone, logements: lecture.valeur.logements, refuses: lecture.refuses }),
      );
    },

    async planifierRecherche(entree) {
      const lue = valider(EntreePlanSchema, entree);
      if (lue === undefined) return echec("invalid_input");
      const { modele, routage } = reglages.plan;
      return appeler(
        () => client.envoyer(requetePlan(lue.entree, modele, routage)),
        lirePlan,
        (lecture) => ({ requetes: lecture.valeur, refuses: lecture.refuses }),
      );
    },

    async noter(entree) {
      const lue = valider(EntreeNoterSchema, entree);
      if (lue === undefined) return echec("invalid_input");
      const ids = new Set(lue.candidats.map((candidat) => candidat.id));
      return appeler(
        () => noterLot({ entree: lue.entree, lot: lue.candidats }),
        (texte) => ({ ...lireNotes(texte, ids), ...(racineLisible(texte, ["notes"]) ? {} : { illisible: true }) }),
        (lecture) => ({ notes: lecture.valeur, refuses: lecture.refuses }),
      );
    },

    async rediger(entree) {
      const lue = valider(EntreeRedigerSchema, entree);
      if (lue === undefined) return echec("invalid_input");
      const ids = new Set(lue.lieux.map((lieu) => lieu.id));
      return appeler(
        () => redigerLieux({ entree: lue.entree, retenus: lue.lieux }),
        (texte) => ({ ...lireRaisons(texte, ids), ...(racineLisible(texte, ["raisons"]) ? {} : { illisible: true }) }),
        (lecture) => ({ raisons: lecture.valeur, refuses: lecture.refuses }),
      );
    },
  };
}
