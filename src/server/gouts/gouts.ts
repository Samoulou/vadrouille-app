import "server-only";

import type { z } from "zod";

import type { AdapterContext } from "@/adapters/types";
import {
  fail,
  ok,
  RemoveAllTastesRequestSchema,
  RemoveTasteRequestSchema,
  RestoreTasteRequestSchema,
  RetainTastesRequestSchema,
  type PreferenceSubject,
  type Result,
  type RetainedTaste,
} from "@/contracts";
import { accesAuMoment } from "@/server/avis/acces";
import { lireVoyageDeLaPersonne, type DependancesAvis } from "@/server/avis/avis";
import { errorNameOf, logEvent } from "@/server/log";
import { parseInput } from "@/server/parse-input";
import { checkRateLimit } from "@/server/rate-limit";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import { identifiantLisible } from "@/server/voyages/conversion";
import { executeurSql, withOrg as withOrgParDefaut } from "@/server/with-org";

import { candidatsDuVoyage, goutDeLigne, sujetDeCle } from "./lecture";

/**
 * Retenir et retirer ses goûts sur `api` (tâche M8c-1, ticket 1121 ; spécification `specs/M8-apres-le-voyage-api.md` § 5.2
 * et § 5.3, critères du § 6.5 ; décision 0160 § 1.2 point 6, § 1.3, § 1.8 point 4 et § 2.2, § 2.3), sur la table
 * `preferences` de la migration 0026. Un goût est une donnée maison : code de catégorie et sens (ou distance), origine,
 * voyage d'origine, instant de l'accord posé par la base. **Ni nom, ni `placeId`, ni texte, ni destination.**
 *
 * - `retenirGouts` (`retainTastes`) : accord explicite. Ordre : session, entrée stricte, voyage dans l'organisation
 *   (`not_found`) — cadre `executerActionVoyage` ; personne propriétaire, voyage débloqué, accès `open` (`not_found`) ;
 *   limite `gouts` (`rate_limited`) ; candidats **recalculés par le serveur** : une clé qui n'en fait pas partie est refusée
 *   (`validation_failed`, `field: "candidateIds"`), rien n'est écrit ; sujet, origine et voyage d'origine viennent de ce
 *   calcul, jamais du client. Un sujet déjà retenu n'est pas retenu deux fois (`ON CONFLICT DO NOTHING` : première origine
 *   et premier voyage gardés) ; la réponse ne porte que les goûts **nouvellement** retenus.
 * - `retirerGout` (`removeTaste`) et `retirerTousLesGouts` (`removeAllTastes`) : retrait de l'accord, **jamais refusé**
 *   (RGPD art. 7 (3) ; spécification § 5.3 point 4). Ils ne lisent ni voyage, ni déblocage, ni dates : seulement la session.
 *   Le limiteur est compté, son verdict ignoré, sa panne comprise. Le goût est **supprimé** ; `removeTaste` le rend pour
 *   « Annuler ». Un goût absent, d'une autre personne ou d'une autre organisation : `not_found`, sans distinguer les cas.
 * - `restaurerGout` (`restoreTaste`) : « Annuler » un retrait dans les 5 s. Le serveur ne garde rien du goût supprimé :
 *   l'écran renvoie le `RetainedTaste` reçu de `removeTaste`, validé par le schéma strict (codes fermés). Le voyage
 *   d'origine doit être un voyage de la personne dans l'organisation (sinon `validation_failed`, `field: "taste"`).
 *   L'origine vient du client (seul champ non recalculable) et l'instant de l'accord est un **nouvel** instant posé par la
 *   base : **forme proposée par 0160 § 2.2, option (a), que la Sécurité n'a pas encore confirmée (S2)**.
 *
 * Aucune trace de l'accord ni du retrait n'est gardée après la suppression (option (a) de S2). Rien n'est journalisé d'un
 * goût : une erreur inattendue écrit `voyages.action_failed` (nom de l'action, classe de l'erreur), rien d'autre.
 */

/** Action du limiteur des goûts (`RATE_LIMITS`, proposition de 0160 § 2.3 : 20 par heure et par adresse IP, S3). */
export const ACTION_LIMITEUR_GOUTS = "gouts";

export type DependancesGouts = DependancesAction &
  Pick<DependancesAvis, "maintenant" | "limiteur" | "lireEtat" | "lireSignaux"> & {
    /** Compte un retrait sans jamais le refuser ; le limiteur par défaut, verdict ignoré. Les tests injectent une panne. */
    readonly compter?: () => Promise<unknown>;
  };

/** Retenue d'un goût : rien n'est écrit si le sujet est déjà retenu par la personne (index unique de 0026). */
export const SQL_RETENIR_GOUT = `INSERT INTO public.preferences (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7)
  ON CONFLICT DO NOTHING
  RETURNING subject_kind`;

/** Retrait d'un goût de la personne, rendu pour « Annuler ». */
export const SQL_RETIRER_GOUT = `DELETE FROM public.preferences
  WHERE organization_id = $1 AND user_id = $2 AND subject_kind = $3 AND COALESCE(category, '') = $4 AND COALESCE(direction, '') = $5
  RETURNING origin, source_trip_id`;

/** « Retirer tous mes goûts » : toutes les lignes de la personne dans l'organisation. */
export const SQL_RETIRER_TOUS_LES_GOUTS = "DELETE FROM public.preferences WHERE organization_id = $1 AND user_id = $2";

/** Voyage d'origine d'un goût restauré : un voyage de la personne dans l'organisation. */
export const SQL_VOYAGE_DE_LA_PERSONNE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2 AND created_by = $3";

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_GOUTS, headers: new Headers(await headers()) });
};

/** Colonnes du sujet : `category` et `direction` nuls pour la distance (`CHECK` de 0026). */
function colonnesDuSujet(sujet: PreferenceSubject): { kind: string; category: string | null; direction: string | null } {
  return sujet.kind === "distance" ? { kind: "distance", category: null, direction: null } : { kind: "category", category: sujet.category, direction: sujet.direction };
}

type Issue<T> = { readonly type: "fait"; readonly valeur: T } | { readonly type: "refus"; readonly erreur: Result<never> };

/** « Retenir ces goûts » (`retainTastes` sur `api`) : les goûts nouvellement retenus, dans l'ordre de `preferenceKey`. */
export async function retenirGouts(dependances: DependancesGouts, entree: unknown): Promise<Result<RetainedTaste[]>> {
  const maintenant = dependances.maintenant ?? Date.now;
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const resultat = await executerActionVoyage("retain-tastes", dependances, RetainTastesRequestSchema, entree, async (executeur, ctx, demande): Promise<Issue<RetainedTaste[]> | null> => {
    const etat = await lireVoyageDeLaPersonne(dependances, executeur, ctx, demande.tripId);
    if (etat === null || accesAuMoment(etat.end, etat.timeZone, maintenant()) !== "open") return null;
    const debit = await limiteur();
    if (!debit.ok) return { type: "refus", erreur: debit };
    const candidats = new Map((await candidatsDuVoyage(executeur, ctx, demande.tripId, dependances.lireSignaux)).map((candidat) => [candidat.id, candidat]));
    if (demande.candidateIds.some((id) => !candidats.has(id))) return { type: "refus", erreur: fail("validation_failed", "candidateIds") };
    const retenus: RetainedTaste[] = [];
    // Une transaction, un instant d'accord ; ordre de `preferenceKey` (0160 § 1.3 point 7).
    for (const id of [...demande.candidateIds].sort()) {
      const candidat = candidats.get(id);
      if (candidat === undefined) continue;
      const { kind, category, direction } = colonnesDuSujet(candidat.subject);
      const { rows } = await executeur.query(SQL_RETENIR_GOUT, [ctx.organizationId, ctx.userId, kind, category, direction, candidat.origin, demande.tripId]);
      if (rows.length === 1) retenus.push({ id: candidat.id, origin: candidat.origin, subject: candidat.subject, fromTripId: demande.tripId });
    }
    return { type: "fait", valeur: retenus };
  });
  if (!resultat.ok) return resultat;
  return resultat.value.type === "refus" ? resultat.value.erreur : ok(resultat.value.valeur);
}

type NomActionGout = "remove-taste" | "restore-taste" | "remove-all-tastes";

/**
 * Cadre des actions de goûts **sans voyage** (retrait, restauration, tout retirer) : session, entrée stricte, puis
 * `avant` (limiteur), puis une transaction `withOrg` au contexte de la session. Aucune lecture de voyage, de déblocage ni
 * de dates (spécification § 5.3 point 4). Erreur inattendue : `internal`, journalisée sans rien du goût.
 */
async function executerActionGout<S extends z.ZodType, T>(
  nom: NomActionGout,
  dependances: DependancesGouts,
  schema: S,
  entree: unknown,
  traitement: (executeur: ExecuteurAction, ctx: AdapterContext, valeur: z.infer<S>) => Promise<Result<T>>,
): Promise<Result<T>> {
  try {
    const ctx = await dependances.contexte();
    if (ctx === null) return fail("unauthenticated");
    const lue = parseInput(schema, entree);
    if (!lue.ok) return lue;
    const withOrg = dependances.withOrg ?? withOrgParDefaut;
    return await withOrg(ctx, (tx) => traitement(executeurSql(tx), ctx, lue.value));
  } catch (erreur) {
    const errorName = errorNameOf(erreur);
    logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }) }, "error");
    return fail("internal");
  }
}

/** Compte un retrait sans jamais refuser ni lever (spécification § 5.3 point 4 ; 0160 § 2.3 ; comme 0157 § 1.7 point 5). */
async function compterSansRefus(dependances: DependancesGouts): Promise<void> {
  try {
    await (dependances.compter ?? limiteurParDefaut)();
  } catch {
    // Panne du limiteur : le retrait réussit quand même.
  }
}

/** « Retirer » (`removeTaste` sur `api`) : le goût supprimé, pour « Annuler ». */
export async function retirerGout(dependances: DependancesGouts, entree: unknown): Promise<Result<RetainedTaste>> {
  return executerActionGout("remove-taste", dependances, RemoveTasteRequestSchema, entree, async (executeur, ctx, demande) => {
    const sujet = sujetDeCle(demande.tasteId);
    if (sujet === null) return fail("validation_failed", "tasteId");
    await compterSansRefus(dependances);
    const { kind, category, direction } = colonnesDuSujet(sujet);
    const [ligne] = (await executeur.query(SQL_RETIRER_GOUT, [ctx.organizationId, ctx.userId, kind, category ?? "", direction ?? ""])).rows;
    return ligne === undefined ? fail("not_found") : ok(goutDeLigne(sujet, ligne));
  });
}

/** « Retirer tous mes goûts » (`removeAllTastes` sur `api`) : plus aucune ligne pour la personne ; réussit aussi sans goût. */
export async function retirerTousLesGouts(dependances: DependancesGouts, entree: unknown): Promise<Result<void>> {
  return executerActionGout("remove-all-tastes", dependances, RemoveAllTastesRequestSchema, entree, async (executeur, ctx) => {
    await compterSansRefus(dependances);
    await executeur.query(SQL_RETIRER_TOUS_LES_GOUTS, [ctx.organizationId, ctx.userId]);
    return ok(undefined);
  });
}

/** « Annuler » un retrait (`restoreTaste` sur `api`) : le goût est réinséré ; déjà présent, rien n'est écrit. */
export async function restaurerGout(dependances: DependancesGouts, entree: unknown): Promise<Result<void>> {
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  return executerActionGout("restore-taste", dependances, RestoreTasteRequestSchema, entree, async (executeur, ctx, demande) => {
    const { taste } = demande;
    if (taste.fromTripId !== null) {
      if (!identifiantLisible(taste.fromTripId)) return fail("validation_failed", "taste");
      const voyage = (await executeur.query(SQL_VOYAGE_DE_LA_PERSONNE, [ctx.organizationId, taste.fromTripId, ctx.userId])).rows;
      if (voyage.length !== 1) return fail("validation_failed", "taste");
    }
    const debit = await limiteur();
    if (!debit.ok) return debit;
    const { kind, category, direction } = colonnesDuSujet(taste.subject);
    await executeur.query(SQL_RETENIR_GOUT, [ctx.organizationId, ctx.userId, kind, category, direction, taste.origin, taste.fromTripId]);
    return ok(undefined);
  });
}
