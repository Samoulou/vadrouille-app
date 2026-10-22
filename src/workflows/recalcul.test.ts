import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { EtatLotSchema, type EtatLot } from "@/server/generation/etat";

const etapes = vi.hoisted(() => ({
  etapeLotDebut: vi.fn(),
  etapeLotPlanification: vi.fn(),
  etapeClotureLot: vi.fn(),
}));
vi.mock("@/server/generation/etapes-lot", () => etapes);

import { batchRecompute, etapeClotureLot, etapeLotDebut, etapeLotPlanification } from "./recalcul";

const ENTREE: EtatLot = { generationRunId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", rang: 0 };
const avance = async (e: EtatLot): Promise<EtatLot> => ({ ...e, rang: e.rang + 1 });

describe("workflow 5 : batchRecompute (B10b ; décision 0119 § 1.4 et § 1.5 point 1)", () => {
  beforeEach(() => {
    for (const f of Object.values(etapes)) f.mockReset().mockImplementation(avance);
    etapes.etapeClotureLot.mockImplementation(async (e: EtatLot) => ({ ...e, arret: "upstream_unavailable" }));
  });

  it("maxRetries : 2 pour a, 0 pour e et la clôture (une étape e rejouée repaierait ses appels)", () => {
    expect(etapeLotDebut.maxRetries).toBe(2);
    expect(etapeLotPlanification.maxRetries).toBe(0);
    expect(etapeClotureLot.maxRetries).toBe(0);
  });

  it("chaque étape porte la directive use step, le workflow use workflow, et aucun appel ne vient du pont", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/recalcul.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(3);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect(source).not.toMatch(/from "@\/(ai|research|grounding)/);
    expect([...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort()).toEqual(["@/server/generation/etapes-lot", "@/server/generation/etat"]);
  });

  it("enchaîne a puis e et rend l'état de e ; la ligne n'a que deux étapes", async () => {
    const fin = await batchRecompute(ENTREE);
    expect(fin).toEqual({ ...ENTREE, rang: 2 });
    expect(etapes.etapeLotDebut).toHaveBeenCalledWith(ENTREE);
    expect(etapes.etapeLotPlanification).toHaveBeenCalledWith({ ...ENTREE, rang: 1 });
    expect(etapes.etapeClotureLot).not.toHaveBeenCalled();
  });

  it("s'arrête quand a rend son entrée inchangée (aucun jour touché : ligne finie `ready`)", async () => {
    etapes.etapeLotDebut.mockImplementation(async (e: EtatLot) => e);
    expect(await batchRecompute(ENTREE)).toEqual(ENTREE);
    expect(etapes.etapeLotPlanification).not.toHaveBeenCalled();
  });

  it("s'arrête sur un code d'arrêt sans appeler l'étape suivante", async () => {
    etapes.etapeLotDebut.mockImplementation(async (e: EtatLot) => ({ ...e, rang: 1, arret: "cap_reached" }));
    const fin = await batchRecompute(ENTREE);
    expect(fin.arret).toBe("cap_reached");
    expect(etapes.etapeLotPlanification).not.toHaveBeenCalled();
    expect(etapes.etapeClotureLot).not.toHaveBeenCalled();
  });

  it("une erreur inattendue clôt l'exécution par l'étape de clôture, sur le dernier état sérialisé", async () => {
    etapes.etapeLotPlanification.mockRejectedValue(new Error("panne"));
    const fin = await batchRecompute(ENTREE);
    expect(etapes.etapeClotureLot).toHaveBeenCalledWith({ ...ENTREE, rang: 1 }, "upstream_unavailable");
    expect(fin.arret).toBe("upstream_unavailable");
  });

  it("workflows: aucune donnée Google dans l'état sérialisé — EtatLotSchema strict, rang borné à 2, aucune sentinelle admise", () => {
    expect(EtatLotSchema.safeParse({ ...ENTREE, rang: 2 }).success).toBe(true);
    expect(EtatLotSchema.safeParse({ ...ENTREE, rang: 2, arret: "cap_reached" }).success).toBe(true);
    expect(EtatLotSchema.safeParse({ ...ENTREE, rang: 3 }).success).toBe(false);
    expect(EtatLotSchema.safeParse({ ...ENTREE, rang: -1 }).success).toBe(false);
    expect(EtatLotSchema.safeParse({ ...ENTREE, arret: "SENTINELLE_TEXTE" }).success).toBe(false);
    // Sentinelles de signal, de catégorie, de lieu, de jour et de candidat : aucun champ de plus n'est admis.
    for (const champ of ["signal", "category", "placeId", "jours", "candidats", "raison", "compteur", "nom"]) {
      expect(EtatLotSchema.safeParse({ ...ENTREE, [champ]: "SENTINELLE_SIGNAL_CATEGORIE_ChIJ_sentinelle" }).success, champ).toBe(false);
    }
  });
});
