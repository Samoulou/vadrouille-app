import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

/**
 * Tests de base (`pnpm test:db`, spécification B1) : projet Vitest distinct de `pnpm test`, qui reste exécutable
 * sans base. Les tests partagent une base Postgres réelle (conteneur `postgres:17.11` en CI) : fichiers en série.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // `server-only` lève une erreur hors du rendu serveur de Next.js ; les tests importent `db/` directement.
      "server-only": fileURLToPath(new URL("./tests/stubs/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/db/**/*.test.ts"],
    globalSetup: ["./tests/db/global-setup.ts"],
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
