import {
  AddPlaceApplySchema,
  AddPlaceRequestSchema,
  PlaceSearchRequestSchema,
  PlaceSearchResultsSchema,
  fail,
  ok,
  type AddPlaceRequest,
  type ApiError,
  type Day,
  type DayLineItem,
  type PatchResult,
  type PlaceSearchResult,
  type Result,
  type RevisionPreview,
  type Stop,
  type Trip,
} from "@/contracts";

import type { AdapterContext, PlaceAdapter, TripAdapter } from "./types";

/**
 * Lieu à soi, simulé (tâche M5d-1, ticket 939 ; décision 0147 § 3, § 8 et § 11 ; spécification M5 § 6) : mêmes entrées
 * strictes et mêmes refus, dans le même ordre, que `api` (`src/server/lieux/recherche.ts`, `src/server/lieux/ajout.ts`),
 * sur le jeu simulé et l'état de la portée de simulation. **Aucun appel à Google**, aucune donnée Google : les résultats
 * sont des libellés simulés (« Lieu simulé 1 », « Adresse simulée 1 »), aux identifiants `mock-lieu-<n>`.
 *
 * - `searchPlaces` : voyage de l'organisation (`not_found`), débloqué (`not_unlocked`), au plus `plafond` recherches par
 *   voyage et par 24 heures de l'horloge de la portée (`rate_limited`) ; trois résultats, aucun si la requête contient
 *   « aucun » (texte « Aucun lieu trouvé. »). Le débit par adresse IP et le plafond global n'existent que sur `api`.
 * - `previewAddPlace` et `applyAddPlace` : version simulée **1** (le jeu simulé n'a pas d'historique) ; l'étape `ajout-<id>`
 *   est posée dans un temps libre qui la contient (durée prévue de son type, `durees`) ou à la place d'un repas pas encore
 *   choisi à la même heure, verrouillée, `addedBy: "person"`, avec le nom saisi et le `placeId` choisi ; sinon `no_option` avec `cause: "no_room"` (décision 0155 § 1.2 : le seul refus de `mock` est le manque de place).
 *   L'application rend la version 2 **sans modifier le jeu simulé** (comme le verrou de `mock`, l'écran garde l'ajout en
 *   mémoire) ; rien d'autre n'est gardé que le compteur des recherches.
 */

/** Durées prévues par type (minutes), lues dans `dureesParDefaut` de la configuration du moteur. */
export type DureesAjout = { readonly activity: number; readonly lunch: number; readonly dinner: number };

/** Recherche simulée enregistrée : organisation, voyage, instant. Aucune requête ni résultat. */
export type PlaceSearchRecord = { readonly organizationId: string; readonly tripId: string; readonly at: number };
export type PlaceSearchStore = { records: PlaceSearchRecord[] };

export type OptionsLieuxSimules = {
  /** Lecteur des voyages de la portée (`getTripReader`) : déblocage simulé compris. */
  readonly trips: Pick<TripAdapter, "getTrip">;
  readonly store: PlaceSearchStore;
  readonly now: () => number;
  /** Recherches par voyage et par 24 heures (règle `trip` de `lieu-recherche`, `src/server/config/limites.ts`). */
  readonly plafond: number;
  readonly durees: DureesAjout;
  /** Recherches gardées au plus ; au-delà, la plus ancienne est retirée. */
  readonly max: number;
};

/** Version simulée du jeu (aucun historique). */
export const VERSION_SIMULEE = 1;
const FENETRE_MS = 86_400_000;

const versMinutes = (heure: string): number => Number(heure.slice(0, 2)) * 60 + Number(heure.slice(3, 5));
const versHeure = (minutes: number): string => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

function refusEntree(issues: readonly { readonly path: readonly PropertyKey[] }[]): Result<never> {
  const champ = issues[0]?.path[0];
  return fail("validation_failed", typeof champ === "string" ? champ : undefined);
}

const NON_DEBLOQUE: Result<never> = { ok: false, error: { code: "not_unlocked", retryable: false } };

/** Résultats simulés : trois lieux fictifs, ou aucun. */
function resultatsSimules(query: string): PlaceSearchResult[] {
  if (query.toLowerCase().includes("aucun")) return [];
  return PlaceSearchResultsSchema.parse(
    [1, 2, 3].map((rang) => ({ resultId: `mock-lieu-${String(rang)}`, name: `Lieu simulé ${String(rang)}`, ...(rang === 3 ? {} : { address: `Adresse simulée ${String(rang)}` }) })),
  );
}

type Pose = { readonly day: Day; readonly stop: Stop };

/** Pose l'étape ajoutée dans la journée simulée, ou `null` (`no_option`). */
export function poserAjoutSimule(day: Day, stopId: string, demande: AddPlaceRequest, durees: DureesAjout): Pose | null {
  const debut = versMinutes(demande.time);
  const repasOuvert = day.items.findIndex((item) => item.type === "openMeal" && item.time === demande.time);
  const repas = repasOuvert === -1 ? undefined : day.items[repasOuvert];
  const duree =
    demande.kind === "activity" ? durees.activity : repas?.type === "openMeal" ? durees[repas.meal] : debut < 16 * 60 ? durees.lunch : durees.dinner;
  const fin = debut + duree;
  if (fin > 23 * 60 + 59) return null;
  const stop: Stop = {
    id: stopId,
    kind: demande.kind,
    placeId: demande.resultId,
    name: demande.name,
    start: demande.time,
    end: versHeure(fin),
    facts: {},
    exceptions: [],
    locked: true,
    addedBy: "person",
  };
  const items: DayLineItem[] = [...day.items];
  if (demande.kind === "meal" && repasOuvert !== -1) {
    items.splice(repasOuvert, 1, { type: "stop", stop });
    return { day: { ...day, items }, stop };
  }
  const libre = items.findIndex((item) => item.type === "free" && versMinutes(item.from) <= debut && fin <= versMinutes(item.to));
  const temps = libre === -1 ? undefined : items[libre];
  if (temps?.type !== "free") return null;
  const remplacants: DayLineItem[] = [
    ...(versMinutes(temps.from) < debut ? [{ type: "free" as const, from: temps.from, to: demande.time }] : []),
    { type: "stop", stop },
    ...(fin < versMinutes(temps.to) ? [{ type: "free" as const, from: versHeure(fin), to: temps.to }] : []),
  ];
  items.splice(libre, 1, ...remplacants);
  return { day: { ...day, items }, stop };
}

export function createMockPlaces(options: OptionsLieuxSimules): PlaceAdapter {
  const { trips, store, now, plafond, durees, max } = options;

  /** Voyage débloqué de l'organisation, ou le refus (`not_found`, `not_unlocked`). */
  async function voyage(ctx: AdapterContext, tripId: string): Promise<{ readonly trip: Trip } | { readonly refus: Result<never> }> {
    const trip = await trips.getTrip(ctx, tripId);
    if (trip === null) return { refus: fail("not_found") };
    if (!trip.unlocked) return { refus: NON_DEBLOQUE };
    return { trip };
  }

  type Apercu = { readonly erreur: Result<never> } | { readonly pose: Pose; readonly demande: AddPlaceRequest; readonly requestId: string };

  async function apercu(ctx: AdapterContext | null, input: unknown, schema: typeof AddPlaceRequestSchema | typeof AddPlaceApplySchema, id: string | null): Promise<Apercu> {
    if (ctx === null) return { erreur: fail("unauthenticated") };
    const lue = schema.safeParse(input);
    if (!lue.success) return { erreur: refusEntree(lue.error.issues) };
    const demande = lue.data;
    const lu = await voyage(ctx, demande.tripId);
    if ("refus" in lu) return { erreur: lu.refus };
    if (demande.baseVersion !== VERSION_SIMULEE) {
      const conflit: ApiError = { code: "version_conflict", retryable: true, currentVersion: VERSION_SIMULEE };
      return { erreur: { ok: false, error: conflit } as Result<never> };
    }
    const day = lu.trip.days.find((d) => d.index === demande.day);
    if (day === undefined) return { erreur: fail("not_found") };
    const lu2 = AddPlaceApplySchema.safeParse(input);
    const requestId = id ?? (lu2.success ? lu2.data.requestId : crypto.randomUUID());
    const pose = poserAjoutSimule(day, `ajout-${requestId}`, demande, durees);
    // Seul refus du calcul simulé : le manque de place (décision 0155 § 1.2), cause posée comme sur `api`.
    if (pose === null) return { erreur: { ok: false, error: { code: "no_option", cause: "no_room" } } as Result<never> };
    return { pose, demande, requestId };
  }

  return {
    async searchPlaces(ctx, input) {
      if (ctx === null) return fail("unauthenticated");
      const lue = PlaceSearchRequestSchema.safeParse(input);
      if (!lue.success) return refusEntree(lue.error.issues);
      const lu = await voyage(ctx, lue.data.tripId);
      if ("refus" in lu) return lu.refus;
      const instant = now();
      const recentes = store.records.filter((r) => r.organizationId === ctx.organizationId && r.tripId === lue.data.tripId && r.at > instant - FENETRE_MS);
      if (recentes.length >= plafond) return { ok: false, error: { code: "rate_limited", retryable: true } };
      store.records.push({ organizationId: ctx.organizationId, tripId: lue.data.tripId, at: instant });
      while (store.records.length > max) store.records.shift();
      return ok(resultatsSimules(lue.data.query));
    },
    async previewAddPlace(ctx, input): Promise<Result<RevisionPreview>> {
      const id = crypto.randomUUID();
      const lu = await apercu(ctx, input, AddPlaceRequestSchema, id);
      if ("erreur" in lu) return lu.erreur;
      const { pose } = lu;
      return ok({
        kind: "add",
        id,
        baseVersion: VERSION_SIMULEE,
        days: [pose.day],
        changes: [{ type: "added", time: pose.stop.start, label: pose.stop.name }],
        changedStopIds: [pose.stop.id],
        targetStopId: pose.stop.id,
      });
    },
    async applyAddPlace(ctx, input): Promise<Result<PatchResult>> {
      const lu = await apercu(ctx, input, AddPlaceApplySchema, null);
      if ("erreur" in lu) return lu.erreur;
      return ok({ version: VERSION_SIMULEE + 1, touchedDays: [lu.demande.day], changes: [{ type: "added", time: lu.pose.stop.start, label: lu.pose.stop.name }] });
    },
  };
}
