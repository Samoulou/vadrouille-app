import "server-only";

import { z } from "zod";

import { ETAPES_REQUETE, MAX_TOKENS, usdEnMicros, type ClientModeles, type RequeteModele, type ReponseModele } from "@/ai/client";
import { CODES_ERREUR_IA, REESSAYABLES, type CodeErreurIa, type ResultatIa } from "@/ai/erreurs";
import { PROMPT_NOTATION } from "@/ai/prompts/notation";
import { PROMPT_PLAN } from "@/ai/prompts/plan";
import { PROMPT_PROGRAMME } from "@/ai/prompts/programme";
import { PROMPT_QUARTIER } from "@/ai/prompts/quartier";
import { PROMPT_RAISONS } from "@/ai/prompts/raisons";
import { PROMPT_RECHERCHE } from "@/ai/prompts/recherche";
import { PROMPT_RECHERCHE_WEB } from "@/ai/prompts/recherche-web";
import { PROMPT_STRUCTURATION } from "@/ai/prompts/structuration";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { MODELE_ID_PATTERN } from "@/ai/reglages";

/**
 * Traces de la couche IA (décision 0096 § 2, B7-TL-7 ; spécification B7, « Traces ») : un **port** maison sans
 * OpenTelemetry (aucune dépendance), des attributs d'une **liste fermée**, deux décorateurs, une seule voie et un seul
 * point d'application chacun. Implémentation par défaut : aucune (absence de `traces` : comportement de B7a, `pnpm p0`
 * inchangé). B9 écrit, hors de `src/ai`, l'adaptateur vers l'API OpenTelemetry (exportateur désactivé tant que Samuel
 * n'a pas retenu de service en région UE, Q28) ; il pose `executionId` et ne peut ajouter que les attributs de
 * `ATTRIBUTS_TRACE` et les identifiants techniques propres à OpenTelemetry.
 *
 * **Jamais** dans un attribut : un texte de prompt, de message, de réponse, de requête web ou de page ; une adresse, un
 * nom d'hôte, un titre ou un extrait ; un nom de lieu, une destination, une date du voyage ; un compte de candidats ;
 * un compte de pages lues ; une valeur Google. Aucun attribut n'est une chaîne libre : chaque chaîne vient d'une liste
 * fermée ou d'un motif, chaque nombre est un entier borné.
 *
 * **Les traces ne cassent jamais une étape** (point 5) : un attribut invalide fait abandonner la trace ; toute exception
 * du port est absorbée (jamais journalisée) ; une exception inattendue du client est tracée `erreur_inattendue` puis
 * propagée ; le code d'erreur fermé passe, jamais le message ni la pile.
 *
 * Le module n'importe que `@/ai/*` et `zod`. Il n'est pas chargé par `pnpm p0` : `import "server-only"`.
 */

/** Étapes tracées : les étapes de modèle (dont `programme`, décision 0116) et la recherche web du fournisseur. Un appel de modèle ou de recherche web. */
export const ETAPES_TRACE = [...ETAPES_REQUETE, "recherche_web"] as const;
export type EtapeTrace = (typeof ETAPES_TRACE)[number];

/** Identifiants de prompt admis dans un attribut : la liste fermée de `src/ai/prompts/`. */
export const PROMPTS_TRACE = [
  PROMPT_PLAN.id,
  PROMPT_RECHERCHE.id,
  PROMPT_NOTATION.id,
  PROMPT_RAISONS.id,
  PROMPT_STRUCTURATION.id,
  PROMPT_QUARTIER.id,
  PROMPT_RECHERCHE_WEB.id,
  PROMPT_PROGRAMME.id,
] as const;
export type PromptTrace = (typeof PROMPTS_TRACE)[number];

/** Statuts admis : `ok`, un code fermé de la couche IA, ou `erreur_inattendue`. */
export const STATUTS_TRACE = ["ok", ...CODES_ERREUR_IA, "erreur_inattendue"] as const;
export type StatutTrace = (typeof STATUTS_TRACE)[number];

/**
 * Liste fermée des attributs exportables : aucun autre attribut ne peut être exporté. `executionId` est posé par
 * l'adaptateur de B9 (qui connaît l'exécution), jamais par `src/ai` : il n'est ni dans `DebutEtape` ni dans `FinEtape`.
 */
export const ATTRIBUTS_TRACE = [
  "executionId",
  "etape",
  "modele",
  "promptId",
  "promptVersion",
  "dureeMs",
  "tokensEntree",
  "tokensSortie",
  "coutMicros",
  "statut",
] as const;
export type AttributTrace = (typeof ATTRIBUTS_TRACE)[number];

/**
 * Identifiant d'exécution exporté : opaque, aléatoire (UUID), jamais dérivé d'un identifiant d'organisation, de voyage,
 * de personne ni de lieu. Motif nouveau (décision 0096 § 2 point 3) : un identifiant qui ne le suit pas est **omis**.
 */
export const MOTIF_EXECUTION_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Identifiant d'exécution admis dans une trace, ou `undefined` (à omettre). Lu par l'adaptateur de B9. */
export function executionIdAdmis(valeur: unknown): string | undefined {
  return typeof valeur === "string" && MOTIF_EXECUTION_ID.test(valeur) ? valeur : undefined;
}

/** Bornes des attributs numériques (décision 0096 § 2 point 3). */
export const DUREE_MAX_MS = 1_800_000;
export const TOKENS_MAX = MAX_TOKENS;
export const COUT_MAX_MICROS = 1_000_000_000;

export const DebutEtapeSchema = z.strictObject({
  etape: z.enum(ETAPES_TRACE),
  modele: z.string().max(100).regex(MODELE_ID_PATTERN),
  promptId: z.enum(PROMPTS_TRACE),
  promptVersion: z.number().int().min(1).max(999),
});
export type DebutEtape = z.infer<typeof DebutEtapeSchema>;

export const FinEtapeSchema = z.strictObject({
  statut: z.enum(STATUTS_TRACE),
  dureeMs: z.number().int().min(0).max(DUREE_MAX_MS).optional(),
  tokensEntree: z.number().int().min(0).max(TOKENS_MAX).optional(),
  tokensSortie: z.number().int().min(0).max(TOKENS_MAX).optional(),
  coutMicros: z.number().int().min(0).max(COUT_MAX_MICROS).optional(),
});
export type FinEtape = z.infer<typeof FinEtapeSchema>;

/** Jeton opaque rendu par le port à `debutEtape`, rendu tel quel à `finEtape`. */
export type JetonEtape = object;

/**
 * Port de traces. Les deux méthodes sont **synchrones** et ne rendent rien d'autre : toute valeur rendue par
 * `finEtape` est ignorée, `debutEtape` rend le seul jeton.
 */
export interface TracesIa {
  debutEtape(debut: DebutEtape): JetonEtape;
  finEtape(jeton: JetonEtape, fin: FinEtape): void;
}

/** Horloge injectée, en millisecondes (`Date.now` par défaut dans la composition, un double dans les tests). */
export type HorlogeTraces = () => number;

// --- Absorption des exceptions du port --------------------------------------------------------------------------------

const ignorer = () => undefined;

/**
 * Appelle une fonction du port : toute exception est absorbée (jamais journalisée) ; la lecture de `then` est **elle-même
 * dans le `try`** (un getter `then` qui lève est absorbé) ; une valeur qui a une méthode `then` reçoit un `.catch` vide
 * (aucun rejet non géré). Rend la valeur lue (jamais une valeur « thenable »), ou `undefined`.
 */
function appelerPort(appel: () => unknown): unknown {
  try {
    const valeur = appel();
    if (valeur === null || (typeof valeur !== "object" && typeof valeur !== "function")) return valeur;
    const alors: unknown = (valeur as { then?: unknown }).then;
    if (typeof alors === "function") {
      void Promise.resolve(valeur).catch(ignorer);
      return undefined;
    }
    return valeur;
  } catch {
    return undefined;
  }
}

function debuter(traces: TracesIa, debut: DebutEtape | undefined): JetonEtape | undefined {
  if (debut === undefined) return undefined;
  const jeton = appelerPort(() => traces.debutEtape(debut));
  // Pas d'objet, pas de jeton : `finEtape` n'est alors jamais appelé pour cette étape (jamais avec `undefined`).
  return typeof jeton === "object" && jeton !== null ? jeton : undefined;
}

function terminer(traces: TracesIa, jeton: JetonEtape | undefined, fin: unknown): void {
  if (jeton === undefined) return;
  const lu = FinEtapeSchema.safeParse(fin);
  if (lu.success) {
    appelerPort(() => traces.finEtape(jeton, lu.data));
    return;
  }
  // Attributs de fin invalides : le seul `statut` ferme l'intervalle (jamais d'attribut hors liste).
  const statut = FinEtapeSchema.shape.statut.safeParse((fin as { statut?: unknown } | null)?.statut);
  appelerPort(() =>
    traces.finEtape(jeton, {
      statut: statut.success ? statut.data : "erreur_inattendue",
    }),
  );
}

// --- Lecture des attributs ---------------------------------------------------------------------------------------------

const CODES_FERMES: ReadonlySet<string> = new Set(CODES_ERREUR_IA);

const CODES_REESSAYABLES: ReadonlySet<string> = new Set(REESSAYABLES);

/**
 * Code fermé porté par une exception (`ErreurOpenRouter`, `ErreurModele`), sinon `undefined` : jamais le message ni la
 * pile. La lecture de `code` est dans un `try` (un accesseur qui lève ne casse ni la couche ni la trace). Définition
 * unique, lue aussi par `couche.ts` et `recherche.ts` (revue de B7b, mineur 2).
 */
export function codeFermeDe(erreur: unknown): CodeErreurIa | undefined {
  try {
    const code: unknown = erreur instanceof Error ? (erreur as { code?: unknown }).code : undefined;
    return typeof code === "string" && CODES_FERMES.has(code) ? (code as CodeErreurIa) : undefined;
  } catch {
    return undefined;
  }
}

/** Échec attendu d'une fonction de la couche IA : code fermé, `retryable` vrai seulement pour `REESSAYABLES`. */
export function echecIa<T>(code: CodeErreurIa): ResultatIa<T> {
  return { ok: false, code, retryable: CODES_REESSAYABLES.has(code) };
}

/** Statut d'une exception du client : son code fermé, sinon `erreur_inattendue` ; jamais le message ni la pile. */
function statutDe(erreur: unknown): StatutTrace {
  return codeFermeDe(erreur) ?? "erreur_inattendue";
}

/** Début d'une étape de modèle : lit `etape`, `modele` et `prompt` de la requête, **jamais** `messages`. */
function debutDeRequete(requete: RequeteModele): DebutEtape | undefined {
  try {
    const lu = DebutEtapeSchema.safeParse({
      etape: requete.etape,
      modele: requete.modele,
      promptId: requete.prompt?.id,
      promptVersion: requete.prompt?.version,
    });
    return lu.success ? lu.data : undefined;
  } catch {
    return undefined;
  }
}

const COUT_VALIDE = (valeur: unknown): valeur is number => typeof valeur === "number" && Number.isFinite(valeur) && valeur >= 0;

/** `coutMicros` : conversion par `usdEnMicros` (`Math.round`) puis écrêtage à [0, 1 000 000 000] ; non fini ou négatif : omis. */
export function coutMicrosDe(coutUsd: unknown): number | undefined {
  if (!COUT_VALIDE(coutUsd)) return undefined;
  return Math.min(COUT_MAX_MICROS, Math.max(0, usdEnMicros(coutUsd)));
}

function dureeDe(debut: number, fin: number): number {
  const duree = Number.isFinite(fin - debut) ? Math.round(fin - debut) : 0;
  return Math.min(DUREE_MAX_MS, Math.max(0, duree));
}

/** Instant de l'horloge injectée ; une horloge qui lève ou rend une valeur non finie compte pour 0 (la trace reste fermée). */
function maintenant(horloge: HorlogeTraces): number {
  try {
    const instant = horloge();
    return Number.isFinite(instant) ? instant : 0;
  } catch {
    return 0;
  }
}

/**
 * Jetons de la réponse (point 6) : les nombres reçus sont passés tels quels aux attributs, dont le schéma les contrôle
 * (entier de 0 à `TOKENS_MAX`) ; une valeur hors bornes fait fermer l'intervalle avec le seul `statut`, jamais une
 * exception. Un champ absent ou qui n'est pas un nombre est omis.
 */
function tokensDe(reponse: ReponseModele): {
  tokensEntree?: number;
  tokensSortie?: number;
} {
  try {
    const tokens = reponse.tokens;
    if (tokens === undefined || tokens === null) return {};
    return {
      ...(typeof tokens.entree === "number" ? { tokensEntree: tokens.entree } : {}),
      ...(typeof tokens.sortie === "number" ? { tokensSortie: tokens.sortie } : {}),
    };
  } catch {
    return {};
  }
}

// --- Décorateurs --------------------------------------------------------------------------------------------------------

/** Clients déjà décorés (ensemble privé, faible) : un client déjà décoré est rendu tel quel, aucune étape n'est tracée deux fois. */
const DECORES = new WeakSet<object>();

/**
 * Décore un client de modèles : une étape tracée = un appel de modèle. Appliqué **par `creerCoucheIa`** quand `traces`
 * est fourni (signature inchangée) ; si `src/research` appelle un modèle hors de la couche (étape `recherche` de
 * l'agent), la composition lui passe le **même** client déjà décoré, jamais un second décorateur (un client déjà décoré
 * est rendu tel quel).
 */
export function tracerModeles(client: ClientModeles, traces: TracesIa, horloge: HorlogeTraces): ClientModeles {
  if (DECORES.has(client)) return client;
  const decore: ClientModeles = {
    async envoyer(requete) {
      const debut = maintenant(horloge);
      const jeton = debuter(traces, debutDeRequete(requete));
      let statut: StatutTrace = "ok";
      let reponse: ReponseModele | undefined;
      try {
        reponse = await client.envoyer(requete);
        return reponse;
      } catch (erreur) {
        statut = statutDe(erreur);
        throw erreur;
      } finally {
        const cout = reponse === undefined ? undefined : coutMicrosDe(reponse.coutUsd);
        terminer(traces, jeton, {
          statut,
          dureeMs: dureeDe(debut, maintenant(horloge)),
          ...(reponse === undefined ? {} : tokensDe(reponse)),
          ...(cout === undefined ? {} : { coutMicros: cout }),
        });
      }
    },
  };
  DECORES.add(decore);
  return decore;
}

/**
 * Décore un client de recherche web : ne lit de la requête que sa **présence** (la requête web n'est jamais tracée), pose
 * l'étape `recherche_web`, le modèle de la configuration et le prompt `PROMPT_RECHERCHE_WEB` (jamais depuis la requête).
 * Appliqué **par la composition** (B9c, `src/server/composition/generation.ts`) avant de passer le client à
 * `creerRecherche` (qui ne reçoit pas de `traces?`). Un client déjà décoré est rendu tel quel.
 */
export function tracerRechercheWeb(
  client: ClientRechercheWeb,
  traces: TracesIa,
  reglage: { readonly modele: string },
  horloge: HorlogeTraces,
): ClientRechercheWeb {
  if (DECORES.has(client)) return client;
  const decore: ClientRechercheWeb = {
    async rechercher(requete) {
      const debut = maintenant(horloge);
      const lu = DebutEtapeSchema.safeParse({
        etape: "recherche_web",
        modele: reglage.modele,
        promptId: PROMPT_RECHERCHE_WEB.id,
        promptVersion: PROMPT_RECHERCHE_WEB.version,
      });
      const jeton = debuter(traces, lu.success ? lu.data : undefined);
      let statut: StatutTrace = "ok";
      let coutUsd: unknown;
      try {
        const reponse = await client.rechercher(requete);
        coutUsd = reponse.coutUsd;
        return reponse;
      } catch (erreur) {
        statut = statutDe(erreur);
        throw erreur;
      } finally {
        const coutMicros = coutMicrosDe(coutUsd);
        terminer(traces, jeton, {
          statut,
          dureeMs: dureeDe(debut, maintenant(horloge)),
          ...(coutMicros === undefined ? {} : { coutMicros }),
        });
      }
    },
  };
  DECORES.add(decore);
  return decore;
}
