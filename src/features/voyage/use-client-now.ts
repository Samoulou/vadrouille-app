"use client";

import { useEffect, useState } from "react";

export interface ClientNowOptions {
  /** Horloge injectable (tests) ; `Date.now` par défaut. */
  now?: () => number;
}

/**
 * Instant courant lu **après le montage** (décision 0021 § 3) : `null` au rendu serveur et au premier rendu
 * client, puis `now()`, relu quand la page redevient visible (`visibilitychange`). Le serveur ne choisit donc
 * jamais la date, et aucune liste n'est rendue à une date puis reclassée à l'hydratation : tant que la valeur
 * est `null`, l'écran montre son état d'attente. F10a y ajoute le minuteur aligné sur la minute.
 */
export function useClientNow({ now = Date.now }: ClientNowOptions = {}): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    const read = () => setValue(now());
    read();
    const onVisibility = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [now]);
  return value;
}
