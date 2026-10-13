import { randomUUID } from "node:crypto";

import { expect, type Locator, type Page } from "@playwright/test";

import { MOCK_AUTH_CONFIG } from "../../src/adapters/mock-auth";
import { MOCK_AUTH_CODE, MOCK_KNOWN_EMAIL, MOCK_WRONG_AUTH_CODE } from "../../src/mocks/auth-simule";

/**
 * Aides des specs de l'écran 4 (F8b), en 390 × 844 sur le build de production. Les limites (durée du code, essais,
 * demandes, fenêtre) sont lues dans la configuration de l'adaptateur simulé, jamais recopiées dans un test ; le code
 * valable et un code faux viennent du jeu simulé. L'horloge du serveur n'avance que par `R-sim`, jamais par
 * `page.clock` (décision 0017 § 10).
 */

export const AUTH_CONFIG = MOCK_AUTH_CONFIG;
export const MOCK_CODE = MOCK_AUTH_CODE;
export const MOCK_WRONG_CODE = MOCK_WRONG_AUTH_CODE;
export const KNOWN_EMAIL = MOCK_KNOWN_EMAIL;

/** Adresse inconnue du jeu simulé, propre à l'appel : la portée par défaut compte les demandes par adresse. */
export function uniqueEmail(): string {
  return `test-${randomUUID().slice(0, 8)}@exemple.org`;
}

export const connexionRoute = (suite: string) => `/connexion?suite=${encodeURIComponent(suite)}`;
export const emailField = (page: Page) => page.getByRole("textbox", { name: "Ton adresse email" });
export const codeGroup = (page: Page) => page.getByRole("group", { name: "Code reçu par email" });
export const codeCells = (page: Page) => codeGroup(page).getByRole("textbox");
export const firstCell = (page: Page) => page.getByRole("textbox", { name: "Chiffre 1 sur 6" });
export const resendButton = (page: Page) => page.getByRole("button", { name: "Renvoyer le code", exact: true });
/** Région `role="alert"` de l'étape code (celle que le groupe de cases désigne). */
export const codeAlert = (page: Page) => page.locator("#code-alerte");
export const codeStatus = (page: Page) => codeGroup(page).locator("xpath=..").getByRole("status");

/** Colle `code` dans la première case, comme un collage depuis le presse-papiers. */
export async function pasteCode(page: Page, code: string, cell: Locator = firstCell(page)) {
  await cell.evaluate((element, text) => {
    const data = new DataTransfer();
    data.setData("text/plain", text);
    element.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
  }, code);
}

/** Étape email : adresse, « Recevoir un code », étape code affichée, focus sur la première case. */
export async function requestCodeFor(page: Page, email: string) {
  await emailField(page).fill(email);
  await page.getByRole("button", { name: "Recevoir un code", exact: true }).click();
  await expect(page.getByText(`Code envoyé à ${email}`)).toBeVisible();
  await expect(firstCell(page)).toBeFocused();
}

/** État visible de l'étape code : message de la région alert, `aria-invalid` et désactivation des cases. */
export async function codeState(page: Page) {
  const cells = await codeCells(page).all();
  return {
    alert: ((await codeAlert(page).textContent()) ?? "").trim(),
    invalid: await Promise.all(cells.map((cell) => cell.getAttribute("aria-invalid"))),
    disabled: await Promise.all(cells.map((cell) => cell.isDisabled())),
    values: await Promise.all(cells.map((cell) => cell.inputValue())),
  };
}
