// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { edimbourg, edimbourgDebloque } from "@/mocks/edimbourg";

import { shareButtonVisible } from "./index";
import type { SimulationScope } from "./simulation";

const clock = vi.hoisted(() => ({ now: 0 }));
vi.mock("./simulation", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./simulation")>();
  return {
    ...actual,
    getSimulationScope: vi.fn(async () => ({ clock: { now: () => clock.now } }) as unknown as SimulationScope),
  };
});
const { getSimulationScope } = await import("./simulation");

// Partage réel (décision 0135 § 2) : clé de signature et session vérifiée de l'adaptateur `prototype`, pilotées par le test.
const partage = vi.hoisted(() => ({ cle: null as Buffer | null, session: false }));
vi.mock("./prototype-instance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./prototype-instance")>();
  return {
    ...actual,
    clePartageEssai: vi.fn(() => partage.cle),
    sessionPartageEssaiVerifiee: vi.fn(async () => partage.session),
  };
});
const { clePartageEssai, sessionPartageEssaiVerifiee } = await import("./prototype-instance");

/**
 * Bouton « Partager » du Séjour et de la Journée (spécification F10, F10c : C38, F10-PO-13, F10-PO-21) : garde
 * fermée ou voyage non débloqué, rien n'est lu ; sinon visible jusqu'à la fin du partage (retour le 2026-09-03,
 * 30 jours d'accès : dernier jour le 2026-10-03, heure d'Édimbourg).
 */

beforeEach(() => {
  clock.now = Date.parse("2026-08-30T10:40:00+01:00");
  vi.mocked(getSimulationScope).mockClear();
  vi.mocked(clePartageEssai).mockClear();
  vi.mocked(sessionPartageEssaiVerifiee).mockClear();
  partage.cle = null;
  partage.session = false;
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("shareButtonVisible", () => {
  it("garde ouverte, voyage débloqué, partage en cours : visible", async () => {
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(true);
  });

  it("adaptateur `api` : caché, sans lire la portée", async () => {
    vi.stubEnv("DATA_ADAPTER", "api");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
    expect(getSimulationScope).not.toHaveBeenCalled();
  });

  it("déploiement de production, même avec le drapeau : caché, sans lire la portée", async () => {
    vi.stubEnv("VADROUILLE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEMO_SHARE", "1");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
    expect(getSimulationScope).not.toHaveBeenCalled();
  });

  it("voyage non débloqué : caché, sans lire la portée", async () => {
    await expect(shareButtonVisible(edimbourg)).resolves.toBe(false);
    expect(getSimulationScope).not.toHaveBeenCalled();
  });

  it("2026-10-03 à 23:59 à Édimbourg : visible ; 2026-10-04 à 00:00 : caché", async () => {
    clock.now = Date.parse("2026-10-03T23:59:00+01:00");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(true);
    clock.now = Date.parse("2026-10-04T00:00:00+01:00");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
  });

  it("adaptateur `mock` : ni clé ni session de partage réel lues", async () => {
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(true);
    expect(clePartageEssai).not.toHaveBeenCalled();
    expect(sessionPartageEssaiVerifiee).not.toHaveBeenCalled();
  });
});

describe("shareButtonVisible, partage réel (adaptateur `prototype`, décision 0135 § 2)", () => {
  beforeEach(() => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
  });

  it("clé absente : caché, sans vérifier la session ni lire la portée", async () => {
    partage.session = true;
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
    expect(clePartageEssai).toHaveBeenCalled();
    expect(sessionPartageEssaiVerifiee).not.toHaveBeenCalled();
    expect(getSimulationScope).not.toHaveBeenCalled();
  });

  it("clé présente, session non vérifiée : caché, sans lire la portée", async () => {
    partage.cle = Buffer.alloc(32, 1);
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
    expect(sessionPartageEssaiVerifiee).toHaveBeenCalledTimes(1);
    expect(getSimulationScope).not.toHaveBeenCalled();
  });

  it("clé présente, session vérifiée, voyage débloqué, partage en cours : visible ; partage terminé : caché", async () => {
    partage.cle = Buffer.alloc(32, 1);
    partage.session = true;
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(true);
    clock.now = Date.parse("2026-10-04T00:00:00+01:00");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
  });

  it("tout vrai mais voyage non débloqué : caché, sans lire ni clé ni session", async () => {
    partage.cle = Buffer.alloc(32, 1);
    partage.session = true;
    await expect(shareButtonVisible(edimbourg)).resolves.toBe(false);
    expect(clePartageEssai).not.toHaveBeenCalled();
    expect(sessionPartageEssaiVerifiee).not.toHaveBeenCalled();
  });

  it("déploiement de production : caché, sans lire ni clé ni session", async () => {
    partage.cle = Buffer.alloc(32, 1);
    partage.session = true;
    vi.stubEnv("VERCEL_ENV", "production");
    await expect(shareButtonVisible(edimbourgDebloque)).resolves.toBe(false);
    expect(clePartageEssai).not.toHaveBeenCalled();
  });
});
