import { expect, type Page } from "@playwright/test";

import { expectPath } from "./debloquer-helpers";

/**
 * Aides des specs de F8a (écrans 1 et 2 de la création), en 390 × 844 sur le build de production. Le brouillon
 * vit en mémoire de l'onglet : un test passe toujours par l'écran 1 avant l'écran 2 (jamais `goto(R2)` avec un
 * brouillon). L'horloge du navigateur s'installe au 2026-08-01T08:00 (jamais en temps fixe, spécification F8).
 */

export const R1 = "/voyages/nouveau";
export const R2 = "/voyages/nouveau/brief";
/** Écran 3 « Où loger » (F8b, décision 0017 § 1). */
export const R3 = "/voyages/nouveau/logement";
/** Écran 3 sur le brouillon de démonstration, carte simulée (pages de développement). */
export const R3_DEV = "/dev/voyages/nouveau/logement";
/** Adresse du lancement (`R-lancer`, F8c) : seule l'adresse atteinte est vérifiée en F8b (0017 § 1). */
export const R_LANCER = "/voyages/nouveau/lancer";
export const R4_LANCER = "/connexion?suite=%2Fvoyages%2Fnouveau%2Flancer";
export const NOW = "2026-08-01T08:00:00+02:00";

/** Récit du jeu simulé (voyage d'Édimbourg du cadrage § 2) ; l'adaptateur simulé renvoie toujours le même brief. */
export const STORY =
  "On part à deux, sans enfants. On aime la nature, les dégustations de whisky et les bons restaurants, à un rythme tranquille mais pas trop.";

export async function installClock(page: Page) {
  await page.clock.install({ time: NOW });
}

export interface TripInput {
  destination: string;
  start: string;
  end: string;
  /** Réponse à « As-tu déjà un logement ? ». */
  lodging: "Oui" | "Un quartier" | "Pas encore";
}

export const EDIMBOURG: TripInput = { destination: "Édimbourg", start: "2026-08-29", end: "2026-09-03", lodging: "Pas encore" };

export const field = (page: Page, name: string | RegExp) => page.getByLabel(name, { exact: typeof name === "string" });
export const continueButton = (page: Page) => page.getByRole("button", { name: "Continuer", exact: true });
export const lodgingGroup = (page: Page) => page.getByRole("radiogroup", { name: "As-tu déjà un logement ?" }).first();

/** Remplit la destination, les dates et le logement de l'écran 1 (sans valider). */
export async function fillTrip(page: Page, trip: TripInput = EDIMBOURG) {
  await field(page, "Destination").fill(trip.destination);
  await field(page, "Arrivée").fill(trip.start);
  await field(page, "Départ").fill(trip.end);
  await lodgingGroup(page).getByRole("radio", { name: trip.lodging }).click();
}

/** Écran 1 rempli et validé : l'écran 2 s'affiche à l'état « Récit ». */
export async function reachBrief(page: Page, trip: TripInput = EDIMBOURG) {
  await page.goto(R1);
  await fillTrip(page, trip);
  await continueButton(page).click();
  await expectPath(page, R2);
  await expect(page.getByRole("heading", { level: 1, name: "Raconte ton voyage en quelques phrases" })).toBeVisible();
}

export const storyField = (page: Page) => page.getByRole("textbox", { name: "Raconte ton voyage en quelques phrases" });

/** Récit simulé, « Préparer mon brief », vérification affichée. */
export async function reachReview(page: Page) {
  await storyField(page).fill(STORY);
  await page.getByRole("button", { name: "Préparer mon brief" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Vérifie ton brief" })).toBeFocused();
}

/** Dates du voyage à partir d'aujourd'hui (mesures sans horloge installée) : arrivée dans 30 jours, 5 nuits. */
export function upcomingTrip(now: Date = new Date()): TripInput {
  const day = (offset: number) => new Date(now.getTime() + offset * 86_400_000).toISOString().slice(0, 10);
  return { ...EDIMBOURG, start: day(30), end: day(35) };
}

/** Écrans 1 et 2 validés avec le brief simulé (« Continuer » de la vérification). */
export async function reachAfterBrief(page: Page, trip: TripInput = EDIMBOURG) {
  await reachBrief(page, trip);
  await reachReview(page);
  await continueButton(page).click();
}
