"use client";

import { useEffect, useState } from "react";

const MINUTE_MS = 60_000;

export interface ClientNowOptions {
  /** Horloge injectable (tests) ; `Date.now` par défaut. */
  now?: () => number;
  /**
   * Relit l'horloge au début de chaque minute (écran 15, F10-PO-3) : minuteur aligné sur la minute suivante,
   * reprogrammé après chaque lecture, y compris au retour de la page (`visibilitychange`).
   */
  tickEveryMinute?: boolean;
}

/**
 * Instant courant lu **après le montage** (décision 0021 § 3) : `null` au rendu serveur et au premier rendu
 * client, puis `now()`, relu quand la page redevient visible (`visibilitychange`). Le serveur ne choisit donc
 * jamais la date, et aucune liste n'est rendue à une date puis reclassée à l'hydratation : tant que la valeur
 * est `null`, l'écran montre son état d'attente. Avec `tickEveryMinute` (F10a), la valeur est aussi relue au
 * début de chaque minute : l'écran 15 passe à l'étape suivante sans rechargement.
 */
export function useClientNow({ now = Date.now, tickEveryMinute = false }: ClientNowOptions = {}): number | null {
  const [value, setValue] = useState<number | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = () => {
      const current = now();
      setValue(current);
      if (!tickEveryMinute) return;
      clearTimeout(timer);
      // Minute suivante de l'horloge (les fuseaux réels sont décalés de minutes entières par rapport à UTC).
      timer = setTimeout(read, MINUTE_MS - (((current % MINUTE_MS) + MINUTE_MS) % MINUTE_MS));
    };
    read();
    const onVisibility = () => {
      if (document.visibilityState === "visible") read();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [now, tickEveryMinute]);
  return value;
}
