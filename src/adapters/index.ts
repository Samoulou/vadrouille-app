import { mockTripAdapter } from "./mock";
import type { TripAdapter } from "./types";

export type { AdapterContext, TripAdapter } from "./types";
export { MOCK_DEMO_TRIP } from "./mock";

/**
 * Choisit l'adaptateur selon la variable serveur `DATA_ADAPTER`
 * (`mock` par défaut). Sans préfixe `NEXT_PUBLIC_`, elle n'est jamais
 * exposée au navigateur.
 */
export function getTripAdapter(value: string | undefined = process.env.DATA_ADAPTER): TripAdapter {
  const choice = value?.trim() || "mock";
  switch (choice) {
    case "mock":
      return mockTripAdapter;
    case "api":
      throw new Error("adaptateur api non implémenté");
    default:
      throw new Error(`DATA_ADAPTER inconnu : « ${choice} » (valeurs : mock, api)`);
  }
}
