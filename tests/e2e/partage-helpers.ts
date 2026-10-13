import { randomUUID } from "node:crypto";

import { expect, type APIRequestContext, type BrowserContext, type Page } from "@playwright/test";

import { SHARE_TOKEN_DESACTIVE, SHARE_TOKEN_VALIDE } from "../../src/mocks/edimbourg-partage";

import { HEADER, SIM, sendScope, type Scope } from "./debloquer-helpers";

/**
 * Aides des specs de F10c (« Partager », vue partagée), en 390 × 844 sur le build de production. Chaque test crée
 * sa portée de simulation (0020 § 6), horloge du serveur remise au 2026-08-30T10:40:00+01:00 (J2 du voyage
 * débloqué) : la portée par défaut suit l'heure réelle, à laquelle le partage simulé a pris fin.
 */

export { SHARE_TOKEN_DESACTIVE, SHARE_TOKEN_VALIDE };

export const UNLOCKED_TRIP = "mock_trip_edimbourg_debloque";
export const LOCKED_TRIP = "mock_trip_edimbourg";
export const SHARE_NOW = "2026-08-30T10:40:00+01:00";
export const RP = (token: string) => `/p/${token}`;
export const RPJ = (token: string, n: number) => `/p/${token}/jour/${n}`;
export const R11 = (trip = UNLOCKED_TRIP) => `/voyages/${trip}`;
export const R12 = (n: number, trip = UNLOCKED_TRIP) => `/voyages/${trip}/jour/${n}`;
export const TOKEN_IN_URL = /\/p\/([A-Za-z0-9_-]{43})$/;

/** Commande `R-sim` dans la portée `name`, par un client HTTP (aucune page). */
export async function controlScope(request: APIRequestContext, baseURL: string, name: string, body: Record<string, unknown>) {
  const response = await request.post(`${baseURL}${SIM}`, { headers: { [HEADER]: name }, data: body });
  expect(response.status(), JSON.stringify(body)).toBe(204);
}

/** Portée explicite pour tout le contexte, remise au `now` du partage (ou à l'instant donné). */
export async function useShareScope(context: BrowserContext, baseURL: string, now = SHARE_NOW): Promise<Scope> {
  const name = `f10c-${randomUUID()}`;
  await sendScope(context, baseURL, name);
  const control = (body: Record<string, unknown>) => controlScope(context.request, baseURL, name, body);
  await control({ action: "reset", now });
  return { name, control };
}

/** Bouton « Partager » posé sur la carte. */
export const shareButton = (page: Page) => page.getByRole("button", { name: "Partager", exact: true });
/** Feuille « Partager ton voyage ». */
export const shareSheet = (page: Page) => page.getByRole("dialog", { name: "Partager ton voyage" });
/** Champ « Lien de partage » de la feuille. */
export const shareField = (page: Page) => shareSheet(page).getByRole("textbox", { name: "Lien de partage" });
/** Bouton de la feuille, par son nom exact. */
export const sheetButton = (page: Page, name: string) => shareSheet(page).getByRole("button", { name, exact: true });

/** Ouvre la feuille depuis la page courante et attend la fin de la lecture de l'état. */
export async function openShareSheet(page: Page) {
  await shareButton(page).click();
  await expect(shareSheet(page)).toBeVisible();
  await expect(shareSheet(page).getByText("Chargement du partage.")).toHaveCount(0);
}

/** Crée un lien depuis la feuille ouverte (aucun lien actif) et renvoie son jeton. */
export async function createLink(page: Page): Promise<string> {
  await sheetButton(page, "Créer un lien").click();
  await expect(shareField(page)).toBeVisible();
  const value = await shareField(page).inputValue();
  const token = TOKEN_IN_URL.exec(new URL(value).pathname)?.[1];
  expect(token, value).toBeTruthy();
  return token!;
}

/** Désactive le lien actif depuis la feuille ouverte. */
export async function revokeLink(page: Page) {
  await sheetButton(page, "Désactiver le lien").click();
  await sheetButton(page, "Désactiver").click();
  await expect(shareSheet(page).getByRole("status").filter({ hasText: "Lien désactivé." })).toBeVisible();
}

/** Statut HTTP d'une adresse de la vue partagée, demandée dans la portée `name` (client HTTP sans cookie). */
export async function statusOf(request: APIRequestContext, baseURL: string, name: string, path: string): Promise<number> {
  const response = await request.get(`${baseURL}${path}`, { headers: { [HEADER]: name }, maxRedirects: 0 });
  return response.status();
}
