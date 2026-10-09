import type { Page } from "@playwright/test";

/** Section « Démonstration » de la page d'accueil (spécification D1). */
export const demoSection = (page: Page) => page.getByRole("region", { name: "Démonstration" });
export const demoLinks = (page: Page) => demoSection(page).getByRole("listitem").getByRole("link");
