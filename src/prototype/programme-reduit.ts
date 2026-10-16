import { z } from "zod";

import {
  CategorySchema,
  ChecklistItemSchema,
  DaySchema,
  MealSchema,
  SegmentSchema,
  StopSchema,
  SurpriseIdeaSchema,
  TimeSchema,
  TRIP_ID_PATTERN,
  TripBaseSchema,
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
 * rien du script (décision 0032, A3.2 ; le test du graphe d'import arrive avec la seconde PR de P0a1). P0b1
 * l'importe tel quel.
 */

/**
 * Organisation technique du prototype, `org_prototype` (décision 0032, A4.1) : identifiant fixe de type `uuid`, égal à
 * celui que crée la migration `db/migrations/0003_prototype.sql` (décision 0046, D15 point 4, qui amende 0032 ; test
 * `base: uuid d'org_prototype et de l'utilisateur technique égaux dans le code et la migration`).
 */
export const PROTOTYPE_ORG_ID = "5e1f0000-0000-4000-8000-000000000001";

/** Version de la forme réduite. */
export const PROGRAMME_REDUIT_SCHEMA = 1;

/** Badges permis dans le prototype : jamais `toConfirm` (écart 3 bis, décision 0032 A3.3). */
export const EXCEPTIONS_REDUITES = ["toReserve", "unconfirmed"] as const;

/** Identifiant de lieu : forme des identifiants Google (base64url), 256 caractères au plus. */
export const PLACE_ID_PATTERN = /^[A-Za-z0-9_-]{1,256}$/;

/** Longueurs maximales des textes écrits (spécification, « Sorties des modèles : schémas stricts »). */
export const LONGUEURS = { nom: 80, raison: 280, detour: 280, libelle: 120 } as const;

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

/** Étape sans `verifiedAt` ni `commitment` : le prototype n'enregistre aucun billet ni aucune réservation. */
export const StopReduitSchema = StopSchema.omit({ verifiedAt: true, exceptions: true, commitment: true }).extend({
  placeId: PlaceIdSchema.optional(),
  name: texte(LONGUEURS.nom),
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

/**
 * Jour réduit. Il garde son propre `weekday` (spécification B2, E1 : ce n'est plus un champ de `Day`, la réduction
 * le calcule depuis la date) ; il n'a plus de `title`, calculé par l'interface depuis la date.
 */
export const JourReduitSchema = DaySchema.omit({ travelMinutes: true, items: true, events: true, surprise: true }).extend({
  weekday: WeekdaySchema,
  items: z.array(LigneReduiteSchema),
  events: z.array(EventStopReduitSchema),
  surprise: SurpriseReduiteSchema.optional(),
});
export type JourReduit = z.infer<typeof JourReduitSchema>;

export const VoyageReduitSchema = TripBaseSchema.omit({
  days: true,
  organizationId: true,
  id: true,
  unlocked: true,
  checklist: true,
}).extend({
  id: z.string().regex(TRIP_ID_PATTERN, "identifiant de voyage conforme à TRIP_ID_PATTERN"),
  organizationId: z.literal(PROTOTYPE_ORG_ID),
  days: z.array(JourReduitSchema).min(1),
  /** Le prototype ne produit aucune liste de préparatifs (donc aucun `bookingUrl`). */
  checklist: z.array(ChecklistItemSchema).max(0),
  /** Tout le séjour est parcourable (spécification, « Sortie 1 »). */
  unlocked: z.literal(true),
});
export type VoyageReduit = z.infer<typeof VoyageReduitSchema>;

/**
 * Proposition sans `travelFromPrevious.minutes`, sans `photoUrl`, sans `neighbours` (calculé à la lecture, B2), avec
 * `detour` obligatoire. Recopiée champ par
 * champ de `ProposalSchema` (qui porte des raffinements, donc pas de `.omit`) ; le test vérifie que ses clés
 * restent un sous-ensemble de celles du contrat. `stop.commitment` est refusé par `StopReduitSchema`.
 */
export const PropositionReduiteSchema = z
  .strictObject({
    id: texte(64),
    kind: z.enum(["activity", "meal"]),
    day: z.number().int().positive(),
    time: TimeSchema,
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
  });
export type PropositionReduite = z.infer<typeof PropositionReduiteSchema>;

export const PositionSchema = z.strictObject({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

/** Table `positions` : Zod 4 ignore en silence une clé propre `__proto__` d'un enregistrement ; elle est refusée avant. */
const PositionsSchema = z
  .unknown()
  .refine((valeur) => typeof valeur !== "object" || valeur === null || !Object.hasOwn(valeur, "__proto__"), {
    message: "clé __proto__ refusée",
  })
  .pipe(z.record(PlaceIdSchema, PositionSchema));

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

/**
 * Clés de premier niveau du programme **écrit** en base (`prototype.programmes.contenu`) : la forme réduite sans
 * `positions` (Q324, 0046 D15 point 1). Égales au `CHECK` de `prototype.programmes` (test).
 */
export const CLES_PROGRAMME_ECRIT = ["schema", "trip", "proposals", "terminus"] as const;

const ChampsProgrammeEcrit = {
  schema: z.literal(PROGRAMME_REDUIT_SCHEMA),
  trip: VoyageReduitSchema,
  /** Les 8 propositions de la présentation (cadrage § 4), au plus. */
  proposals: z.array(PropositionReduiteSchema).max(8),
  terminus: z.array(TerminusReduitSchema),
};

/** Contrôles de structure communs au programme écrit et à la forme réduite complète (jours, terminus, propositions). */
function controlerStructure(
  programme: { trip: VoyageReduit; proposals: PropositionReduite[]; terminus: z.infer<typeof TerminusReduitSchema>[] },
  ctx: z.RefinementCtx,
): void {
  const jours = programme.trip.days.map((jour) => jour.index);
  if (new Set(jours).size !== jours.length) {
    ctx.addIssue({ code: "custom", message: "indices de jour en double", path: ["trip", "days"] });
  }
  const joursTerminus = programme.terminus.map((terminus) => terminus.jour);
  if (jours.length !== joursTerminus.length || jours.some((jour, index) => joursTerminus.at(index) !== jour)) {
    ctx.addIssue({ code: "custom", message: "un terminus par jour, dans l'ordre des jours", path: ["terminus"] });
  }
  const joursConnus = new Set(jours);
  programme.proposals.forEach((proposition, index) => {
    if (!joursConnus.has(proposition.day)) {
      ctx.addIssue({ code: "custom", message: "proposition d'un jour absent", path: ["proposals", index, "day"] });
    }
  });
}

/**
 * Programme **écrit** : la forme réduite sans `positions`, telle que `p0Run` l'écrit dans `prototype.programmes`.
 * Schéma unique de ce contenu, partagé par le rapport (`src/server/p0/rapport.ts`), la lecture des programmes réels
 * (`src/adapters/prototype-lecture.ts`, décision 0074) et la recomposition (`src/prototype/decoupage.ts`). Une clé
 * `positions` est refusée (objet strict).
 */
export const ProgrammeEcritSchema = z.strictObject(ChampsProgrammeEcrit).superRefine(controlerStructure);
export type ProgrammeEcrit = z.infer<typeof ProgrammeEcritSchema>;

export const ProgrammeReduitSchema = z
  .strictObject({ ...ChampsProgrammeEcrit, positions: PositionsSchema })
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
      if (!Object.hasOwn(programme.positions, placeId)) {
        ctx.addIssue({ code: "custom", message: "lieu du programme sans position", path: ["positions"] });
        break;
      }
    }
    controlerStructure(programme, ctx);
  });
export type ProgrammeReduit = z.infer<typeof ProgrammeReduitSchema>;
