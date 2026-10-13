"use client";

import { useCallback, useRef, type KeyboardEvent } from "react";

/** Flèches vers l'option suivante ou précédente, dans les deux axes (WAI-ARIA, groupe radio). */
const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

export interface UseRadioGroupOptions {
  /** Nombre d'options du groupe. */
  count: number;
  /** Rang de l'option cochée, ou `-1` si aucune ne l'est. */
  selectedIndex: number;
  /** Coche l'option de ce rang (jamais une option désactivée, jamais l'option déjà cochée). */
  onSelect: (index: number) => void;
  /**
   * Option désactivée (jour « complet », décision 0019 § 1.2) : les flèches y posent le focus, pour qu'elle reste
   * atteignable et annoncée, mais ne la cochent pas ; un clic, Espace ou Entrée n'ont aucun effet.
   */
  isDisabled?: (index: number) => boolean;
}

export interface RadioGroup {
  /** Rang de l'option qui porte l'unique arrêt de tabulation (`tabIndex={0}`). */
  tabStop: number;
  /** Référence de l'option de ce rang (déplacement du focus par les flèches). */
  itemRef: (index: number) => (element: HTMLElement | null) => void;
  /** Flèches, Début et Fin sur l'option de ce rang. */
  onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void;
  /** Clic, Espace ou Entrée sur l'option de ce rang : la coche si elle n'est ni désactivée ni déjà cochée. */
  onActivate: (index: number) => void;
}

/** Arrêt de tabulation (décision 0019 § 1.2) : l'option cochée, sinon la première non désactivée, sinon la première. */
export function radioTabStop(count: number, selectedIndex: number, isDisabled?: (index: number) => boolean): number {
  if (selectedIndex >= 0 && selectedIndex < count) return selectedIndex;
  for (let index = 0; index < count; index += 1) {
    if (!isDisabled?.(index)) return index;
  }
  return 0;
}

/** Rang visé par une touche depuis `index`, avec bouclage ; `null` pour une autre touche. */
export function radioTarget(key: string, index: number, count: number): number | null {
  if (count <= 0) return null;
  if (NEXT_KEYS.has(key)) return (index + 1) % count;
  if (PREVIOUS_KEYS.has(key)) return (index - 1 + count) % count;
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  return null;
}

/**
 * Logique clavier commune des groupes radio (décision 0019 § 1.2, extraite de `SegmentedControl` de F2) : un seul
 * arrêt de tabulation, flèches dans les deux axes, Début et Fin, bouclage, le choix suit le focus. Seule
 * implémentation de groupe radio de `src/components` et `src/features` : `SegmentedControl` et `DayBadgeGroup`
 * l'utilisent. Le rendu (rôles, `aria-checked`, classes) reste au composant.
 */
export function useRadioGroup({ count, selectedIndex, onSelect, isDisabled }: UseRadioGroupOptions): RadioGroup {
  const refs = useRef<(HTMLElement | null)[]>([]);

  const itemRef = useCallback(
    (index: number) => (element: HTMLElement | null) => {
      refs.current[index] = element;
    },
    [],
  );

  const onActivate = (index: number) => {
    if (index === selectedIndex || isDisabled?.(index)) return;
    onSelect(index);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    const target = radioTarget(event.key, index, count);
    if (target === null) return;
    event.preventDefault();
    refs.current[target]?.focus();
    onActivate(target);
  };

  return { tabStop: radioTabStop(count, selectedIndex, isDisabled), itemRef, onKeyDown, onActivate };
}
