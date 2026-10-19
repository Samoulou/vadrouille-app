import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ecrireProgramme } from "@/adapters/prototype-ecriture";
import { createSourceProgrammesReels } from "@/adapters/prototype-lecture";
import type { EcritureProgrammePrototype } from "@/contracts/prototype-ecriture";
import { decouperProgramme } from "@/prototype/decoupage";
import { pairesAConserver, PROTOTYPE_ORG_ID, ProgrammeReduitSchema, trajetsAConserver } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { attempt, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org, poserExecution, unique } from "./helpers";

/**
 * Temps de trajet conservés des programmes du prototype (décision 0092 § 3 à § 5 ; migration `0011_trajets_prototype`).
 * Chaque test se connecte avec le rôle qu'il éprouve ; l'administration ne sert qu'à poser des lignes datées (déclencheurs
 * désactivés pour sa seule transaction) et à constater un résultat.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_PROGRAMME = readFileSync(path.join(RACINE, "prototype/programmes-test/proto_test_20261012_1.json"), "utf8");
const SHA = "a".repeat(40);
const TABLE = "prototype.trajets";

let admin: DbClient;
let app: DbClient;
let proto: DbClient;
let purge: DbClient;
let a: Org;

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
  proto = await connect("p0");
  purge = await connect("p0_purge");
  a = await createOrg(await connect("auth"));
});

afterAll(closeAll);

const compter = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);

/**
 * Programme d'org_prototype et un temps conservé, posés par l'administration (déclencheurs désactivés pour cette seule
 * transaction, validée), vivants ou expirés ; le temps porte l'expiration de son programme. `organisation` : celle du
 * temps (une autre qu'org_prototype pour éprouver l'isolation).
 */
async function poser(expiration: "vivant" | "expire", organisation: string = PROTOTYPE_ORG_ID): Promise<{ programme: string; trajet: string }> {
  const expires = expiration === "vivant" ? "pg_catalog.now() + interval '1 day'" : "pg_catalog.now() - interval '1 hour'";
  await admin.query("BEGIN");
  try {
    const run = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, statut: "programme_ecrit", debut: "pg_catalog.now() - interval '30 days'" });
    await admin.query("SET LOCAL session_replication_role = replica");
    const programme = (
      await admin.query(`INSERT INTO prototype.programmes (organization_id, run_id, contenu, expires_at) VALUES ($1, $2, '{"schema": 1}', ${expires}) RETURNING id`, [
        PROTOTYPE_ORG_ID,
        run,
      ])
    ).rows[0].id as string;
    const trajet = (
      await admin.query(
        `INSERT INTO prototype.trajets (organization_id, programme_id, mode, origine, destination, minutes, expires_at)
         SELECT $1, p.id, 'walk', $3, $4, 12, p.expires_at FROM prototype.programmes p WHERE p.id = $2 RETURNING id`,
        [organisation, programme, `Lieu${unique()}`, `Lieu${unique()}`],
      )
    ).rows[0].id as string;
    await admin.query("COMMIT");
    return { programme, trajet };
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Exécution en cours, programme et premier temps posés sous `vadrouille_prototype` dans `c` (transaction ouverte). */
async function programmeVivant(c: DbClient): Promise<string> {
  const run = (await c.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'A', $1) RETURNING id", [SHA])).rows[0].id;
  return (await c.query(`INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1, '{"schema": 1, "trip": {}, "proposals": [], "terminus": []}') RETURNING id`, [run])).rows[0]
    .id as string;
}

const INSERT_TRAJET = "INSERT INTO prototype.trajets (programme_id, mode, origine, destination, minutes) VALUES ($1, $2, $3, $4, $5)";

describe("prototype: trajets purgés avec leur programme (0092 § 1 point 2)", () => {
  it("purge: un temps expiré est supprimé avant son programme, sans erreur de clé étrangère ; un temps valide n'est pas touché ; un temps expiré n'est plus lisible avant la purge", async () => {
    const vivant = await poser("vivant");
    const expire = await poser("expire");
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [vivant.trajet])).rows).toHaveLength(1);
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [expire.trajet])).rows).toHaveLength(0);
    });
    await purge.query("SELECT prototype.purge_expired()");
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [expire.trajet])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM prototype.programmes WHERE id = $1", [expire.programme])).toBe(0);
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [vivant.trajet])).toBe(1);
    expect(await compter("SELECT count(*) AS n FROM prototype.programmes WHERE id = $1", [vivant.programme])).toBe(1);
    const corps = (await admin.query("SELECT prosrc FROM pg_catalog.pg_proc WHERE oid = 'prototype.purge_expired()'::regprocedure")).rows[0].prosrc as string;
    expect(corps.indexOf(TABLE)).toBeGreaterThan(-1);
    expect(corps.indexOf(TABLE)).toBeLessThan(corps.indexOf("prototype.programmes"));
  });

  it("purge: même fonction (sans paramètre, SECURITY DEFINER de vadrouille_fn_prototype_purge, EXECUTE au seul vadrouille_prototype_purge)", async () => {
    const { rows } = await admin.query(
      `SELECT p.pronargs, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proconfig,
              pg_catalog.has_function_privilege('vadrouille_prototype', p.oid, 'EXECUTE') AS proto,
              pg_catalog.has_function_privilege('vadrouille_prototype_purge', p.oid, 'EXECUTE') AS purge
       FROM pg_catalog.pg_proc p WHERE p.oid = 'prototype.purge_expired()'::regprocedure`,
    );
    expect(rows[0]).toEqual({ pronargs: 0, prosecdef: true, owner: "vadrouille_fn_prototype_purge", proconfig: ["search_path=pg_catalog, pg_temp"], proto: false, purge: true });
  });
});

describe("prototype: trajets, droits (0092 § 3)", () => {
  it("vadrouille_prototype : SELECT et INSERT par colonnes, ni UPDATE ni DELETE ; aucun droit pour vadrouille_app, vadrouille_share ni PUBLIC", async () => {
    const droits = async (role: string) =>
      (
        await admin.query(
          `SELECT p FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p
           WHERE pg_catalog.has_table_privilege($1, '${TABLE}', p) OR (p IN ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES')
             AND pg_catalog.has_any_column_privilege($1, '${TABLE}'::regclass, p))
           ORDER BY p`,
          [role],
        )
      ).rows.map((r) => r.p as string);
    expect(await droits("vadrouille_prototype")).toEqual(["INSERT", "SELECT"]);
    for (const role of ["vadrouille_app", "vadrouille_share", "public"]) expect(await droits(role), role).toEqual([]);
    const acl = await admin.query(
      `SELECT count(*) AS n FROM pg_catalog.pg_class c, pg_catalog.aclexplode(COALESCE(c.relacl, pg_catalog.acldefault('r', c.relowner))) AS x
       WHERE c.oid = '${TABLE}'::regclass AND x.grantee = 0`,
    );
    expect(Number(acl.rows[0].n)).toBe(0);
  });

  it("id, organization_id et expires_at posés par le déclencheur, jamais par l'appelant ; ni UPDATE ni DELETE", async () => {
    // vadrouille_prototype ne peut pas les fournir : colonnes absentes de ses droits INSERT (42501).
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const programme = await programmeVivant(proto);
      for (const [colonne, valeur] of [
        ["id", "gen_random_uuid()"],
        ["organization_id", `'${a.org}'::uuid`],
        ["expires_at", "pg_catalog.now() + interval '1 year'"],
      ] as const) {
        await expectRefused(proto, `INSERT INTO ${TABLE} (programme_id, mode, origine, destination, minutes, ${colonne}) VALUES ($1, 'walk', 'a', 'b', 3, ${valeur})`, [programme]);
      }
      const ligne = await proto.query(
        `${INSERT_TRAJET} RETURNING id, organization_id::text AS org, expires_at = (SELECT p.expires_at FROM prototype.programmes p WHERE p.id = $1) AS copie`,
        [programme, "walk", "LieuA", "LieuB", 7],
      );
      expect(ligne.rows[0]).toMatchObject({ org: PROTOTYPE_ORG_ID, copie: true });
      await expectRefused(proto, `UPDATE ${TABLE} SET minutes = 1 WHERE id = $1`, [ligne.rows[0].id]);
      await expectRefused(proto, `UPDATE ${TABLE} SET expires_at = pg_catalog.now() + interval '1 year' WHERE id = $1`, [ligne.rows[0].id]);
      await expectRefused(proto, `DELETE FROM ${TABLE} WHERE id = $1`, [ligne.rows[0].id]);
    } finally {
      await proto.query("ROLLBACK");
    }
    // Même fournies par un rôle qui le pourrait (administration), elles sont écrasées par le déclencheur.
    await admin.query("BEGIN");
    try {
      const run = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
      const programme = (await admin.query(`INSERT INTO prototype.programmes (run_id, contenu) VALUES ($1, '{"schema": 1}') RETURNING id`, [run])).rows[0].id;
      const ecrit = await admin.query(
        `INSERT INTO ${TABLE} (id, organization_id, programme_id, mode, origine, destination, minutes, expires_at)
         VALUES ('5e1f0000-0000-4000-8000-0000000000aa', $1, $2, 'car', 'a', 'b', 4, pg_catalog.now() + interval '10 years')
         RETURNING id::text, organization_id::text AS org, expires_at = (SELECT p.expires_at FROM prototype.programmes p WHERE p.id = $2) AS copie`,
        [a.org, programme],
      );
      expect(ecrit.rows[0].id).not.toBe("5e1f0000-0000-4000-8000-0000000000aa");
      expect(ecrit.rows[0]).toMatchObject({ org: PROTOTYPE_ORG_ID, copie: true });
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("programme expiré, inconnu ou valeur hors forme : refus (23503, 23514, 23505)", async () => {
    const expire = await poser("expire");
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      expect((await attempt(proto, INSERT_TRAJET, [expire.programme, "walk", "a", "b", 3])).code).toBe("23503");
      expect((await attempt(proto, INSERT_TRAJET, ["5e1f0000-0000-4000-8000-0000000000bb", "walk", "a", "b", 3])).code).toBe("23503");
      const programme = await programmeVivant(proto);
      for (const [mode, origine, destination, minutes] of [
        ["bike", "a", "b", 3],
        ["walk", "a b", "b", 3],
        ["walk", "a", "x'y", 3],
        ["walk", "a".repeat(257), "b", 3],
        ["walk", "a", "b", -1],
        ["walk", "a", "b", 1441],
      ] as const) {
        expect((await attempt(proto, INSERT_TRAJET, [programme, mode, origine, destination, minutes])).code, `${mode} ${origine} ${destination} ${minutes}`).toBe("23514");
      }
      expect((await attempt(proto, INSERT_TRAJET, [programme, "walk", "a", "b", 1440])).code).toBeUndefined();
      expect((await attempt(proto, INSERT_TRAJET, [programme, "walk", "a", "b", 2])).code).toBe("23505");
      expect((await attempt(proto, INSERT_TRAJET, [programme, "transit", "a", "b", 2])).code).toBeUndefined();
    } finally {
      await proto.query("ROLLBACK");
    }
  });
});

describe("isolation: trajets d'org_prototype seulement (règle du rôle data)", () => {
  it("vadrouille_prototype, même avec le contexte d'une autre organisation, ne lit que les temps d'org_prototype ; vadrouille_app ne lit rien", async () => {
    const autre = await poser("vivant", a.org);
    const prototype = await poser("vivant");
    for (const org of [a.org, PROTOTYPE_ORG_ID]) {
      await inTx(proto, { org }, async (c) => {
        const { rows } = await c.query(`SELECT id::text FROM ${TABLE} WHERE id = ANY($1::uuid[])`, [[autre.trajet, prototype.trajet]]);
        expect(rows.map((r) => r.id)).toEqual([prototype.trajet]);
      });
    }
    await inTx(app, { org: a.org }, async (c) => {
      await expectRefused(c, `SELECT * FROM ${TABLE}`);
    });
  });
});

/** Pool minimal du module sur une connexion de test ; `intercepter` peut faire échouer une requête avant son envoi. */
function pool(client: DbClient, intercepter?: (texte: string) => void): PoolSql {
  return {
    connect: async (): Promise<ClientSql> => ({
      query: async (texte, valeurs) => {
        intercepter?.(texte);
        return client.query(texte, valeurs ? [...valeurs] : undefined);
      },
      release: () => undefined,
    }),
  };
}

/** Exécution posée et validée (le module ouvre sa propre transaction). */
async function executionValidee(): Promise<string> {
  await admin.query("BEGIN");
  try {
    const id = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
    await admin.query("COMMIT");
    return id;
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Programme de test aux `placeId` et à l'identifiant de voyage propres à l'appel, temps de toutes ses paires du mode `walk`. */
function entree(runId: string, minutes: number): EcritureProgrammePrototype & { tripId: string } {
  const prefixe = `T${unique()}_`;
  const tripId = `proto_tr${unique()}_1`;
  const programme = ProgrammeReduitSchema.parse(JSON.parse(SOURCE_PROGRAMME.replaceAll("SENTINELLE_PLACE_ID_", prefixe).replaceAll("proto_test_20261012_1", tripId)));
  const { contenu, positions } = decouperProgramme(programme);
  return { runId, programme: contenu, positions, mode: "walk", trajets: trajetsAConserver(contenu, "walk", () => minutes), tripId };
}

describe("p0: programme et temps écrits ensemble ou pas du tout, puis lus avec le programme (module, base migrée)", () => {
  it("réussite : un temps par paire de pairesDuProgramme du mode de l'exécution, expiration du programme ; relus par la source des programmes réels", async () => {
    const runId = await executionValidee();
    const e = entree(runId, 9);
    const paires = pairesAConserver(e.programme, e.mode);
    expect(paires.length).toBeGreaterThan(0);
    const { programmeId } = await ecrireProgramme(e, pool(proto));
    const lignes = await admin.query(
      `SELECT mode, origine, destination, minutes, t.expires_at = p.expires_at AS copie, t.organization_id::text AS org
       FROM ${TABLE} t JOIN prototype.programmes p ON p.id = t.programme_id WHERE t.programme_id = $1 ORDER BY mode, origine, destination`,
      [programmeId],
    );
    expect(lignes.rows.map((r) => [r.mode, r.origine, r.destination].join(":")).sort()).toEqual(paires.map((p) => [p.mode, p.origine, p.destination].join(":")).sort());
    for (const ligne of lignes.rows) expect(ligne).toMatchObject({ minutes: 9, copie: true, org: PROTOTYPE_ORG_ID });
    const lu = await createSourceProgrammesReels({ pool: async () => pool(proto) }).lire(e.tripId);
    expect(lu?.programme.trip.id).toBe(e.tripId);
    expect([...(lu?.trajets ?? new Map()).values()]).toEqual(paires.map(() => 9));
  });

  it("échec forcé sur un temps : aucun programme, aucune position, aucun temps ; exécution toujours en cours", async () => {
    const runId = await executionValidee();
    const e = entree(runId, 5);
    await expect(
      ecrireProgramme(
        e,
        pool(proto, (texte) => {
          if (texte.startsWith(`INSERT INTO ${TABLE}`)) throw Object.assign(new Error("panne simulée"), { code: "08006" });
        }),
      ),
    ).rejects.toMatchObject({ code: "base", sqlstate: "08006" });
    expect(await compter("SELECT count(*) AS n FROM prototype.programmes WHERE run_id = $1", [runId])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [[...e.positions.keys()]])).toBe(0);
    expect((await admin.query("SELECT status FROM prototype.runs WHERE id = $1", [runId])).rows[0].status).toBe("en_cours");
  });
});
