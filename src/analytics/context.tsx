"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";

import { createTracker, noopRecorder, type EventRecorder, type Track } from "./track";

const AnalyticsContext = createContext<Track>(createTracker(noopRecorder));

/** Injecte l'enregistreur des événements de mesure (décision 0013, § 3.3). */
export function AnalyticsProvider({ recorder, children }: { recorder: EventRecorder; children: ReactNode }) {
  const track = useMemo(() => createTracker(recorder), [recorder]);
  return <AnalyticsContext.Provider value={track}>{children}</AnalyticsContext.Provider>;
}

/** `track(event)` de l'enregistreur injecté ; sans fournisseur, aucun effet. */
export function useTrack(): Track {
  return useContext(AnalyticsContext);
}
