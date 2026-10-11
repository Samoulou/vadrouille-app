import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";

import { chromium, type Browser } from "@playwright/test";

import { GOOGLE_LIGHTHOUSE_PATTERNS } from "../e2e/carte-helpers";
import { HEADER } from "../e2e/debloquer-helpers";

/**
 * Mesure Lighthouse (décision 0022 § 1, F12-TL-1) : paquet `lighthouse` en Node, sur le Chromium de Playwright
 * (aucun second navigateur), profil mobile et ralentissement par défaut. Seuls réglages changés : catégories,
 * domaines Google bloqués (même liste que `blockGoogle`), rapport d'erreurs désactivé ; plus, pour une entrée
 * préparée, l'en-tête de sa portée de simulation, et pour la page introuvable, l'acceptation de son 404.
 * Changer le profil, le ralentissement, l'émulation ou un seuil demande un amendement de 0022.
 */

/** Passages par route à seuil ; médiane retenue. Constante unique (0022 § 1 : 5 au plus, jamais par route). */
export const THRESHOLD_RUNS = 3;
/** Seuil de performance de R11 et R12 (handover § 14, F12-PO-2), sur 100. */
export const PERFORMANCE_THRESHOLD = 90;
/** Accessibilité exigée sur toutes les routes de l'inventaire (F12-PO-2), sur 100, à chaque passage. */
export const ACCESSIBILITY_REQUIRED = 100;

export const REPORT_DIR = join(process.cwd(), "lighthouse-report");
const SUMMARY = join(REPORT_DIR, "summary.json");

const CATEGORIES = ["performance", "accessibility", "best-practices", "seo"] as const;
type Category = (typeof CATEGORIES)[number];

export type Scores = Record<Category, number | null>;

export interface LighthouseRun {
  id: string;
  path: string;
  run: number;
  scores: Scores;
  /** Requêtes vers un autre hôte que l'application (attendu : aucune, Google bloqué compris). */
  foreignRequests: string[];
  /** Erreur d'exécution de Lighthouse (page non chargée, etc.), sinon `null`. */
  runtimeError: string | null;
}

/** Vide `lighthouse-report/` au début de la mesure (pas dans `test-results/`, que Playwright vide). */
export function resetReports() {
  rmSync(REPORT_DIR, { recursive: true, force: true });
  mkdirSync(REPORT_DIR, { recursive: true });
  writeFileSync(SUMMARY, "[]\n");
}

function appendSummary(run: LighthouseRun) {
  const runs = JSON.parse(readFileSync(SUMMARY, "utf8")) as LighthouseRun[];
  runs.push(run);
  writeFileSync(SUMMARY, `${JSON.stringify(runs, null, 2)}\n`);
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close(() => (typeof address === "object" && address ? resolve(address.port) : reject(new Error("port"))));
    });
  });
}

/** Chromium de Playwright, mode sans fenêtre récent (canal `chromium`, pas le `chromium_headless_shell`). */
export async function launchForLighthouse(): Promise<{ browser: Browser; port: number }> {
  const port = await freePort();
  const browser = await chromium.launch({ channel: "chromium", args: [`--remote-debugging-port=${port}`] });
  return { browser, port };
}

export interface LighthouseTarget {
  id: string;
  /** Adresse absolue de la page. */
  url: string;
  /** Statut attendu du document (404 : page introuvable). */
  status: number;
  /** Portée de simulation d'une entrée préparée. */
  scope?: string;
}

/**
 * Rapport d'erreurs (`@sentry/node`, dépendance de `lighthouse`) désactivé explicitement : il l'est déjà par
 * défaut dans l'API Node, la valeur est écrite pour qu'un changement de défaut ne fasse rien partir (0022 § 1).
 * Le champ appartient aux options de la ligne de commande (`CliFlags`), d'où l'objet à part.
 */
const NO_ERROR_REPORTING = { enableErrorReporting: false } as const;

/** Un passage Lighthouse ; écrit `<id>-<passage>.report.{html,json}` et complète `summary.json`. */
export async function runLighthouse(port: number, target: LighthouseTarget, run: number): Promise<LighthouseRun> {
  const { default: lighthouse } = await import("lighthouse");
  const result = await lighthouse(target.url, {
    port,
    output: ["html", "json"],
    logLevel: "error",
    onlyCategories: [...CATEGORIES],
    blockedUrlPatterns: [...GOOGLE_LIGHTHOUSE_PATTERNS],
    ...NO_ERROR_REPORTING,
    ...(target.scope ? { extraHeaders: { [HEADER]: target.scope } } : {}),
    ...(target.status !== 200 ? { ignoreStatusCode: true } : {}),
  });
  if (!result) throw new Error(`Lighthouse n'a rien renvoyé pour ${target.url}`);

  const [html, json] = result.report as string[];
  const base = join(REPORT_DIR, `${target.id}-${run}.report`);
  writeFileSync(`${base}.html`, html ?? "");
  writeFileSync(`${base}.json`, json ?? "");

  const { lhr } = result;
  const origin = new URL(target.url).origin;
  const items = (lhr.audits["network-requests"]?.details as { items?: { url?: string }[] } | undefined)?.items ?? [];
  const foreignRequests = items
    .map((item) => item.url ?? "")
    .filter((url) => !url.startsWith("data:") && !url.startsWith("blob:") && new URL(url).origin !== origin);

  const scores = Object.fromEntries(
    CATEGORIES.map((category) => {
      const score = lhr.categories[category]?.score;
      return [category, typeof score === "number" ? Math.round(score * 100) : null];
    }),
  ) as Scores;

  const measured: LighthouseRun = {
    id: target.id,
    path: new URL(target.url).pathname + new URL(target.url).search,
    run,
    scores,
    foreignRequests,
    runtimeError: lhr.runtimeError ? `${lhr.runtimeError.code} : ${lhr.runtimeError.message}` : null,
  };
  appendSummary(measured);
  return measured;
}

/** Médiane d'un nombre impair de scores. */
export function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

export function formatRun(run: LighthouseRun): string {
  const s = run.scores;
  return `${run.id} passage ${run.run} : performance ${s.performance}, accessibilité ${s.accessibility}, bonnes pratiques ${s["best-practices"]}, référencement ${s.seo} (${run.path})`;
}
