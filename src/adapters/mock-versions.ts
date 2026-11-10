import {
  PatchResultSchema,
  RevertApplySchema,
  RevertPreviewRequestSchema,
  RevertPreviewSchema,
  TripVersionPageSchema,
  TripVersionsRequestSchema,
  TripVersionSummarySchema,
  fail,
  ok,
  type Change,
  type PatchResult,
  type Result,
  type RevertPreview,
  type Stop,
  type Trip,
  type TripVersionPage,
  type TripVersionSummary,
} from "@/contracts";
import { TRIP_VERSIONS_PAGE_SIZE } from "@/contracts/values";

import type { AdapterContext, TripAdapter, TripVersionsAdapter } from "./types";

/**
 * Versions du programme, simulées (tâche M5b, ticket 934 ; décision 0147 § 5.3) : mêmes refus, dans le même ordre, que les
 * cas d'usage de `api` (`src/server/versions/historique.ts`), sur un historique tenu dans la portée de simulation.
 *
 * **Historique simulé** d'un voyage débloqué, créé à sa première lecture depuis le voyage servi par le lecteur de la portée
 * (noms du programme seulement, jamais un nom Google) : version 1 « Programme préparé » (avant le déblocage simulé),
 * version 2 « Voyage complet », version 3 « {nom} verrouillé », version 4 « Verrou retiré : {nom} » (version actuelle, celle
 * des données servies), où `{nom}` est la première étape du programme qui n'est pas un engagement. Deux états seulement :
 * étape déverrouillée (versions 2 et 4, comme les données) ou verrouillée (version 3) ; « Ce qui change » d'un retour en
 * découle (`unlocked` ou `locked`, ou rien). Le débit `retouche` par adresse IP n'existe que sur `api`.
 *
 * **Limite assumée** : le programme servi par `mock` est fixe (jeu simulé) ; un retour s'inscrit dans l'historique de la
 * portée (version nouvelle, « Annuler » compris) mais ne change pas les jours affichés.
 */

/** Une version simulée : ligne de la liste, état du programme (`verrouillee` : l'étape simulée est verrouillée) et demande. */
export interface MockVersionRecord {
  organizationId: string;
  tripId: string;
  summary: Omit<TripVersionSummary, "revertible" | "current">;
  verrouillee: boolean;
  requestId?: string;
  /** Réponse d'un retour écrit (rejeu idempotent). */
  result?: PatchResult;
}

/** Versions simulées de la portée, par voyage, de la plus ancienne à la plus récente. */
export interface TripVersionsStore {
  records: MockVersionRecord[];
  /** Instant simulé du déblocage, par voyage (`organizationId\u0000tripId`). */
  unlockedAt: Map<string, number>;
}

export type OptionsVersionsSimulees = {
  /** Lecteur des voyages de la portée (`getTripReader`) : déblocage simulé compris. */
  readonly trips: Pick<TripAdapter, "getTrip">;
  readonly store: TripVersionsStore;
  readonly now: () => number;
  /** `VERSIONS_MAX_PAR_VOYAGE` de la configuration serveur (borne de l'historique d'un voyage). */
  readonly max: number;
};

const JOUR_MS = 86_400_000;
const HEURE_MS = 3_600_000;

/** Étape simulée de l'historique : la première étape du programme qui n'est pas un engagement. */
function etapeSimulee(trip: Trip): { stop: Stop; day: number } | null {
  for (const day of trip.days) {
    for (const item of day.items) if (item.type === "stop" && item.stop.commitment === undefined) return { stop: item.stop, day: day.index };
  }
  return null;
}

function champErrone(issues: readonly { path: readonly PropertyKey[] }[]): string | undefined {
  const champ = issues[0]?.path[0];
  return typeof champ === "string" ? champ : undefined;
}

export function createMockTripVersions(options: OptionsVersionsSimulees): TripVersionsAdapter {
  const { trips, store, now, max } = options;
  const cle = (ctx: AdapterContext, tripId: string) => `${ctx.organizationId}\u0000${tripId}`;
  const duVoyage = (ctx: AdapterContext, tripId: string) => store.records.filter((r) => r.organizationId === ctx.organizationId && r.tripId === tripId);

  /** Voyage débloqué de la portée et son historique (créé à la première lecture) ; sinon le refus. */
  async function lire(ctx: AdapterContext | null, tripId: string): Promise<Result<{ trip: Trip; historique: MockVersionRecord[]; etape: { stop: Stop; day: number } | null }>> {
    if (ctx === null) return fail("unauthenticated");
    const trip = await trips.getTrip(ctx, tripId);
    if (trip === null) return fail("not_found");
    if (!trip.unlocked) return { ok: false, error: { code: "not_unlocked", retryable: false } };
    const etape = etapeSimulee(trip);
    if (duVoyage(ctx, tripId).length === 0) {
      const instant = now();
      const base = { organizationId: ctx.organizationId, tripId };
      const iso = (ms: number) => new Date(ms).toISOString();
      store.unlockedAt.set(cle(ctx, tripId), instant - 2 * JOUR_MS - HEURE_MS);
      store.records.push({ ...base, summary: { version: 1, createdAt: iso(instant - 3 * JOUR_MS), kind: "prepared" }, verrouillee: false });
      store.records.push({ ...base, summary: { version: 2, createdAt: iso(instant - 2 * JOUR_MS), kind: "complete" }, verrouillee: false });
      if (etape !== null) {
        store.records.push({ ...base, summary: { version: 3, createdAt: iso(instant - JOUR_MS), kind: "locked", subject: etape.stop.name }, verrouillee: true });
        store.records.push({ ...base, summary: { version: 4, createdAt: iso(instant - HEURE_MS), kind: "unlocked", subject: etape.stop.name }, verrouillee: false });
      }
    }
    return ok({ trip, historique: duVoyage(ctx, tripId), etape });
  }

  const proposee = (ctx: AdapterContext, tripId: string, record: MockVersionRecord, courante: number) =>
    record.summary.version < courante && Date.parse(record.summary.createdAt) >= (store.unlockedAt.get(cle(ctx, tripId)) ?? Number.POSITIVE_INFINITY);

  /** « Ce qui change » entre l'état courant et l'état visé : verrou posé ou retiré sur l'étape simulée, ou rien. */
  function changements(etape: { stop: Stop } | null, depuis: MockVersionRecord, vers: MockVersionRecord): Change[] {
    if (etape === null || depuis.verrouillee === vers.verrouillee) return [];
    return [{ type: vers.verrouillee ? "locked" : "unlocked", label: etape.stop.name, time: etape.stop.start }];
  }

  return {
    async listTripVersions(ctx, input): Promise<Result<TripVersionPage>> {
      if (ctx === null) return fail("unauthenticated");
      const lue = TripVersionsRequestSchema.safeParse(input);
      if (!lue.success) return fail("validation_failed", champErrone(lue.error.issues));
      const lu = await lire(ctx, lue.data.tripId);
      if (!lu.ok) return lu;
      const courante = lu.value.historique.at(-1)?.summary.version ?? 0;
      const avant = lue.data.before;
      const lignes = [...lu.value.historique].reverse().filter((r) => avant === undefined || r.summary.version < avant);
      const items = lignes.slice(0, TRIP_VERSIONS_PAGE_SIZE).map((r) =>
        TripVersionSummarySchema.parse({ ...r.summary, current: r.summary.version === courante, revertible: proposee(ctx, lue.data.tripId, r, courante) }),
      );
      return ok(TripVersionPageSchema.parse({ items, nextBefore: lignes.length > TRIP_VERSIONS_PAGE_SIZE ? (items.at(-1)?.version ?? null) : null }));
    },

    async previewRevert(ctx, input): Promise<Result<RevertPreview>> {
      if (ctx === null) return fail("unauthenticated");
      const lue = RevertPreviewRequestSchema.safeParse(input);
      if (!lue.success) return fail("validation_failed", champErrone(lue.error.issues));
      const { tripId, baseVersion, toVersion } = lue.data;
      const lu = await lire(ctx, tripId);
      if (!lu.ok) return lu;
      const { historique, trip, etape } = lu.value;
      const actuelle = historique.at(-1);
      if (actuelle === undefined) return fail("not_found");
      if (actuelle.summary.version !== baseVersion) return { ok: false, error: { code: "version_conflict", retryable: true, currentVersion: actuelle.summary.version } };
      const cible = historique.find((r) => r.summary.version === toVersion);
      if (cible === undefined || !proposee(ctx, tripId, cible, baseVersion)) return fail("validation_failed", "toVersion");
      const currentHasLockedStop = trip.days.some((day) => day.items.some((item) => item.type === "stop" && item.stop.locked)) || actuelle.verrouillee;
      return ok(RevertPreviewSchema.parse({ baseVersion, toVersion, changes: changements(etape, actuelle, cible), currentHasLockedStop }));
    },

    async applyRevert(ctx, input): Promise<Result<PatchResult>> {
      if (ctx === null) return fail("unauthenticated");
      const lue = RevertApplySchema.safeParse(input);
      if (!lue.success) return fail("validation_failed", champErrone(lue.error.issues));
      const { tripId, baseVersion, toVersion, requestId } = lue.data;
      const lu = await lire(ctx, tripId);
      if (!lu.ok) return lu;
      const { historique, etape } = lu.value;
      const actuelle = historique.at(-1);
      if (actuelle === undefined) return fail("not_found");
      const deja = historique.find((r) => r.requestId === requestId);
      if (deja !== undefined) {
        return deja.summary.revertedTo?.version === toVersion && deja.result !== undefined
          ? ok(deja.result)
          : { ok: false, error: { code: "version_conflict", retryable: true, currentVersion: actuelle.summary.version } };
      }
      if (actuelle.summary.version >= max) return fail("validation_failed", "baseVersion");
      if (actuelle.summary.version !== baseVersion) return { ok: false, error: { code: "version_conflict", retryable: true, currentVersion: actuelle.summary.version } };
      const cible = historique.find((r) => r.summary.version === toVersion);
      if (cible === undefined || !proposee(ctx, tripId, cible, baseVersion)) return fail("validation_failed", "toVersion");
      const version = baseVersion + 1;
      const changes = changements(etape, actuelle, cible);
      const result = PatchResultSchema.parse({ version, touchedDays: changes.length > 0 && etape !== null ? [etape.day] : [], changes });
      store.records.push({
        organizationId: ctx.organizationId,
        tripId,
        summary: { version, createdAt: new Date(now()).toISOString(), kind: "reverted", revertedTo: { version: toVersion, createdAt: cible.summary.createdAt } },
        verrouillee: cible.verrouillee,
        requestId,
        result,
      });
      return ok(result);
    },
  };
}
