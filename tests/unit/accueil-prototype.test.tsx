import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { createPrototypeAdapter, type SourceProgrammes } from "@/adapters/prototype";
import { createProgrammeLoader } from "@/adapters/prototype-loader";
import HomePage from "@/app/page";
import { creationRoutes } from "@/features/creation/routes";
import { mesVoyagesRoute } from "@/features/sejour/routes";
import * as messages from "@/i18n/messages";
import { createRelecteurSimule } from "@/mocks/prototype-relecteur";

vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getTripAdapter: vi.fn(actual.getTripAdapter) };
});

/**
 * Spécification E2E-essai, lot 2 (une seule app) : la section « Prototype » de P0-PO-11 est retirée de l'accueil ; sur
 * le site d'essai, « Créer un voyage » puis « Mes voyages », sans lecture des programmes depuis l'accueil.
 */

const TRIP_ID = "proto_test_20261012_1";
const DOSSIER_TEST = realpathSync(join(process.cwd(), "prototype", "programmes-test"));

function avecProgrammes(programmes: SourceProgrammes) {
  const adapter = createPrototypeAdapter({ programmes, relecteurs: { trajets: createRelecteurSimule() } });
  vi.mocked(adapters.getTripAdapter).mockReturnValue(adapter);
  return adapter;
}

beforeEach(() => {
  vi.mocked(adapters.getTripAdapter).mockReset();
  vi.stubEnv("DATA_ADAPTER", "prototype");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("accueil : site d'essai, une seule app", () => {
  it("aucune section « Prototype » ni « Démonstration » ; « Créer un voyage » puis « Mes voyages », sans lire les voyages", async () => {
    const adapter = avecProgrammes(createProgrammeLoader({ dossier: DOSSIER_TEST }));
    const listTrips = vi.spyOn(adapter, "listTrips");
    render(await HomePage());
    expect(screen.queryByRole("region", { name: "Prototype" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Prototype" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Démonstration" })).not.toBeInTheDocument();
    expect(screen.queryByText("Voyage : Ville de test")).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([creationRoutes.nouveau({ essai: true }), mesVoyagesRoute()]);
    expect(screen.getByRole("link", { name: messages.accueil.creer })).toHaveAttribute("href", creationRoutes.nouveau({ essai: true }));
    expect(screen.getByRole("link", { name: messages.accueil.mesVoyages })).toHaveAttribute("href", mesVoyagesRoute());
    expect(listTrips).not.toHaveBeenCalled();
    // Garde nommée (`siteEssaiAutorise`) : l'adaptateur n'est pas construit depuis l'accueil.
    expect(adapters.getTripAdapter).not.toHaveBeenCalled();
  });

  it("répertoire de programmes absent : même accueil, sans erreur", async () => {
    avecProgrammes(createProgrammeLoader({ dossier: join(DOSSIER_TEST, "absent") }));
    render(await HomePage());
    expect(screen.queryAllByRole("link").map((link) => link.getAttribute("href"))).toEqual([creationRoutes.nouveau({ essai: true }), mesVoyagesRoute()]);
  });

  it("adaptateur mock : ni section « Prototype » ni lien secondaire « Mes voyages » hors de la démonstration", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    vi.mocked(adapters.getTripAdapter).mockImplementation((await vi.importActual<typeof import("@/adapters")>("@/adapters")).getTripAdapter);
    render(await HomePage());
    expect(screen.queryByRole("heading", { name: "Prototype" })).not.toBeInTheDocument();
    const demo = screen.getByRole("region", { name: messages.accueil.demo.titre });
    const horsDemo = screen.getAllByRole("link").filter((link) => !demo.contains(link));
    expect(horsDemo.map((link) => link.getAttribute("href"))).toEqual([creationRoutes.nouveau()]);
  });

  it.each([["VERCEL_ENV"], ["VADROUILLE_ENV"]])("%s=production : la page lève (erreur 500), aucune section", async (name) => {
    vi.stubEnv(name, "production");
    vi.stubEnv("VADROUILLE_PROTOTYPE", "1");
    vi.stubEnv("CI", "true");
    vi.mocked(adapters.getTripAdapter).mockImplementation((await vi.importActual<typeof import("@/adapters")>("@/adapters")).getTripAdapter);
    await expect(HomePage()).rejects.toThrow(/adaptateur prototype refusé/);
  });

  it("le programme de test ne contient que des valeurs sentinelles (aucun nom ni position réels)", () => {
    const texte = readFileSync(join(DOSSIER_TEST, `${TRIP_ID}.json`), "utf8");
    const programme = JSON.parse(texte) as { positions: Record<string, unknown> };
    for (const placeId of Object.keys(programme.positions)) expect(placeId).toMatch(/^SENTINELLE_PLACE_ID/);
    expect(texte).toContain("55.9533123");
  });
});
