import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PositionGoogleFraiche } from "@/grounding/port-positions";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { creerPortPositions } from "@/server/positions/cache-positions";

import { attempt, BOOTSTRAP_ROLE, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org, unique } from "./helpers";

/**
 * Cache de positions du MVP et sa purge (décision 0060 § 4, B8c ; 0011 § 6 et « Tests nommés ») : tests `coordonnées:`
 * et `purge:` de la base. Chaque test se connecte avec le rôle qu'il éprouve ; la connexion d'administration
 * (superutilisateur du conteneur) ne sert qu'à poser des lignes datées que l'horloge de la base ne permet pas d'attendre
 * (déclencheurs et RLS hors jeu), à relever le catalogue et à porter la transaction annulée du repli manuel.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const REPLI = readFileSync(path.join(RACINE, "db/maintenance/coords-purge-repli.sql"), "utf8");
const ROLE_PURGE = "vadrouille_coords_purge";
const SIGNATURE_ECRITURE = "public.store_place_coordinates(text, double precision, double precision)";

/** Requête de contrôle de 0060 § 3.3, filtrée sur le rôle (reprise telle quelle par `db/README.md`, section 4). */
const CONTROLE_APPARTENANCES = `SELECT m.rolname AS membre, r.rolname AS role, am.admin_option AS admin,
       am.inherit_option AS inherit, am.set_option AS set
FROM pg_catalog.pg_auth_members am
JOIN pg_catalog.pg_roles r ON r.oid = am.roleid
JOIN pg_catalog.pg_roles m ON m.oid = am.member
WHERE r.rolname = 'vadrouille_coords_purge' OR m.rolname = 'vadrouille_coords_purge'
ORDER BY 1, 2;`;

let admin: DbClient;
let app: DbClient;
let auth: DbClient;
let purge: DbClient;
let a: Org;
let b: Org;

/** Coordonnée posée par l'administration (déclencheurs et RLS hors jeu), vivante ou expirée, validée. */
async function poser(org: string, expiration: "vivante" | "expiree", placeId = `ChIJtest${unique()}`): Promise<string> {
  const [fetched, expires] =
    expiration === "vivante" ? ["pg_catalog.now()", "pg_catalog.now() + interval '1 day'"] : ["pg_catalog.now() - interval '2 days'", "pg_catalog.now() - interval '1 day'"];
  await admin.query(
    `INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, $2, 46.2, 6.15, ${fetched}, ${expires})`,
    [org, placeId],
  );
  return placeId;
}

const compter = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);
const presentes = (placeIds: string[]) => compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [placeIds]);
const fraiche = (lat: number, lng: number) => ({ lat, lng }) as PositionGoogleFraiche;

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
  auth = await connect("auth");
  purge = await connect("coords_purge");
  a = await createOrg(auth);
  b = await createOrg(auth);
});

afterAll(closeAll);

describe("coordonnées: expiration à 30 jours au plus", () => {
  it("CHECK refusé au-delà de 30 jours ; fetched_at et expires_at posés par la fonction, durée de 29 jours (0060 § 2)", async () => {
    await admin.query("BEGIN");
    try {
      const trop = await attempt(
        admin,
        "INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, 'ChIJtrop', 1, 1, now(), now() + interval '30 days 1 second')",
        [a.org],
      );
      expect(trop.code).toBe("23514");
      const limite = await attempt(
        admin,
        "INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, 'ChIJlimite', 1, 1, now(), now() + interval '30 days')",
        [a.org],
      );
      expect(limite.code).toBeUndefined();
    } finally {
      await admin.query("ROLLBACK");
    }
    // La fonction ne prend ni date ni organisation : seule sa forme à trois paramètres existe.
    const signatures = await admin.query("SELECT p.oid::regprocedure::text AS s FROM pg_catalog.pg_proc p WHERE p.proname = 'store_place_coordinates'");
    expect(signatures.rows.map((r) => r.s)).toEqual(["store_place_coordinates(text,double precision,double precision)"]);
    const placeId = `ChIJtest${unique()}`;
    const debut = await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query("SELECT public.store_place_coordinates($1, 46.2, 6.15)", [placeId]);
      return (await c.query("SELECT now() AS t")).rows[0].t as Date;
    });
    const { rows } = await admin.query(
      "SELECT fetched_at, expires_at - fetched_at = interval '29 days' AS a29 FROM public.place_coordinates WHERE place_id = $1 AND organization_id = $2",
      [placeId, a.org],
    );
    expect(rows).toEqual([{ fetched_at: debut, a29: true }]);
  });

  it("une ligne expirée n'est plus lisible ; la purge ne supprime que les lignes expirées", async () => {
    const vivante = await poser(a.org, "vivante");
    const expiree = await poser(a.org, "expiree");
    const lues = await inTx(app, { org: a.org }, async (c) =>
      (await c.query("SELECT place_id FROM public.place_coordinates WHERE place_id = ANY($1::text[])", [[vivante, expiree]])).rows.map((r) => r.place_id),
    );
    expect(lues).toEqual([vivante]);
    await inTx(app, { org: a.org }, (c) => c.query("SELECT public.purge_expired_coordinates()"));
    expect(await presentes([vivante])).toBe(1);
    expect(await presentes([expiree])).toBe(0);
  });
});

describe("coordonnées: DELETE limité et aucun UPDATE", () => {
  it("vadrouille_app n'a ni INSERT, ni UPDATE, ni DELETE ; UPDATE et DELETE directs refusés", async () => {
    const droits = await admin.query(
      "SELECT d, pg_catalog.has_table_privilege('vadrouille_app', 'public.place_coordinates', d) AS a FROM unnest(ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) AS d",
    );
    expect(droits.rows.filter((r) => r.a)).toEqual([]);
    const placeId = await poser(a.org, "vivante");
    await inTx(app, { org: a.org }, async (c) => {
      await expectRefused(c, "UPDATE public.place_coordinates SET lat = 0 WHERE place_id = $1", [placeId]);
      await expectRefused(c, "DELETE FROM public.place_coordinates WHERE place_id = $1", [placeId]);
      await expectRefused(c, "INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, 'ChIJx', 1, 1, now(), now() + interval '1 day')", [a.org]);
    });
    expect(await presentes([placeId])).toBe(1);
  });

  it("vadrouille_fn_coords : ses seuls droits listés sur place_coordinates, aucun UPDATE, sans appartenance avec SET ni INHERIT", async () => {
    const tables = await admin.query(
      `SELECT c.relname, p FROM pg_catalog.pg_class c, unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p
       WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_catalog.has_table_privilege('vadrouille_fn_coords', c.oid, p) ORDER BY 1, 2`,
    );
    expect(tables.rows).toEqual([
      { relname: "place_coordinates", p: "DELETE" },
      { relname: "place_coordinates", p: "INSERT" },
    ]);
    const colonnes = await admin.query(
      `SELECT a.attname FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.place_coordinates'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('vadrouille_fn_coords', a.attrelid, a.attnum, 'SELECT') ORDER BY 1`,
    );
    expect(colonnes.rows.map((r) => r.attname)).toEqual(["expires_at", "organization_id", "place_id"]);
    expect((await admin.query("SELECT pg_catalog.has_any_column_privilege('vadrouille_fn_coords', 'public.place_coordinates', 'UPDATE') AS u")).rows[0].u).toBe(false);
    const appartenances = await admin.query(
      `SELECT m.rolname AS membre, am.admin_option, am.inherit_option, am.set_option FROM pg_catalog.pg_auth_members am
       JOIN pg_catalog.pg_roles r ON r.oid = am.roleid JOIN pg_catalog.pg_roles m ON m.oid = am.member
       WHERE r.rolname = 'vadrouille_fn_coords' OR m.rolname = 'vadrouille_fn_coords'`,
    );
    for (const ligne of appartenances.rows) {
      expect(["vadrouille_migrator", BOOTSTRAP_ROLE], ligne.membre).toContain(ligne.membre);
      expect(ligne, ligne.membre).toMatchObject({ admin_option: true, inherit_option: false, set_option: false });
    }
  });

  it("une nouvelle écriture d'un même placeId remplace la ligne (suppression puis insertion), sans UPDATE", async () => {
    const placeId = `ChIJtest${unique()}`;
    await inTx(app, { org: a.org }, (c) => c.query("SELECT public.store_place_coordinates($1, 46.2, 6.15)", [placeId]));
    const avant = (await admin.query("SELECT xmin::text AS x, fetched_at FROM public.place_coordinates WHERE place_id = $1", [placeId])).rows[0];
    await inTx(app, { org: a.org }, (c) => c.query("SELECT public.store_place_coordinates($1, 47.1, 7.2)", [placeId]));
    const apres = await admin.query("SELECT xmin::text AS x, fetched_at, lat, lng FROM public.place_coordinates WHERE place_id = $1", [placeId]);
    expect(apres.rows).toHaveLength(1);
    expect(apres.rows[0]).toMatchObject({ lat: 47.1, lng: 7.2 });
    expect(apres.rows[0].x).not.toBe(avant.x);
    expect((apres.rows[0].fetched_at as Date).getTime()).toBeGreaterThanOrEqual((avant.fetched_at as Date).getTime());
  });
});

describe("coordonnées: purge sans effet sur une autre organisation", () => {
  it("avec le contexte de A : la purge ne supprime aucune ligne valide de B ; une écriture d'un placeId de B ne touche pas la ligne de B", async () => {
    const deB = await poser(b.org, "vivante");
    const expireeB = await poser(b.org, "expiree");
    await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      await c.query("SELECT public.purge_expired_coordinates()");
      await c.query("SELECT public.store_place_coordinates($1, 1, 1)", [deB]);
    });
    const ligneB = await admin.query("SELECT lat, lng FROM public.place_coordinates WHERE place_id = $1 AND organization_id = $2", [deB, b.org]);
    expect(ligneB.rows).toEqual([{ lat: 46.2, lng: 6.15 }]);
    expect(await compter("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1 AND organization_id = $2", [deB, a.org])).toBe(1);
    // Lignes expirées : supprimées de toute organisation (0011 § 6).
    expect(await presentes([expireeB])).toBe(0);
  });

  it("par le port : écriture dans A sans effet sur B ; lire ne rend ni B ni org_prototype", async () => {
    const placeId = await poser(b.org, "vivante");
    await poser(PROTOTYPE_ORG_ID, "vivante", placeId);
    const lu = await inTx(app, { org: a.org, user: a.owner }, async (c) => {
      const port = creerPortPositions(c);
      const avant = await port.lire([placeId]);
      expect(avant).toEqual({ ok: true, valeur: new Map() });
      expect(await port.ecrire(new Map([[placeId, fraiche(45.5, 5.5)]]), Date.now())).toEqual({ ok: true, valeur: undefined });
      return port.lire([placeId]);
    });
    expect(lu).toEqual({ ok: true, valeur: new Map([[placeId, { lat: 45.5, lng: 5.5 }]]) });
    const parOrganisation = await admin.query(
      "SELECT organization_id::text AS o, lat, lng, expires_at - fetched_at = interval '29 days' AS a29 FROM public.place_coordinates WHERE place_id = $1 ORDER BY 1",
      [placeId],
    );
    expect(parOrganisation.rows).toEqual(
      [
        { o: a.org, lat: 45.5, lng: 5.5, a29: true },
        { o: b.org, lat: 46.2, lng: 6.15, a29: false },
        { o: PROTOTYPE_ORG_ID, lat: 46.2, lng: 6.15, a29: false },
      ].sort((x, y) => (x.o < y.o ? -1 : 1)),
    );
    // Contexte d'org_prototype sous vadrouille_app : aucune ligne rendue (0046 S2), écriture refusée.
    const proto = await inTx(app, { org: PROTOTYPE_ORG_ID }, (c) => creerPortPositions(c).lire([placeId]));
    expect(proto).toEqual({ ok: true, valeur: new Map() });
  });
});

describe("coordonnées: sans contexte d'organisation", () => {
  it("lire rend une Map vide ; ecrire rend base, retryable faux (42501), aucune ligne écrite", async () => {
    const vivante = await poser(a.org, "vivante");
    const nouveau = `ChIJtest${unique()}`;
    await app.query("BEGIN");
    try {
      const port = creerPortPositions(app);
      expect(await port.lire([vivante, nouveau])).toEqual({ ok: true, valeur: new Map() });
      expect(await port.ecrire(new Map([[nouveau, fraiche(1, 1)]]), Date.now())).toEqual({ ok: false, code: "base", retryable: false });
    } finally {
      await app.query("ROLLBACK");
    }
    expect(await presentes([nouveau])).toBe(0);
  });
});

describe("purge: le rôle de purge du MVP ne fait que purger", () => {
  it("fonctions exécutables : exactement la purge et les quatre fonctions pures tenues de PUBLIC", async () => {
    const { rows } = await admin.query(
      `SELECT n.nspname || '.' || p.proname || '(' || pg_catalog.oidvectortypes(p.proargtypes) || ')' AS f
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname IN ('public', 'prototype') AND pg_catalog.has_function_privilege($1, p.oid, 'EXECUTE') ORDER BY 1`,
      [ROLE_PURGE],
    );
    expect(rows.map((r) => r.f)).toEqual(
      [
        "public.purge_expired_coordinates()",
        "public.app_current_org()",
        "public.app_current_user()",
        "public.app_share_token_hash()",
        "public.jsonb_sources_valid(jsonb, text[])",
      ].sort(),
    );
    // EXECUTE nominatif sur la purge (migration 0008), jamais sur l'écriture.
    expect((await admin.query("SELECT pg_catalog.has_function_privilege($1, $2, 'EXECUTE') AS e", [ROLE_PURGE, SIGNATURE_ECRITURE])).rows[0].e).toBe(false);
  });

  it("tables, vues, séquences et schémas : aucun droit, hors USAGE de public", async () => {
    const tables = await admin.query(
      `SELECT c.relnamespace::regnamespace::text || '.' || c.relname AS t, p FROM pg_catalog.pg_class c,
              unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER']) AS p
       WHERE c.relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_catalog.has_table_privilege($1, c.oid, p)`,
      [ROLE_PURGE],
    );
    expect(tables.rows).toEqual([]);
    const colonnes = await admin.query(
      `SELECT c.relname FROM pg_catalog.pg_class c
       WHERE c.relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
         AND pg_catalog.has_any_column_privilege($1, c.oid, 'SELECT, INSERT, UPDATE, REFERENCES')`,
      [ROLE_PURGE],
    );
    expect(colonnes.rows).toEqual([]);
    const sequences = await admin.query(
      `SELECT c.relname FROM pg_catalog.pg_class c, unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) AS p
       WHERE c.relnamespace IN ('public'::regnamespace, 'prototype'::regnamespace) AND c.relkind = 'S' AND pg_catalog.has_sequence_privilege($1, c.oid, p)`,
      [ROLE_PURGE],
    );
    expect(sequences.rows).toEqual([]);
    const schemas = await admin.query(
      `SELECT pg_catalog.has_schema_privilege($1, 'public', 'USAGE') AS usage_public,
              pg_catalog.has_schema_privilege($1, 'public', 'CREATE') AS create_public,
              pg_catalog.has_schema_privilege($1, 'prototype', 'USAGE') AS usage_prototype,
              pg_catalog.has_schema_privilege($1, 'prototype', 'CREATE') AS create_prototype`,
      [ROLE_PURGE],
    );
    expect(schemas.rows[0]).toEqual({ usage_public: true, create_public: false, usage_prototype: false, create_prototype: false });
  });

  it("rôle : attributs de 0060 § 3.2, CONNECTION LIMIT 2, aucune appartenance hors la ligne ADMIN seule tolérée du rôle d'amorçage", async () => {
    const role = await admin.query(
      "SELECT rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole, rolreplication, rolconnlimit FROM pg_catalog.pg_roles WHERE rolname = $1",
      [ROLE_PURGE],
    );
    expect(role.rows[0]).toMatchObject({
      rolcanlogin: true,
      rolsuper: false,
      rolbypassrls: false,
      rolcreatedb: false,
      rolcreaterole: false,
      rolreplication: false,
      rolconnlimit: 2,
    });
    const appartenances = await admin.query(CONTROLE_APPARTENANCES);
    for (const ligne of appartenances.rows) {
      expect(ligne).toEqual({ membre: BOOTSTRAP_ROLE, role: ROLE_PURGE, admin: true, inherit: false, set: false });
    }
  });

  it("sous ce rôle : la purge supprime les lignes expirées de deux organisations et aucune ligne vivante ; SELECT direct refusé", async () => {
    const vivantes = [await poser(a.org, "vivante"), await poser(b.org, "vivante")];
    const expirees = [await poser(a.org, "expiree"), await poser(b.org, "expiree")];
    expect((await purge.query("SELECT session_user AS s")).rows[0].s).toBe(ROLE_PURGE);
    await purge.query("SELECT public.purge_expired_coordinates()");
    expect(await presentes(vivantes)).toBe(2);
    expect(await presentes(expirees)).toBe(0);
    await purge.query("BEGIN");
    try {
      await expectRefused(purge, "SELECT * FROM public.place_coordinates");
      await expectRefused(purge, "SELECT public.store_place_coordinates('ChIJx', 1, 1)");
      await expectRefused(purge, "SELECT prototype.purge_expired()");
    } finally {
      await purge.query("ROLLBACK");
    }
  });
});

describe("purge: le repli manuel purge sans laisser d'appartenance", () => {
  /** Rôle de test sans connexion ni superutilisateur, créé dans la transaction annulée. */
  async function roleDeTest(avecAdmin: boolean): Promise<string> {
    const nom = `test_repli_${unique()}`;
    await admin.query(`CREATE ROLE ${nom} NOLOGIN NOSUPERUSER NOCREATEROLE NOBYPASSRLS`);
    if (avecAdmin) await admin.query(`GRANT ${ROLE_PURGE} TO ${nom} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`);
    return nom;
  }

  async function lignesDuRole(nom: string) {
    return (await admin.query(CONTROLE_APPARTENANCES)).rows.filter((r) => r.membre === nom || r.role === nom);
  }

  it("ligne ADMIN seule : appel direct refusé, repli réussi, lignes expirées seules supprimées, seule la ligne ADMIN reste", async () => {
    await admin.query("BEGIN");
    try {
      const vivantes = [await poser(a.org, "vivante"), await poser(b.org, "vivante")];
      const expirees = [await poser(a.org, "expiree"), await poser(b.org, "expiree")];
      const nom = await roleDeTest(true);
      await admin.query(`SET LOCAL ROLE ${nom}`);
      expect((await attempt(admin, "SELECT public.purge_expired_coordinates()")).code).toBe("42501");
      await admin.query(REPLI);
      expect((await admin.query("SELECT current_user AS u")).rows[0].u).toBe(nom);
      await admin.query("RESET ROLE");
      expect(await presentes(vivantes)).toBe(2);
      expect(await presentes(expirees)).toBe(0);
      // Requête de contrôle de 0060 § 3.3 : exactement la ligne ADMIN seule du rôle de test (le superutilisateur
      // d'amorçage de la CI n'en reçoit pas).
      const controle = (await admin.query(CONTROLE_APPARTENANCES)).rows.filter((r) => r.membre !== BOOTSTRAP_ROLE);
      expect(controle).toEqual([{ membre: nom, role: ROLE_PURGE, admin: true, inherit: false, set: false }]);
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("sans la ligne ADMIN : le même texte échoue et ne laisse ni appartenance ni ligne supprimée", async () => {
    await admin.query("BEGIN");
    try {
      const expiree = await poser(a.org, "expiree");
      const nom = await roleDeTest(false);
      await admin.query(`SET LOCAL ROLE ${nom}`);
      expect((await attempt(admin, REPLI)).code).toBe("42501");
      await admin.query("RESET ROLE");
      expect(await presentes([expiree])).toBe(1);
      expect(await lignesDuRole(nom)).toEqual([]);
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("privé de sa ligne REVOKE : le texte échoue sur l'exception finale, sans appartenance de plus ni ligne supprimée", async () => {
    const sansRevoke = REPLI.split("\n")
      .filter((l) => !l.includes("'REVOKE vadrouille_coords_purge FROM %I'"))
      .join("\n");
    expect(sansRevoke).not.toBe(REPLI);
    await admin.query("BEGIN");
    try {
      const expiree = await poser(a.org, "expiree");
      const nom = await roleDeTest(true);
      await admin.query(`SET LOCAL ROLE ${nom}`);
      expect((await attempt(admin, sansRevoke)).code).toBe("P0001");
      await admin.query("RESET ROLE");
      expect(await presentes([expiree])).toBe(1);
      expect(await lignesDuRole(nom)).toEqual([{ membre: nom, role: ROLE_PURGE, admin: true, inherit: false, set: false }]);
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});
