// @vitest-environment node
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DatabaseConnectionError, DatabaseGuardError } from "../../../db/connection";
import { assertMigrationHostLocal, MIGRATION_LOCAL_HOSTS, runMigrations } from "../../../db/migrate";

/**
 * `migrations: db/migrate.ts refuse tout hôte non local` (décision 0056 § 2.8 et « Tests imposés ») : `pnpm db:migrate`
 * n'atteint que `localhost`, `127.0.0.1` ou `::1`. Refus avant toute connexion (aucun appel à `connect`), sans la
 * chaîne ni l'hôte dans le message. Adresses construites à l'exécution, mot de passe aléatoire.
 *
 * Accès à `pg-connection-string` (question ouverte 5 de 0056, Q419, proposition de la PR du workflow) : dépendance
 * directe épinglée ; exigence Sécurité, l'analyseur du refus est celui que `pg` emploie, à la même version.
 */

const PASSWORD = randomUUID();
const RACINE = fileURLToPath(new URL("../../../", import.meta.url));

/** Adresse `postgres://utilisateur:<aléatoire>@<hôte>/base<suite>` ; `hote` vide : aucun hôte dans la chaîne. */
function adresse(hote: string, suite = ""): string {
  return `postgres://utilisateur:${PASSWORD}@${hote}/base${suite}`;
}

const REFUSEES: readonly [string, string][] = [
  ["hôte de l'URL", adresse("db.exemple.invalid")],
  ["hôte poolé", adresse("ep-x-pooler.exemple.invalid")],
  ["?host= qui remplace un hôte local", adresse("127.0.0.1", "?host=db.exemple.invalid")],
  ["plusieurs hôtes", adresse("127.0.0.1,db.exemple.invalid")],
  ["plusieurs hôtes locaux", adresse("127.0.0.1,localhost")],
  ["socket", `postgres://utilisateur:${PASSWORD}@/base?host=/var/run/postgresql`],
  ["socket abstrait", `socket:/var/run/postgresql?db=base`],
  ["forme clé=valeur", "host=db.exemple.invalid dbname=base user=utilisateur"],
  ["forme clé=valeur locale", "host=127.0.0.1 dbname=base user=utilisateur"],
  ["casse", adresse("LOCALHOST")],
  ["autre adresse de bouclage", adresse("127.0.0.2")],
  ["hôte encodé", adresse("127.0.0.1%2Fautre")],
];

const ACCEPTEES: readonly [string, string][] = [
  ["127.0.0.1", adresse("127.0.0.1:1")],
  ["localhost", adresse("localhost:1")],
  ["::1", adresse("[::1]:1")],
  ["?host= local", adresse("db.exemple.invalid:1", "?host=127.0.0.1")],
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function sansSecret(error: unknown): void {
  const message = (error as Error).message;
  for (const secret of [PASSWORD, "db.exemple.invalid", "postgres://", "pooler", "/var/run"]) expect(message, secret).not.toContain(secret);
}

describe("migrations: db/migrate.ts refuse tout hôte non local (0056 § 2.8)", () => {
  it("liste des hôtes admis : localhost, 127.0.0.1, ::1", () => {
    expect([...MIGRATION_LOCAL_HOSTS].sort()).toEqual(["127.0.0.1", "::1", "localhost"]);
  });

  it.each(REFUSEES)("refus avant connexion : %s", async (_cas, url) => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    expect(() => assertMigrationHostLocal(url)).toThrow(DatabaseGuardError);
    const error = await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: url }, []).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseGuardError);
    expect((error as Error).message).toContain("base locale");
    sansSecret(error);
    expect(connect).not.toHaveBeenCalled();
  });

  it("hôte absent de la chaîne : PGHOST, lu par pg, est contrôlé ; refusé s'il n'est pas local", async () => {
    const connect = vi.spyOn(pg.Client.prototype, "connect");
    vi.stubEnv("PGHOST", "db.exemple.invalid");
    const error = await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: `postgres://utilisateur:${PASSWORD}@/base` }, []).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(DatabaseGuardError);
    sansSecret(error);
    expect(connect).not.toHaveBeenCalled();
  });

  it.each([...ACCEPTEES, ["hôte absent, PGHOST local", `postgres://utilisateur:${PASSWORD}@/base`] as [string, string]])(
    "hôte local accepté : %s (la connexion est tentée)",
    async (_cas, url) => {
      vi.stubEnv("PGHOST", "127.0.0.1");
      vi.stubEnv("PGPORT", "1");
      expect(() => assertMigrationHostLocal(url)).not.toThrow();
      vi.spyOn(pg.Client.prototype, "connect").mockImplementation((async () => {
        throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
      }) as never);
      vi.spyOn(pg.Client.prototype, "end").mockImplementation((async () => undefined) as never);
      const error = await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: url }, []).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(DatabaseConnectionError);
    },
  );
});

describe("migrations: pg-connection-string, dépendance directe à la version que pg résout (0056 § 2.8, Q419)", () => {
  const paquet = JSON.parse(readFileSync(path.join(RACINE, "package.json"), "utf8")) as { dependencies: Record<string, string> };
  const verrou = readFileSync(path.join(RACINE, "pnpm-lock.yaml"), "utf8");

  it("épinglée exactement dans package.json, résolue à la même version pour la racine et pour pg dans pnpm-lock.yaml", () => {
    const directe = paquet.dependencies["pg-connection-string"];
    expect(directe).toMatch(/^\d+\.\d+\.\d+$/);
    const racine = /\n {6}pg-connection-string:\n {8}specifier: ([^\n]+)\n {8}version: ([^\n]+)\n/.exec(verrou);
    expect(racine?.slice(1)).toEqual([directe, directe]);
    const versionPg = paquet.dependencies.pg ?? "";
    const blocPg = new RegExp(`\\n {2}pg@${versionPg.replace(/\./g, "\\.")}:\\n((?: {4}[^\\n]*\\n)+)`).exec(verrou.slice(verrou.indexOf("\nsnapshots:")));
    expect(blocPg, `pg@${versionPg} dans snapshots`).not.toBeNull();
    expect(blocPg![1]).toContain(`      pg-connection-string: ${directe}\n`);
    // Une seule version du paquet dans le verrou : `pg` et `db/migrate.ts` chargent le même code.
    const versions = new Set([...verrou.matchAll(/^ {2}pg-connection-string@([^:]+):/gm)].map((m) => m[1]));
    expect([...versions]).toEqual([directe]);
  });
});
