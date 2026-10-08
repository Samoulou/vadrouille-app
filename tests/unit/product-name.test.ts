// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { PRODUCT_NAME } from "@/config/site";

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

describe("nom du produit", () => {
  it("n'apparaît que dans la constante de configuration", () => {
    const src = join(process.cwd(), "src");
    const offenders = files(src)
      .filter((path) => /\.(ts|tsx|json|css)$/.test(path))
      .filter((path) => readFileSync(path, "utf8").includes(PRODUCT_NAME))
      .map((path) => relative(process.cwd(), path));
    expect(offenders).toEqual(["src/config/site.ts"]);
  });
});
