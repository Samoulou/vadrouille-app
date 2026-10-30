import {
  ChecklistItemSchema,
  DayMapSchema,
  DaySchema,
  DeckSessionSchema,
  MoveDraftSchema,
  MoveOptionsSchema,
  PatchResultSchema,
  PreviewSlotsSchema,
  RevisionPreviewSchema,
  ProposalSchema,
  ReplacementOfferSchema,
  ReplacementWriteSchema,
  RevertPreviewSchema,
  TripSchema,
  TripSummarySchema,
  TripVersionPageSchema,
  type Result,
} from "@/contracts";
import { appliquerAjout, proposerAjout } from "@/server/lieux/ajout";
import { creerLectureDuTri } from "@/server/presentation/lecture";
import { annulerRemplacement, appliquerRemplacement, proposerRemplacement, versionDuVoyage, type DependancesRemplacement } from "@/server/versions/remplacement";
import { appliquerDeplacement, optionsDeDeplacement, proposerDeplacement } from "@/server/versions/deplacement";
import { appliquerRetour, listerVersions, proposerRetour } from "@/server/versions/historique";
import { deverrouillerEtape, verrouillerEtape, type DependancesRetouche } from "@/server/versions/retouches";
import { basculerAFaire } from "@/server/voyages/a-faire";
import { creerLectureVoyages, type DependancesLecture } from "@/server/voyages/lecture";
import { signalerEtape } from "@/server/voyages/signalement";

import type { AddPlaceAdapter, AdapterContext, RevisionAdapter, StopReportAdapter, TripAdapter, TripVersionsAdapter } from "./types";

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
 * aperçu ou application, hors transaction). Chaque réponse est validée par son contrat. Le cochage d'une ligne « À faire »
 * (`toggleChecklistItem`, B6b, branché sur l'écran 11 par M5e), le verrou de la fiche (`lockStop`, `unlockStop`, M5a,
 * `src/server/versions/retouches.ts`, sans relecture) et le déplacement (`getMoveOptions`, `previewMove`, `applyMove`, ticket
 * 947, `src/server/versions/deplacement.ts`, même port de relectures ; décision 0153, PR en cours) passent par le même
 * adaptateur.
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
    toggleChecklistItem: async (ctx, input) =>
      valide(ChecklistItemSchema)(await basculerAFaire({ contexte: async () => ctx, ...(withOrg === undefined ? {} : { withOrg }) }, input)),
    // M5a (ticket 919) : verrou de la fiche ; aucun appel du port de relectures (décision 0147 § 9).
    lockStop: async (ctx, input) => valide(PatchResultSchema)(await verrouillerEtape(dependances(ctx), input)),
    unlockStop: async (ctx, input) => valide(PatchResultSchema)(await deverrouillerEtape(dependances(ctx), input)),
    // Ticket 947 : déplacer une étape ; un appel du port de relectures par aperçu ou application (décision 0153, PR en cours).
    getMoveOptions: async (ctx, input) => valide(MoveOptionsSchema)(await optionsDeDeplacement(dependances(ctx), input)),
    previewMove: async (ctx, input) => valide(MoveDraftSchema)(await proposerDeplacement(dependances(ctx), input)),
    applyMove: async (ctx, input) => valide(PatchResultSchema)(await appliquerDeplacement(dependances(ctx), input)),
  };
}

/**
 * Signalement d'une erreur sur une étape (M5c, ticket 904) : cas d'usage de `src/server/voyages/signalement.ts`, dans le
 * même processus, avec le contexte de la session reçu de l'action serveur. Aucun appel du port de relectures.
 */
function signalementsApi(options: OptionsAdaptateurApi): StopReportAdapter {
  const { withOrg, chaine } = options;
  return {
    reportStop: (ctx, input) =>
      signalerEtape({ contexte: async () => ctx, ...(withOrg === undefined ? {} : { withOrg }), ...(chaine === undefined ? {} : { chaine }) }, input),
  };
}

/**
 * Lieu à soi, aperçu et application d'un ajout (M5d-1, ticket 939) : cas d'usage de `src/server/lieux/ajout.ts`, dans le même
 * processus, avec le contexte de la session et **le même port de relectures** que la lecture (un appel par aperçu ou
 * application, hors transaction ; décision 0147 § 4). Chaque réponse est validée par son contrat.
 */
function lieuxApi(options: OptionsAdaptateurApi): AddPlaceAdapter {
  const { withOrg, relectures } = options;
  const dependances = (ctx: AdapterContext | null) => ({ contexte: async () => ctx, relectures, ...(withOrg === undefined ? {} : { withOrg }) });
  const valide = <T>(schema: { parse(valeur: unknown): T }) => (resultat: Result<T>): Result<T> => (resultat.ok ? { ok: true, value: schema.parse(resultat.value) } : resultat);
  return {
    previewAddPlace: async (ctx, input) => valide(RevisionPreviewSchema)(await proposerAjout(dependances(ctx), input)),
    applyAddPlace: async (ctx, input) => valide(PatchResultSchema)(await appliquerAjout(dependances(ctx), input)),
  };
}

/**
 * Versions du programme et retour à une version (M5b, ticket 934) : cas d'usage de `src/server/versions/historique.ts`, dans
 * le même processus, avec le contexte de la session reçu de l'action serveur. Aucun appel du port de relectures (un retour
 * recopie un instantané). Chaque réponse est validée par son contrat.
 */
function versionsApi(options: OptionsAdaptateurApi): TripVersionsAdapter {
  const { withOrg } = options;
  const dependances = (ctx: AdapterContext | null): DependancesRetouche => ({ contexte: async () => ctx, ...(withOrg === undefined ? {} : { withOrg }) });
  const valide = <T>(schema: { parse(valeur: unknown): T }) => (resultat: Result<T>): Result<T> => (resultat.ok ? { ok: true, value: schema.parse(resultat.value) } : resultat);
  return {
    listTripVersions: async (ctx, input) => valide(TripVersionPageSchema)(await listerVersions(dependances(ctx), input)),
    previewRevert: async (ctx, input) => valide(RevertPreviewSchema)(await proposerRetour(dependances(ctx), input)),
    applyRevert: async (ctx, input) => valide(PatchResultSchema)(await appliquerRetour(dependances(ctx), input)),
  };
}

export function createApiTripAdapter(options: OptionsAdaptateurApi): TripAdapter {
  const lecture = creerLectureVoyages(options);
  const getDeckSession = creerLectureDuTri(options.withOrg === undefined ? {} : { withOrg: options.withOrg });
  return {
    revision: revisionApi(options),
    reports: signalementsApi(options),
    places: lieuxApi(options),
    versions: versionsApi(options),
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
