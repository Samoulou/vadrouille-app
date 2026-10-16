import "server-only";

import { commitDuDeploiement } from "@/server/env/p0";
import type { DependancesAcces } from "@/server/p0/acces";
import { ouvrirGardeLancement, type CodeGarde, type CodeRefusAvantReservation } from "@/server/p0/garde";
import { reserverExecution, type PoolSql } from "@/server/usage/neon";
import { briefLancable, briefTientDansLeMode, cloreExecutionNonDemarree, lancementDuMode, NOMS_BRIEFS, P0RUN_COMPLET, startWorkflow, verrouS8Leve } from "@/workflows";

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
  const demarrage = await startWorkflow("p0Run", garde.garde);
  if (demarrage.ok) return "lancee";
  try {
    await cloreExecutionNonDemarree(dependances.pool(), garde.garde);
  } catch {
    // Base injoignable : l'exécution reste `en_cours`, sans étape ; close comme orpheline (`pipeline_failed`, comptée)
    // au lancement suivant.
  }
  return "demarrage_impossible";
}
