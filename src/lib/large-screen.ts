"use client";

import { useSyncExternalStore } from "react";

/**
 * Seuil du grand écran (spécification F12, F12-PO-5 ; décision 0022 § 5) : le point d'arrêt `lg` de Tailwind
 * (`64rem`, 1024 px à la taille de texte par défaut, Q178). La disposition se fait en CSS (`lg:`) ; cette requête
 * ne sert qu'au comportement (`Sheet`, recentrage de la carte). Seule requête de largeur du code.
 */
export const LARGE_SCREEN_QUERY = "(min-width: 64rem)";

function subscribe(callback: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const media = window.matchMedia(LARGE_SCREEN_QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(LARGE_SCREEN_QUERY).matches;
}

/** Faux au rendu serveur et à l'hydratation (même rendu des deux côtés du seuil), valeur réelle ensuite. */
export function useLargeScreen(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
