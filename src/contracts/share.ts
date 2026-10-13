import { z } from "zod";

import { TripIdSchema } from "./billing";
import { MapPointSchema } from "./map";
import {
  DaySchema,
  FreeItemSchema,
  IsoDateSchema,
  OpenMealItemSchema,
  SegmentItemSchema,
  StopSchema,
  TerminusItemSchema,
  TripBaseSchema,
} from "./trip";
import { SHARED_EXCEPTIONS, SHARE_TOKEN_PATTERN } from "./values";

/**
 * Contrats du partage et de la vue partagée (spécification F10, F10c ; décision 0039, F10-TL-1 et F10-TL-7).
 *
 * Tous **dérivés** des schémas existants (`pick`, `omit`, `extend` sur des objets non raffinés), jamais recopiés,
 * et stricts : un champ en trop fait échouer la validation (la page répond alors par la page d'erreur commune, jamais
 * par la donnée en trop). Ce que la vue partagée ne reçoit jamais, faute de clé : libellés et positions des terminus,
 * liste « À faire avant de partir », budgets, identifiants d'étape et d'événement, `reason`, `source`, `verifiedAt`,
 * `locked`, `placeId`, `commitment`, « Surprends-moi », `travelMinutes`, `travelBudgetMinutes`, organisation et
 * identifiant interne du voyage.
 *
 * Ces schémas ne sont pas réexportés par `index.ts` (seulement leurs types) : ce ne sont pas des champs stockés, et
 * le tableau des champs du handover back-end § 5 ne les décrit pas. B12 les reprend sans les renommer.
 */

/** Clé locale d'une étape dans son jour : son rang parmi les étapes (« 1 » = la première), jamais son identifiant. */
export const SharedStopKeySchema = z.string().regex(/^[1-9]\d{0,2}$/);

/** Étape partagée : nature, nom, heures et faits (`formatFaits`), exceptions limitées à « À confirmer » et « Non confirmé ». */
export const SharedStopSchema = StopSchema.pick({ kind: true, name: true, start: true, end: true, facts: true }).extend({
  key: SharedStopKeySchema,
  exceptions: z.array(z.enum(SHARED_EXCEPTIONS)).max(2),
});
export type SharedStop = z.infer<typeof SharedStopSchema>;

/** Événement partagé (`Day.events`) : sans clé (aucun point sur la carte), nature `event`. */
export const SharedEventSchema = SharedStopSchema.omit({ key: true }).extend({ kind: z.literal("event") });
export type SharedEvent = z.infer<typeof SharedEventSchema>;

/** Terminus sans libellé (Q50, F10-PO-14) : « Début de journée » et « Fin de journée ». */
export const SharedTerminusItemSchema = TerminusItemSchema.omit({ label: true });
export const SharedStopItemSchema = z.strictObject({ type: z.literal("stop"), stop: SharedStopSchema });

export const SharedDayItemSchema = z.discriminatedUnion("type", [
  SharedTerminusItemSchema,
  SharedStopItemSchema,
  SegmentItemSchema,
  FreeItemSchema,
  OpenMealItemSchema,
]);
export type SharedDayItem = z.infer<typeof SharedDayItemSchema>;

/** Jour partagé : titre et jour abrégé sont calculés par l'interface depuis `date` (décision 0039, amendement A5). */
export const SharedDaySchema = DaySchema.pick({ index: true, date: true, generating: true }).extend({
  items: z.array(SharedDayItemSchema),
  events: z.array(SharedEventSchema),
});
export type SharedDay = z.infer<typeof SharedDaySchema>;

/**
 * Voyage partagé : sans identifiant ni organisation ; voyageurs réduits à leur composition (`adults`, `children`),
 * même si un contrat futur ajoute un champ à `Trip.travellers` (nom, âge, adresse : jamais transmis).
 */
export const SharedTripSchema = TripBaseSchema.pick({
  destination: true,
  destinationColor: true,
  start: true,
  end: true,
}).extend({
  travellers: TripBaseSchema.shape.travellers.pick({ adults: true, children: true }),
  days: z.array(SharedDaySchema),
});
export type SharedTrip = z.infer<typeof SharedTripSchema>;

/** Point de carte d'une étape (F10-TL-14) : aucun terminus, relié à l'étape par sa clé locale au jour. */
export const SharedMapPointSchema = MapPointSchema.pick({ lat: true, lng: true }).extend({ key: SharedStopKeySchema });
export type SharedMapPoint = z.infer<typeof SharedMapPointSchema>;

/** Points d'un jour, pour la carte Google de la vue partagée (affichage seulement, jamais gardés côté client). */
export const SharedDayMapSchema = z.strictObject({
  index: z.number().int().positive(),
  points: z.array(SharedMapPointSchema),
});
export type SharedDayMap = z.infer<typeof SharedDayMapSchema>;

/** `RP` : voyage partagé et points de tous les jours (vue d'ensemble). */
export const SharedTripViewSchema = z.strictObject({ trip: SharedTripSchema, maps: z.array(SharedDayMapSchema) });
export type SharedTripView = z.infer<typeof SharedTripViewSchema>;

/** `RPJ` : voyage partagé (onglets, titre), jour affiché et ses points. */
export const SharedDayViewSchema = z.strictObject({
  trip: SharedTripSchema,
  dayIndex: z.number().int().positive(),
  points: z.array(SharedMapPointSchema),
});
export type SharedDayView = z.infer<typeof SharedDayViewSchema>;

/** Entrée des trois actions de partage : le voyage seulement ; l'organisation vient de la requête, jamais du navigateur. */
export const ShareRequestSchema = z.strictObject({ tripId: TripIdSchema });
export type ShareRequest = z.infer<typeof ShareRequestSchema>;

/** Instant ISO 8601 avec fuseau (`toISOString()`). */
const InstantSchema = z.iso.datetime({ offset: true });

/**
 * État du lien d'un voyage (décision 0039, F10-TL-1 point 6) : jamais le jeton. `expiresOn` est le dernier jour de
 * validité, à l'heure de la destination (`accessUntil(trip.end, accessDaysAfterReturn)`).
 */
export const ShareStatusSchema = z.discriminatedUnion("active", [
  z.strictObject({ active: z.literal(false) }),
  z.strictObject({ active: z.literal(true), createdAt: InstantSchema, expiresOn: IsoDateSchema }),
]);
export type ShareStatus = z.infer<typeof ShareStatusSchema>;

/** Lien créé : seule réponse qui porte le jeton en clair (F10-PO-17). */
export const CreatedShareLinkSchema = z.strictObject({
  token: z.string().regex(SHARE_TOKEN_PATTERN),
  createdAt: InstantSchema,
  expiresOn: IsoDateSchema,
});
export type CreatedShareLink = z.infer<typeof CreatedShareLinkSchema>;
