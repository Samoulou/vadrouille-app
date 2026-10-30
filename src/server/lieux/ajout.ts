import "server-only";

import {
  AddPlaceApplySchema,
  AddPlaceRequestSchema,
  ApiErrorSchema,
  TripPatchSchema,
  type ApiError,
  type Day,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type PatchResult,
  type Result,
  type RevisionPreview,
  type StopSnapshot,
  type TripPatch,
  type TripSnapshot,
} from "@/contracts";
import { lignesApresVersion, type LigneAFaire } from "@/domain/a-faire";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { appliquerPatch, type ResultatPatch } from "@/domain/patch";
import { demandeDeRelectures } from "@/domain/recomposition";
import type { Relectures, SourceRelectures } from "@/domain/relectures";
import { versMinutes } from "@/domain/temps";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { errorNameOf, logEvent } from "@/server/log";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { checkRateLimit } from "@/server/rate-limit";
import { BaseDeVersionDepassee, ecrireVersion, lireLignesAFaire, verrouillerVersions } from "@/server/versions/ecrire";
import { contexteVoyage, entreeMoteurDeRevision, refuserPendantUnRecalcul, SQL_PAR_DEMANDE, type ContexteVoyage } from "@/server/versions/remplacement";
import { ACTION_LIMITEUR_RETOUCHE, erreurDuMoteur, patchDeLaPersonne, SQL_DERNIERE_VERSION } from "@/server/versions/retouches";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import type { VersionDeChaine } from "@/server/voyages/conversion";
import { recomposerJourDeRevision, relireRevision } from "@/server/voyages/lecture";

/**
 * Lieu à soi sur l'adaptateur `api` : aperçu et application d'un ajout (tâche M5d-1, ticket 939 ; décision 0147 § 3 point
 * 5, § 4, § 8, § 11, § 6.4 point 4, § 5.3 point 7 et § 12 S4 ; spécification `specs/M5-retouches.md` § 6). Le patch est
 * **`[add, lock]`** sur le même `stopId` (`ajout-<requestId>`, jamais de la forme `j<jour>-<rang>`), une seule version,
 * auteur `user` ; il est validé par `TripPatchSchema` **et** par les formes admises (`patchDeLaPersonne`, 0147 § 11).
 *
 * L'étape écrite porte le **nom saisi** (`AddPlaceRequest.name`, `texteMaison`, § 12 S4), le `placeId` du résultat choisi
 * (`resultId`, contrôlé par `PLACE_ID_MOTIF` et jamais revérifié auprès de Google, § 3 point 4), `kind`, jour et heure ; le
 * moteur la marque `addedBy: "person"` et le `lock` la verrouille. Aucun nom ni adresse Google n'atteint ce module : la
 * demande stricte n'a aucun champ pour eux (critère 21).
 *
 * **Ordre des contrôles, fixé** : (a) session, (b) entrée stricte, (c) voyage dans l'organisation (`not_found`) — par le
 * cadre ; (d) déblocage (`not_unlocked`, `retryable` faux, 0147 § 8 point 2) ; (e) débit `retouche` par adresse IP
 * (`rate_limited`, § 6.4 point 4), avant toute relecture ou écriture ; pour l'application, (f) rejeu d'une demande déjà
 * écrite (même réponse ; autre geste sous le même `requestId` : `version_conflict`) ; (g) borne `VERSIONS_MAX_PAR_VOYAGE`
 * (`validation_failed`, `field: "baseVersion"`) ; (h) version de base (`version_conflict` avec `currentVersion`) ; (i) jour
 * du voyage (`not_found`) ; puis, **hors transaction et sans verrou**, (j) **un** appel du port de relectures de la lecture
 * (0147 § 4 : profil `relecture`, aucun temps de trajet écrit ; échec : `provider_error`, ou `cost_cap_reached` si le forfait
 * est atteint) ; enfin le moteur (`no_option` : « Pas de place ce jour-là ») et, pour l'application, sous le verrou du tri
 * puis celui des versions (même ordre que M1g et M5a) : rejeu, recalcul en cours (`generation_in_progress`), borne, version
 * de base inchangée, moteur, écriture (`ecrireVersion`, `instantanePrecedent` obligatoire : la liste « À faire » suit).
 *
 * L'aperçu n'écrit rien et ne garde rien. Aucun prompt ; aucune donnée Google autre que le `placeId`.
 */

export type DependancesAjout = DependancesAction & {
  /** Port de relectures de la lecture (`DependancesLecture.relectures` de l'adaptateur `api`). */
  readonly relectures: SourceRelectures;
  /** Débit `retouche` par adresse IP ; `checkRateLimit` avec les en-têtes de la requête par défaut (échec fermé). */
  readonly limiteur?: () => Promise<Result<void>>;
  /** **Tests seulement** : configuration du moteur (`CONFIGURATION_MOTEUR` par défaut). */
  readonly configuration?: ConfigurationMoteur;
  /** **Tests seulement** : identifiant de l'aperçu (sinon `crypto.randomUUID()`). */
  readonly identifiantApercu?: () => string;
};

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_RETOUCHE, headers: new Headers(await headers()) });
};

/** Préfixe de l'identifiant de l'étape ajoutée (0147 § 3 point 5) : jamais confondu avec une étape de l'IA (`j<jour>-<rang>`). */
export const PREFIXE_ETAPE_AJOUTEE = "ajout-";

/** Identifiant de l'étape ajoutée : `ajout-<requestId>`. */
export function identifiantAjout(requestId: string): string {
  return `${PREFIXE_ETAPE_AJOUTEE}${requestId}`;
}

type DemandeAjout = { readonly day: number; readonly time: string; readonly kind: "activity" | "meal"; readonly name: string; readonly resultId: string };

/** Patch `[add, lock]` d'un ajout, sur la version de base (celui que le moteur applique et que le serveur écrit). */
export function patchDeLAjout(requestId: string, baseVersion: number, demande: DemandeAjout): TripPatch {
  const stopId = identifiantAjout(requestId);
  return patchDeLaPersonne({
    requestId,
    baseVersion,
    operations: [
      { op: "add", stopId, kind: demande.kind, day: demande.day, time: demande.time, name: demande.name, placeId: demande.resultId },
      { op: "lock", stopId },
    ],
  });
}

/**
 * Jour provisoire de la demande de relectures : le jour de base où l'étape ajoutée est posée à son heure (avant la première
 * étape qui commence après elle, ou avant le terminus de fin). Seuls l'ordre et le `placeId` comptent : la demande couvre
 * les trajets vers et depuis le lieu ajouté entre ses voisins, et ceux du jour de base.
 */
export function jourProvisoire(jour: DaySnapshot, stopId: string, demande: DemandeAjout): DaySnapshot {
  const debut = versMinutes(demande.time);
  const stop: StopSnapshot = {
    id: stopId,
    kind: demande.kind,
    placeId: demande.resultId,
    name: demande.name,
    start: demande.time,
    facts: {},
    exceptions: [],
    locked: true,
    addedBy: "person",
  };
  const rang = jour.items.findIndex((item) => (item.type === "stop" && versMinutes(item.stop.start) > debut) || (item.type === "terminus" && item.role === "end"));
  const items: DayLineItemSnapshot[] = [...jour.items];
  items.splice(rang === -1 ? items.length : rang, 0, { type: "stop", stop });
  return { ...jour, items };
}

/** Étapes surlignées après « Appliquer » : l'étape ajoutée d'abord, puis celles dont l'heure change ou qui apparaissent. */
function etapesChangees(avant: TripSnapshot, apres: TripSnapshot, jours: readonly number[], cible: string): string[] {
  const ids = [cible];
  for (const index of jours) {
    const anciennes = new Map(avant.days.find((j) => j.index === index)?.items.flatMap((i) => (i.type === "stop" ? [[i.stop.id, i.stop] as const] : [])) ?? []);
    for (const item of apres.days.find((j) => j.index === index)?.items ?? []) {
      if (item.type !== "stop" || item.stop.id === cible) continue;
      const ancienne = anciennes.get(item.stop.id);
      if (ancienne === undefined || ancienne.start !== item.stop.start || ancienne.end !== item.stop.end) ids.push(item.stop.id);
    }
  }
  return ids;
}

/** Donnée lue incohérente (étape ajoutée absente du jour recomposé) : convertie en `internal`. */
class AjoutIncoherent extends Error {
  override name = "AjoutIncoherent";
}

type Issue<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: ApiError };
const refus = (error: ApiError): Issue<never> => ({ ok: false, error: ApiErrorSchema.parse(error) });
const conflit = (currentVersion: number): Issue<never> => refus({ code: "version_conflict", retryable: true, currentVersion });

/** Contexte lu dans la première transaction : le voyage, ses lignes « À faire » (aperçu seulement). */
type Prepare = { readonly contexte: ContexteVoyage; readonly jour: DaySnapshot; readonly lignes: readonly LigneAFaire[] };

/**
 * Contrôles (d) à (i) dans une transaction en lecture seule : rend le contexte, ou un refus ; `null` : `not_found`. Le
 * rejeu (f) est cherché par l'appelant (application seulement).
 */
async function preparer(
  executeur: ExecuteurAction,
  ctx: { readonly organizationId: string; readonly userId: string; readonly role: "owner" | "member" },
  valeur: { readonly tripId: string; readonly baseVersion: number; readonly day: number },
  limiteur: () => Promise<Result<void>>,
  avecLignes: boolean,
  rejeu?: () => Promise<Issue<PatchResult> | null>,
): Promise<Issue<Prepare> | Issue<PatchResult> | null> {
  const org = ctx.organizationId;
  // (d) Déblocage, avant toute relecture.
  if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus({ code: "not_unlocked", retryable: false });
  // (e) Débit, avant toute relecture ou écriture (le limiteur écrit par une autre connexion du pool).
  const debit = await limiteur();
  if (!debit.ok) return refus(debit.error);
  // (f) Rejeu (application).
  if (rejeu !== undefined) {
    const deja = await rejeu();
    if (deja !== null) return deja;
  }
  // (g) Borne du nombre de versions.
  const derniere = Number((await executeur.query(SQL_DERNIERE_VERSION, [org, valeur.tripId])).rows[0]?.n);
  if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
  if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
  // (h) Version de base.
  const contexte = await contexteVoyage(executeur, ctx, valeur.tripId);
  if (contexte === null) return null;
  if (contexte.base.version !== valeur.baseVersion) return conflit(contexte.base.version);
  // (i) Jour du voyage.
  const jour = contexte.base.snapshot.days.find((j) => j.index === valeur.day);
  if (jour === undefined) return null;
  const lignes = avecLignes ? await lireLignesAFaire(executeur, org, valeur.tripId) : [];
  return { ok: true, value: { contexte, jour, lignes } };
}

function journaliser(nom: "preview-add-place" | "apply-add-place", erreur: unknown, tripId: string): void {
  const errorName = errorNameOf(erreur);
  logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }), tripId }, "error");
}

/** (j) Un appel du port, hors transaction : refus du forfait → `cost_cap_reached`, toute autre panne → `provider_error`. */
async function relire(
  dependances: DependancesAjout,
  ctx: { readonly organizationId: string; readonly userId: string },
  prepare: Prepare,
  stopId: string,
  demande: DemandeAjout,
): Promise<Issue<Relectures>> {
  const { base } = prepare.contexte;
  const provisoire = jourProvisoire(prepare.jour, stopId, demande);
  try {
    const relectures = await relireRevision(
      dependances.relectures,
      ctx,
      base,
      demandeDeRelectures({ jours: [{ jour: prepare.jour, mesure: true }, { jour: provisoire, mesure: true }], nombreDeNuits: base.nuits, modes: base.modes }),
    );
    return { ok: true, value: relectures };
  } catch (erreur) {
    const raison = typeof erreur === "object" && erreur !== null ? (erreur as { reason?: unknown }).reason : undefined;
    return refus({ code: raison === "quota_reached" ? "cost_cap_reached" : "provider_error" });
  }
}

function moteur(dependances: DependancesAjout, contexte: ContexteVoyage, relectures: Relectures, patch: TripPatch): ResultatPatch {
  return appliquerPatch({
    moteur: entreeMoteurDeRevision(contexte, [], relectures, dependances.configuration),
    patch,
    versionCourante: contexte.base.version,
    base: contexte.base.snapshot,
  });
}

/**
 * Aperçu `add` (`RevisionPreview`, variante `add`) : jours touchés recomposés comme une lecture (chaîne où la version de
 * l'ajout est en tête), changements du moteur et lignes `checklist` de la liste appelée à blanc (0147 § 7.2 point 2).
 */
export function apercuDeLAjout(
  contexte: ContexteVoyage,
  resultat: Extract<ResultatPatch, { ok: true }>,
  relectures: Relectures,
  cible: string,
  id: string,
  maintenant: number,
  lignes: readonly LigneAFaire[],
): RevisionPreview {
  const { base } = contexte;
  const chaine: VersionDeChaine[] = [{ version: base.version + 1, snapshot: resultat.instantane, createdAtMs: maintenant }, ...base.chaine];
  const jours = resultat.resultat.touchedDays;
  const days: Day[] = resultat.instantane.days.filter((j) => jours.includes(j.index)).map((jour) => recomposerJourDeRevision(base, jour, relectures, chaine));
  if (!days.some((d) => d.items.some((i) => i.type === "stop" && i.stop.id === cible))) throw new AjoutIncoherent();
  return {
    kind: "add",
    id,
    baseVersion: base.version,
    days,
    changes: [...resultat.resultat.changes, ...lignesApresVersion(lignes, base.snapshot, resultat.instantane).changements],
    changedStopIds: etapesChangees(base.snapshot, resultat.instantane, jours, cible),
    targetStopId: cible,
  };
}

/** `previewAddPlace` : `AddPlaceRequest` → `RevisionPreview` (`kind: "add"`), sans rien écrire ni garder. */
export async function proposerAjout(dependances: DependancesAjout, entree: unknown): Promise<Result<RevisionPreview>> {
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const lu = await executerActionVoyage("preview-add-place", dependances, AddPlaceRequestSchema, entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const prepare = await preparer(executeur, ctx, valeur, limiteur, true);
    return prepare === null ? null : { prepare: prepare as Issue<Prepare>, ctx, valeur };
  });
  if (!lu.ok) return lu;
  const { prepare, ctx, valeur } = lu.value;
  if (!prepare.ok) return prepare;
  const id = (dependances.identifiantApercu ?? (() => crypto.randomUUID()))();
  const cible = identifiantAjout(id);
  const relectures = await relire(dependances, ctx, prepare.value, cible, valeur);
  if (!relectures.ok) return relectures;
  const patch = patchDeLAjout(id, valeur.baseVersion, valeur);
  const resultat = moteur(dependances, prepare.value.contexte, relectures.value, patch);
  if (!resultat.ok) return refus(erreurDuMoteur(resultat));
  try {
    return { ok: true, value: apercuDeLAjout(prepare.value.contexte, resultat, relectures.value, cible, id, Date.now(), prepare.value.lignes) };
  } catch (erreur) {
    journaliser("preview-add-place", erreur, valeur.tripId);
    return { ok: false, error: { code: "internal" } };
  }
}

/**
 * Rejeu d'une demande déjà écrite (même `requestId`) : la même réponse si la version est bien un ajout `[add, lock]` d'une
 * personne sur l'étape `ajout-<requestId>`, au même jour, à la même heure, au même lieu et au même nom ; sinon
 * `version_conflict`. Les changements rendus sont ceux de l'ajout (étape ajoutée à son heure), sans relecture.
 */
function rejeuDe(ligne: Record<string, unknown>, valeur: { readonly requestId: string } & DemandeAjout, courante: number): Issue<PatchResult> {
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const version = typeof ligne.version === "number" ? ligne.version : Number(ligne.version);
  const [ajout, verrou] = patch.success ? patch.data.operations : [];
  const stopId = identifiantAjout(valeur.requestId);
  const meme =
    patch.success &&
    ligne.author_kind === "user" &&
    Number.isSafeInteger(version) &&
    version >= 2 &&
    patch.data.operations.length === 2 &&
    ajout?.op === "add" &&
    verrou?.op === "lock" &&
    ajout.stopId === stopId &&
    verrou.stopId === stopId &&
    ajout.day === valeur.day &&
    ajout.time === valeur.time &&
    ajout.kind === valeur.kind &&
    ajout.name === valeur.name &&
    ajout.placeId === valeur.resultId;
  if (!meme) return conflit(courante);
  return { ok: true, value: { version, touchedDays: [valeur.day], changes: [{ type: "added", time: valeur.time, label: valeur.name }] } };
}

/**
 * `applyAddPlace` : `AddPlaceApply` → `PatchResult`, version `baseVersion + 1` (auteur `user`, patch `[add, lock]`),
 * idempotente par `requestId`.
 */
export async function appliquerAjout(dependances: DependancesAjout, entree: unknown): Promise<Result<PatchResult>> {
  const limiteur = dependances.limiteur ?? limiteurParDefaut;
  const versionDe = async (executeur: ExecuteurAction, org: string, tripId: string) => Number((await executeur.query(SQL_DERNIERE_VERSION, [org, tripId])).rows[0]?.n);
  const lu = await executerActionVoyage("apply-add-place", dependances, AddPlaceApplySchema, entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const rejeu = async (): Promise<Issue<PatchResult> | null> => {
      const ligne = (await executeur.query(SQL_PAR_DEMANDE, [ctx.organizationId, valeur.tripId, valeur.requestId])).rows[0];
      return ligne === undefined ? null : rejeuDe(ligne, valeur, await versionDe(executeur, ctx.organizationId, valeur.tripId));
    };
    const prepare = await preparer(executeur, ctx, valeur, limiteur, false, rejeu);
    return prepare === null ? null : { prepare, ctx, valeur };
  });
  if (!lu.ok) return lu;
  const { prepare, ctx: session, valeur: demande } = lu.value;
  if (!prepare.ok) return prepare;
  if (!("contexte" in prepare.value)) return prepare as Issue<PatchResult>;
  const prepareAjout = prepare.value;
  const cible = identifiantAjout(demande.requestId);
  const relectures = await relire(dependances, session, prepareAjout, cible, demande);
  if (!relectures.ok) return relectures;

  // Écriture, sous les verrous ; la version relue doit être encore la base de la première transaction.
  const ecrit = await executerActionVoyage("apply-add-place", dependances, AddPlaceApplySchema, entree, async (executeur, ctx, valeur): Promise<Issue<PatchResult> | null> => {
    const org = ctx.organizationId;
    if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus({ code: "not_unlocked", retryable: false });
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const derniere = await versionDe(executeur, org, valeur.tripId);
    if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeuDe(deja, valeur, derniere);
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
    const { contexte } = prepareAjout;
    if (derniere !== valeur.baseVersion || derniere !== contexte.base.version) return conflit(derniere);
    const patch = patchDeLAjout(valeur.requestId, derniere, valeur);
    const resultat = moteur(dependances, contexte, relectures.value, patch);
    if (!resultat.ok) return refus(erreurDuMoteur(resultat));
    try {
      const ecrite = await ecrireVersion(executeur, {
        organizationId: org,
        tripId: valeur.tripId,
        requestId: valeur.requestId,
        auteur: "user",
        auteurUserId: ctx.userId,
        instantane: resultat.instantane,
        instantanePrecedent: contexte.base.snapshot,
        patch,
      });
      return { ok: true, value: { ...resultat.resultat, version: ecrite.version, changes: [...resultat.resultat.changes, ...(ecrite.aFaire?.changements ?? [])] } };
    } catch (erreur) {
      if (erreur instanceof BaseDeVersionDepassee) return conflit(derniere);
      throw erreur;
    }
  });
  if (!ecrit.ok) return ecrit;
  return ecrit.value;
}
