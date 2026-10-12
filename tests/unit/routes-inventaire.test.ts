import { readdirSync } from "node:fs";
import { join, sep } from "node:path";

import { describe, expect, it } from "vitest";

import { DEV_ROUTES, ROUTES } from "../e2e/routes";

/**
 * Inventaire des routes (F12-PO-13, critère C8, décision 0022 § 3) : chaque page de `src/app` hors `/dev` figure
 * dans `ROUTES`, et chaque entrée de `ROUTES` qui nomme un fichier pointe vers une page qui existe.
 * Règle d'inscription : tests/e2e/README.md.
 */

const APP = join(process.cwd(), "src", "app");

function appPages(): string[] {
  return readdirSync(APP, { recursive: true, encoding: "utf8" })
    .map((file) => file.split(sep).join("/"))
    .filter((file) => file === "page.tsx" || file.endsWith("/page.tsx"))
    .filter((file) => !file.startsWith("dev/"))
    .sort();
}

describe("inventaire des routes", () => {
  it("chaque page de src/app hors /dev est inscrite, et chaque entrée a son fichier", () => {
    const pages = appPages();
    const inscrites = ROUTES.flatMap((route) => (route.page ? [route.page] : []));

    const manquantes = pages.filter((page) => !inscrites.includes(page));
    const sansFichier = inscrites.filter((page) => !pages.includes(page));

    expect(manquantes, `pages absentes de tests/e2e/routes.ts : ${manquantes.join(", ")}`).toEqual([]);
    expect(sansFichier, `entrées de tests/e2e/routes.ts sans fichier sous src/app : ${sansFichier.join(", ")}`).toEqual([]);
    expect(pages.length).toBeGreaterThan(0);
  });

  it("une page n'est inscrite qu'une fois", () => {
    const inscrites = ROUTES.flatMap((route) => (route.page ? [route.page] : []));
    expect(inscrites.length).toBe(new Set(inscrites).size);
  });

  it("identifiants uniques, inventaire et pages de développement confondus", () => {
    const ids = [...ROUTES, ...DEV_ROUTES].map((route) => route.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("adresses : hors /dev pour l'inventaire, sous /dev pour les pages de développement", () => {
    for (const route of ROUTES) expect(route.path, route.id).toMatch(/^\/(?!dev(\/|$))/);
    for (const route of DEV_ROUTES) expect(route.path, route.id).toMatch(/^\/dev\//);
  });

  it("seule la page introuvable n'a pas de fichier, et elle attend un 404", () => {
    const sansPage = ROUTES.filter((route) => !route.page);
    expect(sansPage.map((route) => route.id)).toEqual(["R-introuvable"]);
    expect(sansPage[0]?.status).toBe(404);
  });

  it("un dépassement connu ne porte que sur une route soumise au seuil de JavaScript, et il est motivé", () => {
    for (const route of ROUTES.filter((entry) => entry.knownExceedance)) {
      expect(route.budgets.javascript, route.id).toBe("seuil");
      expect(route.knownExceedance?.reason, route.id).not.toBe("");
    }
  });

  it("budgets du § 14 et de F12-PO-2, F12-PO-4 : seuils sur R11, R12 (Lighthouse) et R11, R12, R6 (JavaScript)", () => {
    const seuil = (kind: "lighthouse" | "javascript") =>
      ROUTES.filter((route) => route.budgets[kind] === "seuil").map((route) => route.id).sort();
    expect(seuil("lighthouse")).toEqual(["R11", "R12"]);
    expect(seuil("javascript")).toEqual(expect.arrayContaining(["R11", "R12", "R6"]));
  });
});
