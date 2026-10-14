// Démarre le serveur autonome produit par `next build` (output: "standalone"),
// comme dans l'image Docker : copie des fichiers statiques puis `node server.js`.
// Si `E2E_SERVER_LOG` est posé (tests Playwright), la sortie standard et la sortie d'erreur du serveur sont
// aussi recopiées dans ce fichier, vidé au démarrage, que les tests relisent (spécification F8).
// B3a (spécification B3, B3a point 3) : le serveur reçoit un environnement explicite, celui de ce processus moins
// les deux variables d'outillage de la base, que `register()` refuserait (décision 0050, B3-TL-1 point 4).
import { spawn } from "node:child_process";
import { closeSync, cpSync, existsSync, openSync, writeSync } from "node:fs";
import { join } from "node:path";

import { SERVER_LOG_ENV } from "./e2e-server-log.mjs";

const root = process.cwd();
const standalone = join(root, ".next", "standalone");

if (!existsSync(join(standalone, "server.js"))) {
  console.error("Build autonome introuvable : lance `pnpm build` d'abord.");
  process.exit(1);
}

cpSync(join(root, ".next", "static"), join(standalone, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) {
  cpSync(join(root, "public"), join(standalone, "public"), { recursive: true });
}

// Environnement du serveur : copie de celui de ce processus, sans `VADROUILLE_DATABASE_URL_MIGRATOR` (écrite dans
// `$GITHUB_ENV` par `scripts/ci/db-setup.sh`) ni `VADROUILLE_DB_ADMIN_URL` (posée pour l'étape `pnpm verify`).
// Test : `tests/unit/server-env-config.test.ts`.
const serverEnv = { ...process.env };
delete serverEnv.VADROUILLE_DATABASE_URL_MIGRATOR;
delete serverEnv.VADROUILLE_DB_ADMIN_URL;

const logPath = process.env[SERVER_LOG_ENV];
const log = logPath ? openSync(logPath, "w") : null;
const server = spawn(process.execPath, ["server.js"], {
  cwd: standalone,
  env: serverEnv,
  stdio: log === null ? "inherit" : ["inherit", "pipe", "pipe"],
});
if (log !== null) {
  // Écriture synchrone : chaque morceau est dans le fichier dès sa réception.
  for (const [stream, target] of [
    [server.stdout, process.stdout],
    [server.stderr, process.stderr],
  ]) {
    stream.on("data", (chunk) => {
      writeSync(log, chunk);
      target.write(chunk);
    });
  }
}
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => {
  if (log !== null) closeSync(log);
  process.exit(code ?? 0);
});
