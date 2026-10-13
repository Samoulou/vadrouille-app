import type { Page } from "@playwright/test";

/** Section « Démonstration » de la page d'accueil (spécification D1). */
export const demoSection = (page: Page) => page.getByRole("region", { name: "Démonstration" });
export const demoLinks = (page: Page) => demoSection(page).getByRole("listitem").getByRole("link");
/** Entrée « Créer un voyage » (ticket #259), hors de la section « Démonstration ». */
export const createLink = (page: Page) => page.getByRole("main").getByRole("link", { name: "Créer un voyage", exact: true });
