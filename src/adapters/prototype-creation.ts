import { fail, MAX_PREVIEW_SLOTS, ok, type Brief, type GenerationDay, type TripDraft } from "@/contracts";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { JOURS_APERCU, selectionApercu } from "./prototype-parcours";
import type { AdapterContext, CreationAdapter, TripAdapter } from "./types";

/**
 * Création d'un voyage d'essai par l'adaptateur `prototype` (spécification E2E-essai, lot 3 ; décision 0125 § 2 et § 4) :
 * `createTrip` lance `p0Run` sur le brief saisi, `getGenerationStatus` suit l'exécution jusqu'au programme écrit.
 * L'ancienne chaîne (aperçu, voyage complet, recalcul) n'est jamais atteinte (D6).
 *
 * Ce module ne lit ni la base, ni le cookie d'accès, ni la garde : il reçoit le **port** branché au démarrage par
 * `src/instrumentation.ts` (`src/server/p0/creation-essai.ts`, même régime que la lecture des programmes réels). Non
 * branché (tests, `next build`, autre runtime) : `createTrip` rend `provider_error` et `getGenerationStatus` rend
 * `not_found`, sans rien lancer.
 *
 * Correspondance des états de l'exécution (décision 0125 § 4) :
 * - `en_cours` → `preparing` : jours de l'aperçu (le premier et le deuxième, `JOURS_APERCU`) « En préparation »,
 *   `MAX_PREVIEW_SLOTS` propositions attendues, aucune prête (le programme est écrit d'un coup, D4) ;
 * - `programme_ecrit` → `ready` : jours et étapes de l'aperçu tels que le parcours du voyage d'essai les sert
 *   (`selectionApercu`, lot 1), toutes prêtes ;
 * - `arretee` → `failed`, `provider_error`, `retryable` (une exécution sans programme ne compte jamais, 0093 point 2) ;
 * - autre organisation, voyage inconnu, autre voyage que ceux de l'app, barrière fermée : `not_found`.
 */

/** État d'une exécution du voyage, lu par le port (aucune autre donnée du brief). */
export type EtatVoyageEssai = { readonly etat: "en_cours" | "programme_ecrit" | "arretee"; readonly jours: number };

/** Issue d'un lancement rendue par le port : statut fermé du lancement, voyage réservé, champ refusé. */
export type IssueLancementEssai = { readonly statut: string; readonly tripId?: string; readonly champ?: string };

/** Port de la création d'un voyage d'essai (implémenté par `src/server/p0/creation-essai.ts`). */
export interface PortCreationEssai {
  lancer(demande: { readonly requestId: string; readonly draft: TripDraft; readonly brief: Brief; readonly recit?: string }): Promise<IssueLancementEssai>;
  relancer(demande: { readonly tripId: string; readonly requestId: string }): Promise<IssueLancementEssai>;
  /** Révision après le tri (spécification E2E-essai, lot 4 ; décision 0126) : statut fermé, sans valeur. */
  reviser(demande: { readonly tripId: string; readonly pasPourMoi: readonly string[]; readonly jAime: readonly string[] }): Promise<{ readonly statut: string }>;
  etat(tripId: string): Promise<EtatVoyageEssai | null>;
}

export interface DependancesCreationEssai {
  /** Port branché, lu à chaque appel ; `null` s'il ne l'est pas. */
  readonly port: () => PortCreationEssai | null;
  /** Lecture des voyages de l'adaptateur `prototype` (aperçu du programme écrit). */
  readonly trips: () => TripAdapter;
}

/** Statuts du lancement ramenés à une erreur du contrat ; tout autre devient `provider_error`. */
const PLAFONDS: ReadonlySet<string> = new Set(["cap_reached", "envelope_reached", "daily_quota_insufficient"]);

function resultatDuLancement(issue: IssueLancementEssai) {
  if (issue.statut === "lancee" && typeof issue.tripId === "string") return ok({ tripId: issue.tripId });
  if (issue.statut === "entree_invalide") return fail<{ tripId: string }>("validation_failed", issue.champ);
  // Cookie d'accès absent ou expiré entre l'affichage et le lancement : l'étape redemande le code (D3).
  if (issue.statut === "acces_refuse") return fail<{ tripId: string }>("unauthenticated");
  if (PLAFONDS.has(issue.statut)) return fail<{ tripId: string }>("cost_cap_reached");
  return fail<{ tripId: string }>("provider_error");
}

const duPrototype = (ctx: AdapterContext) => ctx.organizationId === PROTOTYPE_ORG_ID;

/** Jours de l'aperçu d'un séjour de `jours` jours, tous « En préparation ». */
function joursEnPreparation(jours: number): GenerationDay[] {
  return Array.from({ length: Math.max(1, Math.min(JOURS_APERCU, jours)) }, (_, rang) => ({ index: rang + 1, state: "preparing" as const, readyStops: 0 }));
}

export function createPrototypeCreationAdapter(dependances: DependancesCreationEssai): CreationAdapter {
  return {
    // Site d'essai (D2) : ni structuration du récit ni suggestion de logement ; les actions sont déjà fermées avant.
    async structureBrief() {
      return fail("no_option");
    },
    async suggestLodging() {
      return fail("no_option");
    },
    async createTrip(ctx, request) {
      const port = dependances.port();
      if (port === null || !duPrototype(ctx)) return fail("provider_error");
      const issue = await port.lancer({
        requestId: request.requestId,
        draft: request.draft,
        brief: request.brief,
        ...(request.story === undefined ? {} : { recit: request.story }),
      });
      return resultatDuLancement(issue);
    },
    async getGenerationStatus(ctx, tripId) {
      const port = dependances.port();
      if (port === null || !duPrototype(ctx)) return fail("not_found");
      const etat = await port.etat(tripId);
      if (etat === null) return fail("not_found");
      if (etat.etat === "en_cours") {
        return ok({ phase: "preparing", tripId, days: joursEnPreparation(etat.jours), expected: MAX_PREVIEW_SLOTS, ready: 0 });
      }
      if (etat.etat === "arretee") {
        return ok({ phase: "failed", tripId, days: joursEnPreparation(etat.jours), expected: MAX_PREVIEW_SLOTS, ready: 0, reason: "provider_error", retryable: true });
      }
      const trip = await dependances.trips().getTrip(ctx, tripId);
      if (trip === null) return fail("not_found");
      const { etapes, jours } = selectionApercu(trip.days);
      const parJour = new Map<number, number>();
      for (const jour of trip.days) {
        for (const ligne of jour.items) if (ligne.type === "stop" && etapes.includes(ligne.stop.id)) parJour.set(jour.index, (parJour.get(jour.index) ?? 0) + 1);
      }
      const indices = [...jours].sort((a, b) => a - b);
      const days = (indices.length > 0 ? indices : [1]).map((index, rang) => ({ index: rang + 1, state: "ready" as const, readyStops: parJour.get(index) ?? 0 }));
      const ready = days.reduce((total, jour) => total + jour.readyStops, 0);
      return ok({ phase: "ready", tripId, days, expected: ready, ready });
    },
    /**
     * « Réessayer » de l'écran 5 (décision 0125 § 4) : un voyage de l'app arrêté est relancé sur son brief saisi, sous un
     * **nouveau** voyage (nouvelle exécution) ; le `tripId` rendu est celui du nouveau voyage. Seul l'aperçu se relance.
     */
    async retryGeneration(ctx, request) {
      const port = dependances.port();
      if (port === null || !duPrototype(ctx)) return fail("not_found");
      if (request.kind === "full") return fail("validation_failed");
      return resultatDuLancement(await port.relancer({ tripId: request.tripId, requestId: request.requestId }));
    },
    /** Aucun voyage complet à suivre : le programme d'un voyage d'essai est écrit entier dès le lancement (D4). */
    async getFullTripStatus(_ctx, tripId) {
      return ok({ phase: "none", tripId });
    },
  };
}
