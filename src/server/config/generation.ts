import "server-only";

import { MAX_PREVIEW_SLOTS } from "@/contracts/values";

/**
 * Constantes de la génération (décision 0081, B9-TL-1 : `src/server/config/generation.ts` ; spécification B9, B9b).
 * Aucun plafond ni montant ici : ceux-ci restent dans `usage.ts` (valeurs réservées à Samuel, B9-PO-10). Lu par les cas
 * d'usage de `src/server/creation/` et par l'expiration de `src/server/generation/`.
 */

/** Cases de l'aperçu (PO-6) : `GenerationStatus.expected`. */
export const CASES_APERCU = MAX_PREVIEW_SLOTS;

/** Jours couverts par l'aperçu (J1 et J2, B9-PO-5) : `GenerationStatus.days`. */
export const JOURS_APERCU = 2;

/**
 * N de l'expiration d'une exécution figée (0081 B9-TL-3 point 5) : 20 minutes depuis `updated_at`. Revu dans la même PR
 * si la durée maximale d'une étape change (0075).
 */
export const EXPIRATION_EXECUTION_MS = 20 * 60_000;

/**
 * Étapes de `generatePreview` et rang `step_seq` de chacune (décisions 0081 B9-TL-3 point 2 et 0087 § 2 : l'étape `l`,
 * contrôle du logement, s'insère entre `a` et `b`). Le rang d'une étape est fixé ici, jamais calculé par le workflow.
 */
export const ETAPES_APERCU = ["a", "l", "b", "c", "d", "e"] as const;
export type EtapeApercu = (typeof ETAPES_APERCU)[number];

export const RANG_ETAPE: Readonly<Record<EtapeApercu, number>> = { a: 1, l: 2, b: 3, c: 4, d: 5, e: 6 };

/**
 * `maxRetries` de chaque étape (0081 B9-TL-3 point 1) : seule l'étape `a` (déterministe, sans appel) est rejouée par la
 * file. Les étapes `l` à `e` ne le sont jamais : une étape rejouée repaierait ses appels. Un nouvel essai passe par
 * `retryGeneration` seulement.
 */
export const MAX_RETRIES_ETAPE: Readonly<Record<EtapeApercu, number>> = { a: 2, l: 0, b: 0, c: 0, d: 0, e: 0 };

/**
 * Étapes du lot `batchRecompute` (workflow 5, décision 0119 § 1.4 point 1) : `a` (jours touchés, forfait) et `e` (relecture,
 * planification des jours touchés, raisons, publication), sur les noms d'étape existants (`step` admet `a` et `e`). Tables
 * propres au lot, distinctes de celles de l'aperçu (où `e` vaut 6) : rang fixé ici, jamais calculé par le workflow.
 */
export const ETAPES_LOT = ["a", "e"] as const;
export type EtapeLot = (typeof ETAPES_LOT)[number];
export const RANG_LOT: Readonly<Record<EtapeLot, number>> = { a: 1, e: 2 };
/** `maxRetries` du lot (0119 § 1.4 point 1) : `a` est déterministe et sans appel ; `e` rejouée repaierait. */
export const MAX_RETRIES_LOT: Readonly<Record<EtapeLot, number>> = { a: 2, e: 0 };

/**
 * Étapes de `generateProgramme` (chaîne inversée, décision 0136 § 2.2) : `a` (relecture, conversion, forfait du profil
 * `programme`) et `e` (étape « programme » : logements, rédaction, vérification, assemblage, publication), sur les lettres
 * existantes (précédent du lot, 0119 § 1.4). Tables propres, distinctes de celles de l'aperçu de l'ancienne chaîne
 * (`RANG_ETAPE` inchangé, où `e` vaut 6) : rang fixé ici, jamais calculé par le workflow.
 */
export const ETAPES_PROGRAMME = ["a", "e"] as const;
export type EtapeProgramme = (typeof ETAPES_PROGRAMME)[number];
export const RANG_PROGRAMME: Readonly<Record<EtapeProgramme, number>> = { a: 1, e: 2 };
/** `maxRetries` de `generateProgramme` (0136 § 2.2) : `a` est déterministe et sans appel ; `e` rejouée repaierait. */
export const MAX_RETRIES_PROGRAMME: Readonly<Record<EtapeProgramme, number>> = { a: 2, e: 0 };

/** Chaîne de l'aperçu de l'adaptateur `api` (décision 0136 § 4.1). */
export type ChaineApercu = "inversee" | "ancienne";

/**
 * Chaîne de l'aperçu de `api` (décision 0136 § 4) : une constante de code, changée par une PR, **ni variable
 * d'environnement, ni variable Vercel**. Lue à l'appel par la composition de l'app (dépendances par défaut de
 * `src/server/creation` et de `src/server/generation`), passée en dépendance `chaine` ; un jeu de dépendances injecté qui ne
 * la nomme pas vaut `"ancienne"`. Posée à `"ancienne"` par M1a-2 (0136 § 12) ; M1a-3 la passe à `"inversee"`, avec son test.
 */
export const CHAINE_APERCU: ChaineApercu = "ancienne";

/**
 * Garde technique du récit sur `api` (verdict 0139 § 1.2 point 6 ; décision 0136 § 3 « Récit ») : `false` tant que Samuel
 * n'a pas répondu oui à la question Q636 (récit de vrais comptes envoyé au fournisseur de modèles). Fermée : `createTrip`
 * n'écrit pas `briefs.story` et l'étape `e` de `generateProgramme` passe `recit: undefined` à la conversion. Passée à `true`
 * par une PR qui cite sa réponse.
 */
export const RECIT_API_AUTORISE = false;

/**
 * Part du forfait de l'aperçu qui revient à chaque étape, en pourcentage (valeurs de départ du Tech Lead, B9-TL-3
 * point 5). Pour chaque ressource, les parts des étapes qui la consomment font 100 ; la dernière étape reçoit le reste
 * de l'arrondi. Un registre en mémoire par étape est borné par sa part.
 */
export const PARTS_FORFAIT = {
  modeles: { b: 60, d: 20, e: 20 },
  details: { l: 10, c: 10, e: 80 },
  textSearch: { l: 20, c: 80 },
  routes: { e: 100 },
} as const;

/** Marge de fiches de remplacement (Q389), même règle que le mode réel de P0 (`prototype/config/mode-reel.json`). */
export const MARGE_FICHES = { minimum: 4, part: 0.2 } as const;

/** Coûts estimés réservés avant chaque appel de modèle, en micro-USD (valeurs de `mode-reel.json`, remplacées par le coût réel). */
export const COUTS_ESTIMES_MICROS = { requeteModele: 20_000, rechercheWeb: 40_000 } as const;

/** Rejeu borné de la transaction de publication de l'étape e (0081 B9-TL-3 point 6) : tentatives au plus, sans nouvel appel externe. */
export const TENTATIVES_PUBLICATION = 3;

/**
 * Durée maximale d'une étape (décision 0075 : 800 s par fonction Vercel) diminuée d'une marge : aucun appel externe ne part
 * si son délai entier ne tient plus avant l'échéance.
 */
export const DUREE_ETAPE_MS = 700_000;

/**
 * Branche de préversion Vercel sur laquelle la barrière (B9-TL-8) peut s'ouvrir : valeur posée par Samuel (question 6).
 * `null` tant qu'il n'en a pas désigné : la barrière reste fermée, la composition simulée.
 */
export const BRANCHE_APPELS_REELS: string | null = null;

/** Déclarations de déploiement (`VADROUILLE_ENV`, `VERCEL_ENV`) qui ne sont pas la production. */
const DEPLOIEMENTS_HORS_PRODUCTION: ReadonlySet<string> = new Set(["local", "development", "ci", "test", "preview", "staging"]);

/**
 * Prédicat partagé de la barrière (B9-TL-8, `evaluerBarriere`) et du chargeur de fixtures (0105 § 2 point 2) : vrai si
 * aucune déclaration n'est posée, si l'une vaut `production` ou si l'une est inconnue (la plus restrictive des deux).
 * Fonction pure : les déclarations sont passées par l'appelant, jamais lues ici.
 */
export function deploiementTraiteCommeProduction(env: Readonly<Record<string, string | undefined>>): boolean {
  const declarees = [env.VADROUILLE_ENV, env.VERCEL_ENV].map((v) => v?.trim().toLowerCase()).filter((v): v is string => v !== undefined && v !== "");
  return declarees.length === 0 || declarees.some((v) => !DEPLOIEMENTS_HORS_PRODUCTION.has(v));
}

/**
 * Candidats d'idée « Surprends-moi » offerts par jour planifié, avant le choix de `ideeDuJour` (0105 § 5.1 point 2), passés en
 * paramètre à `candidatsDIdees` (le domaine ne lit aucune configuration).
 */
export const IDEES_PAR_JOUR = 3;

/** Borne du lot de rédaction ajouté par les idées (0105 § 5.1 points 2 et 3) : dérivée, jamais écrite en dur (6 aujourd'hui). */
export const IDEES_CANDIDATES_MAX = IDEES_PAR_JOUR * JOURS_APERCU;

/** Villes de l'aperçu : J1 et J2 (`JOURS_APERCU`) ; une recherche par ville, dans l'ordre du séjour. */
export const JOURS_PLANIFIES_APERCU: readonly number[] = [1, 2];

/**
 * Écriture des positions de la version publiée au cache `place_coordinates` (0081 B9-TL-9, 0060 § 3.4 condition (a), 0100
 * § 3.1 point 2). `false` tant que `coords-purge.yml` n'a réussi aucun passage (aucun succès relevé au 2026-10-20) : aucune
 * écriture du MVP sur la base réelle avant ce premier succès. Le CEO la passe à `true` par une PR dès qu'il a relevé ce premier
 * succès (condition (a) de 0060 § 3.4) ;
 * `POSITIONS_ECRITURE_SUSPENDUE=1` la suspend ensuite sans redéploiement de code (0060 § 1.3). Jamais d'écriture non plus
 * pour la variante simulée : ses positions viennent des fixtures, pas de Google.
 */
export const ECRITURE_POSITIONS_AUTORISEE = false;

/**
 * Écriture de programmes réels (spécification B9, question 9 à Samuel ; 0011 l. 77 : « d'ici là, B9 ne branche pas
 * l'écriture de programmes réels »). `false` tant qu'il n'a pas répondu : même quand la barrière rend `reelle`, la
 * composition reste simulée. B9e la lie à sa réponse.
 */
export const ECRITURE_PROGRAMMES_REELS_AUTORISEE = false;

/**
 * Reprises d'un voyage complet par la personne (B9-PO-17 point 3 ; décision 0087 § 1.2) : l'échec initial, puis **3**
 * reprises au plus. Valeur de configuration passée en paramètre à l'écriture conditionnelle de reprise, jamais une constante
 * de la base.
 */
export const MAX_REPRISES_PERSONNE = 3;

/**
 * Étouffement de la réconciliation du voyage complet (0081 B9-TL-12 point 3) : depuis une lecture d'état, une ligne `full`
 * restée `queued` sans `workflow_run_id` n'est réclamée et redémarrée que si elle n'a pas été touchée depuis 60 secondes.
 */
export const ETOUFFEMENT_RECONCILIATION_MS = 60_000;

/**
 * Borne du rang `step_seq` d'une exécution `full` (0087 § 1.3 point 4 : `2 + 4 × i + k`) : jours planifiés par une exécution
 * au plus. Garde de l'état sérialisé seulement (aucun voyage du MVP n'en approche : 5 à 10 jours, cadrage).
 */
export const JOURS_VOYAGE_COMPLET_MAX = 60;
