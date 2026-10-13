import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Spécification B1 : ni mot de passe littéral ni chaîne de connexion dans l'amorçage ni dans les migrations. */

/** Motifs lus dans `donnees/motifs-secrets.json` : le mot-clé SQL des mots de passe y est écrit (spécification P0c, section 5). */
const MOTIFS = (
  JSON.parse(readFileSync(new URL("./donnees/motifs-secrets.json", import.meta.url), "utf8")) as { motifs: { refus: string; regex: string }[] }
).motifs.map(({ refus, regex }) => ({ refus, motif: new RegExp(regex, "i") }));

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("amorçage: aucun secret dans le dépôt", () => {
  it("db/bootstrap/ et db/migrations/ ne contiennent ni mot de passe littéral ni chaîne postgres://…@", () => {
    expect(MOTIFS).toHaveLength(2);
    const files = [...filesUnder("db/bootstrap"), ...filesUnder("db/migrations")];
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (const { refus, motif } of MOTIFS) expect(text, `${file} : ${refus}`).not.toMatch(motif);
    }
  });
});
