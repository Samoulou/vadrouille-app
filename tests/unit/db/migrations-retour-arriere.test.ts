// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Critère du handover § 12 (spécification B1) : chaque migration a sa migration inverse écrite et relue
 * (`db/migrations/<tag>.down.sql`), ou la mention « irréversible » avec sa raison dans `db/README.md`.
 */
const root = process.cwd();
const journal = JSON.parse(readFileSync(path.join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};
const readme = readFileSync(path.join(root, "db/README.md"), "utf8");

describe("migrations : retour arrière documenté", () => {
  it("le journal contient au moins les migrations de B1", () => {
    expect(journal.entries.map((entry) => entry.tag).slice(0, 2)).toEqual(["0000_socle", "0001_securite"]);
  });

  it.each(journal.entries.map((entry) => entry.tag))("%s : migration inverse ou « irréversible » motivée", (tag) => {
    if (existsSync(path.join(root, "db/migrations", `${tag}.down.sql`))) return;
    const row = readme.split("\n").find((line) => line.startsWith(`| \`${tag}\` |`));
    expect(row, `ligne de ${tag} absente du tableau de db/README.md`).toBeDefined();
    const cells = (row ?? "").split("|").map((cell) => cell.trim());
    expect(cells[2]).toBe("irréversible");
    expect((cells[3] ?? "").length, `raison de ${tag} trop courte`).toBeGreaterThan(40);
  });
});
