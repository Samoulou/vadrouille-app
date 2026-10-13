import { z } from "zod";

import { PreferenceReasonSchema } from "./deck";
import { ChangeSchema, DaySchema, StopSchema } from "./trip";
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

interface DraftShape {
  days: readonly { index: number; items: readonly ({ type: "stop"; stop: { id: string; commitment?: unknown } } | { type: string })[] }[];
  changedStopIds: readonly string[];
  targetStopId: string;
  proposal?: { id: string };
}

/**
 * Raffinements d'un brouillon et d'un aperçu (0016 § 4.2) : jours distincts ; `changedStopIds` et `targetStopId`
 * désignent une étape de `days` ; aucune étape n'est un engagement (0015 § 9) ; la proposition d'un remplacement
 * est l'étape visée.
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
  if (stops.some((stop) => stop.commitment !== undefined)) {
    ctx.addIssue({ code: "custom", message: "une révision ne crée jamais d'engagement (commitment interdit)", path: ["days"] });
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

/**
 * Aperçu d'une révision (`ReplacementPreview` du handover = variante `replace`), union discriminée sur `kind`
 * (0016 § 4.2). F7b et F7c ajoutent les variantes `move` et `add`.
 */
export const RevisionPreviewSchema = z
  .discriminatedUnion("kind", [
    ReplacementDraftBaseSchema.extend({
      kind: z.literal("replace"),
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
 * Jeu simulé de révision d'un voyage (0016 § 6), lu par `getRevisionFixtures` (adaptateur `mock` seulement) :
 * brouillons de remplacement par étape. F7b et F7c y ajoutent options de déplacement, index de recherche et
 * brouillons d'ajout. B11 le remplace par les Server Actions.
 */
export const RevisionFixturesSchema = z.strictObject({
  replacements: z.array(ReplacementFixtureSchema).refine(
    (fixtures) => new Set(fixtures.map((fixture) => fixture.stopId)).size === fixtures.length,
    { message: "un brouillon de remplacement par étape" },
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
