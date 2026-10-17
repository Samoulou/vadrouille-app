// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TYPES_CRENEAU } from "@/ai/candidat";

/**
 * Spécification B7, « Type de créneau » : `slot_fit` (sortie de `noter`, écrite par B9) prend ses valeurs dans
 * `TYPES_CRENEAU` de `src/ai`. Sous `tests/unit/`, seul endroit où un test peut lire `db/`.
 */
const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

describe("ia: types de créneau égaux au schéma", () => {
  it("TYPES_CRENEAU de src/ai est exactement la liste du CHECK candidates_slot_fit_check", () => {
    const schema = readFileSync(path.join(RACINE, "db/schema/business.ts"), "utf8");
    const ligne = schema.split("\n").find((l) => l.includes('"candidates_slot_fit_check"'));
    expect(ligne).toBeDefined();
    const liste = /ARRAY\[([^\]]*)\]/.exec(ligne ?? "")?.[1];
    expect(liste).toBeDefined();
    const valeurs = (liste ?? "").split(",").map((v) => v.trim().replace(/^'|'$/g, ""));
    expect(valeurs).toEqual([...TYPES_CRENEAU]);
  });
});
