import { expect, type Page } from "@playwright/test";

import { R1, R2, R3, R4_LANCER, R_LANCER, continueButton, fillTrip, reachReview, upcomingTrip } from "./creation-helpers";
import { MOCK_CODE, emailField, pasteCode, requestCodeFor, uniqueEmail } from "./connexion-helpers";
import { expectPath, openOffer, pathOf, R9_RETOUR, simulate, startPayment, useScope as createScope } from "./debloquer-helpers";
import { R5 } from "./preparation-helpers";
import { card, press, toast } from "./presentation-helpers";
import { RP, RPJ, SHARE_TOKEN_VALIDE, createShareScope } from "./partage-helpers";
import type { RouteJourneyName, RoutePreparationName, RouteStateName } from "./routes";
import { askProposal, moveDays, openMoveSheet } from "./revision-helpers";
import { dayList, ficheTitle, listStops } from "./sejour-helpers";

/**
 * Actions des états et des préparations de l'inventaire (`routes.ts`, décision 0022 § 3). Elles réutilisent les
 * aides des `*-helpers.ts` existants. Un nom d'état ou de préparation sans action ne compile pas (`satisfies`).
 */

/** Amène la page, déjà ouverte sur l'adresse de l'entrée, dans l'état nommé. */
export type RouteStateAction = (page: Page) => Promise<void>;

export const ROUTE_STATES = {
  /** Écran 13 : fiche de la première étape de la ligne du jour, ouverte depuis la liste. */
  "fiche-ouverte": async (page) => {
    await listStops(page).first().click();
    await expect(ficheTitle(page)).toBeVisible();
  },
  /** Présentation : une proposition écartée, le toast « Annuler » affiché (5 secondes). */
  "annulation-proposee": async (page) => {
    await expect(card(page)).toBeVisible();
    await press(page, "Pas pour moi");
    await expect(toast(page)).toBeVisible();
  },
  /** Écran 14 : raison « Pas mon style », proposition affichée avec son aperçu des effets (F7a, C29). */
  "proposition-affichee": async (page) => {
    await askProposal(page, "Pas mon style");
  },
  /**
   * Journée : fiche de « [Jardin botanique royal] », feuille « Déplacer » ouverte, J4 cochée avec ses points
   * d'insertion (F7b, C29).
   */
  "deplacer-ouverte": async (page) => {
    await dayList(page).getByRole("link", { name: /\[Jardin botanique royal\]/ }).click();
    await expect(ficheTitle(page)).toBeVisible();
    await openMoveSheet(page);
    await moveDays(page).getByRole("radio", { name: "Jour 4", exact: true }).click();
  },
  /**
   * Écran 4 : adresse unique (la portée par défaut compte les demandes par adresse), « Recevoir un code », étape
   * code affichée, focus sur la première case (F8b).
   */
  "etape-code": async (page) => {
    await emailField(page).fill(uniqueEmail());
    await page.getByRole("button", { name: "Recevoir un code" }).click();
    await expect(page.getByRole("textbox", { name: "Chiffre 1 sur 6" })).toBeFocused();
  },
} satisfies Record<RouteStateName, RouteStateAction>;

export interface PreparedRoute {
  /** Adresse réelle (chemin et requête) à mesurer. */
  path: string;
  /** Portée de simulation qui porte l'état ; à envoyer dans l'en-tête `HEADER` de chaque requête de la mesure. */
  scope: string;
}

/**
 * Crée l'état côté serveur dans une portée explicite, propre à cet appel (aucun effet sur la portée par défaut ni
 * sur les autres tests), et renvoie l'adresse. Le contexte de `page` garde l'en-tête de la portée ensuite.
 */
export type RoutePreparation = (page: Page, baseURL: string) => Promise<PreparedRoute>;

/**
 * Délai de confirmation simulé de `confirmation-en-attente` : le plus long accepté par `R-sim` (10 minutes) ;
 * l'horloge de la portée n'avance que par `R-sim`, la confirmation reste donc en attente pendant la mesure.
 */
const CONFIRMATION_DELAY_MS = 600_000;

export const ROUTE_PREPARATIONS = {
  /** `R9-sim` : paiement par carte commencé depuis l'écran 9, en attente. */
  "paiement-en-attente": async (page, baseURL) => {
    const scope = await createScope(page.context(), baseURL);
    await openOffer(page);
    await startPayment(page, "card");
    return { path: pathOf(page), scope: scope.name };
  },
  /**
   * `R9-retour` : paiement simulé réussi, confirmation en attente (l'écran affiché ; une fois confirmée, la page
   * remplace aussitôt l'adresse par le Séjour).
   */
  "confirmation-en-attente": async (page, baseURL) => {
    const scope = await createScope(page.context(), baseURL);
    await scope.control({ action: "configurePayment", confirmationDelayMs: CONFIRMATION_DELAY_MS });
    await openOffer(page);
    await startPayment(page, "card");
    await simulate(page, "Simuler un paiement réussi");
    await expectPath(page, R9_RETOUR);
    return { path: pathOf(page), scope: scope.name };
  },
  /** `RP` : Séjour partagé du jeton fixe valide, portée au 2026-08-30 (partage en cours). */
  "partage-sejour": async (page, baseURL) => {
    const scope = await createShareScope(page.context(), baseURL);
    return { path: RP(SHARE_TOKEN_VALIDE), scope: scope.name };
  },
  /** `RPJ` jour 2 : même portée. */
  "partage-jour": async (page, baseURL) => {
    const scope = await createShareScope(page.context(), baseURL);
    return { path: RPJ(SHARE_TOKEN_VALIDE, 2), scope: scope.name };
  },
  /**
   * `R-lancer` (F8c) : création complète, connexion et lancement dans une portée explicite ; l'horloge de la portée
   * n'avance que par `R-sim`, la génération reste donc en cours (un aperçu actif). La mesure part ensuite d'un
   * nouveau brouillon (parcours `brouillon-lancement`).
   */
  "lancement-actif": async (page, baseURL) => {
    const scope = await createScope(page.context(), baseURL);
    await page.goto(R1);
    await draftFromR1(page);
    await page.getByRole("button", { name: "Partir du quartier, choisir plus tard", exact: true }).click();
    await expectPath(page, R4_LANCER);
    await requestCodeFor(page, uniqueEmail());
    await pasteCode(page, MOCK_CODE);
    await expectPath(page, R5);
    return { path: R_LANCER, scope: scope.name };
  },
} satisfies Record<RoutePreparationName, RoutePreparation>;

export interface RouteJourney {
  /** Adresse ouverte par `page.goto` avant le parcours. */
  start: string;
  /** Amène la page, ouverte sur `start`, à l'adresse de l'entrée par navigation côté client. */
  run: (page: Page) => Promise<void>;
}

export const ROUTE_JOURNEYS = {
  /** `R2` : écran 1 rempli (dates à venir, sans horloge installée) et validé ; l'écran 2 s'affiche à l'état « Récit ». */
  "brouillon-ecran-1": {
    start: R1,
    run: async (page) => {
      await fillTrip(page, upcomingTrip());
      await continueButton(page).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(R2);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    },
  },
  /** `R3` : écran 1 « Pas encore », écran 2 validé avec le brief simulé ; l'écran 3 s'affiche (F8b). */
  "brouillon-logement": {
    start: R1,
    run: draftFromR1,
  },
  /**
   * `R-lancer` (F8c), dans la portée de `lancement-actif` : brouillon jusqu'à l'écran 3, « Partir du quartier,
   * choisir plus tard » ; la session saute l'écran 4 et `createTrip` répond `active_preview_exists` : le bandeau
   * « conflict » s'affiche et l'adresse reste celle de `R-lancer`.
   */
  "brouillon-lancement": {
    start: R1,
    run: async (page) => {
      await draftFromR1(page);
      await page.getByRole("button", { name: "Partir du quartier, choisir plus tard", exact: true }).click();
      await expect.poll(() => new URL(page.url()).pathname).toBe(R_LANCER);
      await expect(page.getByRole("alert").filter({ hasText: "Tu as déjà des propositions en préparation." })).toBeVisible();
    },
  },
} satisfies Record<RouteJourneyName, RouteJourney>;

/** Écran 1 « Pas encore » (dates à venir), écran 2 validé avec le brief simulé ; l'écran 3 s'affiche. */
async function draftFromR1(page: Page) {
  await fillTrip(page, upcomingTrip());
  await continueButton(page).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(R2);
  await reachReview(page);
  await continueButton(page).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(R3);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
}
