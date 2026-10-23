// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import * as ecriture from "@/adapters/prototype-ecriture";
import type { GardeOuverte } from "@/server/p0/garde";
import { LIMITES_PROTOTYPE } from "@/server/usage/forfait";
import { bornesRechercheDuBriefPourTests, briefLancable, briefTientDansLeMode, cloreExecutionNonDemarree, DUREE_MAX_EXECUTION_MS, lancementDuMode, NOMS_BRIEFS, SKUS_FORFAIT, verrouS8Leve } from "@/workflows/p0-run";

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
  it("ticket 483 : cibles de la recherche de l'exécution comptée calculées depuis la demande, sous les plafonds ; essai inchangé (0073 point 4)", () => {
    const lireJson = (chemin: string) => JSON.parse(readFileSync(path.join(process.cwd(), chemin), "utf8")) as Record<string, unknown>;
    const reel = lireJson("prototype/config/mode-reel.json") as { placesTextSearch: number };
    const recherche = lireJson("prototype/config/recherche.json") as { toursMax: number };
    const rechercheEssai = lireJson("prototype/config/recherche-essai.json") as { ciblesParCreneau: Record<string, number>; totalCandidats: number };
    // Rome : 19 activités, 9 repas, 4 soirées demandés → 25, 14 (plancher de recherche.json), 6 ; 45 au total (23 trouvés
    // lors de l'essai du 2026-10-18 sous l'ancien total de 40).
    expect(bornesRechercheDuBriefPourTests("reel", "rome-1.json")?.ciblesParCreneau).toEqual({ activity: 25, meal: 14, evening: 6 });
    expect(Object.fromEntries(NOMS_BRIEFS.map((nom) => [nom, bornesRechercheDuBriefPourTests("reel", nom)?.totalCandidats]))).toEqual({
      "edimbourg-1.json": 52,
      "edimbourg-2.json": 43,
      "edimbourg-3.json": 52,
      "edimbourg-court.json": 40,
      "rome-1.json": 45,
    });
    for (const nom of NOMS_BRIEFS) {
      const bornes = bornesRechercheDuBriefPourTests("reel", nom);
      expect(bornes, nom).not.toBeNull();
      const somme = (bornes?.ciblesParCreneau.activity ?? 0) + (bornes?.ciblesParCreneau.meal ?? 0) + (bornes?.ciblesParCreneau.evening ?? 0);
      expect(somme, nom).toBeLessThanOrEqual(bornes?.totalCandidats ?? 0);
      // Plafonds du mode réel (0102 § 3) : borne de forme de 300 et Text Search de l'ancrage (90 − 2 × logements).
      expect(bornes?.totalCandidats ?? Infinity, nom).toBeLessThanOrEqual(Math.min(300, reel.placesTextSearch - 2));
      // Fusible des tours inchangé (0073 point 3) : 30 candidats au plus par tour, les tours suffisent au total visé.
      expect(bornes?.toursMax, nom).toBe(recherche.toursMax);
      expect((bornes?.toursMax ?? 0) * 30, nom).toBeGreaterThanOrEqual(bornes?.totalCandidats ?? Infinity);
      // Essai : profil fixe de recherche-essai.json (décision 0073 point 4, réservée à Samuel).
      expect(bornesRechercheDuBriefPourTests("essai", nom)?.ciblesParCreneau, nom).toEqual(rechercheEssai.ciblesParCreneau);
      expect(bornesRechercheDuBriefPourTests("essai", nom)?.totalCandidats, nom).toBe(rechercheEssai.totalCandidats);
    }
    expect(bornesRechercheDuBriefPourTests("reel", "absent.json")).toBeNull();
  });

  it("ticket 400 et décision 0073 : brief dans les plafonds du mode ; essai et mode réel admettent les cinq briefs (rome-1 compris, ticket 478)", () => {
    const table = Object.fromEntries((["essai", "reel"] as const).map((mode) => [mode, Object.fromEntries(NOMS_BRIEFS.map((nom) => [nom, briefTientDansLeMode(mode, nom)]))]));
    expect(table).toEqual({
      essai: { "edimbourg-1.json": true, "edimbourg-2.json": true, "edimbourg-3.json": true, "edimbourg-court.json": true, "rome-1.json": true },
      reel: { "edimbourg-1.json": true, "edimbourg-2.json": true, "edimbourg-3.json": true, "edimbourg-court.json": true, "rome-1.json": true },
    });
    expect(briefTientDansLeMode("essai", "absent.json")).toBe(false);
    expect(briefTientDansLeMode("demo" as "reel", "edimbourg-court.json")).toBe(false);
  });

  it("ticket 400 : le contrôle reste actif ; essai aux anciens plafonds de 0063 (3 requêtes, 120 éléments, 14 fiches) : seul le brief court passe", async () => {
    vi.resetModules();
    const commite = JSON.parse(readFileSync(path.join(process.cwd(), "prototype/config/essai.json"), "utf8")) as Record<string, unknown>;
    vi.doMock("../../../prototype/config/essai.json", () => ({
      default: { ...commite, coutUsd: 0.3, placesTextSearch: 17, placesDetails: 14, routesRequetes: 3, routesElements: 120 },
    }));
    const { briefTientDansLeMode: tientAncien, NOMS_BRIEFS: noms } = await import("@/workflows/p0-run");
    expect(Object.fromEntries(noms.map((nom) => [nom, tientAncien("essai", nom)]))).toEqual({
      "edimbourg-1.json": false,
      "edimbourg-2.json": false,
      "edimbourg-3.json": false,
      "edimbourg-court.json": true,
      "rome-1.json": false,
    });
    vi.doUnmock("../../../prototype/config/essai.json");
    vi.resetModules();
  });

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

  it("mode réel : plafonds de mode-reel.json, 6,00 USD de Google au prix plein (0053, 0088 § 13), 3 USD de modèles, orphelines et garde sur DUREE_MAX_EXECUTION_MS (0102 § 6)", () => {
    expect(lancementDuMode("reel")).toEqual({
      forfait: {
        nature: "execution",
        textSearchRequetes: 90,
        placeDetailsRequetes: 90,
        routesRequetes: 30,
        routesElements: 840,
        coutGoogleMicros: 6_000_000,
        coutModelesMicros: 3_000_000,
      },
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: DUREE_MAX_EXECUTION_MS },
    });
  });

  // essai.json aligné sur mode-reel.json (0073) : 90 Text Search (gratuits), 90 fiches à 20 USD les 1 000 (1,80 USD) et
  // 840 éléments Routes à 5 USD les 1 000 (4,20 USD, 0088 § 13), au prix plein.
  it("essai : plafonds d'essai.json, alignés sur le mode réel (0073) : 6,00 USD de Google, 2 USD de modèles ; orphelines comptées sur DUREE_MAX_EXECUTION_MS, la même pour tous les modes", () => {
    expect(lancementDuMode("essai")).toEqual({
      forfait: {
        nature: "execution",
        textSearchRequetes: 90,
        placeDetailsRequetes: 90,
        routesRequetes: 30,
        routesElements: 840,
        coutGoogleMicros: 6_000_000,
        coutModelesMicros: 2_000_000,
      },
      regles: { limites: LIMITES_PROTOTYPE, uniteQuotaRoutes: "elements", dureeMaxMs: DUREE_MAX_EXECUTION_MS },
    });
  });

  it("révision (décision 0126 § 2) : plafonds Google donnés, bornés par ceux du mode, coût Google au prix plein de ces plafonds, 0,25 USD de modèles", () => {
    const revision = lancementDuMode("essai", "revision", { textSearch: 30, details: 30, routesRequetes: 12, routesElements: 120 });
    // 30 × 0 + 30 × 0,020 + 120 × 0,005 = 0,60 + 0,60 = 1,20 USD.
    expect(revision?.forfait).toEqual({
      nature: "execution",
      textSearchRequetes: 30,
      placeDetailsRequetes: 30,
      routesRequetes: 12,
      routesElements: 120,
      coutGoogleMicros: 1_200_000,
      coutModelesMicros: 250_000,
    });
    // Jamais au-delà du mode ; négatif ramené à 0.
    expect(lancementDuMode("essai", "revision", { textSearch: 500, details: 500, routesRequetes: 500, routesElements: 5000 })?.forfait).toMatchObject({
      textSearchRequetes: 90,
      placeDetailsRequetes: 90,
      routesRequetes: 30,
      routesElements: 840,
      coutGoogleMicros: 6_000_000,
    });
    expect(lancementDuMode("essai", "revision", { textSearch: -1, details: 0, routesRequetes: 0, routesElements: 0 })?.forfait.coutGoogleMicros).toBe(0);
  });

  it("mode inconnu : null (configuration refusée), sans exception", () => {
    expect(lancementDuMode("autre" as "reel")).toBeNull();
  });

  // Condition de la Sécurité sur la PR 565 et 0102 § 5 : `totalCandidats + 5 ≤ placesTextSearch` est contrôlé par le
  // lancement, avant toute réservation. `lancementDuMode` rend `null` (le lancement est refusé, `real_mode_unavailable`) :
  // la base n'est jamais ouverte ici et l'appelant ne réserve que sur un forfait rendu.
  describe("contrôle croisé totalCandidats + 5 ≤ placesTextSearch (0102 § 5), avant toute réservation", () => {
    const FICHIERS = { reel: "mode-reel", essai: "essai" } as const;
    const lireJson = (chemin: string) => JSON.parse(readFileSync(path.join(process.cwd(), chemin), "utf8")) as Record<string, unknown>;
    const total = (mode: "reel" | "essai") => (lireJson(`prototype/config/${mode === "reel" ? "recherche" : "recherche-essai"}.json`) as { totalCandidats: number }).totalCandidats;

    async function lancerAvecTextSearch(mode: "reel" | "essai", placesTextSearch: number) {
      vi.resetModules();
      const commite = lireJson(`prototype/config/${FICHIERS[mode]}.json`) as Record<string, unknown>;
      if (mode === "reel") vi.doMock("../../../prototype/config/mode-reel.json", () => ({ default: { ...commite, placesTextSearch } }));
      else vi.doMock("../../../prototype/config/essai.json", () => ({ default: { ...commite, placesTextSearch } }));
      const { lancementDuMode: lancement } = await import("@/workflows/p0-run");
      const rendu = lancement(mode);
      vi.doUnmock("../../../prototype/config/mode-reel.json");
      vi.doUnmock("../../../prototype/config/essai.json");
      vi.resetModules();
      return rendu;
    }

    for (const mode of ["reel", "essai"] as const) {
      it(`${mode} : totalCandidats + 4 Text Search, refusé (null), aucune réservation`, async () => {
        expect(await lancerAvecTextSearch(mode, total(mode) + 4)).toBeNull();
        expect(d.pool.connect).not.toHaveBeenCalled();
        expect(d.cloreExecution).not.toHaveBeenCalled();
      });

      it(`${mode} : totalCandidats + 5 Text Search, la borne est atteinte : un forfait est rendu pour ce plafond`, async () => {
        const rendu = await lancerAvecTextSearch(mode, total(mode) + 5);
        expect(rendu?.forfait.textSearchRequetes).toBe(total(mode) + 5);
      });
    }
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
