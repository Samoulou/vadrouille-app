// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CODES_ARRET } from "@/server/generation/raison-echec";

/**
 * Migration de création (B9b, décision 0081 B9-TL-6 (h)) : le `CHECK` de `generation_runs.stop_reason`, posé par la
 * migration seule (sa liste contient un code dont le texte finit comme un nom secret, refusé en littéral dans le
 * schéma TypeScript par le confinement), porte exactement les codes fermés de la conversion unique
 * (`src/server/generation/raison-echec.ts`).
 */
const SQL = readFileSync(path.join(process.cwd(), "db/migrations/0012_creation_voyage.sql"), "utf8");

function codesDuCheck(nom: string): string[] {
  const debut = SQL.indexOf(`"${nom}" CHECK`);
  expect(debut, nom).toBeGreaterThan(-1);
  const liste = SQL.slice(debut).match(/IN \(([^)]*)\)/);
  expect(liste, nom).not.toBeNull();
  return [...(liste?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1] ?? "");
}

describe("migration 0012 : codes fermés de stop_reason", () => {
  it("le CHECK de stop_reason est exactement CODES_ARRET", () => {
    const codes = codesDuCheck("generation_runs_stop_reason_check");
    expect(new Set(codes).size).toBe(codes.length);
    expect([...codes].sort()).toEqual([...CODES_ARRET].sort());
  });

  it("le CHECK de phase porte les cinq phases publiées", () => {
    expect(codesDuCheck("generation_runs_phase_check").sort()).toEqual(["failed", "incomplete", "preparing", "queued", "ready"]);
  });
});
