// Démarre le serveur autonome produit par `next build` (output: "standalone"),
// comme dans l'image Docker : copie des fichiers statiques puis `node server.js`.
import { spawn } from "node:child_process";
import { cpSync, existsSync } from "node:fs";
import { join } from "node:path";

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

const server = spawn(process.execPath, ["server.js"], { cwd: standalone, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
server.on("exit", (code) => process.exit(code ?? 0));
