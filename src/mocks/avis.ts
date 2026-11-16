import type { RetainedPreference } from "@/contracts";

import { LISBONNE_TRIP_ID } from "./autres-voyages";
import { EDIMBOURG_DEBLOQUE_TRIP_ID } from "./edimbourg";

/**
 * Candidats de goûts simulés de l'écran 16 (spécification F11, « Revue simulée » ; décision 0021 § 2, maintenue par 0160
 * § 1.2 point 5 ; M8c-1, ticket 1121). Jeu fixe par voyage, lu seulement par `src/adapters` et les tests ; sur `api`, les
 * candidats sont calculés depuis les signaux du tri (`src/domain/gouts.ts`). Triés par `preferenceKey`, comme le serveur.
 * Le jeu simulé peut contenir le sujet « distance » (0160 § 1.7 point 3). Codes maison : ni nom, ni `placeId`.
 */

const EVITER_MUSEES: RetainedPreference = {
  id: "category:museum:less",
  origin: "confirmed",
  subject: { kind: "category", category: "museum", direction: "less" },
};

const AIMER_DEGUSTATIONS: RetainedPreference = {
  id: "category:tasting:more",
  origin: "inferred",
  subject: { kind: "category", category: "tasting", direction: "more" },
};

const PRES_DE_L_HOTEL: RetainedPreference = { id: "distance", origin: "confirmed", subject: { kind: "distance" } };

const CANDIDATS: Readonly<Record<string, readonly RetainedPreference[]>> = {
  [LISBONNE_TRIP_ID]: [EVITER_MUSEES, AIMER_DEGUSTATIONS],
  [EDIMBOURG_DEBLOQUE_TRIP_ID]: [EVITER_MUSEES, PRES_DE_L_HOTEL],
};

/** Candidats simulés du voyage ; aucun pour les autres voyages (dont un voyage payé par la simulation, 0021 § 2). */
export function candidatsSimules(tripId: string): RetainedPreference[] {
  return Object.hasOwn(CANDIDATS, tripId) ? [...(CANDIDATS[tripId] ?? [])] : [];
}
