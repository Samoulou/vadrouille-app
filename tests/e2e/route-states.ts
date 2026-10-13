import { expect, type Page } from "@playwright/test";

import { R1, R2, continueButton, fillTrip, upcomingTrip } from "./creation-helpers";
import { expectPath, openOffer, pathOf, R9_RETOUR, simulate, startPayment, useScope as createScope } from "./debloquer-helpers";
import { card, press, toast } from "./presentation-helpers";
import type { RouteJourneyName, RoutePreparationName, RouteStateName } from "./routes";
import { askProposal } from "./revision-helpers";
import { ficheTitle, listStops } from "./sejour-helpers";

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
} satisfies Record<RouteJourneyName, RouteJourney>;
