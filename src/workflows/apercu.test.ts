import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { etapeAncrage, etapeBrief, etapeClore, etapeLogement, etapeNotation, etapePlanification, etapeRecherche } from "./apercu";

describe("workflow 1 : generatePreview", () => {
  it("maxRetries : 2 pour a, 0 pour l, b, c, d, e et la clôture (une étape rejouée repaierait ses appels)", () => {
    expect(etapeBrief.maxRetries).toBe(2);
    for (const etape of [etapeLogement, etapeRecherche, etapeAncrage, etapeNotation, etapePlanification, etapeClore]) expect(etape.maxRetries).toBe(0);
  });

  it("chaque étape porte la directive use step, le workflow use workflow, et aucun appel ne vient du pont", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/apercu.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(7);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect(source).not.toMatch(/from "@\/(ai|research|grounding)/);
  });
});
