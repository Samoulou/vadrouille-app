import { randomUUID } from "node:crypto";

import { vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import type { AdapterContext } from "@/adapters/types";
import type { Brief, TripDraft, TripRequest } from "@/contracts";
import type { PlafondsUsage } from "@/server/config/usage";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { etapeAncrage, etapeBrief, etapeLogement, etapeNotation, etapePlanification, etapeRecherche } from "@/server/generation/etapes";
import type { EtatEtape } from "@/server/generation/etat";
import { creerWithOrg, creerWithSystemOrgPourTests } from "./banc-apercu-contexte";

import { PLAFONDS_USAGE_TEST } from "./plafonds-usage";
import { creerHorlogeManuelle } from "./horloge-manuelle";

export { creerWithOrg, creerWithSystemOrgPourTests };
export const MAINTENANT = Date.parse("2026-10-20T10:00:00Z");

/**
 * Plafonds de test assez larges pour un aperçu complet (ceux de `PLAFONDS_USAGE_TEST` ne suffisent pas à 11 fiches), et
 * aussi petits que possible : chaque forfait réservé s'ajoute aux sommes globales du jour et du mois de la base de test,
 * que `usage.test.ts` mesure (quota de 1 000 requêtes par méthode et par jour).
 */
export const PLAFONDS_LARGES: PlafondsUsage = {
  ...PLAFONDS_USAGE_TEST,
  parOrganisationJourMicros: 50_000_000,
  limites: {
    ...PLAFONDS_USAGE_TEST.limites,
    quotaJourParMethode: 1_000_000_000,
    moisGoogleMicros: 90_000_000_000,
    enveloppeGoogleMicros: 100_000_000_000,
    moisModelesMicros: 90_000_000_000,
    enveloppeModelesMicros: 100_000_000_000,
  },
  generations: {
    ...PLAFONDS_USAGE_TEST.generations,
    apercu: { coutModelesMicros: 600_000, placesTextSearch: 30, placesDetails: 30, routesRequetes: 10, routesElements: 300 },
  },
};

export const BRIEF_EDIMBOURG: Brief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["restaurant", "tasting", "walk", "museum"],
  limits: [],
  mobility: ["walk", "transit"],
  mealBudgetPerPerson: 40,
  inferredFields: [],
};

export const BROUILLON_EDIMBOURG: TripDraft = {
  destination: "Édimbourg",
  start: "2026-11-23",
  end: "2026-11-28",
  lodging: { kind: "known", label: "Vieille ville d'Édimbourg (Old Town)" },
  otherCities: [],
  commitments: [],
};

export const demandeEdimbourg = (draft: Partial<TripDraft> = {}, brief: Brief = BRIEF_EDIMBOURG): TripRequest => ({
  requestId: randomUUID(),
  draft: { ...BROUILLON_EDIMBOURG, ...draft },
  brief,
});

export function banc(withOrg: ReturnType<typeof creerWithOrg>) {
  const demarrer = vi.fn<(generationRunId: string, organizationId: string) => Promise<string | null>>(async () => null);
  const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: demarrer });
  return { adapter, demarrer };
}

export const contexteDe = (org: { org: string; owner: string }): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

export const ETAPES = [etapeBrief, etapeLogement, etapeRecherche, etapeAncrage, etapeNotation, etapePlanification] as const;

/** Déroule les six étapes comme `generatePreview`, sans le SDK : une étape arrêtée passe les suivantes. */
export async function derouler(etat: EtatEtape, dependances: DependancesGeneration, jusqua: number = ETAPES.length): Promise<EtatEtape> {
  let courant = etat;
  for (const etape of ETAPES.slice(0, jusqua)) {
    if (courant.arret !== undefined) break;
    courant = await etape(courant, dependances);
  }
  return courant;
}

export { creerHorlogeManuelle };
