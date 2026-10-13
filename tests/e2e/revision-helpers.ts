import { expect, type Locator, type Page } from "@playwright/test";

import { TRIP, sheet } from "./sejour-helpers";

/** Aides des specs de F7a (écran 14 « Remplacer une étape »), en 390 × 844. */

export const DEAN = "j2-dean-village";
export const PROPOSAL = "[Dégustation dans une épicerie fine de Stockbridge]";
export const REPLACE_DEAN = `/voyages/${TRIP}/jour/2/remplacer/${DEAN}`;
export const DEV_REPLACE_DEAN = `/dev${REPLACE_DEAN}`;

export const replaceTitle = (page: Page) => sheet(page).getByRole("heading", { level: 1 });
export const reasons = (page: Page) => sheet(page).getByRole("radiogroup", { name: "Pourquoi la remplacer ?" });
export const wishField = (page: Page) => sheet(page).getByRole("textbox", { name: "Ce que tu préfères (facultatif)" });
export const askButton = (page: Page) => sheet(page).getByRole("button", { name: "Voir une proposition" });
export const applyButton = (page: Page) => sheet(page).getByRole("button", { name: "Appliquer" });
export const proposalTitle = (page: Page) => sheet(page).locator("[data-part='proposition']").getByRole("heading", { level: 2 });
export const changes = (page: Page) => sheet(page).locator("[data-part='change-set']");
export const unchanged = (page: Page) => sheet(page).locator("[data-part='ne-bouge-pas']");

/** Choisit la raison, saisit le souhait éventuel, demande la proposition et attend son aperçu. */
export async function askProposal(page: Page, reason: string, wish?: string): Promise<Locator> {
  await reasons(page).getByRole("radio", { name: reason }).click();
  if (wish !== undefined) await wishField(page).fill(wish);
  await askButton(page).click();
  await expect(proposalTitle(page)).toBeFocused();
  return proposalTitle(page);
}
