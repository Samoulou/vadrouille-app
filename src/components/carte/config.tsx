"use client";

import { createContext, useContext, type ComponentType, type ReactNode } from "react";

import type { MapView } from "./types";

/** Configuration de la carte Google (Q3) : clé du navigateur et Map ID au style Ligne. */
export interface MapConfig {
  apiKey?: string;
  mapId?: string;
}

/**
 * Valeur par défaut : les variables publiques, figées au build. Les références à
 * `process.env.NEXT_PUBLIC_…` restent littérales pour que Next.js les remplace.
 */
export function readMapConfig(): MapConfig {
  return {
    apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || undefined,
    mapId: process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID || undefined,
  };
}

/** Clé et Map ID présents et non vides. */
export function isMapConfigComplete(config: MapConfig): config is Required<MapConfig> {
  return Boolean(config.apiKey?.trim() && config.mapId?.trim());
}

/** Rendu de remplacement de la carte Google, injecté par les pages de développement et les tests (F4-TL-2). */
export type SimulatedRenderer = ComponentType<{ view: MapView }>;

/**
 * Injection (F4-TL-2, F4-TL-3) : configuration de la carte et, sur /dev/carte et dans les tests seulement,
 * la carte simulée. Les routes de production n'utilisent pas ce contexte : configuration lue dans
 * `process.env`, rendu Google. La carte simulée n'est jamais importée par `DayMap` : seul l'appelant
 * qui l'injecte l'embarque.
 */
export interface CarteInjection {
  config?: MapConfig;
  simulated?: SimulatedRenderer;
}

const CarteContext = createContext<CarteInjection>({});

export function CarteProvider({ value, children }: { value: CarteInjection; children: ReactNode }) {
  return <CarteContext.Provider value={value}>{children}</CarteContext.Provider>;
}

/** Configuration injectée, sinon celle de l'environnement ; carte simulée si elle est injectée. */
export function useCarteInjection(): { config: MapConfig; simulated?: SimulatedRenderer } {
  const injected = useContext(CarteContext);
  return { config: injected.config ?? readMapConfig(), simulated: injected.simulated };
}
