import "server-only";

import { z } from "zod";

import {
  MoveDraftSchema,
  MoveOptionsSchema,
  TripPatchSchema,
  type ApiError,
  type Change,
  type Day,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type MoveDraft,
  type MoveOptions,
  type PatchResult,
  type Result,
  type StopSnapshot,
  type TripPatch,
  type TripSnapshot,
} from "@/contracts";
import { lignesApresVersion, type LigneAFaire } from "@/domain/a-faire";
import type { ConfigurationMoteur } from "@/domain/configuration";
import { appliquerPatch, type ResultatPatch } from "@/domain/patch";
import { demandeDeRelectures } from "@/domain/recomposition";
import { memePoint, type DemandeRelectures, type Point, type Relectures, type SourceRelectures } from "@/domain/relectures";
import { finOccupee } from "@/domain/squelette";
import { arrondi5, versHeure, versMinutes } from "@/domain/temps";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { errorNameOf, logEvent } from "@/server/log";
import { lireDroitVoyage } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { checkRateLimit } from "@/server/rate-limit";
import { executerActionVoyage, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";
import type { VersionDeChaine } from "@/server/voyages/conversion";
import { lireBaseDeRevision, recomposerJourDeRevision, relireRevision, type BaseDeRevision } from "@/server/voyages/lecture";

import { BaseDeVersionDepassee, ecrireVersion, lireLignesAFaire, verrouillerVersions } from "./ecrire";
import { conflit, refus, type Issue } from "./issue";
import { contexteVoyage, entreeMoteurDeRevision, lireVersion, refuserPendantUnRecalcul, SQL_PAR_DEMANDE, type ContexteVoyage } from "./remplacement";
import { ACTION_LIMITEUR_RETOUCHE, erreurDuMoteur, patchDeLaPersonne, SQL_DERNIERE_VERSION } from "./retouches";

/**
 * « Déplacer une étape » sur l'adaptateur `api` (ticket 947 ; spécification `specs/M5-retouches.md` § 3 et § 14 ; décision
 * 0147 § 4, § 8, § 11, § 6.4 point 4, § 5.3 point 7 ; **décision 0153, PR #959** : le déplacement passe par le moteur
 * avec une relecture, comme le remplacement M1g et l'ajout M5d-1). Trois cas d'usage, dans le cadre commun des actions sur
 * un voyage (`src/server/voyages/actions.ts`) :
 *
 * - `optionsDeDeplacement` (`getMoveOptions`, `{ tripId, stopId }` → `MoveOptions`) : points d'insertion **proposés** par
 *   jour (`pointsDeDeplacement`), sur la version courante ; aucune relecture, rien n'est écrit. Un point n'est qu'une heure
 *   proposée : le moteur planifie et valide, à l'aperçu et à l'application (« aucune option » sinon) ;
 * - `proposerDeplacement` (`previewMove`, `{ tripId, stopId, pointId, baseVersion }` → `MoveDraft`) : patch `[move]`
 *   appliqué par le moteur (`appliquerPatch`, cas `move` : replanification des jours touchés, R1 à R9, refus `no_option`
 *   pour toute entrée bloquante nouvelle) ; jours touchés recomposés comme une lecture (durées relues, budget) ; « Ce qui
 *   change » du moteur et lignes `checklist` de la liste appelée à blanc ; rien n'est écrit ni gardé ;
 * - `appliquerDeplacement` (`applyMove`, `{ tripId, requestId, stopId, pointId, baseVersion }` → `PatchResult`) : version
 *   `baseVersion + 1`, auteur `user`, patch `[move]` (`patchDeLaPersonne`, `FORMES_PATCH_PERSONNE`), **celui que le moteur a
 *   appliqué, rejouable tel quel** (0037 B2-TL-3), idempotente par `requestId`. « Annuler » du toast est un retour à la
 *   version de base (`applyRevert`, M5b).
 *
 * **Ordre des contrôles, fixé** (celui de l'ajout M5d-1) : (a) session, (b) entrée stricte, (c) voyage dans l'organisation
 * (`not_found`) — par le cadre ; (d) déblocage (`not_unlocked`, `retryable` faux) ; (e) aperçu et application : débit
 * `retouche` par adresse IP (`rate_limited`, 0147 § 6.4 point 4), avant toute relecture ou écriture ; (f) application : rejeu
 * d'une demande déjà écrite ; (g) borne `VERSIONS_MAX_PAR_VOYAGE` (`validation_failed`, `field: "baseVersion"`) ; (h) version
 * de base (`version_conflict` avec `currentVersion`) ; (i) étape : absente, `not_found` ; verrouillée, engagement, événement
 * ou idée, `validation_failed` (`field: "stopId"`) ; point absent des points de la version courante, `no_option` ; puis,
 * **hors transaction et sans verrou**, (j) **un** appel du port de relectures de la lecture (profil `relecture`, aucun temps
 * de trajet écrit ; échec : `provider_error`, ou `cost_cap_reached` si le forfait est atteint ; rien n'est écrit) ; enfin le
 * moteur et, pour l'application, sous le verrou du tri puis celui des versions : déblocage, rejeu, recalcul en cours
 * (`generation_in_progress`), borne, version de base inchangée, moteur, écriture (`ecrireVersion`, `instantanePrecedent` :
 * une étape déplacée garde ses lignes « À faire », M5 § 7.4).
 *
 * Aucun prompt ; aucune donnée Google autre que le `placeId` déjà présent dans l'instantané.
 */

export type DependancesDeplacement = DependancesAction & {
  /** Port de relectures de la lecture (`DependancesLecture.relectures` de l'adaptateur `api`). */
  readonly relectures: SourceRelectures;
  /** Débit `retouche` par adresse IP ; `checkRateLimit` avec les en-têtes de la requête par défaut (échec fermé). */
  readonly limiteur?: () => Promise<Result<void>>;
  /** **Tests seulement** : configuration du moteur (`CONFIGURATION_MOTEUR` par défaut). */
  readonly configuration?: ConfigurationMoteur;
};

/** Identifiant d'étape et de point reçus de l'écran : bornés, jamais interprétés (le point est retrouvé côté serveur). */
const IdentifiantSchema = z.string().min(1).max(200);
const VersionSchema = z.number().int().positive();

export const DemandeOptionsSchema = z.strictObject({ tripId: z.string(), stopId: IdentifiantSchema });
export const DemandeApercuDeplacementSchema = z.strictObject({ tripId: z.string(), stopId: IdentifiantSchema, pointId: IdentifiantSchema, baseVersion: VersionSchema });
export const DemandeDeplacementSchema = DemandeApercuDeplacementSchema.extend({ requestId: z.uuid() });

// --- Fonctions pures -------------------------------------------------------------------------------------------

/** Point d'insertion proposé : identifiant opaque (rejoué tel quel par l'écran), jour et heure de début de l'étape. */
export type PointDeDeplacement = { readonly id: string; readonly day: number; readonly time: string };

export type SituationDuDeplacement =
  | { readonly type: "etape"; readonly jour: DaySnapshot; readonly stop: StopSnapshot }
  | { readonly type: "absente" }
  /** Étape verrouillée (R3), engagement, événement de `Day.events` ou idée « Surprends-moi » : jamais déplacés. */
  | { readonly type: "non_deplacable" };

/** Étape visée dans l'instantané : une étape `stop` de la ligne d'un jour, non verrouillée et sans `commitment`. */
export function situerEtapeADeplacer(instantane: TripSnapshot, stopId: string): SituationDuDeplacement {
  for (const jour of instantane.days) {
    for (const item of jour.items) {
      if (item.type !== "stop" || item.stop.id !== stopId) continue;
      return item.stop.locked || item.stop.commitment !== undefined ? { type: "non_deplacable" } : { type: "etape", jour, stop: item.stop };
    }
    if (jour.events.some((evenement) => evenement.id === stopId) || jour.surprise?.id === stopId) return { type: "non_deplacable" };
  }
  return { type: "absente" };
}

/** Identifiant opaque d'un point : jour et heure (« deplacer-j4-1545 »), unique dans le voyage. */
export function identifiantDuPoint(day: number, time: string): string {
  return `deplacer-j${day}-${time.replace(":", "")}`;
}

type Ancre = Extract<DayLineItemSnapshot, { type: "terminus" | "stop" | "openMeal" | "transfer" }>;
const estAncre = (item: DayLineItemSnapshot | undefined): item is Ancre => item !== undefined && item.type !== "segment" && item.type !== "free";
const debutDAncre = (item: Ancre): number => versMinutes(item.type === "stop" ? item.stop.start : item.type === "transfer" ? item.start : item.time);

/** Rangs des éléments datés qui entourent l'étape dans son jour (ses temps libres voisins ne sont pas des points). */
function voisinsDe(jour: DaySnapshot, stopId: string): { readonly avant: number; readonly apres: number } | undefined {
  const rang = jour.items.findIndex((item) => item.type === "stop" && item.stop.id === stopId);
  if (rang === -1) return undefined;
  const avant = jour.items.slice(0, rang).findLastIndex(estAncre);
  const apres = jour.items.slice(rang + 1).findIndex(estAncre);
  return { avant, apres: apres === -1 ? jour.items.length : rang + 1 + apres };
}

/**
 * Points d'insertion **proposés** pour une étape (aucune relecture : le moteur planifie et valide ensuite). Seule une activité
 * a des points (un repas n'en a aucun : question au Product Owner, PR 953). Point : un temps libre `[de, à]` d'un jour,
 * précédé d'un élément daté qui n'est pas un changement de ville et suivi au plus d'un trajet avant l'élément daté suivant ;
 * le temps que ce temps libre laissait au trajet (`début suivant − à`, au moins la marge), plus la marge du moteur, est réservé
 * avant et après l'étape : heure proposée `arrondi5(de + réserve)`, retenue si l'étape (durée occupée) finit au plus tard à
 * `début suivant − réserve`. Un point reste une proposition : avec les durées relues, le moteur peut le refuser (`no_option`).
 * Les temps libres voisins de l'étape dans son propre jour ne sont pas des points (F7).
 */
export function pointsDeDeplacement(
  instantane: TripSnapshot,
  stopId: string,
  configuration: ConfigurationMoteur,
): { readonly ok: true; readonly points: readonly PointDeDeplacement[] } | { readonly ok: false; readonly situation: Exclude<SituationDuDeplacement, { type: "etape" }> } {
  const situation = situerEtapeADeplacer(instantane, stopId);
  if (situation.type !== "etape") return { ok: false, situation };
  const { stop } = situation;
  if (stop.kind !== "activity") return { ok: true, points: [] };
  const duree = finOccupee(stop, configuration) - versMinutes(stop.start);
  const marge = configuration.margeMinutes;
  const points: PointDeDeplacement[] = [];
  for (const jour of instantane.days) {
    const voisins = jour.index === situation.jour.index ? voisinsDe(jour, stopId) : undefined;
    jour.items.forEach((item, rang) => {
      if (item.type !== "free") return;
      if (voisins !== undefined && rang > voisins.avant && rang < voisins.apres) return;
      const precedent = jour.items.slice(0, rang).findLast(estAncre);
      if (precedent === undefined || precedent.type === "transfer") return;
      const suite = jour.items.slice(rang + 1);
      const rangSuivant = suite.findIndex(estAncre);
      const suivant = suite.at(rangSuivant);
      if (rangSuivant === -1 || rangSuivant > 1 || !estAncre(suivant) || suite.slice(0, rangSuivant).some((i) => i.type !== "segment")) return;
      const debutSuivant = debutDAncre(suivant);
      // Le temps du trajet laissé par le temps libre, plus la marge que le moteur ajoute après chaque trajet.
      const reserve = Math.max(marge, debutSuivant - versMinutes(item.to)) + marge;
      const debut = arrondi5(versMinutes(item.from) + reserve);
      if (debut + duree + reserve > debutSuivant) return;
      const time = versHeure(debut);
      points.push({ id: identifiantDuPoint(jour.index, time), day: jour.index, time });
    });
  }
  return { ok: true, points };
}

/** Patch `[move]` d'un point, sur la version de base (celui que le moteur applique et que le serveur écrit). */
export function patchDuDeplacement(requestId: string, baseVersion: number, stopId: string, point: Pick<PointDeDeplacement, "day" | "time">): TripPatch {
  return patchDeLaPersonne({ requestId, baseVersion, operations: [{ op: "move", stopId, day: point.day, time: point.time }] });
}

/** Jours provisoires : le jour d'origine sans l'étape, le jour d'arrivée avec l'étape à l'heure du point (même ordre que le moteur). */
function joursProvisoires(instantane: TripSnapshot, stop: StopSnapshot, point: PointDeDeplacement): DaySnapshot[] {
  const debut = versMinutes(point.time);
  return instantane.days.flatMap((jour) => {
    const sans = jour.items.filter((item) => !(item.type === "stop" && item.stop.id === stop.id));
    if (jour.index !== point.day) return sans.length === jour.items.length ? [] : [{ ...jour, items: sans }];
    const rang = sans.findIndex((item) => (item.type === "terminus" ? item.role === "end" : estAncre(item) && debutDAncre(item) > debut));
    const items = [...sans];
    items.splice(rang === -1 ? items.length : rang, 0, { type: "stop", stop: { ...stop, start: point.time } });
    return [{ ...jour, items }];
  });
}

/**
 * Demande de relectures d'un déplacement : jours d'origine et d'arrivée de la base, puis les mêmes jours sans l'étape et avec
 * l'étape à l'heure du point (mêmes voisins, même ordre) : lieux, plages et couples de trajets dont le moteur a besoin pour
 * replanifier et valider ces jours, et la recomposition pour les afficher. S'y ajoutent, au jour d'arrivée, les trajets entre
 * l'étape et chaque étape à lieu qui commence avant le point, dans les deux sens : le moteur ne décale jamais une étape plus
 * tôt, mais il peut repousser une étape mobile après l'étape déplacée (posée à l'heure du point) quand elle ne tient plus avant.
 */
export function demandeDuDeplacement(base: Pick<BaseDeRevision, "snapshot" | "nuits" | "modes">, stop: StopSnapshot, point: PointDeDeplacement): DemandeRelectures {
  const touches = base.snapshot.days.filter((jour) => jour.index === point.day || jour.items.some((item) => item.type === "stop" && item.stop.id === stop.id));
  const demande = demandeDeRelectures({
    jours: [...touches, ...joursProvisoires(base.snapshot, stop, point)].map((jour) => ({ jour, mesure: true })),
    nombreDeNuits: base.nuits,
    modes: base.modes,
  });
  if (stop.placeId === undefined) return demande;
  const lieu: Point = { lieu: stop.placeId };
  const arrivee = base.snapshot.days.find((jour) => jour.index === point.day);
  const avant = (arrivee?.items ?? []).flatMap((item) =>
    item.type === "stop" && item.stop.id !== stop.id && item.stop.placeId !== undefined && versMinutes(item.stop.start) < versMinutes(point.time) ? [item.stop.placeId] : [],
  );
  const trajets = [...demande.trajets];
  for (const placeId of avant) {
    for (const [depuis, vers] of [[{ lieu: placeId }, lieu], [lieu, { lieu: placeId }]] satisfies [Point, Point][]) {
      if (!trajets.some((t) => memePoint(t.depuis, depuis) && memePoint(t.vers, vers))) trajets.push({ depuis, vers, modes: [...base.modes] });
    }
  }
  return { ...demande, trajets };
}

type EtapeSituee = { readonly day: number; readonly stop: StopSnapshot };
const etapesSituees = (instantane: TripSnapshot): Map<string, EtapeSituee> =>
  new Map(instantane.days.flatMap((j) => j.items.flatMap((i) => (i.type === "stop" ? [[i.stop.id, { day: j.index, stop: i.stop }] as const] : []))));

/** Étapes surlignées après « Appliquer » : l'étape déplacée d'abord, puis celles dont l'heure change dans les jours touchés. */
function etapesChangees(avant: TripSnapshot, apres: TripSnapshot, jours: readonly number[], cible: string): string[] {
  const anciennes = etapesSituees(avant);
  const ids = [cible];
  for (const [id, { day, stop }] of etapesSituees(apres)) {
    if (id === cible || !jours.includes(day)) continue;
    const ancienne = anciennes.get(id)?.stop;
    if (ancienne === undefined || ancienne.start !== stop.start || ancienne.end !== stop.end) ids.push(id);
  }
  return ids;
}

/** Donnée lue incohérente (étape déplacée absente des jours recomposés) : convertie en `internal`. */
class DeplacementIncoherent extends Error {
  override name = "DeplacementIncoherent";
}

/**
 * Brouillon de l'aperçu depuis le résultat du moteur : jours touchés recomposés comme une lecture sur la chaîne où la version
 * du déplacement est en tête (durées relues, dates de contrôle), changements du moteur (trajets et budget compris) et lignes
 * `checklist` de la liste appelée à blanc (0147 § 7.2 point 2 ; un déplacement garde ses lignes, M5 § 7.4).
 */
export function brouillonDuDeplacement(
  contexte: ContexteVoyage,
  resultat: Extract<ResultatPatch, { ok: true }>,
  relectures: Relectures,
  cible: string,
  maintenant: number,
  lignes: readonly LigneAFaire[],
): MoveDraft {
  const { base } = contexte;
  const chaine: VersionDeChaine[] = [{ version: base.version + 1, snapshot: resultat.instantane, createdAtMs: maintenant }, ...base.chaine];
  const jours = resultat.resultat.touchedDays;
  const days: Day[] = resultat.instantane.days.filter((j) => jours.includes(j.index)).map((jour) => recomposerJourDeRevision(base, jour, relectures, chaine));
  if (!days.some((d) => d.items.some((i) => i.type === "stop" && i.stop.id === cible))) throw new DeplacementIncoherent();
  return MoveDraftSchema.parse({
    days,
    changes: [...resultat.resultat.changes, ...lignesApresVersion(lignes, base.snapshot, resultat.instantane).changements],
    changedStopIds: etapesChangees(base.snapshot, resultat.instantane, jours, cible),
    targetStopId: cible,
  });
}

/**
 * « Ce qui change » d'un rejeu, sans relecture ni moteur : l'étape déplacée, puis les autres étapes dont le jour ou l'heure a
 * changé (`moved`, de la version de base à la version écrite), puis les lignes `checklist` de la liste appelée à blanc (comme
 * l'application). Les changements de trajet et de budget, calculés avec des durées relues, n'y sont pas.
 */
export function changementsDuRejeu(avant: TripSnapshot, apres: TripSnapshot, cible: string, lignes: readonly LigneAFaire[]): Pick<PatchResult, "touchedDays" | "changes"> {
  const anciennes = etapesSituees(avant);
  const touches = new Set<number>();
  const changes: Change[] = [];
  const nouvelles = [...etapesSituees(apres)].sort(([a], [b]) => Number(b === cible) - Number(a === cible));
  for (const [id, nouvelle] of nouvelles) {
    const ancienne = anciennes.get(id);
    if (ancienne === undefined || (ancienne.day === nouvelle.day && ancienne.stop.start === nouvelle.stop.start)) continue;
    touches.add(ancienne.day).add(nouvelle.day);
    changes.push({ type: "moved", label: nouvelle.stop.name, before: { day: ancienne.day, time: ancienne.stop.start }, after: { day: nouvelle.day, time: nouvelle.stop.start } });
  }
  return { touchedDays: [...touches].sort((a, b) => a - b), changes: [...changes, ...lignesApresVersion(lignes, avant, apres).changements] };
}

// --- Cas d'usage -----------------------------------------------------------------------------------------------

const NON_DEBLOQUE: ApiError = { code: "not_unlocked", retryable: false };
const ETAPE_REFUSEE: ApiError = { code: "validation_failed", field: "stopId" };

const configurationDe = (dependances: DependancesDeplacement): ConfigurationMoteur => dependances.configuration ?? CONFIGURATION_MOTEUR;

const limiteurParDefaut = async (): Promise<Result<void>> => {
  const { headers } = await import("next/headers");
  return checkRateLimit({ action: ACTION_LIMITEUR_RETOUCHE, headers: new Headers(await headers()) });
};

/** Points de l'étape sur un instantané, ou le refus de l'étape (`not_found` : `null`). */
function pointsDe(instantane: TripSnapshot, stopId: string, configuration: ConfigurationMoteur): Issue<readonly PointDeDeplacement[]> | null {
  const points = pointsDeDeplacement(instantane, stopId, configuration);
  if (points.ok) return { ok: true, value: points.points };
  return points.situation.type === "absente" ? null : refus(ETAPE_REFUSEE);
}

/** Résultat d'un traitement : l'issue, rendue telle quelle (refus fermé compris). */
function rendu<T>(lu: Result<Issue<T>>): Result<T> {
  if (!lu.ok) return lu;
  return lu.value.ok ? { ok: true, value: lu.value.value } : { ok: false, error: lu.value.error };
}

/** Contexte lu dans la première transaction : le voyage, l'étape, le point, ses lignes « À faire » (aperçu seulement). */
type Prepare = { readonly contexte: ContexteVoyage; readonly stop: StopSnapshot; readonly point: PointDeDeplacement; readonly lignes: readonly LigneAFaire[] };

/** Contrôles (d) à (i), dans une transaction en lecture seule ; `null` : `not_found`. Le rejeu (f) est fourni par l'application. */
async function preparer(
  executeur: ExecuteurAction,
  ctx: { readonly organizationId: string; readonly userId: string; readonly role: "owner" | "member" },
  valeur: { readonly tripId: string; readonly stopId: string; readonly pointId: string; readonly baseVersion: number },
  dependances: DependancesDeplacement,
  avecLignes: boolean,
  rejeu?: () => Promise<Issue<PatchResult> | null>,
): Promise<Issue<Prepare> | Issue<PatchResult> | null> {
  const org = ctx.organizationId;
  // (d) Déblocage, avant toute relecture.
  if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus(NON_DEBLOQUE);
  // (e) Débit, avant toute relecture ou écriture (le limiteur écrit par une autre connexion du pool ; aucun verrou tenu).
  const debit = await (dependances.limiteur ?? limiteurParDefaut)();
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
  // (i) Étape et point.
  const situation = situerEtapeADeplacer(contexte.base.snapshot, valeur.stopId);
  if (situation.type === "absente") return null;
  if (situation.type === "non_deplacable") return refus(ETAPE_REFUSEE);
  const points = pointsDe(contexte.base.snapshot, valeur.stopId, configurationDe(dependances));
  if (points === null || !points.ok) return points;
  const point = points.value.find((candidat) => candidat.id === valeur.pointId);
  if (point === undefined) return refus({ code: "no_option" });
  const lignes = avecLignes ? await lireLignesAFaire(executeur, org, valeur.tripId) : [];
  return { ok: true, value: { contexte, stop: situation.stop, point, lignes } };
}

function journaliser(nom: "preview-move" | "apply-move", erreur: unknown, tripId: string): void {
  const errorName = errorNameOf(erreur);
  logEvent("voyages.action_failed", { action: nom, ...(errorName === undefined ? {} : { errorName }), tripId }, "error");
}

/** (j) Un appel du port, hors transaction : refus du forfait → `cost_cap_reached`, toute autre panne → `provider_error`. */
async function relire(dependances: DependancesDeplacement, ctx: { readonly organizationId: string; readonly userId: string }, prepare: Prepare): Promise<Issue<Relectures>> {
  const { base } = prepare.contexte;
  try {
    return { ok: true, value: await relireRevision(dependances.relectures, ctx, base, demandeDuDeplacement(base, prepare.stop, prepare.point)) };
  } catch (erreur) {
    const raison = typeof erreur === "object" && erreur !== null ? (erreur as { reason?: unknown }).reason : undefined;
    return refus({ code: raison === "quota_reached" ? "cost_cap_reached" : "provider_error" });
  }
}

function moteur(dependances: DependancesDeplacement, contexte: ContexteVoyage, relectures: Relectures, patch: TripPatch): ResultatPatch {
  return appliquerPatch({
    moteur: entreeMoteurDeRevision(contexte, [], relectures, dependances.configuration),
    patch,
    versionCourante: contexte.base.version,
    base: contexte.base.snapshot,
  });
}

/** `getMoveOptions` : un jour par jour du voyage, ses points proposés (aucun : « complet »). Lecture seule, sans relecture. */
export function optionsDeDeplacement(dependances: DependancesDeplacement, entree: unknown): Promise<Result<MoveOptions>> {
  return executerActionVoyage("move-options", dependances, DemandeOptionsSchema, entree, async (executeur, ctx, valeur): Promise<Issue<MoveOptions> | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus(NON_DEBLOQUE);
    const base = await lireBaseDeRevision(executeur, ctx, valeur.tripId);
    if (base === null) return null;
    const points = pointsDe(base.snapshot, valeur.stopId, configurationDe(dependances));
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

/** `previewMove` : brouillon du moteur sur la version courante, sans rien écrire ni garder. */
export async function proposerDeplacement(dependances: DependancesDeplacement, entree: unknown): Promise<Result<MoveDraft>> {
  const lu = await executerActionVoyage("preview-move", dependances, DemandeApercuDeplacementSchema, entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const prepare = await preparer(executeur, ctx, valeur, dependances, true);
    return prepare === null ? null : { prepare: prepare as Issue<Prepare>, ctx, valeur };
  });
  if (!lu.ok) return lu;
  const { prepare, ctx, valeur } = lu.value;
  if (!prepare.ok) return prepare;
  const relectures = await relire(dependances, ctx, prepare.value);
  if (!relectures.ok) return relectures;
  const patch = patchDuDeplacement(crypto.randomUUID(), valeur.baseVersion, valeur.stopId, prepare.value.point);
  const resultat = moteur(dependances, prepare.value.contexte, relectures.value, patch);
  if (!resultat.ok) return refus(erreurDuMoteur(resultat));
  try {
    return { ok: true, value: brouillonDuDeplacement(prepare.value.contexte, resultat, relectures.value, valeur.stopId, Date.now(), prepare.value.lignes) };
  } catch (erreur) {
    journaliser("preview-move", erreur, valeur.tripId);
    return { ok: false, error: { code: "internal" } };
  }
}

/**
 * Rejeu d'une demande déjà écrite (même `requestId`) : la même version si c'est un déplacement `[move]` d'une personne de la
 * même étape vers le même point ; sinon `version_conflict`. « Ce qui change » : `changementsDuRejeu`, sans relecture.
 */
async function rejeuDe(
  executeur: ExecuteurAction,
  org: string,
  tripId: string,
  ligne: Record<string, unknown>,
  valeur: { readonly stopId: string; readonly pointId: string },
  courante: number,
): Promise<Issue<PatchResult>> {
  const patch = TripPatchSchema.safeParse(ligne.patch);
  const version = typeof ligne.version === "number" ? ligne.version : Number(ligne.version);
  const operation = patch.success && patch.data.operations.length === 1 ? patch.data.operations[0] : undefined;
  const meme =
    ligne.author_kind === "user" &&
    Number.isSafeInteger(version) &&
    version >= 2 &&
    operation?.op === "move" &&
    operation.stopId === valeur.stopId &&
    identifiantDuPoint(operation.day, operation.time) === valeur.pointId;
  if (!meme || !patch.success) return conflit(courante);
  const avant = await lireVersion(executeur, org, tripId, patch.data.baseVersion);
  const apres = await lireVersion(executeur, org, tripId, version);
  const lignes = await lireLignesAFaire(executeur, org, tripId);
  return { ok: true, value: { version, ...changementsDuRejeu(avant.instantane, apres.instantane, valeur.stopId, lignes) } };
}

/** `applyMove` : version `baseVersion + 1` calculée par le moteur (voir l'en-tête du module). */
export async function appliquerDeplacement(dependances: DependancesDeplacement, entree: unknown): Promise<Result<PatchResult>> {
  const derniereDe = async (executeur: ExecuteurAction, org: string, tripId: string) => Number((await executeur.query(SQL_DERNIERE_VERSION, [org, tripId])).rows[0]?.n);
  const lu = await executerActionVoyage("apply-move", dependances, DemandeDeplacementSchema, entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const rejeu = async (): Promise<Issue<PatchResult> | null> => {
      const ligne = (await executeur.query(SQL_PAR_DEMANDE, [ctx.organizationId, valeur.tripId, valeur.requestId])).rows[0];
      return ligne === undefined ? null : rejeuDe(executeur, ctx.organizationId, valeur.tripId, ligne, valeur, await derniereDe(executeur, ctx.organizationId, valeur.tripId));
    };
    const prepare = await preparer(executeur, ctx, valeur, dependances, false, rejeu);
    return prepare === null ? null : { prepare, ctx };
  });
  if (!lu.ok) return lu;
  const { prepare, ctx: session } = lu.value;
  if (!prepare.ok) return prepare;
  if (!("contexte" in prepare.value)) return prepare as Issue<PatchResult>;
  const prepareDeplacement = prepare.value;
  const relectures = await relire(dependances, session, prepareDeplacement);
  if (!relectures.ok) return relectures;

  // Écriture, sous les verrous ; la version relue doit être encore la base de la première transaction.
  const ecrit = await executerActionVoyage("apply-move", dependances, DemandeDeplacementSchema, entree, async (executeur, ctx, valeur): Promise<Issue<PatchResult> | null> => {
    const org = ctx.organizationId;
    if ((await lireDroitVoyage(executeur, valeur.tripId)) === null) return refus(NON_DEBLOQUE);
    // Verrous : tri, puis versions (ordre unique, 0119 § 1.6) ; aucun appel externe tant qu'ils sont tenus.
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const derniere = await derniereDe(executeur, org, valeur.tripId);
    if (!Number.isSafeInteger(derniere) || derniere < 1) return null;
    const deja = (await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0];
    if (deja !== undefined) return rejeuDe(executeur, org, valeur.tripId, deja, valeur, derniere);
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    if (derniere >= VERSIONS_MAX_PAR_VOYAGE) return refus({ code: "validation_failed", field: "baseVersion" });
    const { contexte, point } = prepareDeplacement;
    if (derniere !== valeur.baseVersion || derniere !== contexte.base.version) return conflit(derniere);
    const patch = patchDuDeplacement(valeur.requestId, derniere, valeur.stopId, point);
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
