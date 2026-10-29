import {
  DayMapSchema,
  DaySchema,
  DeckSessionSchema,
  PreviewSlotsSchema,
  ProposalSchema,
  ReplacementOfferSchema,
  ReplacementWriteSchema,
  TripSchema,
  TripSummarySchema,
  type Result,
} from "@/contracts";
import { creerLectureDuTri } from "@/server/presentation/lecture";
import { annulerRemplacement, appliquerRemplacement, proposerRemplacement, versionDuVoyage, type DependancesRemplacement } from "@/server/versions/remplacement";
import { creerLectureVoyages, type DependancesLecture } from "@/server/voyages/lecture";

import type { AdapterContext, RevisionAdapter, TripAdapter } from "./types";

/**
 * Adaptateur `api` (spécification B6, B6a point 5 ; handover § 11 : aucun appel HTTP vers soi-même) : implémente
 * `TripAdapter` en appelant dans le même processus les cas d'usage de lecture de `src/server/voyages/` (seul fichier
 * hors de `src/server` qui les importe, règle `ligne/voyages-imports`), et valide chaque sortie par son contrat.
 *
 * Le port de relectures est **injecté** par la fabrique (B6 : le double de `src/mocks/relectures-voyages.ts` ; B8b :
 * Places et Routes). **Non branché** sur `getTripAdapter()` dans B6a : B6b ajoute le branchement et sa garde (B6-TL-7).
 * Une erreur fermée de lecture remonte telle quelle (B6a point 10). Chaque cas d'usage valide déjà sa sortie par le même
 * schéma (`sortie` de `lecture.ts`, erreur fermée `output_invalid`) : la validation ci-dessous ne peut pas lever sur une
 * sortie rendue ; elle reste la garde de l'adaptateur. `withOrg` des options : **tests seulement** (`DependancesLecture`).
 */
export type OptionsAdaptateurApi = DependancesLecture;

/**
 * Révision enregistrée (M1g, ticket 869) : cas d'usage de `src/server/versions/remplacement.ts`, dans le même processus,
 * avec le contexte de la session reçu de l'action serveur et **le même port de relectures** que la lecture (un appel par
 * aperçu ou application, hors transaction). Chaque réponse est validée par son contrat.
 */
function revisionApi(options: OptionsAdaptateurApi): RevisionAdapter {
  const { withOrg, relectures } = options;
  const dependances = (ctx: AdapterContext | null): DependancesRemplacement => ({ contexte: async () => ctx, relectures, ...(withOrg === undefined ? {} : { withOrg }) });
  const valide = <T>(schema: { parse(valeur: unknown): T }) => (resultat: Result<T>): Result<T> => (resultat.ok ? { ok: true, value: schema.parse(resultat.value) } : resultat);
  return {
    currentVersion: (ctx, input) => versionDuVoyage(dependances(ctx), input),
    previewReplacement: async (ctx, input) => valide(ReplacementOfferSchema)(await proposerRemplacement(dependances(ctx), input)),
    applyReplacement: async (ctx, input) => valide(ReplacementWriteSchema)(await appliquerRemplacement(dependances(ctx), input)),
    undoReplacement: async (ctx, input) => valide(ReplacementWriteSchema)(await annulerRemplacement(dependances(ctx), input)),
  };
}

export function createApiTripAdapter(options: OptionsAdaptateurApi): TripAdapter {
  const lecture = creerLectureVoyages(options);
  const getDeckSession = creerLectureDuTri(options.withOrg === undefined ? {} : { withOrg: options.withOrg });
  return {
    revision: revisionApi(options),
    async listTrips(ctx) {
      return TripSummarySchema.array().parse(await lecture.listTrips(ctx));
    },
    async getTrip(ctx, tripId) {
      const trip = await lecture.getTrip(ctx, tripId);
      return trip === null ? null : TripSchema.parse(trip);
    },
    async getDay(ctx, tripId, index) {
      const day = await lecture.getDay(ctx, tripId, index);
      return day === null ? null : DaySchema.parse(day);
    },
    async listProposals(ctx, tripId) {
      return ProposalSchema.array().parse(await lecture.listProposals(ctx, tripId));
    },
    async listPreviewSlots(ctx, tripId) {
      return PreviewSlotsSchema.parse(await lecture.listPreviewSlots(ctx, tripId));
    },
    async getDayMap(ctx, tripId, index) {
      const map = await lecture.getDayMap(ctx, tripId, index);
      return map === null ? null : DayMapSchema.parse(map);
    },
    async getTripMap(ctx, tripId) {
      return DayMapSchema.array().parse(await lecture.getTripMap(ctx, tripId));
    },
    async getDeckSession(ctx, tripId) {
      const session = await getDeckSession(ctx, tripId);
      return session === null ? null : DeckSessionSchema.parse(session);
    },
  };
}
