import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { MOCK_DEMO_TRIP, MOCK_DEMO_UNLOCKED_TRIP } from "@/adapters";
import HomePage, { dynamic } from "@/app/page";
import { PRODUCT_NAME } from "@/config/site";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";
import { messages } from "@/i18n";

vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getTripAdapter: vi.fn(actual.getTripAdapter) };
});

/** Spécification D1 : section « Démonstration » de la page d'accueil. */

const t = messages.accueil.demo;

async function renderHome() {
  render(await HomePage());
}

const demoList = () => within(screen.getByRole("region", { name: t.titre })).getByRole("list");

beforeEach(() => {
  vi.mocked(adapters.getTripAdapter).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("accueil : section « Démonstration » avec l'adaptateur mock", () => {
  it.each([undefined, "", "mock"])("DATA_ADAPTER=%j : titre, mention et 4 liens dans l'ordre", async (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    await renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "Démonstration" })).toBeInTheDocument();
    expect(screen.getByText(/Données simulées/)).toBeInTheDocument();
    const items = within(demoList()).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    const links = within(demoList()).getAllByRole("link");
    expect(links).toHaveLength(4);
    expect(links.map((link) => link.textContent)).toEqual([
      expect.stringContaining("Tes premières propositions"),
      expect.stringContaining("Suite du tri"),
      expect.stringContaining("Séjour"),
      expect.stringContaining("Jour 1"),
    ]);
  });

  it("adresses : présentation, suite du tri, Séjour et Jour 1 du voyage débloqué ; aucune page /dev", async () => {
    await renderHome();
    const hrefs = within(demoList())
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    const unlocked = tripRoutes("/voyages", MOCK_DEMO_UNLOCKED_TRIP.tripId);
    expect(hrefs).toEqual([
      presentationRoute(MOCK_DEMO_TRIP.tripId),
      presentationRoute(MOCK_DEMO_UNLOCKED_TRIP.tripId),
      unlocked.sejour(),
      unlocked.jour(1),
    ]);
    for (const href of hrefs) expect(href).not.toMatch(/^\/dev/);
  });

  it("la mention précède les liens", async () => {
    await renderHome();
    const mention = screen.getByText(t.mention);
    expect(mention.compareDocumentPosition(demoList()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("nom accessible de chaque lien : libellé suivi de sa précision", async () => {
    await renderHome();
    const names = Object.values(t.liens).map((link) => `${link.libelle} ${link.precision}`);
    for (const name of names) {
      expect(within(demoList()).getByRole("link", { name })).toBeInTheDocument();
    }
  });

  it("« Voyage d'exemple : Édimbourg » vient de l'adaptateur", async () => {
    await renderHome();
    expect(screen.getByText("Voyage d'exemple : Édimbourg")).toBeInTheDocument();
    expect(adapters.getTripAdapter).toHaveBeenCalled();
  });

  it("NODE_ENV=production sans VADROUILLE_DEV_PAGES : la section est affichée", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VADROUILLE_DEV_PAGES", undefined);
    vi.stubEnv("DATA_ADAPTER", undefined);
    await renderHome();
    expect(screen.getByRole("heading", { level: 2, name: "Démonstration" })).toBeInTheDocument();
  });

  it("rendu dynamique (D1-PO-5)", () => {
    expect(dynamic).toBe("force-dynamic");
  });
});

describe("accueil : autre adaptateur", () => {
  it.each(["api", "autre"])("DATA_ADAPTER=%j : ni section ni lien, nom et promesse affichés, sans erreur", async (value) => {
    vi.stubEnv("DATA_ADAPTER", value);
    await expect(HomePage()).resolves.toBeTruthy();
    await renderHome();
    expect(screen.queryByRole("heading", { name: "Démonstration" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 1, name: PRODUCT_NAME })).toBeInTheDocument();
    expect(screen.getByText(messages.produit.promesse)).toBeInTheDocument();
    expect(adapters.getTripAdapter).not.toHaveBeenCalled();
  });
});

describe("accueil : aucune destination en dur", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("aucune chaîne « Édimbourg » dans src/app ni src/features/accueil", () => {
    const root = join(__dirname, "..", "..", "src");
    const sources = [...files(join(root, "app")), ...files(join(root, "features", "accueil"))];
    expect(sources.length).toBeGreaterThan(0);
    const offenders = sources.filter((path) => /dimbourg/i.test(readFileSync(path, "utf8")));
    expect(offenders).toEqual([]);
  });
});
