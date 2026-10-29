import { z } from "zod";

import { PreferenceReasonSchema } from "./deck";
import { ChangeSchema, DaySchema, StopSchema, TimeSchema } from "./trip";
import { WISH_MAX_LENGTH } from "./values";

/**
 * Contrats de phase 0 de la révision unitaire (spécification F7, F7-TL-1 ; décision 0016 § 4). Objets stricts ;
 * noms alignés sur le handover back-end, pour que B11 les étende sans les renommer. F7a crée la demande de
 * remplacement, l'aperçu et le jeu simulé de remplacement ; F7b et F7c ajoutent leurs demandes et options.
 *
 * Aucune demande ne porte de nom de lieu Google, de `placeId` ni de donnée de lieu (CONTEXT.md, principe
 * technique 2) : seul l'identifiant interne de l'étape, le code de raison, le souhait saisi et la version.
 */

const IdSchema = z.string().min(1);

/**
 * Demande de remplacement (0016 § 4.1). `wish` : saisie de la personne, espaces retirés aux extrémités,
 * 200 caractères au plus, absent s'il est vide. Ni stocké côté client, ni mesuré (F7-PO-3).
 */
export const ReplacementRequestSchema = z.strictObject({
  stopId: IdSchema,
  reason: PreferenceReasonSchema,
  wish: z.string().trim().min(1).max(WISH_MAX_LENGTH).optional(),
  baseVersion: z.number().int().nonnegative(),
});
export type ReplacementRequest = z.infer<typeof ReplacementRequestSchema>;

/**
 * Demande de déplacement (0016 § 4.1, F7b) : l'étape et le point d'insertion choisi parmi ceux de `MoveOptions`.
 * Ni nom, ni `placeId`, ni heure saisie : le point est un identifiant opaque.
 */
export const MoveRequestSchema = z.strictObject({
  stopId: IdSchema,
  pointId: IdSchema,
  baseVersion: z.number().int().nonnegative(),
});
export type MoveRequest = z.infer<typeof MoveRequestSchema>;

/** Point d'insertion d'un jour : identifiant opaque et heure d'arrivée (« Placer ici, vers {heure} »). */
const MovePointSchema = z.strictObject({ id: IdSchema, time: TimeSchema });

/**
 * Jours et points d'insertion possibles pour déplacer une étape (0016 § 4.3, F7b) : un jour sans point est
 * « complet ». Lus une fois à l'ouverture de la feuille « Déplacer » (décision 0019 § 1.2).
 */
export const MoveOptionsSchema = z.strictObject({
  stopId: IdSchema,
  days: z
    .array(z.strictObject({ index: z.number().int().positive(), points: z.array(MovePointSchema) }))
    .refine((days) => new Set(days.map((day) => day.index)).size === days.length, { message: "days : jours distincts" })
    .refine((days) => {
      const ids = days.flatMap((day) => day.points.map((point) => point.id));
      return new Set(ids).size === ids.length;
    }, { message: "points : identifiants distincts" }),
});
export type MoveOptions = z.infer<typeof MoveOptionsSchema>;

interface DraftShape {
  days: readonly { index: number; items: readonly ({ type: "stop"; stop: { id: string; commitment?: unknown } } | { type: string })[] }[];
  changedStopIds: readonly string[];
  targetStopId: string;
  proposal?: { id: string };
}

/**
 * Raffinements d'un brouillon et d'un aperçu (0016 § 4.2) : jours distincts ; `changedStopIds` et `targetStopId`
 * désignent une étape de `days` ; une révision ne crée ni ne touche aucun engagement (0015 § 9) : ni l'étape visée ni
 * une étape changée n'en porte, une étape intacte du jour garde le sien (décision 0145 § 2) ; la proposition d'un
 * remplacement est l'étape visée.
 */
function refineDraft(draft: DraftShape, ctx: z.RefinementCtx): void {
  const indexes = draft.days.map((day) => day.index);
  if (new Set(indexes).size !== indexes.length) {
    ctx.addIssue({ code: "custom", message: "days : jours distincts", path: ["days"] });
  }
  const stops = draft.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" && "stop" in item ? [item.stop] : [])));
  const ids = new Set(stops.map((stop) => stop.id));
  draft.changedStopIds.forEach((id, index) => {
    if (!ids.has(id)) ctx.addIssue({ code: "custom", message: "changedStopIds : étape absente de days", path: ["changedStopIds", index] });
  });
  if (!ids.has(draft.targetStopId)) {
    ctx.addIssue({ code: "custom", message: "targetStopId : étape absente de days", path: ["targetStopId"] });
  }
  const touchees = new Set([draft.targetStopId, ...draft.changedStopIds]);
  if (stops.some((stop) => touchees.has(stop.id) && stop.commitment !== undefined)) {
    ctx.addIssue({ code: "custom", message: "une révision ne crée ni ne touche d'engagement (commitment interdit sur l'étape visée et les étapes changées)", path: ["days"] });
  }
  if (draft.proposal && draft.proposal.id !== draft.targetStopId) {
    ctx.addIssue({ code: "custom", message: "remplacement : targetStopId === proposal.id", path: ["targetStopId"] });
  }
}

/** Champs d'un brouillon de remplacement, sans identifiant ni version (base non raffinée). */
const ReplacementDraftBaseSchema = z.strictObject({
  /** Brouillons complets des jours touchés. */
  days: z.array(DaySchema).min(1),
  changes: z.array(ChangeSchema),
  /** Étapes à surligner après « Appliquer ». */
  changedStopIds: z.array(IdSchema),
  /** Étape proposée : reçoit le focus après « Appliquer » (F7-PO-1). */
  targetStopId: IdSchema,
  proposal: StopSchema,
  /** Proposition tirée de la réserve (mesure `replace_applied.from_reserve`). */
  fromReserve: z.boolean(),
});

/** Brouillon de remplacement du jeu simulé (0016 § 6) : un aperçu sans `id` ni `baseVersion`. */
export const ReplacementDraftSchema = ReplacementDraftBaseSchema.superRefine(refineDraft);
export type ReplacementDraft = z.infer<typeof ReplacementDraftSchema>;

/** Champs d'un brouillon de déplacement (F7b) : jours de départ et d'arrivée, sans proposition. */
const MoveDraftBaseSchema = z.strictObject({
  /** Brouillons complets des jours touchés (jour d'origine et jour d'arrivée). */
  days: z.array(DaySchema).min(1),
  changes: z.array(ChangeSchema),
  changedStopIds: z.array(IdSchema),
  /** Étape déplacée : reçoit le focus après « Appliquer » (F7-PO-1). */
  targetStopId: IdSchema,
});

/** Brouillon de déplacement du jeu simulé (0016 § 6) : un aperçu sans `id` ni `baseVersion`. */
export const MoveDraftSchema = MoveDraftBaseSchema.superRefine(refineDraft);
export type MoveDraft = z.infer<typeof MoveDraftSchema>;

/**
 * Aperçu d'une révision (`ReplacementPreview` du handover = variante `replace`), union discriminée sur `kind`
 * (0016 § 4.2). F7b ajoute `move` ; F7c ajoutera `add`.
 */
export const RevisionPreviewSchema = z
  .discriminatedUnion("kind", [
    ReplacementDraftBaseSchema.extend({
      kind: z.literal("replace"),
      id: IdSchema,
      baseVersion: z.number().int().nonnegative(),
    }),
    MoveDraftBaseSchema.extend({
      kind: z.literal("move"),
      id: IdSchema,
      baseVersion: z.number().int().nonnegative(),
    }),
  ])
  .superRefine(refineDraft);
export type RevisionPreview = z.infer<typeof RevisionPreviewSchema>;

/** Brouillon de remplacement d'une étape du jeu simulé. */
export const ReplacementFixtureSchema = z.strictObject({
  /** Étape remplacée (`Stop.id`). */
  stopId: IdSchema,
  draft: ReplacementDraftSchema,
});
export type ReplacementFixture = z.infer<typeof ReplacementFixtureSchema>;

/**
 * Déplacement d'une étape du jeu simulé (F7b) : ses options (jours et points) et un brouillon par point. Un point
 * sans brouillon répond « aucune option compatible » (phase 0, sans moteur).
 */
export const MoveFixtureSchema = z
  .strictObject({
    options: MoveOptionsSchema,
    drafts: z.array(z.strictObject({ pointId: IdSchema, draft: MoveDraftSchema })),
  })
  .superRefine((fixture, ctx) => {
    const points = new Set(fixture.options.days.flatMap((day) => day.points.map((point) => point.id)));
    const seen = new Set<string>();
    fixture.drafts.forEach((entry, index) => {
      if (!points.has(entry.pointId)) ctx.addIssue({ code: "custom", message: "pointId : point absent des options", path: ["drafts", index, "pointId"] });
      if (seen.has(entry.pointId)) ctx.addIssue({ code: "custom", message: "un brouillon par point", path: ["drafts", index, "pointId"] });
      seen.add(entry.pointId);
      if (entry.draft.targetStopId !== fixture.options.stopId) {
        ctx.addIssue({ code: "custom", message: "targetStopId : l'étape déplacée", path: ["drafts", index, "draft", "targetStopId"] });
      }
    });
  });
export type MoveFixture = z.infer<typeof MoveFixtureSchema>;

/**
 * Jeu simulé de révision d'un voyage (0016 § 6), lu par `getRevisionFixtures` (adaptateur `mock` seulement) :
 * brouillons de remplacement par étape, options et brouillons de déplacement par étape (F7b). F7c y ajoutera index
 * de recherche et brouillons d'ajout. B11 le remplace par les Server Actions.
 */
export const RevisionFixturesSchema = z.strictObject({
  replacements: z.array(ReplacementFixtureSchema).refine(
    (fixtures) => new Set(fixtures.map((fixture) => fixture.stopId)).size === fixtures.length,
    { message: "un brouillon de remplacement par étape" },
  ),
  moves: z.array(MoveFixtureSchema).refine(
    (fixtures) => new Set(fixtures.map((fixture) => fixture.options.stopId)).size === fixtures.length,
    { message: "un jeu de déplacement par étape" },
  ),
});
export type RevisionFixtures = z.infer<typeof RevisionFixturesSchema>;

/**
 * Codes d'erreur d'une demande d'aperçu (0016 § 4.4). `costCapReached` et `rateLimited` sont affichés comme
 * `error` en attendant F7-Q2 (F7-PO-14) ; l'adaptateur `api` les convertira depuis `ApiError` dans une seule table.
 */
export type RevisionError = "noOption" | "conflict" | "lockedStop" | "costCapReached" | "rateLimited" | "error";

/** Réponse d'une demande d'aperçu. */
export type RevisionResult = { ok: true; preview: RevisionPreview } | { ok: false; error: RevisionError };

/** Réponse d'« Appliquer » : nouvelle version locale, ou refus sans rien appliquer. */
export type ApplyResult = { ok: true; version: number } | { ok: false; error: "conflict" | "lockedStop" | "error" };

/**
 * Remplacement d'une étape sur l'adaptateur `api` (tâche M1g, ticket 869 ; plan `docs/plans/mvp-etapes-1-9.md`, étape 1) :
 * réponses des actions serveur, **jamais stockées**. Le candidat vient des propositions déjà vérifiées du voyage (ligne
 * `proposals` liée à sa ligne `candidates`), jamais d'un appel de modèle ; le serveur ne garde aucun aperçu.
 *
 * - `offer` : brouillon calculé par le moteur (`appliquerPatch`, opération `replace`) sur la version `version` : jours
 *   touchés recomposés comme une lecture (durées comprises), changements, étape proposée ; `candidateId` est l'identifiant
 *   du candidat (`candidates.id`, décision 0145 § 1) que l'application reprend. Brouillon raffiné comme un aperçu
 *   (`refineDraft`) : un jour touché garde ses engagements intacts (décision 0145 § 2) ;
 * - `noOption` : aucune proposition compatible, ou le moteur refuse ; `conflict` : la version de base n'est plus la
 *   version courante ; `lockedStop` : l'étape est verrouillée.
 */
const VersionReponseSchema = z.number().int().nonnegative();

export const ReplacementOfferSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.literal("offer"), version: VersionReponseSchema, candidateId: IdSchema, draft: ReplacementDraftSchema }),
  z.strictObject({ status: z.literal("noOption") }),
  z.strictObject({ status: z.literal("conflict"), currentVersion: VersionReponseSchema }),
  z.strictObject({ status: z.literal("lockedStop") }),
]);
export type ReplacementOffer = z.infer<typeof ReplacementOfferSchema>;

/**
 * Écriture d'un remplacement (`applied`) ou de son annulation (`undone`, opération `revert` de `TripPatch`) : nouvelle
 * version courante ; sinon refus sans rien écrire (`conflict`, `noOption`, `lockedStop`).
 */
export const ReplacementWriteSchema = z.discriminatedUnion("status", [
  z.strictObject({ status: z.enum(["applied", "undone"]), version: VersionReponseSchema }),
  z.strictObject({ status: z.literal("conflict"), currentVersion: VersionReponseSchema }),
  z.strictObject({ status: z.literal("noOption") }),
  z.strictObject({ status: z.literal("lockedStop") }),
]);
export type ReplacementWrite = z.infer<typeof ReplacementWriteSchema>;
