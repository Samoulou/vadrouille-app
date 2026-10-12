"use client";

import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from "react";

import { draftReducer, initialDraft, type DraftAction, type DraftState } from "./draft";

interface DraftContextValue {
  state: DraftState;
  dispatch: Dispatch<DraftAction>;
}

const DraftContext = createContext<DraftContextValue | null>(null);

/**
 * Brouillon de création en mémoire de l'onglet (F8-PO-1, décision 0017 § 5), monté par le layout du groupe de
 * routes `(creation)`, commun aux écrans 1 à 4 et à `/connexion` : il survit à la navigation entre eux, jamais à
 * un rechargement. Aucun stockage navigateur (règle de lint de F4 étendue à la création).
 */
export function DraftProvider({ children, initial }: { children: ReactNode; initial?: DraftState }) {
  const [state, dispatch] = useReducer(draftReducer, initial ?? initialDraft());
  return <DraftContext.Provider value={{ state, dispatch }}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftContextValue {
  const value = useContext(DraftContext);
  if (!value) throw new Error("useDraft hors de DraftProvider");
  return value;
}
