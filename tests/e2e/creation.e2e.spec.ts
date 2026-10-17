import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { expect, test, type Page } from "@playwright/test";

import { serverLogPath } from "../../scripts/e2e-server-log.mjs";

import { blockGoogle } from "./carte-helpers";
import {
  EDIMBOURG,
  R1,
  R2,
  R3,
  STORY,
  continueButton,
  field,
  fillTrip,
  installClock,
  lodgingGroup,
  reachBrief,
  reachReview,
  storyField,
} from "./creation-helpers";
import { MOCK_CODE, MOCK_WRONG_CODE, emailField, pasteCode } from "./connexion-helpers";
import { expectPath, pathOf, useScope } from "./debloquer-helpers";
import { R5 } from "./preparation-helpers";
import { collectEvents } from "./presentation-helpers";

/**
 * Écrans 1 et 2 de la création (spécification F8, critères [a] et transverses), build de production, 390 × 844,
 * domaines Google bloqués, horloge du navigateur installée au 2026-08-01T08:00 (jamais en temps fixe).
 */

/** « 1 000 » attendu à l'écran, écrit en dur (espace fine insécable U+202F, format suisse indépendant de l'ICU). */
const MILLE = "1 000";
const R4_LANCER = "/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer";
/** Adresse propre à ce test : elle ne doit apparaître nulle part hors du champ. */
const SECRET_EMAIL = "secret-f8b@exemple.org";

let googleRequests: string[] = [];
let foreignRequests: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  googleRequests = await blockGoogle(page);
  foreignRequests = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.protocol.startsWith("http") && url.origin !== origin) foreignRequests.push(request.url());
  });
  await installClock(page);
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
  expect(foreignRequests).toEqual([]);
});

const heading = (page: Page) => page.getByRole("heading", { level: 1 });
const button = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
// Bloc d'engagement par position : son nom suit le libellé saisi (« Engagement 1 », puis « [Tattoo] »).
const commitment = (page: Page, n: number) => page.getByRole("region", { name: "Engagements déjà pris" }).getByRole("region").nth(n - 1);

test("creation: créer un voyage sans hôtel", async ({ page }) => {
  await page.goto(R1);
  await expect(page).toHaveTitle("Nouveau voyage · Destination et dates");
  await fillTrip(page, EDIMBOURG);
  await button(page, "Ajouter un engagement").click();
  const block = commitment(page, 1);
  await block.getByRole("radio", { name: "Billet" }).click();
  await block.getByLabel("Libellé").fill("[Tattoo]");
  await block.getByLabel("Date", { exact: true }).fill("2026-08-29");
  await block.getByLabel("Heure de début").fill("21:30");
  await continueButton(page).click();
  await expectPath(page, R2);
  await expect(page).toHaveTitle("Nouveau voyage · Ton brief");
});

test("creation: validation de l'écran 1", async ({ page }) => {
  await page.goto(R1);
  await continueButton(page).click();
  const destination = field(page, "Destination");
  await expect(destination).toBeFocused();
  await expect(destination).toHaveAttribute("aria-invalid", "true");
  await expect(destination).toHaveAccessibleDescription("Indique ta destination.");
  await expect(field(page, "Arrivée")).toHaveAttribute("aria-invalid", "true");
  await expect(field(page, "Départ")).toHaveAttribute("aria-invalid", "true");
  await expect(lodgingGroup(page)).toHaveAttribute("aria-invalid", "true");
  await expectPath(page, R1);

  await fillTrip(page, { ...EDIMBOURG, start: "2026-07-31" });
  await continueButton(page).click();
  await expect(field(page, "Arrivée")).toHaveAccessibleDescription("La date d'arrivée ne peut pas être déjà passée.");
  await expect(field(page, "Arrivée")).toBeFocused();

  await field(page, "Arrivée").fill("2026-08-29");
  await field(page, "Départ").fill("2026-08-29");
  await continueButton(page).click();
  await expect(field(page, "Départ")).toHaveAccessibleDescription("Le départ doit suivre l'arrivée d'au moins une nuit.");

  await field(page, "Départ").fill("2026-09-03");
  await button(page, "Ajouter un engagement").click();
  const block = commitment(page, 1);
  await block.getByRole("radio", { name: "Vol" }).click();
  await block.getByLabel("Libellé").fill("Vol retour");
  await block.getByLabel("Date", { exact: true }).fill("2026-09-05");
  await block.getByLabel("Heure de début").fill("10:00");
  await continueButton(page).click();
  await expect(block.getByLabel("Date", { exact: true })).toHaveAccessibleDescription("La date doit être comprise dans les dates du voyage.");
  await expectPath(page, R1);
});

test("creation: villes, récapitulatif et maximums", async ({ page }) => {
  await page.goto(R1);
  await fillTrip(page, EDIMBOURG);
  await button(page, "Ajouter une ville").click();
  await expect(field(page, "Nom de la ville")).toBeFocused();
  await field(page, "Nom de la ville").fill("Glasgow");
  const arrival = field(page, "Arrivée dans cette ville");

  await arrival.fill("2026-08-29");
  await continueButton(page).click();
  await expect(arrival).toHaveAccessibleDescription("L'arrivée doit suivre celle de la ville précédente d'au moins une nuit.");
  await arrival.fill("2026-09-03");
  await continueButton(page).click();
  await expect(arrival).toHaveAccessibleDescription("L'arrivée doit précéder le départ du voyage d'au moins une nuit.");

  await arrival.fill("2026-09-01");
  const recap = page.getByRole("list", { name: "Tes villes" });
  await expect(recap.getByRole("listitem")).toHaveText([/^Édimbourg : .*29\.08 – .*01\.09$/, /^Glasgow : .*01\.09 – .*03\.09$/]);

  await button(page, "Retirer Glasgow").click();
  await expect(recap).toHaveCount(0);
  await expect(button(page, "Ajouter une ville")).toBeFocused();

  for (let i = 0; i < 3; i++) await button(page, "Ajouter une ville").click();
  // Au plafond : `aria-disabled` (atteignable au clavier, comme les `Chip`), un clic de plus n'ajoute rien.
  await expect(button(page, "Ajouter une ville")).toHaveAttribute("aria-disabled", "true");
  await button(page, "Ajouter une ville").focus();
  await page.keyboard.press("Enter");
  await expect(field(page, "Nom de la ville")).toHaveCount(3);
  await expect(page.getByText("Au plus 4 villes en tout, destination comprise.")).toBeVisible();
  for (let i = 0; i < 10; i++) await button(page, "Ajouter un engagement").click();
  await expect(button(page, "Ajouter un engagement")).toHaveAttribute("aria-disabled", "true");
  await button(page, "Ajouter un engagement").focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("region", { name: "Engagements déjà pris" }).getByRole("region")).toHaveCount(10);
  await expect(page.getByRole("region", { name: /^Engagement \d+$/ })).toHaveCount(10);
});

test("creation: brouillon en mémoire", async ({ page }) => {
  await reachBrief(page);
  await button(page, "Retour").click();
  await expectPath(page, R1);
  await expect(field(page, "Destination")).toHaveValue("Édimbourg");
  await expect(field(page, "Arrivée")).toHaveValue("2026-08-29");
  await expect(field(page, "Départ")).toHaveValue("2026-09-03");
  await expect(lodgingGroup(page).getByRole("radio", { name: "Pas encore" })).toHaveAttribute("aria-checked", "true");

  await continueButton(page).click();
  await expectPath(page, R2);
  await page.reload();
  await expectPath(page, R1);
  await expect(page.getByRole("status").first()).toHaveText("Ton brouillon n'a pas été conservé. Recommence à partir de la destination.");
  await expect(field(page, "Destination")).toHaveValue("");
});

test("creation: régions live présentes dès l'affichage", async ({ page }) => {
  await page.goto(R1);
  await expect(page.getByRole("main").getByRole("status")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("status")).toBeEmpty();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("main").getByRole("alert")).toBeEmpty();
  await reachBrief(page);
  await expect(page.getByRole("main").getByRole("status")).toBeEmpty();
  await expect(page.getByRole("main").getByRole("alert")).toBeEmpty();
});

test("brief: récit, erreur et compteur", async ({ page }) => {
  await reachBrief(page);
  const story = storyField(page);
  await expect(page.locator("#champ-story-compteur")).toHaveText(`0 sur ${MILLE} caractères`);
  await expect(story).toHaveAttribute("aria-describedby", "champ-story-aide champ-story-compteur");
  await story.fill("Trop court.");
  await button(page, "Préparer mon brief").click();
  await expect(story).toBeFocused();
  await expect(page.getByText("Écris au moins une phrase, ou remplis le brief toi-même.")).toBeVisible();
  await expect(story).toHaveAttribute("aria-describedby", "champ-story-aide champ-story-erreur champ-story-compteur");
  await expect(heading(page)).toHaveText("Raconte ton voyage en quelques phrases");

  const live = page.locator('[aria-live="polite"]');
  await story.fill("a".repeat(899));
  await expect(page.locator("#champ-story-compteur")).toHaveText(`899 sur ${MILLE} caractères`);
  await expect(live).toBeEmpty();
  await story.fill("a".repeat(900));
  await expect(live).toHaveText(`900 sur ${MILLE} caractères`);
  await story.fill("a".repeat(1200));
  await expect(story).toHaveValue("a".repeat(1000));
  await expect(live).toHaveText(`${MILLE} sur ${MILLE} caractères`);
});

test("brief: déductions visibles", async ({ page }) => {
  await reachBrief(page);
  await reachReview(page);
  await expect(page.getByText("En pointillé : ce qu'on a compris de ton récit. Touche pour corriger.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Adultes" })).toHaveValue("2");
  await expect(page.getByRole("textbox", { name: "Adultes" })).toHaveAccessibleDescription("déduit de ton récit");
  await expect(page.getByRole("radiogroup", { name: "Rythme" })).toHaveAccessibleDescription("déduit de ton récit");
  const envies = page.getByRole("group", { name: "Envies" });
  for (const name of ["Nature", "Dégustations", "Restaurants"]) {
    const chip = envies.getByRole("button", { name });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toHaveAccessibleDescription("déduit de ton récit");
    await expect(chip).toHaveCSS("border-top-style", "dashed");
  }
  await expect(page.getByRole("button", { name: /^Déplacements/ })).toHaveAttribute("aria-expanded", "true");
  const deplacements = page.getByRole("group", { name: "Déplacements" });
  for (const name of ["À pied", "Transports publics"]) {
    await expect(deplacements.getByRole("button", { name })).toHaveAccessibleDescription("déduit de ton récit");
  }
  await expect(page.getByRole("button", { name: /^À limiter/ })).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByRole("button", { name: /^Budget par repas/ })).toHaveAttribute("aria-expanded", "false");
});

test("brief: corriger une déduction", async ({ page }) => {
  const events = collectEvents(page);
  await reachBrief(page);
  await reachReview(page);
  const tasting = page.getByRole("group", { name: "Envies" }).getByRole("button", { name: "Dégustations" });
  await tasting.click();
  await expect(tasting).toHaveAttribute("aria-pressed", "false");
  await expect(tasting).not.toHaveAttribute("data-inferred");
  await expect(tasting).toHaveCSS("border-top-style", "solid");
  await expect(tasting).not.toHaveAccessibleDescription(/déduit/);
  await tasting.click();
  await expect(tasting).toHaveAttribute("aria-pressed", "true");
  await expect(tasting).not.toHaveAttribute("data-inferred");
  await expect(tasting).toHaveCSS("border-top-style", "solid");

  await page.getByRole("radio", { name: "Intense" }).click();
  await expect(page.getByRole("radiogroup", { name: "Rythme" })).not.toHaveAccessibleDescription(/déduit/);

  await continueButton(page).click();
  await expect.poll(() => events.filter((event) => event.name === "brief_completed")).toEqual([
    { name: "brief_completed", properties: { inferred_fields_count: 4, edited_fields_count: 2 } },
  ]);
  // F8b : voyage « Pas encore » : l'écran 3 suit le brief (F8-PO-8).
  await expectPath(page, R3);
});

test("brief: remplir moi-même", async ({ page }) => {
  const events = collectEvents(page);
  await reachBrief(page);
  await button(page, "Remplir moi-même").click();
  await expect(heading(page)).toHaveText("Vérifie ton brief");
  await expect(heading(page)).toBeFocused();
  await expect(page.locator("[data-inferred]")).toHaveCount(0);
  await expect(page.getByRole("radiogroup", { name: "Rythme" }).getByRole("radio", { checked: true })).toHaveCount(0);

  await continueButton(page).click();
  await expect(page.getByRole("radiogroup", { name: "Rythme" })).toBeFocused();
  await expect(page.getByText("Choisis un rythme.")).toBeVisible();
  await expect(page.getByText("Choisis au moins une envie.")).toBeVisible();

  await page.getByRole("radio", { name: "Tranquille" }).click();
  await page.getByRole("group", { name: "Envies" }).getByRole("button", { name: "Musées" }).click();
  await continueButton(page).click();
  await expect.poll(() => events.filter((event) => event.name === "brief_completed")).toEqual([
    { name: "brief_completed", properties: { inferred_fields_count: 0, edited_fields_count: 0 } },
  ]);
});

test("brief: à limiter, envies indisponibles", async ({ page }) => {
  await reachBrief(page);
  await reachReview(page);
  await page.getByRole("button", { name: /^À limiter/ }).click();
  const limiter = page.getByRole("group", { name: "À limiter" });
  const nature = limiter.getByRole("button", { name: "Nature" });
  await expect(nature).toHaveAttribute("aria-disabled", "true");
  await expect(nature).not.toHaveAttribute("disabled");
  await expect(nature).toHaveAccessibleDescription("Déjà dans tes envies");
  await expect(page.getByText("Les envies déjà choisies ne peuvent pas être limitées.")).toBeVisible();
  await nature.focus();
  await expect(nature).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(nature).toHaveAttribute("aria-pressed", "false");
});

/** Aucun défilement horizontal, et les boutons des voyageurs tiennent dans la largeur de la fenêtre. */
async function expectTravellersFit(page: Page) {
  const width = page.viewportSize()!.width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  for (const name of ["Retirer un adulte", "Ajouter un adulte", "Retirer un enfant", "Ajouter un enfant"]) {
    const box = (await button(page, name).boundingBox())!;
    expect(box.x, name).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width, name).toBeLessThanOrEqual(width);
  }
}

test("brief: voyageurs à 320 px", async ({ page }) => {
  // 0018 § 16 et WCAG 1.4.10 (320 px CSS, soit 1 280 px zoomés à 400 % ou 640 px à 200 %) : la rangée
  // « Adultes » / « Enfants » passe à la ligne au lieu de déborder. Les tailles de texte Ligne sont en px :
  // le zoom du navigateur, pas la taille de police racine, est le cas à couvrir.
  await page.setViewportSize({ width: 320, height: 844 });
  await reachBrief(page);
  await reachReview(page);
  await expectTravellersFit(page);
});

test("brief: revenir au récit ou à l'écran 1", async ({ page }) => {
  await reachBrief(page);
  await reachReview(page);
  await expect(page.getByRole("button", { name: "Retour" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Revenir à mon récit" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Récit", exact: true })).toHaveCount(0);

  // Cas 1 : même adresse, récit conservé, focus sur son titre ; un nouveau passage garde la correction.
  await page.getByRole("radio", { name: "Intense" }).click();
  await page.getByRole("button", { name: "Revenir à mon récit" }).click();
  await expectPath(page, R2);
  await expect(heading(page)).toHaveText("Raconte ton voyage en quelques phrases");
  await expect(heading(page)).toBeFocused();
  await expect(storyField(page)).toHaveValue(STORY);
  await button(page, "Préparer mon brief").click();
  await expect(heading(page)).toHaveText("Vérifie ton brief");
  await expect(page.getByRole("radio", { name: "Intense" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("radio", { name: "Intense" })).not.toHaveAttribute("data-inferred");

  // Cas 2 : « Retour » mène à l'écran 1, saisies conservées.
  await button(page, "Retour").click();
  await expectPath(page, R1);
  await expect(field(page, "Destination")).toHaveValue("Édimbourg");
});

/** Sortie du serveur de test depuis son démarrage (`webServer`, recopiée par scripts/serve-standalone.mjs). */
function serverOutput(baseURL: string | undefined): string {
  return readFileSync(serverLogPath({ port: Number(new URL(baseURL!).port), tmpDir: tmpdir() }), "utf8");
}

test("creation: aucune donnée persistée ni exposée", async ({ page, context, baseURL }) => {
  const visited: string[] = [];
  const consoleLines: string[] = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) visited.push(frame.url());
  });
  page.on("request", (request) => visited.push(request.url()));
  page.on("console", (message) => consoleLines.push(message.text()));
  const events = collectEvents(page);
  // F8c : portée explicite, la session obtenue à l'écran 4 ne touche pas la portée par défaut (en-tête, aucun cookie).
  await useScope(context, baseURL!);

  await reachBrief(page);
  await storyField(page).fill("Court.");
  await button(page, "Préparer mon brief").click();
  await reachReview(page);
  await continueButton(page).click();
  // F8b : écrans 3 et 4 compris ; ni adresse ni code dans une adresse, la console, les mesures ou le serveur.
  await expectPath(page, R3);
  await button(page, "Partir du quartier, choisir plus tard").click();
  await expectPath(page, R4_LANCER);
  await emailField(page).fill(SECRET_EMAIL);
  await button(page, "Recevoir un code").click();
  await expect(page.getByRole("textbox", { name: "Chiffre 1 sur 6" })).toBeFocused();
  await pasteCode(page, MOCK_WRONG_CODE);
  await expect(page.getByRole("alert").filter({ hasText: "Ce code ne correspond pas." })).toBeVisible();
  // F8c : code valable, lancement et écran 5 (`preview_ready` compris dans les mesures relues).
  await pasteCode(page, MOCK_CODE);
  await expectPath(page, R5);
  await expect(heading(page)).toHaveText("On prépare tes premières propositions");

  const storage = await page.evaluate(async () => ({
    local: window.localStorage.length,
    session: window.sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
  }));
  expect(storage).toEqual({ local: 0, session: 0, databases: 0, caches: 0 });
  expect(await context.cookies()).toEqual([]);
  const fragment = STORY.slice(0, 30);
  for (const url of visited) {
    expect(decodeURIComponent(url)).not.toContain(fragment);
    expect(decodeURIComponent(url)).not.toContain("Édimbourg");
  }
  expect(consoleLines.join("\n")).not.toContain(fragment);
  expect(JSON.stringify(events)).not.toContain(fragment);
  expect(JSON.stringify(events)).not.toContain("Édimbourg");
  // Sortie du serveur relue en fin de test : le serveur a bien écrit (démarrage), sans récit ni destination.
  const output = serverOutput(baseURL);
  expect(output).toContain("Ready");
  expect(output).not.toContain(fragment);
  expect(output).not.toContain("Édimbourg");
  for (const secret of [SECRET_EMAIL, MOCK_WRONG_CODE]) {
    for (const url of visited) expect(decodeURIComponent(url)).not.toContain(secret);
    expect(consoleLines.join("\n")).not.toContain(secret);
    expect(JSON.stringify(events)).not.toContain(secret);
    expect(output).not.toContain(secret);
  }
  expect(pathOf(page)).toBe(R5);
});
