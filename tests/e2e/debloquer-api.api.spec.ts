import { randomBytes } from "node:crypto";

import { expect, test as base, type APIRequestContext, type Page } from "@playwright/test";

import { ADRESSE_DEBLOQUER, ADRESSE_DEBLOQUER_REFUS } from "../support/bout-en-bout-api";

import { codeCells, connexionRoute, emailField, firstCell, pasteCode } from "./connexion-helpers";
import { expectPath, main, payCard, payTwint, simulate } from "./debloquer-helpers";
import { DATES, R17, setClock } from "./mes-voyages-helpers";
import { sheet } from "./sejour-helpers";

/**
 * Déblocage simulé sur la base (spécification B4, B4b point 4 ; critères B1, B2, B5 et B8, partie pages ; B4-PO-14).
 * Projet `api` : serveur à connexion réelle (`AUTH_ADAPTER=better-auth`), données réelles (`DATA_ADAPTER=api`) et
 * paiement simulé en base (`PAYMENT_ADAPTER=simulated`, webhook simulé ouvert par `playwright.config.ts`), sur la base du
 * job `db`. Les boutons de `R9-sim` demandent au prestataire simulé d'émettre un événement signé, livré au webhook simulé
 * du même serveur, seul à accorder le droit (B4-PO-2) ; aucun appel hors du serveur de test.
 *
 * Chaque scénario a sa propre organisation (`tests/support/bout-en-bout-api.ts`, données écrites par `pnpm test:db`) :
 * le seul voyage non débloqué de ses quatre voyages (pendant d'Édimbourg, lien `…/presentation` de « Mes voyages ») est
 * débloqué une fois, sans toucher aux organisations des scénarios de lecture. Sur un poste, rejouer demande une base
 * neuve (le droit reste en base). Les lignes `checkouts`, `billing` et `entitlements` sont vérifiées en base par
 * `tests/db/paiement.test.ts` ; ici, leurs effets à l'écran. Aucune trace (cookies).
 */
const test = base.extend<{ urlMock: string }>({
  urlMock: ["", { option: true }],
  // Adresse IP de confiance unique à chaque essai (limiteurs de l'envoi du code et des actions du paiement).
  extraHTTPHeaders: async ({}, fournir) => {
    const prefixe = randomBytes(4).toString("hex");
    await fournir({ "x-vercel-forwarded-for": `2001:db8:${prefixe.slice(0, 4)}:${prefixe.slice(4)}::9` });
  },
});

test.describe.configure({ mode: "serial" });

const API_MAILPIT = "http://127.0.0.1:8025/api/v1";
const UUID = "[0-9a-f-]{36}";
const ID_PAIEMENT = "[A-Za-z0-9_-]{22}";

async function identifiantsMailpit(request: APIRequestContext, adresse: string): Promise<string[]> {
  const reponse = await request.get(`${API_MAILPIT}/search`, { params: { query: `to:${adresse}`, limit: "50" } });
  expect(reponse.ok()).toBe(true);
  return (((await reponse.json()) as { messages?: { ID: string }[] }).messages ?? []).map((m) => m.ID);
}

/** Connexion par le code lu dans Mailpit (B3b-envoi) : seul message reçu après la demande. */
async function connecter(page: Page, request: APIRequestContext, adresse: string) {
  const avant = new Set(await identifiantsMailpit(request, adresse));
  await page.context().clearCookies();
  await page.goto(connexionRoute(R17));
  await emailField(page).fill(adresse);
  await page.getByRole("button", { name: "Recevoir un code", exact: true }).click();
  await expect(firstCell(page)).toBeFocused();
  let nouveau: string | undefined;
  await expect
    .poll(async () => {
      nouveau = (await identifiantsMailpit(request, adresse)).find((id) => !avant.has(id));
      return nouveau !== undefined;
    })
    .toBe(true);
  const detail = await request.get(`${API_MAILPIT}/message/${nouveau}`);
  const code = /[0-9]{6}/.exec(((await detail.json()) as { Text?: string }).Text ?? "")?.[0];
  expect(code).toBeDefined();
  await expect(codeCells(page)).toHaveCount(6);
  await pasteCode(page, code ?? "");
  await expect(page).toHaveURL((url) => url.pathname === R17);
}

/** Identifiant du seul voyage non débloqué de l'organisation (lien `/voyages/<uuid>/presentation` de l'écran 17). */
async function voyageADebloquer(page: Page): Promise<string> {
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  const ids = [...new Set(liens.flatMap((href) => new RegExp(`^/voyages/(${UUID})/presentation$`).exec(href)?.[1] ?? []))];
  expect(ids, "données de bout en bout absentes, ou voyage déjà débloqué : pnpm test:db les écrit sur une base neuve").toHaveLength(1);
  return ids[0] as string;
}

/** Adresses du parcours « Débloquer » du voyage `id` (mêmes formes que `unlockRoutes`, 0020 § 5). */
function adresses(id: string) {
  const r9 = `/voyages/${id}/debloquer`;
  return {
    r9,
    r11: `/voyages/${id}`,
    sim: new RegExp(`^${r9}/paiement-simule/${ID_PAIEMENT}$`),
    echec: new RegExp(`^${r9}\\?paiement=${ID_PAIEMENT}$`),
  };
}

const enTete = (page: Page, name: string) => page.getByRole("heading", { level: 1, name });

/** Depuis l'écran 9, commence un paiement et attend la page de paiement simulé ; rend l'identifiant public. */
async function commencer(page: Page, sim: RegExp, moyen: "twint" | "card"): Promise<string> {
  await (moyen === "twint" ? payTwint(page) : payCard(page)).click();
  await expectPath(page, sim);
  await expect(enTete(page, "Paiement simulé")).toBeVisible();
  return new URL(page.url()).pathname.split("/").pop() ?? "";
}

test("debloquer: paiement simulé de bout en bout sur la base", async ({ page, request, browser }) => {
  test.setTimeout(180_000);
  await connecter(page, request, ADRESSE_DEBLOQUER);
  await setClock(page, DATES.avant);
  const id = await voyageADebloquer(page);
  const { r9, r11, sim } = adresses(id);

  // Sans session : les trois pages redirigent vers l'écran 4, suite « Débloquer » (B3c ; B8, partie pages).
  const anonyme = await browser.newContext();
  const visiteur = await anonyme.newPage();
  for (const chemin of [r9, `${r9}/paiement-simule/${"A".repeat(22)}`, `${r9}/confirmation?paiement=${"A".repeat(22)}`]) {
    await visiteur.goto(chemin);
    await expect.poll(() => `${new URL(visiteur.url()).pathname}${new URL(visiteur.url()).search}`).toBe(connexionRoute(r9));
  }
  await anonyme.close();

  // Avant le paiement (B5 sur la base) : écran 9, puis « Continuer sans débloquer » vers le Séjour, et retour.
  await page.goto(r9);
  await expect(enTete(page, "Débloquer ton voyage")).toBeVisible();
  await expect(main(page)).toContainText(/29\s?CHF/);
  await page.getByRole("link", { name: "Continuer sans débloquer" }).click();
  await expectPath(page, r11);
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expectPath(page, r9);
  await expect(enTete(page, "Débloquer ton voyage")).toBeVisible();

  // « Payer avec TWINT » : paiement écrit en base, page de paiement simulé (`R9-sim`).
  const paiement = await commencer(page, sim, "twint");
  await expect(main(page)).toContainText("Démonstration : aucun paiement n'est effectué et aucune donnée de paiement n'est demandée.");
  await expect(main(page)).toContainText(/Montant : 29\s?CHF/);
  await expect(main(page)).toContainText("Moyen : TWINT");

  // Ni la page de retour ni un nouvel affichage n'accordent de droit (B8) : la confirmation attend, le voyage reste à débloquer.
  await page.goto(`${r9}/confirmation?paiement=${paiement}`);
  await expect(enTete(page, "On confirme ton paiement")).toBeVisible();
  await page.goto(r9);
  await expect(enTete(page, "Débloquer ton voyage")).toBeVisible();
  await expect(payTwint(page)).toBeEnabled();

  // « Simuler un paiement réussi » : événement signé, webhook simulé, droit ; `R9-retour` mène au Séjour (`R11`).
  await page.goto(`${r9}/paiement-simule/${paiement}`);
  await expect(enTete(page, "Paiement simulé")).toBeVisible();
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, r11);
  await expect(enTete(page, "Édimbourg")).toBeVisible();
  await expect(sheet(page).locator("[data-part='debloquer']")).toHaveCount(0);

  // Retour du navigateur, puis chargement direct : état « déjà débloqué », aucun bouton de paiement (second « Payer »
  // impossible, `already_unlocked`), aucun prix.
  await page.goBack();
  await expectPath(page, r9);
  await expect(enTete(page, "Ton voyage est débloqué")).toBeVisible();
  await page.reload();
  await expect(enTete(page, "Ton voyage est débloqué")).toBeVisible();
  await expect(main(page).getByRole("link", { name: "Voir le programme" })).toHaveAttribute("href", r11);
  await expect(main(page).getByRole("button")).toHaveCount(0);
  await expect(main(page)).not.toContainText("CHF");

  // Rejouer la page de paiement simulé d'un paiement conclu : la confirmation, puis le Séjour, sans second paiement.
  await page.goto(`${r9}/paiement-simule/${paiement}`);
  await expectPath(page, r11);
  await expect(enTete(page, "Édimbourg")).toBeVisible();
});

test("debloquer: paiement refusé puis réussi sur la base", async ({ page, request }) => {
  test.setTimeout(180_000);
  await connecter(page, request, ADRESSE_DEBLOQUER_REFUS);
  await setClock(page, DATES.avant);
  const id = await voyageADebloquer(page);
  const { r9, r11, sim, echec } = adresses(id);

  await page.goto(r9);
  await expect(enTete(page, "Débloquer ton voyage")).toBeVisible();
  await commencer(page, sim, "card");
  await expect(main(page)).toContainText("Moyen : carte");
  await simulate(page, "Simuler un refus");
  await expectPath(page, echec);
  await expect(main(page).getByRole("alert")).toHaveText("Le paiement n'a pas abouti. Aucun montant n'a été débité.");
  await expect(payTwint(page)).toBeEnabled();
  await expect(payCard(page)).toBeEnabled();

  // Recharger la page d'échec : le bandeau reste (paiement lu en base, statut `declined`).
  await page.reload();
  await expect(main(page).getByRole("alert")).toHaveText("Le paiement n'a pas abouti. Aucun montant n'a été débité.");

  // Un second paiement réussit : un seul droit, le voyage est débloqué.
  await commencer(page, sim, "twint");
  await simulate(page, "Simuler un paiement réussi");
  await expectPath(page, r11);
  await expect(enTete(page, "Édimbourg")).toBeVisible();
  await page.goto(r9);
  await expect(enTete(page, "Ton voyage est débloqué")).toBeVisible();
  await expect(payTwint(page)).toHaveCount(0);

  // « Mes voyages » : plus aucun voyage à débloquer dans l'organisation.
  await page.goto(R17);
  await expect(page.getByRole("heading", { level: 1, name: "Mes voyages" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveCount(0);
  const liens = await page.getByRole("main").getByRole("link").evaluateAll((e) => e.map((l) => l.getAttribute("href") ?? ""));
  expect(liens.filter((href) => href.endsWith("/presentation"))).toEqual([]);
});
