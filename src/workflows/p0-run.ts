import "server-only";

import { FatalError } from "workflow";

import { ecrireProgramme } from "@/adapters/prototype-ecriture";
import { cloreExecution, ecrireCoutModeles, ecrirePhase, lireCandidats, lireExecution, remplacerCandidats } from "@/adapters/prototype-travail";
import { MAX_RESULTATS_WEB, type ReponseModele } from "@/ai/client";
import { lireNotes, lireRaisons } from "@/ai/sorties";
import type { ExecutionEnCours, LigneCandidat, PhaseTravail } from "@/contracts/prototype-travail";
import { ancrerCandidatsDansZone, ancrerLogementsDuSejour } from "@/grounding/ancrage-zone";
import { creerCadence, ErreurBudgetRoutes, planRoutes, routesDuSejour } from "@/grounding/budget-routes";
import { fichesEtapeFinale, margeRemplacement } from "@/grounding/fiches-finales";
import { regrouperParJour } from "@/grounding/zone";
import type { AncrageResolu, Position, Trajets } from "@/prototype/ancrage";
import { CODES_ARRET, codePersiste, type CodeArret } from "@/prototype/arret";
import { BriefSchema, type Brief } from "@/prototype/brief";
import { CandidatSchema, type Candidat, type CandidatNote } from "@/prototype/candidat";
import {
  ConfigModelesSchema,
  ConfigRechercheSchema,
  modelesDeLaVariante,
  validerConfigEssai,
  validerConfigModeReel,
  type ConfigModeReel,
  type ConfigModeles,
  type ConfigRecherche,
} from "@/prototype/config";
import { decouperProgramme } from "@/prototype/decoupage";
import { trajetsAConserver } from "@/prototype/programme-reduit";
import { reduireProgramme } from "@/prototype/reduction";
import { chercherCandidats, tempsPourAppel, type CompteursAgent, type EtatAgent } from "@/research/agent";
import { DELAI_MAX_MS, type LecteurPages } from "@/research/fetch-page";
import { bornerLecteur, bornerRecherche, PlafondAgentAtteint } from "@/research/plafonds-agent";
import { composerP0Reel, type CompositionP0Reel } from "@/server/composition/p0-reel";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assembler, type Raison } from "@/server/p0/assemblage";
import {
  bornesDepuisConfig,
  bornesDepuisDemande,
  type BornesRechercheP0,
  candidatPourModele,
  complementDepuisBrief,
  donneesProtegeesDepuisBrief,
  entreeModelesDepuisBrief,
  lieuRetenuDepuisCandidat,
} from "@/server/p0/vers-couche-ia";
import { poolPrototype } from "@/server/p0/base";
import { verifierGardeEtape, type GardeOuverte } from "@/server/p0/garde";
import {
  classementParType,
  identifiantDuVoyage,
  joursDuSejour,
  lireClassement,
  planifierLeJour,
} from "@/server/p0/moteur-final";
import {
  briefDepuisBrief,
  candidatVersMoteur,
  demandesDuSejour,
  engagementsDepuisBrief,
  evenementVersMoteur,
  joursDeFermeture,
  modeDeTrajet,
  nuitsDepuisBrief,
  relecturesDepuisAncrages,
  TYPES_SERIE,
  type TypeSerie,
  violationsP0,
} from "@/server/p0/vers-moteur";
import { TablePrixGoogleSchema } from "@/server/usage/cout-google";
import { forfaitExecution, forfaitRelecture, LIMITES_PROTOTYPE, QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, type Forfait, type PlafondsRelecture, type SkusForfait } from "@/server/usage/forfait";
import type { PoolSql, ReglesForfait } from "@/server/usage/neon";
import { DELAI_PORT_MS, DELAI_REQUETE_MS, type DemandeReservation, type Plafond } from "@/server/usage/port";
import { creerRegistreForfait, type RegistreForfait } from "@/server/usage/registre";
import { errorNameOf, logEvent } from "@/server/log";
import { journaliserEchecEtape, type PhaseJournal } from "@/server/p0/journal-etape";

import edimbourg1 from "../../prototype/briefs/edimbourg-1.json";
import edimbourg2 from "../../prototype/briefs/edimbourg-2.json";
import edimbourg3 from "../../prototype/briefs/edimbourg-3.json";
import edimbourgCourt from "../../prototype/briefs/edimbourg-court.json";
import rome1 from "../../prototype/briefs/rome-1.json";
import configClassement from "../../prototype/config/classement.json";
import configEssai from "../../prototype/config/essai.json";
import configModeles from "../../prototype/config/modeles.json";
import configModeReel from "../../prototype/config/mode-reel.json";
import configRecherche from "../../prototype/config/recherche.json";
import prixGoogle from "../../prototype/config/prix-google.json";
import configRechercheEssai from "../../prototype/config/recherche-essai.json";

/**
 * Workflow `p0Run` du mode réel (décision 0055, sections 3, 6 et 8, ligne P0r3c ; décision 0009 ; décision 0063).
 *
 * **Pont** entre l'application et les modules de P0, au même titre que la composition (D18) : seul importateur de
 * `src/server/composition/p0-reel.ts` et des adaptateurs du prototype (`prototype-travail.ts`, `prototype-ecriture.ts`) ;
 * lui-même importé par `src/workflows/index.ts` seulement. Il **câble** les étapes : garde, relecture de l'exécution,
 * configuration du mode, composition, appel des fonctions de `src/research`, `src/grounding` et du moteur (par
 * `src/server/p0` seulement : `moteur-final.ts`, `vers-moteur.ts`, `assemblage.ts`), écriture. Aucune règle métier ici
 * (0009 point 1).
 *
 * Règles de chaque étape (`"use step"`), dans cet ordre :
 * 1. **`verifierGardeEtape` à l'entrée** (0055 § 1 point 2 ; S-1 point 3) : garde fermée → arrêt sans connexion au-delà
 *    de la lecture de l'exécution, sans lecture de clé, sans appel (`FatalError`, code fermé) ;
 * 2. **garde d'idempotence** (mineur 6 de la revue du head `608ee99`, PR 348 ; 0063, amendement P0r3c-5) : la phase de
 *    l'étape n'est écrite que si la phase en base est celle qui la précède (`ecrirePhase`) ; une étape redistribuée par
 *    la file après expiration s'arrête là (`pipeline_failed`), avant toute composition, sans repayer ses appels ;
 * 3. **fabriques appelées dans l'étape** : `composerP0Reel` puis la seule famille de l'étape (`agent()`, `ancrage()` ou
 *    `etapeFinale()`) ; aucun client, registre ni composition en cache de module, aucun objet ne traverse la frontière
 *    sérialisée (réponse 4 de la Sécurité, PR 326) ;
 * 4. **état sérialisé réduit à l'identifiant d'exécution** (0009 point 3, 0011 § 3, 0052 § 1.5) : entrée et sortie de
 *    chaque étape, et du workflow, sont `{ runId }` (clôture : `{ runId, code }`) ; brief, candidats et `placeId` sont
 *    relus et écrits en base dans l'étape ; une erreur ne sort de l'étape que par un code de `CODES_ARRET`
 *    (`codePersiste`, S4), jamais par son message ;
 * 5. **plafonds** : un registre en mémoire par étape, borné par la part du forfait de l'exécution qui revient à
 *    l'étape (`forfaitDeLEtape`) ; le coût des modèles déjà compté est relu en base (`runs.cost_models_micros`) et
 *    réécrit avant la fin de l'étape, si bien qu'aucune étape ne dispose de plus que le reste du plafond ;
 * 6. **échéance** (marge de durée, réponse 1 du Tech Lead, PR 348 ; décision 0075) : un appel externe ne part que si son
 *    délai entier (`DELAI_REQUETE_MS`, `DELAI_MAX_MS` d'une page) tient avant l'échéance de l'étape, sinon `cap_reached`
 *    sans appel ; l'agent de recherche le demande avant chaque appel et se termine proprement s'il n'a plus le temps
 *    (ticket 407) ;
 * 7. **aucune relance** (`maxRetries = 0`) : une étape rejouée repaierait ses appels.
 *
 * **Barrière hors de Vercel** (réponse 4 de la Sécurité, PR 326) : la route `/.well-known/workflow/v1/flow` est exposée
 * sans authentification propre hors de Vercel (monde local, repli Postgres de 0009) ; chaque étape y rencontre la garde,
 * qui exige la préversion Vercel de `p0-reel` (`VERCEL_ENV`, `VERCEL_GIT_COMMIT_REF`, `P0_REAL_RUNS`, jeton, base) :
 * fermée, elle arrête l'étape avant tout appel. Le repli Postgres n'est pas branché ; il demanderait son propre verdict.
 */

/** Entrée et sortie du workflow et de chaque étape : l'identifiant d'exécution, rien d'autre (0011 § 3). */
export type EtatP0Run = { readonly runId: string };

/** Briefs admis : fichiers de `prototype/briefs/` (test d'égalité avec le dossier), lus par nom de fichier. */
const BRIEFS: ReadonlyMap<string, unknown> = new Map([
  ["edimbourg-1.json", edimbourg1],
  ["edimbourg-2.json", edimbourg2],
  ["edimbourg-3.json", edimbourg3],
  ["edimbourg-court.json", edimbourgCourt],
  ["rome-1.json", rome1],
]);

/** Noms de fichiers des briefs admis (pour le test d'égalité avec `prototype/briefs/`). */
export const NOMS_BRIEFS: readonly string[] = [...BRIEFS.keys()];

/**
 * Durée maximale d'une fonction Vercel du compte (décision 0075) : formule Pro depuis le 2026-10-13, 800 s au plus
 * (documentation Vercel « Configuring Maximum Duration », relevée le 2026-10-15 : Hobby 300 s, Pro et Enterprise 800 s
 * au plus, avec Fluid Compute). Le SDK pose `maxDuration: "max"` sur la route des étapes (`@workflow/next` 5.0.2,
 * `.well-known/workflow/v1/config.json`), que la plateforme résout selon la formule au déploiement : 800 s en Pro.
 * Avant 0075 : 300 s, la plus basse des formules.
 */
export const LIMITE_FONCTION_MS = 800_000;

/**
 * Durée gardée pour les étapes suivantes (décision 0075) : avec 800 s par étape, une étape pourrait consommer presque
 * toute la durée de l'exécution (`dureeMs`, 900 s) et priver les suivantes. L'échéance d'une étape laisse donc, sur la
 * durée restante, 150 s à l'ancrage (Text Search en série) et 300 s à l'étape finale (son ancienne fenêtre entière) :
 * la recherche a au plus 900 − 450 − 30 = 420 s (fenêtre des appels de modèle : 296 s, contre 146 s avant), l'ancrage
 * au plus ce qui reste moins 300 s, l'étape finale tout ce qui reste.
 */
export const RESERVE_ETAPES_SUIVANTES_MS: Readonly<Record<"recherche" | "ancrage" | "notation", number>> = {
  recherche: 450_000,
  ancrage: 300_000,
  notation: 0,
};

/**
 * Marge de la vérification de l'agent (ticket 407) : l'agent demande s'il a le temps un peu avant que le registre
 * réserve l'appel ; 1 s de plus évite qu'un appel admis par l'agent soit refusé par le registre quelques
 * millisecondes plus tard (ce refus-là reste une erreur, `pipeline_failed`).
 */
export const MARGE_VERIFICATION_AGENT_MS = 1_000;

/** Marge laissée après le dernier appel externe d'une étape : écritures en base (phase, coût, programme) et sortie. */
export const MARGE_FIN_ETAPE_MS = 30_000;

/** Code levé par une étape : déjà le code persisté (S4), seul texte qui franchit la frontière sérialisée. */
class ArretEtape extends FatalError {
  constructor(readonly code: CodeArret) {
    super(code);
    this.name = "ArretEtape";
  }
}

const estCodeArret = (valeur: unknown): valeur is CodeArret => typeof valeur === "string" && (CODES_ARRET as readonly string[]).includes(valeur);

/** Code d'une erreur : `.code` d'une erreur de client ou d'adaptateur, sinon inconnu (`pipeline_failed`). */
function codeDe(erreur: unknown, apresAppelPayant: boolean): CodeArret {
  const code = (erreur as { code?: unknown } | null)?.code;
  return codePersiste(typeof code === "string" ? code : undefined, apresAppelPayant);
}

/** Configuration du mode de l'exécution, validée ; refusée : `config_invalid` (avant tout appel). */
function configurationDuMode(mode: ExecutionEnCours["mode"]): ConfigModeReel {
  const lue = mode === "essai" ? validerConfigEssai(configEssai) : validerConfigModeReel(configModeReel);
  if (!lue.ok) throw new ArretEtape("config_invalid");
  return lue.config;
}

function briefDe(nom: string): Brief {
  const brut = BRIEFS.get(nom);
  const lu = brut === undefined ? undefined : BriefSchema.safeParse(brut);
  if (lu === undefined || !lu.success) throw new ArretEtape("brief_invalid");
  return lu.data;
}

/** Brief admis et valide (`BriefSchema`) : contrôlé au lancement, avant toute réservation (P0r3d). */
export function briefLancable(nom: string): boolean {
  try {
    briefDe(nom);
    return true;
  } catch {
    return false;
  }
}

/** Verrou S8 (0052 § 3, 0056 § 4), lu par le lancement avant toute réservation : l'adaptateur n'est importé qu'ici. */
export { verrouS8Leve } from "@/adapters/prototype-ecriture";

/**
 * SKU facturés par les clients réels de Google (P0r1), pour le forfait réservé au lancement : recopiés, parce que les
 * modules de capacité ne sont atteints que par la composition et que le code hors étapes de ce module entre dans le
 * paquet des workflows (aucun module Node n'y est admis) ; égaux à `SKU_TEXT_SEARCH`, `SKU_DETAILS` et `SKU_MATRICE`
 * (test d'égalité).
 */
export const SKUS_FORFAIT: SkusForfait = Object.freeze({
  textSearch: "places_text_search_essentials_ids_only",
  details: "places_details_enterprise",
  matrice: "routes_matrix_essentials",
});

/** Réservation d'une exécution du mode : forfait (0046, D13 point 3) et règles de la transaction de P0r2. */
export type LancementDuMode = { readonly forfait: Forfait; readonly regles: ReglesForfait };

/**
 * Forfait et règles de la réservation d'une exécution du mode (P0r3d), calculés comme les étapes lisent leur
 * configuration ; `null` si la configuration du mode, celle de l'agent, celle du classement ou la table de prix est
 * refusée : le lancement est alors refusé **avant** la réservation, sans consommer le jour (une étape l'arrêterait
 * sinon `config_invalid`).
 *
 * - Forfait : plafonds par méthode du mode au prix plein de `prototype/config/prix-google.json` (Q329), SKU des clients
 *   réels (`SKUS_FORFAIT`), plus le plafond de coût des modèles du mode (`coutUsd`). Google, Text Search (identifiants
 *   seulement) à 0 USD, fiches à 20 USD les 1 000, éléments Routes à 5 USD les 1 000 :
 *   - mode réel (`mode-reel.json`, 0053, limite Routes de 840 éléments par 0088 § 13) : 90 × 0 + 90 × 0,020 + 840 × 0,005
 *     = 0 + 1,80 + 4,20 = **6,00 USD** ;
 *   - essai (`essai.json`, plafonds alignés sur ceux du mode réel par la décision 0073) : même calcul, **6,00 USD**
 *     (0,88 USD avec les plafonds d'essai de 0063, points 8 et 9).
 *   Chiffres prouvés par `tests/unit/workflows/p0-run-lancement.test.ts`.
 * - Durée des orphelines : celle du mode réel, la plus longue, quel que soit le mode lancé ; une exécution réelle encore
 *   en cours n'est jamais close comme orpheline par le lancement d'un essai.
 */
export function lancementDuMode(mode: ExecutionEnCours["mode"]): LancementDuMode | null {
  if (mode !== "reel" && mode !== "essai") return null;
  const reel = validerConfigModeReel(configModeReel);
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!reel.ok || !table.success) return null;
  try {
    const config = configurationDuMode(mode);
    configurationAgent(mode, config);
    if (lireClassement(configClassement) === undefined) return null;
    const forfait = forfaitExecution(
      table.data,
      SKUS_FORFAIT,
      { placesTextSearch: config.placesTextSearch, placesDetails: config.placesDetails, routesRequetes: config.routesRequetes, routesElements: config.routesElements },
      Math.round(config.coutUsd * 1_000_000),
    );
    return { forfait, regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: config.uniteQuotaRoutes, dureeMaxMs: reel.config.dureeMs } };
  } catch {
    return null;
  }
}

/**
 * Plafonds d'**une** relecture Routes, c'est-à-dire d'une Journée affichée (P0r4, décision 0079 ; « Non tranché » de
 * 0053) : 40 requêtes de matrice et 40 éléments. Le relecteur fait une requête par lieu de départ et un élément par
 * trajet distinct de la journée : 40 couvre toute journée du prototype (une vingtaine de trajets au plus). Forfait au
 * prix plein : 40 × 0,005 = **0,20 USD** réservés, alors que le coût réel est d'un élément par trajet (tranche gratuite
 * de 10 000 éléments par mois non déduite, Q329). Constante, comme l'exige S4 : le forfait ne dépend que de la nature.
 */
export const PLAFONDS_RELECTURE: PlafondsRelecture = Object.freeze({ routesRequetes: 40, routesElements: 40 });

/**
 * Forfait et règles de la réservation d'une relecture Routes (P0r4, décision 0079), lus dans ce pont comme ceux du
 * lancement (l'application n'importe pas `src/prototype`, 0048 § 1) ; `null` si la configuration du mode réel ou la table
 * de prix est refusée (la relecture échoue alors fermée). Durée des orphelines : celle du mode réel, comme au lancement.
 */
export function relectureDuMode(): LancementDuMode | null {
  const reel = validerConfigModeReel(configModeReel);
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!reel.ok || !table.success) return null;
  try {
    return {
      forfait: forfaitRelecture(table.data, SKUS_FORFAIT, PLAFONDS_RELECTURE),
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: reel.config.uniteQuotaRoutes, dureeMaxMs: reel.config.dureeMs },
    };
  } catch {
    return null;
  }
}

/**
 * Dimensions du séjour qui bornent l'étape finale (ticket 400 : calculées de même au lancement et dans l'étape) : jours
 * du squelette, plan Routes sous les plafonds du mode, et première série (lieux demandés, un par créneau et l'idée)
 * face au budget de fiches (`placesDetails − 2 × logements`). `placeIdsLogements` : identifiants des logements relus
 * (étape finale) ou, au lancement, des repères distincts par logement (aucune donnée Google).
 */
function dimensionsDuSejour(brief: Brief, config: ConfigModeReel, placeIdsLogements: readonly string[]) {
  const nuits = nuitsDepuisBrief(brief, placeIdsLogements);
  const briefMoteur = briefDepuisBrief(brief);
  const voyage = { start: brief.arrivee, end: brief.depart };
  const jours = joursDuSejour({
    voyage,
    pace: briefMoteur.pace,
    nombreDeNuits: nuits.length,
    engagements: engagementsDepuisBrief(brief),
    configuration: CONFIGURATION_MOTEUR,
  });
  const plan = planRoutes(jours.length, { elements: config.routesElements, requetes: config.routesRequetes });
  const logementDe = (nuit: number) => (nuits.at(nuit) ?? nuits.at(0))?.placeId;
  const logementsDuJour = jours.map((jour) => [...new Set([logementDe(jour.logementDepart), logementDe(jour.logementArrivee)].flatMap((p) => (p === undefined ? [] : [p])))]);
  const capacites = logementsDuJour.map((ids) => Math.max(0, plan.n - ids.length));
  const { demandes, serie, premiereSerie } = demandesDuSejour(jours, CONFIGURATION_MOTEUR, capacites);
  const budgetFiches = config.placesDetails - 2 * brief.logements.length;
  return { nuits, briefMoteur, voyage, jours, plan, logementsDuJour, capacites, demandes, serie, premiereSerie, budgetFiches };
}

/** Repères distincts par logement, au lancement et à la recherche (aucun identifiant de lieu n'existe avant l'ancrage). */
const reperesDesLogements = (brief: Brief) => brief.logements.map((_, rang) => `logement-${rang + 1}`);

/**
 * Bornes de la recherche de l'exécution (ticket 483) : en **exécution comptée**, cibles calculées depuis la demande du
 * séjour (`bornesDepuisDemande` : première série de `dimensionsDuSejour`, plus 30 %), sous le plafond des candidats que
 * l'exécution peut trouver (`candidatsTrouves`) et ancrer (Text Search : `placesTextSearch − 2 × logements`, une requête
 * par logement à l'ancrage et une à l'étape finale) ; en **essai**, le profil fixe de `recherche-essai.json` (décision
 * 0073 point 4, réservée à Samuel, inchangée). `null` : plafond nul ou négatif, aucun candidat ancrable, l'exécution
 * s'arrête (`briefTientDansLeMode` refuse ce brief au lancement ; `etapeRecherche` s'arrête avant tout appel).
 */
function bornesDeLaRecherche(mode: ExecutionEnCours["mode"], config: ConfigModeReel, recherche: ConfigRecherche, brief: Brief): BornesRechercheP0 | null {
  if (mode !== "reel") return bornesDepuisConfig(recherche);
  const { serie } = dimensionsDuSejour(brief, config, reperesDesLogements(brief));
  return bornesDepuisDemande(recherche, serie, Math.min(config.candidatsTrouves, config.placesTextSearch - 2 * brief.logements.length));
}

/**
 * **Réservé aux tests** (mineur 4 de la revue de la PR #490 : aucun appelant de production) : bornes de la recherche
 * d'un brief commité dans un mode, par le même chemin que `etapeRecherche` ; `null` si brief ou configuration refusés,
 * ou plafond de recherche nul.
 */
export function bornesRechercheDuBriefPourTests(mode: ExecutionEnCours["mode"], nom: string): BornesRechercheP0 | null {
  try {
    const config = configurationDuMode(mode);
    return bornesDeLaRecherche(mode, config, configurationAgent(mode, config).recherche, briefDe(nom));
  } catch {
    return null;
  }
}

/**
 * Le brief tient-il dans les plafonds du mode (ticket 400) ? Contrôlé au lancement, avant toute réservation : le plan
 * Routes du séjour doit tenir et la première série ne pas dépasser le budget de fiches, sinon l'étape finale
 * s'arrêterait après des appels payants. Brief ou configuration refusés, ou calcul en erreur : `false`.
 */
export function briefTientDansLeMode(mode: ExecutionEnCours["mode"], nom: string): boolean {
  try {
    if (mode !== "reel" && mode !== "essai") return false;
    const brief = briefDe(nom);
    const config = configurationDuMode(mode);
    // Repères distincts par logement (aucun identifiant de lieu n'existe avant l'ancrage). Limite connue (mineur 9 du
    // head `cd614d4`) : si deux logements du brief s'ancraient au même lieu, l'étape finale verrait un seul logement les
    // jours de changement, donc une place de plus pour les lieux du jour (`capacites`), et sa première série pourrait
    // dépasser celle calculée ici d'au plus un lieu par jour de changement. Le plan Routes (nombre de jours) et le budget
    // de fiches (nombre de logements du brief) n'en dépendent pas. Cas d'un même logement saisi deux fois : non traité.
    const { plan, premiereSerie, budgetFiches } = dimensionsDuSejour(brief, config, reperesDesLogements(brief));
    // Mineur 10 de la revue de la PR #490 : un plafond de recherche nul (`placesTextSearch − 2 × logements` ≤ 0) refuse
    // le brief au lancement, comme un plan Routes qui ne tient pas.
    const recherche = bornesDeLaRecherche(mode, config, configurationAgent(mode, config).recherche, brief);
    return plan.tient && premiereSerie <= budgetFiches && recherche !== null;
  } catch {
    return false;
  }
}

/**
 * Clôture d'une exécution réservée dont le démarrage par le SDK a échoué (P0r3d) : `upstream_unavailable`, cause externe
 * qui ouvre la relance (P0S2-PO-13) ; aucun appel payant n'est parti. Si le SDK a tout de même mis l'exécution en file,
 * sa première étape la trouve close et s'arrête à la garde (`verifierGardeEtape` : exécution `en_cours` exigée). Le pool
 * est celui de l'appelant : le code hors étapes de ce module entre dans le paquet des workflows, qui n'admet ni `pg` ni
 * aucun module Node (`WorkflowBuildError`).
 */
export async function cloreExecutionNonDemarree(pool: PoolSql, garde: GardeOuverte): Promise<void> {
  await cloreExecution(pool, garde.runId, "upstream_unavailable");
}

/**
 * Modèles et profil de l'agent du mode : `recherche.json` (mode réel, profil léger de 0055 § 6 point 5) ou
 * `recherche-essai.json` (essai d'intégration : 12 candidats visés ; `toursMax` aligné sur le mode réel par 0073) ; le
 * total visé reste sous `candidatsTrouves`.
 */
function configurationAgent(mode: ExecutionEnCours["mode"], config: ConfigModeReel): { modeles: ConfigModeles; recherche: ConfigRecherche } {
  const modeles = ConfigModelesSchema.safeParse(configModeles);
  const recherche = ConfigRechercheSchema.safeParse(mode === "essai" ? configRechercheEssai : configRecherche);
  if (!modeles.success || !recherche.success || recherche.data.totalCandidats > config.candidatsTrouves) throw new ArretEtape("config_invalid");
  return { modeles: modeles.data, recherche: recherche.data };
}

/**
 * Part du forfait de l'exécution qui revient à une étape (0046, D13 point 3 : une méthode répartie par configuration ;
 * répartition de 0063 point 9, amendée par P0r3c-5) : à l'ancrage, Text Search sauf une requête par logement et une fiche
 * par logement ; à l'étape finale, une requête Text Search par logement, le reste des fiches et tout Routes.
 */
type PartEtape = { readonly textSearch: number; readonly details: number; readonly routesRequetes: number; readonly routesElements: number };

const SANS_GOOGLE: PartEtape = { textSearch: 0, details: 0, routesRequetes: 0, routesElements: 0 };

function forfaitDeLEtape(config: ConfigModeReel, execution: ExecutionEnCours, part: PartEtape): Forfait {
  const resteModeles = Math.max(0, Math.round(config.coutUsd * 1_000_000) - execution.coutModelesMicros);
  return {
    nature: "execution",
    textSearchRequetes: Math.max(0, part.textSearch),
    placeDetailsRequetes: Math.max(0, part.details),
    routesRequetes: Math.max(0, part.routesRequetes),
    routesElements: Math.max(0, part.routesElements),
    coutGoogleMicros: 0,
    coutModelesMicros: resteModeles,
  };
}

function plafondsDuForfait(forfait: Forfait): Plafond[] {
  return [
    { portee: "execution", fournisseur: "modeles", maxCoutMicros: forfait.coutModelesMicros ?? 0 },
    { portee: "execution", fournisseur: "google", methode: "places_text_search", maxRequetes: forfait.textSearchRequetes },
    { portee: "execution", fournisseur: "google", methode: "places_details", maxRequetes: forfait.placeDetailsRequetes },
    { portee: "execution", fournisseur: "google", methode: "routes_matrix", maxRequetes: forfait.routesRequetes, maxElements: forfait.routesElements },
  ];
}

type ContexteEtape = {
  readonly garde: GardeOuverte;
  readonly execution: ExecutionEnCours;
  readonly config: ConfigModeReel;
  readonly brief: Brief;
  /** Instant (horloge du serveur, ms) après lequel aucun appel externe ne doit encore être en cours. */
  readonly echeance: number;
};

/**
 * Entrée commune d'une étape : garde (durée du mode réel, la plus longue), exécution relue, configuration et brief ;
 * pour un essai, garde revérifiée avec sa durée propre (`essai.json` : 15 min depuis la décision 0073, 5 min avant). Puis
 * phase écrite (garde d'idempotence) et échéance : la plus proche de la limite de fonction et de la fin de la durée du
 * mode diminuée de la part gardée aux étapes suivantes (0075), moins la marge de fin d'étape.
 */
async function ouvrirEtape(runId: string, phase: PhaseTravail): Promise<ContexteEtape> {
  const dureeReel = validerConfigModeReel(configModeReel);
  const ouverte = await verifierGardeEtape(runId, { pool: poolPrototype, dureeMaxMs: dureeReel.ok ? dureeReel.config.dureeMs : 0 });
  if (!ouverte.ok) throw new ArretEtape("real_mode_unavailable");
  const debut = Date.now();
  const execution = await lireExecution(poolPrototype(), ouverte.garde.runId);
  const config = configurationDuMode(execution.mode);
  if (execution.mode === "essai") {
    const essai = await verifierGardeEtape(runId, { pool: poolPrototype, dureeMaxMs: config.dureeMs });
    if (!essai.ok) throw new ArretEtape("real_mode_unavailable");
  }
  const brief = briefDe(execution.brief);
  await ecrirePhase(poolPrototype(), ouverte.garde.runId, phase);
  const reserve = phase === "recherche" || phase === "ancrage" || phase === "notation" ? RESERVE_ETAPES_SUIVANTES_MS[phase] : 0;
  const echeance = debut + Math.min(LIMITE_FONCTION_MS, config.dureeMs - execution.ecouleMs - reserve) - MARGE_FIN_ETAPE_MS;
  return { garde: ouverte.garde, execution, config, brief, echeance };
}

/** Délai complet d'un appel réservé : requête du client et opérations du port qui l'entourent (D13 point 5). */
function delaiDeLAppel(methode: DemandeReservation["methode"]): number {
  const requete = methode === "chat" ? DELAI_REQUETE_MS.openrouter : methode === "routes_matrix" ? DELAI_REQUETE_MS.routes : DELAI_REQUETE_MS.places;
  return requete + 2 * DELAI_PORT_MS;
}

/**
 * Registre de l'étape : forfait de l'étape, et refus `cap_reached` sans appel de toute réservation dont le délai
 * complet ne tient pas avant l'échéance (tous les appels payants passent par une réservation, D13).
 */
function registreDeLEtape(forfait: Forfait, contexte: ContexteEtape): RegistreForfait {
  const registre = creerRegistreForfait(forfait, contexte.garde.runId, { maintenant: () => Date.now() });
  return {
    ...registre,
    async reserve(demande) {
      if (Date.now() + delaiDeLAppel(demande.methode) > contexte.echeance) return { ok: false, code: "cap_reached" };
      return registre.reserve(demande);
    },
  };
}

/** Lecture des pages sous l'échéance (lectures gratuites, sans réservation) : `cap_reached` sans lecture sinon. */
function lecteurSousEcheance(lecteur: LecteurPages, echeance: number): LecteurPages {
  return {
    async lire(url, autorisees) {
      if (Date.now() + DELAI_MAX_MS > echeance) throw new PlafondAgentAtteint();
      return lecteur.lire(url, autorisees);
    },
  };
}

/** Composition de l'étape, construite dans l'étape (fabriques appelées à chaque étape, jamais gardées). */
function composer(contexte: ContexteEtape, forfait: Forfait, registre: RegistreForfait, modeles: ConfigModeles): CompositionP0Reel {
  const choisis = modelesDeLaVariante(modeles, contexte.execution.variante === "A" ? "a" : "b");
  return composerP0Reel(contexte.garde, {
    usage: registre,
    plafonds: plafondsDuForfait(forfait),
    coutEstimeModelesMicros: contexte.config.coutsEstimesMicros.requeteModele,
    coutEstimeRechercheWebMicros: contexte.config.coutsEstimesMicros.rechercheWeb,
    modeles: {
      routage: modeles.routage,
      rechercheWeb: { modele: choisis.recherche, moteur: modeles.rechercheWeb.moteur, maxResultats: MAX_RESULTATS_WEB },
      notation: { modele: choisis.notation },
      raisons: { modele: choisis.raisons },
    },
  });
}

/**
 * Coût des modèles compté depuis le début de l'exécution, écrit en base **en mode fermé** (bloquant 2 de la revue du
 * head `608ee99`, PR 348) : c'est la seule mémoire durable du coût dépensé. `ecrire` peut être appelé dans le corps
 * (l'étape finale l'écrit avant son programme, qui clôt l'exécution) ; `terminer` l'écrit s'il ne l'a pas été. S'il ne
 * peut pas être écrit, l'étape échoue (`pipeline_failed`, après appel payant) et l'étape suivante ne part pas ; une
 * erreur de l'étape survenue avant reste celle qui sort, jamais masquée.
 */
function memoireDuCout(contexte: ContexteEtape, registre: RegistreForfait) {
  let ecrit = false;
  const ecrire = async () => {
    const etape = await registre.consumption(null, { fournisseur: "modeles" });
    await ecrireCoutModeles(poolPrototype(), contexte.garde.runId, contexte.execution.coutModelesMicros + etape.coutMicros);
    ecrit = true;
  };
  return {
    ecrire,
    async terminer(corps: () => Promise<void>): Promise<void> {
      let echec: { readonly erreur: unknown } | undefined;
      try {
        await corps();
      } catch (erreur) {
        echec = { erreur };
      }
      if (!ecrit) {
        try {
          await ecrire();
        } catch {
          if (echec === undefined) throw new ArretEtape("pipeline_failed");
        }
      }
      if (echec !== undefined) throw echec.erreur;
    },
  };
}

/**
 * Exécute le corps d'une étape : toute erreur sort réduite à un code persisté (S4). `apresAppelPayant` : vrai dès que
 * la composition a été construite (un appel payant a pu partir). `noterPhase` : repère du journal d'arrêt (ticket 493),
 * phase écrite en base ou repère de l'étape finale ; en cas d'erreur, `p0.step_failed` est écrit **avant** la réduction
 * du code (phase, classe et code fermé de l'erreur d'origine ; aucun message ni donnée Google).
 */
async function etape(
  runId: string,
  phase: PhaseTravail,
  corps: (contexte: ContexteEtape, marquerAppels: () => void, noterPhase: (phase: PhaseJournal) => void) => Promise<void>,
): Promise<EtatP0Run> {
  let apresAppelPayant = false;
  let phaseCourante: PhaseJournal = phase;
  try {
    const contexte = await ouvrirEtape(runId, phase);
    await corps(
      contexte,
      () => {
        apresAppelPayant = true;
      },
      (suivante) => {
        phaseCourante = suivante;
      },
    );
    return { runId: contexte.garde.runId };
  } catch (erreur) {
    journaliserEchecEtape(phaseCourante, erreur);
    if (erreur instanceof ArretEtape) throw erreur;
    throw new ArretEtape(codeDe(erreur, apresAppelPayant));
  }
}

/** Candidats relus de la table de travail, validés (`CandidatSchema`, clé égale à l'identifiant) ; sinon `pipeline_failed`. */
function candidatsRelus(lignes: readonly LigneCandidat[]): { readonly candidat: Candidat; readonly placeId: string | null }[] {
  return lignes.map((ligne) => {
    const lu = CandidatSchema.safeParse(ligne.candidat);
    if (!lu.success || lu.data.id !== ligne.cle) throw new ArretEtape("pipeline_failed");
    return { candidat: lu.data, placeId: ligne.placeId };
  });
}

/** Code interne d'une recherche sans aucun lieu (ticket 400) ; persisté `pipeline_failed` par `codePersiste` (S4). */
export const CODE_RECHERCHE_VIDE = "research_empty";

/**
 * Ligne de journal fermée de fin de recherche (ticket 400) : compteurs de l'agent seulement, des nombres (ni texte du
 * modèle, ni requête, ni URL, ni donnée Google) ; `warn` si aucun lieu n'est retenu. Écrite aussi quand la recherche
 * lève (ticket 407) : compteurs et candidats admis jusque-là, nom de l'erreur (`errorName`, jamais son message), `warn`.
 */
function journaliserRecherche(compteurs: CompteursAgent | undefined, candidats: readonly Candidat[], echec?: { readonly erreur: unknown }): void {
  const refuses = compteurs?.candidatsRefuses;
  const lieux = candidats.filter((candidat) => candidat.typeEtape !== "event").length;
  const nomErreur = echec === undefined ? undefined : errorNameOf(echec.erreur);
  logEvent(
    "p0.research_done",
    {
      // `candidates` compte tout, événements compris ; `places`, les lieux seuls, qui décident du niveau et de l'arrêt
      // (mineur 2 du head `cd614d4` : une exécution vide peut avoir `candidates > 0` quand elle n'a trouvé que des
      // événements).
      candidates: candidats.length,
      places: lieux,
      ...(nomErreur === undefined ? {} : { errorName: nomErreur }),
      ...(compteurs === undefined
        ? {}
        : {
            turns: compteurs.tours,
            searches: compteurs.recherches,
            pagesRead: compteurs.pagesLues,
            candidatesRefused: (refuses?.source_not_in_results ?? 0) + (refuses?.duplicate ?? 0) + (refuses?.over_total ?? 0) + (refuses?.invalid ?? 0),
            planRefused: compteurs.sortiesRefusees.plan,
            planUnreadable: compteurs.sortiesIllisibles.plan,
            turnRefused: compteurs.sortiesRefusees.recherche,
            turnUnreadable: compteurs.sortiesIllisibles.recherche,
            finishIgnored: compteurs.terminesIgnores,
            finishAbnormal: compteurs.finsAnormales,
            deadlineStop: compteurs.finsEcheance,
          }),
    },
    lieux === 0 || echec !== undefined ? "warn" : "info",
  );
}

/** Étape de recherche (plan, recherche web, lecture des pages) : candidats écrits dans la table de travail. */
export async function etapeRecherche(entree: EtatP0Run): Promise<EtatP0Run> {
  "use step";
  return etape(entree.runId, "recherche", async (contexte, marquerAppels) => {
    const { modeles, recherche } = configurationAgent(contexte.execution.mode, contexte.config);
    // Ticket 483 : cibles de l'exécution comptée calculées depuis la demande du séjour ; plafond de recherche nul : arrêt
    // avant tout appel (mineur 10 de la revue de la PR #490).
    const bornes = bornesDeLaRecherche(contexte.execution.mode, contexte.config, recherche, contexte.brief);
    if (bornes === null) throw new ArretEtape("pipeline_failed");
    const forfait = forfaitDeLEtape(contexte.config, contexte.execution, SANS_GOOGLE);
    const registre = registreDeLEtape(forfait, contexte);
    const composition = composer(contexte, forfait, registre, modeles);
    const { routage } = modeles;
    const choisis = modelesDeLaVariante(modeles, contexte.execution.variante === "A" ? "a" : "b");
    const agent = composition.agent();
    marquerAppels();
    await memoireDuCout(contexte, registre).terminer(async () => {
      // Ticket 407 : état vivant de l'agent, pour journaliser ses compteurs même si la recherche lève.
      let etat: EtatAgent | undefined;
      let trouve: Awaited<ReturnType<typeof chercherCandidats>>;
      try {
        // Types de production de la couche IA (`vers-couche-ia.ts`, décision 0077 § 1 point 5) ; récit et logements de
        // P0 par `ComplementP0`, pour P0 seulement (B7-PO-1).
        trouve = await chercherCandidats(entreeModelesDepuisBrief(contexte.brief), {
          modeles: agent.modeles,
          modele: choisis.recherche,
          routage,
          recherche: bornerRecherche(agent.rechercheWeb, contexte.config.recherchesWeb),
          lecteur: bornerLecteur(lecteurSousEcheance(agent.pages, contexte.echeance), contexte.config.pagesLues),
          bornes,
          complement: complementDepuisBrief(contexte.brief),
          protegees: donneesProtegeesDepuisBrief(contexte.brief),
          // Ticket 407 : plus le temps d'un appel avant l'échéance de l'étape, la recherche se termine proprement. Même
          // délai complet que `registreDeLEtape` (modèle et recherche web : méthode `chat`) et `lecteurSousEcheance`.
          peutAppeler: tempsPourAppel(contexte.echeance, { modele: delaiDeLAppel("chat"), page: DELAI_MAX_MS, marge: MARGE_VERIFICATION_AGENT_MS }),
          observer: (vivant) => {
            etat = vivant;
          },
        });
      } catch (erreur) {
        journaliserRecherche(etat?.compteurs, etat?.candidats ?? [], { erreur });
        throw erreur;
      }
      const { candidats, compteurs } = trouve;
      const lieux = candidats.filter((candidat) => candidat.typeEtape !== "event").length;
      journaliserRecherche(compteurs, candidats);
      if (candidats.length > contexte.config.candidatsTrouves) throw new ArretEtape(codePersiste("cap_reached", true));
      // Ticket 400 : aucun lieu trouvé (les événements seuls ne font pas de programme) : arrêt ici, avant l'ancrage et
      // l'étape finale, qui paieraient leurs appels pour rien. Code interne `research_empty`, persisté `pipeline_failed`
      // (S4) ; la ligne `p0.research_done` du journal en donne les compteurs.
      if (lieux === 0) throw new ArretEtape(codePersiste(CODE_RECHERCHE_VIDE, true));
      await remplacerCandidats(poolPrototype(), contexte.garde.runId, candidats.map((candidat) => ({ cle: candidat.id, candidat, placeId: null })));
    });
  });
}
etapeRecherche.maxRetries = 0;

/**
 * Étape d'ancrage (0055 § 6 point 3) : logements (une fiche chacun, zone du séjour), puis candidats par Text Search
 * « IDs only » restreint à la zone, sans fiche. Gardés : candidats résolus (avec leur `placeId`) et événements non
 * résolus (sans `placeId`, R1) ; les autres sont supprimés. Positions des logements : en mémoire, perdues avec l'étape.
 */
export async function etapeAncrage(entree: EtatP0Run): Promise<EtatP0Run> {
  "use step";
  return etape(entree.runId, "ancrage", async (contexte, marquerAppels) => {
    const { modeles } = configurationAgent(contexte.execution.mode, contexte.config);
    const candidats = candidatsRelus(await lireCandidats(poolPrototype(), contexte.garde.runId)).map((relu) => relu.candidat);
    const logements = contexte.brief.logements.length;
    // Une requête Text Search par logement est laissée à l'étape finale, qui relit la fiche des logements (0063,
    // amendement P0r3c-5).
    const forfait = forfaitDeLEtape(contexte.config, contexte.execution, {
      ...SANS_GOOGLE,
      textSearch: contexte.config.placesTextSearch - logements,
      details: logements,
    });
    const registre = registreDeLEtape(forfait, contexte);
    const { textSearch, detailsLogement } = composer(contexte, forfait, registre, modeles).ancrage();
    marquerAppels();
    const { zone } = await ancrerLogementsDuSejour(contexte.brief, { detailsLogement });
    const ancrages = await ancrerCandidatsDansZone(candidats, contexte.brief.destination, { textSearch }, zone);
    const gardees: LigneCandidat[] = candidats.flatMap((candidat): LigneCandidat[] => {
      const ancrage = ancrages.get(candidat.id);
      if (ancrage?.resolu) return [{ cle: candidat.id, candidat, placeId: ancrage.placeId }];
      return candidat.typeEtape === "event" ? [{ cle: candidat.id, candidat, placeId: null }] : [];
    });
    await remplacerCandidats(poolPrototype(), contexte.garde.runId, gardees);
  });
}
etapeAncrage.maxRetries = 0;

function enLots<T>(valeurs: readonly T[], taille: number): T[][] {
  const lots: T[][] = [];
  for (let indice = 0; indice < valeurs.length; indice += taille) lots.push(valeurs.slice(indice, indice + taille));
  return lots;
}

/**
 * Appels de modèle d'une série de lots, partis ensemble (marge de durée : un aller-retour de modèle au lieu d'un par lot),
 * chacun réservé avant son départ ; tous attendus avant de rendre, la première erreur ensuite levée.
 */
async function parLots<T>(lots: readonly T[], appel: (lot: T) => Promise<ReponseModele>): Promise<ReponseModele[]> {
  const issues = await Promise.allSettled(lots.map(appel));
  const reponses: ReponseModele[] = [];
  for (const issue of issues) {
    if (issue.status === "rejected") throw issue.reason;
    reponses.push(issue.value);
  }
  return reponses;
}

/**
 * Étape finale (0011 § 7 ligne « e » : classement à écriture dans une seule étape, le plan restant en mémoire ; 0055
 * § 6 points 1, 3 et 4 ; 0052 § 1 ; 0063 point 10 et son amendement P0r3c-5), dans cet ordre :
 * 1. **notation** des candidats résolus (pas des événements), par lots, par `noterCandidats` (nos descriptions
 *    seulement), **avant les fiches** ; les notes restent en mémoire ;
 * 2. **logements** relus par `detailsLogement` (une requête Text Search et une fiche chacun : leurs identifiants ne
 *    passent pas entre étapes) ; zone du séjour ; squelette ; plan Routes (part du jour, `n` lieux par matrice) ;
 * 3. **première série** : par jour, un lieu par créneau et l'idée, bornée par la matrice du jour ; **fiches** dans
 *    l'ordre du classement de chaque type, avec la marge de remplacement, au plus `placesDetails − 2 × logements` ;
 *    fermé, introuvable ou hors zone : remplacé par le suivant ;
 * 4. **regroupement par jour** à vol d'oiseau, **une matrice Routes par jour**, planification de chaque jour par le
 *    moteur sur les seuls lieux de son groupe ; événements sans `placeId` (aucun lieu sans fiche de cette étape) ;
 * 5. **raisons** des lieux retenus, par `redigerRaisons` ; coût des modèles écrit (plus aucun appel de modèle ensuite) ;
 * 6. **validation** R1 à R10 en mémoire : une violation, aucun programme ; réduction ;
 * 7. **écriture** du programme, de ses positions, celles des fiches de cette étape (0052 § 1.1 et § 1.3), et des temps
 *    de trajet sur lesquels le moteur a planifié, pour les seules paires de `pairesDuProgramme` (décision 0092 § 4),
 *    ensemble ou pas du tout ; l'exécution passe à `programme_ecrit`.
 * Aucune réponse Place Details ni Routes n'entre dans un prompt, un journal ou la sortie de l'étape (0052 § 1.4).
 */
export async function etapeFinale(entree: EtatP0Run): Promise<EtatP0Run> {
  "use step";
  return etape(entree.runId, "notation", async (contexte, marquerAppels, noterPhase) => {
    const { brief, config, execution, garde } = contexte;
    /** Phase écrite en base, puis notée pour le journal d'arrêt (ticket 493). */
    const passerA = async (phase: PhaseTravail) => {
      await ecrirePhase(poolPrototype(), garde.runId, phase);
      noterPhase(phase);
    };
    const { modeles, recherche } = configurationAgent(execution.mode, config);
    const classement = lireClassement(configClassement);
    if (classement === undefined) throw new ArretEtape("config_invalid");
    const relus = candidatsRelus(await lireCandidats(poolPrototype(), garde.runId));
    const nombreLogements = brief.logements.length;
    const forfait = forfaitDeLEtape(config, execution, {
      textSearch: nombreLogements,
      details: config.placesDetails - nombreLogements,
      routesRequetes: config.routesRequetes,
      routesElements: config.routesElements,
    });
    const registre = registreDeLEtape(forfait, contexte);
    const finale = composer(contexte, forfait, registre, modeles).etapeFinale();
    marquerAppels();
    const cout = memoireDuCout(contexte, registre);
    await cout.terminer(async () => {
      // Types de production de la couche IA (`vers-couche-ia.ts`, 0077 § 1 point 5) ; `ComplementP0` pour P0 seulement.
      const entreeIa = entreeModelesDepuisBrief(brief);
      const complement = complementDepuisBrief(brief);
      // 1. Notation, avant les fiches.
      const lieux = relus.filter((relu) => relu.candidat.typeEtape !== "event" && relu.placeId !== null);
      const lotsNotation = enLots(
        lieux.map((relu) => relu.candidat),
        recherche.tailleLotNotation,
      );
      const notes = new Map<string, CandidatNote["notes"]>();
      (await parLots(lotsNotation, (lot) => finale.noterCandidats({ entree: entreeIa, lot: lot.map(candidatPourModele), complement }))).forEach((reponse, rang) => {
        const ids = new Set((lotsNotation[rang] ?? []).map((candidat) => candidat.id));
        for (const [id, note] of lireNotes(reponse.texte, ids).valeur) notes.set(id, note);
      });
      const notees: CandidatNote[] = lieux.flatMap((relu) => {
        const note = notes.get(relu.candidat.id);
        return note === undefined ? [] : [{ ...relu.candidat, notes: note }];
      });
      const noteDe = new Map(notees.map((candidat) => [candidat.id, candidat]));
      const placeIdDe = new Map(lieux.flatMap((relu) => (relu.placeId === null ? [] : [[relu.candidat.id, relu.placeId] as const])));
      const parametres = { classement, ageSourceMaxJours: recherche.ageSourceMaxJours, dateReference: execution.jourQuota };
      const classements = classementParType(
        notees.map((candidat) => candidatVersMoteur(candidat, undefined)),
        parametres,
      );

      // 2. Logements, zone, squelette, plan Routes.
      await passerA("planification");
      // Même fonction qu'à l'ancrage (une fiche par logement, zone du séjour), sur la capacité de l'étape finale.
      const { logements, zone } = await ancrerLogementsDuSejour(brief, { detailsLogement: finale.detailsLogement });
      const { nuits, briefMoteur, voyage, jours, plan, logementsDuJour, capacites, demandes, serie, premiereSerie, budgetFiches } = dimensionsDuSejour(
        brief,
        config,
        logements.map((logement) => logement.placeId),
      );
      if (!plan.tient) throw new ErreurBudgetRoutes();

      // 3. Première série et fiches, type par type, dans l'ordre du classement.
      noterPhase("fiches");
      // Série plus grande que le plafond des fiches : arrêt sans programme (plafond, persisté `pipeline_failed`).
      if (premiereSerie > budgetFiches) throw new ArretEtape("pipeline_failed");
      const marge = margeRemplacement(premiereSerie, { minimum: config.fiches.margeMinimum, part: config.fiches.margePart });
      let restant = Math.min(budgetFiches, premiereSerie + marge);
      let aVenir = premiereSerie;
      const retenus: { readonly id: string; readonly type: TypeSerie; readonly ancrage: AncrageResolu }[] = [];
      // Lieux dont la fiche a déjà été lue (retenus ou écartés) : jamais relus pour un autre type, jamais deux fois au
      // programme (deux candidats du même lieu : le mieux classé seul).
      const lus = new Set<string>();
      for (const type of TYPES_SERIE) {
        aVenir -= serie[type];
        const ordre: { readonly id: string; readonly placeId: string }[] = [];
        const dansOrdre = new Set<string>();
        for (const candidat of classements[type]) {
          const placeId = placeIdDe.get(candidat.id);
          if (placeId === undefined || lus.has(placeId) || dansOrdre.has(placeId)) continue;
          dansOrdre.add(placeId);
          ordre.push({ id: candidat.id, placeId });
        }
        const issue = await fichesEtapeFinale(ordre, finale.places, zone, { premiereSerie: serie[type], marge: restant - serie[type] - aVenir });
        restant -= issue.fiches;
        // `fichesEtapeFinale` lit les lieux dans l'ordre donné, un `placeId` distinct par fiche : les `fiches` premiers.
        for (const lieu of ordre.slice(0, issue.fiches)) lus.add(lieu.placeId);
        for (const lieu of issue.retenus) retenus.push({ id: lieu.id, type, ancrage: lieu.ancrage });
      }

      // 4. Regroupement par jour, une matrice Routes par jour, planification.
      noterPhase("routes");
      // Jours de fermeture (correction 1 de la PR #490) : un lieu dont aucune plage d'ouverture ne recouvre la fenêtre
      // d'un jour n'est mis ce jour-là qu'en dernier recours. Horaires lus sur les fiches, en mémoire, jamais dans un prompt.
      const horaires = relecturesDepuisAncrages(new Map(retenus.map((lieu) => [lieu.ancrage.placeId, lieu.ancrage])), nuits, () => undefined);
      const groupes = regrouperParJour(
        retenus.map((lieu) => ({ id: lieu.id, type: lieu.type, position: lieu.ancrage.position, fermeLes: joursDeFermeture(horaires, lieu.ancrage.placeId, jours) })),
        // Demandes déjà bornées par la capacité du jour (`demandeBornee`, seul ordre de service : décision 0088 § 8).
        jours.map((_, rang) => ({ demande: demandes[rang] ?? { activity: 0, meal: 0, evening: 0 }, capacite: capacites[rang] ?? 0 })),
      );
      const ficheDe = new Map(retenus.map((lieu) => [lieu.id, lieu.ancrage]));
      const mode = modeDeTrajet(brief);
      const cadence = creerCadence(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, {
        maintenant: () => Date.now(),
        attendre: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
      });
      const sejour = routesDuSejour(finale.routes, plan, cadence);
      const matrices: Trajets[] = [];
      for (const [rang, groupe] of groupes.entries()) {
        const placeIds = [...(logementsDuJour[rang] ?? []), ...groupe.flatMap((id) => ficheDe.get(id)?.placeId ?? [])];
        matrices.push(await sejour.matriceDuJour(rang, placeIds, mode));
      }
      const trajets: Trajets = (depuis, vers) => {
        for (const matrice of matrices) {
          const minutes = matrice(depuis, vers);
          if (minutes !== undefined) return minutes;
        }
        return undefined;
      };
      noterPhase("moteur");
      const ancragesParPlace = new Map<string, AncrageResolu>();
      for (const ancrage of [...logements, ...retenus.map((lieu) => lieu.ancrage)]) ancragesParPlace.set(ancrage.placeId, ancrage);
      const relectures = relecturesDepuisAncrages(ancragesParPlace, nuits, trajets);
      const evenements = relus.flatMap((relu) => (relu.candidat.typeEtape === "event" ? (evenementVersMoteur(relu.candidat, undefined) ?? []) : []));
      const planifies = jours.map((jour, rang) =>
        planifierLeJour({
          jour,
          candidats: (groupes[rang] ?? []).flatMap((id) => {
            const candidat = noteDe.get(id);
            const ancrage = ficheDe.get(id);
            return candidat === undefined || ancrage === undefined ? [] : [candidatVersMoteur(candidat, ancrage)];
          }),
          evenements,
          relectures,
          mode,
          parametres,
          configuration: CONFIGURATION_MOTEUR,
          voyage,
        }),
      );

      // 5. Raisons des lieux retenus ; coût des modèles écrit, plus aucun appel de modèle ensuite.
      await passerA("raisons");
      const idsRetenus = new Set<string>();
      for (const jour of planifies) {
        for (const etapePlanifiee of jour.etapes) idsRetenus.add(etapePlanifiee.candidatId);
        if (jour.idee !== undefined) idsRetenus.add(jour.idee.candidatId);
        for (const evenement of jour.evenements) idsRetenus.add(evenement.candidatId);
      }
      const parId = new Map(relus.map((relu) => [relu.candidat.id, relu.candidat]));
      const lotsRaisons = enLots(
        [...idsRetenus].flatMap((id) => parId.get(id) ?? []),
        recherche.tailleLotNotation,
      );
      const raisons = new Map<string, Raison>();
      (await parLots(lotsRaisons, (lot) => finale.redigerRaisons({ entree: entreeIa, retenus: lot.map(lieuRetenuDepuisCandidat), complement }))).forEach((reponse, rang) => {
        const ids = new Set((lotsRaisons[rang] ?? []).map((candidat) => candidat.id));
        for (const [id, raison] of lireRaisons(reponse.texte, ids).valeur) raisons.set(id, raison);
      });
      await cout.ecrire();

      // 6. Assemblage et validation complète en mémoire ; une violation : aucun programme.
      await passerA("validation");
      const positions = new Map<string, Position>([...ancragesParPlace].map(([placeId, ancrage]) => [placeId, ancrage.position]));
      const complet = assembler({
        tripId: identifiantDuVoyage(brief.destination, execution.jourQuota, execution.numeroDuJour),
        brief,
        nuits,
        configuration: CONFIGURATION_MOTEUR,
        jours: planifies,
        candidats: parId,
        raisons,
        mode,
        positions,
      });
      const violations = violationsP0(complet.trip.days, {
        brief,
        briefMoteur,
        nuits,
        relectures,
        configuration: CONFIGURATION_MOTEUR,
        planifies,
        candidats: parId,
      });
      if (Object.values(violations).some((nombre) => nombre > 0)) throw new ArretEtape("pipeline_failed");
      const programme = reduireProgramme(complet, { positions, terminus: complet.terminus, justifications: complet.justifications });

      // 7. Écriture : positions des fiches de cette étape, programme et temps du moteur (0092), ensemble ou pas du tout.
      await passerA("ecriture");
      const decoupe = decouperProgramme(programme);
      // Temps de la matrice de cette étape (`trajets`, celle du moteur), dans le mode unique de l'exécution ; aucune autre requête.
      const conserves = trajetsAConserver(decoupe.contenu, mode, (paire) => trajets(paire.origine, paire.destination));
      await ecrireProgramme({ runId: garde.runId, programme: decoupe.contenu, positions: decoupe.positions, mode, trajets: conserves }, poolPrototype());
    });
  });
}
etapeFinale.maxRetries = 0;

/**
 * Clôture d'une exécution arrêtée (garde revérifiée) : candidats supprimés, `arretee` et code persisté (S4). Garde
 * fermée : rien n'est écrit ; l'exécution est close au lancement suivant (exécutions orphelines, `neon.ts`).
 */
export async function etapeClore(entree: EtatP0Run & { readonly code: CodeArret }): Promise<EtatP0Run> {
  "use step";
  const code = estCodeArret(entree.code) ? entree.code : "pipeline_failed";
  const dureeReel = validerConfigModeReel(configModeReel);
  const ouverte = await verifierGardeEtape(entree.runId, { pool: poolPrototype, dureeMaxMs: dureeReel.ok ? dureeReel.config.dureeMs : 0 });
  if (!ouverte.ok) return { runId: entree.runId };
  try {
    await cloreExecution(poolPrototype(), ouverte.garde.runId, code);
  } catch {
    // Échec de la base : l'exécution reste `en_cours` et sera close comme orpheline au lancement suivant.
  }
  return { runId: ouverte.garde.runId };
}
etapeClore.maxRetries = 0;

/**
 * Workflow : recherche, ancrage, étape finale (programme écrit). Toute étape arrêtée clôt l'exécution avec son code
 * persisté ; la sortie est l'identifiant d'exécution seul.
 */
export async function p0Run(entree: EtatP0Run): Promise<EtatP0Run> {
  "use workflow";
  const runId = entree.runId;
  try {
    await etapeRecherche({ runId });
    await etapeAncrage({ runId });
    await etapeFinale({ runId });
  } catch (erreur) {
    const code = (erreur as { message?: unknown } | null)?.message;
    await etapeClore({ runId, code: estCodeArret(code) ? code : "pipeline_failed" });
  }
  return { runId };
}
