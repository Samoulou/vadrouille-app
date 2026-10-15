// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ecriture from "@/adapters/prototype-ecriture";
import type { GardeOuverte } from "@/server/p0/garde";
import { LIMITES_PROTOTYPE } from "@/server/usage/forfait";
import { briefLancable, cloreExecutionNonDemarree, lancementDuMode, NOMS_BRIEFS, SKUS_FORFAIT, verrouS8Leve } from "@/workflows/p0-run";

/**
 * Pièces du lancement lues dans le pont `p0Run` (P0r3d) : forfait et règles de la réservation (0046 D13 point 3 ; 0053 ;
 * Q329), clôture d'une exécution non démarrée, verrou S8 et briefs. Base simulée ; aucun appel.
 */

const d = vi.hoisted(() => ({ pool: { connect: vi.fn() }, cloreExecution: vi.fn() }));
vi.mock("@/server/p0/base", () => ({ poolPrototype: () => d.pool }));
vi.mock("@/adapters/prototype-travail", () => ({
  lireExecution: vi.fn(),
  ecrirePhase: vi.fn(),
  ecrireCoutModeles: vi.fn(),
  remplacerCandidats: vi.fn(),
  lireCandidats: vi.fn(),
  cloreExecution: d.cloreExecution,
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("p0Run : pièces du lancement (P0r3d)", () => {
  it("SKU du forfait : égaux à ceux des clients réels (lus dans leur source : seuls leurs tests les importent)", () => {
    const sku = (fichier: string, nom: string) => {
      const trouve = new RegExp(`^export const ${nom} = "([a-z_]+)";$`, "m").exec(readFileSync(path.join(process.cwd(), fichier), "utf8"));
      expect(trouve, nom).not.toBeNull();
      return trouve![1];
    };
    expect(SKUS_FORFAIT).toEqual({
      textSearch: sku("src/grounding/places-client.ts", "SKU_TEXT_SEARCH"),
      details: sku("src/grounding/places-client.ts", "SKU_DETAILS"),
      matrice: sku("src/grounding/routes-client.ts", "SKU_MATRICE"),
    });
    expect(Object.isFrozen(SKUS_FORFAIT)).toBe(true);
  });

  it("mode réel : plafonds de mode-reel.json, 4,30 USD de Google au prix plein (0053), 3 USD de modèles, 15 min", () => {
    expect(lancementDuMode("reel")).toEqual({
      forfait: {
        nature: "execution",
        textSearchRequetes: 90,
        placeDetailsRequetes: 90,
        routesRequetes: 30,
        routesElements: 500,
        coutGoogleMicros: 4_300_000,
        coutModelesMicros: 3_000_000,
      },
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 },
    });
  });

  it("essai : plafonds d'essai.json, 0,82 USD de Google, 0,30 USD de modèles ; orphelines comptées sur la durée du mode réel", () => {
    expect(lancementDuMode("essai")).toEqual({
      forfait: {
        nature: "execution",
        textSearchRequetes: 14,
        placeDetailsRequetes: 11,
        routesRequetes: 3,
        routesElements: 120,
        coutGoogleMicros: 820_000,
        coutModelesMicros: 300_000,
      },
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: 900_000 },
    });
  });

  it("mode inconnu : null (configuration refusée), sans exception", () => {
    expect(lancementDuMode("autre" as "reel")).toBeNull();
  });

  it("table de prix refusée : null, aucune réservation possible", async () => {
    vi.resetModules();
    vi.doMock("@/server/usage/cout-google", async (original) => ({
      ...(await original<typeof import("@/server/usage/cout-google")>()),
      TablePrixGoogleSchema: { safeParse: () => ({ success: false }) },
    }));
    const { lancementDuMode: lancementSansTable } = await import("@/workflows/p0-run");
    expect(lancementSansTable("reel")).toBeNull();
    expect(lancementSansTable("essai")).toBeNull();
    vi.doUnmock("@/server/usage/cout-google");
    vi.resetModules();
  });

  it("clôture d'une exécution non démarrée : upstream_unavailable (cause externe), par l'adaptateur de la table de travail", async () => {
    const garde = Object.freeze({ runId: "66666666-6666-4666-8666-666666666666" }) as unknown as GardeOuverte;
    const pool = { connect: vi.fn() };
    await cloreExecutionNonDemarree(pool, garde);
    expect(d.cloreExecution).toHaveBeenCalledWith(pool, garde.runId, "upstream_unavailable");
  });

  it("verrou S8 : la lecture de l'adaptateur d'écriture, réexportée telle quelle ; briefs admis et valides", () => {
    expect(verrouS8Leve).toBe(ecriture.verrouS8Leve);
    for (const nom of NOMS_BRIEFS) expect(briefLancable(nom), nom).toBe(true);
    for (const nom of ["inconnu.json", "", "../prototype/briefs/edimbourg-1.json"]) expect(briefLancable(nom), nom).toBe(false);
  });
});
