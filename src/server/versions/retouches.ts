import "server-only";

import { z } from "zod";

import type { AdapterContext } from "@/adapters/types";
import { ApiErrorSchema, TripPatchSchema, type ApiError, type PatchResult, type Result, type StopSnapshot, type TripPatch, type TripSnapshot } from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { appliquerPatch, type ResultatPatch } from "@/domain/patch";
import { erreurDeVersion } from "@/domain/version";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { checkRateLimit } from "@/server/rate-limit";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";

import { BaseDeVersionDepassee, ecrireVersion, verrouillerVersions } from "./ecrire";
import {
  contexteVoyage,
  entreeMoteurDeRevision,
  lireVersion,
  refuserPendantUnRecalcul,
  RELECTURES_INCONNUES,
  SQL_PAR_DEMANDE,
  type ContexteVoyage,
} from "./remplacement";

/**
 * Retouches de la personne sur l'adaptateur `api` (spécification `specs/M5-retouches.md` § 3 ; décision 0147 § 8, § 9, § 11,
 * § 6.4 point 4 et § 5.3 point 7 ; tâche M5a, ticket 919). Cas d'usage `lockStop` et `unlockStop`, dans le cadre commun des
 * actions sur un voyage (`src/server/voyages/actions.ts`) ; M5b et M5d y ajoutent les leurs.
 *
 * **Formes admises d'un patch de la personne** (`FORMES_PATCH_PERSONNE`, 0147 § 11) : liste fermée tenue ici, pas par
 * `TripPatchSchema` (qui sert aussi `mock` et les tests du moteur). Tout autre patch construit par le serveur est une erreur
 * de programmation (`PatchHorsForme`, convertie en `internal` par le cadre).
 *
 * **Ordre des contrôles d'un verrou, fixé** : (a) session, (b) entrée stricte, (c) voyage dans l'organisation (`not_found`)
 * — tous trois par le cadre ; (d) déblocage (`not_unlocked`, `retryable` faux, sans rien relire ; 0147 § 8 point 2) ; (e)
 * débit `retouche` par adresse IP (`rate_limited` ; 0147 § 6.4 point 4) ; puis, sous le verrou du tri et le verrou des
 * versions (même ordre que M1g), (f) rejeu d'une demande déjà écrite ; (g) recalcul en cours (`generation_in_progress`) ;
 * (h) borne `VERSIONS_MAX_PAR_VOYAGE` (`validation_failed`, `field: "baseVersion"`) ; (i) version de base
 * (`version_conflict` avec `currentVersion`) ; (j) étape : absente de la version courante, `not_found` ; événement de
 * `Day.events`, engagement ou idée « Surprends-moi », `validation_failed` (`field: "stopId"`, 0147 § 8 point 3), **avant le
 * moteur** ; (k) moteur (`appliquerPatch`, verrou seul : ni replanification ni relecture, 0147 § 9) ; (l) écriture de la
 * version (`ecrireVersion`, auteur `user`, `instantanePrecedent` obligatoire, 0147 § 7.2 : les lignes `checklist` de
 * « Ce qui change » en viennent).
 *
 * **Aucun appel Google ni Routes** : le port de relectures n'est jamais appelé pour un verrou (relectures vides,
 * `RELECTURES_INCONNUES`). Aucun prompt, aucune donnée Google : seuls l'identifiant de l'étape et les noms maison des
 * instantanés circulent.
 */

// --- Formes admises (0147 § 11) ---------------------------------------------------------------------------------

/** Formes admises d'un patch écrit pour la personne : suites d'opérations, dans l'ordre. `[add, lock]` sur le même `stopId`. */
export const FORMES_PATCH_PERSONNE = [["replace"], ["add", "lock"], ["move"], ["lock"], ["unlock"], ["revert"]] as const satisfies readonly (readonly TripPatch["operations"][number]["op"][])[];

/** Patch construit par le serveur hors des formes admises : erreur de programmation (`internal`). */
export class PatchHorsForme extends Error {
  override name = "PatchHorsForme";
}

/** Vrai si le patch a l'une des formes de `FORMES_PATCH_PERSONNE` (`[add, lock]` : même étape). */
export function formeAdmise(patch: TripPatch): boolean {
  const ops = patch.operations.map((operation) => operation.op);
  const forme = FORMES_PATCH_PERSONNE.find((candidate) => candidate.length === ops.length && candidate.every((op, rang) => ops[rang] === op));
  if (forme === undefined) return false;
  const [premiere, seconde] = patch.operations;
  if (premiere?.op === "add") return seconde?.op === "lock" && seconde.stopId === premiere.stopId;
  return true;
}

/** Patch de la personne validé par `TripPatchSchema` **et** par les formes admises ; sinon lève (`internal`). */
export function patchDeLaPersonne(valeur: unknown): TripPatch {
  const patch = TripPatchSchema.parse(valeur);
  if (!formeAdmise(patch)) throw new PatchHorsForme("retouches: forme de patch non admise");
  return patch;
}

// --- Verrou : fonctions pures -----------------------------------------------------------------------------------

export type OperationDeVerrou = "lock" | "unlock";

/** Identifiant d'étape (`Stop.id`) reçu de l'écran : borné, jamais interprété. */
const StopIdSchema = z.string().min(1).max(200);

/** Demande de `lockStop` et d'`unlockStop` (0016 § 4.1 : version de base entière ≥ 1). */
export const DemandeVerrouSchema = z.strictObject({
  tripId: z.string(),
  requestId: z.uuid(),
  stopId: StopIdSchema,
  baseVersion: z.number().int().positive(),
});

export type SituationDuVerrou =
  | { readonly type: "etape"; readonly stop: StopSnapshot }
  | { readonly type: "absente" }
  /** Événement de `Day.events` (engagement ou événement proposé), engagement, idée « Surprends-moi » : jamais verrouillés ici. */
  | { readonly type: "non_verrouillable" };

/**
 * Étape visée par un verrou dans l'instantané courant (0147 § 8 point 3) : une étape `stop` de la ligne d'un jour, sans
 * `commitment` ; un événement de `Day.events` (sur `api`, les engagements y vivent), une étape qui porte `commitment` ou
 * l'idée « Surprends-moi » sont `non_verrouillable` ; tout autre identifiant est `absente`.
 */
export function situerEtapeAVerrouiller(instantane: TripSnapshot, stopId: string): SituationDuVerrou {
  for (const jour of instantane.days) {
    for (const item of jour.items) {
      if (item.type === "stop" && item.stop.id === stopId) return item.stop.commitment === undefined ? { type: "etape", stop: item.stop } : { type: "non_verrouillable" };
    }
    if (jour.events.some((evenement) => evenement.id === stopId) || jour.surprise?.id === stopId) return { type: "non_verrouillable" };
  }
  return { type: "absente" };
}

/** Patch d'un verrou : une seule opération, sur la version de base (celui que le moteur applique et que le serveur écrit). */
export function patchDuVerrou(requestId: string, baseVersion: number, op: OperationDeVerrou, stopId: string): TripPatch {
  return patchDeLaPersonne({ requestId, baseVersion, operations: [{ op, stopId }] });
}

/**
 * Refus du moteur en erreur d'action (0147 § 8 point 4) : `version_conflict` (avec `currentVersion`) ; `unknown_stop`,
 * `out_of_trip` → `not_found` ; `no_option` ; `locked_stop`, `no_effect` → `validation_failed` (`stopId`) ; `invalid_revert`
 * → `validation_failed` (`toVersion`). `unknown_candidate` n'arrive jamais d'un patch de la personne : `internal`.
 */
export function erreurDuMoteur(refus: Exclude<ResultatPatch, { ok: true }>): ApiError {
  switch (refus.code) {
    case "version_conflict":
      return erreurDeVersion(refus);
    case "unknown_stop":
    case "out_of_trip":
      return { code: "not_found" };
    case "no_option":
      return { code: "no_option" };
    case "locked_stop":
    case "no_effect":
      return { code: "validation_failed", field: "stopId" };
    case "invalid_revert":
      return { code: "validation_failed", field: "toVersion" };
    case "unknown_candidate":
      return { code: "internal" };
  }
}

/** Moteur d'un verrou : relectures vides (0147 § 9), aucun candidat. */
function moteurDuVerrou(contexte: ContexteVoyage, patch: TripPatch, base: TripSnapshot, versionCourante: number, configuration?: ConfigurationMoteur): ResultatPatch {
  return appliquerPatch({ moteur: entreeMoteurDeRevision(contexte, [], RELECTURES_INCONNUES, configuration), patch, versionCourante, base });
}

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

/** Droit `tripUnlocked` du voyage dans l'organisation (0147 § 8 point 2), lu avant toute autre lecture. */
export const SQL_DROIT_DEBLOQUE = "SELECT 1 AS present FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2 AND kind = 'tripUnlocked'";
/** Dernière version du voyage (borne `VERSIONS_MAX_PAR_VOYAGE`, comptée sous le verrou des versions ; 0147 § 5.3 point 7). */
export const SQL_DERNIERE_VERSION = "SELECT max(version) AS n FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2";

/** Action du limiteur pour les retouches (`RATE_LIMITS.retouche`, 60 par heure et par adresse IP). */
export const ACTION_LIMITEUR_RETOUCHE = "retouche";

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_RETOUCHE, headers: new Headers(await headers()) });
};

export type DependancesRetouche = DependancesAction & {
  /** Débit `retouche` par adresse IP ; `checkRateLimit` avec les en-têtes de la requête par défaut (échec fermé). */
  readonly limiteur?: () => Promise<Result<void>>;
  /** **Tests seulement** : configuration du moteur (`CONFIGURATION_MOTEUR` par défaut). */
  readonly configuration?: ConfigurationMoteur;
};

type Issue = { readonly ok: true; readonly value: PatchResult } | { readonly ok: false; readonly error: ApiError };

const refus = (error: ApiError): Issue => ({ ok: false, error: ApiErrorSchema.parse(error) });
const conflit = (currentVersion: number): Issue => refus({ code: "version_conflict", retryable: true, currentVersion });

/**
 * Rejeu d'une demande déjà écrite (même `requestId`) : la même réponse si c'est bien un verrou de la même sorte écrit par
 * une personne (recalculée par le moteur depuis l'instantané de sa version de base : le patch stocké se rejoue tel quel),
 * sinon `version_conflict`.
 */
async function rejeu(executeur: ExecuteurAction, ctx: AdapterContext, tripId: string, op: OperationDeVerrou, ligne: Record<string, unknown>, configuration?: ConfigurationMoteur): Promise<Issue | null> {
  const contexte = await contexteVoyage(executeur, ctx, tripId);
  if (contexte === null) return null;
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const version = typeof ligne.version === "number" ? ligne.version : Number.NaN;
  if (!patch.success || ligne.author_kind !== "user" || patch.data.operations.length !== 1 || patch.data.operations[0]?.op !== op || !Number.isInteger(version)) {
    return conflit(contexte.base.version);
  }
  const base = await lireVersion(executeur, ctx.organizationId, tripId, patch.data.baseVersion);
  const resultat = moteurDuVerrou(contexte, patch.data, base.instantane, patch.data.baseVersion, configuration);
  if (!resultat.ok) return conflit(contexte.base.version);
  return { ok: true, value: { ...resultat.resultat, version } };
}

/**
 * `lockStop` ou `unlockStop` (voir l'en-tête du module) : version `baseVersion + 1`, auteur `user`, patch
 * `{ requestId, baseVersion, operations: [{ op, stopId }] }` ; réponse `PatchResult` (jours touchés, « Ce qui change »).
 * Idempotente par `requestId`.
 */
export async function basculerVerrou(dependances: DependancesRetouche, op: OperationDeVerrou, entree: unknown): Promise<Result<PatchResult>> {
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const nom = op === "lock" ? "lock-stop" : "unlock-stop";
  const lu = await executerActionVoyage(nom, dependances, DemandeVerrouSchema, entree, async (executeur, ctx, valeur): Promise<Issue | null> => {
    const org = ctx.organizationId;
    // (d) Déblocage, avant toute relecture (0147 § 8 point 2).
    if ((await executeur.query(SQL_DROIT_DEBLOQUE, [org, valeur.tripId])).rows.length === 0) return refus({ code: "not_unlocked", retryable: false });
    // (e) Débit, avant toute relecture ou écriture (0147 § 6.4 point 4). Comme `reportStop`, le limiteur écrit par une autre
    // connexion du pool ; ici aucun verrou n'est encore tenu.
    const debit = await limiteur();
    if (!debit.ok) return refus(debit.error);
    // Verrous : tri, puis versions (ordre unique, 0119 § 1.6) ; aucun appel externe tant qu'ils sont tenus.
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    // (f) Rejeu.
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeu(executeur, ctx, valeur.tripId, op, deja, dependances.configuration);
    // (g) Recalcul en cours.
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    // (h) Borne du nombre de versions.
    const derniere = Number((await executeur.query(SQL_DERNIERE_VERSION, [org, valeur.tripId])).rows[0]?.n);
    if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
    if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
    // (i) Version de base.
    const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
    if (contexte === null) return null;
    const { base } = contexte;
    if (base.version !== valeur.baseVersion) return conflit(base.version);
    // (j) Étape, avant le moteur.
    const situation = situerEtapeAVerrouiller(base.snapshot, valeur.stopId);
    if (situation.type === "absente") return null;
    if (situation.type === "non_verrouillable") return refus({ code: "validation_failed", field: "stopId" });
    // (k) Moteur : verrou seul, aucune relecture.
    const patch = patchDuVerrou(valeur.requestId, base.version, op, valeur.stopId);
    const resultat = moteurDuVerrou(contexte, patch, base.snapshot, base.version, dependances.configuration);
    if (!resultat.ok) return refus(erreurDuMoteur(resultat));
    // (l) Écriture.
    try {
      const ecrite = await ecrireVersion(executeur, {
        organizationId: org,
        tripId: valeur.tripId,
        requestId: valeur.requestId,
        auteur: "user",
        auteurUserId: ctx.userId,
        instantane: resultat.instantane,
        instantanePrecedent: base.snapshot,
        patch,
      });
      return { ok: true, value: { ...resultat.resultat, version: ecrite.version, changes: [...resultat.resultat.changes, ...(ecrite.aFaire?.changements ?? [])] } };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return conflit(base.version);
      throw erreur;
    }
  });
  if (!lu.ok) return lu;
  return lu.value;
}

/** `lockStop` : verrouille l'étape (`tripId`, `requestId`, `stopId`, `baseVersion`). */
export function verrouillerEtape(dependances: DependancesRetouche, entree: unknown): Promise<Result<PatchResult>> {
  return basculerVerrou(dependances, "lock", entree);
}

/** `unlockStop` : retire le verrou de l'étape (`tripId`, `requestId`, `stopId`, `baseVersion`). */
export function deverrouillerEtape(dependances: DependancesRetouche, entree: unknown): Promise<Result<PatchResult>> {
  return basculerVerrou(dependances, "unlock", entree);
}
