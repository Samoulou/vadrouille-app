import { expect, test, type Page } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import {
  AUTH_CONFIG,
  KNOWN_EMAIL,
  MOCK_CODE,
  MOCK_WRONG_CODE,
  codeAlert,
  codeCells,
  codeGroup,
  codeState,
  connexionRoute,
  emailField,
  firstCell,
  pasteCode,
  requestCodeFor,
  resendButton,
  uniqueEmail,
} from "./connexion-helpers";
import { EDIMBOURG, R1, R2, R3, R4_LANCER, R_LANCER, continueButton, field, fillTrip, installClock, reachAfterBrief, reachReview } from "./creation-helpers";
import { expectPath, pathOf, useScope, type Scope } from "./debloquer-helpers";
import { R5 } from "./preparation-helpers";

/**
 * Écran 4 « Compte » (spécification F8, critères [b] ; décisions 0017 § 3.5 et § 10, 0018 § 18), build de
 * production, 390 × 844, domaines Google bloqués, horloge du navigateur au 2026-08-01T08:00. Chaque test a sa portée
 * de simulation (en-tête vers l'origine de l'application seulement) ; l'horloge du serveur n'avance que par `R-sim`.
 * Depuis F8c, `R-lancer` crée le voyage et remplace l'adresse par l'écran 5 (`preparation.e2e.spec.ts`).
 */

let googleRequests: string[] = [];
let foreignRequests: string[] = [];
let scope: Scope;

test.beforeEach(async ({ page, context, baseURL }) => {
  googleRequests = await blockGoogle(page);
  foreignRequests = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) foreignRequests.push(request.url());
  });
  scope = await useScope(context, baseURL!);
  await installClock(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const WARNING = /Connexion simulée : aucun email n'est envoyé/;
const MINUTES = AUTH_CONFIG.codeTtlMs / 60_000;

/** « Renvoyer le code », puis attente de la réponse de l'action serveur (un renvoi pendant un autre est ignoré). */
async function resend(page: Page) {
  const response = page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname === "/connexion", { timeout: 5000 });
  await resendButton(page).click();
  await response;
}

test("connexion: code à 6 chiffres", async ({ page }) => {
  await reachAfterBrief(page);
  await expectPath(page, R3);
  await button(page, "Partir du quartier, choisir plus tard").click();
  await expectPath(page, R4_LANCER);
  await expect(heading(page)).toHaveText("Connecte-toi pour recevoir tes propositions");
  await expect(page.getByText(WARNING)).toBeVisible();

  // Email invalide : refusé sans appel.
  const actions: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST") actions.push(request.url());
  });
  await emailField(page).fill("camille@exemple");
  await button(page, "Recevoir un code").click();
  await expect(emailField(page)).toHaveAttribute("aria-invalid", "true");
  await expect(emailField(page)).toBeFocused();
  expect(actions).toEqual([]);

  await requestCodeFor(page, KNOWN_EMAIL);
  await expect(page.getByText(`Code envoyé à ${KNOWN_EMAIL}. Il est valable ${MINUTES} minutes.`)).toBeVisible();
  await expect(page.getByText(WARNING)).toBeVisible();
  // Libellé visible au-dessus des cases, qui nomme le groupe (aria-labelledby, sans aria-label).
  const label = page.getByText("Code reçu par email", { exact: true });
  await expect(label).toBeVisible();
  await expect(codeGroup(page)).not.toHaveAttribute("aria-label");
  expect(await codeGroup(page).getAttribute("aria-labelledby")).toBe(await label.getAttribute("id"));
  await expect(codeCells(page)).toHaveCount(6);

  // Collage du code valable : vérification sans bouton, puis le lancement (F8c) remplace l'adresse par l'écran 5.
  await expect(page.getByRole("button", { name: /Valider/ })).toHaveCount(0);
  await pasteCode(page, MOCK_CODE);
  await expectPath(page, R5);
  // Le retour du navigateur ne ramène pas au formulaire de code.
  await page.goBack();
  await expect.poll(() => pathOf(page)).not.toBe(R4_LANCER);
  await expect(firstCell(page)).toHaveCount(0);
});

test("connexion: retour vers la création", async ({ page }) => {
  const visited: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(new URL(frame.url()).pathname);
  });
  page.on("request", (request) => visited.push(new URL(request.url()).pathname));

  // Voyage « Pas encore » : « Retour » mène à R3, choix conservé ; puis R2 et R1 avec les saisies.
  await reachAfterBrief(page);
  await expectPath(page, R3);
  await button(page, "Partir du quartier, choisir plus tard").click();
  await expectPath(page, R4_LANCER);
  await button(page, "Retour").click();
  await expectPath(page, R3);
  await expect(heading(page)).toHaveText("Où loger à Édimbourg");
  await button(page, "Retour").click();
  await expectPath(page, R2);
  await expect(heading(page)).toHaveText("Vérifie tes envies");
  await button(page, "Continuer").click();
  await expectPath(page, R3);
  await button(page, "Partir du quartier, choisir plus tard").click();
  await expectPath(page, R4_LANCER);

  // Voyage avec logement « Oui » : « Retour » mène à R2, état « Vérification », brief conservé.
  await page.goto(R1);
  await fillTrip(page, { ...EDIMBOURG, lodging: "Oui" });
  await field(page, "Nom ou adresse du logement").fill("[Hôtel de test]");
  await continueButton(page).click();
  await expectPath(page, R2);
  await reachReview(page);
  await continueButton(page).click();
  await expectPath(page, R4_LANCER);
  await button(page, "Retour").click();
  await expectPath(page, R2);
  await expect(heading(page)).toHaveText("Vérifie tes envies");
  expect(visited).not.toContain(R_LANCER);

  // Ouvert hors création : « Retour » mène à « Mes voyages ».
  await page.goto(connexionRoute("/voyages/mock_trip_edimbourg"));
  await expect(heading(page)).toHaveText("Connexion");
  await button(page, "Retour").click();
  await expectPath(page, "/voyages");
});

test("connexion: erreurs du code", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  const email = uniqueEmail();
  await requestCodeFor(page, email);

  // Code faux : alerte reliée au groupe, aria-invalid, cases vidées, focus sur la première.
  await pasteCode(page, MOCK_WRONG_CODE);
  await expect(codeAlert(page)).toHaveText("Ce code ne correspond pas. Vérifie-le ou demande un nouveau code.");
  await expect(codeGroup(page)).toHaveAttribute("aria-describedby", "code-alerte");
  for (const cell of await codeCells(page).all()) {
    await expect(cell).toHaveAttribute("aria-invalid", "true");
    await expect(cell).toHaveValue("");
  }
  await expect(firstCell(page)).toBeFocused();
  await expect(page.getByText("Ce code ne correspond pas.", { exact: false })).toHaveCount(1);

  // Au maxAttempts-ième code faux : « Trop d'essais. », cases désactivées jusqu'au renvoi.
  for (let attempt = 2; attempt <= AUTH_CONFIG.maxAttempts; attempt += 1) {
    await expect(firstCell(page)).toBeEnabled();
    await pasteCode(page, MOCK_WRONG_CODE);
  }
  await expect(codeAlert(page)).toHaveText(/^Trop d'essais\./);
  for (const cell of await codeCells(page).all()) await expect(cell).toBeDisabled();
  await expect(resendButton(page)).toBeFocused();
  await resendButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Nouveau code envoyé." })).toBeVisible();
  await expect(firstCell(page)).toBeEnabled();

  // Code expiré : horloge de la portée avancée de codeTtlMs + 1 s par R-sim (jamais par page.clock).
  await scope.control({ action: "advanceClock", ms: AUTH_CONFIG.codeTtlMs + 1000 });
  await pasteCode(page, MOCK_CODE);
  await expect(codeAlert(page)).toHaveText(/^Ce code a expiré\./);

  // maxCodeRequests demandes acceptées (envoi et renvois) dans la fenêtre ; la suivante : « Trop de demandes. ».
  await scope.control({ action: "reset", now: "2026-08-01T12:00:00+02:00" });
  for (let request = 1; request <= AUTH_CONFIG.maxCodeRequests; request += 1) {
    await resend(page);
    await expect(page.getByRole("status").filter({ hasText: "Nouveau code envoyé." })).toBeVisible();
    await expect(codeAlert(page)).toHaveText("");
  }
  await resend(page);
  await expect(codeAlert(page)).toHaveText(/^Trop de demandes\./);
  // Au-delà de la fenêtre, une demande est de nouveau acceptée, puis le code valable aboutit.
  await scope.control({ action: "advanceClock", ms: AUTH_CONFIG.codeRequestWindowMs });
  await resend(page);
  await expect(codeAlert(page)).toHaveText("");
  await expect(page.getByRole("status").filter({ hasText: "Nouveau code envoyé." })).toBeVisible();
  await pasteCode(page, MOCK_CODE);
  await expectPath(page, "/voyages");
});

/** Suite d'états visibles pour une adresse : trois codes faux, un quatrième essai, renvoi, expiration, renvoi, code valable. */
async function responseSequence(page: Page, email: string) {
  const states: unknown[] = [];
  await page.goto(connexionRoute("/voyages"));
  await requestCodeFor(page, email);
  states.push((await page.getByText(/^Code envoyé à /).textContent())?.replace(email, "{email}"));
  for (let attempt = 1; attempt <= AUTH_CONFIG.maxAttempts; attempt += 1) {
    await pasteCode(page, MOCK_WRONG_CODE);
    await expect(codeAlert(page)).not.toHaveText("");
    states.push(await codeState(page));
    if (attempt < AUTH_CONFIG.maxAttempts) await expect(firstCell(page)).toBeFocused();
  }
  // Quatrième essai : cases désactivées, aucune saisie possible.
  states.push(await firstCell(page).isDisabled());
  await resendButton(page).click();
  await expect(firstCell(page)).toBeEnabled();
  states.push(await codeState(page));
  await scope.control({ action: "advanceClock", ms: AUTH_CONFIG.codeTtlMs + 1000 });
  await pasteCode(page, MOCK_CODE);
  await expect(codeAlert(page)).not.toHaveText("");
  states.push(await codeState(page));
  await resendButton(page).click();
  await expect(page.getByRole("status").filter({ hasText: "Nouveau code envoyé." })).toBeVisible();
  states.push(await codeState(page));
  await pasteCode(page, MOCK_CODE);
  await expectPath(page, "/voyages");
  states.push(pathOf(page));
  return states;
}

test("connexion: même suite de réponses, adresse connue ou inconnue", async ({ page, context, baseURL }) => {
  const known = await responseSequence(page, KNOWN_EMAIL);
  scope = await useScope(context, baseURL!);
  const unknown = await responseSequence(page, uniqueEmail());
  expect(unknown).toEqual(known);
  expect(known.at(-1)).toBe("/voyages");
});

const HOSTILE_SUITES = [
  "https%3A%2F%2Fexemple.org",
  "%2F%2Fexemple.org",
  "%2F%5Cexemple.org",
  "%2F%09%2Fexemple.org",
  "/%09/exemple.org",
  "%2F%252Fexemple.org",
  "%252F%252Fexemple.org",
  "javascript%3Aalert(1)",
];

test("connexion: suite interne seulement", async ({ page, context }) => {
  const exemple: string[] = [];
  await context.route((url) => url.hostname.endsWith("exemple.org"), (route) => {
    exemple.push(route.request().url());
    return route.abort();
  });
  page.on("request", (request) => {
    if (new URL(request.url()).hostname.includes("exemple.org")) exemple.push(request.url());
  });
  for (const raw of HOSTILE_SUITES) {
    await page.goto(`/connexion?suite=${raw}`);
    await requestCodeFor(page, uniqueEmail());
    await pasteCode(page, MOCK_CODE);
    await expectPath(page, "/voyages");
  }
  await page.goto("/connexion?suite=%2Fvoyages%2Fmock_trip_edimbourg%2Fpreparation");
  await requestCodeFor(page, uniqueEmail());
  await pasteCode(page, MOCK_CODE);
  await expect.poll(() => new URL(page.url()).pathname).toBe("/voyages/mock_trip_edimbourg/preparation");
  expect(exemple).toEqual([]);
});

test("connexion: changer d'adresse", async ({ page }) => {
  await page.goto(connexionRoute("/voyages"));
  const email = uniqueEmail();
  await requestCodeFor(page, email);
  await button(page, "Changer d'adresse").click();
  await expect(emailField(page)).toHaveValue(email);
  await expect(emailField(page)).toBeFocused();
  await expect(page.getByText(WARNING)).toBeVisible();
});
