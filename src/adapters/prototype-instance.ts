import { randomBytes } from "node:crypto";

import { prototypeAdapterAllowed } from "@/dev/flags";
import { createRelecteurSimule, type RelecteurSimule } from "@/mocks/prototype-relecteur";
import type { PlacePhoto } from "@/contracts/photo";
import type { PoolSql } from "@/server/usage/neon";

import {
  createPrototypeAdapter,
  createPrototypeAdapterReel,
  type LecteurDeblocage,
  type RelecteurTrajets,
  type SourceProgrammes,
  type SourceProgrammesReels,
} from "./prototype";
import { createPrototypeCreationAdapter, type PortCreationEssai } from "./prototype-creation";
import { createSourceProgrammesReels } from "./prototype-lecture";
import { createProgrammeLoader } from "./prototype-loader";
import type { AdapterContext, CreationAdapter, TripAdapter } from "./types";

/**
 * Adaptateur `prototype` de l'application (décision 0032 § A4 et § A6.6 ; décisions 0074 et 0079) :
 * - `VADROUILLE_PROTOTYPE_DIR` posée (lue une fois, à la création) : programmes lus dans ce dossier, relecteur
 *   **simulé** (P0b1 : aucun relecteur réel, aucune clé lue, aucun appel à Google ; `pnpm dev`, CI, e2e) ;
 * - sinon : programmes **réels** lus dans `prototype.programmes`, en lecture seule, **recomposés avec leurs positions**
 *   (`place_coordinates`, carte Google), derrière la barrière du mode réel (garde ouverte et cookie d'accès, vérifiée à
 *   chaque lecture ; fermée : aucun programme, comme avant), avec leurs temps de trajet conservés (0092) et le
 *   **relecteur Routes réel** pour les seules paires sans temps conservé (relues à chaque affichage, réservées et
 *   plafonnées, P0r4). La barrière (`src/server/p0/lecture-programmes.ts`) et le relecteur
 *   (`src/server/p0/relecture.ts`) sont **branchés au démarrage** par `src/instrumentation.ts`
 *   (`brancherLectureProgrammesReels`) : ce module n'importe ni la base, ni la garde, ni Routes (régime de confinement,
 *   doubles de `@/adapters`). Non branchés (tests, `next build`, autre runtime) : aucun programme, aucune relecture.
 *
 * L'instance (index du chargeur, compteur du relecteur simulé) n'existe que si la liste blanche
 * `prototypeAdapterAllowed` est vraie ; elle ne garde aucune durée relue. Elle vit sur `globalThis`, comme la
 * portée des simulations (`simulation.ts`) : Next.js charge une copie du module par route, et la route du
 * compteur (`/dev/api/prototype/relectures`) doit lire le relecteur des pages.
 */

/** Barrière de la lecture réelle : pool si elle est ouverte pour la requête courante, sinon `null`. */
export type BarriereLectureProgrammes = () => Promise<PoolSql | null>;

/**
 * Déblocages simulés retenus pour l'essai (spécification E2E-essai, lot 1) : cookie signé par une clé tirée du code
 * d'accès (`src/server/essai/deblocage.ts`), branché au démarrage par `src/instrumentation.ts`. Ce module n'en lit ni la
 * clé ni le cookie. Non branché (tests, fichiers de programmes, garde fermée) : aucun déblocage retenu par cookie.
 */
export interface DeblocagesEssai {
  /** Voyages débloqués de la requête courante ; ensemble vide sur toute erreur. */
  lire(ctx: AdapterContext): Promise<ReadonlySet<string>>;
  /** Retient un voyage débloqué (action serveur seulement : écrit un cookie) ; sans effet si la clé est absente. */
  retenir(ctx: AdapterContext, tripId: string): Promise<void>;
}

/**
 * Photos des cartes du tri d'un voyage d'essai (décision 0128) : `src/server/p0/photos.ts`, branché au démarrage par
 * `src/instrumentation.ts`. Ce module n'en lit ni la base, ni le cookie, ni la clé. Non branché : aucune photo.
 */
export interface PhotosEssaiBranchees {
  /**
   * Photo du lieu que rend `lieu` (le lieu d'une proposition du voyage demandé, lu par l'adaptateur), ou `null`. `lieu`
   * n'est appelé qu'une fois la garde et le cookie d'accès vérifiés, avant toute réservation ; `null` : aucun appel.
   */
  photo(lieu: () => Promise<string | null>): Promise<PlacePhoto | null>;
}

/**
 * Partage réel d'un voyage du site d'essai (décision 0135), branché au démarrage par `src/instrumentation.ts`
 * (`src/server/essai/partage.ts`). Ce module n'en lit ni le code d'accès, ni le cookie, ni la base. Non branché (tests,
 * garde fermée, autre runtime) : aucune clé, donc aucun lien créé et tout lien répond 404.
 */
export interface PartageEssaiBranche {
  /** Clé de signature des liens (32 octets), tirée du code d'accès ; `null` garde du mode réel fermée. */
  cle(): Buffer | null;
  /** Session vérifiée de la requête courante (cookie d'accès valide) : exigée pour créer un lien. */
  sessionVerifiee(): Promise<boolean>;
  /** Barrière de la **vue partagée** : pool si la garde du mode réel est ouverte, **sans** cookie d'accès ; sinon `null`. */
  barriereLecture: BarriereLectureProgrammes;
}

interface Instance {
  /** Adaptateur de la requête : la source (index, relecteur) est partagée, seul le lecteur du déblocage change. */
  fabrique: (deblocage?: LecteurDeblocage) => TripAdapter;
  relecteur: RelecteurSimule;
  /** Lecteur de la vue partagée d'un seul voyage (décision 0135 § 5). */
  partage: (tripId: string) => TripAdapter;
  /** Dossier de programmes (local, CI) : clé de partage tirée au hasard par processus, sans session à vérifier. */
  dossier: boolean;
}

/** État du module sur `globalThis` : l'instance (créée à la demande) et la barrière branchée au démarrage. */
interface Etat {
  instance?: Instance;
  barriere?: BarriereLectureProgrammes;
  relecteur?: RelecteurTrajets;
  deblocages?: DeblocagesEssai;
  creation?: PortCreationEssai;
  photos?: PhotosEssaiBranchees;
  partage?: PartageEssaiBranche;
  /** Clé de partage du mode « dossier » : 32 octets aléatoires, en mémoire du processus seulement. */
  clePartageLocale?: Buffer;
}

const INSTANCE_KEY = Symbol.for("vadrouille.prototype");
const holder = globalThis as typeof globalThis & { [INSTANCE_KEY]?: Etat };

/**
 * Branche la barrière de la lecture réelle (appelé une fois, au démarrage, par `src/instrumentation.ts` ; décision
 * 0074). Sur `globalThis`, comme l'instance : Next.js charge une copie de ce module par route.
 */
export function brancherLectureProgrammesReels(barriere: BarriereLectureProgrammes, relecteur: RelecteurTrajets): void {
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], barriere, relecteur };
}

/** Branche les déblocages de l'essai retenus par cookie (appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherDeblocagesEssai(deblocages: DeblocagesEssai): void {
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], deblocages };
}

/**
 * Branche la création d'un voyage d'essai depuis l'app (spécification E2E-essai, lot 3 ; appelé une fois, au démarrage,
 * par `src/instrumentation.ts` : `src/server/p0/creation-essai.ts`). Ce module n'en lit ni la base ni le cookie.
 */
export function brancherCreationEssai(creation: PortCreationEssai): void {
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], creation };
}

/**
 * Création de l'adaptateur `prototype` (décision 0125 § 4), sous la même liste blanche que la lecture : lancement de
 * `p0Run` sur le brief saisi et avancement, par le port branché au démarrage (non branché : rien n'est lancé).
 */
export function prototypeCreationAdapter(): CreationAdapter {
  assertPrototypeAllowedOnProcess();
  return createPrototypeCreationAdapter({ port: () => holder[INSTANCE_KEY]?.creation ?? null, trips: () => prototypeTripAdapter() });
}

/**
 * Révision d'un voyage d'essai après le tri (spécification E2E-essai, lot 4 ; décision 0126), par le port de création
 * branché au démarrage ; `null` s'il ne l'est pas (rien n'est lancé).
 */
export function revisionEssai(): PortCreationEssai["reviser"] | null {
  assertPrototypeAllowedOnProcess();
  const port = holder[INSTANCE_KEY]?.creation;
  return port ? (demande) => port.reviser(demande) : null;
}

/** Branche les photos du tri d'un voyage d'essai (décision 0128 ; appelé une fois, au démarrage, par `src/instrumentation.ts`). */
export function brancherPhotosEssai(photos: PhotosEssaiBranchees): void {
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], photos };
}

/** Second branchement du partage réel : refusé, le port déjà branché reste en place. */
export class PartageDejaBrancheError extends Error {
  override name = "PartageDejaBrancheError";

  constructor() {
    super("Partage réel déjà branché.");
  }
}

/**
 * Branche le partage réel du site d'essai (décision 0135 ; appelé une fois, au démarrage, par `src/instrumentation.ts`).
 * Le port fournit la clé de signature des liens : un second branchement lève `PartageDejaBrancheError` sans rien
 * remplacer (modèle du branchement de la connexion réelle de `better-auth.ts`, PR 452), si bien qu'un module chargé après le démarrage ne peut pas
 * substituer sa clé, sa session ou sa barrière à celles du serveur.
 */
export function brancherPartageEssai(partage: PartageEssaiBranche): void {
  if (holder[INSTANCE_KEY]?.partage !== undefined) throw new PartageDejaBrancheError();
  holder[INSTANCE_KEY] = { ...holder[INSTANCE_KEY], partage };
}

/** Remise à zéro du branchement du partage réel, **réservée aux tests** ; le serveur ne l'appelle jamais. */
export function debrancherPartageEssaiPourTests(): void {
  const etat = holder[INSTANCE_KEY];
  if (etat) delete etat.partage;
}

/** Photos branchées, ou `null` (aucune photo, aucun appel). */
export function photosEssai(): PhotosEssaiBranchees | null {
  return holder[INSTANCE_KEY]?.photos ?? null;
}

/** Déblocages de l'essai branchés, ou `null` (aucun cookie lu ni écrit). */
export function deblocagesEssai(): DeblocagesEssai | null {
  return holder[INSTANCE_KEY]?.deblocages ?? null;
}

/** Barrière lue à chaque lecture ; non branchée : `null` (aucune connexion, aucun programme). */
const poolLectureProgrammes: BarriereLectureProgrammes = async () => (await holder[INSTANCE_KEY]?.barriere?.()) ?? null;

/** Relecteur réel lu à chaque relecture ; non branché : refus (aucun appel ; page sans ces durées, 0092 § 4 ; jamais une durée inventée). */
const relecteurReel: RelecteurTrajets = {
  relireJournee: async (paires) => (await holder[INSTANCE_KEY]?.relecteur?.relireJournee(paires)) ?? { ok: false, raison: "unavailable" },
};

const REFUS_HORS_LISTE = "adaptateur prototype refusé : environnement hors liste blanche (production ou non autorisé)";

/** Lève une erreur explicite hors liste blanche : jamais de repli silencieux vers `mock`. */
export function assertPrototypeAllowed(env: NodeJS.ProcessEnv): void {
  if (!prototypeAdapterAllowed(env)) {
    throw new Error(REFUS_HORS_LISTE);
  }
}

/** Même garde, sur l'environnement du processus (`siteEssaiAutorise`, accueil du site d'essai). */
export function assertPrototypeAllowedOnProcess(): void {
  if (!prototypeAdapterAllowed()) throw new Error(REFUS_HORS_LISTE);
}

/**
 * Adaptateur `prototype`. `deblocage` (spécification E2E-essai, lot 1) : lecteur du déblocage simulé d'un voyage d'essai
 * pour la requête courante (`getTripReader()`) ; absent, un voyage d'essai est servi non débloqué.
 */
export function prototypeTripAdapter(env: NodeJS.ProcessEnv = process.env, deblocage?: LecteurDeblocage): TripAdapter {
  assertPrototypeAllowed(env);
  const etat = holder[INSTANCE_KEY] ?? {};
  if (!etat.instance) {
    const dossier = env.VADROUILLE_PROTOTYPE_DIR?.trim();
    const relecteur = createRelecteurSimule();
    const sources = dossier
      ? (() => {
          const programmes = createProgrammeLoader({ dossier });
          return {
            fabrique: (lecteur?: LecteurDeblocage) => createPrototypeAdapter({ programmes, relecteurs: { trajets: relecteur }, deblocage: lecteur }),
            partage: (tripId: string) =>
              createPrototypeAdapter({ programmes: unSeulProgramme(programmes, tripId), relecteurs: { trajets: relecteur }, deblocage: seulementCeVoyage(tripId) }),
          };
        })()
      : (() => {
          const programmes = createSourceProgrammesReels({ pool: poolLectureProgrammes });
          const programmesPartages = createSourceProgrammesReels({ pool: poolLecturePartage });
          return {
            fabrique: (lecteur?: LecteurDeblocage) => createPrototypeAdapterReel({ programmes, relecteurs: { trajets: relecteurReel }, deblocage: lecteur }),
            partage: (tripId: string) =>
              createPrototypeAdapterReel({
                programmes: unSeulProgrammeReel(programmesPartages, tripId),
                relecteurs: { trajets: RELECTEUR_REFUSE },
                deblocage: seulementCeVoyage(tripId),
              }),
          };
        })();
    etat.instance = { ...sources, relecteur, dossier: Boolean(dossier) };
    holder[INSTANCE_KEY] = etat;
  }
  return etat.instance.fabrique(deblocage);
}

/** Instance du processus, créée au besoin sous la liste blanche (même erreur que `prototypeTripAdapter` hors liste blanche). */
function instanceCourante(): Instance {
  prototypeTripAdapter();
  const instance = holder[INSTANCE_KEY]?.instance;
  if (!instance) throw new Error(REFUS_HORS_LISTE);
  return instance;
}

// --- Partage réel du site d'essai (décision 0135) ------------------------------------------------------------------

/** Barrière de la vue partagée, branchée au démarrage ; non branchée : `null` (aucune connexion, aucun programme). */
const poolLecturePartage: BarriereLectureProgrammes = async () => (await holder[INSTANCE_KEY]?.partage?.barriereLecture()) ?? null;

/** Vue partagée : jamais de relecture Routes (payante) pour un visiteur ; les paires sans temps conservé restent « à confirmer ». */
const RELECTEUR_REFUSE: RelecteurTrajets = { relireJournee: async () => ({ ok: false, raison: "unavailable" }) };

/**
 * Déblocage de la vue partagée : vrai pour le seul voyage du lien. Le lien n'a été émis que pour un voyage débloqué
 * pour la personne qui l'a créé (session vérifiée, `signed-share.ts`) ; le visiteur n'a ni son cookie ni sa portée.
 */
const seulementCeVoyage =
  (tripId: string): LecteurDeblocage =>
  async (_ctx, candidat) =>
    candidat === tripId;

/** Source réduite au seul voyage du lien, **sans `conserver`** : la vue partagée n'écrit jamais en base. */
function unSeulProgrammeReel(source: SourceProgrammesReels, tripId: string): SourceProgrammesReels {
  return {
    lister: async () => [],
    async lire(id) {
      if (id !== tripId) return null;
      const lu = await source.lire(id);
      return lu ? { programme: lu.programme, trajets: lu.trajets } : null;
    },
  };
}

/** Index de fichiers réduit au seul voyage du lien (mode « dossier », local et CI). */
function unSeulProgramme(source: SourceProgrammes, tripId: string): SourceProgrammes {
  return {
    ids: async () => ((await source.ids()).includes(tripId) ? [tripId] : []),
    lire: async (id) => (id === tripId ? source.lire(id) : null),
  };
}

/**
 * Lecteur de la vue partagée d'un seul voyage (décision 0135 § 5) : programme lu **sans le cookie d'accès** du visiteur
 * (garde du mode réel ouverte seulement), en lecture seule, sans relecture Routes, servi débloqué. Même liste blanche que
 * l'adaptateur.
 */
export function prototypeSharedReader(tripId: string): TripAdapter {
  return instanceCourante().partage(tripId);
}

/**
 * Clé de signature des liens partagés : mode « dossier », 32 octets aléatoires tirés une fois par processus (un lien
 * meurt au redémarrage) ; programmes réels, clé tirée du code d'accès par le port branché, ou `null`.
 */
export function clePartageEssai(): Buffer | null {
  const courante = instanceCourante();
  const etat = holder[INSTANCE_KEY] ?? {};
  if (courante.dossier) {
    etat.clePartageLocale ??= randomBytes(32);
    holder[INSTANCE_KEY] = etat;
    return etat.clePartageLocale;
  }
  return etat.partage?.cle() ?? null;
}

/**
 * Session vérifiée pour créer un lien : mode « dossier » (local, CI, sans code d'accès), vraie ; programmes réels,
 * cookie d'accès valide (port branché), sinon fausse.
 */
export async function sessionPartageEssaiVerifiee(): Promise<boolean> {
  if (instanceCourante().dossier) return true;
  try {
    return (await holder[INSTANCE_KEY]?.partage?.sessionVerifiee()) === true;
  } catch {
    return false;
  }
}

/**
 * Nombre de relectures demandées au relecteur simulé (e2e « prototype sans cache », `GET
 * /dev/api/prototype/relectures`) ; `null` hors liste blanche.
 */
export function prototypeRelectures(env: NodeJS.ProcessEnv = process.env): number | null {
  if (!prototypeAdapterAllowed(env)) return null;
  return holder[INSTANCE_KEY]?.instance?.relecteur.appels() ?? 0;
}
