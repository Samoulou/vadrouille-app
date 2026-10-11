import { mockTripAdapter } from "./mock";
import type { TripAdapter } from "./types";

export type { AdapterContext, TripAdapter } from "./types";
export { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP } from "./mock";
export { getRequestContext } from "./context";

/** Valeur normalisée de `DATA_ADAPTER` : absente ou vide = `mock`. */
function adapterChoice(value: string | undefined): string {
  return value?.trim() || "mock";
}

/**
 * Vrai quand l'adaptateur de données est `mock` (`DATA_ADAPTER` absent, vide ou `mock`), faux pour
 * toute autre valeur, sans lever d'erreur (spécification D1, D1-PO-1). Ne dépend ni de `NODE_ENV`
 * ni des pages de développement.
 */
export function isMockAdapter(value: string | undefined = process.env.DATA_ADAPTER): boolean {
  return adapterChoice(value) === "mock";
}

/**
 * Choisit l'adaptateur selon la variable serveur `DATA_ADAPTER`
 * (`mock` par défaut). Sans préfixe `NEXT_PUBLIC_`, elle n'est jamais
 * exposée au navigateur.
 */
export function getTripAdapter(value: string | undefined = process.env.DATA_ADAPTER): TripAdapter {
  const choice = adapterChoice(value);
  switch (choice) {
    case "mock":
      return mockTripAdapter;
    case "api":
      throw new Error("adaptateur api non implémenté");
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api)`);
  }
}
