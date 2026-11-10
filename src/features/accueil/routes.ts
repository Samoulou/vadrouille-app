/** Routes de la précommande (prévente). `src` : provenance de la visite, déjà validée (`sourcePrevente`). */
export const preventeRoutes = {
  precommander: (src: string | null = null) => (src ? `/precommande?src=${src}` : "/precommande"),
} as const;

/**
 * Pages légales de la précommande (ticket 1125). Sous `/precommande/` : elles héritent de ses en-têtes (ni cache ni
 * indexation, `next.config.ts`). Elles répondent 404 tant que `pagesLegalesDisponibles()` (`@/adapters`) est faux.
 */
export const pagesLegalesRoutes = {
  mentions: "/precommande/mentions-legales",
  conditions: "/precommande/conditions-de-vente",
  donnees: "/precommande/donnees",
} as const;
