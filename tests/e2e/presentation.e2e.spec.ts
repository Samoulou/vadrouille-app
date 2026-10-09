import { expect, test, type Page } from "@playwright/test";

import { propositions } from "../../src/mocks/edimbourg";

import { blockGoogle } from "./carte-helpers";
import {
  APERCU,
  SUITE,
  card,
  cardName,
  collectEvents,
  dialog,
  openDeck,
  press,
  progress,
  swipe,
  toast,
  type RecordedEvent,
} from "./presentation-helpers";

/** Critères F6 sur /voyages/[id]/presentation (écrans 6, 6b, 7, 8), en 390 × 844, build de production. */

let googleRequests: string[] = [];
let events: RecordedEvent[] = [];
const named = (name: string) => events.filter((event) => event.name === name);

test.beforeEach(async ({ page }) => {
  googleRequests = await blockGoogle(page);
  events = collectEvents(page);
});

test.afterEach(() => {
  // Aucune requête vers un domaine Google pendant les specs de F6.
  expect(googleRequests).toEqual([]);
});

test("presentation: ordre et filtrage du paquet", async ({ page }) => {
  await openDeck(page);
  await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
  const seen: string[] = [];
  for (let i = 0; i < 8; i += 1) {
    seen.push(await cardName(page));
    await expect(progress(page)).toHaveAttribute("aria-valuenow", String(i + 1));
    // Repas : « Option suivante » sur l'option 1, pour voir les deux options.
    const next = page.getByRole("button", { name: "Option suivante", exact: true });
    await ((await next.count()) > 0 ? next.click() : page.getByRole("button", { name: /^(J'aime|Je choisis)$/ }).click());
  }
  expect(seen).toEqual(propositions.map((p) => p.stop.name));
  await expect(page.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeVisible();
});

test("presentation: 404 hors organisation", async ({ page }) => {
  const response = await page.goto("/voyages/inconnu/presentation");
  expect(response?.status()).toBe(404);
});

test("presentation: glisser décide ou revient", async ({ page }) => {
  await openDeck(page);
  // 10 % lentement : retour élastique, sans décision.
  await swipe(page, 0.1, { slow: true });
  await expect(card(page)).not.toHaveAttribute("data-dragging", "true");
  expect(await cardName(page)).toBe("[Château d'Édimbourg]");
  expect(named("deck_decision")).toEqual([]);
  await expect.poll(() => card(page).evaluate((el) => getComputedStyle(el).transform)).toBe("none");

  // Pendant le glisser : étiquette selon le sens, décorative.
  const box = (await card(page).boundingBox())!;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 3;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x - 50, y, { steps: 5 });
  await expect(card(page).locator("[data-swipe-label='dislike']")).toHaveText("Pas pour moi");
  await expect(card(page).locator("[data-swipe-label]")).toHaveAttribute("aria-hidden", "true");
  await page.mouse.move(x + 50, y, { steps: 5 });
  await expect(card(page).locator("[data-swipe-label='like']")).toHaveText("J'aime");
  // Retour lent près du départ, pause, relâcher : ni décision ni détail.
  for (let dx = 50; dx >= 16; dx -= 2) {
    await page.mouse.move(x + dx, y);
    await page.waitForTimeout(25);
  }
  await page.waitForTimeout(150);
  await page.mouse.up();
  await expect(card(page).locator("[data-swipe-label]")).toBeHidden();
  expect(await cardName(page)).toBe("[Château d'Édimbourg]");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(named("deck_decision")).toEqual([]);

  // 40 % vers la droite : « J'aime ».
  await swipe(page, 0.4);
  await expect.poll(() => cardName(page)).toBe("[Bonne table de l'Old Town]");
  expect(named("deck_decision")).toEqual([
    {
      name: "deck_decision",
      properties: { decision: "like", kind: "activity", category: "museum", position: 1, gesture: "swipe", travel_minutes: 15 },
    },
  ]);
  await expect(card(page)).toBeFocused();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("presentation: boutons et clavier", async ({ page }) => {
  await openDeck(page);
  await press(page, "Pas pour moi");
  await expect(page.getByRole("button", { name: "Option suivante" })).toBeFocused();
  await press(page, "Je choisis");
  await card(page).focus();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => cardName(page)).toBe("[Jardin botanique royal]");
  await expect(card(page)).toBeFocused();
  await page.keyboard.press("ArrowLeft");
  await expect.poll(() => named("deck_decision").length).toBe(4);
  expect(named("deck_decision").map((e) => [e.properties.decision, e.properties.gesture])).toEqual([
    ["dislike", "button"],
    ["like", "button"],
    ["like", "key"],
    ["dislike", "key"],
  ]);

  // Sans effet sur le toast.
  await toast(page).getByRole("button", { name: "Annuler" }).focus();
  await page.keyboard.press("ArrowRight");
  // Sans effet dans la feuille : refus de la seconde activité nature (Arthur's Seat) → question.
  await press(page, "Pas pour moi");
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  expect(named("deck_decision")).toHaveLength(5);
});

test("presentation: commandes toujours visibles", async ({ page }) => {
  await openDeck(page);
  for (let i = 0; i < 8; i += 1) {
    const controls = [
      progress(page),
      page.getByRole("link", { name: "Passer" }),
      card(page),
      page.locator("[data-action='dislike']"),
      page.locator("[data-action='like']"),
      page.locator("[data-action='keep-day']"),
    ];
    for (const control of controls) {
      await expect(control).toBeInViewport({ ratio: 1 });
    }
    for (const control of controls.slice(1)) {
      const box = (await control.boundingBox())!;
      expect(box.width, (await control.textContent()) ?? "").toBeGreaterThanOrEqual(44);
      expect(box.height).toBeGreaterThanOrEqual(44);
    }
    expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
    if (i > 0) {
      const annuler = toast(page).getByRole("button", { name: "Annuler" });
      await expect(annuler).toBeInViewport({ ratio: 1 });
      const box = (await annuler.boundingBox())!;
      expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
    }
    const next = page.getByRole("button", { name: "Option suivante", exact: true });
    await ((await next.count()) > 0 ? next.click() : page.locator("[data-action='like']").click());
  }
});

test("presentation: annuler restaure l'état exact", async ({ page }) => {
  await openDeck(page);
  await press(page, "J'aime");
  await press(page, "Je choisis");
  await expect(progress(page)).toHaveAccessibleName("Proposition 3 sur 7");
  await expect(toast(page)).toHaveText(/\[Bonne table de l'Old Town\] choisi\./);
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await expect(progress(page)).toHaveAccessibleName("Proposition 2 sur 8");
  expect(await cardName(page)).toBe("[Bonne table de l'Old Town]");
  await expect(card(page)).toBeFocused();
  await expect(toast(page)).toHaveCount(0);
  expect(named("deck_undo")).toEqual([{ name: "deck_undo", properties: { position: 2 } }]);
});

test("presentation: le toast disparaît après 5 s", async ({ page }) => {
  await page.clock.install();
  await openDeck(page);
  await press(page, "Pas pour moi");
  await expect(toast(page)).toHaveAttribute("role", "status");
  await expect(toast(page)).toContainText("[Château d'Édimbourg] écarté.");
  await expect(page.locator("[data-action='dislike']")).toBeFocused();
  await page.clock.runFor(4_900);
  await expect(toast(page)).toBeVisible();
  await page.clock.runFor(200);
  await expect(toast(page)).toHaveCount(0);
});

test("presentation: créneau de repas", async ({ page }) => {
  await openDeck(page);
  await press(page, "J'aime");
  await expect(card(page)).toContainText("option 1 sur 2");
  await expect(page.getByRole("button", { name: "Je choisis" })).toBeVisible();
  await press(page, "Option suivante");
  await expect(card(page)).toContainText("option 2 sur 2");
  await expect(page.locator("[data-action='dislike']")).toHaveAccessibleName("Pas pour moi");
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await press(page, "Je choisis");
  await expect(progress(page)).toHaveAccessibleName("Proposition 3 sur 7");
  expect(await cardName(page)).toBe("[Dean Village]");
});

async function refuseTwoMuseums(page: Page) {
  await press(page, "Pas pour moi"); // château
  await press(page, "Je choisis"); // dîner
  await press(page, "J'aime"); // Dean Village
  await press(page, "J'aime"); // jardin
  await press(page, "J'aime"); // Arthur's Seat
  await press(page, "Pas pour moi"); // musée national
}

test("presentation: écarter deux musées et répondre", async ({ page }) => {
  await openDeck(page);
  await refuseTwoMuseums(page);
  const sheet = page.getByRole("dialog", { name: "On arrête les musées et monuments pour ce voyage ?" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-modal", "true");
  await expect(sheet.getByRole("heading")).toBeFocused();
  await expect(toast(page)).toHaveCount(0);
  await sheet.getByRole("button", { name: "Trop cher" }).click();
  await sheet.getByRole("button", { name: "Oui" }).click();
  await expect(sheet).toHaveCount(0);
  expect(named("preference_prompt_answered")).toEqual([
    { name: "preference_prompt_answered", properties: { category: "museum", answer: "yes", reason: "too_expensive" } },
  ]);
  await expect(toast(page)).toContainText("[Musée national d'Écosse] écarté.");
});

test("préférences: aucune généralisation sans réponse", async ({ page }) => {
  await openDeck(page);
  // Deux « Option suivante » ne la déclenchent jamais.
  await press(page, "J'aime");
  await press(page, "Option suivante");
  await press(page, "Pas pour moi");
  await expect(dialog(page)).toHaveCount(0);
  await openDeck(page);
  await refuseTwoMuseums(page);
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog(page)).toHaveCount(0);
  expect(named("preference_prompt_answered")).toEqual([]);
  await expect(page.getByRole("button", { name: "Pas pour moi" })).toBeFocused();
  await expect(toast(page)).toContainText("[Musée national d'Écosse] écarté.");
});

test("presentation: question de distance", async ({ page }) => {
  await openDeck(page);
  await press(page, "Pas pour moi"); // château (museum)
  await press(page, "Je choisis");
  await press(page, "J'aime"); // Dean Village
  await press(page, "Pas pour moi"); // jardin (nature)
  await press(page, "Pas pour moi"); // Arthur's Seat (nature) → question
  await dialog(page).getByRole("button", { name: "Trop loin" }).click();
  await dialog(page).getByRole("button", { name: "Non" }).click();
  await expect(dialog(page)).toHaveCount(0);
  await press(page, "Pas pour moi"); // musée national (museum) → question
  await dialog(page).getByRole("button", { name: "Trop loin" }).click();
  await dialog(page).getByRole("button", { name: "Oui" }).click();
  const distance = page.getByRole("dialog", { name: "On reste plus près de ton hôtel ?" });
  await expect(distance).toBeVisible();
  await expect(distance.getByRole("heading")).toBeFocused();
  await distance.getByRole("button", { name: "Oui" }).click();
  await expect(dialog(page)).toHaveCount(0);
  expect(named("preference_prompt_answered").map((e) => e.properties)).toEqual([
    { category: "nature", answer: "no", reason: "too_far" },
    { category: "museum", answer: "yes", reason: "too_far" },
    { category: "distance", answer: "yes" },
  ]);
  await press(page, "Pas pour moi"); // distillerie : plus aucune question
  await expect(dialog(page)).toHaveCount(0);
});

test("presentation: passer et tout garder", async ({ page }) => {
  await openDeck(page);
  await press(page, "Tout garder pour le jour 1");
  expect(await cardName(page)).toBe("[Dean Village]");
  await expect(toast(page)).toContainText("Jour 1 gardé.");
  expect(named("deck_skipped")).toEqual([{ name: "deck_skipped", properties: { position: 1, scope: "day" } }]);
  expect(named("deck_decision")).toEqual([]);
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  expect(await cardName(page)).toBe("[Château d'Édimbourg]");
  await page.getByRole("link", { name: "Passer" }).click();
  await page.waitForURL("**/voyages/mock_trip_edimbourg");
  expect(new URL(page.url()).pathname).toBe("/voyages/mock_trip_edimbourg");
  expect(named("deck_skipped").at(-1)).toEqual({ name: "deck_skipped", properties: { position: 1, scope: "all" } });
});

test("presentation: détail et retour du focus", async ({ page }) => {
  await openDeck(page);
  await card(page).click();
  const sheet = page.getByRole("dialog", { name: "[Château d'Édimbourg]" });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByRole("heading")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await expect(card(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(sheet).toBeVisible();
  await sheet.getByRole("button", { name: "Fermer" }).click();
  await expect(card(page)).toBeFocused();
  await page.keyboard.press("Space");
  await expect(sheet).toBeVisible();
  expect(named("deck_decision")).toEqual([]);
});

test("presentation: fin de l'aperçu", async ({ page }) => {
  await openDeck(page);
  for (const day of [1, 2, 4, 5]) {
    await press(page, `Tout garder pour le jour ${day}`);
  }
  const title = page.getByRole("heading", { name: "Tu as vu tes premières propositions" });
  await expect(title).toBeFocused();
  await expect(page.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg/debloquer");
  await expect(page.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg");
  await expect(page.locator("main")).not.toContainText("CHF");
  await expect(page.locator("main")).not.toContainText(/\d+[.,]\d{2}/);
});

test("presentation: suite du tri", async ({ page }) => {
  await openDeck(page, SUITE);
  await expect(page.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeAttached();
  const banner = page.locator("[data-kind='generating']");
  await expect(banner).toHaveText("Jour 6 en préparation");
  const bannerBox = (await banner.boundingBox())!;
  expect(bannerBox.y).toBeLessThan((await card(page).boundingBox())!.y);
  const days = new Set<string>();
  while ((await card(page).count()) > 0) {
    days.add((await card(page).locator("[id$='-moment']").textContent()) ?? "");
    const next = page.getByRole("button", { name: "Option suivante", exact: true });
    await ((await next.count()) > 0 ? next.click() : page.locator("[data-action='like']").click());
  }
  expect([...days].every((text) => /^J[34]/.test(text))).toBe(true);
  await expect(page.getByRole("heading", { name: "Tu as tout trié" })).toBeVisible();
  await expect(banner).toHaveText("Jour 6 en préparation");
  await expect(page.getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", "/voyages/mock_trip_edimbourg_debloque");
});

test("presentation: mouvement réduit", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openDeck(page);
  await swipe(page, 0.25, { release: false });
  await expect(card(page)).toHaveAttribute("data-dragging", "true");
  const matrix = await card(page).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform));
  expect(matrix.m41).toBeGreaterThan(0);
  expect(Math.abs(matrix.b)).toBeLessThan(1e-6);
  await page.mouse.move(380, 300, { steps: 4 });
  // Relève le mode de sortie et les animations de la carte au moment où elle part.
  await page.evaluate(() => {
    const seen: string[] = [];
    (window as unknown as { exits: string[] }).exits = seen;
    new MutationObserver((records) => {
      for (const record of records) {
        const el = record.target as HTMLElement;
        if (el.dataset.exit) {
          const keyframes = el.getAnimations().flatMap((a) => (a.effect as KeyframeEffect).getKeyframes());
          seen.push(`${el.dataset.exit}:${keyframes.map((k) => `${k.opacity}|${k.transform}`).join(";")}`);
        }
      }
    }).observe(document.querySelector("main")!, { attributes: true, attributeFilter: ["data-exit"], subtree: true });
  });
  await page.mouse.up();
  await expect.poll(() => page.evaluate(() => (window as unknown as { exits: string[] }).exits.length)).toBeGreaterThan(0);
  const [exit] = await page.evaluate(() => (window as unknown as { exits: string[] }).exits);
  expect(exit).toMatch(/^fade:/);
  expect(exit).not.toContain("rotate");
  await expect.poll(() => cardName(page)).toBe("[Bonne table de l'Old Town]");

  await page.emulateMedia({ reducedMotion: "no-preference" });
  await swipe(page, 0.25, { release: false });
  const rotated = await card(page).evaluate((el) => new DOMMatrix(getComputedStyle(el).transform));
  expect(Math.abs(rotated.b)).toBeGreaterThan(0);
  await page.mouse.up();
});

test("presentation: aucune donnée persistée côté client", async ({ page, context }) => {
  await openDeck(page);
  await card(page).click();
  await page.getByRole("button", { name: "Fermer" }).click();
  await refuseTwoMuseums(page);
  await dialog(page).getByRole("button", { name: "Trop loin" }).click();
  await dialog(page).getByRole("button", { name: "Non" }).click();
  await toast(page).getByRole("button", { name: "Annuler" }).click();
  await swipe(page, 0.4);
  await press(page, "Tout garder pour le jour 5");
  await expect(page.getByRole("heading", { name: "Tu as vu tes premières propositions" })).toBeVisible();

  const stored = await page.evaluate(async () => ({
    local: localStorage.length,
    session: sessionStorage.length,
    databases: (await indexedDB.databases()).length,
    caches: (await caches.keys()).length,
    cookie: document.cookie,
  }));
  expect(stored).toEqual({ local: 0, session: 0, databases: 0, caches: 0, cookie: "" });
  expect(await context.cookies()).toEqual([]);
  const url = new URL(page.url());
  expect(url.search).toBe("");
  expect(url.hash).toBe("");
  expect(url.pathname).toBe(APERCU);
});
