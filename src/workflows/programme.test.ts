import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_RETRIES_PROGRAMME, RANG_ETAPE, RANG_PROGRAMME } from "@/server/config/generation";
import { EtatProgrammeSchema, type EtatProgramme } from "@/server/generation/etat";

const etapes = vi.hoisted(() => ({
  etapeProgrammeDebut: vi.fn(),
  etapeProgrammeEcriture: vi.fn(),
  etapeClotureProgramme: vi.fn(),
}));
vi.mock("@/server/generation/etapes-programme", () => etapes);

import { etapeClore, etapeDebut, etapeProgramme, generateProgramme } from "./programme";

const ENTREE: EtatProgramme = { generationRunId: "00000000-0000-4000-8000-000000000001", organizationId: "00000000-0000-4000-8000-000000000002", rang: 0 };
const avance = async (e: EtatProgramme): Promise<EtatProgramme> => ({ ...e, rang: e.rang + 1 });

describe("workflow generateProgramme (chaîne inversée ; décision 0136 § 2)", () => {
  beforeEach(() => {
    for (const f of Object.values(etapes)) f.mockReset().mockImplementation(avance);
    etapes.etapeClotureProgramme.mockImplementation(async (e: EtatProgramme) => ({ ...e, arret: "upstream_unavailable" }));
  });

  it("generateProgramme: rangs a = 1 et e = 2, RANG_ETAPE inchangé ; maxRetries de MAX_RETRIES_PROGRAMME", () => {
    expect(RANG_PROGRAMME).toEqual({ a: 1, e: 2 });
    expect(RANG_ETAPE).toEqual({ a: 1, l: 2, b: 3, c: 4, d: 5, e: 6 });
    expect(MAX_RETRIES_PROGRAMME).toEqual({ a: 2, e: 0 });
    expect(etapeDebut.maxRetries).toBe(MAX_RETRIES_PROGRAMME.a);
    expect(etapeProgramme.maxRetries).toBe(MAX_RETRIES_PROGRAMME.e);
    expect(etapeClore.maxRetries).toBe(0);
  });

  it("chaque étape porte la directive use step, le workflow use workflow, et aucun appel ne vient du pont", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/programme.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(3);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect(source).not.toMatch(/from "@\/(ai|research|grounding|server\/composition|server\/p0|server\/essai|prototype|adapters)/);
    expect([...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort()).toEqual(["@/server/generation/etapes-programme", "@/server/generation/etat"]);
  });

  it("enchaîne a puis e et rend l'état de e", async () => {
    const fin = await generateProgramme(ENTREE);
    expect(fin).toEqual({ ...ENTREE, rang: 2 });
    expect(etapes.etapeProgrammeDebut).toHaveBeenCalledWith(ENTREE);
    expect(etapes.etapeProgrammeEcriture).toHaveBeenCalledWith({ ...ENTREE, rang: 1 });
    expect(etapes.etapeClotureProgramme).not.toHaveBeenCalled();
  });

  it("s'arrête sur un code d'arrêt sans appeler l'étape suivante", async () => {
    etapes.etapeProgrammeDebut.mockImplementation(async (e: EtatProgramme) => ({ ...e, rang: 1, arret: "invalid_input" }));
    const fin = await generateProgramme(ENTREE);
    expect(fin.arret).toBe("invalid_input");
    expect(etapes.etapeProgrammeEcriture).not.toHaveBeenCalled();
    expect(etapes.etapeClotureProgramme).not.toHaveBeenCalled();
  });

  it("une erreur inattendue clôt l'exécution sur upstream_unavailable, sur le dernier état sérialisé", async () => {
    etapes.etapeProgrammeEcriture.mockRejectedValue(new Error("panne"));
    const fin = await generateProgramme(ENTREE);
    expect(etapes.etapeClotureProgramme).toHaveBeenCalledWith({ ...ENTREE, rang: 1 }, "upstream_unavailable");
    expect(fin.arret).toBe("upstream_unavailable");
  });

  it("état sérialisé strict : { generationRunId, organizationId, rang ≤ 2, arret? }, ni brief, ni récit, ni nom, ni placeId", () => {
    expect(EtatProgrammeSchema.safeParse({ ...ENTREE, rang: 2 }).success).toBe(true);
    expect(EtatProgrammeSchema.safeParse({ ...ENTREE, rang: 2, arret: "model_output_invalid" }).success).toBe(true);
    expect(EtatProgrammeSchema.safeParse({ ...ENTREE, rang: 3 }).success).toBe(false);
    expect(EtatProgrammeSchema.safeParse({ ...ENTREE, arret: "SENTINELLE_TEXTE" }).success).toBe(false);
    for (const champ of ["brief", "recit", "story", "placeId", "nom", "lieux", "programme", "tripId"]) {
      expect(EtatProgrammeSchema.safeParse({ ...ENTREE, [champ]: "SENTINELLE_ChIJ_sentinelle" }).success, champ).toBe(false);
    }
  });
});
