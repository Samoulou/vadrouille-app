"use client";

import { useSyncExternalStore } from "react";

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Réseau disponible (décision 0016 § 10, F7-TL-9) : `navigator.onLine`, mis à jour aux événements `online` et
 * `offline` ; `true` au rendu serveur. Créé par F10a, première PR qui en a besoin hors de la carte ; la carte
 * (`DayMap`) l'utilise aussi.
 */
export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}
