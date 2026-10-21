// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES, DECK_DECISIONS, PREFERENCE_REASONS } from "@/contracts/values";

/**
 * Migration du tri enregistré (B10a, décision 0112 § 3.3 et § 3.7) : les listes fermées des `CHECK` de
 * `preference_signals` et de `preference_prompts` sont exactement celles du contrat (`src/contracts/values.ts`) ; la
 * migration inverse ne supprime aucune donnée et ne rétablit pas le `UPDATE` de table sur les signaux.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const SQL = readFileSync(path.join(MIGRATIONS, "0014_tri_enregistre.sql"), "utf8");
const DOWN = readFileSync(path.join(MIGRATIONS, "0014_tri_enregistre.down.sql"), "utf8");

/** Valeurs de la première liste `IN (...)` qui suit `<colonne>" IN (` dans la contrainte nommée. */
function liste(contrainte: string, colonne: string): string[] {
  const debut = SQL.indexOf(`"${contrainte}" CHECK`);
  expect(debut, contrainte).toBeGreaterThan(-1);
  const valeurs = SQL.slice(debut).match(new RegExp(`"${colonne}" IN \\(([^)]*)\\)`));
  expect(valeurs, `${contrainte} ${colonne}`).not.toBeNull();
  return [...(valeurs?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1] ?? "");
}

describe("migration 0014 : listes fermées du tri enregistré", () => {
  it("catégories des signaux et des questions : exactement CATEGORIES", () => {
    expect(liste("preference_signals_category_check", "category")).toEqual([...CATEGORIES]);
    expect(liste("preference_prompts_category_check", "category")).toEqual([...CATEGORIES]);
  });

  it("raisons : exactement PREFERENCE_REASONS", () => {
    expect(liste("preference_signals_reason_check", "reason")).toEqual([...PREFERENCE_REASONS]);
  });

  it("décisions de carte des formes et du lieu : exactement DECK_DECISIONS", () => {
    expect(liste("preference_signals_form_check", "signal")).toEqual([...DECK_DECISIONS]);
    expect(liste("preference_signals_card_place_check", "signal")).toEqual([...DECK_DECISIONS]);
  });
});

describe("migration 0014 : droits et retour arrière", () => {
  it("le UPDATE de table de vadrouille_app sur preference_signals est retiré, seules les colonnes d'annulation sont accordées", () => {
    expect(SQL).toContain("REVOKE UPDATE ON public.preference_signals FROM vadrouille_app;");
    expect(SQL).toContain("GRANT UPDATE (status, previous_status, cancelled_at, cancel_request_id) ON public.preference_signals TO vadrouille_app;");
  });

  it("la migration inverse ne supprime rien et ne rétablit aucun UPDATE de table", () => {
    const instructions = DOWN.split("\n").filter((l) => !l.startsWith("--"));
    const texte = instructions.join("\n");
    expect(texte).not.toMatch(/\b(DROP|DELETE|TRUNCATE|UPDATE\s+public\.|ALTER\s+TABLE)\b/i);
    expect(texte).not.toMatch(/\bGRANT\b/i);
    expect(instructions.filter((l) => /^REVOKE /.test(l))).toHaveLength(4);
  });
});
