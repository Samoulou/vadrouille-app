import { join } from "node:path";

import type { Page } from "@playwright/test";

import { PROTOTYPE_PORT_OFFSET, e2ePort } from "../../scripts/e2e-port.mjs";

/**
 * Second serveur de test, en mode prototype (spécification P0, P0b1 ; décision 0032 § A6.3) : même build, port
 * décalé (`playwright.config.ts`), programme de test fabriqué à la main, relecteur simulé.
 */
export const PROTOTYPE_URL = `http://127.0.0.1:${e2ePort({ env: process.env, repoPath: join(__dirname, "..", "..") }) + PROTOTYPE_PORT_OFFSET}`;
export const PROTOTYPE_TRIP = "proto_test_20261012_1";
export const ATTRIBUTION = "Données de lieux : Google";

export const prototypeSection = (page: Page) => page.getByRole("region", { name: "Prototype" });

/** Compteur du relecteur simulé (`GET /dev/api/prototype/relectures`, décision 0032 § A6.6). */
export async function relectures(page: Page): Promise<number> {
  const response = await page.request.get(`${PROTOTYPE_URL}/dev/api/prototype/relectures`);
  if (!response.ok()) throw new Error(`compteur du relecteur simulé : ${response.status()}`);
  const body = (await response.json()) as { relectures: number };
  return body.relectures;
}
