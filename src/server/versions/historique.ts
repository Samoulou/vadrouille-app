import "server-only";

import type { AdapterContext } from "@/adapters/types";
import {
  PatchResultSchema,
  RevertApplySchema,
  RevertPreviewRequestSchema,
  RevertPreviewSchema,
  TripPatchSchema,
  TripVersionPageSchema,
  TripVersionsRequestSchema,
  TripVersionSummarySchema,
  type ApiError,
  type PatchResult,
  type Result,
  type RevertPreview,
  type TripPatch,
  type TripSnapshot,
  type TripVersionKind,
  type TripVersionPage,
  type TripVersionSummary,
} from "@/contracts";
import { TRIP_VERSIONS_PAGE_SIZE } from "@/contracts/values";
import { lignesApresVersion } from "@/domain/a-faire";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { appliquerPatch, type ResultatPatch } from "@/domain/patch";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { checkRateLimit } from "@/server/rate-limit";
import { executerActionVoyage, type ExecuteurAction } from "@/server/voyages/actions";

import { BaseDeVersionDepassee, ecrireVersion, lireLignesAFaire, verrouillerVersions } from "./ecrire";
import { conflit, refus, type Issue } from "./issue";
import { contexteVoyage, entreeMoteurDeRevision, lireVersion, refuserPendantUnRecalcul, RELECTURES_INCONNUES, SQL_PAR_DEMANDE, versionCourante, type ContexteVoyage } from "./remplacement";
import { ACTION_LIMITEUR_RETOUCHE, erreurDuMoteur, patchDeLaPersonne, SQL_DERNIERE_VERSION, type DependancesRetouche } from "./retouches";

/**
 * Versions du programme et retour à une version sur l'adaptateur `api` (tâche M5b, ticket 934 ; spécification
 * `specs/M5-retouches.md` § 4 ; décision 0147 § 5.3, § 8 et § 6.4 point 4). Trois cas d'usage, dans le cadre commun des
 * actions sur un voyage (`src/server/voyages/actions.ts`) :
 *
 * - `listerVersions` (`listTripVersions`) : 20 versions par page, de la plus récente à la plus ancienne, `before`
 *   exclusif. La lecture n'extrait des instantanés que les noms utiles au libellé (chemins JSON sur `snapshot`) : jamais un
 *   instantané ni une journée au navigateur. Sorte d'une version : la première opération de son patch (retouche de la
 *   personne ; `[add, lock]` donne `added`), sinon l'exécution qui l'a écrite (`generation_runs` : `preview` donne
 *   `prepared`, `batch` donne `adjusted`, `full` donne `complete`). Aucune colonne nouvelle.
 * - `proposerRetour` (`previewRevert`) : `appliquerPatch` sur `[revert]` **à blanc** (relectures vides : aucun appel
 *   Google ni Routes, aucune ligne `segment`), plus les lignes `checklist` de `lignesApresVersion` à blanc (0147 § 7.2
 *   point 2) ; rien n'est écrit. `currentHasLockedStop` fait afficher « Ce retour peut toucher des étapes verrouillées. ».
 * - `appliquerRetour` (`applyRevert`) : version `baseVersion + 1`, auteur `user`, patch `[revert]` (copie identique de la
 *   version visée, `ecrireVersion` suit la liste « À faire »), idempotente par `requestId`. « Annuler » du toast d'un
 *   retour en est un aussi, ordinaire : vers la version d'avant le retour, toujours écrite après le déblocage.
 *
 * **Règle « Après le déblocage »** (M5-PO-6, 0147 § 5.3 point 4) : une version est proposée au retour si et seulement si
 * `trip_versions.created_at >= entitlements.granted_at` du droit `tripUnlocked` du voyage et qu'elle n'est pas la version
 * courante. Le serveur refuse un retour vers toute autre version : `validation_failed`, `field: "toVersion"`.
 *
 * **Ordre des contrôles, fixé** (celui de M5a, `./retouches.ts`) : (a) session, (b) entrée stricte, (c) voyage dans
 * l'organisation (`not_found`) — par le cadre ; (d) déblocage (`not_unlocked`, `retryable` faux, sans rien relire ;
 * 0147 § 8 point 2) ; (e) débit `retouche` par adresse IP (`rate_limited`) ; puis la lecture. Pour l'application, sous le
 * verrou du tri puis celui des versions : (f) rejeu (même réponse ; autre geste sous le même `requestId` :
 * `version_conflict`) ; (g) recalcul en cours (`generation_in_progress`) ; (h) borne `VERSIONS_MAX_PAR_VOYAGE`
 * (`validation_failed`, `field: "baseVersion"`) ; (i) version de base (`version_conflict` avec `currentVersion`) ;
 * (j) version visée proposée au retour (`validation_failed`, `field: "toVersion"`) ; (k) moteur ; (l) écriture. L'aperçu
 * suit (d), (e), (i), (j), (k), sans verrou ni borne (il n'écrit rien).
 *
 * Aucun prompt, aucune donnée Google : seuls des numéros de version et les noms maison des instantanés (`Stop.name`)
 * circulent.
 */

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

/** Nom d'une étape `stop` d'un instantané, par son identifiant (`$id`). */
const CHEMIN_NOM = `'$.days[*].items[*] ? (@.type == "stop" && @.stop.id == $id).stop.name'`;
/** Numéro du jour qui porte l'étape `$id`. */
const CHEMIN_JOUR = `'$.days[*] ? (exists (@.items[*] ? (@.type == "stop" && @.stop.id == $id))).index'`;

/**
 * Page de la liste : métadonnées et noms seulement. `apres_deblocage` : version écrite au plus tôt à l'instant du droit
 * `tripUnlocked` (nul sans droit) ; `execution` : sorte de l'exécution qui a écrit une version sans patch (celle dont
 * `last_version` est la version, sinon la dernière commencée avant elle).
 */
export const SQL_PAGE_VERSIONS = `SELECT v.version, v.created_at, v.patch -> 'operations' -> 0 AS operation,
    jsonb_path_query_first(v.snapshot, ${CHEMIN_NOM},
      jsonb_build_object('id', COALESCE(v.patch -> 'operations' -> 0 ->> 'newStopId', v.patch -> 'operations' -> 0 ->> 'stopId'))) #>> '{}' AS sujet,
    jsonb_path_query_first(v.snapshot, ${CHEMIN_JOUR}, jsonb_build_object('id', v.patch -> 'operations' -> 0 ->> 'stopId')) #>> '{}' AS jour,
    (SELECT jsonb_path_query_first(p.snapshot, ${CHEMIN_NOM}, jsonb_build_object('id', v.patch -> 'operations' -> 0 ->> 'stopId')) #>> '{}'
       FROM public.trip_versions p
       WHERE p.organization_id = v.organization_id AND p.trip_id = v.trip_id AND p.version = v.parent_version
         AND v.patch -> 'operations' -> 0 ->> 'op' = 'replace') AS ancien,
    (SELECT r.created_at FROM public.trip_versions r
       WHERE r.organization_id = v.organization_id AND r.trip_id = v.trip_id AND v.patch -> 'operations' -> 0 ->> 'op' = 'revert'
         AND r.version = (v.patch -> 'operations' -> 0 ->> 'toVersion')::integer) AS retour_du,
    (SELECT g.kind FROM public.generation_runs g
       WHERE v.patch IS NULL AND g.organization_id = v.organization_id AND g.trip_id = v.trip_id
         AND (g.last_version = v.version OR g.started_at <= v.created_at)
       ORDER BY (g.last_version IS NOT DISTINCT FROM v.version) DESC, g.started_at DESC LIMIT 1) AS execution,
    (v.created_at >= e.granted_at) AS apres_deblocage
  FROM public.trip_versions v
  LEFT JOIN public.entitlements e ON e.organization_id = v.organization_id AND e.trip_id = v.trip_id AND e.kind = 'tripUnlocked'
  WHERE v.organization_id = $1 AND v.trip_id = $2 AND ($3::integer IS NULL OR v.version < $3::integer)
  ORDER BY v.version DESC LIMIT $4`;

/** Version visée proposée au retour, hors version courante : écrite au plus tôt à l'instant du droit `tripUnlocked`. */
export const SQL_APRES_DEBLOCAGE = `SELECT (v.created_at >= e.granted_at) AS apres
  FROM public.trip_versions v
  JOIN public.entitlements e ON e.organization_id = v.organization_id AND e.trip_id = v.trip_id AND e.kind = 'tripUnlocked'
  WHERE v.organization_id = $1 AND v.trip_id = $2 AND v.version = $3`;

// --- Fonctions pures --------------------------------------------------------------------------------------------

/** Ligne de version lue incohérente (nom absent, opération inconnue) : `internal` par le cadre, sans valeur. */
export class VersionIllisible extends Error {
  override name = "VersionIllisible";
}

const SORTE_DE_L_EXECUTION: Readonly<Record<string, TripVersionKind>> = { preview: "prepared", batch: "adjusted", full: "complete" };
const SORTE_DE_L_OPERATION: Readonly<Record<string, TripVersionKind>> = {
  replace: "replaced",
  add: "added",
  move: "moved",
  lock: "locked",
  unlock: "unlocked",
  revert: "reverted",
};

const instant = (valeur: unknown): string | undefined => {
  if (valeur instanceof Date) return Number.isNaN(valeur.getTime()) ? undefined : valeur.toISOString();
  if (typeof valeur !== "string") return undefined;
  const date = new Date(valeur);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};
const texteNonVide = (valeur: unknown): string | undefined => (typeof valeur === "string" && valeur.length > 0 ? valeur : undefined);
const entierLu = (valeur: unknown): number | undefined => {
  const nombre = typeof valeur === "string" ? Number(valeur) : valeur;
  return typeof nombre === "number" && Number.isSafeInteger(nombre) ? nombre : undefined;
};

/**
 * Ligne de la liste depuis une ligne de `SQL_PAGE_VERSIONS` (0147 § 5.3 point 1). Sans patch : sorte de l'exécution, et à
 * défaut `prepared` pour la version 1, `complete` sinon (version d'un workflow dont l'exécution n'est plus lisible).
 * Validée par `TripVersionSummarySchema` ; une ligne incohérente lève `VersionIllisible`.
 */
export function resumeDeVersion(ligne: Record<string, unknown>, courante: number): TripVersionSummary {
  const version = entierLu(ligne.version);
  const createdAt = instant(ligne.created_at);
  if (version === undefined || createdAt === undefined) throw new VersionIllisible();
  const operation = ligne.operation as { op?: unknown; toVersion?: unknown } | null | undefined;
  const current = version === courante;
  const base = { version, createdAt, revertible: !current && ligne.apres_deblocage === true, current };
  let resume: unknown;
  if (operation === null || operation === undefined) {
    const execution = typeof ligne.execution === "string" ? SORTE_DE_L_EXECUTION[ligne.execution] : undefined;
    resume = { ...base, kind: execution ?? (version === 1 ? "prepared" : "complete") };
  } else {
    const kind = typeof operation.op === "string" && Object.hasOwn(SORTE_DE_L_OPERATION, operation.op) ? SORTE_DE_L_OPERATION[operation.op] : undefined;
    const subject = texteNonVide(ligne.sujet);
    switch (kind) {
      case "replaced":
        resume = { ...base, kind, subject, previous: texteNonVide(ligne.ancien) };
        break;
      case "moved":
        resume = { ...base, kind, subject, day: entierLu(ligne.jour) };
        break;
      case "added":
      case "locked":
      case "unlocked":
        resume = { ...base, kind, subject };
        break;
      case "reverted": {
        const vers = entierLu(operation.toVersion);
        const date = instant(ligne.retour_du);
        resume = { ...base, kind, revertedTo: vers === undefined || date === undefined ? undefined : { version: vers, createdAt: date } };
        break;
      }
      default:
        throw new VersionIllisible();
    }
  }
  const lu = TripVersionSummarySchema.safeParse(resume);
  if (!lu.success) throw new VersionIllisible();
  return lu.data;
}

/** Vrai si l'instantané a au moins une étape verrouillée (phrase « Ce retour peut toucher des étapes verrouillées. »). */
export function aUneEtapeVerrouillee(instantane: TripSnapshot): boolean {
  return instantane.days.some((jour) => jour.items.some((item) => item.type === "stop" && item.stop.locked));
}

/** Patch d'un retour : `[revert]` seul, sur la version de base (forme admise de 0147 § 11). */
export function patchDuRetour(requestId: string, baseVersion: number, toVersion: number): TripPatch {
  return patchDeLaPersonne({ requestId, baseVersion, operations: [{ op: "revert", toVersion }] });
}

/**
 * Moteur d'un retour : recopie de `cible`, relectures vides (aucune replanification, aucun appel ; 0147 § 5.2 point 5).
 * Partagé avec l'annulation d'un ajout (`src/server/lieux/annulation.ts`, M5d-6).
 */
export function moteurDuRetour(contexte: ContexteVoyage, patch: TripPatch, base: TripSnapshot, cible: TripSnapshot, configuration?: ConfigurationMoteur): ResultatPatch {
  const operation = patch.operations[0];
  const toVersion = operation?.op === "revert" ? operation.toVersion : 0;
  return appliquerPatch({
    moteur: entreeMoteurDeRevision(contexte, [], RELECTURES_INCONNUES, configuration),
    patch,
    versionCourante: patch.baseVersion,
    base,
    versionsAnterieures: new Map([[toVersion, cible]]),
  });
}

// --- Cas d'usage -----------------------------------------------------------------------------------------------

const versionNonProposee: ApiError = { code: "validation_failed", field: "toVersion" };

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_RETOUCHE, headers: new Headers(await headers()) });
};

/** (d) et (e) : voyage débloqué, puis débit `retouche` ; `null` si tout passe. */
async function controlerDeblocageEtDebit(executeur: ExecuteurAction, dependances: DependancesRetouche, tripId: string): Promise<Issue<never> | null> {
  // Lecture partagée avec B4a et M5a (`lireDroitVoyage`) : organisation de la transaction par la RLS.
  if ((await lireDroitVoyage(executeur, tripId)) === null) return refus({ code: "not_unlocked", retryable: false });
  // Le limiteur écrit par une autre connexion du pool ; aucun verrou n'est encore tenu.
  const debit = await (dependances.limiteur ?? limiteurParDefaut)();
  return debit.ok ? null : refus(debit.error);
}

/** (j) : version visée existante, antérieure à la base, écrite après le déblocage. */
async function versionProposee(executeur: ExecuteurAction, org: string, tripId: string, toVersion: number, baseVersion: number): Promise<boolean> {
  if (toVersion >= baseVersion) return false;
  return (await executeur.query(SQL_APRES_DEBLOCAGE, [org, tripId, toVersion])).rows[0]?.apres === true;
}

const deIssue = <T>(lu: Result<Issue<T>>): Result<T> => (lu.ok ? (lu.value.ok ? { ok: true, value: lu.value.value } : { ok: false, error: lu.value.error }) : lu);

/** `listTripVersions` : `{ tripId, before? }` → `TripVersionPage` (voir l'en-tête du module). */
export async function listerVersions(dependances: DependancesRetouche, entree: unknown): Promise<Result<TripVersionPage>> {
  const lu = await executerActionVoyage("list-versions", dependances, TripVersionsRequestSchema, entree, async (executeur, ctx, valeur): Promise<Issue<TripVersionPage> | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const bloque = await controlerDeblocageEtDebit(executeur, dependances, valeur.tripId);
    if (bloque !== null) return bloque;
    const courante = await versionCourante(executeur, ctx.organizationId, valeur.tripId);
    if (courante === null) return null;
    const lignes = (await executeur.query(SQL_PAGE_VERSIONS, [ctx.organizationId, valeur.tripId, valeur.before ?? null, TRIP_VERSIONS_PAGE_SIZE + 1])).rows;
    const items = lignes.slice(0, TRIP_VERSIONS_PAGE_SIZE).map((ligne) => resumeDeVersion(ligne, courante));
    const nextBefore = lignes.length > TRIP_VERSIONS_PAGE_SIZE ? (items.at(-1)?.version ?? null) : null;
    return { ok: true, value: TripVersionPageSchema.parse({ items, nextBefore }) };
  });
  return deIssue(lu);
}

/** `previewRevert` : `{ tripId, baseVersion, toVersion }` → `RevertPreview`, sans rien écrire. */
export async function proposerRetour(dependances: DependancesRetouche, entree: unknown): Promise<Result<RevertPreview>> {
  const lu = await executerActionVoyage("preview-revert", dependances, RevertPreviewRequestSchema, entree, async (executeur, ctx, valeur): Promise<Issue<RevertPreview> | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const bloque = await controlerDeblocageEtDebit(executeur, dependances, valeur.tripId);
    if (bloque !== null) return bloque;
    const org = ctx.organizationId;
    const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
    if (contexte === null) return null;
    const { base } = contexte;
    if (base.version !== valeur.baseVersion) return conflit(base.version);
    if (!(await versionProposee(executeur, org, valeur.tripId, valeur.toVersion, base.version))) return refus(versionNonProposee);
    const cible = await lireVersion(executeur, org, valeur.tripId, valeur.toVersion);
    // `requestId` jetable : l'aperçu n'écrit rien (le patch n'est jamais stocké).
    const patch = patchDuRetour(crypto.randomUUID(), base.version, valeur.toVersion);
    const resultat = moteurDuRetour(contexte, patch, base.snapshot, cible.instantane, dependances.configuration);
    if (!resultat.ok) return refus(erreurDuMoteur(resultat));
    // Lignes `checklist` de « Ce qui change » : la fonction de la liste à blanc, sur les lignes du voyage (0147 § 7.2 point 2).
    const lignes = await lireLignesAFaire(executeur, org, valeur.tripId);
    const changes = [...resultat.resultat.changes, ...lignesApresVersion(lignes, base.snapshot, resultat.instantane).changements];
    return {
      ok: true,
      value: RevertPreviewSchema.parse({ baseVersion: base.version, toVersion: valeur.toVersion, changes, currentHasLockedStop: aUneEtapeVerrouillee(base.snapshot) }),
    };
  });
  return deIssue(lu);
}

/**
 * Rejeu d'un retour déjà écrit (même `requestId`) : la même réponse si c'est bien un retour d'une personne vers la même
 * version (recalculée par le moteur depuis les instantanés stockés), sinon `version_conflict`.
 */
async function rejeuDuRetour(
  executeur: ExecuteurAction,
  dependances: DependancesRetouche,
  ctx: AdapterContext,
  tripId: string,
  toVersion: number,
  ligne: Record<string, unknown>,
): Promise<Issue<PatchResult> | null> {
  const contexte = await contexteVoyage(executeur, ctx, tripId);
  if (contexte === null) return null;
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const operation = patch.success ? patch.data.operations[0] : undefined;
  const version = entierLu(ligne.version);
  if (!patch.success || ligne.author_kind !== "user" || patch.data.operations.length !== 1 || operation?.op !== "revert" || operation.toVersion !== toVersion || version === undefined) {
    return conflit(contexte.base.version);
  }
  const base = await lireVersion(executeur, ctx.organizationId, tripId, patch.data.baseVersion);
  const cible = await lireVersion(executeur, ctx.organizationId, tripId, toVersion);
  const resultat = moteurDuRetour(contexte, patch.data, base.instantane, cible.instantane, dependances.configuration);
  if (!resultat.ok) return conflit(contexte.base.version);
  return { ok: true, value: PatchResultSchema.parse({ ...resultat.resultat, version }) };
}

/** `applyRevert` : `{ tripId, requestId, baseVersion, toVersion }` → `PatchResult` (version nouvelle, « Ce qui change »). */
export async function appliquerRetour(dependances: DependancesRetouche, entree: unknown): Promise<Result<PatchResult>> {
  const lu = await executerActionVoyage("apply-revert", dependances, RevertApplySchema, entree, async (executeur, ctx, valeur): Promise<Issue<PatchResult> | null> => {
    const org = ctx.organizationId;
    const bloque = await controlerDeblocageEtDebit(executeur, dependances, valeur.tripId);
    if (bloque !== null) return bloque;
    // Verrous : tri, puis versions (ordre unique, 0119 § 1.6) ; aucun appel externe tant qu'ils sont tenus.
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    // (f) Rejeu.
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeuDuRetour(executeur, dependances, ctx, valeur.tripId, valeur.toVersion, deja);
    // (g) Recalcul en cours.
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    // (h) Borne du nombre de versions (0147 § 5.3 point 7).
    const derniere = Number((await executeur.query(SQL_DERNIERE_VERSION, [org, valeur.tripId])).rows[0]?.n);
    if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
    if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
    // (i) Version de base.
    const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
    if (contexte === null) return null;
    const { base } = contexte;
    if (base.version !== valeur.baseVersion) return conflit(base.version);
    // (j) Version visée proposée au retour (règle « Après le déblocage »).
    if (!(await versionProposee(executeur, org, valeur.tripId, valeur.toVersion, base.version))) return refus(versionNonProposee);
    const cible = await lireVersion(executeur, org, valeur.tripId, valeur.toVersion);
    // (k) Moteur : recopie de la version visée, sans replanification ni relecture.
    const patch = patchDuRetour(valeur.requestId, base.version, valeur.toVersion);
    const resultat = moteurDuRetour(contexte, patch, base.snapshot, cible.instantane, dependances.configuration);
    if (!resultat.ok) return refus(erreurDuMoteur(resultat));
    // (l) Écriture : la liste « À faire » suit dans la même transaction (0147 § 7.2).
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
      return {
        ok: true,
        value: PatchResultSchema.parse({ ...resultat.resultat, version: ecrite.version, changes: [...resultat.resultat.changes, ...(ecrite.aFaire?.changements ?? [])] }),
      };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return conflit(base.version);
      throw erreur;
    }
  });
  return deIssue(lu);
}
