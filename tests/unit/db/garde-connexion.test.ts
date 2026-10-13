// @vitest-environment node
import { randomUUID } from "node:crypto";

import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  assertDatabaseAllowed,
  connectionStringFor,
  createGuardedPool,
  DatabaseConnectionError,
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
    await expect(verifyConnectionRole(fake(as("neondb_owner", { rolbypassrls: true })), "vadrouille_app")).rejects.toThrow(
      /rôle de session n'est pas « vadrouille_app »/,
    );
    await expect(verifyConnectionRole(fake(undefined), "vadrouille_app")).rejects.toThrow(DatabaseGuardError);
    await expect(verifyConnectionRole(fake(as("vadrouille_auth")), "vadrouille_auth")).resolves.toBeUndefined();
  });

  it("refuse une session administrateur qui a pris le rôle attendu (SET ROLE, options=-c role=…) : session_user compte", async () => {
    // Le rôle de session est neondb_owner (BYPASSRLS) ; current_user vaut le rôle attendu.
    const switched = as("neondb_owner", { current_user: "vadrouille_app", rolbypassrls: true });
    await expect(verifyConnectionRole(fake(switched), "vadrouille_app")).rejects.toThrow(/rôle de session n'est pas « vadrouille_app »/);
    // Même sans attribut d'administration, un rôle de session différent est refusé.
    await expect(verifyConnectionRole(fake(as("vadrouille_auth", { current_user: "vadrouille_app" })), "vadrouille_app")).rejects.toThrow(
      DatabaseGuardError,
    );
    // Rôle de session attendu mais rôle courant changé : refusé aussi.
    await expect(verifyConnectionRole(fake(as("vadrouille_app", { current_user: "vadrouille_share" })), "vadrouille_app")).rejects.toThrow(
      /rôle courant n'est pas « vadrouille_app »/,
    );
  });

  it("le message de refus ne nomme que le rôle attendu, jamais le rôle reçu (compte d'administration mal posé)", async () => {
    for (const row of [
      as("neondb_owner", { rolbypassrls: true }),
      as("neondb_owner", { current_user: "vadrouille_app", rolbypassrls: true }),
      as("vadrouille_app", { current_user: "neondb_owner" }),
    ]) {
      const error = await verifyConnectionRole(fake(row), "vadrouille_app").then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DatabaseGuardError);
      expect((error as Error).message).not.toContain("neondb_owner");
      expect((error as Error).message).toContain("« vadrouille_app »");
    }
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

  it("une erreur transitoire du contrôle remonte emballée (code seul), et la demande suivante refait le contrôle", async () => {
    const transient = Object.assign(new Error(`Connection terminated unexpectedly (${UNREACHABLE})`), { code: "ECONNRESET" });
    simulate(async () => {
      throw transient;
    }, VALID);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      const error = await pool.connect().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DatabaseConnectionError);
      expect(error).toMatchObject({ code: "ECONNRESET" });
      expect((error as Error).message).not.toContain(PASSWORD);
      expect((error as Error).message).not.toContain("127.0.0.1");
      expect((error as Error).cause).toBeUndefined();
      const client = await pool.connect();
      client.release();
    } finally {
      await pool.end();
    }
  });

  it("une erreur d'ouverture de pg (adresse et mot de passe dans le message) remonte sans l'adresse ni le mot de passe", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation((async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:1 ${UNREACHABLE}`), { code: "ECONNREFUSED" });
    }) as never);
    vi.spyOn(pg.Client.prototype, "end").mockImplementation((async () => undefined) as never);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      const error = await pool.query("SELECT 1").then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DatabaseConnectionError);
      expect(error).toMatchObject({ code: "ECONNREFUSED" });
      for (const secret of [PASSWORD, "127.0.0.1", "utilisateur", "postgres://"]) {
        expect((error as Error).message, secret).not.toContain(secret);
      }
    } finally {
      await pool.end();
    }
  });

  it("une erreur sans code utilisable devient « inconnu »", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation((async () => {
      throw Object.assign(new Error(UNREACHABLE), { code: `x ${PASSWORD}` });
    }) as never);
    vi.spyOn(pg.Client.prototype, "end").mockImplementation((async () => undefined) as never);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      const error = await pool.connect().then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toMatchObject({ name: "DatabaseConnectionError", code: "inconnu" });
      expect((error as Error).message).not.toContain(PASSWORD);
    } finally {
      await pool.end();
    }
  });

  it("une connexion inactive qui tombe (évènement error du pool) ne fait pas tomber le processus et n'est journalisée que par son code", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const pool = createGuardedPool("vadrouille_app", env);
    try {
      expect(pool.listenerCount("error")).toBeGreaterThan(0);
      const idle = Object.assign(new Error(`Connection terminated unexpectedly ${UNREACHABLE} 127.0.0.1:1`), { code: "57P01" });
      // Sans écouteur, EventEmitter#emit("error") lèverait l'erreur (exception non interceptée dans un vrai processus).
      expect(() => pool.emit("error", idle, new pg.Client())).not.toThrow();
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = warn.mock.calls.flat().map(String).join(" ");
      expect(logged).toContain("code 57P01");
      for (const secret of [PASSWORD, "127.0.0.1", "utilisateur", "postgres://", "terminated"]) {
        expect(logged, secret).not.toContain(secret);
      }
    } finally {
      await pool.end();
    }
  });

  it("une erreur d'ouverture des migrations remonte sans l'adresse ni le mot de passe", async () => {
    vi.spyOn(pg.Client.prototype, "connect").mockImplementation((async () => {
      throw Object.assign(new Error(`connect ECONNREFUSED 127.0.0.1:1 ${UNREACHABLE}`), { code: "ECONNREFUSED" });
    }) as never);
    vi.spyOn(pg.Client.prototype, "end").mockImplementation((async () => undefined) as never);
    const error = await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: UNREACHABLE }, []).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseConnectionError);
    expect(error).toMatchObject({ code: "ECONNREFUSED" });
    for (const secret of [PASSWORD, "127.0.0.1", "utilisateur", "postgres://"]) {
      expect((error as Error).message, secret).not.toContain(secret);
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
