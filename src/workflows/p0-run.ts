import "server-only";

import { FatalError } from "workflow";

import { cloreExecution, ecrireCoutModeles, ecrirePhase, lireCandidats, lireExecution, remplacerCandidats } from "@/adapters/prototype-travail";
import { MAX_RESULTATS_WEB } from "@/ai/client";
import type { ExecutionEnCours, LigneCandidat, PhaseTravail } from "@/contracts/prototype-travail";
import { ancrerCandidatsDansZone, ancrerLogementsDuSejour } from "@/grounding/ancrage-zone";
import { CODES_ARRET, codePersiste, type CodeArret } from "@/prototype/arret";
import { BriefSchema, type Brief } from "@/prototype/brief";
import { CandidatSchema, type Candidat } from "@/prototype/candidat";
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
import { chercherCandidats } from "@/research/agent";
import { bornerLecteur, bornerRecherche } from "@/research/plafonds-agent";
import { composerP0Reel, type CompositionP0Reel } from "@/server/composition/p0-reel";
import { poolPrototype } from "@/server/p0/base";
import { verifierGardeEtape, type GardeOuverte } from "@/server/p0/garde";
import type { Forfait } from "@/server/usage/forfait";
import type { Plafond } from "@/server/usage/port";
import { creerRegistreForfait, type RegistreForfait } from "@/server/usage/registre";

import edimbourg1 from "../../prototype/briefs/edimbourg-1.json";
import edimbourg2 from "../../prototype/briefs/edimbourg-2.json";
import edimbourg3 from "../../prototype/briefs/edimbourg-3.json";
import configEssai from "../../prototype/config/essai.json";
import configModeles from "../../prototype/config/modeles.json";
import configModeReel from "../../prototype/config/mode-reel.json";
import configRecherche from "../../prototype/config/recherche.json";
import configRechercheEssai from "../../prototype/config/recherche-essai.json";

/**
 * Workflow `p0Run` du mode réel (décision 0055, sections 3, 6 et 8, ligne P0r3c ; décision 0009 ; décision 0063).
 *
 * **Pont** entre l'application et les modules de P0, au même titre que la composition (D18) : seul importateur de
 * `src/server/composition/p0-reel.ts` et des adaptateurs du prototype (`prototype-travail.ts`, puis
 * `prototype-ecriture.ts` à l'étape finale) ; lui-même importé par `src/workflows/index.ts` seulement. Il **câble**
 * les étapes : garde, relecture de l'exécution, configuration du mode, composition, appel des fonctions de
 * `src/research` et `src/grounding`, écriture. Aucune règle métier ici (0009 point 1).
 *
 * Règles de chaque étape (`"use step"`), dans cet ordre :
 * 1. **`verifierGardeEtape` à l'entrée** (0055 § 1 point 2 ; S-1 point 3) : garde fermée → arrêt sans connexion au-delà
 *    de la lecture de l'exécution, sans lecture de clé, sans appel (`FatalError`, code fermé) ;
 * 2. **fabriques appelées dans l'étape** : `composerP0Reel` puis la seule famille de l'étape (`agent()` ou
 *    `ancrage()`) ; aucun client, registre ni composition en cache de module, aucun objet ne traverse la frontière
 *    sérialisée (réponse 4 de la Sécurité, PR 326) ;
 * 3. **état sérialisé réduit à l'identifiant d'exécution** (0009 point 3, 0011 § 3, 0052 § 1.5) : entrée et sortie de
 *    chaque étape, et du workflow, sont `{ runId }` ; brief, candidats et `placeId` sont relus et écrits en base
 *    (table de travail du prototype) dans l'étape ; une erreur ne sort de l'étape que par un code de `CODES_ARRET`
 *    (`codePersiste`, S4), jamais par son message ;
 * 4. **plafonds** : un registre en mémoire par étape, borné par la part du forfait de l'exécution qui revient à
 *    l'étape (`forfaitDeLEtape`) ; le coût des modèles déjà compté est relu en base (`runs.cost_models_micros`) et
 *    réécrit à la fin de l'étape, si bien qu'aucune étape ne dispose de plus que le reste du plafond ;
 * 5. **aucune relance** (`maxRetries = 0`) : une étape rejouée repaierait ses appels.
 *
 * **Étapes livrées** : recherche (plan, recherche web, lecture des pages : famille `agent()`) et ancrage (logements et
 * candidats restreints à la zone, sans fiche de candidat : famille `ancrage()`). **Étape finale** (notation, cache et
 * pré-tri, fiches de la première série, Routes, classement, planification, validation, raisons, écriture des positions
 * et du programme) : P0r3c-5 (découpage proposé dans la PR). D'ici là, `startWorkflow` refuse de démarrer `p0Run`
 * (`index.ts`) : aucune exécution réelle ne peut dépenser sans pouvoir écrire de programme.
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
]);

/** Noms de fichiers des briefs admis (pour le test d'égalité avec `prototype/briefs/`). */
export const NOMS_BRIEFS: readonly string[] = [...BRIEFS.keys()];

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

/**
 * Modèles et profil de l'agent du mode : `recherche.json` (mode réel, profil léger de 0055 § 6 point 5) ou
 * `recherche-essai.json` (essai d'intégration, 9 candidats au plus) ; le total visé reste sous `candidatsTrouves`.
 */
function configurationAgent(mode: ExecutionEnCours["mode"], config: ConfigModeReel): { modeles: ConfigModeles; recherche: ConfigRecherche } {
  const modeles = ConfigModelesSchema.safeParse(configModeles);
  const recherche = ConfigRechercheSchema.safeParse(mode === "essai" ? configRechercheEssai : configRecherche);
  if (!modeles.success || !recherche.success || recherche.data.totalCandidats > config.candidatsTrouves) throw new ArretEtape("config_invalid");
  return { modeles: modeles.data, recherche: recherche.data };
}

/** Part du forfait de l'exécution qui revient à une étape (0046, D13 point 3 : une méthode répartie par configuration). */
type PartEtape = { readonly textSearch: number; readonly details: number };

function forfaitDeLEtape(config: ConfigModeReel, execution: ExecutionEnCours, part: PartEtape): Forfait {
  const resteModeles = Math.max(0, Math.round(config.coutUsd * 1_000_000) - execution.coutModelesMicros);
  return {
    nature: "execution",
    textSearchRequetes: part.textSearch,
    placeDetailsRequetes: part.details,
    routesRequetes: 0,
    routesElements: 0,
    coutGoogleMicros: 0,
    coutModelesMicros: resteModeles,
  };
}

function plafondsDuForfait(forfait: Forfait): Plafond[] {
  return [
    { portee: "execution", fournisseur: "modeles", maxCoutMicros: forfait.coutModelesMicros ?? 0 },
    { portee: "execution", fournisseur: "google", methode: "places_text_search", maxRequetes: forfait.textSearchRequetes },
    { portee: "execution", fournisseur: "google", methode: "places_details", maxRequetes: forfait.placeDetailsRequetes },
  ];
}

type ContexteEtape = {
  readonly garde: GardeOuverte;
  readonly execution: ExecutionEnCours;
  readonly config: ConfigModeReel;
  readonly brief: Brief;
};

/**
 * Entrée commune d'une étape : garde (durée du mode réel, la plus longue), exécution relue, configuration et brief ;
 * pour un essai, garde revérifiée avec sa durée propre (5 min). Puis phase écrite.
 */
async function ouvrirEtape(runId: string, phase: PhaseTravail): Promise<ContexteEtape> {
  const dureeReel = validerConfigModeReel(configModeReel);
  const ouverte = await verifierGardeEtape(runId, { pool: poolPrototype, dureeMaxMs: dureeReel.ok ? dureeReel.config.dureeMs : 0 });
  if (!ouverte.ok) throw new ArretEtape("real_mode_unavailable");
  const execution = await lireExecution(poolPrototype(), ouverte.garde.runId);
  const config = configurationDuMode(execution.mode);
  if (execution.mode === "essai") {
    const essai = await verifierGardeEtape(runId, { pool: poolPrototype, dureeMaxMs: config.dureeMs });
    if (!essai.ok) throw new ArretEtape("real_mode_unavailable");
  }
  const brief = briefDe(execution.brief);
  await ecrirePhase(poolPrototype(), ouverte.garde.runId, phase);
  return { garde: ouverte.garde, execution, config, brief };
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
      raisons: { modele: choisis.raisons },
    },
  });
}

/** Coût des modèles compté depuis le début de l'exécution, réécrit en base à la fin de l'étape. */
async function compterCoutModeles(contexte: ContexteEtape, registre: RegistreForfait): Promise<void> {
  const etape = await registre.consumption(null, { fournisseur: "modeles" });
  await ecrireCoutModeles(poolPrototype(), contexte.garde.runId, contexte.execution.coutModelesMicros + etape.coutMicros);
}

/**
 * Exécute le corps d'une étape : toute erreur sort réduite à un code persisté (S4). `apresAppelPayant` : vrai dès que
 * la composition a été construite (un appel payant a pu partir).
 */
async function etape(runId: string, phase: PhaseTravail, corps: (contexte: ContexteEtape, marquerAppels: () => void) => Promise<void>): Promise<EtatP0Run> {
  let apresAppelPayant = false;
  try {
    const contexte = await ouvrirEtape(runId, phase);
    await corps(contexte, () => {
      apresAppelPayant = true;
    });
    return { runId: contexte.garde.runId };
  } catch (erreur) {
    if (erreur instanceof ArretEtape) throw erreur;
    throw new ArretEtape(codeDe(erreur, apresAppelPayant));
  }
}

/** Étape de recherche (plan, recherche web, lecture des pages) : candidats écrits dans la table de travail. */
export async function etapeRecherche(entree: EtatP0Run): Promise<EtatP0Run> {
  "use step";
  return etape(entree.runId, "recherche", async (contexte, marquerAppels) => {
    const { modeles, recherche } = configurationAgent(contexte.execution.mode, contexte.config);
    const forfait = forfaitDeLEtape(contexte.config, contexte.execution, { textSearch: 0, details: 0 });
    const registre = creerRegistreForfait(forfait, contexte.garde.runId, { maintenant: () => Date.now() });
    const composition = composer(contexte, forfait, registre, modeles);
    const { routage } = modeles;
    const choisis = modelesDeLaVariante(modeles, contexte.execution.variante === "A" ? "a" : "b");
    const agent = composition.agent();
    marquerAppels();
    try {
      const { candidats } = await chercherCandidats(contexte.brief, {
        modeles: agent.modeles,
        modele: choisis.recherche,
        routage,
        recherche: bornerRecherche(agent.rechercheWeb, contexte.config.recherchesWeb),
        lecteur: bornerLecteur(agent.pages, contexte.config.pagesLues),
        config: recherche,
      });
      if (candidats.length > contexte.config.candidatsTrouves) throw new ArretEtape(codePersiste("cap_reached", true));
      await remplacerCandidats(poolPrototype(), contexte.garde.runId, candidats.map((candidat) => ({ cle: candidat.id, candidat, placeId: null })));
    } finally {
      await compterCoutModeles(contexte, registre).catch(() => undefined);
    }
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
    const lignes = await lireCandidats(poolPrototype(), contexte.garde.runId);
    const candidats: Candidat[] = lignes.map((ligne) => {
      const lu = CandidatSchema.safeParse(ligne.candidat);
      if (!lu.success || lu.data.id !== ligne.cle) throw new ArretEtape("pipeline_failed");
      return lu.data;
    });
    const forfait = forfaitDeLEtape(contexte.config, contexte.execution, {
      textSearch: contexte.config.placesTextSearch,
      details: contexte.brief.logements.length,
    });
    const registre = creerRegistreForfait(forfait, contexte.garde.runId, { maintenant: () => Date.now() });
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
 * Workflow : recherche, puis ancrage ; l'étape finale arrive avec P0r3c-5. Toute étape arrêtée clôt l'exécution avec
 * son code persisté ; la sortie est l'identifiant d'exécution seul.
 */
export async function p0Run(entree: EtatP0Run): Promise<EtatP0Run> {
  "use workflow";
  const runId = entree.runId;
  try {
    await etapeRecherche({ runId });
    await etapeAncrage({ runId });
    // Étape finale (classement à écriture, 0011 § 7 ; 0052 § 1) : P0r3c-5. Sans elle, aucun programme : arrêt.
    await etapeClore({ runId, code: "pipeline_failed" });
  } catch (erreur) {
    const code = (erreur as { message?: unknown } | null)?.message;
    await etapeClore({ runId, code: estCodeArret(code) ? code : "pipeline_failed" });
  }
  return { runId };
}
