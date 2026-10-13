import pg from "pg";

import { DB_ENV, type Login, readUrl } from "./env";

/**
 * Préalable de `pnpm test:db` (décision 0006, convention 6) : sans base joignable, les tests de base échouent avec
 * un message explicite ; ils ne sont jamais ignorés en silence. Le message ne contient aucune chaîne de connexion.
 */
export default async function globalSetup(): Promise<void> {
  const logins = Object.keys(DB_ENV) as Login[];
  const missing = logins.filter((login) => !readUrl(login)).map((login) => DB_ENV[login]);
  if (missing.length > 0) {
    throw new Error(
      `pnpm test:db : base de test non configurée (variables absentes : ${missing.join(", ")}). ` +
        "Les tests de base font foi en CI, job « db » (décision B1-PO-1) ; voir db/README.md.",
    );
  }
  for (const login of logins) {
    const name = DB_ENV[login];
    const client = new pg.Client({ connectionString: readUrl(login), connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
    } catch (error) {
      const code = (error as { code?: string }).code ?? "inconnu";
      throw new Error(
        `pnpm test:db : base de test injoignable (connexion « ${login} », variable ${name}, code ${code}). ` +
          "Démarre la base (docker compose up db), amorce les rôles et applique les migrations (db/README.md) ; en CI, job « db ».",
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  }
}
