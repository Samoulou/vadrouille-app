// @vitest-environment node
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

/**
 * `pnpm test:db` n'est jamais ignoré en silence (décision 0006, convention 6 ; spécification B1) : sans base
 * joignable, il échoue avec un message explicite ; `SKIP_DB_TESTS=1` n'est admise qu'explicitement et hors CI
 * (décision 0036, B1-TL-1). L'adresse injoignable est construite à l'exécution, avec un mot de passe aléatoire : aucune
 * chaîne de connexion n'est écrite dans le dépôt.
 */
const PASSWORD = randomUUID();
const UNREACHABLE = (() => {
  const url = new URL("postgres://127.0.0.1:1/vadrouille");
  url.username = "vadrouille_app";
  url.password = PASSWORD;
  return url.href;
})();

/**
 * Environnement minimal du sous-processus : `PATH` et `HOME` seulement, plus les variables du cas. Rien d'autre de
 * l'environnement du test n'est transmis (ni `CI`, ni `GITHUB_ACTIONS`, ni `SKIP_DB_TESTS`, ni aucune clé).
 */
function run(extra: Record<string, string | undefined>) {
  const env: Record<string, string | undefined> = { PATH: process.env.PATH, HOME: process.env.HOME };
  Object.assign(env, {
    VADROUILLE_DATABASE_URL: UNREACHABLE,
    VADROUILLE_DATABASE_URL_AUTH: UNREACHABLE,
    VADROUILLE_DATABASE_URL_MIGRATOR: UNREACHABLE,
    VADROUILLE_DB_ADMIN_URL: UNREACHABLE,
    ...extra,
  });
  const result = spawnSync("node", ["scripts/test-db.mjs"], { env: env as NodeJS.ProcessEnv, encoding: "utf8", timeout: 90_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

describe("pnpm test:db sans base", () => {
  it("adresse injoignable : code de sortie non nul, message explicite, aucun secret", () => {
    const { status, output } = run({});
    expect(status).not.toBe(0);
    expect(output).toContain("base de test injoignable");
    expect(output).not.toContain(PASSWORD);
  }, 90_000);

  it("variables absentes : échec explicite", () => {
    const { status, output } = run({ VADROUILLE_DB_ADMIN_URL: undefined, VADROUILLE_DATABASE_URL: "" });
    expect(status).not.toBe(0);
    expect(output).toContain("base de test non configurée");
  }, 90_000);

  it("SKIP_DB_TESTS=1 explicite hors CI : avertissement visible et succès ; refusée en CI ; autre valeur refusée", () => {
    const skipped = run({ SKIP_DB_TESTS: "1" });
    expect(skipped.status).toBe(0);
    expect(skipped.output).toContain("NON EXÉCUTÉS");
    expect(run({ SKIP_DB_TESTS: "1", CI: "true" }).status).toBe(1);
    expect(run({ SKIP_DB_TESTS: "1", GITHUB_ACTIONS: "true" }).status).toBe(1);
    expect(run({ SKIP_DB_TESTS: "true" }).status).toBe(1);
  });
});
