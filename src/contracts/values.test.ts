// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import * as contracts from "./index";
import { CATEGORIES, DETOUR_THRESHOLD_MINUTES, PREFERENCE_REASONS, WEEKDAYS, mapPointKey, requireWeekday, weekdayOf } from "./values";

/** T4, décision 0016 § 3.1 règle 1 (Q95) : valeurs des contrats sans Zod, schémas qui en dérivent. */
describe("src/contracts/values.ts", () => {
  it("n'importe aucune valeur : seuls des import type, effacés à la compilation", () => {
    const source = readFileSync(join(process.cwd(), "src/contracts/values.ts"), "utf8");
    const imports = source.split("\n").filter((line) => /^\s*(import|export)\b.*\bfrom\s+["']/.test(line));
    expect(imports.every((line) => /^\s*import type\b/.test(line)), imports.join("\n")).toBe(true);
    expect(source).not.toMatch(/["']zod(\/[a-z]+)?["']/);
  });

  it("les schémas dérivent des valeurs : aucune seconde copie", () => {
    expect(contracts.CategorySchema.options).toEqual([...CATEGORIES]);
    expect(contracts.PreferenceReasonSchema.options).toEqual([...PREFERENCE_REASONS]);
    expect(contracts.WeekdaySchema.options).toEqual([...WEEKDAYS]);
  });

  it("l'index réexporte les valeurs : le code serveur ne change pas", () => {
    expect(contracts.mapPointKey).toBe(mapPointKey);
    expect(contracts.DETOUR_THRESHOLD_MINUTES).toBe(DETOUR_THRESHOLD_MINUTES);
    expect(contracts.CATEGORIES).toBe(CATEGORIES);
    expect(contracts.PREFERENCE_REASONS).toBe(PREFERENCE_REASONS);
  });

  it("mapPointKey : « stop:<id> » ou « terminus:<role> »", () => {
    expect(mapPointKey({ type: "stop", stopId: "j2-musee" })).toBe("stop:j2-musee");
    expect(mapPointKey({ type: "terminus", role: "end" })).toBe("terminus:end");
  });

  it("le seuil de détour reste à 20 minutes (cadrage § 3.7)", () => {
    expect(DETOUR_THRESHOLD_MINUTES).toBe(20);
  });

  it("weekdayOf : seul calcul du jour abrégé, en UTC ; null si la date est illisible (B2, E1)", () => {
    expect(weekdayOf("2026-08-29")).toBe("sam.");
    expect(weekdayOf("2026-08-30")).toBe("dim.");
    expect(weekdayOf("2026-08-31")).toBe("lun.");
    expect(weekdayOf("2026-09-01")).toBe("mar.");
    for (const illisible of ["", "inconnue", "2026-13-01", "29.08.2026"]) expect(weekdayOf(illisible)).toBeNull();
    expect(requireWeekday("2026-09-01")).toBe("mar.");
    expect(() => requireWeekday("inconnue")).toThrow(RangeError);
  });
});
