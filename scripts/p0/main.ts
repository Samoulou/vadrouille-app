import { principal } from "./cli";

/**
 * Point d'entrée de `pnpm p0` (décision 0032, A3.4) :
 * `node --import ./scripts/p0/enregistrer.mjs scripts/p0/main.ts --brief edimbourg-1 [--variante a|b]`.
 * `--reel` sort toujours en erreur fermée `real_mode_unavailable` (P0a1 ne livre aucun chemin réel).
 */
process.exitCode = await principal(process.argv.slice(2), {
  stdout: (ligne) => process.stdout.write(`${ligne}\n`),
  stderr: (ligne) => process.stderr.write(`${ligne}\n`),
});
