import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/** Spécification B1 : ni mot de passe littéral ni chaîne de connexion dans l'amorçage ni dans les migrations. */

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("amorçage: aucun secret dans le dépôt", () => {
  it("db/bootstrap/ et db/migrations/ ne contiennent ni PASSWORD '…' littéral ni chaîne postgres://…@", () => {
    const files = [...filesUnder("db/bootstrap"), ...filesUnder("db/migrations")];
    expect(files.length).toBeGreaterThan(2);
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toMatch(/PASSWORD\s+(E?'[^']*'|\$[A-Za-z_]*\$)/i);
      expect(text, file).not.toMatch(/postgres(ql)?:\/\/[^\s'"]*@/i);
    }
  });
});
