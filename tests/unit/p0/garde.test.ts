// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LOG_GUARD_CODES } from "@/server/log";
import { CODES_GARDE_FERMEE, valeurCookieAcces } from "@/server/p0/acces";
import { ouvrirGardeLancement, verifierGardeEtape, type GardeOuverte } from "@/server/p0/garde";
import type { ResultatLancement } from "@/server/usage/neon";

import { baseEssais } from "../../support/base-essais-p0";

/**
 * Garde complète du mode réel (décision 0055, section 1 points 2 et 4 ; avis de la Sécurité S-1) : `p0: mode réel
 * refusé` (lancement) et `p0: chaque étape revérifie la garde` (étape). Chaque condition est prise seule sur une
 * configuration par ailleurs ouverte ; une garde fermée ne lit aucune clé de service, n'ouvre aucune connexion et
 * ne réserve rien.
 */

// Espions des modules de clés de service : la garde ne doit jamais les appeler (0055, section 1 point 2).
const cles = vi.hoisted(() => ({ modeles: vi.fn(), google: vi.fn() }));
vi.mock("@/server/env/ai", () => ({ lireCleOpenRouter: cles.modeles }));
vi.mock("@/server/env/grounding", () => ({ lireCleGoogle: cles.google }));

beforeEach(() => {
  vi.stubEnv("VERCEL_ENV", "preview");
  vi.stubEnv("VERCEL_TARGET_ENV", undefined);
  vi.stubEnv("VADROUILLE_ENV", undefined);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  expect(cles.modeles).not.toHaveBeenCalled();
  expect(cles.google).not.toHaveBeenCalled();
});

const [NOM_CODE = "", NOM_BASE = ""] = Object.keys({
  P0_RUN_TOKEN: 0,
  P0_DATABASE_URL: 0,
});
const T0 = Date.UTC(2026, 9, 14, 8);
const CODE = randomBytes(32);
const RUN_ID = "0b6c1a52-4c3e-4f7a-9d2e-5a1b2c3d4e5f";
const DUREE_MS = 900_000;

type Env = Record<string, string | undefined>;
const preversion = (extra: Env = {}): NodeJS.ProcessEnv => ({
  NODE_ENV: "test",
  VERCEL_ENV: "preview",
  VERCEL_GIT_COMMIT_REF: "p0-reel",
  P0_REAL_RUNS: "enabled",
  [NOM_BASE]: "postgres://exemple.invalid/p0",
  [NOM_CODE]: CODE.toString("hex"),
  ...extra,
});

/** Conditions prises seules (0055, section 1 point 4). */
const CONDITIONS: [string, Env][] = [
  ["VERCEL_ENV=production", { VERCEL_ENV: "production" }],
  ["VADROUILLE_ENV=production", { VADROUILLE_ENV: "production" }],
  ["VERCEL_TARGET_ENV=production", { VERCEL_TARGET_ENV: "production" }],
  ["local", { VERCEL_ENV: "development" }],
  ["ci", { VERCEL_ENV: "development", VADROUILLE_ENV: "ci" }],
  ["CI=1", { CI: "1" }],
  ["branche main", { VERCEL_GIT_COMMIT_REF: "main" }],
  ["branche claude/x", { VERCEL_GIT_COMMIT_REF: "claude/x" }],
  ["branche « p0-reel » avec espace", { VERCEL_GIT_COMMIT_REF: "p0-reel " }],
  ["branche P0-REEL", { VERCEL_GIT_COMMIT_REF: "P0-REEL" }],
  ["P0_REAL_RUNS absente", { P0_REAL_RUNS: undefined }],
  ["P0_REAL_RUNS vide", { P0_REAL_RUNS: "" }],
  ["P0_REAL_RUNS=Enabled", { P0_REAL_RUNS: "Enabled" }],
  ["P0_REAL_RUNS « enabled » avec espace", { P0_REAL_RUNS: "enabled " }],
  ["base du prototype absente", { [NOM_BASE]: undefined }],
  ["code absent", { [NOM_CODE]: undefined }],
  ["code trop court", { [NOM_CODE]: randomBytes(31).toString("hex") }],
  ["code invalide", { [NOM_CODE]: "pas-un-code" }],
];

describe("p0: mode réel refusé (lancement)", () => {
  const reservation = (): ResultatLancement => ({ ok: true, runId: RUN_ID });

  it("garde ouverte : cookie valide et réservation réussie → preuve pour l'exécution réservée", async () => {
    const reserver = vi.fn(async () => reservation());
    const resultat = await ouvrirGardeLancement({
      env: preversion(),
      execArgv: [],
      maintenant: () => T0,
      cookie: valeurCookieAcces(CODE, T0),
      reserver,
    });
    expect(resultat).toEqual({ ok: true, garde: { runId: RUN_ID } });
    expect(reserver).toHaveBeenCalledTimes(1);
  });

  it.each(CONDITIONS)("%s, seule → refus, sans réservation", async (_nom, extra) => {
    if (extra.VERCEL_TARGET_ENV !== undefined) vi.stubEnv("VERCEL_TARGET_ENV", extra.VERCEL_TARGET_ENV);
    const reserver = vi.fn(async () => reservation());
    const resultat = await ouvrirGardeLancement({
      env: preversion(extra),
      execArgv: [],
      maintenant: () => T0,
      cookie: valeurCookieAcces(CODE, T0),
      reserver,
    });
    expect(resultat.ok).toBe(false);
    expect(reserver).not.toHaveBeenCalled();
  });

  it("cookie absent, expiré, forgé, d'un ancien code → access_refused, sans réservation", async () => {
    const [, exp = "", mac = ""] = valeurCookieAcces(CODE, T0).split(".");
    for (const [cookie, maintenant] of [
      [undefined, T0],
      [valeurCookieAcces(CODE, T0), T0 + 12 * 3_600_000],
      [`v1.${Number(exp) + 1}.${mac}`, T0],
      [valeurCookieAcces(randomBytes(32), T0), T0],
    ] as const) {
      const reserver = vi.fn(async () => reservation());
      expect(
        await ouvrirGardeLancement({
          env: preversion(),
          execArgv: [],
          maintenant: () => maintenant,
          cookie,
          reserver,
        }),
      ).toEqual({
        ok: false,
        code: "access_refused",
      });
      expect(reserver).not.toHaveBeenCalled();
    }
  });

  it("réservation refusée ou en erreur → son code, ou usage_unavailable", async () => {
    const base = {
      env: preversion(),
      execArgv: [],
      maintenant: () => T0,
      cookie: valeurCookieAcces(CODE, T0),
    };
    for (const code of ["cap_reached", "daily_quota_insufficient", "envelope_reached", "usage_unavailable"] as const) {
      expect(
        await ouvrirGardeLancement({
          ...base,
          reserver: async () => ({ ok: false, code }),
        }),
      ).toEqual({ ok: false, code });
    }
    const enErreur = async (): Promise<ResultatLancement> => {
      throw new Error("base");
    };
    expect(await ouvrirGardeLancement({ ...base, reserver: enErreur })).toEqual({ ok: false, code: "usage_unavailable" });
  });

  it("le journal admet exactement les codes de la garde fermée", () => {
    expect([...LOG_GUARD_CODES].sort()).toEqual([...CODES_GARDE_FERMEE].sort());
  });

  it("une garde fermée écrit p0.guard_closed avec son seul code", async () => {
    const lignes: string[] = [];
    vi.spyOn(console, "log").mockImplementation((ligne: unknown) => void lignes.push(String(ligne)));
    await ouvrirGardeLancement({
      env: preversion({ CI: "1" }),
      execArgv: [],
      maintenant: () => T0,
      cookie: undefined,
      reserver: async () => reservation(),
    });
    expect(lignes.map((l) => JSON.parse(l) as unknown)).toEqual([{ level: "info", event: "p0.guard_closed", guard: "ci_refused" }]);
  });
});

describe("p0: chaque étape revérifie la garde", () => {
  const dependances = (base: ReturnType<typeof baseEssais>, extra: Env = {}) => ({
    env: preversion(extra),
    execArgv: [],
    pool: () => base.pool,
    dureeMaxMs: DUREE_MS,
  });

  it("exécution réservée, en cours, du jour, forfait réservé, dans sa durée → preuve ; requête bornée à ces conditions", async () => {
    const base = baseEssais(T0);
    expect(await verifierGardeEtape(RUN_ID, dependances(base))).toEqual({
      ok: true,
      garde: { runId: RUN_ID },
    });
    const lecture = base.requetes.find((r) => r.texte.includes("FROM prototype.runs"));
    expect(lecture?.valeurs).toEqual([RUN_ID, DUREE_MS]);
    for (const fragment of ["status = 'en_cours'", "prototype.quota_day_at(pg_catalog.now())", "JOIN prototype.forfaits", "r.started_at >"]) {
      expect(lecture?.texte).toContain(fragment);
    }
  });

  it("exécution inconnue, finie, d'un autre jour ou hors de sa durée (aucune ligne) → run_refused", async () => {
    const base = baseEssais(T0);
    base.executions = 0;
    expect(await verifierGardeEtape(RUN_ID, dependances(base))).toEqual({
      ok: false,
      code: "run_refused",
    });
  });

  it("identifiant mal formé ou durée invalide → run_refused, sans connexion ; base en panne → usage_unavailable", async () => {
    const base = baseEssais(T0);
    for (const id of ["", "x", `${RUN_ID} `, RUN_ID.toUpperCase(), "'; DROP TABLE x; --"]) {
      expect(await verifierGardeEtape(id, dependances(base))).toEqual({
        ok: false,
        code: "run_refused",
      });
    }
    expect(await verifierGardeEtape(RUN_ID, { ...dependances(base), dureeMaxMs: 0 })).toEqual({ ok: false, code: "run_refused" });
    expect(base.connexions).toBe(0);
    const enPanne = () => ({
      connect: async () => {
        throw new Error("base");
      },
    });
    expect(await verifierGardeEtape(RUN_ID, { ...dependances(base), pool: enPanne })).toEqual({ ok: false, code: "usage_unavailable" });
  });

  it.each(CONDITIONS)("%s, seule : une étape appelée avec une preuve fabriquée refuse, sans connexion", async (_nom, extra) => {
    if (extra.VERCEL_TARGET_ENV !== undefined) vi.stubEnv("VERCEL_TARGET_ENV", extra.VERCEL_TARGET_ENV);
    // Preuve fabriquée hors de garde.ts : admise dans tests/ seulement (règle no-restricted-syntax, S-1 point 3).
    const preuve = { runId: RUN_ID } as GardeOuverte;
    const base = baseEssais(T0);
    const resultat = await verifierGardeEtape(preuve.runId, dependances(base, extra));
    expect(resultat.ok).toBe(false);
    expect(base.connexions).toBe(0);
  });
});
