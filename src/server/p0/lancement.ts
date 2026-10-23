import "server-only";

import type { Brief as BriefDeLApp, TripDraft } from "@/contracts";
import { BRIEF_SAISI } from "@/contracts/prototype-travail";
import { identifiantVoyageSaisi } from "@/domain/identifiant";
import { commitDuDeploiement } from "@/server/env/p0";
import type { DependancesAcces } from "@/server/p0/acces";
import { briefDepuisFormulaire } from "@/server/p0/depuis-formulaire";
import { ouvrirGardeLancement, type CodeGarde, type CodeRefusAvantReservation, type GardeOuverte } from "@/server/p0/garde";
import { reserverExecution, type PoolSql } from "@/server/usage/neon";
import {
  briefLancable,
  briefSaisiTientDansLeMode,
  briefTientDansLeMode,
  cloreExecutionNonDemarree,
  lancementDuMode,
  NOMS_BRIEFS,
  P0RUN_COMPLET,
  startWorkflow,
  validerBriefSaisi,
  verrouS8Leve,
} from "@/workflows";

/**
 * Lancement d'une exécution du mode réel (décision 0055, section 8, ligne P0r3d ; spécification `specs/P0-suite-2.md`,
 * « Page de lancement » ; décision 0063, points 7 et 10) : réservation, puis démarrage de `p0Run` par l'API du SDK
 * (`startWorkflow`). Appelé par l'action serveur `src/server/actions/p0-lancement.ts` seulement.
 *
 * Ordre, le premier refus l'emportant (rien n'est écrit avant la réservation) :
 * 1. garde (`ouvrirGardeLancement`) : conditions (1) à (7), déploiement autre que la production, cookie d'accès ; fermée,
 *    aucune connexion à la base ;
 * 2. puis, garde ouverte, dans la réservation :
 *    a. `p0Run` démarrable (`P0RUN_COMPLET`) — sinon `real_mode_unavailable`, **sans connexion à la base** ;
 *    b. choix reçu : brief admis et valide, variante `A` ou `B`, nature `reel` ou `essai` — sinon `entree_invalide` ;
 *    c. configuration du mode et forfait (`lancementDuMode`), commit du déploiement — sinon `real_mode_unavailable` ;
 *    c bis. brief dans les plafonds du mode (`briefTientDansLeMode`, ticket 400 : plan Routes et fiches de la première
 *       série) — sinon `brief_hors_plafonds`, **sans connexion à la base** ;
 *    d. **verrou S8 levé** (`verrouS8Leve`, 0052 § 3, 0056 § 4) — sinon `real_mode_unavailable` : fermé, aucun
 *       programme ne pourrait être écrit, et aucune exécution ne doit dépenser sans pouvoir écrire (0063 point 10) ;
 *    e. réservation du forfait (`reserverExecution`, P0r2) : ligne `runs` et forfait écrits ensemble. Depuis la
 *       décision 0071, ni le décompte par brief et variante (P0S2-PO-13, affiché sur la page pour information), ni le
 *       nombre d'exécutions par jour de quota, ni les plafonds du jour, du mois et de l'enveloppe ne refusent un
 *       lancement ; seuls restent le contrôle propre au forfait et les plafonds par exécution ;
 * 3. démarrage par le SDK ; échoué, l'exécution réservée est close `upstream_unavailable` (cause externe, relance
 *    ouverte) : aucun appel payant n'est parti.
 * Toute erreur de la base dans la réservation rend `usage_unavailable` (échec fermé, par la garde).
 *
 * **Point d'entrée commun** (spécification E2E-essai, lot 3 ; décision 0125 § 2) : `lancerExecutionP0` (formulaire de
 * `/prototype/executions`, brief commité) et `lancerBriefSaisi` (lancement de l'app sur le site d'essai, brief saisi) ont
 * la **même garde** et le même ordre ; seul le choix (b) diffère : pour l'app, conversion du formulaire
 * (`briefDepuisFormulaire`) et validation par `BriefSchema` (`validerBriefSaisi`), nature `essai` (fusible de 2 USD,
 * 0093), variante `A` ; puis (c bis) le même contrôle des plafonds sur le brief converti ; la réservation écrit le brief
 * avec l'exécution, idempotente par `requestId`.
 */

/** Issue d'un lancement, rendue au formulaire : statut fermé, sans valeur. */
export const STATUTS_LANCEMENT = [
  "lancee",
  "fermee",
  "acces_refuse",
  "entree_invalide",
  "brief_hors_plafonds",
  "real_mode_unavailable",
  "daily_quota_insufficient",
  "envelope_reached",
  "cap_reached",
  "usage_unavailable",
  "demarrage_impossible",
  "erreur",
] as const;
export type StatutLancement = (typeof STATUTS_LANCEMENT)[number];

/** Choix du formulaire, tels que reçus (non fiables). */
export type DemandeLancement = { readonly mode: unknown; readonly brief: unknown; readonly variante: unknown };

export type DependancesLancementP0 = DependancesAcces & {
  /** Valeur du cookie `__Host-p0_acces` reçu avec la requête. */
  readonly cookie: string | undefined;
  /** Pool `vadrouille_prototype`, obtenu seulement garde ouverte. */
  readonly pool: () => PoolSql;
};

type Choix = { readonly mode: "reel" | "essai"; readonly brief: string; readonly variante: "A" | "B" };

/** Choix contrôlé : listes fermées seulement ; le brief, parmi les fichiers admis par le pont, et valide. */
function choixValide(demande: DemandeLancement): Choix | null {
  const { mode, brief, variante } = demande;
  if (mode !== "reel" && mode !== "essai") return null;
  if (variante !== "A" && variante !== "B") return null;
  if (typeof brief !== "string" || !NOMS_BRIEFS.includes(brief) || !briefLancable(brief)) return null;
  return { mode, brief, variante };
}

const refus = (code: CodeRefusAvantReservation) => ({ ok: false as const, code });

/** Statut de chaque refus de la garde ouverte ; tout autre code (garde fermée) rend `fermee`. */
const STATUT_DU_REFUS: ReadonlyMap<CodeGarde, StatutLancement> = new Map<CodeGarde, StatutLancement>([
  ["access_refused", "acces_refuse"],
  ["entree_invalide", "entree_invalide"],
  ["brief_hors_plafonds", "brief_hors_plafonds"],
  ["real_mode_unavailable", "real_mode_unavailable"],
  ["daily_quota_insufficient", "daily_quota_insufficient"],
  ["envelope_reached", "envelope_reached"],
  ["cap_reached", "cap_reached"],
  ["usage_unavailable", "usage_unavailable"],
  ["run_refused", "erreur"],
]);

/** Démarrage de `p0Run` pour une exécution réservée ; échoué, l'exécution est close (aucun appel payant n'est parti). */
async function demarrer(garde: GardeOuverte, dependances: DependancesLancementP0): Promise<StatutLancement> {
  const demarrage = await startWorkflow("p0Run", garde);
  if (demarrage.ok) return "lancee";
  try {
    await cloreExecutionNonDemarree(dependances.pool(), garde);
  } catch {
    // Base injoignable : l'exécution reste `en_cours`, sans étape ; close comme orpheline (`pipeline_failed`, comptée)
    // au lancement suivant.
  }
  return "demarrage_impossible";
}

/** Lance une exécution : garde, contrôles, réservation, démarrage. Rend un statut fermé, jamais une valeur. */
export async function lancerExecutionP0(demande: DemandeLancement, dependances: DependancesLancementP0): Promise<StatutLancement> {
  const garde = await ouvrirGardeLancement({
    env: dependances.env,
    execArgv: dependances.execArgv,
    maintenant: dependances.maintenant,
    cookie: dependances.cookie,
    async reserver() {
      if (!P0RUN_COMPLET) return refus("real_mode_unavailable");
      const choix = choixValide(demande);
      if (choix === null) return refus("entree_invalide");
      const lancement = lancementDuMode(choix.mode);
      const commitSha = commitDuDeploiement(dependances.env);
      if (lancement === null || commitSha === null) return refus("real_mode_unavailable");
      if (!briefTientDansLeMode(choix.mode, choix.brief)) return refus("brief_hors_plafonds");
      const pool = dependances.pool();
      if (!(await verrouS8Leve(pool))) return refus("real_mode_unavailable");
      return reserverExecution(pool, { mode: choix.mode, brief: choix.brief, variant: choix.variante, commitSha, forfait: lancement.forfait }, lancement.regles);
    },
  });
  // Garde fermée (environnement, branche, réglages, déploiement de production) : une seule réponse, sans cause.
  if (!garde.ok) return STATUT_DU_REFUS.get(garde.code) ?? "fermee";
  return demarrer(garde.garde, dependances);
}

/** Lancement depuis l'app (site d'essai) : brouillon, vérification et récit saisis, clé d'idempotence (non fiables). */
export type DemandeLancementSaisi = {
  readonly requestId: string;
  readonly draft: TripDraft;
  readonly brief: BriefDeLApp;
  readonly recit?: string;
};

/**
 * Issue d'un lancement depuis l'app : statut fermé ; `tripId` (voyage que suit l'écran 5) si l'exécution est réservée ;
 * `champ` (chemin de la forme de `parseInput`) pour un brouillon refusé (`entree_invalide`). Jamais une valeur saisie.
 */
export type IssueLancementSaisi = { readonly statut: StatutLancement; readonly tripId?: string; readonly champ?: string };

/** Nature et variante d'un lancement depuis l'app (décision 0125 § 2) : essai, fusible de 2 USD (0093). */
export const MODE_LANCEMENT_APP = "essai" as const;
export const VARIANTE_LANCEMENT_APP = "A" as const;

/**
 * Lance `p0Run` sur le brief saisi dans l'app (spécification E2E-essai, lot 3) : même garde que `lancerExecutionP0`
 * (code d'accès, `P0RUN_COMPLET`, verrou S8, réservation, `briefTientDansLeMode`). Une clé `requestId` déjà lancée rend
 * son voyage sans rien réserver ni démarrer (double appui, « Réessayer », retour du navigateur). Le brouillon, le brief et
 * le récit ne sont jamais journalisés.
 */
export async function lancerBriefSaisi(demande: DemandeLancementSaisi, dependances: DependancesLancementP0): Promise<IssueLancementSaisi> {
  let champ: string | undefined;
  let destination: string | undefined;
  let existante = false;
  const garde = await ouvrirGardeLancement({
    env: dependances.env,
    execArgv: dependances.execArgv,
    maintenant: dependances.maintenant,
    cookie: dependances.cookie,
    async reserver() {
      if (!P0RUN_COMPLET) return refus("real_mode_unavailable");
      const converti = briefDepuisFormulaire(demande.draft, demande.brief, demande.recit);
      if (!converti.ok) {
        champ = converti.champ;
        return refus("entree_invalide");
      }
      const valide = validerBriefSaisi(converti.brief);
      if (!valide.ok) {
        champ = valide.champ;
        return refus("entree_invalide");
      }
      const lancement = lancementDuMode(MODE_LANCEMENT_APP);
      const commitSha = commitDuDeploiement(dependances.env);
      if (lancement === null || commitSha === null) return refus("real_mode_unavailable");
      if (!briefSaisiTientDansLeMode(MODE_LANCEMENT_APP, valide.brief)) return refus("brief_hors_plafonds");
      const pool = dependances.pool();
      if (!(await verrouS8Leve(pool))) return refus("real_mode_unavailable");
      destination = valide.brief.destination;
      const reservation = await reserverExecution(
        pool,
        {
          mode: MODE_LANCEMENT_APP,
          brief: BRIEF_SAISI,
          variant: VARIANTE_LANCEMENT_APP,
          commitSha,
          forfait: lancement.forfait,
          briefSaisi: { requestId: demande.requestId, contenu: valide.brief },
        },
        lancement.regles,
      );
      existante = reservation.ok && reservation.existante === true;
      // Rejeu d'une clé (revue de la PR #704, mineur Sécurité 7) : le voyage d'origine, celui de la destination de son brief.
      if (reservation.ok && reservation.existante === true && reservation.destination !== undefined) destination = reservation.destination;
      return reservation;
    },
  });
  if (!garde.ok) {
    const statut = STATUT_DU_REFUS.get(garde.code) ?? "fermee";
    return statut === "entree_invalide" && champ !== undefined ? { statut, champ } : { statut };
  }
  if (destination === undefined) return { statut: "erreur" };
  const tripId = identifiantVoyageSaisi(destination, garde.garde.runId);
  if (existante) return { statut: "lancee", tripId };
  const statut = await demarrer(garde.garde, dependances);
  return statut === "lancee" ? { statut, tripId } : { statut };
}

/** Nouvel essai d'un voyage de l'app arrêté (écran 5, « Réessayer ») : voyage arrêté et nouvelle clé d'idempotence. */
export type DemandeRelanceSaisi = { readonly tripId: string; readonly requestId: string };

export type DependancesRelanceSaisi = DependancesLancementP0 & {
  /** Brief saisi d'une exécution `arretee` du voyage, lu dans la réservation (garde ouverte), ou `null`. */
  readonly briefArrete: (pool: PoolSql, tripId: string) => Promise<unknown>;
};

/**
 * « Réessayer » de l'écran 5 sur un voyage de l'app arrêté sans programme (spécification E2E-essai, lot 3, critère 5 ;
 * une exécution sans programme ne compte jamais, 0093 point 2) : le brief saisi de l'exécution arrêtée, relu en base et
 * revalidé, relance `p0Run` par la même garde que `lancerBriefSaisi`, sous une **nouvelle** exécution et un nouveau
 * voyage. Voyage inconnu, en cours ou écrit : `entree_invalide`, rien n'est réservé.
 */
export async function relancerBriefSaisi(demande: DemandeRelanceSaisi, dependances: DependancesRelanceSaisi): Promise<IssueLancementSaisi> {
  let destination: string | undefined;
  let existante = false;
  const garde = await ouvrirGardeLancement({
    env: dependances.env,
    execArgv: dependances.execArgv,
    maintenant: dependances.maintenant,
    cookie: dependances.cookie,
    async reserver() {
      if (!P0RUN_COMPLET) return refus("real_mode_unavailable");
      const lancement = lancementDuMode(MODE_LANCEMENT_APP);
      const commitSha = commitDuDeploiement(dependances.env);
      if (lancement === null || commitSha === null) return refus("real_mode_unavailable");
      // Relance : le brief vient de la base, une connexion est donc nécessaire ; le verrou S8 est contrôlé d'abord (revue
      // de la PR #704, mineur TL 3), puis le brief arrêté est lu, revalidé et contrôlé sur les plafonds du mode.
      const pool = dependances.pool();
      if (!(await verrouS8Leve(pool))) return refus("real_mode_unavailable");
      const valide = validerBriefSaisi(await dependances.briefArrete(pool, demande.tripId));
      if (!valide.ok) return refus("entree_invalide");
      if (!briefSaisiTientDansLeMode(MODE_LANCEMENT_APP, valide.brief)) return refus("brief_hors_plafonds");
      destination = valide.brief.destination;
      const reservation = await reserverExecution(
        pool,
        {
          mode: MODE_LANCEMENT_APP,
          brief: BRIEF_SAISI,
          variant: VARIANTE_LANCEMENT_APP,
          commitSha,
          forfait: lancement.forfait,
          briefSaisi: { requestId: demande.requestId, contenu: valide.brief },
        },
        lancement.regles,
      );
      existante = reservation.ok && reservation.existante === true;
      // Rejeu d'une clé (revue de la PR #704, mineur Sécurité 7) : le voyage d'origine, celui de la destination de son brief.
      if (reservation.ok && reservation.existante === true && reservation.destination !== undefined) destination = reservation.destination;
      return reservation;
    },
  });
  if (!garde.ok) return { statut: STATUT_DU_REFUS.get(garde.code) ?? "fermee" };
  if (destination === undefined) return { statut: "erreur" };
  const tripId = identifiantVoyageSaisi(destination, garde.garde.runId);
  if (existante) return { statut: "lancee", tripId };
  const statut = await demarrer(garde.garde, dependances);
  return statut === "lancee" ? { statut, tripId } : { statut };
}
