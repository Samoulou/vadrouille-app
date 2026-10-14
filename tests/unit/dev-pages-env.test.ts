// @vitest-environment node
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { indentOf, workflowSteps } from "../support/workflow-steps";

/**
 * Configuration versionnée et drapeaux d'ouverture (décision 0017 § 11.0 et § 11.3, F8b ; amende 0020 § 2.3) :
 * aucun fichier de configuration de déploiement ne pose `VADROUILLE_DEV_PAGES`, `VADROUILLE_DEMO_AUTH` ni
 * `VADROUILLE_DEMO_PAYMENT`, hors une exception unique et bornée : l'étape « Gardes fermées malgré les drapeaux »
 * du job `docker` de `.github/workflows/ci.yml`, qui vérifie la fermeture. Lecture par lignes, sans dépendance.
 */

const ROOT = process.cwd();

export const OPENING_FLAGS = ["VADROUILLE_DEV_PAGES", "VADROUILLE_DEMO_AUTH", "VADROUILLE_DEMO_PAYMENT"] as const;
const CI_FILE = ".github/workflows/ci.yml";
const GUARD_JOB = "docker";
const GUARD_STEP = "Gardes fermées malgré les drapeaux";

/** Ce que chaque drapeau ouvrirait sans la garde : l'étape doit y attendre un 404 (0017 § 11.3). */
const EXPECTED_404: Record<(typeof OPENING_FLAGS)[number], RegExp[]> = {
  VADROUILLE_DEV_PAGES: [/\/dev\/voyages\/nouveau\/logement\)" = "404"/, /-X POST .*\/dev\/api\/simulation\)" = "404"/],
  VADROUILLE_DEMO_AUTH: [/\/dev\/voyages\/nouveau\/logement\)" = "404"/, /-X POST .*\/dev\/api\/simulation\)" = "404"/],
  VADROUILLE_DEMO_PAYMENT: [/\/debloquer\)" = "404"/],
};

/** Une ligne qui nomme un drapeau d'ouverture et qui n'entre pas dans l'exception : `chemin:ligne`. */
export function flagOffenders(path: string, content: string): string[] {
  const lines = content.split("\n");
  const allowed = new Set<number>();
  if (path === CI_FILE) {
    for (const step of workflowSteps(content)) {
      if (step.job !== GUARD_JOB || step.name !== GUARD_STEP) continue;
      // Ni clé `env:` ni `export` : le drapeau n'atteint que le conteneur vérifié.
      const stepIndent = indentOf(step.lines[0] ?? "");
      if (step.lines.some((line) => /^\s*env:/.test(line) && indentOf(line) === stepIndent + 2)) continue;
      if (step.lines.some((line) => /(^|[\s;&|])export\s/.test(line.replace(/#.*$/, "")))) continue;
      const body = step.lines.join("\n");
      step.lines.forEach((line, offset) => {
        const names = OPENING_FLAGS.filter((flag) => line.includes(flag));
        if (names.length === 0) return;
        if (!/^\s*docker run .*\bapp:ci\s*$/.test(line)) return;
        const forms = names.every((flag) => {
          const occurrences = line.split(flag).length - 1;
          const exact = (line.match(new RegExp(`(?<=\\s)-e ${flag}=1(?=\\s)`, "g")) ?? []).length;
          return occurrences === exact;
        });
        const checked = names.every((flag) => EXPECTED_404[flag].every((pattern) => pattern.test(body)));
        if (forms && checked) allowed.add(step.start + offset);
      });
    }
  }
  return lines.flatMap((line, index) =>
    OPENING_FLAGS.some((flag) => line.includes(flag)) && !allowed.has(index + 1) ? [`${path}:${index + 1}`] : [],
  );
}

const tracked = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
const configs = tracked.filter((path) => {
  const name = path.split("/").pop() ?? "";
  return (
    path === "Dockerfile" ||
    path === "vercel.json" ||
    /^\.env/.test(name) ||
    path.startsWith(".github/workflows/") ||
    /^(docker-)?compose.*\.ya?ml$/.test(name) ||
    /^next\.config\./.test(path)
  );
});

describe("configuration versionnée : drapeaux d'ouverture (décision 0017 § 11.3)", () => {
  it("lit le Dockerfile, les workflows, les .env suivis, les fichiers compose et next.config", () => {
    expect(configs).toEqual(expect.arrayContaining(["Dockerfile", CI_FILE, ".env.example", "next.config.ts"]));
  });

  it("aucun fichier ne pose un drapeau d'ouverture, hors l'étape « Gardes fermées malgré les drapeaux »", () => {
    expect(configs.flatMap((path) => flagOffenders(path, readFileSync(join(ROOT, path), "utf8")))).toEqual([]);
  });

  it("l'étape existe dans le job docker et passe les trois drapeaux à un conteneur de l'image", () => {
    const steps = workflowSteps(readFileSync(join(ROOT, CI_FILE), "utf8")).filter((step) => step.name === GUARD_STEP);
    expect(steps.map((step) => step.job)).toEqual([GUARD_JOB]);
    const run = steps[0]?.lines.find((line) => /^\s*docker run /.test(line)) ?? "";
    for (const flag of OPENING_FLAGS) expect(run).toContain(`-e ${flag}=1 `);
  });

  it("l'étape finale du Dockerfile pose VADROUILLE_ENV=production (après le dernier FROM)", () => {
    const dockerfile = readFileSync(join(ROOT, "Dockerfile"), "utf8").split("\n");
    const lastFrom = dockerfile.map((line) => /^FROM\s/i.test(line)).lastIndexOf(true);
    expect(lastFrom).toBeGreaterThanOrEqual(0);
    expect(dockerfile.slice(lastFrom).join("\n")).toMatch(/VADROUILLE_ENV=production/);
  });

  it("playwright.config.ts pose la connexion simulée et les pages de développement pour les tests seulement", () => {
    const config = readFileSync(join(ROOT, "playwright.config.ts"), "utf8");
    expect(config).toMatch(/VADROUILLE_DEMO_AUTH: "1"/);
    expect(config).toMatch(/VADROUILLE_DEV_PAGES: "1"/);
  });

  it("aucun drapeau d'ouverture n'a de préfixe NEXT_PUBLIC_", () => {
    const sources = tracked.filter((path) => /^(src|scripts)\/.*\.(tsx?|mjs)$/.test(path) || configs.includes(path));
    for (const path of sources) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).not.toMatch(/NEXT_PUBLIC_VADROUILLE_(DEV_PAGES|DEMO_)/);
    }
  });
});

describe("exception bornée : cas propres (décision 0017 § 11.3)", () => {
  const step = (lines: string[], { job = "docker", name = GUARD_STEP } = {}) =>
    [
      "name: CI",
      "jobs:",
      "  verify:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: echo verify",
      `  ${job}:`,
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: docker build -t app:ci .",
      "      - if: steps.diff.outputs.code == 'true'",
      `        name: ${name}`,
      ...lines,
    ].join("\n");
  const RUN = "          docker run -d --name app-drapeau -p 3001:3000 -e VADROUILLE_DEV_PAGES=1 -e VADROUILLE_DEMO_AUTH=1 -e VADROUILLE_DEMO_PAYMENT=1 app:ci";
  const CHECKS = [
    `          test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/dev/voyages/nouveau/logement)" = "404"`,
    `          test "$(curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{}' http://127.0.0.1:3001/dev/api/simulation)" = "404"`,
    `          test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3001/voyages/mock_trip_edimbourg/debloquer)" = "404"`,
  ];
  const conforming = ["        run: |", RUN, ...CHECKS];

  it("l'étape conforme passe", () => {
    expect(flagOffenders(CI_FILE, step(conforming))).toEqual([]);
  });

  it("la même étape dans un autre job échoue", () => {
    expect(flagOffenders(CI_FILE, step(conforming, { job: "verify2" }))).toHaveLength(1);
  });

  it("une étape d'un autre nom échoue", () => {
    expect(flagOffenders(CI_FILE, step(conforming, { name: "Gardes fermées" }))).toHaveLength(1);
  });

  it("la même étape dans un autre fichier échoue", () => {
    expect(flagOffenders(".github/workflows/release.yml", step(conforming))).toHaveLength(1);
  });

  it("une clé env: dans l'étape échoue, même sans le drapeau dedans", () => {
    expect(flagOffenders(CI_FILE, step(["        env:", "          A: b", ...conforming]))).toHaveLength(1);
    expect(flagOffenders(CI_FILE, step(["        env:", "          VADROUILLE_DEV_PAGES: \"1\"", ...conforming]))).toHaveLength(2);
  });

  it("un export dans l'étape échoue", () => {
    expect(flagOffenders(CI_FILE, step([...conforming, "          export VADROUILLE_DEMO_AUTH=1"]))).toHaveLength(2);
  });

  it("une valeur autre que 1, ou une autre forme que -e NOM=1, échoue", () => {
    expect(flagOffenders(CI_FILE, step(["        run: |", RUN.replace("VADROUILLE_DEMO_AUTH=1", "VADROUILLE_DEMO_AUTH=true"), ...CHECKS]))).toHaveLength(1);
    expect(flagOffenders(CI_FILE, step(["        run: |", RUN.replace("-e VADROUILLE_DEV_PAGES=1", "--env VADROUILLE_DEV_PAGES=1"), ...CHECKS]))).toHaveLength(1);
  });

  it("une commande docker run d'une autre image échoue", () => {
    expect(flagOffenders(CI_FILE, step(["        run: |", RUN.replace("app:ci", "autre:ci"), ...CHECKS]))).toHaveLength(1);
  });

  it("sans le 404 de ce que le drapeau ouvrirait, l'étape échoue", () => {
    expect(flagOffenders(CI_FILE, step(["        run: |", RUN, CHECKS[0] as string, CHECKS[2] as string]))).toHaveLength(1);
    expect(flagOffenders(CI_FILE, step(["        run: |", RUN, CHECKS[0] as string, CHECKS[1] as string]))).toHaveLength(1);
  });

  it("toute mention hors du job docker échoue (Dockerfile, .env)", () => {
    expect(flagOffenders("Dockerfile", "ENV VADROUILLE_DEMO_AUTH=1")).toEqual(["Dockerfile:1"]);
    expect(flagOffenders(".env.example", "# VADROUILLE_DEV_PAGES=1\nA=b")).toEqual([".env.example:1"]);
  });
});
