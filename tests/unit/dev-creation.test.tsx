import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import DevLogementPage from "@/app/dev/voyages/nouveau/logement/page";

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

/** `R3-dev` (décision 0017 § 1, § 7 et § 11.1 ; spécification F8, critères transverses). */
describe("/dev/voyages/nouveau/logement (R3-dev)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("répond 404 en production sans VADROUILLE_DEV_PAGES=1", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "");
    expect(() => DevLogementPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("répond 404 sur un déploiement de production (VERCEL_ENV), même avec le drapeau", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    vi.stubEnv("VERCEL_ENV", "production");
    expect(() => DevLogementPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("répond 404 sur un déploiement de production (VADROUILLE_ENV), même avec le drapeau", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    vi.stubEnv("VADROUILLE_ENV", "production");
    expect(() => DevLogementPage()).toThrow("NEXT_NOT_FOUND");
  });

  it("s'affiche avec VADROUILLE_DEV_PAGES=1 (Playwright) : brouillon prêt pour l'écran 3 de la destination", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", "1");
    const element = DevLogementPage();
    expect(element.props.initial).toMatchObject({ tripReady: true, briefReady: true, lodgingCity: 0 });
    expect(element.props.initial.trip.lodging.answer).toBe("none");
  });
});

describe("création et connexion : ni carte simulée ni src/mocks hors de /dev", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("aucun fichier de src/features/creation, src/features/compte ni src/app/(creation) n'importe la carte simulée ou src/mocks", () => {
    const root = join(__dirname, "..", "..", "src");
    const sources = [join(root, "features", "creation"), join(root, "features", "compte"), join(root, "app", "(creation)")]
      .flatMap(files)
      .filter((path) => /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path));
    expect(sources.length).toBeGreaterThan(5);
    const offenders = sources.filter((path) => /from\s+["'](@\/mocks|[^"']*SimulatedMapRenderer|[^"']*SimulatedCarte)/.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
