"use client";

import { useCallback, useState } from "react";

export interface ElementSize {
  width: number;
  height: number;
}

/**
 * Taille (`clientWidth`, `clientHeight`) d'un élément, suivie par `ResizeObserver` (décision 0022 § 6) : la mesure
 * d'un conteneur, jamais de la fenêtre. Renvoie la référence à poser sur l'élément (référence par fonction : un
 * élément monté plus tard est mesuré aussi) et sa taille, `null` au rendu serveur et tant que l'élément n'est pas
 * monté. La première mesure a lieu à l'attache de la référence, avant la peinture.
 */
export function useElementSize<T extends HTMLElement>(): [(element: T | null) => (() => void) | undefined, ElementSize | null] {
  const [size, setSize] = useState<ElementSize | null>(null);

  const ref = useCallback((element: T | null) => {
    if (!element) return;
    const update = () =>
      setSize((previous) =>
        previous && previous.width === element.clientWidth && previous.height === element.clientHeight
          ? previous
          : { width: element.clientWidth, height: element.clientHeight },
      );
    update();
    const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      setSize(null);
    };
  }, []);

  return [ref, size];
}
