import "server-only";

import { FatalError } from "workflow";

import { ecrireProgramme } from "@/adapters/prototype-ecriture";
import { cloreExecution, ecrireCoutModeles, ecrirePhase, lireExecution } from "@/adapters/prototype-travail";
import { MAX_RESULTATS_WEB } from "@/ai/client";
import { lireProgramme, lieuxDuProgramme, ordreEcrit } from "@/ai/sorties";
import type { ExecutionEnCours, PhaseTravail } from "@/contracts/prototype-travail";
import { lieuxHorsPartTextSearch } from "@/grounding/ancrage";
import { ancrerLogementsDuSejour, verifierLieuxDuProgramme, type ControleAppel } from "@/grounding/ancrage-zone";
import { blocsDeTrajets, creerCadence, planRoutes, trajetsConsecutifs } from "@/grounding/budget-routes";
import type { Position } from "@/prototype/ancrage";
import { CODES_ARRET, codePersiste, type CodeArret } from "@/prototype/arret";
import { BriefSchema, type Brief } from "@/prototype/brief";
import {
  ConfigModelesSchema,
  ConfigRechercheSchema,
  modelesDeLaVariante,
  rechercheTientSousPlaces,
  TOTAL_CANDIDATS_MAX,
  validerConfigEssai,
  validerConfigModeReel,
  type ConfigModeReel,
  type ConfigModeles,
  type ConfigRecherche,
} from "@/prototype/config";
import { decouperProgramme } from "@/prototype/decoupage";
import { trajetsAConserver } from "@/prototype/programme-reduit";
import { reduireProgramme } from "@/prototype/reduction";
import { composerP0Reel, type CompositionP0Reel } from "@/server/composition/p0-reel";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assemblerProgrammeIa, pointsDeTrajet } from "@/server/p0/assemblage";
import {
  bornesDepuisConfig,
  bornesDepuisDemande,
  type BornesRechercheP0,
  entreeProgrammeDepuisBrief,
} from "@/server/p0/vers-couche-ia";
import { poolPrototype } from "@/server/p0/base";
import { verifierGardeEtape, type GardeOuverte } from "@/server/p0/garde";
import { identifiantDuVoyage, joursDuSejour, lireClassement } from "@/server/p0/moteur-final";
import { briefDepuisBrief, demandesDuSejour, engagementsDepuisBrief, modeDeTrajet, nuitsDepuisBrief } from "@/server/p0/vers-moteur";
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
 * 3. **fabriques appelées dans l'étape** : `composerP0Reel` puis la seule famille de l'étape (`programme()` depuis la
 *    décision 0116 § 3 : `etapeProgramme` est la seule étape de travail) ; aucun client, registre ni composition en cache de module, aucun objet ne traverse la frontière
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
 * Ancienneté maximale d'une exécution pour la garde de chaque étape (`verifierGardeEtape`) et seuil de clôture des
 * exécutions orphelines (`neon.ts`, plus 5 min) : trois étapes, chacune au plus à la limite de fonction de la plateforme
 * (`maxRetries = 0`), soit 40 min (décision 0102 § 6). Inchangée par la décision 0116 (une étape de travail et la
 * clôture) : aucune valeur n'est changée au lot 1. **Valeur proposée, en attente de Samuel (question 2)** : ce n'est
 * pas un fusible de coût, mais une exécution dont les étapes seraient séparées par de longs délais de file verrait sa
 * prochaine étape refusée par la garde. Dérivée de 0075, non choisie (l'ancien `dureeMs` de 900 s ne s'applique plus).
 * Une constante, pour la changer d'un seul endroit.
 */
export const DUREE_MAX_EXECUTION_MS = 3 * LIMITE_FONCTION_MS;

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

/**
 * Total de candidats visé par la recherche du mode (`recherche-essai.json` pour l'essai, `recherche.json` sinon) ;
 * `config_invalid` si le fichier est refusé. Il est passé aux validateurs de la configuration du mode (0102 § 5).
 */
function totalCandidatsDuMode(mode: ExecutionEnCours["mode"]): number {
  const recherche = ConfigRechercheSchema.safeParse(mode === "essai" ? configRechercheEssai : configRecherche);
  if (!recherche.success) throw new ArretEtape("config_invalid");
  return recherche.data.totalCandidats;
}

/**
 * Configuration du mode de l'exécution, validée ; refusée : `config_invalid` (avant tout appel). Le contrôle croisé
 * `totalCandidats + 5 ≤ placesTextSearch` (0102 § 5) en fait partie, donc aussi du lancement (`lancementDuMode`), avant
 * toute réservation.
 */
function configurationDuMode(mode: ExecutionEnCours["mode"]): ConfigModeReel {
  const total = totalCandidatsDuMode(mode);
  const lue = mode === "essai" ? validerConfigEssai(configEssai, total) : validerConfigModeReel(configModeReel, total);
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
 * - Durée des orphelines : `DUREE_MAX_EXECUTION_MS`, la même pour tous les modes (plus de durée par mode depuis 0102).
 */
export function lancementDuMode(mode: ExecutionEnCours["mode"]): LancementDuMode | null {
  if (mode !== "reel" && mode !== "essai") return null;
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!table.success) return null;
  try {
    // Mode réel d'abord (comme avant : un fichier du mode réel refusé refuse aussi l'essai), puis celui du mode demandé.
    if (!validerConfigModeReel(configModeReel, totalCandidatsDuMode("reel")).ok) return null;
    const config = configurationDuMode(mode);
    configurationAgent(mode, config);
    if (lireClassement(configClassement) === undefined) return null;
    const forfait = forfaitExecution(
      table.data,
      SKUS_FORFAIT,
      { placesTextSearch: config.placesTextSearch, placesDetails: config.placesDetails, routesRequetes: config.routesRequetes, routesElements: config.routesElements },
      Math.round(config.coutUsd * 1_000_000),
    );
    return { forfait, regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: config.uniteQuotaRoutes, dureeMaxMs: DUREE_MAX_EXECUTION_MS } };
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
export const PLAFONDS_RELECTURE: PlafondsRelecture = Object.freeze({ placesTextSearch: 0, placesDetails: 0, routesRequetes: 40, routesElements: 40 });

/**
 * Forfait et règles de la réservation d'une relecture Routes (P0r4, décision 0079), lus dans ce pont comme ceux du
 * lancement (l'application n'importe pas `src/prototype`, 0048 § 1) ; `null` si la configuration du mode réel ou la table
 * de prix est refusée (la relecture échoue alors fermée). Durée des orphelines : celle du mode réel, comme au lancement.
 */
export function relectureDuMode(): LancementDuMode | null {
  const table = TablePrixGoogleSchema.safeParse(prixGoogle);
  if (!table.success) return null;
  try {
    const reel = validerConfigModeReel(configModeReel, totalCandidatsDuMode("reel"));
    if (!reel.ok) return null;
    return {
      forfait: forfaitRelecture(table.data, SKUS_FORFAIT, PLAFONDS_RELECTURE),
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: reel.config.uniteQuotaRoutes, dureeMaxMs: DUREE_MAX_EXECUTION_MS },
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
 * l'exécution peut trouver (borne de forme de 300, jamais atteinte) et ancrer (Text Search : `placesTextSearch − 2 × logements`, une requête
 * par logement à l'ancrage et une à l'étape finale) ; en **essai**, le profil fixe de `recherche-essai.json` (décision
 * 0073 point 4, réservée à Samuel, inchangée). `null` : plafond nul ou négatif, aucun candidat ancrable, l'exécution
 * s'arrête (`briefTientDansLeMode` refuse ce brief au lancement). Contrôle **du lancement** seulement depuis la décision
 * 0116 (l'agent de recherche n'est plus appelé par `p0Run`) : inchangé au lot 1, question au Tech Lead dans la PR.
 */
function bornesDeLaRecherche(mode: ExecutionEnCours["mode"], config: ConfigModeReel, recherche: ConfigRecherche, brief: Brief): BornesRechercheP0 | null {
  if (mode !== "reel") return bornesDepuisConfig(recherche);
  const { serie } = dimensionsDuSejour(brief, config, reperesDesLogements(brief));
  return bornesDepuisDemande(recherche, serie, Math.min(TOTAL_CANDIDATS_MAX, config.placesTextSearch - 2 * brief.logements.length));
}

/**
 * **Réservé aux tests** (mineur 4 de la revue de la PR #490 : aucun appelant de production) : bornes de la recherche
 * d'un brief commité dans un mode, par le même chemin que le contrôle du lancement ; `null` si brief ou configuration refusés,
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
 * total visé tient sous le plafond Text Search du mode (`totalCandidats + 5 ≤ placesTextSearch`, décision 0102 § 3).
 */
function configurationAgent(mode: ExecutionEnCours["mode"], config: ConfigModeReel): { modeles: ConfigModeles; recherche: ConfigRecherche } {
  const modeles = ConfigModelesSchema.safeParse(configModeles);
  const recherche = ConfigRechercheSchema.safeParse(mode === "essai" ? configRechercheEssai : configRecherche);
  if (!modeles.success || !recherche.success || !rechercheTientSousPlaces(recherche.data.totalCandidats, config.placesTextSearch)) throw new ArretEtape("config_invalid");
  return { modeles: modeles.data, recherche: recherche.data };
}

/**
 * Part du forfait de l'exécution qui revient à une étape (0046, D13 point 3). Depuis la décision 0116 § 3.5, la seule
 * étape de travail (`etapeProgramme`) reçoit le forfait entier ; la part des lieux de l'IA est ce qu'il reste après les
 * logements (une recherche et une fiche chacun).
 */
type PartEtape = { readonly textSearch: number; readonly details: number; readonly routesRequetes: number; readonly routesElements: number };

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
 * Entrée commune d'une étape : garde (ancienneté `DUREE_MAX_EXECUTION_MS`), exécution relue, configuration et brief. Puis
 * phase écrite (garde d'idempotence) et échéance : la limite de fonction de la plateforme (0075), moins la marge de fin
 * d'étape, soit 770 s pour chaque étape (décision 0102 § 6 : plus de durée d'exécution commune ni de part gardée aux
 * étapes suivantes).
 */
async function ouvrirEtape(runId: string, phase: PhaseTravail): Promise<ContexteEtape> {
  const ouverte = await verifierGardeEtape(runId, { pool: poolPrototype, dureeMaxMs: DUREE_MAX_EXECUTION_MS });
  if (!ouverte.ok) throw new ArretEtape("real_mode_unavailable");
  const debut = Date.now();
  const execution = await lireExecution(poolPrototype(), ouverte.garde.runId);
  const config = configurationDuMode(execution.mode);
  const brief = briefDe(execution.brief);
  await ecrirePhase(poolPrototype(), ouverte.garde.runId, phase);
  const echeance = debut + LIMITE_FONCTION_MS - MARGE_FIN_ETAPE_MS;
  return { garde: ouverte.garde, execution, config, brief, echeance };
}

/** Délai complet d'un appel réservé : requête du client et opérations du port qui l'entourent (D13 point 5). */
function delaiDeLAppel(methode: DemandeReservation["methode"]): number {
  // Décision 0116 § 2.3 : la seule requête de modèle de `p0Run` est la requête `programme` (300 s).
  const requete = methode === "chat" ? DELAI_REQUETE_MS.openrouterProgramme : methode === "routes_matrix" ? DELAI_REQUETE_MS.routes : DELAI_REQUETE_MS.places;
  return requete + 2 * DELAI_PORT_MS;
}

/**
 * Registre de l'étape : forfait de l'étape, et refus `cap_reached` sans appel de toute réservation dont le délai
 * complet ne tient pas avant l'échéance (tous les appels payants passent par une réservation, D13).
 */
function registreDeLEtape(forfait: Forfait, contexte: ContexteEtape, reserve: (methode: DemandeReservation["methode"]) => number = () => 0): RegistreForfait {
  const registre = creerRegistreForfait(forfait, contexte.garde.runId, { maintenant: () => Date.now() });
  return {
    ...registre,
    async reserve(demande) {
      if (Date.now() + delaiDeLAppel(demande.methode) > contexte.echeance - reserve(demande.methode)) return { ok: false, code: "cap_reached" };
      return registre.reserve(demande);
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
      programme: { modele: choisis.programme },
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

/**
 * Code interne d'un programme illisible ou sans journée lisible (décision 0116 § 3.4) : déjà dans les listes fermées du
 * journal ; persisté `pipeline_failed` par `codePersiste` (S4). Aucun code nouveau.
 */
export const CODE_PROGRAMME_ILLISIBLE = "model_output_invalid";

/** Compteurs maison de `p0.programme_written` (décision 0116 § 4.4, verdict 0117 § 4) : des nombres, aucun verdict. */
type CompteursProgramme = {
  days: number;
  slots: number;
  placesToVerify: number;
  daysRemoved: number;
  slotsRemoved: number;
  fieldsRemoved: number;
  textsCut: number;
  modelCalls: number;
  unverifiedForCap: number;
};

/**
 * Ligne de journal fermée de fin d'étape (`p0.programme_written`) : compteurs maison seulement (sortie de l'IA, nos
 * plafonds), jamais un compteur de verdict de vérification, un nom ni une donnée Google. Écrite aussi quand l'étape lève
 * (nom de l'erreur, jamais son message ; `warn`).
 */
function journaliserProgramme(compteurs: CompteursProgramme, echec?: { readonly erreur: unknown }): void {
  const nomErreur = echec === undefined ? undefined : errorNameOf(echec.erreur);
  logEvent("p0.programme_written", { ...compteurs, ...(nomErreur === undefined ? {} : { errorName: nomErreur }) }, echec === undefined ? "info" : "warn");
}

/** Configuration des modèles du prototype (`modeles.json`), validée ; refusée : `config_invalid` (avant tout appel). */
function configurationModeles(): ConfigModeles {
  const modeles = ConfigModelesSchema.safeParse(configModeles);
  if (!modeles.success) throw new ArretEtape("config_invalid");
  return modeles.data;
}

/**
 * Étape unique de travail de `p0Run` (décision 0116 § 3 ; décision 0115 § 3 ; spécification `P0-programme-par-ia` § 0),
 * dans cet ordre, le programme de l'IA, les identifiants, les fiches et les durées restant **en mémoire** jusqu'à
 * l'écriture (0011 § 3 et § 7, 0052 § 1.1) :
 * 1. phase `recherche` : **rédaction**, une requête `programme` (brief entier, jamais une donnée Google ; `zdr`, 300 s),
 *    puis lecture tolérante (`lireProgramme`, 0117 § 1) ; aucune journée lisible : `model_output_invalid` ; puis **ordre
 *    écrit** (`ordreEcrit`, tri stable par `debut`, une seule fois, avant toute vérification, 0116 § 1.7) ; coût des
 *    modèles écrit (plus aucun appel de modèle ensuite) ;
 * 2. phase `ancrage` : logements (une recherche et une fiche chacun, zone du séjour), puis **vérification** des lieux
 *    distincts dans l'ordre écrit (`verifierLieuxDuProgramme`, un appel d'ancrage par lieu) ; part et échéance contrôlées
 *    **avant chaque appel**, l'échéance moins la **réserve de trajets** (requêtes Routes prévues × 10 s, 0116 § 3.5) ;
 *    non tenu : lieux restants sans `placeId`, programme entier écrit ; rien n'est écrit dans cette phase ;
 * 3. repère `planification` (journal seulement : `ecrirePhase` exige la phase précédente de `PHASES`, et `notation` n'est
 *    plus écrite) : **trajets** entre points consécutifs avec identifiant de chaque jour (`pointsDeTrajet`), sous la part
 *    Routes et l'échéance ; manque : trajets sans durée, jamais inventés (0092 § 4) ;
 * 4. repère `ecriture` : assemblage sans replanification (`assemblerProgrammeIa`, jamais `toConfirm`), réduction, et
 *    écriture du programme, des positions (logements et lieux vérifiés) et des temps de 0092, ensemble ou pas du tout.
 * Journal : `p0.programme_written` (compteurs maison), aussi en cas d'erreur.
 */
export async function etapeProgramme(entree: EtatP0Run): Promise<EtatP0Run> {
  "use step";
  return etape(entree.runId, "recherche", async (contexte, marquerAppels, noterPhase) => {
    const { brief, config, execution, garde } = contexte;
    const passerA = async (phase: PhaseTravail) => {
      await ecrirePhase(poolPrototype(), garde.runId, phase);
      noterPhase(phase);
    };
    const modeles = configurationModeles();
    // Forfait entier de l'exécution (0116 § 3.5) : la part des lieux de l'IA est ce qui reste après les logements.
    const forfait = forfaitDeLEtape(config, execution, {
      textSearch: config.placesTextSearch,
      details: config.placesDetails,
      routesRequetes: config.routesRequetes,
      routesElements: config.routesElements,
    });
    // Réserve de trajets (0116 § 3.5) : posée pendant la vérification seulement, retirée avant les trajets.
    let reserveTrajetsMs = 0;
    const registre = registreDeLEtape(forfait, contexte, (methode) => (methode === "places_text_search" || methode === "places_details" ? reserveTrajetsMs : 0));
    const capacites = composer(contexte, forfait, registre, modeles).programme();
    marquerAppels();
    const compteurs: CompteursProgramme = { days: 0, slots: 0, placesToVerify: 0, daysRemoved: 0, slotsRemoved: 0, fieldsRemoved: 0, textsCut: 0, modelCalls: 0, unverifiedForCap: 0 };
    const cout = memoireDuCout(contexte, registre);
    try {
      await cout.terminer(async () => {
        // 1. Rédaction et lecture tolérante ; ordre écrit fixé une fois, avant toute vérification.
        compteurs.modelCalls += 1;
        const reponse = await capacites.redigerProgramme(entreeProgrammeDepuisBrief(brief));
        await cout.ecrire();
        const lecture = lireProgramme(reponse.texte, { arrivee: brief.arrivee, depart: brief.depart });
        compteurs.daysRemoved = lecture.joursRetires;
        compteurs.slotsRemoved = lecture.creneauxRetires;
        compteurs.fieldsRemoved = lecture.champsRetires;
        compteurs.textsCut = lecture.textesCoupes;
        if (lecture.valeur === null) throw new ArretEtape(codePersiste(CODE_PROGRAMME_ILLISIBLE, true));
        const programme = ordreEcrit(lecture.valeur);
        compteurs.days = programme.jours.length;
        compteurs.slots = programme.jours.reduce((total, jour) => total + jour.creneaux.length, 0);

        // 2. Vérification : logements, puis lieux distincts dans l'ordre écrit, part et échéance contrôlées avant chaque appel.
        await passerA("ancrage");
        const { logements, zone } = await ancrerLogementsDuSejour(brief, { detailsLogement: capacites.detailsLogement });
        const idsLogements = logements.map((logement) => logement.placeId);
        const { lieux, cleDe } = lieuxDuProgramme(programme, brief.destination);
        compteurs.placesToVerify = lieux.length;
        // `unverifiedForCap` (0117 § 4) : calculé avant la boucle, des seuls nombres (lieux, part Text Search, logements).
        compteurs.unverifiedForCap = lieuxHorsPartTextSearch(lieux.length, forfait.textSearchRequetes, brief.logements.length);
        const joursAvec = (placeIdDe: (jour: number, rang: number) => string | undefined) =>
          programme.jours.map((jour, indiceJour) => ({
            date: jour.date,
            ...(jour.titre === undefined ? {} : { titre: jour.titre }),
            creneaux: jour.creneaux.map((creneau, rang) => ({ ...creneau, placeId: placeIdDe(indiceJour, rang) })),
          }));
        // Requêtes Routes prévues si tous les lieux étaient vérifiés (borne haute), au plus la part Routes.
        const requetesPrevues = Math.min(config.routesRequetes, blocsDeTrajets(pointsDeTrajet({ brief, logements: idsLogements, jours: joursAvec(cleDe) })).length);
        reserveTrajetsMs = requetesPrevues * DELAI_REQUETE_MS.routes;
        const controle: ControleAppel = async (methode) => {
          const methodeGoogle = methode === "textSearch" ? "places_text_search" : "places_details";
          // Marge de ticket 407 reprise (justifiée, revue 1 mineur 8) : le registre refait ce contrôle quelques ms plus
          // tard ; sans elle, un appel admis ici serait refusé par le registre (pipeline_failed) au lieu d'arrêter la
          // vérification et d'écrire les lieux restants sans `placeId` (0116 § 3.5).
          if (Date.now() + delaiDeLAppel(methodeGoogle) + MARGE_VERIFICATION_AGENT_MS > contexte.echeance - reserveTrajetsMs) return "temps";
          const consomme = await registre.consumption(null, { methode: methodeGoogle });
          const plafond = methode === "textSearch" ? forfait.textSearchRequetes : forfait.placeDetailsRequetes;
          return consomme.requetes + 1 > plafond ? "part" : "ok";
        };
        const issue = await verifierLieuxDuProgramme(lieux, brief.destination, capacites, zone, controle);

        // 3. Trajets entre points consécutifs avec identifiant (ordre écrit), sous la part Routes et l'échéance seule.
        noterPhase("planification");
        reserveTrajetsMs = 0;
        const jours = joursAvec((jour, rang) => {
          const cle = cleDe(jour, rang);
          return cle === undefined ? undefined : issue.fiches.get(cle)?.placeId;
        });
        const mode = modeDeTrajet(brief);
        const cadence = creerCadence(QUOTA_ROUTES_ELEMENTS_PAR_MINUTE, {
          maintenant: () => Date.now(),
          attendre: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        });
        const trajets = await trajetsConsecutifs(
          capacites.routes,
          pointsDeTrajet({ brief, logements: idsLogements, jours }),
          mode,
          { requetes: config.routesRequetes, elements: config.routesElements },
          cadence,
        );

        // 4. Assemblage sans replanification, réduction et écriture, ensemble ou pas du tout.
        noterPhase("ecriture");
        const complet = assemblerProgrammeIa({
          tripId: identifiantDuVoyage(brief.destination, execution.jourQuota, execution.numeroDuJour),
          brief,
          jours,
          bonsPlans: programme.bonsPlans,
          logements: idsLogements,
          configuration: CONFIGURATION_MOTEUR,
          mode,
          trajets,
        });
        const positions = new Map<string, Position>([...logements, ...issue.fiches.values()].map((ancrage) => [ancrage.placeId, ancrage.position]));
        const reduit = reduireProgramme(complet, { positions, terminus: complet.terminus, justifications: complet.justifications });
        const decoupe = decouperProgramme(reduit);
        const conserves = trajetsAConserver(decoupe.contenu, mode, (paire) => trajets(paire.origine, paire.destination));
        await ecrireProgramme({ runId: garde.runId, programme: decoupe.contenu, positions: decoupe.positions, mode, trajets: conserves }, poolPrototype());
      });
    } catch (erreur) {
      journaliserProgramme(compteurs, { erreur });
      throw erreur;
    }
    journaliserProgramme(compteurs);
  });
}
etapeProgramme.maxRetries = 0;

/**
 * Clôture d'une exécution arrêtée (garde revérifiée) : candidats supprimés, `arretee` et code persisté (S4). Garde
 * fermée : rien n'est écrit ; l'exécution est close au lancement suivant (exécutions orphelines, `neon.ts`).
 */
export async function etapeClore(entree: EtatP0Run & { readonly code: CodeArret }): Promise<EtatP0Run> {
  "use step";
  const code = estCodeArret(entree.code) ? entree.code : "pipeline_failed";
  const ouverte = await verifierGardeEtape(entree.runId, { pool: poolPrototype, dureeMaxMs: DUREE_MAX_EXECUTION_MS });
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
 * Workflow (décision 0116 § 3.1) : `etapeProgramme` (programme écrit), puis `etapeClore` seulement en cas d'arrêt. Toute étape arrêtée clôt l'exécution avec son code
 * persisté ; la sortie est l'identifiant d'exécution seul.
 */
export async function p0Run(entree: EtatP0Run): Promise<EtatP0Run> {
  "use workflow";
  const runId = entree.runId;
  try {
    await etapeProgramme({ runId });
  } catch (erreur) {
    const code = (erreur as { message?: unknown } | null)?.message;
    await etapeClore({ runId, code: estCodeArret(code) ? code : "pipeline_failed" });
  }
  return { runId };
}
