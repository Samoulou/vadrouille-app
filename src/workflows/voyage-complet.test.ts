import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { EtatComplet } from "@/server/generation/etat";

const etapes = vi.hoisted(() => ({
  etapeCompletDebut: vi.fn(),
  etapeCompletLogement: vi.fn(),
  etapeCompletRecherche: vi.fn(),
  etapeCompletAncrage: vi.fn(),
  etapeCompletNotation: vi.fn(),
  etapeCompletPlanification: vi.fn(),
  etapeClotureComplet: vi.fn(),
}));
vi.mock("@/server/generation/etapes-complet", () => etapes);

import {
  etapeClotureComplet,
  etapeCompletAncrage,
  etapeCompletDebut,
  etapeCompletLogement,
  etapeCompletNotation,
  etapeCompletPlanification,
  etapeCompletRecherche,
  generateFullTrip,
} from "./voyage-complet";

const ENTREE: EtatComplet = { generationRunId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", rang: 0 };
const avance = async (e: EtatComplet): Promise<EtatComplet> => ({ ...e, rang: e.rang + 1 });

describe("workflow 4 : generateFullTrip", () => {
  beforeEach(() => {
    for (const f of Object.values(etapes)) f.mockReset().mockImplementation(avance);
    etapes.etapeClotureComplet.mockImplementation(async (e: EtatComplet) => ({ ...e, arret: "upstream_unavailable" }));
  });

  it("maxRetries : 2 pour a, 0 pour l, b, c, d, e et la clôture (une étape rejouée repaierait ses appels)", () => {
    expect(etapeCompletDebut.maxRetries).toBe(2);
    for (const etape of [etapeCompletLogement, etapeCompletRecherche, etapeCompletAncrage, etapeCompletNotation, etapeCompletPlanification, etapeClotureComplet]) {
      expect(etape.maxRetries).toBe(0);
    }
  });

  it("chaque étape porte la directive use step, le workflow use workflow, et aucun appel ne vient du pont", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/voyage-complet.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(7);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect(source).not.toMatch(/from "@\/(ai|research|grounding)/);
  });

  it("enchaîne a, l puis b, c, d, e par jour, et s'arrête quand une étape rend son entrée inchangée (ligne finie)", async () => {
    // Deux jours : a, l, puis 2 × (b, c, d, e) ; la recherche du troisième jour trouve la ligne finie.
    etapes.etapeCompletRecherche.mockImplementation(async (e: EtatComplet) => (e.rang >= 10 ? e : { ...e, rang: e.rang + 1 }));
    const fin = await generateFullTrip(ENTREE);
    expect(fin).toEqual({ ...ENTREE, rang: 10 });
    expect(etapes.etapeCompletDebut).toHaveBeenCalledTimes(1);
    expect(etapes.etapeCompletLogement).toHaveBeenCalledTimes(1);
    expect(etapes.etapeCompletRecherche).toHaveBeenCalledTimes(3);
    expect(etapes.etapeCompletPlanification).toHaveBeenCalledTimes(2);
    expect(etapes.etapeClotureComplet).not.toHaveBeenCalled();
  });

  it("s'arrête sur un code d'arrêt sans appeler l'étape suivante", async () => {
    etapes.etapeCompletLogement.mockImplementation(async (e: EtatComplet) => ({ ...e, rang: e.rang + 1, arret: "cap_reached" }));
    const fin = await generateFullTrip(ENTREE);
    expect(fin.arret).toBe("cap_reached");
    expect(etapes.etapeCompletRecherche).not.toHaveBeenCalled();
    expect(etapes.etapeClotureComplet).not.toHaveBeenCalled();
  });

  it("une erreur inattendue clôt l'exécution par l'étape de clôture, sur le dernier état sérialisé", async () => {
    etapes.etapeCompletAncrage.mockRejectedValue(new Error("panne"));
    const fin = await generateFullTrip(ENTREE);
    expect(etapes.etapeClotureComplet).toHaveBeenCalledWith({ ...ENTREE, rang: 3 }, "upstream_unavailable");
    expect(fin.arret).toBe("upstream_unavailable");
  });
});
