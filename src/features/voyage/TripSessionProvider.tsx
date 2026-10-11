"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

import type { PaymentMethod } from "@/contracts/values";

import { EMPTY_SESSION, recordCheckout, reportCheckout, type ReportKind, type StartedCheckout, type TripSessionState } from "./trip-session";

export interface TripSession {
  /** Paiement commencé dans cet onglet, pour ce voyage. */
  recordCheckout(checkoutId: string, method: PaymentMethod): void;
  /**
   * Première observation d'une issue : le paiement à mesurer, ou `null` (pas commencé dans l'onglet, déjà
   * rapporté, ou `duplicate` avec `kind: null`). Synchrone : deux appels ne rapportent jamais deux fois.
   */
  reportCheckout(checkoutId: string, kind: ReportKind | null): StartedCheckout | null;
}

interface TripSessionStore {
  get(): TripSessionState;
  set(state: TripSessionState): void;
}

const TripSessionContext = createContext<TripSessionStore | null>(null);

/**
 * Fournisseur de l'onglet (décision 0020 § 8), monté par `src/app/voyages/[id]/layout.tsx` : état en mémoire
 * de l'onglet seulement, rangé par voyage, perdu au rechargement. Aucun stockage navigateur, aucun cookie,
 * rien dans l'adresse. Aucune dépendance : il entre dans le JavaScript initial de la Journée.
 */
export function TripSessionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<TripSessionState>(EMPTY_SESSION);
  const store = useMemo<TripSessionStore>(
    () => ({
      get: () => ref.current,
      set: (state) => {
        ref.current = state;
      },
    }),
    [],
  );
  return <TripSessionContext.Provider value={store}>{children}</TripSessionContext.Provider>;
}

/** Session de l'onglet pour `tripId` ; sans fournisseur (tests isolés), une session locale au composant. */
export function useTripSession(tripId: string): TripSession {
  const provided = useContext(TripSessionContext);
  const localRef = useRef<TripSessionState>(EMPTY_SESSION);
  return useMemo<TripSession>(() => {
    const get = () => (provided ? provided.get() : localRef.current);
    const set = (state: TripSessionState) => {
      if (provided) provided.set(state);
      else localRef.current = state;
    };
    return {
      recordCheckout(checkoutId, method) {
        set(recordCheckout(get(), tripId, checkoutId, method));
      },
      reportCheckout(checkoutId, kind) {
        const result = reportCheckout(get(), tripId, checkoutId, kind);
        set(result.state);
        return result.report;
      },
    };
  }, [provided, tripId]);
}
