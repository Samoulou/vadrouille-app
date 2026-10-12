import { afterAll, describe, expect, it } from "vitest";

import { createGuardedPool, DatabaseGuardError } from "../../db/connection";
import { createDatabase } from "../../db/index";
import { runMigrations } from "../../db/migrate";
import { closeAll, DB_ENV, urlFor } from "./helpers";

/**
 * Garde de connexion de `db/` (spécification B1, décision B1-PO-6) et migrations idempotentes. Le refus d'un
 * déploiement de production (décision 0034) est testé sans base dans `tests/unit/db/`.
 */

afterAll(closeAll);

/** Mot de passe et chaîne de connexion d'une adresse, à ne jamais retrouver dans un message. */
function secretsOf(url: string): string[] {
  const parsed = new URL(url);
  return [url, parsed.password, decodeURIComponent(parsed.password)].filter((s) => s.length > 0);
}

async function refusal(role: "vadrouille_app" | "vadrouille_auth", url: string): Promise<Error> {
  const pool = createGuardedPool(role, { [role === "vadrouille_app" ? DB_ENV.app : DB_ENV.auth]: url });
  try {
    await pool.query("SELECT 1");
    throw new Error("connexion acceptée");
  } catch (error) {
    // Refus permanent : la demande suivante est refusée aussi, sans nouvelle tentative de connexion utile.
    await expect(pool.query("SELECT 1")).rejects.toBeInstanceOf(DatabaseGuardError);
    return error as Error;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

describe("connexion: la garde refuse un rôle administrateur", () => {
  it("un rôle qui a BYPASSRLS (superutilisateur du conteneur) est refusé avant toute requête, sans secret dans le message", async () => {
    const url = urlFor("admin");
    const error = await refusal("vadrouille_app", url);
    expect(error).toBeInstanceOf(DatabaseGuardError);
    for (const secret of secretsOf(url)) expect(error.message).not.toContain(secret);
    expect(error.message).not.toMatch(/postgres(ql)?:\/\//);
  });

  it("un rôle autre que celui attendu est refusé (identifiant des migrations, de l'authentification)", async () => {
    for (const [role, url] of [
      ["vadrouille_app", urlFor("migrator")],
      ["vadrouille_app", urlFor("auth")],
      ["vadrouille_auth", urlFor("app")],
    ] as const) {
      const error = await refusal(role, url);
      expect(error, `${role}`).toBeInstanceOf(DatabaseGuardError);
      expect(error.message).toContain(`au lieu de « ${role} »`);
      for (const secret of secretsOf(url)) expect(error.message).not.toContain(secret);
    }
  });

  it("le rôle attendu est accepté, par le pool comme par le client Drizzle", async () => {
    const pool = createGuardedPool("vadrouille_app", { [DB_ENV.app]: urlFor("app") });
    try {
      expect((await pool.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_app");
    } finally {
      await pool.end();
    }
    const db = createDatabase("vadrouille_auth", { [DB_ENV.auth]: urlFor("auth") });
    try {
      const result = await db.$client.query("SELECT current_user::text AS u");
      expect(result.rows[0].u).toBe("vadrouille_auth");
    } finally {
      await db.$client.end();
    }
  });
});

describe("migrations", () => {
  it("une seconde exécution ne fait rien", async () => {
    const report = await runMigrations({ [DB_ENV.migrator]: urlFor("migrator") });
    expect(report.applied).toEqual([]);
    expect(report.skipped.length).toBeGreaterThanOrEqual(2);
  });

  it("refusées sous un autre rôle que vadrouille_migrator", async () => {
    await expect(runMigrations({ [DB_ENV.migrator]: urlFor("app") })).rejects.toBeInstanceOf(DatabaseGuardError);
    await expect(runMigrations({ [DB_ENV.migrator]: urlFor("admin") })).rejects.toBeInstanceOf(DatabaseGuardError);
  });
});
