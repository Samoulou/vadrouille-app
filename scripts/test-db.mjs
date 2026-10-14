// `pnpm test:db` (spécification B1 ; décision 0036, B1-TL-1).
//
// Lance le projet Vitest des tests de base (`vitest.db.config.mts`). Sans base joignable, il échoue avec un message
// explicite (tests/db/global-setup.ts) ; il n'est jamais ignoré en silence (décision 0006, convention 6).
// Seule exception : `SKIP_DB_TESTS=1` posé EXPLICITEMENT, pour les sessions sans Docker ; un avertissement est
// affiché et la commande réussit. En CI (`CI` ou `GITHUB_ACTIONS` posée), cette variable est refusée.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

const skip = process.env.SKIP_DB_TESTS;
const inCi = Boolean(process.env.CI || process.env.GITHUB_ACTIONS);

if (skip !== undefined && skip !== "") {
  if (skip !== "1") {
    console.error(`pnpm test:db : SKIP_DB_TESTS vaut « ${skip} » ; seule la valeur 1 est admise.`);
    process.exit(1);
  }
  if (inCi) {
    console.error("pnpm test:db : SKIP_DB_TESTS est interdite en CI : les tests de base y font foi (décision B1-PO-1).");
    process.exit(1);
  }
  console.warn(
    "AVERTISSEMENT pnpm test:db : tests de base NON EXÉCUTÉS (SKIP_DB_TESTS=1). Ils font foi en CI, job « db » ; " +
      "ne déclare jamais un test de base vert sans ce job (décision B1-PO-1).",
  );
  process.exit(0);
}

// B3a (décisions 0050, « Acceptation par le Tech Lead de 0051 », point 4, et 0051, point 6.4.4) : le secret du limiteur
// des tests de base est tiré au hasard à chaque exécution et posé dans le seul environnement du processus Vitest ; il
// n'est ni écrit sur disque, ni journalisé, ni écrit dans `$GITHUB_ENV` (aucun workflow ne tire de secret de B3).
const result = spawnSync("pnpm", ["exec", "vitest", "run", "--config", "vitest.db.config.mts", ...process.argv.slice(2)], {
  stdio: "inherit",
  env: { ...process.env, RATE_LIMIT_HMAC_SECRET: randomBytes(32).toString("base64url") },
});
process.exit(result.status ?? 1);
