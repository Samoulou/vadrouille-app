import { expect, test, type Page } from "@playwright/test";

import { edimbourg } from "../../src/mocks/edimbourg";

import { blockGoogle } from "./carte-helpers";
import { collectEvents } from "./presentation-helpers";
import {
  DEAN,
  DEV_REPLACE_DEAN,
  FICHE_JARDIN,
  moveButton,
  moveDays,
  moveSheet,
  openMoveSheet,
  placeHere,
  previewMoveToJ4,
  PROPOSAL,
  REPLACE_DEAN,
  applyButton,
  askButton,
  askProposal,
  changes,
  proposalTitle,
  reasons,
  replaceTitle,
  unchanged,
  wishField,
} from "./revision-helpers";
import { TRIP, dayList, dayMarkers, fiche, ficheTitle, openTrip, sheet } from "./sejour-helpers";

/**
 * Critères F7a (spécification F7, critères [a] C11 à C18 et transverses C2, C3, C4, C9) : écran 14 « Remplacer une
 * étape », aperçu, « Appliquer », surlignage et toast partagé ; critères F7b ([b] C19 à C22, part de F7b de C3, C4 et
 * C9) : feuille « Déplacer », en 390 × 844 sur le build de production. Les critères
 * qui touchent la carte s'exécutent sur /dev/voyages (carte simulée) ; les autres sur /voyages.
 */

const JOUR2 = `/voyages/${TRIP}/jour/2`;
const DEV_JOUR2 = `/dev${JOUR2}`;
const TATTOO = "j1-tattoo";

let googleRequests: string[] = [];

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
});

test.afterEach(() => {
  // C4 : aucune requête vers un domaine Google pendant les specs de F7.
  expect(googleRequests).toEqual([]);
});

const deanLink = (page: Page) => dayList(page).getByRole("link", { name: /\[Dean Village\]/ });
const proposalLink = (page: Page) => dayList(page).getByRole("link", { name: /Dégustation dans une épicerie fine de Stockbridge/ });
const toast = (page: Page) => page.locator("[data-undo-toast]");
const highlighted = (page: Page) => dayList(page).locator("[data-highlighted='true']");

/** Texte de la ligne du jour : sert de photographie du programme visible (égalité avant et après « Annuler »). */
const dayLineText = (page: Page) => dayList(page).innerText();

/** Ouvre la fiche d'une étape (`?etape=`) : le panneau est alors la région « Fiche étape ». */
async function openFiche(page: Page, path: string) {
  await page.goto(path);
  await expect(ficheTitle(page)).toBeVisible();
  if (path.startsWith("/dev/")) {
    await expect(page.locator("[data-renderer='simulated']")).toHaveAttribute("data-zoom", /\d+/);
  }
}

/** Ligne de la ligne du jour qui porte un lien (l'heure est hors du lien). */
const rowOf = (page: Page, name: RegExp) => dayList(page).locator("li").filter({ has: page.getByRole("link", { name }) });

async function openReplace(page: Page, path = REPLACE_DEAN) {
  await openTrip(page, path);
  await expect(replaceTitle(page)).toHaveText("Remplacer [Dean Village]");
}

test.describe("Remplacer une étape", () => {
  test("remplacer: ouverture", async ({ page }) => {
    await openFiche(page, `${DEV_JOUR2}?etape=${DEAN}`);
    await expect(ficheTitle(page)).toHaveText("[Dean Village]");
    await fiche(page).getByRole("link", { name: "Remplacer" }).click();
    await expect(page).toHaveURL(DEV_REPLACE_DEAN);
    await expect(replaceTitle(page)).toHaveText("Remplacer [Dean Village]");
    await expect(replaceTitle(page)).toBeFocused();
    await expect(sheet(page).locator("[data-part='remplacer'] [data-part='moment']").first()).toHaveText(
      "J2 · Dimanche 30 août · 10:50 – 11:50",
    );
    await expect(page).toHaveTitle("Remplacer [Dean Village] · Jour 2");
    const marker = dayMarkers(page).nth(1);
    await expect(marker).toHaveAccessibleName(/^Étape 2 : \[Dean Village\]/);
    await expect(marker).toHaveAttribute("aria-current", "true");
    await expect(page.locator("[data-renderer='simulated'] [aria-current='true']")).toHaveCount(1);
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  });

  test("remplacer: raisons", async ({ page }) => {
    await openReplace(page);
    const group = reasons(page);
    await expect(group).toHaveAttribute("role", "radiogroup");
    await expect(group.getByRole("radio")).toHaveText(["Pas mon style", "Trop chargé", "Trop cher", "Trop loin", "Autre raison"]);
    for (const radio of await group.getByRole("radio").all()) await expect(radio).toHaveAttribute("aria-checked", "false");

    await askButton(page).click();
    const error = sheet(page).getByRole("alert").filter({ hasText: "Choisis une raison." });
    await expect(error).toHaveText("Choisis une raison.");
    await expect(group).toBeFocused();
    await expect(proposalTitle(page)).toHaveCount(0);

    await wishField(page).fill("a".repeat(200));
    await wishField(page).press("End");
    await wishField(page).pressSequentially("b");
    await expect(wishField(page)).toHaveValue("a".repeat(200));
    await expect(sheet(page).getByText("200 sur 200 caractères", { exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retour", exact: true })).toHaveCount(0);
  });

  test("remplacer: dean village sans toucher au dîner", async ({ page }) => {
    const events = collectEvents(page);
    await page.clock.install();
    await openReplace(page, DEV_REPLACE_DEAN);
    await askProposal(page, "Pas mon style", "une dégustation");

    await expect(proposalTitle(page)).toHaveText(PROPOSAL);
    const proposal = sheet(page).locator("[data-part='proposition']");
    await expect(proposal.locator("[data-part='moment']")).toHaveText("10:55 – 11:50");
    await expect(proposal.getByText("À réserver", { exact: true })).toBeVisible();
    await expect(proposal.locator("[data-part='raison']")).toBeVisible();
    await expect(sheet(page).getByRole("status").filter({ hasText: "Proposition prête." })).toHaveCount(1);

    const replaced = changes(page).locator("[data-change='replaced']");
    await expect(replaced).toHaveText(`10:55 ${PROPOSAL} à la place de [Dean Village]`);
    await expect(replaced.locator("del")).toHaveText("[Dean Village]");
    await expect(changes(page).locator("[data-change='segment']")).toHaveCount(2);
    await expect(changes(page).locator("[data-change='budget']")).toHaveText("Budget du jour : environ +15 CHF par personne");
    await expect(unchanged(page)).toContainText("19:00 [Bonne table de New Town]");
    await expect(unchanged(page).locator("li").filter({ hasText: "[Bonne table de New Town]" })).toContainText("À réserver");
    await expect(unchanged(page)).not.toContainText("[Dean Village]");

    // Horloge arrêtée avant « Appliquer » : surlignage et toast ne dépendent que de `runFor`.
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await applyButton(page).click();
    await expect(page).toHaveURL(DEV_JOUR2);
    await expect(proposalLink(page)).toBeFocused();
    await expect(rowOf(page, /Dégustation dans une épicerie fine/)).toContainText("10:55");
    await expect(deanLink(page)).toHaveCount(0);
    await expect(rowOf(page, /\[Bonne table de New Town\]/)).toContainText("19:00");
    await expect(toast(page)).toContainText("Modifié.");
    await expect(page.locator("[data-undo-region]")).toHaveAttribute("role", "status");
    await expect(proposalLink(page)).toBeFocused();

    // Surlignage présent, puis absent à 2 000 ms (handover § 7).
    await expect(highlighted(page)).toHaveCount(1);
    await page.clock.runFor(1_900);
    await expect(highlighted(page)).toHaveCount(1);
    await page.clock.runFor(100);
    await expect(highlighted(page)).toHaveCount(0);

    // Sans « Annuler », le toast disparaît à 5 000 ms et la modification reste.
    await page.clock.runFor(2_900);
    await expect(toast(page)).toHaveCount(1);
    await page.clock.runFor(100);
    await expect(toast(page)).toHaveCount(0);
    await expect(proposalLink(page)).toBeVisible();

    const applied = events.filter((event) => event.name === "replace_applied");
    expect(applied).toHaveLength(1);
    expect(Object.keys(applied[0]!.properties).sort()).toEqual(["duration_ms", "from_reserve", "reason"]);
    expect(applied[0]!.properties).toMatchObject({ reason: "not_my_style", from_reserve: true });
    const duration = applied[0]!.properties.duration_ms as number;
    expect(Number.isInteger(duration) && duration >= 0).toBe(true);
    expect(events.filter((event) => event.name === "replace_undone")).toHaveLength(0);
  });

  test("remplacer: annuler", async ({ page }) => {
    const events = collectEvents(page);
    await openTrip(page, DEV_JOUR2);
    const before = await dayLineText(page);
    await deanLink(page).click();
    await fiche(page).getByRole("link", { name: "Remplacer" }).click();
    await expect(replaceTitle(page)).toBeFocused();
    await askProposal(page, "Trop loin");
    await applyButton(page).click();
    await expect(page).toHaveURL(DEV_JOUR2);
    await expect(toast(page)).toContainText("Modifié.");

    await toast(page).getByRole("button", { name: "Annuler" }).click();
    await expect(rowOf(page, /\[Dean Village\]/)).toContainText("10:50");
    await expect(proposalLink(page)).toHaveCount(0);
    await expect(page.locator("[data-part='annonce-annulation']")).toHaveText("Modification annulée.");
    await expect(deanLink(page)).toBeFocused();
    await expect(highlighted(page)).toHaveCount(0);
    expect(await dayLineText(page)).toBe(before);

    const applied = events.filter((event) => event.name === "replace_applied");
    const undone = events.filter((event) => event.name === "replace_undone");
    expect(applied).toHaveLength(1);
    expect(undone).toHaveLength(1);
    expect(undone[0]!.properties).toEqual(applied[0]!.properties);
    expect(applied[0]!.properties).toMatchObject({ reason: "too_far", from_reserve: true });
  });

  test("remplacer: annuler sans appliquer", async ({ page }) => {
    const events = collectEvents(page);
    await openTrip(page, DEV_JOUR2);
    const before = await dayLineText(page);
    await deanLink(page).click();
    await expect(ficheTitle(page)).toBeFocused();

    // (1) Proposition affichée, « Annuler » de l'aperçu.
    await fiche(page).getByRole("link", { name: "Remplacer" }).click();
    await expect(replaceTitle(page)).toBeFocused();
    await askProposal(page, "Pas mon style");
    await sheet(page).locator("[data-part='annuler-apercu']").click();
    await expect(page).toHaveURL(`${DEV_JOUR2}?etape=${DEAN}`);
    await expect(ficheTitle(page)).toHaveText("[Dean Village]");
    await expect(ficheTitle(page)).toBeFocused();

    // (2) Écran rouvert, proposition affichée, « Retour à la fiche ».
    await fiche(page).getByRole("link", { name: "Remplacer" }).click();
    await expect(replaceTitle(page)).toBeFocused();
    await askProposal(page, "Trop cher");
    // Changer de raison retire la proposition et réaffiche « Voir une proposition ».
    await reasons(page).getByRole("radio", { name: "Trop chargé" }).click();
    await expect(proposalTitle(page)).toHaveCount(0);
    await expect(askButton(page)).toBeVisible();
    await askButton(page).click();
    await expect(proposalTitle(page)).toBeFocused();
    await sheet(page).getByRole("button", { name: "Retour à la fiche" }).click();
    await expect(page).toHaveURL(`${DEV_JOUR2}?etape=${DEAN}`);
    await expect(ficheTitle(page)).toBeFocused();

    await fiche(page).getByRole("button", { name: "Fermer" }).click();
    expect(await dayLineText(page)).toBe(before);
    await expect(page.getByRole("button", { name: "Retour", exact: true })).toHaveCount(0);
    expect(events.filter((event) => event.name.startsWith("replace_"))).toEqual([]);
  });

  test("remplacer: aucune option", async ({ page }) => {
    await openTrip(page, `${JOUR2}/remplacer/j2-royal-mile`);
    await expect(replaceTitle(page)).toHaveText("Remplacer [Royal Mile]");
    await reasons(page).getByRole("radio", { name: "Trop chargé" }).click();
    await askButton(page).click();
    const banner = sheet(page).locator("[data-part='bandeau-aucune-option']");
    await expect(banner).toContainText("Aucune option compatible pour ce créneau. Ton programme est inchangé.");
    await expect(banner).toBeFocused();
    await expect(applyButton(page)).toHaveCount(0);
    // Les raisons restent modifiables.
    await reasons(page).getByRole("radio", { name: "Autre raison" }).click();
    await expect(reasons(page).getByRole("radio", { name: "Autre raison" })).toHaveAttribute("aria-checked", "true");
    await expect(banner).toHaveCount(0);
  });

  test("remplacer: étape verrouillée", async ({ page }) => {
    await openTrip(page, `/voyages/${TRIP}/jour/1/remplacer/${TATTOO}`);
    await expect(replaceTitle(page)).toHaveText("Remplacer [Royal Edinburgh Military Tattoo]");
    await expect(sheet(page).locator("[data-part='verrouillee']")).toHaveText(
      "Cette étape est verrouillée. Retire le verrou depuis sa fiche pour la remplacer.",
    );
    await expect(reasons(page)).toHaveCount(0);
    await expect(askButton(page)).toHaveCount(0);
    await sheet(page).getByRole("button", { name: "Retour à la fiche" }).last().click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/1?etape=${TATTOO}`);
    await expect(ficheTitle(page)).toHaveText("[Royal Edinburgh Military Tattoo]");
  });
});

const jardinLink = (page: Page) => dayList(page).getByRole("link", { name: /\[Jardin botanique royal\]/ });

test.describe("Déplacer une étape", () => {
  test("déplacer: bouton dans la fiche", async ({ page }) => {
    await openFiche(page, FICHE_JARDIN);
    const actions = fiche(page).getByRole("region", { name: "Actions" });
    const names = await actions.locator("a, button").allInnerTexts();
    expect(names.indexOf("Déplacer")).toBe(names.indexOf("Remplacer") + 1);
    for (const path of [`/voyages/${TRIP}/jour/1?etape=${TATTOO}`, `${JOUR2}?etape=j2-concert-orgue`]) {
      await openFiche(page, path);
      await expect(fiche(page).getByRole("button", { name: "Déplacer" })).toHaveCount(0);
    }
  });

  test("déplacer: jours complets", async ({ page }) => {
    await openFiche(page, FICHE_JARDIN);
    await openMoveSheet(page);
    await expect(moveSheet(page)).toHaveAttribute("aria-modal", "true");
    await expect(moveSheet(page).getByRole("heading", { level: 2 })).toHaveText("Déplacer [Jardin botanique royal]");
    await expect(page).toHaveURL(FICHE_JARDIN);
    const radios = moveDays(page).getByRole("radio");
    await expect(radios).toHaveCount(6);
    for (const n of [2, 3, 6]) {
      const full = moveDays(page).getByRole("radio", { name: `Jour ${n}, complet` });
      await expect(full).toHaveAttribute("aria-disabled", "true");
      await expect(full).toContainText("complet");
    }
    for (const n of [1, 4, 5]) {
      await expect(moveDays(page).getByRole("radio", { name: `Jour ${n}`, exact: true })).not.toHaveAttribute("aria-disabled", "true");
    }
    for (const radio of await radios.all()) await expect(radio).toHaveAttribute("aria-checked", "false");

    // Flèches : focus sur un jour complet sans le cocher (J1 → J2).
    await moveDays(page).getByRole("radio", { name: "Jour 1", exact: true }).focus();
    await page.keyboard.press("ArrowRight");
    const j2 = moveDays(page).getByRole("radio", { name: "Jour 2, complet" });
    await expect(j2).toBeFocused();
    await expect(j2).toHaveAttribute("aria-checked", "false");

    // Tab reste dans la feuille.
    for (let i = 0; i < 6; i += 1) {
      await page.keyboard.press("Tab");
      expect(await moveSheet(page).evaluate((node) => node.contains(document.activeElement))).toBe(true);
    }

    const before = await page.evaluate(() => document.querySelector("[data-part='fiche']")?.textContent);
    await page.keyboard.press("Escape");
    await expect(moveSheet(page)).toHaveCount(0);
    await expect(moveButton(page)).toBeFocused();
    await expect(page).toHaveURL(FICHE_JARDIN);
    expect(await page.evaluate(() => document.querySelector("[data-part='fiche']")?.textContent)).toBe(before);
  });

  test("déplacer: sans glisser", async ({ page }) => {
    await openFiche(page, FICHE_JARDIN);
    await moveButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(moveSheet(page).getByRole("heading", { level: 2 })).toBeFocused();
    await expect(moveDays(page).getByRole("radio", { name: "Jour 3, complet" })).toHaveAttribute("aria-disabled", "true");

    // Clavier seulement : Tab jusqu'au groupe (après « Fermer »), flèches jusqu'à J4, Tab jusqu'au point, Entrée.
    await page.keyboard.press("Tab");
    await expect(moveSheet(page).getByRole("button", { name: "Fermer" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(moveDays(page).getByRole("radio", { name: "Jour 1", exact: true })).toBeFocused();
    for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
    const j4 = moveDays(page).getByRole("radio", { name: "Jour 4", exact: true });
    await expect(j4).toBeFocused();
    await expect(j4).toHaveAttribute("aria-checked", "true");
    await expect(moveDays(page).locator("[aria-pressed]")).toHaveCount(0);
    const point = placeHere(page, "15:45");
    expect((await point.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Tab");
    await expect(point).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(moveSheet(page).getByRole("heading", { level: 3, name: "Ce qui change" })).toBeFocused();
    const moved = moveSheet(page).locator("[data-change='moved']");
    await expect(moved).toHaveText("[Jardin botanique royal] : avant : J2 13:25 → après : J4 15:45");
    await expect(moved.locator("del")).toHaveText("J2 13:25");
    await expect(moved.getByText("avant :", { exact: true })).toHaveClass(/sr-only/);
    const unchangedList = moveSheet(page).locator("[data-part='ne-bouge-pas']");
    await expect(unchangedList).toContainText("19:00 [Bonne table de New Town]");
    await expect(unchangedList).toContainText("19:00 [Petite adresse de l'Old Town]");
    await expect(point).toHaveAttribute("aria-current", "true");
    await expect(point).not.toHaveAttribute("aria-pressed");
  });

  test("déplacer: appliquer et annuler", async ({ page }) => {
    const events = collectEvents(page);
    await page.clock.install();
    await openTrip(page, DEV_JOUR2);
    const before = await dayLineText(page);
    await jardinLink(page).click();
    await expect(ficheTitle(page)).toBeFocused();
    await openMoveSheet(page);
    await previewMoveToJ4(page);
    await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 1_000);
    await moveSheet(page).getByRole("button", { name: "Appliquer" }).click();

    await expect(moveSheet(page)).toHaveCount(0);
    await expect(page).toHaveURL(`/dev/voyages/${TRIP}/jour/4`);
    await expect(jardinLink(page)).toBeFocused();
    await expect(rowOf(page, /\[Jardin botanique royal\]/)).toContainText("15:45");
    await expect(highlighted(page)).toHaveCount(1);
    await expect(toast(page)).toContainText("Étape déplacée.");
    await page.clock.runFor(2_000);
    await expect(highlighted(page)).toHaveCount(0);
    expect(events.filter((event) => event.name === "stop_moved")).toEqual([{ name: "stop_moved", properties: { method: "button" } }]);

    await toast(page).getByRole("button", { name: "Annuler" }).click();
    await expect(jardinLink(page)).toHaveCount(0);
    await expect(page.locator("[data-part='titre-jour']")).toBeFocused();
    await expect(page.locator("[data-part='annonce-annulation']")).toHaveText("Modification annulée.");

    // J2 : le jardin revient, programme d'avant ; sans « Annuler », J2 ne le contenait plus et gardait le dîner à 19:00.
    await page.getByRole("link", { name: "Jour 2", exact: false }).first().click();
    await expect(page).toHaveURL(`/dev/voyages/${TRIP}/jour/2`);
    await expect(rowOf(page, /\[Jardin botanique royal\]/)).toContainText("13:25");
    expect(await dayLineText(page)).toBe(before);
    expect(events.filter((event) => event.name !== "stop_moved")).toEqual([]);
  });

  test("déplacer: J2 garde le dîner après « Appliquer »", async ({ page }) => {
    await openFiche(page, FICHE_JARDIN);
    await openMoveSheet(page);
    await previewMoveToJ4(page);
    await moveSheet(page).getByRole("button", { name: "Appliquer" }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/4`);
    await page.getByRole("link", { name: /^Jour 2/ }).first().click();
    await expect(page).toHaveURL(JOUR2);
    await expect(jardinLink(page)).toHaveCount(0);
    await expect(rowOf(page, /\[Bonne table de New Town\]/)).toContainText("19:00");
  });
});

test.describe("Révision : transverses", () => {
  test("revision: 404 hors programme", async ({ page }) => {
    for (const path of [
      `${JOUR2}/remplacer/inconnue`,
      `${JOUR2}/remplacer/j2-concert-orgue`,
      `${JOUR2}/remplacer/mock_place_dean_village`,
      `/voyages/${TRIP}/jour/7/remplacer/${DEAN}`,
      `/voyages/${TRIP}/jour/1/remplacer/${DEAN}`,
      // Voyage absent de l'organisation de la session (le jeu simulé ne sert que l'organisation de démonstration).
      `/voyages/inconnu/jour/2/remplacer/${DEAN}`,
    ]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("revision: aucune donnée persistée côté client", async ({ page, context }) => {
    const urls: string[] = [];
    page.on("framenavigated", (frame) => {
      if (frame === page.mainFrame()) urls.push(frame.url());
    });
    await openFiche(page, `${JOUR2}?etape=${DEAN}`);
    await fiche(page).getByRole("link", { name: "Remplacer" }).click();
    await askProposal(page, "Pas mon style", "une dégustation");
    await applyButton(page).click();
    await expect(page).toHaveURL(JOUR2);
    await toast(page).getByRole("button", { name: "Annuler" }).click();
    await expect(deanLink(page)).toBeFocused();
    // Déplacement appliqué (F7b).
    await page.goto(FICHE_JARDIN);
    await expect(ficheTitle(page)).toBeVisible();
    await openMoveSheet(page);
    await previewMoveToJ4(page);
    await moveSheet(page).getByRole("button", { name: "Appliquer" }).click();
    await expect(page).toHaveURL(`/voyages/${TRIP}/jour/4`);

    const stored = await page.evaluate(async () => ({
      local: localStorage.length,
      session: sessionStorage.length,
      databases: (await indexedDB.databases()).length,
      caches: (await caches.keys()).length,
      cookie: document.cookie,
    }));
    expect(stored).toEqual({ local: 0, session: 0, databases: 0, caches: 0, cookie: "" });
    expect(await context.cookies()).toEqual([]);

    const placeIds = edimbourg.days.flatMap((day) =>
      day.items.flatMap((item) => (item.type === "stop" && item.stop.placeId ? [item.stop.placeId] : [])),
    );
    urls.push(page.url());
    for (const raw of urls) {
      const url = new URL(raw);
      for (const key of url.searchParams.keys()) expect(["etape", "de", "a", "repas", "idee"]).toContain(key);
      const decoded = decodeURIComponent(url.pathname + url.search);
      expect(decoded).not.toContain("mock_place_");
      expect(decoded).not.toContain("dégustation");
      expect(decoded).not.toContain("Dean Village");
      expect(decoded).not.toContain("Jardin botanique");
      for (const placeId of placeIds) expect(decoded).not.toContain(placeId);
    }
  });

  test("revision: hors ligne", async ({ page, context }) => {
    await openReplace(page);
    await reasons(page).getByRole("radio", { name: "Pas mon style" }).click();
    await context.setOffline(true);
    const banner = sheet(page).getByText("Tu es hors ligne. Modifier ton programme demande une connexion.");
    await expect(banner).toBeVisible();
    await expect(askButton(page)).toHaveAttribute("aria-disabled", "true");
    // `aria-disabled` : toujours atteignable au clavier, sans effet.
    await askButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(proposalTitle(page)).toHaveCount(0);

    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
    await expect(askButton(page)).not.toHaveAttribute("aria-disabled", "true");
    await askButton(page).click();
    await expect(proposalTitle(page)).toBeFocused();

    await context.setOffline(true);
    await expect(applyButton(page)).toHaveAttribute("aria-disabled", "true");
    await applyButton(page).focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(REPLACE_DEAN);
    await context.setOffline(false);
    await expect(applyButton(page)).not.toHaveAttribute("aria-disabled", "true");
  });

  test("revision: hors ligne, feuille « Déplacer »", async ({ page, context }) => {
    await openFiche(page, FICHE_JARDIN);
    await openMoveSheet(page);
    await moveDays(page).getByRole("radio", { name: "Jour 4", exact: true }).click();
    await context.setOffline(true);
    const banner = moveSheet(page).getByText("Tu es hors ligne. Modifier ton programme demande une connexion.");
    await expect(banner).toBeVisible();
    await expect(placeHere(page, "15:45")).toHaveAttribute("aria-disabled", "true");
    await placeHere(page, "15:45").focus();
    await page.keyboard.press("Enter");
    await expect(moveSheet(page).getByRole("heading", { name: "Ce qui change" })).toHaveCount(0);
    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
    await expect(placeHere(page, "15:45")).not.toHaveAttribute("aria-disabled", "true");
    await placeHere(page, "15:45").click();
    const apply = moveSheet(page).getByRole("button", { name: "Appliquer" });
    await expect(apply).toBeVisible();
    await context.setOffline(true);
    await expect(apply).toHaveAttribute("aria-disabled", "true");
    await apply.focus();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(FICHE_JARDIN);
    await context.setOffline(false);
    await expect(apply).not.toHaveAttribute("aria-disabled", "true");
  });

  test("revision: pages de développement sans marqueur de recherche", async ({ page }) => {
    await openReplace(page, DEV_REPLACE_DEAN);
    await askProposal(page, "Pas mon style");
    // La proposition n'apparaît pas en marqueur sur la carte simulée tant qu'elle n'est pas appliquée.
    await expect(dayMarkers(page).filter({ hasText: /Dégustation/ })).toHaveCount(0);
    for (const marker of await dayMarkers(page).all()) {
      await expect(marker).not.toHaveAccessibleName(/Dégustation/);
    }
  });
});
