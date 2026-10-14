// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest, { MANIFEST_ICONS } from "@/app/manifest";
import { PRODUCT_NAME } from "@/config/site";

import { nextConfig, RESPONSE_HEADERS } from "../../next.config";
import playwrightConfig from "../../playwright.config";

/**
 * Hors-ligne (spécification F10, F10b) : manifeste (C21, F10-TL-9), en-têtes du service worker (C26, F10-TL-8) et
 * blocage des service workers par défaut dans Playwright (F10-TL-6).
 */

const root = process.cwd();
const tokens = JSON.parse(readFileSync(join(root, "docs/design-system/tokens.json"), "utf8")) as {
  color: { tokens: { name: string; value: string }[] };
};
const css = readFileSync(join(root, "src/styles/globals.css"), "utf8");
const tokenValues = new Set(tokens.color.tokens.map((token) => token.value));

/** Largeur et hauteur d'un PNG (en-tête IHDR). */
function pngSize(file: string): { width: number; height: number } {
  const buffer = readFileSync(file);
  expect(buffer.subarray(1, 4).toString("ascii")).toBe("PNG");
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

describe("manifeste (C21, F10-PO-12)", () => {
  const value = manifest();

  it("nom de la configuration, fr, standalone, start_url /", () => {
    expect(value.name).toBe(PRODUCT_NAME);
    expect(value.short_name).toBe(PRODUCT_NAME);
    expect(value.lang).toBe("fr");
    expect(value.display).toBe("standalone");
    expect(value.start_url).toBe("/");
  });

  it("couleurs des tokens Ligne (fichier de tokens et globals.css)", () => {
    for (const color of [value.background_color, value.theme_color]) {
      expect(color).toBeDefined();
      expect(tokenValues.has(color!), color).toBe(true);
      expect(css).toContain(`: ${color};`);
    }
    const page = tokens.color.tokens.find((token) => token.name === "page")?.value;
    expect(value.background_color).toBe(page);
  });

  it("icônes de 192 et 512 px, fichiers présents à la bonne taille", () => {
    const sizes = (value.icons ?? []).map((icon) => icon.sizes);
    expect(sizes).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    for (const icon of MANIFEST_ICONS) {
      const file = join(root, "public", icon.src);
      expect(existsSync(file), icon.src).toBe(true);
      const [width, height] = icon.sizes.split("x").map(Number);
      expect(pngSize(file)).toEqual({ width, height });
    }
  });
});

describe("en-têtes du service worker (C26, F10-TL-8)", () => {
  it.each(["/sw.js", "/sw-route.js"])("%s : Cache-Control no-cache", async (source) => {
    expect(await nextConfig.headers?.()).toEqual(RESPONSE_HEADERS);
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === source);
    expect(rule?.headers).toEqual([{ key: "Cache-Control", value: "no-cache" }]);
  });
});

describe("en-têtes de la vue partagée (C39, F10-TL-8)", () => {
  it("/p/:path* : privé et no-store, référent réduit à l'origine, jamais indexé", async () => {
    expect(await nextConfig.headers?.()).toEqual(RESPONSE_HEADERS);
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === "/p/:path*");
    expect(rule?.headers).toEqual([
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
  });
});

describe("en-têtes du mode réel du prototype (P0r3b ; décision 0055, S-2 point 5)", () => {
  it("/prototype/:path* : privé et no-store, référent réduit à l'origine, jamais indexé", async () => {
    expect(await nextConfig.headers?.()).toEqual(RESPONSE_HEADERS);
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === "/prototype/:path*");
    expect(rule?.headers).toEqual([
      { key: "Cache-Control", value: "private, no-store" },
      { key: "Referrer-Policy", value: "strict-origin" },
      { key: "X-Robots-Tag", value: "noindex, nofollow" },
    ]);
  });
});

describe("Playwright : service workers bloqués par défaut (F10-TL-6)", () => {
  it("use.serviceWorkers vaut « block » au niveau global, sans projet supplémentaire", () => {
    expect(playwrightConfig.use?.serviceWorkers).toBe("block");
    // `prototype-cache` vient de P0b1 (décision 0032 § A6.6), pas de F10b.
    expect(playwrightConfig.projects?.map((project) => project.name)).toEqual(["e2e", "a11y", "visual", "prototype-cache", "perf"]);
  });

  it("seuls les tests du hors-ligne et le contrôle de persistance de la carte autorisent les service workers", () => {
    const allowed = [
      "tests/e2e/carte.e2e.spec.ts",
      "tests/e2e/hors-ligne.e2e.spec.ts",
      // F10c : bloc de C36 seulement (décision 0039, F10-TL-6 point 1).
      "tests/e2e/partage.e2e.spec.ts",
      "tests/e2e/voyage.a11y.spec.ts",
      "tests/visual/voyage.visual.spec.ts",
    ];
    const specs = ["tests/e2e", "tests/visual"].flatMap((dir) =>
      readdirSync(join(root, dir))
        .filter((file) => file.endsWith(".spec.ts"))
        .map((file) => `${dir}/${file}`),
    );
    const allowing = specs.filter((file) => readFileSync(join(root, file), "utf8").includes('serviceWorkers: "allow"'));
    expect(allowing.sort()).toEqual(allowed);
  });
});
