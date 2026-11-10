"use client";

import { useCallback, useState } from "react";

import type { PlaceEtiquette } from "./etiquettes";

/** Mesure des places d'étiquettes d'un conteneur : immédiate (carte simulée) ou chargée à la demande (rendu Google). */
export type MesureEtiquettes = (container: HTMLElement) => PlaceEtiquette[] | Promise<PlaceEtiquette[]>;

/**
 * Places des étiquettes de ville (décision 0150 § 4), recalculées par `measure` : à chaque rendu de la carte simulée, à
 * chaque `idle` du rendu Google. `mesurer` doit être stable (fonction de module). L'état ne change que si les places
 * changent.
 */
export function useLabelPlaces(mesurer: MesureEtiquettes): {
  places: Readonly<Record<string, PlaceEtiquette>>;
  measure: (container: HTMLElement | null) => void;
} {
  const [places, setPlaces] = useState<Readonly<Record<string, PlaceEtiquette>>>({});
  const measure = useCallback(
    (container: HTMLElement | null) => {
      if (!container) return;
      const appliquer = (mesurees: PlaceEtiquette[]) => {
        const next = Object.fromEntries(mesurees.map((place) => [place.key, place]));
        setPlaces((current) => (JSON.stringify(current) === JSON.stringify(next) ? current : next));
      };
      const resultat = mesurer(container);
      if (resultat instanceof Promise) void resultat.then(appliquer);
      else appliquer(resultat);
    },
    [mesurer],
  );
  return { places, measure };
}
