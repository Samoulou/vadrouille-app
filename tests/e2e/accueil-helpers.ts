import type { Page } from "@playwright/test";

/** Section « Démonstration » de la page d'accueil (spécification D1). */
export const demoSection = (page: Page) => page.getByRole("region", { name: "Démonstration" });
export const demoLinks = (page: Page) => demoSection(page).getByRole("listitem").getByRole("link");
/** Entrée « Créer un voyage » (ticket #259), hors de la section « Démonstration ». */
/** Premier « Créer un voyage », sous la promesse ; le second, même nom, est rappelé en fin de page (ticket 802). */
export const createLink = (page: Page) => page.getByRole("main").getByRole("link", { name: "Créer un voyage", exact: true }).first();
/** « Créer un voyage » rappelé dans le bloc « Prêt à partir ? » en fin de page (ticket 802). */
export const finalCreateLink = (page: Page) =>
  page.getByRole("region", { name: "Prêt à partir ?" }).getByRole("link", { name: "Créer un voyage", exact: true });
