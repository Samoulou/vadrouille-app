import { expect, test, type Page } from "@playwright/test";

import { edimbourgCarte } from "../../src/mocks/edimbourg-carte";

import { ED, MOMENTS, openToday, R15, setClock } from "./aujourdhui-helpers";
import { blockGoogle } from "./carte-helpers";
import {
  cacheBodies,
  controlNetwork,
  cacheEntries,
  expectFallback,
  expectNoOtherStorage,
  FALLBACK_TITLE,
  R_REPLI,
  waitForActiveWorker,
} from "./hors-ligne-helpers";
import { RP, SHARE_TOKEN_VALIDE, createShareScope } from "./partage-helpers";

/**
 * Manifeste, service worker et page de repli hors ligne (spécification F10, F10b ; critères C21 à C26). Les service
 * workers sont bloqués par défaut (F10-TL-6) : ce fichier les autorise. Domaines Google bloqués au niveau du
 * contexte (requêtes du service worker comprises), liste vérifiée vide en fin de test.
 */

test.use({ serviceWorkers: "allow", timezoneId: "Europe/London" });

const SEJOUR = `/voyages/${ED}`;
const JOURNEE = `/voyages/${ED}/jour/2`;
const FICHE = `/voyages/${ED}/jour/2?etape=j2-dean-village`;
const PRESENTATION = `/voyages/${ED}/presentation`;

let google: string[] = [];
let setOffline: (offline: boolean) => Promise<void>;
test.beforeEach(async ({ context, baseURL }) => {
  google = await blockGoogle(context);
  setOffline = await controlNetwork(context, baseURL!);
});
test.afterEach(() => {
  expect(google).toEqual([]);
});

/** Ouvre l'écran 15 en ligne à l'instant donné et attend le service worker actif. */
async function openTodayWithWorker(page: Page, iso: string = MOMENTS.prochaine) {
  await setClock(page, iso);
  await openToday(page);
  await waitForActiveWorker(page);
}

/** Coordonnées simulées (étapes et terminus) sous les formes qu'un document pourrait contenir. */
const COORDINATES = edimbourgCarte.flatMap((map) => map.points.flatMap((point) => [String(point.lat), String(point.lng)]));

test.describe("manifeste (C21)", () => {
  test("hors-ligne: manifeste lié depuis chaque page, nom, langue, affichage, adresse de départ, icônes et couleurs", async ({
    page,
    request,
  }) => {
    const response = await request.get("/manifest.webmanifest");
    expect(response.status()).toBe(200);
    const manifest = (await response.json()) as Record<string, unknown> & { icons: { src: string; sizes: string }[] };
    for (const path of ["/", SEJOUR, JOURNEE, R15, R_REPLI, "/voyages/inconnu"]) {
      await page.goto(path);
      await expect(page.locator("link[rel='manifest']"), path).toHaveAttribute("href", "/manifest.webmanifest");
      // Couleur de thème du manifeste et icône pour l'écran d'accueil d'iOS, sur chaque page.
      await expect(page.locator("meta[name='theme-color']"), path).toHaveAttribute("content", String(manifest.theme_color));
      await expect(page.locator("link[rel='apple-touch-icon']"), path).toHaveAttribute("href", "/icons/icone-192.png");
    }
    expect(manifest).toMatchObject({ name: "Vadrouille", lang: "fr", display: "standalone", start_url: "/" });
    expect(manifest.icons.map((icon) => icon.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of manifest.icons) {
      const image = await request.get(icon.src);
      expect(image.status(), icon.src).toBe(200);
      expect(image.headers()["content-type"]).toBe("image/png");
    }
    // Couleurs : celles des tokens, lues dans la page (variables CSS de Ligne).
    const page_ = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--color-page").trim());
    expect(manifest.background_color).toBe(page_);
    expect(manifest.theme_color).toBe(page_);
  });
});

test("hors-ligne: rien avant l'écran 15", async ({ page, context, baseURL }) => {
  // C22 : parcours Séjour, Journée, Fiche, présentation et vue partagée (F10c, décision 0039), sans ouvrir R15.
  // La vue partagée est lue dans une portée explicite, à une date où le lien fixe est valable.
  await createShareScope(context, baseURL!);
  for (const path of [SEJOUR, JOURNEE, FICHE, PRESENTATION, RP(SHARE_TOKEN_VALIDE), "/"]) {
    const response = await page.goto(path);
    expect(response?.status(), path).toBe(200);
  }
  const state = await page.evaluate(async () => ({
    workers: (await navigator.serviceWorker.getRegistrations()).length,
    caches: (await caches.keys()).length,
  }));
  expect(state).toEqual({ workers: 0, caches: 0 });
  await expectNoOtherStorage(page);
});

for (const [name, iso] of [
  ["pendant le voyage", MOMENTS.prochaine],
  ["avant le voyage", MOMENTS.avant],
  ["après le voyage", MOMENTS.apres],
] as const) {
  test(`hors-ligne: aucun cache Google, ${name}`, async ({ page, baseURL }) => {
    // C23 : seuls la coquille de R-repli et les scripts, styles et polices de l'application sont enregistrés.
    await openTodayWithWorker(page, iso);
    const origin = new URL(baseURL!).origin;
    const entries = await cacheEntries(page);
    expect(entries.length).toBeGreaterThan(1);
    expect(new Set(entries.map((entry) => entry.cache)).size).toBe(1);
    for (const { url } of entries) {
      const parsed = new URL(url);
      expect(parsed.origin, url).toBe(origin);
      expect(parsed.pathname === R_REPLI || parsed.pathname.startsWith("/_next/static/"), url).toBe(true);
      expect(parsed.searchParams.has("_rsc"), url).toBe(false);
    }
    const documents = entries.filter(({ url }) => !new URL(url).pathname.startsWith("/_next/static/"));
    expect(documents.map(({ url }) => new URL(url).pathname)).toEqual([R_REPLI]);
    expect(entries.some(({ url }) => /\.css(\?|$)/.test(url))).toBe(true);
    expect(entries.some(({ url }) => /\.woff2(\?|$)/.test(url))).toBe(true);

    for (const { url, type, body } of await cacheBodies(page)) {
      if (/javascript|css|font/.test(type)) continue;
      expect(new URL(url).pathname, `${url} (${type})`).toBe(R_REPLI);
      for (const forbidden of [
        "mock_",
        "mock_place_",
        "[Dean Village]",
        "Édimbourg",
        "maps.googleapis.com",
        "maps.gstatic.com",
        "places.googleapis.com",
        ...COORDINATES,
      ]) {
        expect(body.includes(forbidden), `${url} contient ${forbidden}`).toBe(false);
      }
    }
    await expectNoOtherStorage(page);
  });
}

test("hors-ligne: page de repli", async ({ page, context }) => {
  // C24, après C23.
  await openTodayWithWorker(page);
  await setOffline(true);

  await page.reload();
  await expectFallback(page);
  for (const path of [JOURNEE, "/", SEJOUR]) {
    await page.goto(path);
    await expectFallback(page);
  }

  // Navigation directe vers /hors-ligne : une seule réponse, sans redirection (aucune boucle).
  const responses: string[] = [];
  page.on("response", (response) => {
    if (response.request().isNavigationRequest()) responses.push(`${response.status()} ${new URL(response.url()).pathname}`);
  });
  const direct = await page.goto(R_REPLI);
  expect(direct?.status()).toBe(200);
  expect(direct?.request().redirectedFrom()).toBeNull();
  expect(responses).toEqual([`200 ${R_REPLI}`]);
  await expectFallback(page);

  // Depuis le Séjour chargé en ligne, réseau coupé : un lien interne (navigation du routeur) mène à R-repli ;
  // réseau rétabli, annonce « Connexion rétablie. », puis « Réessayer » ramène au Séjour.
  await setOffline(false);
  await page.goto(SEJOUR);
  await expect(page.locator(`a[href='${JOURNEE}']`).first()).toBeVisible();
  await setOffline(true);
  await page.locator(`a[href='${JOURNEE}']`).first().click();
  await expectFallback(page);
  await expect(page.locator("[data-part='annonce']")).toHaveText("");
  await setOffline(false);
  await expect(page.locator("[data-part='annonce']")).toHaveText("Connexion rétablie.");
  await expect(page.getByRole("heading", { level: 1, name: "Connexion rétablie" })).toBeVisible();
  await page.getByRole("button", { name: "Réessayer" }).click();
  await expect(page).toHaveURL(SEJOUR);

  // Onglet neuf ouvert directement sur /hors-ligne (historique d'une seule entrée) : « Réessayer » ouvre l'accueil.
  // `context.newPage()` laisse une entrée about:blank avant l'adresse : l'onglet est ouvert par `window.open`.
  const [fresh] = await Promise.all([
    context.waitForEvent("page"),
    page.evaluate((path) => window.open(path, "_blank", "noopener"), R_REPLI),
  ]);
  await expect(fresh.getByRole("heading", { level: 1, name: FALLBACK_TITLE })).toBeVisible();
  expect(await fresh.evaluate(() => window.history.length)).toBe(1);
  await fresh.getByRole("button", { name: "Réessayer" }).click();
  await expect(fresh).toHaveURL("/");
  await fresh.close();

  // En ligne, une réponse du serveur s'affiche telle quelle, même une 404.
  const missing = await page.goto("/voyages/inconnu/aujourdhui");
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Tu es hors ligne" })).toHaveCount(0);
});

test("hors-ligne: sans écran 15 ouvert, aucune page de repli", async ({ page }) => {
  await page.goto(SEJOUR);
  await setOffline(true);
  await expect(page.goto(R15)).rejects.toThrow(/ERR_INTERNET_DISCONNECTED/);
  await setOffline(false);
});

test("hors-ligne: navigations interceptées sans stockage", async ({ page, context }) => {
  // C25.
  const workerRequests: string[] = [];
  const pageRequests = new Set<string>();
  context.on("request", (request) => {
    if (request.serviceWorker()) workerRequests.push(request.url());
    else pageRequests.add(request.url());
  });

  await openTodayWithWorker(page);
  const before = await cacheEntries(page);
  workerRequests.length = 0;

  for (const path of ["/", SEJOUR, JOURNEE]) {
    expect((await page.goto(path))?.status(), path).toBe(200);
  }
  expect((await page.goto("/voyages/inconnu/aujourdhui"))?.status()).toBe(404);
  expect(await cacheEntries(page)).toEqual(before);
  await expectNoOtherStorage(page);

  await setOffline(true);
  for (const path of ["/", JOURNEE]) {
    await page.goto(path);
    await expectFallback(page);
  }
  expect(await cacheEntries(page)).toEqual(before);
  await expectNoOtherStorage(page);
  await setOffline(false);

  // Le service worker ne demande au réseau que ce que la page a demandé.
  for (const url of workerRequests) expect(pageRequests.has(url), url).toBe(true);
});

test("hors-ligne: le service worker ne fait passer aucune requête Google, en-têtes de /sw.js", async ({ context, page, request }) => {
  // C26 et F10-TL-6 : le service worker lui-même demande une ressource Google ; la requête passe par le blocage du
  // contexte, qui l'interrompt, elle est relevée dans `google`, et rien n'est enregistré dans le cache.
  const fromWorker: string[] = [];
  context.on("request", (req) => {
    if (req.serviceWorker()) fromWorker.push(req.url());
  });
  await openTodayWithWorker(page);
  const before = await cacheEntries(page);
  const worker = context.serviceWorkers().find((candidate) => new URL(candidate.url()).pathname === "/sw.js");
  expect(worker, "service worker /sw.js").toBeDefined();
  const googleURL = "https://maps.googleapis.com/maps/api/js?callback=x";
  const outcome = await worker!.evaluate(async (url) => {
    try {
      await fetch(url, { mode: "no-cors" });
      return "réponse";
    } catch {
      return "interrompue";
    }
  }, googleURL);
  expect(outcome).toBe("interrompue");
  expect(google).toEqual([googleURL]);
  expect(fromWorker).toContain(googleURL);
  google = [];
  expect(await cacheEntries(page)).toEqual(before);

  for (const path of ["/sw.js", "/sw-route.js"]) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["cache-control"], path).toBe("no-cache");
  }
});
