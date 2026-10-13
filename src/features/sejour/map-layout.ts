"use client";

import { useMemo, useState } from "react";

import type { FitPadding } from "@/components/carte/types";
import { DEFAULT_SNAP, type SnapPoint } from "@/components/ligne/sheet-model";
import { useLargeScreen } from "@/lib/large-screen";
import { useElementSize, type ElementSize } from "@/lib/use-element-size";

/**
 * Mise en page commune « carte en fond, panneau `Sheet` au-dessus » de `TripShell` (Séjour, Journée) et de
 * `SharedShell` (vue partagée, F10c) : extraite de `TripShell` pour n'avoir qu'une implémentation (décision 0039,
 * F10-TL-14, « sans duplication »).
 */

/**
 * Marge du cadrage (décision 0022 § 6, amende 0016 § 1.3) : `--touch-target` de chaque côté ; en mobile, le panneau
 * à 55 % de la hauteur de `main` en bas ; en grand écran, rien de plus (le panneau ne couvre pas la carte).
 */
export function layoutFitPadding(main: ElementSize, largeScreen: boolean): FitPadding {
  const side = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--touch-target")) || 0;
  return { top: side, right: side, bottom: largeScreen ? side : DEFAULT_SNAP * main.height, left: side };
}

/**
 * Partie de la carte couverte par le panneau (décision 0015 § 4, 0022 § 6) : en mobile, `snap` de la hauteur de
 * `main` en bas ; en grand écran, aucune (le recentrage place l'étape au milieu de la zone de la carte).
 */
export function layoutVisibleInsets(main: ElementSize, snap: SnapPoint, largeScreen: boolean): FitPadding {
  return { top: 0, right: 0, bottom: largeScreen ? 0 : snap * main.height, left: 0 };
}

export interface MapLayout {
  /** Référence de `main`, base des hauteurs du panneau (mesures du conteneur, pas de la fenêtre, 0022 § 6). */
  mainRef: (element: HTMLElement | null) => (() => void) | undefined;
  largeScreen: boolean;
  visibleInsets: FitPadding | undefined;
  fitPadding: FitPadding | undefined;
  fitScope: "grand-ecran" | "mobile" | undefined;
}

/**
 * Mesures de `main`, marge du cadrage et partie de la carte couverte par le panneau à la hauteur `snap` (état du
 * panneau, gardé par chaque mise en page).
 */
export function useMapLayout(snap: SnapPoint): MapLayout {
  const [mainRef, main] = useElementSize<HTMLElement>();
  const largeScreen = useLargeScreen();
  const visibleInsets = useMemo<FitPadding | undefined>(
    () => (main && main.height > 0 ? layoutVisibleInsets(main, snap, largeScreen) : undefined),
    [main, snap, largeScreen],
  );
  // Marge du cadrage : calculée à la première mesure, puis seulement au passage du seuil (recadrage unique).
  const [fit, setFit] = useState<{ largeScreen: boolean; padding: FitPadding } | null>(null);
  if (main && main.height > 0 && (fit === null || fit.largeScreen !== largeScreen)) {
    setFit({ largeScreen, padding: layoutFitPadding(main, largeScreen) });
  }
  return {
    mainRef,
    largeScreen,
    visibleInsets,
    fitPadding: fit?.padding,
    fitScope: fit ? (fit.largeScreen ? "grand-ecran" : "mobile") : undefined,
  };
}
