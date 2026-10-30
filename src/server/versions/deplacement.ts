import "server-only";

import { z } from "zod";

import type { AdapterContext } from "@/adapters/types";
import {
  ApiErrorSchema,
  MoveDraftSchema,
  MoveOptionsSchema,
  TripPatchSchema,
  type ApiError,
  type Day,
  type MoveDraft,
  type MoveOptions,
  type PatchResult,
  type Result,
  type TripPatch,
} from "@/contracts";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { deplacerSansRelecture, pointsDeDeplacement, type PointDeDeplacement } from "@/domain/deplacement";
import type { ResultatPatch } from "@/domain/patch";
import { recomposerJour } from "@/domain/recomposition";
import { CHAINE_APERCU, type ChaineApercu } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { checkRateLimit } from "@/server/rate-limit";
import { executerActionVoyage, type ExecuteurAction } from "@/server/voyages/actions";
import { datesDeVerification, type VersionDeChaine } from "@/server/voyages/conversion";
import { lireBaseDeRevision, type BaseDeRevision } from "@/server/voyages/lecture";

import { BaseDeVersionDepassee, ecrireVersion, verrouillerVersions } from "./ecrire";
import { lireVersion, refuserPendantUnRecalcul, SQL_PAR_DEMANDE } from "./remplacement";
import { ACTION_LIMITEUR_RETOUCHE, erreurDuMoteur, patchDeLaPersonne, SQL_DERNIERE_VERSION, type DependancesRetouche } from "./retouches";

/**
 * « Déplacer une étape » sur l'adaptateur `api` (ticket 947 ; spécification `specs/M5-retouches.md` § 3 et § 14 ; décision
 * 0147 § 8, § 11 ; feuille « Déplacer » de F7b). Trois cas d'usage, dans le cadre commun des actions sur un voyage
 * (`src/server/voyages/actions.ts`), sur le modèle du verrou (M5a, `./retouches.ts`) et du retour (M5b, `./historique.ts`) :
 *
 * - `optionsDeDeplacement` (`getMoveOptions`, `{ tripId, stopId }` → `MoveOptions`) : points d'insertion par jour, calculés
 *   sur la version courante ; rien n'est écrit ;
 * - `proposerDeplacement` (`previewMove`, `{ tripId, stopId, pointId, baseVersion }` → `MoveDraft`) : « Ce qui change » et
 *   les jours touchés recomposés **sans durée de trajet** (`sansDurees` de `recomposerJour`) ; rien n'est écrit ;
 * - `appliquerDeplacement` (`applyMove`, `{ tripId, requestId, stopId, pointId, baseVersion }` → `PatchResult`) : version
 *   `baseVersion + 1`, auteur `user`, patch `[move]` (`FORMES_PATCH_PERSONNE`), idempotente par `requestId`. « Annuler » du
 *   toast est un retour à la version de base (`applyRevert`, M5b).
 *
 * **Aucun appel Google ni Routes, aucun appel du port de relectures** : le déplacement est calculé par
 * `deplacerSansRelecture` (`src/domain/deplacement.ts`), qui ne décale aucune autre étape et rejoue R3. Les durées de trajet
 * des jours touchés sont relues par la lecture suivante, comme à chaque affichage ; l'aperçu les montre « sans durée ».
 *
 * **Ordre des contrôles, fixé** (celui de M5a) : (a) session, (b) entrée stricte, (c) voyage dans l'organisation
 * (`not_found`) — par le cadre ; (d) déblocage (`not_unlocked`, `retryable` faux, sans rien relire) ; (e) application
 * seulement : débit `retouche` par adresse IP (`rate_limited`), puis, sous le verrou du tri et le verrou des versions, rejeu
 * (même `requestId` : même réponse si c'est un déplacement de la même étape, sinon `version_conflict`), recalcul en cours
 * (`generation_in_progress`), borne `VERSIONS_MAX_PAR_VOYAGE` (`validation_failed`, `field: "baseVersion"`) ; (f) version
 * de base (`version_conflict` avec `currentVersion`) ; (g) étape : absente, `not_found` ; verrouillée, engagement, événement
 * ou idée, `validation_failed` (`field: "stopId"`) ; (h) point : absent des points de la version courante, `no_option` ;
 * (i) calcul (`deplacerSansRelecture`), refus convertis par `erreurDuMoteur` ; (j) écriture (`ecrireVersion`,
 * `instantanePrecedent` : une étape déplacée garde ses lignes « À faire »).
 */

/** Identifiant d'étape et de point reçus de l'écran : bornés, jamais interprétés (le point est retrouvé côté serveur). */
const IdentifiantSchema = z.string().min(1).max(200);
const VersionSchema = z.number().int().positive();

export const DemandeOptionsSchema = z.strictObject({ tripId: z.string(), stopId: IdentifiantSchema });
export const DemandeApercuDeplacementSchema = z.strictObject({ tripId: z.string(), stopId: IdentifiantSchema, pointId: IdentifiantSchema, baseVersion: VersionSchema });
export const DemandeDeplacementSchema = DemandeApercuDeplacementSchema.extend({ requestId: z.uuid() });

type Issue<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };
const refus = <T>(error: ApiError): Issue<T> => ({ ok: false, error: ApiErrorSchema.parse(error) });
const conflit = <T>(currentVersion: number): Issue<T> => refus({ code: "version_conflict", retryable: true, currentVersion });
const NON_DEBLOQUE: ApiError = { code: "not_unlocked", retryable: false };
const ETAPE_REFUSEE: ApiError = { code: "validation_failed", field: "stopId" };

const configurationDe = (dependances: DependancesRetouche): ConfigurationMoteur => dependances.configuration ?? CONFIGURATION_MOTEUR;

/** Points de l'étape sur un instantané, ou le refus de l'étape (`not_found` : `null`). */
function pointsDe(base: BaseDeRevision, stopId: string, configuration: ConfigurationMoteur): Issue<readonly PointDeDeplacement[]> | null {
  const points = pointsDeDeplacement(base.snapshot, stopId, configuration);
  if (points.ok) return { ok: true, value: points.points };
  return points.situation.type === "absente" ? null : refus(ETAPE_REFUSEE);
}

/** Patch `[move]` d'un point, sur la version de base (celui que le calcul applique et que le serveur écrit). */
export function patchDuDeplacement(requestId: string, baseVersion: number, stopId: string, point: PointDeDeplacement): TripPatch {
  return patchDeLaPersonne({ requestId, baseVersion, operations: [{ op: "move", stopId, day: point.day, time: point.time }] });
}

function calcul(base: BaseDeRevision, patch: TripPatch, configuration: ConfigurationMoteur): ResultatPatch {
  return deplacerSansRelecture({ base: base.snapshot, versionCourante: base.version, patch, configuration, nombreDeNuits: base.nuits, modes: base.modes });
}

/** Calcul d'un déplacement demandé (étapes f à i de l'en-tête), ou son refus ; `null` : `not_found`. */
function preparer(
  base: BaseDeRevision,
  valeur: { readonly stopId: string; readonly pointId: string; readonly baseVersion: number },
  requestId: string,
  configuration: ConfigurationMoteur,
): Issue<{ readonly patch: TripPatch; readonly resultat: Extract<ResultatPatch, { ok: true }> }> | null {
  if (base.version !== valeur.baseVersion) return conflit(base.version);
  const points = pointsDe(base, valeur.stopId, configuration);
  if (points === null || !points.ok) return points;
  const point = points.value.find((candidat) => candidat.id === valeur.pointId);
  if (point === undefined) return refus({ code: "no_option" });
  const patch = patchDuDeplacement(requestId, base.version, valeur.stopId, point);
  const resultat = calcul(base, patch, configuration);
  if (!resultat.ok) return refus(erreurDuMoteur(resultat));
  return { ok: true, value: { patch, resultat } };
}

/** Déblocage (0147 § 8 point 2) : lecture partagée avec B4a, organisation de la transaction par la RLS. */
async function debloque(executeur: ExecuteurAction, tripId: string): Promise<boolean> {
  return (await lireDroitVoyage(executeur, tripId)) !== null;
}

/** Résultat d'un traitement : l'issue, rendue telle quelle (refus fermé compris). */
function rendu<T>(lu: Result<Issue<T>>): Result<T> {
  if (!lu.ok) return lu;
  return lu.value.ok ? { ok: true, value: lu.value.value } : { ok: false, error: lu.value.error };
}

/**
 * Jours de l'aperçu : recomposés comme une lecture sur la chaîne où le déplacement est en tête (dates de contrôle), **sans
 * durée de trajet** (aucune relecture) ; budget calculé.
 */
export function joursDeLApercu(
  base: BaseDeRevision,
  resultat: Extract<ResultatPatch, { ok: true }>,
  maintenant: number,
  chaineDApercu: ChaineApercu = CHAINE_APERCU,
): Day[] {
  const chaine: VersionDeChaine[] = [{ version: base.version + 1, snapshot: resultat.instantane, createdAtMs: maintenant }, ...base.chaine];
  const verification = datesDeVerification(chaine, base.timeZone);
  return resultat.instantane.days
    .filter((jour) => resultat.resultat.touchedDays.includes(jour.index))
    .map((jour) => {
      const lu = recomposerJour(jour, {
        nombreDeNuits: base.nuits,
        generating: false,
        modes: base.modes,
        verification,
        sansDurees: true,
        ...(chaineDApercu === "inversee" ? { badgeSansLieu: true } : {}),
      });
      if (!lu.ok) throw new Error("deplacement: jour d'aperçu non recomposable");
      return lu.valeur;
    });
}

// --- Cas d'usage -----------------------------------------------------------------------------------------------

/** `getMoveOptions` : un jour par jour du voyage, ses points (aucun : « complet »). Lecture seule. */
export function optionsDeDeplacement(dependances: DependancesRetouche, entree: unknown): Promise<Result<MoveOptions>> {
  return executerActionVoyage("move-options", dependances, DemandeOptionsSchema, entree, async (executeur, ctx, valeur): Promise<Issue<MoveOptions> | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    if (!(await debloque(executeur, valeur.tripId))) return refus(NON_DEBLOQUE);
    const base = await lireBaseDeRevision(executeur, ctx, valeur.tripId);
    if (base === null) return null;
    const points = pointsDe(base, valeur.stopId, configurationDe(dependances));
    if (points === null || !points.ok) return points;
    return {
      ok: true,
      value: MoveOptionsSchema.parse({
        stopId: valeur.stopId,
        days: base.snapshot.days.map((jour) => ({
          index: jour.index,
          points: points.value.filter((point) => point.day === jour.index).map((point) => ({ id: point.id, time: point.time })),
        })),
      }),
    };
  }).then(rendu);
}

/** `previewMove` : brouillon du déplacement sur la version courante, sans rien écrire ni garder. */
export function proposerDeplacement(dependances: DependancesRetouche, entree: unknown): Promise<Result<MoveDraft>> {
  return executerActionVoyage("preview-move", dependances, DemandeApercuDeplacementSchema, entree, async (executeur, ctx, valeur): Promise<Issue<MoveDraft> | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    if (!(await debloque(executeur, valeur.tripId))) return refus(NON_DEBLOQUE);
    const base = await lireBaseDeRevision(executeur, ctx, valeur.tripId);
    if (base === null) return null;
    const prepare = preparer(base, valeur, crypto.randomUUID(), configurationDe(dependances));
    if (prepare === null || !prepare.ok) return prepare;
    const { resultat } = prepare.value;
    return {
      ok: true,
      value: MoveDraftSchema.parse({
        days: joursDeLApercu(base, resultat, Date.now()),
        changes: resultat.resultat.changes,
        changedStopIds: [valeur.stopId],
        targetStopId: valeur.stopId,
      }),
    };
  }).then(rendu);
}

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_RETOUCHE, headers: new Headers(await headers()) });
};

/**
 * Rejeu d'une demande déjà écrite (même `requestId`) : la même réponse si c'est un déplacement de la même étape écrit par une
 * personne (recalculé depuis l'instantané de sa version de base : le patch stocké se rejoue tel quel), sinon `version_conflict`.
 */
async function rejeu(
  executeur: ExecuteurAction,
  ctx: AdapterContext,
  base: BaseDeRevision,
  stopId: string,
  ligne: Record<string, unknown>,
  configuration: ConfigurationMoteur,
): Promise<Issue<PatchResult>> {
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const version = typeof ligne.version === "number" ? ligne.version : Number.NaN;
  const operation = patch.success ? patch.data.operations[0] : undefined;
  if (!patch.success || ligne.author_kind !== "user" || patch.data.operations.length !== 1 || operation?.op !== "move" || operation.stopId !== stopId || !Number.isInteger(version)) {
    return conflit(base.version);
  }
  const anterieure = await lireVersion(executeur, ctx.organizationId, base.tripId, patch.data.baseVersion);
  const resultat = calcul({ ...base, snapshot: anterieure.instantane, version: patch.data.baseVersion }, patch.data, configuration);
  if (!resultat.ok) return conflit(base.version);
  return { ok: true, value: { ...resultat.resultat, version } };
}

/** `applyMove` : version `baseVersion + 1` (voir l'en-tête du module). */
export function appliquerDeplacement(dependances: DependancesRetouche, entree: unknown): Promise<Result<PatchResult>> {
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const configuration = configurationDe(dependances);
  return executerActionVoyage("apply-move", dependances, DemandeDeplacementSchema, entree, async (executeur, ctx, valeur): Promise<Issue<PatchResult> | null> => {
    const org = ctx.organizationId;
    // (d) Déblocage, avant toute relecture.
    if (!(await debloque(executeur, valeur.tripId))) return refus(NON_DEBLOQUE);
    // (e) Débit, avant toute relecture ou écriture (aucun verrou n'est encore tenu).
    const debit = await limiteur();
    if (!debit.ok) return refus(debit.error);
    // Verrous : tri, puis versions (ordre unique, 0119 § 1.6).
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const base = await lireBaseDeRevision(executeur, ctx, valeur.tripId);
    if (base === null) return null;
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeu(executeur, ctx, base, valeur.stopId, deja, configuration);
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    const derniere = Number((await executeur.query(SQL_DERNIERE_VERSION, [org, valeur.tripId])).rows[0]?.n);
    if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
    if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
    // (f) à (i).
    const prepare = preparer(base, valeur, valeur.requestId, configuration);
    if (prepare === null || !prepare.ok) return prepare;
    const { patch, resultat } = prepare.value;
    // (j) Écriture.
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
  }).then(rendu);
}
