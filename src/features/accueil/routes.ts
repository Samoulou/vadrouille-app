/** Routes de la précommande (prévente). `src` : provenance de la visite, déjà validée (`sourcePrevente`). */
export const preventeRoutes = {
  precommander: (src: string | null = null) => (src ? `/precommande?src=${src}` : "/precommande"),
} as const;
