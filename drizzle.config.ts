import { defineConfig } from "drizzle-kit";

/**
 * Génération des migrations SQL (décision 0006) : `pnpm db:generate`, puis relecture et compléments à la main
 * (rôles, politiques, fonctions, vues, déclencheurs). `drizzle-kit push` n'est jamais utilisé. Aucune connexion :
 * la génération compare le schéma à l'instantané de `db/migrations/meta/`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema/index.ts",
  out: "./db/migrations",
});
