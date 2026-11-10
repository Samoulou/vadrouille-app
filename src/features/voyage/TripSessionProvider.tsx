"use client";

import { createContext, useContext, useMemo, useRef, type ReactNode } from "react";

import type { RetainedTaste } from "@/contracts";
import type { PaymentMethod, StopRating } from "@/contracts/values";

import {
  EMPTY_SESSION,
  lastTabOf,
  recordCheckout,
  recordLastTab,
  recordReview,
  reportCheckout,
  reviewsOf,
  type LastTab,
  type ReportKind,
  type StartedCheckout,
  type TripSessionState,
} from "./trip-session";

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
  /** Goûts retenus de l'onglet (`mock`, M8c-1 ; 0021 § 4) : au niveau de l'onglet, pas d'un voyage. */
  tastes(): readonly RetainedTaste[];
  setTastes(tastes: readonly RetainedTaste[]): void;
}

const AUCUN_GOUT: readonly RetainedTaste[] = [];

const TripSessionContext = createContext<TripSessionStore | null>(null);

/**
 * Fournisseur de l'onglet (décision 0020 § 8), monté par `src/app/voyages/layout.tsx` (décision 0021 § 4, qui le
 * déplace au niveau de « Mes voyages ») : état en mémoire de l'onglet seulement, rangé par voyage, perdu au
 * rechargement. Aucun stockage navigateur, aucun cookie, rien dans l'adresse. Aucune dépendance : il entre dans
 * le JavaScript initial de la Journée.
 */
export function TripSessionProvider({ children }: { children: ReactNode }) {
  const ref = useRef<TripSessionState>(EMPTY_SESSION);
  const tastesRef = useRef<readonly RetainedTaste[]>(AUCUN_GOUT);
  const store = useMemo<TripSessionStore>(
    () => ({
      get: () => ref.current,
      set: (state) => {
        ref.current = state;
      },
      tastes: () => tastesRef.current,
      setTastes: (tastes) => {
        tastesRef.current = tastes;
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

/** Mémoire des onglets de l'onglet du navigateur (F11a, décision 0021 § 4). */
export interface TabMemory {
  /** Enregistre le dernier onglet consulté du voyage (Séjour ou Journée n). */
  recordLastTab(tripId: string, tab: LastTab): void;
  /** Dernier onglet consulté du voyage, ou `undefined`. */
  lastTab(tripId: string): LastTab | undefined;
  /** Avis de l'écran 16 sur `mock` (M8a) : lus et écrits dans la mémoire de l'onglet seulement. */
  reviews(tripId: string): ReadonlyMap<string, StopRating>;
  recordReview(tripId: string, stopId: string, rating: StopRating | null): void;
  /** Goûts retenus sur `mock` (M8c-1) : liste ordonnée de l'onglet, lue par l'écran 16 et par « Mes voyages ». */
  tastes(): readonly RetainedTaste[];
  setTastes(tastes: readonly RetainedTaste[]): void;
}

/**
 * Mémoire des onglets, ou `null` hors du fournisseur : les pages de développement (`/dev/voyages`, sans
 * fournisseur) et les tests isolés n'enregistrent rien.
 */
export function useOptionalTripSession(): TabMemory | null {
  const provided = useContext(TripSessionContext);
  return useMemo<TabMemory | null>(
    () =>
      provided
        ? {
            recordLastTab(tripId, tab) {
              provided.set(recordLastTab(provided.get(), tripId, tab));
            },
            lastTab(tripId) {
              return lastTabOf(provided.get(), tripId);
            },
            reviews(tripId) {
              return reviewsOf(provided.get(), tripId);
            },
            recordReview(tripId, stopId, rating) {
              provided.set(recordReview(provided.get(), tripId, stopId, rating));
            },
            tastes: () => provided.tastes(),
            setTastes: (tastes) => provided.setTastes(tastes),
          }
        : null,
    [provided],
  );
}
