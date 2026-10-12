"use client";

import { createContext, useContext, useEffect, useMemo, useRef, type ReactNode } from "react";

/**
 * Ligne d'origine d'une fiche ouverte depuis le Séjour (spécification F5, F5-PO-8) : après « Pendant ton
 * séjour » → fiche de l'événement → retour du navigateur, le focus revient sur la ligne d'origine.
 *
 * Monté par la mise en page du voyage (`TripLayout`), donc conservé d'une page du voyage à l'autre, en mémoire
 * seulement. La ligne n'est rendue que si l'on revient au Séjour par l'historique (`popstate`) : revenir au
 * Séjour par l'onglet « Séjour » ne déplace pas le focus.
 */
export interface SejourOrigin {
  /** Retient l'adresse du lien activé dans le Séjour. */
  remember: (href: string) => void;
  /** Adresse retenue si l'on est revenu par l'historique depuis, sinon `null` ; vide la mémoire dans tous les cas. */
  take: () => string | null;
}

const SejourOriginContext = createContext<SejourOrigin | null>(null);

export function SejourOriginProvider({ children }: { children: ReactNode }) {
  const origin = useRef<{ href: string; popped: boolean } | null>(null);

  useEffect(() => {
    const onPopState = () => {
      if (origin.current) origin.current.popped = true;
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const value = useMemo<SejourOrigin>(
    () => ({
      remember: (href) => {
        origin.current = { href, popped: false };
      },
      take: () => {
        const current = origin.current;
        origin.current = null;
        return current?.popped ? current.href : null;
      },
    }),
    [],
  );

  return <SejourOriginContext.Provider value={value}>{children}</SejourOriginContext.Provider>;
}

/** Mémoire de la ligne d'origine, ou `null` hors de `SejourOriginProvider` (aucun retour du focus). */
export function useSejourOrigin(): SejourOrigin | null {
  return useContext(SejourOriginContext);
}
