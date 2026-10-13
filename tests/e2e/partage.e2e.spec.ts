import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

import { serverLogPath } from "../../scripts/e2e-server-log.mjs";
import { edimbourgCarte } from "../../src/mocks/edimbourg-carte";
import { edimbourgDebloque } from "../../src/mocks/edimbourg";

import { MOMENTS, openToday, setClock } from "./aujourdhui-helpers";
import { blockGoogle } from "./carte-helpers";
import { HEADER } from "./debloquer-helpers";
import { cacheEntries, controlNetwork, expectFallback, waitForActiveWorker } from "./hors-ligne-helpers";
import {
  createLink,
  LOCKED_TRIP,
  openShareSheet,
  R11,
  R12,
  revokeLink,
  RP,
  RPJ,
  SHARE_TOKEN_DESACTIVE,
  SHARE_TOKEN_VALIDE,
  shareButton,
  shareField,
  shareSheet,
  sheetButton,
  statusOf,
  createShareScope,
} from "./partage-helpers";

/**
 * « Partager » et vue partagée (spécification F10, F10c ; critères C27 à C40), en 390 × 844 sur le build de
 * production, domaines Google bloqués. Chaque test a sa portée de simulation, horloge du serveur au
 * 2026-08-30T10:40:00+01:00 (`createShareScope`). Les service workers restent bloqués, sauf dans le bloc de C36.
 */

const INVALID_TITLE = "Ce lien de partage n'est pas valide.";
const INVALID_TEXT = "Demande un nouveau lien à la personne qui te l'a envoyé.";

let google: string[] = [];
test.beforeEach(async ({ context }) => {
  google = await blockGoogle(context);
});
test.afterEach(() => {
  expect(google).toEqual([]);
});

/** Contexte neuf (sans cookie) qui envoie l'en-tête de la portée du test (0020 § 6), domaines Google bloqués. */
async function visitorContext(browser: Browser, baseURL: string, scope: string): Promise<{ page: Page; close: () => Promise<void> }> {
  const context: BrowserContext = await browser.newContext({
    baseURL,
    extraHTTPHeaders: { [HEADER]: scope },
    viewport: { width: 390, height: 844 },
  });
  const blocked = await blockGoogle(context);
  const page = await context.newPage();
  return {
    page,
    close: async () => {
      await context.close();
      expect(blocked).toEqual([]);
    },
  };
}

/** Page 404 de la vue partagée : même texte pour tous les cas. */
async function expectInvalid(page: Page) {
  await expect(page.getByRole("heading", { level: 1, name: INVALID_TITLE })).toBeVisible();
  await expect(page.getByText(INVALID_TEXT)).toBeVisible();
  await expect(page.getByText("Programme partagé · lecture seule")).toHaveCount(0);
}

test.describe("feuille « Partager »", () => {
  test("partage: feuille", async ({ page, context, baseURL }) => {
    // C27 : Séjour et Journée du voyage débloqué ; feuille modale sans changement d'adresse ; Échap, focus rendu.
    await createShareScope(context, baseURL!);
    for (const path of [R11(), R12(2)]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      const button = shareButton(page);
      await expect(button, path).toBeVisible();
      await button.click();
      const sheet = shareSheet(page);
      await expect(sheet).toBeVisible();
      await expect(sheet).toHaveAttribute("aria-modal", "true");
      await expect(sheet.getByRole("heading", { level: 2, name: "Partager ton voyage" })).toBeFocused();
      expect(new URL(page.url()).pathname).toBe(path);
      await expect(sheet.getByText("Chargement du partage.")).toHaveCount(0);
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
      await expect(button).toBeFocused();
    }
    // Voyage non débloqué : aucun bouton, sans texte de remplacement.
    for (const path of [R11(LOCKED_TRIP), R12(2, LOCKED_TRIP)]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expect(shareButton(page), path).toHaveCount(0);
    }
  });

  test("partage: créer un lien", async ({ page, context, baseURL }) => {
    // C28.
    const scope = await createShareScope(context, baseURL!);
    await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: new URL(baseURL!).origin });
    await page.goto(R11());
    await openShareSheet(page);
    const sheet = shareSheet(page);
    await expect(sheet.getByText("Un lien est actif depuis le 1er août 2026.")).toBeVisible();
    await expect(sheet.getByText("Valable jusqu'au 3 octobre 2026.")).toBeVisible();
    expect(await page.content()).not.toContain(SHARE_TOKEN_VALIDE);

    await revokeLink(page);
    await expect(sheetButton(page, "Créer un lien")).toBeVisible();
    expect(await statusOf(context.request, baseURL!, scope.name, RP(SHARE_TOKEN_VALIDE))).toBe(404);

    // Sans `navigator.share` (Chromium sous Linux), « Envoyer… » est absent.
    expect(await page.evaluate(() => typeof navigator.share)).toBe("undefined");
    const token = await createLink(page);
    await expect(shareField(page)).toHaveValue(`${new URL(baseURL!).origin}/p/${token}`);
    await expect(sheet.getByText("Valable jusqu'au 3 octobre 2026.")).toBeVisible();
    await expect(sheetButton(page, "Envoyer…")).toHaveCount(0);
    await sheetButton(page, "Copier le lien").click();
    await expect(sheet.getByRole("status").filter({ hasText: "Lien copié." })).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(`${new URL(baseURL!).origin}/p/${token}`);
    expect(await statusOf(context.request, baseURL!, scope.name, RP(token))).toBe(200);

    // Fermer puis rouvrir : lien actif depuis le 30 août, sans le jeton.
    await sheetButton(page, "Fermer").click();
    await openShareSheet(page);
    await expect(sheet.getByText("Un lien est actif depuis le 30 août 2026.")).toBeVisible();
    await expect(sheet.getByRole("textbox")).toHaveCount(0);
    expect(await page.content()).not.toContain(token);
  });

  test("partage: envoyer avec le partage natif", async ({ page, context, baseURL }) => {
    // C28 : avec `navigator.share` simulé, « Envoyer… » l'appelle avec l'adresse.
    await createShareScope(context, baseURL!);
    await page.addInitScript(() => {
      const shared: string[] = [];
      (window as unknown as { __partages: string[] }).__partages = shared;
      (navigator as Navigator & { share: (data: ShareData) => Promise<void> }).share = async (data: ShareData) => {
        shared.push(String(data.url));
      };
    });
    await page.goto(R11());
    await openShareSheet(page);
    await revokeLink(page);
    const token = await createLink(page);
    await sheetButton(page, "Envoyer…").click();
    expect(await page.evaluate(() => (window as unknown as { __partages: string[] }).__partages)).toEqual([
      `${new URL(baseURL!).origin}/p/${token}`,
    ]);
  });

  test("partage: désactiver et remplacer", async ({ page, context, baseURL }) => {
    // C33.
    const scope = await createShareScope(context, baseURL!);
    await page.goto(R11());
    await openShareSheet(page);
    await revokeLink(page);
    const first = await createLink(page);
    await sheetButton(page, "Fermer").click();
    await openShareSheet(page);

    await sheetButton(page, "Désactiver le lien").click();
    await expect(shareSheet(page).getByText("Le lien ne fonctionnera plus pour personne.")).toBeVisible();
    await sheetButton(page, "Annuler").click();
    await expect(sheetButton(page, "Désactiver le lien")).toBeFocused();
    await expect(shareSheet(page).getByText(/^Un lien est actif depuis le /)).toBeVisible();
    expect(await statusOf(context.request, baseURL!, scope.name, RP(first))).toBe(200);

    await sheetButton(page, "Créer un nouveau lien").click();
    await expect(shareSheet(page).getByText("L'ancien lien ne fonctionnera plus pour personne.")).toBeVisible();
    await sheetButton(page, "Annuler").click();
    await expect(sheetButton(page, "Créer un nouveau lien")).toBeFocused();
    await expect(shareField(page)).toHaveCount(0);
    expect(await statusOf(context.request, baseURL!, scope.name, RP(first))).toBe(200);

    await sheetButton(page, "Créer un nouveau lien").click();
    await sheetButton(page, "Créer un nouveau lien").click();
    await expect(shareField(page)).toBeVisible();
    const second = new URL(await shareField(page).inputValue()).pathname.split("/").pop()!;
    expect(second).not.toBe(first);
    expect(await statusOf(context.request, baseURL!, scope.name, RP(first))).toBe(404);
    expect(await statusOf(context.request, baseURL!, scope.name, RP(second))).toBe(200);
  });

  test("partage: hors ligne", async ({ page, context, baseURL }) => {
    // C34 : feuille ouverte, réseau coupé puis rétabli, sans rechargement.
    await createShareScope(context, baseURL!);
    await page.goto(R11());
    await openShareSheet(page);
    const banner = shareSheet(page).getByText("Tu es hors ligne. Partager demande une connexion.");
    await context.setOffline(true);
    await expect(banner).toBeVisible();
    for (const name of ["Créer un nouveau lien", "Désactiver le lien"]) {
      await expect(sheetButton(page, name)).toHaveAttribute("aria-disabled", "true");
    }
    await context.setOffline(false);
    await expect(banner).toHaveCount(0);
    for (const name of ["Créer un nouveau lien", "Désactiver le lien"]) {
      await expect(sheetButton(page, name)).not.toHaveAttribute("aria-disabled");
    }
    await revokeLink(page);
    await context.setOffline(true);
    await expect(sheetButton(page, "Créer un lien")).toHaveAttribute("aria-disabled", "true");
    await context.setOffline(false);
    await expect(sheetButton(page, "Créer un lien")).not.toHaveAttribute("aria-disabled");
  });
});

test.describe("vue partagée", () => {
  test("partage: vue partagée sans logement", async ({ page, context, baseURL, browser }) => {
    // C29 : lien créé par la personne qui voyage, ouvert dans un contexte neuf.
    const scope = await createShareScope(context, baseURL!);
    await page.goto(R11());
    await openShareSheet(page);
    await revokeLink(page);
    const token = await createLink(page);

    const visitor = await visitorContext(browser, baseURL!, scope.name);
    const response = await visitor.page.goto(RP(token));
    expect(response?.status()).toBe(200);
    const view = visitor.page;
    await expect(view.getByText("Programme partagé · lecture seule")).toBeVisible();
    await expect(view.getByRole("heading", { level: 1 })).toHaveText(/Édimbourg/);
    await expect(view.getByText(/2 adultes/)).toBeVisible();
    await expect(view.getByRole("heading", { level: 2, name: "Pendant le séjour" })).toBeVisible();
    const days = view.getByRole("region", { name: "Jour par jour" }).getByRole("link");
    await expect(days).toHaveCount(edimbourgDebloque.days.length);
    for (const [index, day] of edimbourgDebloque.days.entries()) {
      await expect(days.nth(index)).toHaveAttribute("href", RPJ(token, day.index));
    }
    const text = await view.locator("body").innerText();
    for (const forbidden of ["À faire avant de partir", "Budget", "Partager", "Aujourd'hui"]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
    await visitor.close();

    // Corps des réponses HTTP : rien de privé, pour RP et RPJ (jours 1, 2 et 6).
    // Coordonnées des terminus (logement, aéroport), cherchées comme nombres entiers et non comme sous-chaînes
    // (55.95 n'est pas 55.952) ; une valeur partagée avec une étape, transmise pour la carte, n'est pas cherchée.
    const stopValues = new Set(
      edimbourgCarte.flatMap((map) => map.points.filter((point) => point.ref.type === "stop").flatMap((point) => [point.lat, point.lng])),
    );
    const terminusValues = [
      ...new Set(
        edimbourgCarte.flatMap((map) => map.points.filter((point) => point.ref.type === "terminus").flatMap((point) => [point.lat, point.lng])),
      ),
    ].filter((value) => !stopValues.has(value));
    expect(terminusValues.length).toBeGreaterThan(0);
    const asNumber = (value: number) => new RegExp(`(?<![\\d.])${String(value).replace(".", "\\.")}(?![\\d])`);
    for (const path of [RP(token), RPJ(token, 1), RPJ(token, 2), RPJ(token, 6)]) {
      const body = await (await context.request.get(`${baseURL}${path}`, { headers: { [HEADER]: scope.name } })).text();
      const forbidden = [
        "[Hôtel, Old Town]",
        "[Arrivée, aéroport d'Édimbourg]",
        "[Départ, aéroport d'Édimbourg]",
        "mock_trip_edimbourg",
        "mock_place_",
        "Pendant ton séjour",
      ];
      for (const day of edimbourgDebloque.days) {
        for (const stop of [...day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])), ...day.events]) {
          forbidden.push(stop.id);
          if (stop.reason) forbidden.push(stop.reason);
          if (stop.source) forbidden.push(stop.source.label, stop.source.url);
        }
      }
      for (const value of forbidden) expect(body.includes(value), `${path} : ${value}`).toBe(false);
      for (const value of terminusValues) expect(asNumber(value).test(body), `${path} : ${value}`).toBe(false);
    }
    const day2 = await (await context.request.get(`${baseURL}${RPJ(token, 2)}`, { headers: { [HEADER]: scope.name } })).text();
    expect(day2).toContain("[Concert d'orgue à St Giles]");
    expect(day2).not.toContain("[Tu as choisi la musique]");
  });

  test("partage: journée partagée", async ({ page, context, baseURL }) => {
    // C30, C5 (pas de mention « Données de lieux : Google » en phase 0).
    await createShareScope(context, baseURL!);
    const response = await page.goto(RPJ(SHARE_TOKEN_VALIDE, 2));
    expect(response?.status()).toBe(200);
    await expect(page).toHaveTitle("Édimbourg · Jour 2 · Programme partagé");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dimanche 30 août");
    const line = page.locator("ol").first();
    await expect(line).toBeVisible();
    await expect(line.getByRole("link")).toHaveCount(0);
    await expect(line.locator("li", { hasText: "[Dean Village]" })).toContainText("10:50");
    await expect(line.locator("li", { hasText: "Début de journée" })).toContainText("09:00");
    await expect(line.locator("li", { hasText: "Fin de journée" })).toContainText("20:45");
    const table = line.locator("li", { hasText: "[Bonne table de New Town]" });
    await expect(table).toContainText("19:00");
    await expect(page.getByText("À réserver")).toHaveCount(0);
    await expect(page.locator("li", { hasText: "[Concert d'orgue à St Giles]" })).toContainText("Non confirmé");
    await expect(page.locator("[data-kind='travel']")).toHaveCount(0);
    await expect(page.getByText("Données de lieux : Google")).toHaveCount(0);
    await page.getByRole("link", { name: "Retour" }).click();
    await expect(page).toHaveURL(new RegExp(`${RP(SHARE_TOKEN_VALIDE)}$`));
    await expect(page).toHaveTitle("Édimbourg · Programme partagé");

    await page.goto(RPJ(SHARE_TOKEN_VALIDE, 6));
    await expect(page.getByText("Cette journée est encore en préparation.")).toBeVisible();
    const missing = await page.goto(RPJ(SHARE_TOKEN_VALIDE, 7));
    expect(missing?.status()).toBe(404);
    await expectInvalid(page);
  });

  test("partage: carte", async ({ page, context, baseURL }) => {
    // C31 : région de carte dans son état de remplacement (pas de clé en CI), aucune requête Google.
    await createShareScope(context, baseURL!);
    for (const path of [RP(SHARE_TOKEN_VALIDE), RPJ(SHARE_TOKEN_VALIDE, 2)]) {
      await page.goto(path);
      const map = page.locator("[data-day-map]");
      await expect(map, path).toBeVisible();
      await expect(map.getByRole("status")).toHaveText("Carte indisponible. La liste contient tout le programme.");
      await expect(map.getByRole("button")).toHaveCount(0);
    }
  });

  test("partage: liens non valides et fin du partage", async ({ page, context, baseURL, browser }) => {
    // C32.
    const scope = await createShareScope(context, baseURL!);
    const visitor = await visitorContext(browser, baseURL!, scope.name);
    for (const token of ["A".repeat(43), SHARE_TOKEN_DESACTIVE, "abc", "A".repeat(300)]) {
      const response = await visitor.page.goto(RP(token));
      expect(response?.status(), token).toBe(404);
      await expectInvalid(visitor.page);
    }
    expect((await visitor.page.goto(RP(SHARE_TOKEN_VALIDE)))?.status()).toBe(200);

    await scope.control({ action: "reset", now: "2026-10-03T23:59:00+01:00" });
    expect((await visitor.page.goto(RP(SHARE_TOKEN_VALIDE)))?.status()).toBe(200);
    await scope.control({ action: "reset", now: "2026-10-04T00:00:00+01:00" });
    expect((await visitor.page.goto(RP(SHARE_TOKEN_VALIDE)))?.status()).toBe(404);
    await expectInvalid(visitor.page);
    await visitor.close();

    const sejour = await page.goto(R11());
    expect(sejour?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(shareButton(page)).toHaveCount(0);
  });

  test("partage: en-têtes", async ({ context, baseURL }) => {
    // C39 : toutes les réponses sous /p/, 200 et 404.
    const scope = await createShareScope(context, baseURL!);
    const check = async (path: string, status: number) => {
      const response = await context.request.get(`${baseURL}${path}`, { headers: { [HEADER]: scope.name } });
      expect(response.status(), path).toBe(status);
      const headers = response.headers();
      expect(headers["cache-control"], path).toContain("private");
      expect(headers["cache-control"], path).toContain("no-store");
      expect(headers["referrer-policy"], path).toBe("strict-origin");
      expect(headers["x-robots-tag"], path).toBe("noindex, nofollow");
      expect(await response.text(), path).toContain('<meta name="robots" content="noindex, nofollow"/>');
    };
    await check(RP(SHARE_TOKEN_VALIDE), 200);
    await check(RPJ(SHARE_TOKEN_VALIDE, 2), 200);
    for (const token of [SHARE_TOKEN_DESACTIVE, "A".repeat(43), "abc", "A".repeat(300)]) await check(RP(token), 404);
    await check(RPJ(SHARE_TOKEN_VALIDE, 7), 404);
    await scope.control({ action: "reset", now: "2026-10-04T00:00:00+01:00" });
    await check(RP(SHARE_TOKEN_VALIDE), 404);
  });

  test("partage: referer", async ({ page, context, baseURL }) => {
    // C40 : une requête vers une autre origine ne porte que l'origine de la page.
    await createShareScope(context, baseURL!);
    const referers: (string | undefined)[] = [];
    await context.route("https://referer.example/**", async (route) => {
      referers.push(await route.request().headerValue("referer") ?? undefined);
      await route.fulfill({ status: 204 });
    });
    for (const path of [RP(SHARE_TOKEN_VALIDE), RPJ(SHARE_TOKEN_VALIDE, 2)]) {
      await page.goto(path);
      await page.evaluate(() => fetch("https://referer.example/sonde", { mode: "no-cors" }).then(() => undefined));
    }
    expect(referers).toEqual([`${new URL(baseURL!).origin}/`, `${new URL(baseURL!).origin}/`]);
  });
});

test("partage: jeton jamais journalisé", async ({ page, context, baseURL, browser }) => {
  // C35 : console du navigateur et sortie du serveur de test (build de production) pendant le parcours de C28 à C33.
  const consoleLines: string[] = [];
  const listen = (target: Page) => target.on("console", (message) => consoleLines.push(message.text()));
  listen(page);
  const scope = await createShareScope(context, baseURL!);
  const tokens = [SHARE_TOKEN_VALIDE];
  await page.goto(R11());
  await openShareSheet(page);
  await revokeLink(page);
  tokens.push(await createLink(page));
  await sheetButton(page, "Fermer").click();
  await openShareSheet(page);
  await sheetButton(page, "Créer un nouveau lien").click();
  await sheetButton(page, "Créer un nouveau lien").click();
  await expect(shareField(page)).toBeVisible();
  tokens.push(new URL(await shareField(page).inputValue()).pathname.split("/").pop()!);

  const visitor = await visitorContext(browser, baseURL!, scope.name);
  listen(visitor.page);
  for (const path of [RP(tokens[2]!), RPJ(tokens[2]!, 2), RP(tokens[1]!), RP("abc")]) await visitor.page.goto(path);
  await visitor.close();

  await sheetButton(page, "Fermer").click();
  await openShareSheet(page);
  await revokeLink(page);

  const server = readFileSync(serverLogPath({ port: Number(new URL(baseURL!).port), tmpDir: tmpdir() }), "utf8");
  for (const token of tokens) {
    expect(server.includes(token), "sortie du serveur").toBe(false);
    for (const line of consoleLines) expect(line.includes(token), line).toBe(false);
  }
});

test.describe("jamais hors ligne", () => {
  test.use({ serviceWorkers: "allow", timezoneId: "Europe/London" });

  test("partage: jamais hors ligne", async ({ page, context, baseURL }) => {
    // C36 : la portée d'abord, puis le contrôle du réseau, qui passe la main à la portée tant que le réseau est là.
    await createShareScope(context, baseURL!);
    const setOffline = await controlNetwork(context, baseURL!);
    await setClock(page, MOMENTS.prochaine);
    await openToday(page);
    await waitForActiveWorker(page);
    const before = await cacheEntries(page);

    for (const path of [RP(SHARE_TOKEN_VALIDE), RPJ(SHARE_TOKEN_VALIDE, 2)]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.getByText("Programme partagé · lecture seule")).toBeVisible();
    }
    expect(await cacheEntries(page)).toEqual(before);
    expect(before.some((entry) => new URL(entry.url).pathname.startsWith("/p/"))).toBe(false);

    await setOffline(true);
    await page.goto(RP(SHARE_TOKEN_VALIDE)).catch(() => null);
    await expectFallback(page);
    await expect(page.getByText("Programme partagé · lecture seule")).toHaveCount(0);
    expect(await page.locator("body").innerText()).not.toContain(SHARE_TOKEN_VALIDE);
    expect(page.url()).not.toContain(SHARE_TOKEN_VALIDE);
    expect(await cacheEntries(page)).toEqual(before);
    await setOffline(false);
  });
});
