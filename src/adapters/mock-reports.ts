import { fail, ok, StopReportSchema, type Result } from "@/contracts";
import { debutDuJourUtc, situerEtapeSignalee } from "@/server/programme/signalement";

import type { StopReportStore } from "./simulation";
import type { AdapterContext, StopReportAdapter, TripAdapter } from "./types";

/**
 * Signalement d'une erreur sur une étape, simulé (tâche M5c, ticket 904 ; décision 0147 § 1 et § 2) : mêmes refus, dans le
 * même ordre, que le cas d'usage de `api` (`src/server/voyages/signalement.ts`), sur l'état de la portée de simulation.
 * Entrée stricte (`StopReportSchema`) ; voyage lu par le lecteur de la portée (`not_found` hors organisation) ; étape
 * absente des jours que **ce lecteur** sert : `not_found` (le contrôle (d) de 0147 § 1 point 4 dépend donc du lecteur : le
 * jeu simulé de l'app sert toutes ses journées, la sélection avant le déblocage n'est faite que par `api`) ; événement, engagement ou lieu à soi : `validation_failed` (`field: "stopId"`) ;
 * doublon (même `requestId`, ou même motif sur la même étape du même lieu) : `ok(null)` sans rien compter, même plafond
 * atteint ; au-delà de `plafond` signalements du voyage depuis minuit UTC de l'horloge de la portée : `rate_limited`.
 * Le débit par adresse IP (`signalement`) n'existe que sur `api` (limiteur en base). Rien d'autre n'est gardé : aucun texte.
 */
export type OptionsSignalementsSimules = {
  /** Lecteur des voyages de la portée (`getTripReader`) : déblocage simulé compris. */
  readonly trips: Pick<TripAdapter, "getTrip">;
  readonly store: StopReportStore;
  readonly now: () => number;
  /** `SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR` de la configuration serveur. */
  readonly plafond: number;
  /** Signalements gardés au plus ; au-delà, le plus ancien est retiré. */
  readonly max: number;
};

export function createMockStopReports(options: OptionsSignalementsSimules): StopReportAdapter {
  const { trips, store, now, plafond, max } = options;
  return {
    async reportStop(ctx: AdapterContext | null, input: unknown): Promise<Result<null>> {
      if (ctx === null) return fail("unauthenticated");
      const lue = StopReportSchema.safeParse(input);
      if (!lue.success) {
        const champ = lue.error.issues[0]?.path[0];
        return fail("validation_failed", typeof champ === "string" ? champ : undefined);
      }
      const demande = lue.data;
      const trip = await trips.getTrip(ctx, demande.tripId);
      if (trip === null) return fail("not_found");
      const situation = situerEtapeSignalee(trip.days, demande.stopId);
      if (situation.type === "absente") return fail("not_found");
      if (situation.type === "non_signalable") return fail("validation_failed", "stopId");
      const duVoyage = store.records.filter((r) => r.organizationId === ctx.organizationId && r.tripId === demande.tripId);
      const doublon = duVoyage.some(
        (r) => r.requestId === demande.requestId || (r.stopId === demande.stopId && r.reason === demande.reason && r.placeId === situation.placeId),
      );
      if (doublon) return ok(null);
      const instant = now();
      const depuis = debutDuJourUtc(instant);
      if (duVoyage.filter((r) => r.createdAt >= depuis).length >= plafond) return fail("rate_limited");
      store.records.push({
        organizationId: ctx.organizationId,
        tripId: demande.tripId,
        stopId: demande.stopId,
        placeId: situation.placeId,
        reason: demande.reason,
        requestId: demande.requestId,
        createdAt: instant,
      });
      while (store.records.length > max) store.records.shift();
      return ok(null);
    },
  };
}
