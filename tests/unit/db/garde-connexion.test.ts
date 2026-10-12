// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  assertDatabaseAllowed,
  connectionStringFor,
  createGuardedPool,
  DatabaseGuardError,
  verifyConnectionRole,
} from "../../../db/connection";
import { runMigrations } from "../../../db/migrate";

/**
 * Gardes de `db/` sans base (spécification B1 ; décision 0034, « Garde préalable à toute fusion ») : en production,
 * aucune connexion n'est ouverte, avant même la lecture de la chaîne de connexion. Adresse injoignable (port 1) :
 * si la garde laissait passer, l'erreur serait une erreur réseau, pas DatabaseGuardError.
 */
const UNREACHABLE = "postgres://utilisateur:motdepasse-secret@127.0.0.1:1/base";

describe("db : refus en production (décision 0034)", () => {
  const PRODUCTION = [
    { VERCEL_ENV: "production" },
    { VERCEL_ENV: " Production " },
    { VADROUILLE_ENV: "production" },
    { VADROUILLE_ENV: "ci", VERCEL_ENV: "production" },
  ];

  it.each(PRODUCTION)("aucun pool applicatif avec %o", (env) => {
    const full = { ...env, VADROUILLE_DATABASE_URL: UNREACHABLE, VADROUILLE_DATABASE_URL_AUTH: UNREACHABLE };
    expect(() => createGuardedPool("vadrouille_app", full)).toThrow(DatabaseGuardError);
    expect(() => createGuardedPool("vadrouille_auth", full)).toThrow(/production/);
    expect(() => connectionStringFor("vadrouille_app", full)).toThrow(DatabaseGuardError);
  });

  it.each(PRODUCTION)("aucune migration avec %o", async (env) => {
    await expect(runMigrations({ ...env, VADROUILLE_DATABASE_URL_MIGRATOR: UNREACHABLE })).rejects.toThrow(DatabaseGuardError);
  });

  it("hors production, la garde laisse passer ; le message de refus ne contient jamais la chaîne de connexion", () => {
    expect(() => assertDatabaseAllowed({ VERCEL_ENV: "preview" })).not.toThrow();
    expect(() => assertDatabaseAllowed({})).not.toThrow();
    try {
      createGuardedPool("vadrouille_app", { VERCEL_ENV: "production", VADROUILLE_DATABASE_URL: UNREACHABLE });
    } catch (error) {
      expect((error as Error).message).not.toContain("motdepasse-secret");
      expect((error as Error).message).not.toContain("127.0.0.1");
    }
  });

  it("DATABASE_URL (posée par l'intégration Neon avec l'identifiant propriétaire) n'est jamais lue", () => {
    expect(() => connectionStringFor("vadrouille_app", { DATABASE_URL: UNREACHABLE })).toThrow(/VADROUILLE_DATABASE_URL/);
  });
});

describe("db : contrôle du rôle de connexion", () => {
  const fake = (row: Record<string, unknown> | undefined) => ({ query: async () => ({ rows: row ? [row] : [] }) });

  it("refuse un rôle attendu qui aurait BYPASSRLS ou SUPERUSER", async () => {
    await expect(verifyConnectionRole(fake({ current_user: "vadrouille_app", rolsuper: false, rolbypassrls: true }), "vadrouille_app")).rejects.toThrow(
      /BYPASSRLS/,
    );
    await expect(verifyConnectionRole(fake({ current_user: "vadrouille_app", rolsuper: true, rolbypassrls: false }), "vadrouille_app")).rejects.toThrow(
      DatabaseGuardError,
    );
  });

  it("refuse un autre rôle ; accepte le rôle attendu sans attribut d'administration", async () => {
    await expect(verifyConnectionRole(fake({ current_user: "neondb_owner", rolsuper: false, rolbypassrls: true }), "vadrouille_app")).rejects.toThrow(
      /neondb_owner/,
    );
    await expect(verifyConnectionRole(fake(undefined), "vadrouille_app")).rejects.toThrow(DatabaseGuardError);
    await expect(verifyConnectionRole(fake({ current_user: "vadrouille_auth", rolsuper: false, rolbypassrls: false }), "vadrouille_auth")).resolves.toBeUndefined();
  });

  it("variable absente : message explicite, sans valeur", () => {
    expect(() => connectionStringFor("vadrouille_auth", {})).toThrow(/VADROUILLE_DATABASE_URL_AUTH n'est pas posée/);
  });
});
