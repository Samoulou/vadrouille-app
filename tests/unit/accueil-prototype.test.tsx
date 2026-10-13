import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import { createPrototypeAdapter, type SourceProgrammes } from "@/adapters/prototype";
import { createProgrammeLoader } from "@/adapters/prototype-loader";
import HomePage from "@/app/page";
import { presentationRoute } from "@/features/presentation/routes";
import { tripRoutes } from "@/features/sejour/routes";
import { messages } from "@/i18n";
import { createRelecteurSimule } from "@/mocks/prototype-relecteur";

vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getTripAdapter: vi.fn(actual.getTripAdapter) };
});

/** Spécification P0, P0-PO-11 : section « Prototype » de la page d'accueil, en mode prototype seulement. */

const t = messages.accueil.prototype;
const TRIP_ID = "proto_test_20261012_1";
const DOSSIER_TEST = realpathSync(join(process.cwd(), "prototype", "programmes-test"));

function avecProgrammes(programmes: SourceProgrammes) {
  vi.mocked(adapters.getTripAdapter).mockReturnValue(
    createPrototypeAdapter({ programmes, relecteurs: { trajets: createRelecteurSimule() } }),
  );
}

beforeEach(() => {
  vi.mocked(adapters.getTripAdapter).mockReset();
  vi.stubEnv("DATA_ADAPTER", "prototype");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("accueil : section « Prototype »", () => {
  it("titre, mention d'attribution, un lien vers la présentation et un vers le Séjour par voyage ; pas de « Démonstration »", async () => {
    avecProgrammes(createProgrammeLoader({ dossier: DOSSIER_TEST }));
    render(await HomePage());
    const section = screen.getByRole("region", { name: t.titre });
    expect(within(section).getByRole("heading", { level: 2, name: "Prototype" })).toBeInTheDocument();
    expect(
      within(section).getByText("Programme produit par le prototype de recherche. Données de lieux : Google."),
    ).toBeInTheDocument();
    expect(within(section).getByText("Voyage : Ville de test")).toBeInTheDocument();
    expect(
      within(section)
        .getAllByRole("link")
        .map((link) => link.getAttribute("href")),
    ).toEqual([presentationRoute(TRIP_ID), tripRoutes("/voyages", TRIP_ID).sejour()]);
    // Noms accessibles reliés au voyage : distincts quand plusieurs voyages sont listés.
    expect(within(section).getByRole("link", { name: "Tes propositions J'aime / Pas pour moi Voyage : Ville de test" })).toHaveAttribute(
      "href",
      presentationRoute(TRIP_ID),
    );
    expect(within(section).getByRole("link", { name: "Séjour Le programme jour par jour Voyage : Ville de test" })).toHaveAttribute(
      "href",
      tripRoutes("/voyages", TRIP_ID).sejour(),
    );
    expect(screen.queryByRole("heading", { name: "Démonstration" })).not.toBeInTheDocument();
  });

  it("adaptateurs: répertoire de programmes vide ou absent, section Prototype absente sans erreur", async () => {
    avecProgrammes(createProgrammeLoader({ dossier: join(DOSSIER_TEST, "absent") }));
    render(await HomePage());
    expect(screen.queryByRole("heading", { name: "Prototype" })).not.toBeInTheDocument();
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });

  it("aucune section avec l'adaptateur mock", async () => {
    vi.stubEnv("DATA_ADAPTER", "mock");
    vi.mocked(adapters.getTripAdapter).mockImplementation((await vi.importActual<typeof import("@/adapters")>("@/adapters")).getTripAdapter);
    render(await HomePage());
    expect(screen.queryByRole("heading", { name: "Prototype" })).not.toBeInTheDocument();
  });

  it.each([["VERCEL_ENV"], ["VADROUILLE_ENV"]])("%s=production : la page lève (erreur 500), aucune section", async (name) => {
    vi.stubEnv(name, "production");
    vi.stubEnv("VADROUILLE_PROTOTYPE", "1");
    vi.stubEnv("CI", "true");
    await expect(HomePage()).rejects.toThrow(/adaptateur prototype refusé/);
  });

  it("le programme de test ne contient que des valeurs sentinelles (aucun nom ni position réels)", () => {
    const texte = readFileSync(join(DOSSIER_TEST, `${TRIP_ID}.json`), "utf8");
    const programme = JSON.parse(texte) as { positions: Record<string, unknown> };
    for (const placeId of Object.keys(programme.positions)) expect(placeId).toMatch(/^SENTINELLE_PLACE_ID/);
    expect(texte).toContain("55.9533123");
  });
});
