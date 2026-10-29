import "server-only";

import { z } from "zod";

import {
  PreferenceReasonSchema,
  ProposalRecordSchema,
  StopSchema,
  TripPatchSchema,
  TripSnapshotSchema,
  type ReplacementOffer,
  type ReplacementWrite,
  type Result,
  type Stop,
  type StopSnapshot,
  type TripSnapshot,
} from "@/contracts";
import { WISH_MAX_LENGTH } from "@/contracts/values";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { executerActionVoyage, RefusAction, type DependancesAction, type ExecuteurAction } from "@/server/voyages/actions";

import { ecrireVersion, verrouillerVersions } from "./ecrire";

/**
 * Remplacer une étape sur l'adaptateur `api` (écran 14 ; tâche M1g, ticket 869 ; plan `docs/plans/mvp-etapes-1-9.md`,
 * étape 1) : par une **autre proposition déjà vérifiée du voyage** (lignes `proposals` qui ont un `placeId`, décision
 * 0136 § 3.4), en une nouvelle version (`TripPatch`, opération `replace`), annulable par une version de plus (opération
 * `revert`, PO-5). Trois cas d'usage, dans le cadre commun des actions sur un voyage (`executerActionVoyage`) :
 *
 * - `proposerRemplacement` : **lecture seule**, rien n'est écrit ni gardé (aucun aperçu côté serveur) ;
 * - `appliquerRemplacement` : recalcule la même proposition sous les verrous, puis écrit la version ;
 * - `annulerRemplacement` : recopie la version de base du remplacement (`revert`) si la version courante est encore
 *   celle du remplacement.
 *
 * **Aucun appel externe** : ni Google, ni Routes, ni modèle. Aucune donnée Google nouvelle n'est stockée : la nouvelle étape
 * reprend l'étape stockée de la proposition (`proposals.content.stop` : `placeId` et textes maison), au créneau de
 * l'étape remplacée (`start` et `end` inchangés) ; les lignes du jour (trajets, temps libre) gardent leur mode et leur
 * place, les durées restent recomposées à la lecture (lecteurs de M1a-3 inchangés). Les verrous sont pris dans l'ordre
 * fixé (verrou du tri, puis verrou des versions, 0119 § 1.6) ; un recalcul en cours refuse tout (`generation_in_progress`).
 * Le souhait saisi (`wish`) est reçu et ignoré : ni stocké, ni journalisé (F7-PO-3) ; la raison ne choisit pas encore la
 * proposition (question au Product Owner, PR 869).
 */

/** Identifiant d'étape (`Stop.id`) reçu de l'écran : borné, jamais interprété. */
const StopIdSchema = z.string().min(1).max(200);
const VersionSchema = z.number().int().positive();

export const DemandeApercuSchema = z.strictObject({
  tripId: z.string(),
  stopId: StopIdSchema,
  reason: PreferenceReasonSchema,
  wish: z.string().trim().min(1).max(WISH_MAX_LENGTH).optional(),
  baseVersion: VersionSchema,
});

export const DemandeApplicationSchema = z.strictObject({
  tripId: z.string(),
  requestId: z.uuid(),
  stopId: StopIdSchema,
  proposalId: z.uuid(),
  baseVersion: VersionSchema,
});

export const DemandeAnnulationSchema = z.strictObject({
  tripId: z.string(),
  requestId: z.uuid(),
  /** Version écrite par le remplacement à annuler. */
  version: VersionSchema,
});

// --- Fonctions pures -------------------------------------------------------------------------------------------

/** Proposition lue en base (`proposals`), contenu validé par `ProposalRecordSchema`. */
export type PropositionDuVoyage = { readonly id: string; readonly day: number; readonly stop: StopSnapshot };

type Situee = { readonly jour: number; readonly rang: number; readonly stop: StopSnapshot };

/** Étape `stop` de la ligne d'un jour, avec son jour et son rang. */
export function etapeSituee(instantane: TripSnapshot, stopId: string): Situee | undefined {
  for (const jour of instantane.days) {
    const rang = jour.items.findIndex((item) => item.type === "stop" && item.stop.id === stopId);
    const item = jour.items[rang];
    if (rang >= 0 && item?.type === "stop") return { jour: jour.index, rang, stop: item.stop };
  }
  return undefined;
}

/** `placeId` et identifiants déjà présents dans le programme (étapes, événements, idées « Surprends-moi »). */
function presents(instantane: TripSnapshot): { lieux: Set<string>; ids: Set<string> } {
  const lieux = new Set<string>();
  const ids = new Set<string>();
  const noter = (id: string, placeId: string | undefined) => {
    ids.add(id);
    if (placeId !== undefined) lieux.add(placeId);
  };
  for (const jour of instantane.days) {
    for (const item of jour.items) if (item.type === "stop") noter(item.stop.id, item.stop.placeId);
    for (const evenement of jour.events) noter(evenement.id, evenement.placeId);
    if (jour.surprise !== undefined) noter(jour.surprise.id, jour.surprise.placeId);
  }
  return { lieux, ids };
}

/** Identifiant de l'étape créée : fixé par la version de base et la proposition (le même à l'aperçu et à l'application). */
export function identifiantRemplacement(baseVersion: number, proposalId: string): string {
  return `remplacement-v${baseVersion + 1}-${proposalId.slice(0, 8)}`;
}

export type ChoixRemplacement =
  | { readonly ok: true; readonly proposition: PropositionDuVoyage; readonly etape: StopSnapshot; readonly instantane: TripSnapshot }
  | { readonly ok: false; readonly refus: "unknown_stop" | "locked_stop" | "no_option" };

/**
 * Remplace l'étape `stopId` par la première proposition compatible de `propositions` (dans l'ordre reçu), ou par
 * `proposalId` s'il est donné (application : la proposition de l'aperçu, revérifiée). Compatible : même nature
 * (`activity` ou `meal`), un `placeId`, lieu et identifiant absents du programme courant. Refus : étape inconnue (ou
 * hors de la ligne d'un jour), verrouillée, engagement (jamais remplacé par une proposition), désignée par une ligne
 * « À faire » (`etapesAFaire`, sinon la lecture échouerait sur `checklist_orphan`), ou aucune proposition compatible.
 * Fonction pure : ni le programme ni les propositions ne sont modifiés.
 */
export function choisirRemplacement(entree: {
  readonly instantane: TripSnapshot;
  readonly baseVersion: number;
  readonly stopId: string;
  readonly propositions: readonly PropositionDuVoyage[];
  readonly etapesAFaire: ReadonlySet<string>;
  readonly proposalId?: string;
}): ChoixRemplacement {
  const situee = etapeSituee(entree.instantane, entree.stopId);
  if (situee === undefined) return { ok: false, refus: "unknown_stop" };
  const ancienne = situee.stop;
  if (ancienne.locked) return { ok: false, refus: "locked_stop" };
  if (ancienne.commitment !== undefined || entree.etapesAFaire.has(ancienne.id)) return { ok: false, refus: "no_option" };
  const { lieux, ids } = presents(entree.instantane);
  const compatible = (proposition: PropositionDuVoyage) =>
    proposition.stop.kind === ancienne.kind &&
    proposition.stop.placeId !== undefined &&
    !lieux.has(proposition.stop.placeId) &&
    !ids.has(identifiantRemplacement(entree.baseVersion, proposition.id));
  const proposition =
    entree.proposalId === undefined
      ? entree.propositions.find(compatible)
      : entree.propositions.find((candidate) => candidate.id === entree.proposalId && compatible(candidate));
  if (proposition === undefined) return { ok: false, refus: "no_option" };

  // L'étape stockée de la proposition, au créneau de l'étape remplacée ; jamais verrouillée, jamais un engagement.
  const reprise: StopSnapshot = { ...proposition.stop };
  delete reprise.end;
  delete reprise.commitment;
  const etape: StopSnapshot = {
    ...reprise,
    id: identifiantRemplacement(entree.baseVersion, proposition.id),
    start: ancienne.start,
    ...(ancienne.end === undefined ? {} : { end: ancienne.end }),
    locked: false,
  };
  const instantane: TripSnapshot = {
    days: entree.instantane.days.map((jour) =>
      jour.index !== situee.jour ? jour : { ...jour, items: jour.items.map((item, rang) => (rang === situee.rang ? { type: "stop" as const, stop: etape } : item)) },
    ),
  };
  return { ok: true, proposition, etape, instantane: TripSnapshotSchema.parse(instantane) };
}

// --- Requêtes (constantes ; paramètres liés) ------------------------------------------------------------------

const SQL_COURANTE = "SELECT current_version FROM public.trips WHERE organization_id = $1 AND id = $2";
const SQL_INSTANTANE = "SELECT snapshot, patch, author_kind FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND version = $3";
const SQL_PAR_DEMANDE = "SELECT version FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND request_id = $3";
/** Un recalcul ou un voyage complet en cours (même règle que la lecture, `SQL_EN_COURS`) : aucune version n'est écrite. */
const SQL_EN_COURS = `SELECT EXISTS (SELECT 1 FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2
  AND finished_at IS NULL AND kind IN ('full', 'batch')) AS en_cours`;
const SQL_A_FAIRE = "SELECT stop_id FROM public.checklist_items WHERE organization_id = $1 AND trip_id = $2 AND stop_id IS NOT NULL";
/**
 * Propositions du voyage de même nature, hors cases vides et hors cartes écartées au tri (« Pas pour moi » non annulé) :
 * le jour de l'étape d'abord, puis les jours les plus proches ; ordre fixe (phase, position, identifiant).
 */
const SQL_PROPOSITIONS = `SELECT p.id, p.day, p.content FROM public.proposals p
  WHERE p.organization_id = $1 AND p.trip_id = $2 AND p.slot_type = 'proposal' AND p.kind = $3
    AND NOT EXISTS (SELECT 1 FROM public.preference_signals s WHERE s.organization_id = $1 AND s.trip_id = $2
      AND s.proposal_id = p.id AND s.signal = 'dislike' AND s.status <> 'cancelled')
  ORDER BY abs(p.day - $4::integer), p.day, p.phase, p.position, p.id`;

/** Donnée lue incohérente : convertie en `internal` par le cadre (journalisée sans valeur). */
class RemplacementIncoherent extends Error {
  override name = "RemplacementIncoherent";
}

const entier = (valeur: unknown): number | undefined => (typeof valeur === "number" && Number.isInteger(valeur) ? valeur : undefined);

async function versionCourante(executeur: ExecuteurAction, org: string, tripId: string): Promise<number | null> {
  const ligne = (await executeur.query(SQL_COURANTE, [org, tripId])).rows[0];
  return ligne === undefined || ligne.current_version === null ? null : (entier(ligne.current_version) ?? null);
}

async function lireVersion(executeur: ExecuteurAction, org: string, tripId: string, version: number) {
  const ligne = (await executeur.query(SQL_INSTANTANE, [org, tripId, version])).rows[0];
  const instantane = TripSnapshotSchema.safeParse(ligne?.snapshot);
  if (ligne === undefined || !instantane.success) throw new RemplacementIncoherent();
  return { instantane: instantane.data, patch: ligne.patch ?? null, auteur: ligne.author_kind };
}

async function propositionsDe(executeur: ExecuteurAction, org: string, tripId: string, stop: StopSnapshot, jour: number): Promise<PropositionDuVoyage[]> {
  const lignes = (await executeur.query(SQL_PROPOSITIONS, [org, tripId, stop.kind, jour])).rows;
  return lignes.flatMap((ligne) => {
    const contenu = ProposalRecordSchema.safeParse(ligne.content);
    const day = entier(ligne.day);
    if (!contenu.success || typeof ligne.id !== "string" || day === undefined) throw new RemplacementIncoherent();
    return [{ id: ligne.id, day, stop: contenu.data.stop }];
  });
}

async function etapesAFaire(executeur: ExecuteurAction, org: string, tripId: string): Promise<Set<string>> {
  return new Set((await executeur.query(SQL_A_FAIRE, [org, tripId])).rows.flatMap((ligne) => (typeof ligne.stop_id === "string" ? [ligne.stop_id] : [])));
}

async function refuserPendantUnRecalcul(executeur: ExecuteurAction, org: string, tripId: string): Promise<void> {
  if ((await executeur.query(SQL_EN_COURS, [org, tripId])).rows[0]?.en_cours === true) throw new RefusAction("generation_in_progress");
}

/** Calcul commun de l'aperçu et de l'application, sur la version courante (`null` : voyage sans version, `not_found`). */
async function calculer(executeur: ExecuteurAction, org: string, tripId: string, stopId: string, proposalId?: string) {
  const courante = await versionCourante(executeur, org, tripId);
  if (courante === null) return null;
  const { instantane } = await lireVersion(executeur, org, tripId, courante);
  const situee = etapeSituee(instantane, stopId);
  const propositions = situee === undefined ? [] : await propositionsDe(executeur, org, tripId, situee.stop, situee.jour);
  const choix = choisirRemplacement({
    instantane,
    baseVersion: courante,
    stopId,
    propositions,
    etapesAFaire: await etapesAFaire(executeur, org, tripId),
    ...(proposalId === undefined ? {} : { proposalId }),
  });
  return { courante, choix };
}

/** Refus d'un choix en réponse (aucune écriture) ; une étape absente du programme courant est `not_found`. */
function refusDuChoix(refus: "unknown_stop" | "locked_stop" | "no_option"): { status: "noOption" } | { status: "lockedStop" } | null {
  if (refus === "unknown_stop") return null;
  return refus === "locked_stop" ? { status: "lockedStop" } : { status: "noOption" };
}

// --- Cas d'usage -----------------------------------------------------------------------------------------------

/** `previewReplacement` : proposition et version de base, sans rien écrire ni garder. */
export function proposerRemplacement(dependances: DependancesAction, entree: unknown): Promise<Result<ReplacementOffer>> {
  return executerActionVoyage("preview-replacement", dependances, DemandeApercuSchema, entree, async (executeur, ctx, valeur): Promise<ReplacementOffer | null> => {
    await executeur.query("SET TRANSACTION READ ONLY");
    const calcul = await calculer(executeur, ctx.organizationId, valeur.tripId, valeur.stopId);
    if (calcul === null) return null;
    if (calcul.courante !== valeur.baseVersion) return { status: "conflict", currentVersion: calcul.courante };
    const { choix } = calcul;
    if (!choix.ok) return refusDuChoix(choix.refus);
    const stop: Stop = StopSchema.parse(choix.etape);
    return { status: "offer", version: calcul.courante, proposalId: choix.proposition.id, stop };
  });
}

/** `applyReplacement` : version `baseVersion + 1` (auteur `user`, patch `replace`), idempotente par `requestId`. */
export function appliquerRemplacement(dependances: DependancesAction, entree: unknown): Promise<Result<ReplacementWrite>> {
  return executerActionVoyage("apply-replacement", dependances, DemandeApplicationSchema, entree, async (executeur, ctx, valeur): Promise<ReplacementWrite | null> => {
    const org = ctx.organizationId;
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const deja = entier((await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0]?.version);
    if (deja !== undefined) return { status: "applied", version: deja };
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    const calcul = await calculer(executeur, org, valeur.tripId, valeur.stopId, valeur.proposalId);
    if (calcul === null) return null;
    if (calcul.courante !== valeur.baseVersion) return { status: "conflict", currentVersion: calcul.courante };
    const { choix } = calcul;
    if (!choix.ok) return refusDuChoix(choix.refus);
    const patch = TripPatchSchema.parse({
      requestId: valeur.requestId,
      baseVersion: calcul.courante,
      // `candidateId` porte l'identifiant de la proposition (`proposals.id`) : la chaîne inversée n'a pas de `candidates`
      // (question au Tech Lead, PR 869).
      operations: [{ op: "replace", stopId: valeur.stopId, candidateId: choix.proposition.id, newStopId: choix.etape.id }],
    });
    const ecrite = await ecrireVersion(executeur, {
      organizationId: org,
      tripId: valeur.tripId,
      requestId: valeur.requestId,
      auteur: "user",
      auteurUserId: ctx.userId,
      instantane: choix.instantane,
      patch,
    });
    return { status: "applied", version: ecrite.version };
  });
}

/**
 * `undoReplacement` : si la version courante est `version` et qu'elle est un remplacement écrit par une personne, une
 * version de plus recopie sa version de base (`revert`, rien n'est supprimé) ; sinon `conflict`, rien n'est écrit.
 */
export function annulerRemplacement(dependances: DependancesAction, entree: unknown): Promise<Result<ReplacementWrite>> {
  return executerActionVoyage("undo-replacement", dependances, DemandeAnnulationSchema, entree, async (executeur, ctx, valeur): Promise<ReplacementWrite | null> => {
    const org = ctx.organizationId;
    await executeur.query(SQL_VERROU_TRI, [valeur.tripId]);
    await verrouillerVersions(executeur, valeur.tripId);
    const deja = entier((await executeur.query(SQL_PAR_DEMANDE, [org, valeur.tripId, valeur.requestId])).rows[0]?.version);
    if (deja !== undefined) return { status: "undone", version: deja };
    await refuserPendantUnRecalcul(executeur, org, valeur.tripId);
    const courante = await versionCourante(executeur, org, valeur.tripId);
    if (courante === null) return null;
    if (courante !== valeur.version) return { status: "conflict", currentVersion: courante };
    const { patch: brut, auteur } = await lireVersion(executeur, org, valeur.tripId, courante);
    const patch = TripPatchSchema.safeParse(brut);
    const operation = patch.success ? patch.data.operations[0] : undefined;
    // Seul un remplacement d'une personne s'annule ici (la version 1, les versions du moteur et les annulations, non).
    if (!patch.success || auteur !== "user" || patch.data.operations.length !== 1 || operation?.op !== "replace") {
      return { status: "conflict", currentVersion: courante };
    }
    const base = await lireVersion(executeur, org, valeur.tripId, patch.data.baseVersion);
    const ecrite = await ecrireVersion(executeur, {
      organizationId: org,
      tripId: valeur.tripId,
      requestId: valeur.requestId,
      auteur: "user",
      auteurUserId: ctx.userId,
      instantane: base.instantane,
      patch: { requestId: valeur.requestId, baseVersion: courante, operations: [{ op: "revert", toVersion: patch.data.baseVersion }] },
    });
    return { status: "undone", version: ecrite.version };
  });
}

/** Version courante d'un voyage de l'organisation (base de la première demande d'aperçu), ou `null`. */
export function versionDuVoyage(dependances: DependancesAction, entree: unknown): Promise<Result<number>> {
  return executerActionVoyage("revision-version", dependances, z.strictObject({ tripId: z.string() }), entree, async (executeur, ctx, valeur) => {
    await executeur.query("SET TRANSACTION READ ONLY");
    return versionCourante(executeur, ctx.organizationId, valeur.tripId);
  });
}
