import "server-only";

import type { AdapterContext } from "@/adapters/types";
import {
  AddPlaceUndoSchema,
  ApiErrorSchema,
  PatchResultSchema,
  TripPatchSchema,
  type ApiError,
  type PatchResult,
  type Result,
} from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { BaseDeVersionDepassee, ecrireVersion, verrouillerVersions } from "@/server/versions/ecrire";
import { moteurDuRetour, patchDuRetour } from "@/server/versions/historique";
import { contexteVoyage, lireVersion, refuserPendantUnRecalcul, SQL_PAR_DEMANDE, versionCourante } from "@/server/versions/remplacement";
import { erreurDuMoteur } from "@/server/versions/retouches";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";

import { PREFIXE_ETAPE_AJOUTEE } from "./ajout";

/**
 * Annuler un ajout de lieu à soi sur l'adaptateur `api` (`undoAddPlace`, tâche M5d-6, ticket 994 ; décision 0155 § 4.1,
 * Q779), sur le modèle de l'annulation d'un remplacement (`annulerRemplacement`, décision 0145 § 4). Entrée stricte
 * `AddPlaceUndo` `{ tripId, requestId, version }` (`version` = celle écrite par l'ajout) ; réponse `PatchResult`. Si la
 * version courante est encore cet ajout, une version de plus recopie la version de base de l'ajout (opération `revert`
 * appliquée par le moteur ; rien n'est supprimé) ; sinon `version_conflict`, rien n'est écrit.
 *
 * **Ordre des contrôles, fixé** : (a) session, (b) entrée stricte, (c) voyage dans l'organisation (`not_found`) — par le
 * cadre ; (d) déblocage (`not_unlocked`, `retryable` faux) ; puis, sous le verrou du tri puis celui des versions (même ordre
 * que M1g, M5a et M5b) : (e) rejeu par `requestId` (même réponse ; autre geste sous le même `requestId` : `version_conflict`) ;
 * (f) recalcul en cours (`generation_in_progress`) ; (g) version courante égale à `version`, sinon `version_conflict` avec
 * `currentVersion` ; (h) la version courante est un ajout d'une personne (auteur `user`, patch exactement `[add, lock]` sur
 * un même `stopId` `ajout-…`), sinon `version_conflict` ; (i) `[revert]` vers la `baseVersion` de ce patch, appliqué par
 * `appliquerPatch` **sans relecture** (relectures inconnues : aucun appel du port, rien n'est replanifié) ; (j) écriture par
 * `ecrireVersion` avec `instantanePrecedent` (la liste « À faire » suit dans la même transaction, 0147 § 7.2).
 *
 * **Écart voulu à la règle « après le déblocage »** (0147 § 5.3 point 4 ; 0155 § 4.1) : l'annulation peut revenir à la base
 * de l'ajout même si cette base est antérieure au déblocage (le premier ajout après le déblocage, le cas le plus fréquent).
 * Ce n'est pas un retour libre : elle ne vise que la version que la personne voyait avant son propre geste, et seulement tant
 * que ce geste est la version courante. `applyRevert` garde la règle pour tout autre retour.
 *
 * **Ni débit `retouche`, ni borne `VERSIONS_MAX_PAR_VOYAGE`** (0155 § 4.1) : une annulation ne suit qu'un ajout, lui-même
 * soumis aux deux, et ajoute au plus une version par ajout ; un débit atteint pile à l'ajout empêcherait sinon son
 * annulation. La fenêtre de 5 s est tenue par le toast ; le serveur n'a pas de borne de temps (0145 § 4).
 *
 * Rejeu : la réponse est recalculée par le moteur depuis les instantanés écrits (version, jours touchés, changements du
 * programme), comme le rejeu d'un retour (`historique.ts`) ; les lignes `checklist` de « Ce qui change », déjà appliquées,
 * ne sont pas recalculées. Aucun prompt, aucune donnée Google : seuls des numéros de version et des instantanés maison.
 */

export type DependancesAnnulationAjout = DependancesAction & {
  /** **Tests seulement** : configuration du moteur (`CONFIGURATION_MOTEUR` par défaut). */
  readonly configuration?: ConfigurationMoteur;
};

type Issue<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };
const refus = (error: ApiError): Issue<never> => ({ ok: false, error: ApiErrorSchema.parse(error) });
const conflit = (currentVersion: number): Issue<never> => refus({ code: "version_conflict", retryable: true, currentVersion });

/** (h) Patch d'un ajout d'une personne : exactement `[add, lock]` sur un même `stopId` de la forme `ajout-…`. */
export function estUnAjout(auteur: unknown, patch: unknown): boolean {
  const lu = TripPatchSchema.safeParse(patch);
  if (!lu.success || auteur !== "user" || lu.data.operations.length !== 2) return false;
  const [ajout, verrou] = lu.data.operations;
  return ajout?.op === "add" && verrou?.op === "lock" && ajout.stopId === verrou.stopId && ajout.stopId.startsWith(PREFIXE_ETAPE_AJOUTEE);
}

/**
 * (e) Rejeu d'une annulation déjà écrite : la même réponse si la version est bien une annulation `[revert]` d'une personne
 * écrite sur la version `version` ; sinon `version_conflict`.
 */
async function rejeu(
  executeur: ExecuteurAction,
  dependances: DependancesAnnulationAjout,
  ctx: AdapterContext,
  valeur: { readonly tripId: string; readonly version: number },
  ligne: Record<string, unknown>,
  courante: number,
): Promise<Issue<PatchResult> | null> {
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const operation = patch.success ? patch.data.operations[0] : undefined;
  const version = typeof ligne.version === "number" ? ligne.version : Number(ligne.version);
  if (!patch.success || ligne.author_kind !== "user" || patch.data.operations.length !== 1 || operation?.op !== "revert" || patch.data.baseVersion !== valeur.version || !Number.isSafeInteger(version)) {
    return conflit(courante);
  }
  const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
  if (contexte === null) return null;
  const actuelle = await lireVersion(executeur, ctx.organizationId, valeur.tripId, patch.data.baseVersion);
  const anterieure = await lireVersion(executeur, ctx.organizationId, valeur.tripId, operation.toVersion);
  const resultat = moteurDuRetour(contexte, patch.data, actuelle.instantane, anterieure.instantane, dependances.configuration);
  if (!resultat.ok) return conflit(courante);
  return { ok: true, value: PatchResultSchema.parse({ ...resultat.resultat, version }) };
}

/** `undoAddPlace` : `AddPlaceUndo` → `PatchResult` (version nouvelle, « Ce qui change »). Voir l'en-tête du module. */
export async function annulerAjout(dependances: DependancesAnnulationAjout, entree: unknown): Promise<Result<PatchResult>> {
  const lu = await executerActionVoyage("undo-add-place", dependances, AddPlaceUndoSchema, entree, async (executeur, ctx, valeur): Promise<Issue<PatchResult> | null> => {
    const org = ctx.organizationId;
    // (d) Déblocage, avant tout verrou.
    if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus({ code: "not_unlocked", retryable: false });
    // Verrous : tri, puis versions (ordre unique, 0119 § 1.6) ; aucun appel externe tant qu'ils sont tenus.
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const courante = await versionCourante(executeur, org, valeur.tripId);
    if (courante === null) return null;
    // (e) Rejeu.
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeu(executeur, dependances, ctx, valeur, deja, courante);
    // (f) Recalcul en cours.
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    // (g) Version courante.
    if (courante !== valeur.version) return conflit(courante);
    // (h) Seul un ajout d'une personne s'annule ici (ni la version 1, ni une version du workflow, ni un remplacement, un
    // déplacement, un verrou ou un retour).
    const actuelle = await lireVersion(executeur, org, valeur.tripId, courante);
    if (!estUnAjout(actuelle.auteur, actuelle.patch)) return conflit(courante);
    const cible = TripPatchSchema.parse(actuelle.patch).baseVersion;
    // (i) Moteur (`moteurDuRetour`, partagé avec `applyRevert`). Pas de contrôle « après le déblocage » sur `cible` : écart
    // voulu (0155 § 4.1, voir l'en-tête).
    const anterieure = await lireVersion(executeur, org, valeur.tripId, cible);
    const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
    if (contexte === null) return null;
    const patch = patchDuRetour(valeur.requestId, courante, cible);
    const resultat = moteurDuRetour(contexte, patch, actuelle.instantane, anterieure.instantane, dependances.configuration);
    if (!resultat.ok) return refus(erreurDuMoteur(resultat));
    // (j) Écriture : la liste « À faire » suit dans la même transaction (0147 § 7.2).
    try {
      const ecrite = await ecrireVersion(executeur, {
        organizationId: org,
        tripId: valeur.tripId,
        requestId: valeur.requestId,
        auteur: "user",
        auteurUserId: ctx.userId,
        instantane: resultat.instantane,
        instantanePrecedent: actuelle.instantane,
        patch,
      });
      return {
        ok: true,
        value: PatchResultSchema.parse({ ...resultat.resultat, version: ecrite.version, changes: [...resultat.resultat.changes, ...(ecrite.aFaire?.changements ?? [])] }),
      };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return conflit(courante);
      throw erreur;
    }
  });
  if (!lu.ok) return lu;
  return lu.value.ok ? { ok: true, value: lu.value.value } : { ok: false, error: lu.value.error };
}
