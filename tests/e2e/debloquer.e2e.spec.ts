import { expect, test } from "@playwright/test";

import { blockGoogle } from "./carte-helpers";
import {
  CHECKOUT_TTL_MS,
  R11,
  R6,
  R9,
  R9_ECHEC,
  R9_RETOUR,
  R9_SIM,
  TRIP,
  UNLOCKED_TRIP,
  clientStorage,
  expectPath,
  main,
  openOffer,
  pathOf,
  payCard,
  payTwint,
  simulate,
  startPayment,
  useScope,
} from "./debloquer-helpers";
import { collectEvents, type RecordedEvent } from "./presentation-helpers";

/**
 * Critères F9a (spécification F9, cible de réussite `R11`) : écran 9, paiement simulé, confirmation, état
 * débloqué, en 390 × 844 sur le build de production, domaines Google bloqués, une portée de simulation par test.
 */

const only = (events: RecordedEvent[], name: string) => events.filter((event) => event.name === name);
const PAYMENT_EVENTS = ["paywall_viewed", "payment_started", "payment_succeeded", "payment_failed"];
const paymentEvents = (events: RecordedEvent[]) => events.filter((event) => PAYMENT_EVENTS.includes(event.name));

let googleRequests: string[] = [];
let foreignRequests: string[] = [];

test.beforeEach(async ({ page, baseURL }) => {
  googleRequests = await blockGoogle(page);
  foreignRequests = [];
  const origin = new URL(baseURL!).origin;
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (!["http:", "https:"].includes(url.protocol)) return;
    if (url.origin !== origin) foreignRequests.push(request.url());
  });
});

test.afterEach(() => {
  expect(googleRequests).toEqual([]);
  // Aucune requête vers un autre hôte que l'application pendant les specs de F9.
  expect(foreignRequests).toEqual([]);
});

test("debloquer: contenu de l'offre", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const events = collectEvents(page);
  await openOffer(page);
  await expect(page).toHaveTitle("Édimbourg · Débloquer");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Débloquer ton voyage");
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  const plate = page.locator("[data-destination-plate='bruyere']");
  await expect(plate).toContainText("Édimbourg");
  await expect(plate).toContainText("sam. 29.08 – jeu. 03.09 · 2 adultes");
  await expect(page.locator("[data-part='prix'] p").first()).toHaveText(/^29\s?CHF$/);
  await expect(main(page)).toContainText("Paiement unique pour ce voyage, sans abonnement.");
  await expect(main(page)).toContainText("Démonstration : le paiement est simulé, aucun montant n'est débité.");
  await expect(page.getByRole("heading", { level: 2, name: "Ce qui est inclus" })).toBeVisible();
  await expect(page.locator("[data-inclusion]")).toHaveText([
    "Toutes les journées de ton voyage, du 29 août au 3 septembre",
    "Les repas et les soirées",
    "Les événements pendant ton séjour",
    "Des remplacements pour ajuster ton programme",
    "La liste à réserver avant de partir",
    "Le calendrier et le partage avec tes proches",
    "Accès jusqu'au 3 octobre 2026",
  ]);
  const buttons = await main(page).getByRole("button").allTextContents();
  expect(buttons.indexOf("Payer avec TWINT")).toBeLessThan(buttons.indexOf("Payer par carte"));
  await expect(page.getByRole("link", { name: "Continuer sans débloquer" })).toHaveAttribute("href", R11);
  await expect(main(page)).toContainText("Tes premières propositions restent accessibles, même sans payer.");
  await expect.poll(() => paymentEvents(events)).toEqual([{ name: "paywall_viewed", properties: { price_variant: "chf_29" } }]);
  await page.waitForTimeout(300);
  expect(paymentEvents(events)).toHaveLength(1);
});

test("debloquer: premières propositions accessibles sans payer", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await page.getByRole("link", { name: "Continuer sans débloquer" }).click();
  await expectPath(page, R11);
  await page.waitForTimeout(500);
  await expectPath(page, R11);

  const expectApercu = async () => {
    await page.goto(R6);
    await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
    await expect(page.getByRole("progressbar")).toHaveAccessibleName("Proposition 1 sur 8");
    await page.waitForTimeout(300);
    await expectPath(page, R6);
  };
  await expectApercu();

  await openOffer(page);
  await startPayment(page, "card");
  await simulate(page, "Simuler un refus");
  await expectPath(page, R9_ECHEC);
  await expectApercu();

  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Annuler");
  await expectPath(page, R9_ECHEC);
  await expectApercu();
  await page.goto(R11);
  await expect(page.getByRole("heading", { level: 1, name: "Édimbourg" })).toBeVisible();
  await expectPath(page, R11);
});

test("debloquer: « Retour » mène au Séjour ; 404 pour un voyage ou un paiement inconnu", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await page.getByRole("link", { name: "Retour" }).click();
  await expectPath(page, R11);

  const unknownId = "AAAAAAAAAAAAAAAAAAAAAA";
  for (const path of [
    "/voyages/inconnu/debloquer",
    `/voyages/inconnu/debloquer/paiement-simule/${unknownId}`,
    `/voyages/inconnu/debloquer/confirmation?paiement=${unknownId}`,
    `${R9}/paiement-simule/${unknownId}`,
    `${R9}/paiement-simule/court`,
    `${R9}/confirmation?paiement=${unknownId}`,
    `${R9}/confirmation?paiement=court`,
    `${R9}/confirmation`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }

  // Paiement d'un autre voyage : 404 sous l'adresse de cet autre voyage.
  await openOffer(page);
  const checkoutId = await startPayment(page, "card");
  for (const path of [
    `/voyages/${UNLOCKED_TRIP}/debloquer/paiement-simule/${checkoutId}`,
    `/voyages/${UNLOCKED_TRIP}/debloquer/confirmation?paiement=${checkoutId}`,
  ]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(404);
  }
});

test("debloquer: paramètre paiement ignoré", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const events = collectEvents(page);
  await openOffer(page);
  const reference = await main(page).innerText();

  // Un paiement en cours, commencé dans un autre onglet du même contexte.
  const other = await context.newPage();
  await openOffer(other);
  const pendingId = await startPayment(other, "card");
  await other.close();

  for (const paiement of ["court", "AAAAAAAAAAAAAAAAAAAAAA", pendingId, `${pendingId}x`]) {
    const before = only(events, "paywall_viewed").length;
    const response = await page.goto(`${R9}?paiement=${encodeURIComponent(paiement)}`);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "Débloquer ton voyage" })).toBeVisible();
    await expect(main(page).getByRole("alert")).toHaveCount(0);
    expect(await main(page).innerText()).toBe(reference);
    await expect.poll(() => only(events, "paywall_viewed").length).toBe(before + 1);
  }
  expect(only(events, "payment_failed")).toEqual([]);
});

test("debloquer: payer avec TWINT", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const events = collectEvents(page);
  await openOffer(page);
  await expect.poll(() => only(events, "paywall_viewed").length).toBe(1);
  await startPayment(page, "twint");
  expect(only(events, "payment_started")).toEqual([{ name: "payment_started", properties: { method: "twint", price_variant: "chf_29" } }]);
  await expect(page).toHaveTitle("Paiement simulé");
  await expect(main(page)).toContainText("Démonstration : aucun paiement n'est effectué et aucune donnée de paiement n'est demandée.");
  await expect(main(page)).toContainText("Voyage : Édimbourg");
  await expect(main(page)).toContainText(/Montant : 29\s?CHF/);
  await expect(main(page)).toContainText("Moyen : TWINT");
  await expect(page.locator("input, select, textarea")).toHaveCount(0);

  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);
  await expect(page.getByRole("heading", { level: 1, name: "Édimbourg" })).toBeVisible();
  await expect.poll(() => only(events, "payment_succeeded")).toEqual([
    { name: "payment_succeeded", properties: { method: "twint", price_variant: "chf_29" } },
  ]);

  await page.goBack();
  await expectPath(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", R11);
  await expect(main(page).getByRole("button")).toHaveCount(0);
  await expect(main(page)).not.toContainText("CHF");
  await page.waitForTimeout(300);
  expect(only(events, "paywall_viewed")).toHaveLength(1);
  expect(only(events, "payment_succeeded")).toHaveLength(1);
});

test("debloquer: refus et annulation", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const events = collectEvents(page);
  await openOffer(page);
  await startPayment(page, "card");
  await expect(main(page)).toContainText("Moyen : carte");
  await simulate(page, "Simuler un refus");
  await expectPath(page, R9_ECHEC);
  await expect(main(page).getByRole("alert")).toHaveText("Le paiement n'a pas abouti. Aucun montant n'a été débité.");
  await expect(payTwint(page)).toBeEnabled();
  await expect(payCard(page)).toBeEnabled();
  await expect.poll(() => only(events, "payment_failed")).toEqual([
    { name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "declined" } },
  ]);
  await expect.poll(() => only(events, "paywall_viewed").length).toBe(2);

  await startPayment(page, "twint");
  await simulate(page, "Annuler");
  await expectPath(page, R9_ECHEC);
  await expect(main(page).getByRole("alert")).toHaveText("Paiement annulé.");
  await expect.poll(() => only(events, "payment_failed").map((event) => event.properties.reason)).toEqual(["declined", "cancelled"]);

  // Recharger la page d'échec : le bandeau reste, aucun second payment_failed (paiement plus suivi dans l'onglet).
  await page.reload();
  await expect(main(page).getByRole("alert")).toHaveText("Paiement annulé.");
  await page.waitForTimeout(300);
  expect(only(events, "payment_failed")).toHaveLength(2);

  // Toujours non débloqué.
  await page.goto(R6);
  await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
});

test("debloquer: confirmation en attente", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  await scope.control({ action: "configurePayment", confirmationDelayMs: 60_000 });
  await page.clock.install();
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R9_RETOUR);
  await expect(page).toHaveTitle("Édimbourg · Confirmation du paiement");
  await expect(page.getByRole("heading", { level: 1, name: "On confirme ton paiement" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("Confirmation du paiement en cours.");
  await expect(page.getByRole("link", { name: "Retour" })).toHaveCount(0);

  await page.clock.fastForward(31_000);
  await expect(page.getByRole("status")).toHaveText(
    "La confirmation prend plus de temps que prévu. Ton voyage sera débloqué dès qu'elle arrivera.",
  );
  await expect(page.getByRole("link", { name: "Voir mes premières propositions" })).toHaveAttribute("href", R6);

  await scope.control({ action: "advanceClock", ms: 61_000 });
  await page.clock.fastForward(6_000);
  await expectPath(page, R11);
});

test("debloquer: expiration", async ({ page, context, baseURL }) => {
  const scope = await useScope(context, baseURL!);
  const events = collectEvents(page);
  await openOffer(page);
  await startPayment(page, "card");
  await scope.control({ action: "advanceClock", ms: CHECKOUT_TTL_MS + 1000 });
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R9_ECHEC);
  await expect(main(page).getByRole("alert")).toHaveText("Ce paiement a expiré. Tu peux recommencer.");
  await expect.poll(() => only(events, "payment_failed")).toEqual([
    { name: "payment_failed", properties: { method: "card", price_variant: "chf_29", reason: "expired" } },
  ]);
  await expect(payTwint(page)).toBeEnabled();
  await page.goto(R6);
  await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
});

test("debloquer: un seul déblocage", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const second = await context.newPage();
  const eventsA = collectEvents(page);
  const eventsB = collectEvents(second);
  await openOffer(page);
  await openOffer(second);
  const idA = await startPayment(page, "twint");
  await startPayment(second, "card");

  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);
  await simulate(second, "Simuler un paiement réussi");
  await expectPath(second, R11);
  await expect.poll(() => only(eventsA, "payment_succeeded").length).toBe(1);
  await page.waitForTimeout(300);
  expect(only(eventsB, "payment_succeeded")).toEqual([]);

  // Rejouer la même confirmation : la page de paiement simulé mène à la confirmation, sans second événement.
  await page.goto(`${R9}/paiement-simule/${idA}`);
  await expectPath(page, R11);
  await page.waitForTimeout(300);
  expect(only(eventsA, "payment_succeeded")).toHaveLength(1);

  // Voyage débloqué : plus de bouton de paiement.
  await openOffer(second);
  await expect(second.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await expect(payTwint(second)).toHaveCount(0);
  await second.close();
});

test("debloquer: après le paiement, écran 6b du voyage payé ; autre portée inchangée", async ({ page, context, baseURL, browser }) => {
  await useScope(context, baseURL!);
  await openOffer(page);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);

  await page.goto(R6);
  await expect(page.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeAttached();
  await expect(page.locator("[data-kind='generating']")).toHaveText("Jour 6 en préparation");
  await expect(page.getByRole("progressbar")).toHaveAccessibleName("Proposition 1 sur 7");
  await expect(page.locator("[data-part='carte']")).toContainText(/J3|J4/);

  const otherContext = await browser.newContext();
  const other = await otherContext.newPage();
  await useScope(otherContext, baseURL!);
  await openOffer(other);
  await expect(other.getByRole("heading", { level: 1, name: "Débloquer ton voyage" })).toBeVisible();
  await other.goto(R6);
  await expect(other.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
  await otherContext.close();
});

test("debloquer: aucun état périmé après le paiement", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const demo = (name: string) => page.getByRole("region", { name: "Démonstration" }).getByRole("link", { name: new RegExp(`^${name}`) });
  const tab6 = () => page.getByRole("region", { name: "Programme", exact: true }).getByRole("link", { name: "Jour 6, jeu." });

  // Avant le paiement, dans le même onglet, par navigation côté client : 6, 9, Séjour et Jour 6.
  await page.goto("/");
  await demo("Tes premières propositions").click();
  await expectPath(page, R6);
  await expect(page.getByRole("heading", { level: 1, name: "Tes premières propositions" })).toBeAttached();
  await page.goBack();
  await expectPath(page, "/");
  await demo("Débloquer").click();
  await expectPath(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Débloquer ton voyage" })).toBeVisible();
  await page.getByRole("link", { name: "Continuer sans débloquer" }).click();
  await expectPath(page, R11);
  await tab6().click();
  await expectPath(page, `${R11}/jour/6`);
  await expect(page.locator("[data-kind='generating']")).toHaveCount(0);
  await page.goBack();
  await expectPath(page, R11);
  await page.goBack();
  await expectPath(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Débloquer ton voyage" })).toBeVisible();

  // Paiement réussi.
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);

  // Après : Link vers une page déjà visitée, puis retour du navigateur.
  await tab6().click();
  await expectPath(page, `${R11}/jour/6`);
  await expect(page.locator("[data-kind='generating']")).toHaveText("Jour 6 en préparation");
  await page.goBack();
  await expectPath(page, R11);
  await page.goBack();
  await expectPath(page, R9);
  await expect(page.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await page.goBack();
  await expectPath(page, "/");
  await demo("Tes premières propositions").click();
  await expectPath(page, R6);
  await expect(page.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeAttached();

  // Chargement direct.
  await page.goto(R6);
  await expect(page.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeAttached();
  await page.goto(R9);
  await expect(page.getByRole("heading", { level: 1, name: "Ton voyage est débloqué" })).toBeVisible();
  await page.goto(`${R11}/jour/6`);
  await expect(page.locator("[data-kind='generating']")).toHaveText("Jour 6 en préparation");
});

test("debloquer: aucune donnée persistée côté client", async ({ page, context, baseURL }) => {
  await useScope(context, baseURL!);
  const params = new Set<string>();
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    for (const key of new URL(frame.url()).searchParams.keys()) params.add(key);
  });

  await page.goto(R6);
  await expect(page.getByRole("progressbar")).toBeVisible();
  await openOffer(page);
  await startPayment(page, "card");
  await simulate(page, "Simuler un refus");
  await expectPath(page, R9_ECHEC);
  await startPayment(page, "card");
  await simulate(page, "Annuler");
  await expectPath(page, R9_ECHEC);
  await startPayment(page, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, R11);
  await page.goto(R6);
  await expect(page.getByRole("heading", { level: 1, name: "Suite du tri" })).toBeAttached();

  expect(await clientStorage(page)).toEqual({ local: 0, session: 0, databases: 0, caches: 0, cookie: "" });
  expect(await context.cookies()).toEqual([]);
  expect([...params]).toEqual(["paiement"]);
  expect(pathOf(page)).toBe(R6);
  expect(R9_SIM.test(`/voyages/${TRIP}/debloquer/paiement-simule/AAAAAAAAAAAAAAAAAAAAAA`)).toBe(true);
});
