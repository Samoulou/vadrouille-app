// @vitest-environment node
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

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
 * si la garde laissait passer, l'erreur serait une erreur réseau, pas DatabaseGuardError. L'adresse est construite à
 * l'exécution, avec un mot de passe aléatoire : aucune chaîne de connexion n'est écrite dans le dépôt.
 */
const PASSWORD = randomUUID();
const UNREACHABLE = (() => {
  const url = new URL("postgres://127.0.0.1:1/base");
  url.username = "utilisateur";
  url.password = PASSWORD;
  return url.href;
})();

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
      expect((error as Error).message).not.toContain(PASSWORD);
      expect((error as Error).message).not.toContain("127.0.0.1");
    }
  });

  it("DATABASE_URL (posée par l'intégration Neon avec l'identifiant propriétaire) n'est jamais lue", () => {
    expect(() => connectionStringFor("vadrouille_app", { DATABASE_URL: UNREACHABLE })).toThrow(/VADROUILLE_DATABASE_URL/);
  });
});

describe("db : contrôle du rôle de connexion", () => {
  const fake = (row: Record<string, unknown> | undefined) => ({ query: async () => ({ rows: row ? [row] : [] }) });
  const as = (role: string, attributes: { rolsuper?: boolean; rolbypassrls?: boolean; current_user?: string } = {}) => ({
    session_user: role,
    current_user: attributes.current_user ?? role,
    rolsuper: attributes.rolsuper ?? false,
    rolbypassrls: attributes.rolbypassrls ?? false,
  });

  it("refuse un rôle attendu qui aurait BYPASSRLS ou SUPERUSER", async () => {
    await expect(verifyConnectionRole(fake(as("vadrouille_app", { rolbypassrls: true })), "vadrouille_app")).rejects.toThrow(/BYPASSRLS/);
    await expect(verifyConnectionRole(fake(as("vadrouille_app", { rolsuper: true })), "vadrouille_app")).rejects.toThrow(DatabaseGuardError);
  });

  it("refuse un autre rôle ; accepte le rôle attendu sans attribut d'administration", async () => {
    await expect(verifyConnectionRole(fake(as("neondb_owner", { rolbypassrls: true })), "vadrouille_app")).rejects.toThrow(/neondb_owner/);
    await expect(verifyConnectionRole(fake(undefined), "vadrouille_app")).rejects.toThrow(DatabaseGuardError);
    await expect(verifyConnectionRole(fake(as("vadrouille_auth")), "vadrouille_auth")).resolves.toBeUndefined();
  });

  it("refuse une session administrateur qui a pris le rôle attendu (SET ROLE, options=-c role=…) : session_user compte", async () => {
    // Le rôle de session est neondb_owner (BYPASSRLS) ; current_user vaut le rôle attendu.
    const switched = as("neondb_owner", { current_user: "vadrouille_app", rolbypassrls: true });
    await expect(verifyConnectionRole(fake(switched), "vadrouille_app")).rejects.toThrow(/neondb_owner \(rôle courant vadrouille_app\)/);
    // Même sans attribut d'administration, un rôle de session différent est refusé.
    await expect(verifyConnectionRole(fake(as("vadrouille_auth", { current_user: "vadrouille_app" })), "vadrouille_app")).rejects.toThrow(
      DatabaseGuardError,
    );
    // Rôle de session attendu mais rôle courant changé : refusé aussi.
    await expect(verifyConnectionRole(fake(as("vadrouille_app", { current_user: "vadrouille_share" })), "vadrouille_app")).rejects.toThrow(
      DatabaseGuardError,
    );
  });

  it("le contrôle lit les attributs du rôle de session, pas du rôle courant", async () => {
    let sql = "";
    await verifyConnectionRole({ query: async (text) => ((sql = text), { rows: [as("vadrouille_app")] }) }, "vadrouille_app");
    expect(sql).toContain("session_user");
    expect(sql).toMatch(/rolname = session_user/);
  });

  it("variable absente : message explicite, sans valeur", () => {
    expect(() => connectionStringFor("vadrouille_auth", {})).toThrow(/VADROUILLE_DATABASE_URL_AUTH n'est pas posée/);
  });
});

describe("db : refus définitif seulement pour un refus de fond", () => {
  const VALID = { current_user: "vadrouille_app", session_user: "vadrouille_app", rolsuper: false, rolbypassrls: false };
  const env = { VADROUILLE_DATABASE_URL: UNREACHABLE };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** Connexion simulée : `super.connect()` réussit sans réseau, le contrôle du rôle reçoit les réponses données. */
  function simulate(...answers: ((() => Promise<unknown>) | Record<string, unknown>)[]) {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation((async () => undefined) as never);
    vi.spyOn(pg.Client.prototype, "end").mockImplementation((async () => undefined) as never);
    const query = vi.spyOn(pg.Client.prototype, "query");
    for (const answer of answers) {
      query.mockImplementationOnce((typeof answer === "function" ? answer : async () => ({ rows: [answer] })) as never);
    }
    return query;
  }

  it("une erreur transitoire du contrôle remonte telle quelle, et la demande suivante refait le contrôle", async () => {
    const transient = Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" });
    simulate(async () => {
      throw transient;
    }, VALID);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      await expect(pool.connect()).rejects.toBe(transient);
      const client = await pool.connect();
      client.release();
    } finally {
      await pool.end();
    }
  });

  it("un refus de fond (rôle d'administration) est définitif, même si la connexion suivante passerait", async () => {
    const query = simulate({ ...VALID, rolbypassrls: true }, VALID);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      await expect(pool.connect()).rejects.toThrow(/BYPASSRLS/);
      await expect(pool.connect()).rejects.toBeInstanceOf(DatabaseGuardError);
      expect(query).toHaveBeenCalledTimes(1);
    } finally {
      await pool.end();
    }
  });
});
