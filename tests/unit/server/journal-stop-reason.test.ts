// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CODE_CLE_ABSENTE } from "@/ai/erreurs";
import { CODES_ARRET } from "@/server/generation/raison-echec";
import { formatLogLine } from "@/server/log";
import { CODES_ARRET_JOURNAL_SANS_CLE } from "@/server/log-codes-arret";

/** Champ `stopReason` du journal (`generation.full_stuck`) : liste fermée (décision 0113). */
describe("journal: stopReason en liste fermée (décision 0113)", () => {
  const TRIP = "0b6f3c7e-6a1e-4c55-9f2d-3c1a2b4d5e6f";
  const ligne = (stopReason: unknown) =>
    JSON.parse(formatLogLine("generation.full_stuck", { tripId: TRIP, stopReason } as object, "warn")) as Record<string, unknown>;

  it("la copie feuille plus CODE_CLE_ABSENTE = CODES_ARRET, sans doublon ; le code de clé absente n'y est pas écrit", () => {
    const admis = [...CODES_ARRET_JOURNAL_SANS_CLE, CODE_CLE_ABSENTE];
    expect([...admis].sort()).toEqual([...CODES_ARRET].sort());
    expect(new Set(admis).size).toBe(admis.length);
    expect(CODES_ARRET_JOURNAL_SANS_CLE as readonly string[]).not.toContain(CODE_CLE_ABSENTE);
    const source = readFileSync(path.join(process.cwd(), "src/server/log-codes-arret.ts"), "utf8");
    expect(source).not.toContain(`"${CODE_CLE_ABSENTE}"`);
  });

  it("module feuille : aucun import hors `server-only`", () => {
    const source = readFileSync(path.join(process.cwd(), "src/server/log-codes-arret.ts"), "utf8");
    const imports = [...source.matchAll(/(?:^|\n)\s*(?:import|export)\b[^;]*?from\s*["']([^"']+)["']|import\s*\(\s*["']([^"']+)["']|require\s*\(\s*["']([^"']+)["']|(?:^|\n)\s*import\s+["']([^"']+)["']/g)].map(
      (m) => m[1] ?? m[2] ?? m[3] ?? m[4],
    );
    expect(imports).toEqual(["server-only"]);
  });

  it("chaque code de CODES_ARRET passe, code de clé absente compris", () => {
    for (const code of CODES_ARRET) expect(ligne(code), code).toEqual({ level: "warn", event: "generation.full_stuck", tripId: TRIP, stopReason: code });
    expect(ligne(CODE_CLE_ABSENTE).stopReason).toBe(CODE_CLE_ABSENTE);
  });

  it.each([
    "colosseo",
    "fontana_di_trevi",
    "trattoria_da_enzo",
    "pantheon",
    "autre",
    "STEP_EXPIRED",
    "step_expired ",
    "x".repeat(40),
    "",
  ])("valeur hors liste %j : retirée et comptée, jamais écrite", (valeur) => {
    const sortie = ligne(valeur);
    expect(sortie).toEqual({ level: "warn", event: "generation.full_stuck", tripId: TRIP, dropped: 1 });
    expect(JSON.stringify(sortie)).not.toContain(valeur === "" ? "stopReason" : valeur);
  });

  it("valeur non textuelle : retirée", () => {
    for (const valeur of [42, null, ["step_expired"], { code: "step_expired" }]) expect(ligne(valeur)).not.toHaveProperty("stopReason");
  });
});
