import type { FitPadding } from "./types";

/** Valeur calculée d'une variable CSS des tokens, lue à l'exécution (aucune valeur en dur). */
export function cssVar(name: string): string {
  if (typeof document === "undefined") {
    return "";
  }
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

/** Longueur d'une variable CSS en pixels (0 si absente). */
export function cssLength(name: string): number {
  const value = Number.parseFloat(cssVar(name));
  return Number.isFinite(value) ? value : 0;
}

/** Marge de cadrage par défaut : `--touch-target` de chaque côté (F4-PO-7). */
export function defaultFitPadding(): FitPadding {
  const side = cssLength("--touch-target");
  return { top: side, right: side, bottom: side, left: side };
}

/** `prefers-reduced-motion: reduce` actif. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}
