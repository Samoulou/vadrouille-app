import { z } from "zod";

import {
  CategorySchema,
  DaySchema,
  MealSchema,
  SegmentSchema,
  StopSchema,
  SurpriseIdeaSchema,
  TimeSchema,
  TRIP_ID_PATTERN,
  TripSchema,
  WeekdaySchema,
} from "@/contracts";

/**
 * Forme réduite d'un programme du prototype (spécification P0, « Sortie 1 » ; décision 0032, A3).
 *
 * C'est la forme de `{ trip, proposals }` **sans les clés dérivées de Google** (contrainte 3 de la
 * spécification) : ni `verifiedAt` (étape et idée), ni `minutes` (segments et `travelFromPrevious`), ni
 * `Day.travelMinutes`, ni le badge `toConfirm` (écart 3 bis, décision 0032 A3.3). Elle ajoute ce que
 * l'adaptateur `prototype` (P0b1) relit ou recompose :
 * - `positions` : `placeId` → coordonnées, limitée aux `placeId` du programme (réponse de Samuel à P0-Q8) ;
 * - `terminus` : le `placeId` du logement de départ et d'arrivée de chaque jour ;
 * - `detour` présent sur **chaque** proposition (sa présence ne trahit aucune durée).
 *
 * Module pur, importable par l'application (`src/adapters`, P0b1) : il n'importe que `@/contracts` et `zod`,
 * rien du script (test du graphe d'import, `tests/unit/p0/imports.test.ts`). P0b1 l'importe tel quel.
 */

/** Organisation fictive du prototype (décision 0032, A4.1). */
export const PROTOTYPE_ORG_ID = "org_prototype";

/** Version de la forme réduite. */
export const PROGRAMME_REDUIT_SCHEMA = 1;

/** Badges permis dans le prototype : jamais `toConfirm` (écart 3 bis, décision 0032 A3.3). */
export const EXCEPTIONS_REDUITES = ["toReserve", "unconfirmed"] as const;

/** Identifiant de lieu : forme des identifiants Google (base64url), 256 caractères au plus. */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** Longueurs maximales des textes écrits (spécification, « Sorties des modèles : schémas stricts »). */
export const LONGUEURS = { nom: 80, raison: 280, detour: 280, meta: 120, libelle: 120, titre: 120, contexte: 120 } as const;

/** Longueur maximale d'une URL de source (spécification, « URL source »). */
export const URL_SOURCE_MAX = 2048;

const PlaceIdSchema = z.string().regex(PLACE_ID_PATTERN, "placeId attendu");
const texte = (max: number) => z.string().min(1).max(max);

/** URL de source : `https` seulement, sans identifiants, 2 048 caractères au plus. */
export function urlSourceValide(valeur: string): boolean {
  if (valeur.length > URL_SOURCE_MAX) return false;
  let url: URL;
  try {
    url = new URL(valeur);
  } catch {
    return false;
  }
  return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "";
}

const SourceReduiteSchema = z.strictObject({
  label: texte(LONGUEURS.libelle),
  url: z.string().refine(urlSourceValide, "URL de source https, sans identifiants, 2 048 caractères au plus"),
});

export const StopReduitSchema = StopSchema.omit({ verifiedAt: true, exceptions: true }).extend({
  placeId: PlaceIdSchema.optional(),
  name: texte(LONGUEURS.nom),
  meta: z.string().max(LONGUEURS.meta),
  reason: texte(LONGUEURS.raison).optional(),
  source: SourceReduiteSchema.optional(),
  exceptions: z.array(z.enum(EXCEPTIONS_REDUITES)).max(2),
});
export type StopReduit = z.infer<typeof StopReduitSchema>;

const EventStopReduitSchema = StopReduitSchema.refine((stop) => stop.kind === "event", {
  message: "Day.events ne contient que des étapes de kind « event »",
  path: ["kind"],
});

/** Segment sans `minutes` : la durée est relue à l'affichage (P0-PO-9), jamais écrite. */
export const SegmentReduitSchema = SegmentSchema.omit({ minutes: true });
export type SegmentReduit = z.infer<typeof SegmentReduitSchema>;

export const SurpriseReduiteSchema = SurpriseIdeaSchema.omit({ verifiedAt: true }).extend({
  placeId: PlaceIdSchema.optional(),
  name: texte(LONGUEURS.nom),
  meta: z.string().max(LONGUEURS.meta),
  reason: texte(LONGUEURS.raison),
  source: SourceReduiteSchema,
});
export type SurpriseReduite = z.infer<typeof SurpriseReduiteSchema>;

export const LigneReduiteSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("terminus"),
    role: z.enum(["start", "end"]),
    time: TimeSchema,
    label: texte(LONGUEURS.libelle),
  }),
  z.strictObject({ type: z.literal("stop"), stop: StopReduitSchema }),
  z.strictObject({ type: z.literal("segment"), segment: SegmentReduitSchema }),
  z.strictObject({ type: z.literal("free"), from: TimeSchema, to: TimeSchema }),
  z.strictObject({ type: z.literal("openMeal"), time: TimeSchema, meal: MealSchema }),
]);
export type LigneReduite = z.infer<typeof LigneReduiteSchema>;

export const JourReduitSchema = DaySchema.omit({ travelMinutes: true, items: true, events: true, surprise: true }).extend({
  title: texte(LONGUEURS.titre),
  items: z.array(LigneReduiteSchema),
  events: z.array(EventStopReduitSchema),
  surprise: SurpriseReduiteSchema.optional(),
});
export type JourReduit = z.infer<typeof JourReduitSchema>;

export const VoyageReduitSchema = TripSchema.omit({ days: true, organizationId: true, id: true, unlocked: true }).extend({
  id: z.string().regex(TRIP_ID_PATTERN, "identifiant de voyage conforme à TRIP_ID_PATTERN"),
  organizationId: z.literal(PROTOTYPE_ORG_ID),
  days: z.array(JourReduitSchema).min(1),
  /** Tout le séjour est parcourable (spécification, « Sortie 1 »). */
  unlocked: z.literal(true),
});
export type VoyageReduit = z.infer<typeof VoyageReduitSchema>;

/**
 * Proposition sans `travelFromPrevious.minutes`, sans `photoUrl`, avec `detour` obligatoire. Recopiée champ par
 * champ de `ProposalSchema` (qui porte des raffinements, donc pas de `.omit`) ; le test vérifie que ses clés
 * restent un sous-ensemble de celles du contrat.
 */
export const PropositionReduiteSchema = z
  .strictObject({
    id: texte(64),
    kind: z.enum(["activity", "meal"]),
    day: z.number().int().positive(),
    weekday: WeekdaySchema,
    time: TimeSchema,
    context: texte(LONGUEURS.contexte),
    stop: StopReduitSchema,
    category: CategorySchema,
    option: z
      .strictObject({
        index: z.number().int().min(1),
        total: z.number().int().max(3),
      })
      .refine((option) => option.index <= option.total, {
        message: "option : 1 ≤ index ≤ total ≤ 3",
        path: ["index"],
      })
      .optional(),
    travelFromPrevious: SegmentReduitSchema.optional(),
    /** Justification maison de l'intérêt du lieu, sur chaque proposition (spécification, « Proposal.detour »). */
    detour: texte(LONGUEURS.detour),
  })
  .superRefine((proposition, ctx) => {
    if (proposition.stop.commitment !== undefined) {
      ctx.addIssue({
        code: "custom",
        message: "une proposition n'est jamais un engagement (stop.commitment interdit)",
        path: ["stop", "commitment"],
      });
    }
  });
export type PropositionReduite = z.infer<typeof PropositionReduiteSchema>;

export const PositionSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

export const TerminusReduitSchema = z.strictObject({
  jour: z.number().int().positive(),
  depart: PlaceIdSchema,
  arrivee: PlaceIdSchema,
});

/** `placeId` cités par le programme : étapes, événements, idées, propositions et terminus. */
export function placeIdsDuProgramme(programme: {
  trip: VoyageReduit;
  proposals: PropositionReduite[];
  terminus: z.infer<typeof TerminusReduitSchema>[];
}): Set<string> {
  const ids = new Set<string>();
  const ajouter = (placeId: string | undefined) => {
    if (placeId !== undefined) ids.add(placeId);
  };
  for (const jour of programme.trip.days) {
    for (const ligne of jour.items) if (ligne.type === "stop") ajouter(ligne.stop.placeId);
    for (const evenement of jour.events) ajouter(evenement.placeId);
    ajouter(jour.surprise?.placeId);
  }
  for (const proposition of programme.proposals) ajouter(proposition.stop.placeId);
  for (const terminus of programme.terminus) {
    ajouter(terminus.depart);
    ajouter(terminus.arrivee);
  }
  return ids;
}

export const ProgrammeReduitSchema = z
  .strictObject({
    schema: z.literal(PROGRAMME_REDUIT_SCHEMA),
    trip: VoyageReduitSchema,
    /** Les 8 propositions de la présentation (cadrage § 4), au plus. */
    proposals: z.array(PropositionReduiteSchema).max(8),
    positions: z.record(PlaceIdSchema, PositionSchema),
    terminus: z.array(TerminusReduitSchema),
  })
  .superRefine((programme, ctx) => {
    const attendus = placeIdsDuProgramme(programme);
    const presents = Object.keys(programme.positions);
    for (const placeId of presents) {
      if (!attendus.has(placeId)) {
        ctx.addIssue({ code: "custom", message: "position d'un lieu absent du programme", path: ["positions"] });
        break;
      }
    }
    for (const placeId of attendus) {
      if (!(placeId in programme.positions)) {
        ctx.addIssue({ code: "custom", message: "lieu du programme sans position", path: ["positions"] });
        break;
      }
    }
    const jours = programme.trip.days.map((jour) => jour.index);
    const joursTerminus = programme.terminus.map((terminus) => terminus.jour);
    if (jours.length !== joursTerminus.length || jours.some((jour, index) => joursTerminus[index] !== jour)) {
      ctx.addIssue({ code: "custom", message: "un terminus par jour, dans l'ordre des jours", path: ["terminus"] });
    }
    const joursConnus = new Set(jours);
    programme.proposals.forEach((proposition, index) => {
      if (!joursConnus.has(proposition.day)) {
        ctx.addIssue({ code: "custom", message: "proposition d'un jour absent", path: ["proposals", index, "day"] });
      }
    });
  });
export type ProgrammeReduit = z.infer<typeof ProgrammeReduitSchema>;
