import { gzipSync } from "node:zlib";

import type { Page, Response } from "@playwright/test";

/**
 * Mesure du JavaScript initial (décision 0016 § 3.1 règle 5), seule implémentation : le test de T4 l'appelle,
 * le test paramétré de F12a la réutilise (décision 0022 § 4).
 */

/** Budget du handover front § 14 : strictement sous 200 000 octets, carte comprise (0016 § 3.1 règle 5). */
export const INITIAL_JS_BUDGET_BYTES = 200_000;

export interface MeasuredScript {
  /** Chemin du script sur l'origine de l'application. */
  path: string;
  /** Corps tel que servi, sans compression de transport. */
  rawBytes: number;
  /** Corps compressé par `zlib.gzipSync`, niveau par défaut. */
  gzipBytes: number;
}

export interface InitialJavaScript {
  path: string;
  scripts: MeasuredScript[];
  /** Somme des `gzipBytes` : c'est elle que le budget compare. */
  totalGzipBytes: number;
}

/**
 * Ouvre `path`, attend `load` puis l'inactivité du réseau, et compresse chaque script de l'origine de
 * l'application chargé jusque-là. La compression est refaite ici pour ne pas dépendre de celle du serveur.
 * Les domaines Google se bloquent avant l'appel (`blockGoogle`), comme dans les autres specs.
 */
export async function measureInitialJavaScript(page: Page, path: string): Promise<InitialJavaScript> {
  const responses: Response[] = [];
  const collect = (response: Response) => responses.push(response);
  page.on("response", collect);

  const target = await page.goto(path, { waitUntil: "load" });
  if (!target?.ok()) {
    throw new Error(`${path} : réponse ${target?.status() ?? "absente"}`);
  }
  await page.waitForLoadState("networkidle");
  page.off("response", collect);

  const origin = new URL(target.url()).origin;
  const seen = new Set<string>();
  const scripts: MeasuredScript[] = [];
  for (const response of responses) {
    const url = new URL(response.url());
    if (response.request().resourceType() !== "script" || url.origin !== origin || seen.has(url.href)) {
      continue;
    }
    seen.add(url.href);
    const body = await response.body();
    scripts.push({ path: url.pathname + url.search, rawBytes: body.byteLength, gzipBytes: gzipSync(body).byteLength });
  }

  scripts.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return { path, scripts, totalGzipBytes: scripts.reduce((sum, script) => sum + script.gzipBytes, 0) };
}

/** Journal lisible de la mesure, pour la sortie du test et la description des PR. */
export function formatInitialJavaScript(measure: InitialJavaScript): string {
  const lines = measure.scripts.map((s) => `  ${String(s.gzipBytes).padStart(7)} o gzip  ${String(s.rawBytes).padStart(8)} o  ${s.path}`);
  return [`JavaScript initial de ${measure.path} : ${measure.totalGzipBytes} o gzip (${measure.scripts.length} scripts)`, ...lines].join("\n");
}
