import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PROTOTYPE_USER_ID } from "@/adapters/context";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import {
  BUSINESS_TABLES,
  closeAll,
  connect,
  connectBaseJetable,
  countAs,
  createOrg,
  type DbClient,
  expectRefused,
  inTx,
  poserExecution,
  PURGED_TABLES,
  type SeedIds,
  seedOrganization,
  unique,
} from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * `purge_organization_data` (décision 0007, « Suppression de compte » ; handover § 12, étape 1), appelée par le cas
 * d'usage `deleteAccount` dans une transaction `withOrg`, puis `SET LOCAL ROLE vadrouille_account_admin`.
 *
 * Migration 0028_purge_place_coordinates (ticket 1091 ; décision 0167, option (a), « Tests exigés » 3 à 5) : la purge
 * supprime aussi les lignes de `place_coordinates` de l'organisation, vivantes comme expirées, et seulement elles ; les
 * refus d'avant n'en suppriment aucune. `place_coordinates` reste hors de `BUSINESS_TABLES` et de `PURGED_TABLES`
 * (`vadrouille_app` n'y écrit pas, ses lignes expirées lui sont cachées) : ses lignes sont posées par les fonctions de
 * `vadrouille_fn_coords` (`store_place_coordinates`, et `store_prototype_coordinates` pour `org_prototype`, comme
 * `tests/db/positions-prototype.test.ts`), une ligne expirée par l'administration (l'horloge de la base ne permet pas de
 * l'attendre), et comptées par l'administration, qui voit aussi les lignes expirées.
 *
 * Ordre : `store_place_coordinates` et `store_prototype_coordinates` suppriment au passage jusqu'à 500 lignes expirées
 * de toute organisation ; les lignes expirées sont donc posées après toute écriture par ces fonctions dans ce fichier.
 */

let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: SeedIds;
let b: SeedIds;

const STORE = "SELECT public.store_place_coordinates($1, 46.2, 6.15)";
/** Lignes de `place_coordinates` posées par `beforeAll` : deux vivantes et une expirée de A, une de B, une d'`org_prototype`. */
const coords = { a: [`ChIJpurgeA${unique()}`, `ChIJpurgeA${unique()}`], aExpiree: `ChIJpurgeAexp${unique()}`, b: `ChIJpurgeB${unique()}`, proto: `ChIJpurgeP${unique()}` };

/** Coordonnées vivantes écrites dans l'organisation de la transaction par `store_place_coordinates` (sous `vadrouille_app`). */
async function ecrire(client: DbClient, o: { org: string; owner: string }, placeIds: string[]): Promise<void> {
  await inTx(client, { org: o.org, user: o.owner }, async (c) => {
    for (const placeId of placeIds) await c.query(STORE, [placeId]);
  });
}

/** Coordonnée d'`org_prototype` écrite par sa fonction dédiée, liée à une exécution en cours (0052 § 1.7), validée. */
async function ecrirePrototype(client: DbClient, placeId: string): Promise<void> {
  await client.query("BEGIN");
  try {
    const run = await poserExecution(client, { organisation: PROTOTYPE_ORG_ID });
    await client.query("SELECT public.store_prototype_coordinates($1, $2, 46.2, 6.15)", [run, placeId]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Coordonnée posée par l'administration (RLS hors jeu), vivante ou expirée, validée (forme de `tests/db/coordonnees.test.ts`). */
async function poser(client: DbClient, org: string, placeId: string, expiration: "vivante" | "expiree"): Promise<void> {
  const [fetched, expires] =
    expiration === "vivante" ? ["pg_catalog.now()", "pg_catalog.now() + interval '1 day'"] : ["pg_catalog.now() - interval '2 days'", "pg_catalog.now() - interval '1 day'"];
  await client.query(
    `INSERT INTO public.place_coordinates (organization_id, place_id, lat, lng, fetched_at, expires_at) VALUES ($1, $2, 46.2, 6.15, ${fetched}, ${expires})`,
    [org, placeId],
  );
}

/** Lignes de `place_coordinates` d'une organisation, vivantes et expirées, vues par l'administration. */
async function coordonneesDe(org: string): Promise<number> {
  return (await admin.query("SELECT count(*)::int AS n FROM public.place_coordinates WHERE organization_id = $1", [org])).rows[0].n as number;
}

/** Présence des lignes de `beforeAll`, par organisation (l'administration voit les lignes expirées). */
async function coordonneesPosees(): Promise<{ a: number; aExpiree: number; b: number; proto: number }> {
  const n = async (org: string, placeIds: string[]) =>
    (await admin.query("SELECT count(*)::int AS n FROM public.place_coordinates WHERE organization_id = $1 AND place_id = ANY($2::text[])", [org, placeIds])).rows[0]
      .n as number;
  return { a: await n(a.org, coords.a), aExpiree: await n(a.org, [coords.aExpiree]), b: await n(b.org, [coords.b]), proto: await n(PROTOTYPE_ORG_ID, [coords.proto]) };
}

const TOUTES_POSEES = { a: 2, aExpiree: 1, b: 1, proto: 1 };

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
  await ecrire(app, a, coords.a);
  await ecrire(app, b, [coords.b]);
  await ecrirePrototype(admin, coords.proto);
  // En dernier : aucune écriture par les fonctions de coordonnées ne suit, la ligne expirée reste jusqu'à la purge.
  await poser(admin, a.org, coords.aExpiree, "expiree");
  expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

async function counts(org: SeedIds): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const table of BUSINESS_TABLES) result[table] = await countAs(app, { org: org.org, user: org.owner }, table);
  return result;
}

const ALL_ONE = Object.fromEntries(BUSINESS_TABLES.map((t) => [t, 1]));

/** Appel de la purge sous vadrouille_account_admin ; renvoie le code d'erreur Postgres, ou undefined. */
async function purge(ctx: { org?: string; user?: string }, target: string): Promise<string | undefined> {
  try {
    await inTx(app, ctx, (c) => c.query("SELECT purge_organization_data($1)", [target]), "vadrouille_account_admin");
    return undefined;
  } catch (error) {
    return (error as { code?: string }).code ?? "erreur";
  }
}

describe("purge: vadrouille_app ne peut pas purger une autre organisation", () => {
  it("sous vadrouille_app, appel direct refusé (aucun droit EXECUTE, ni direct ni hérité)", async () => {
    await inTx(app, { org: a.org, user: a.owner }, (c) => expectRefused(c, "SELECT purge_organization_data($1)", [a.org]));
    const { rows } = await app.query(
      "SELECT pg_catalog.has_function_privilege('vadrouille_app', 'public.purge_organization_data(uuid)', 'EXECUTE') AS can",
    );
    expect(rows[0].can).toBe(false);
    // 0167, « Tests exigés » 4 : aucune ligne de place_coordinates supprimée.
    expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
  });

  it("sous vadrouille_account_admin avec le contexte de A, purger B lève une exception et ne supprime rien", async () => {
    expect(await purge({ org: a.org, user: a.owner }, b.org)).toBe("42501");
    expect(await counts(a)).toEqual(ALL_ONE);
    expect(await counts(b)).toEqual(ALL_ONE);
    expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
  });

  it("sans utilisateur dans le contexte, ou sans contexte, refus", async () => {
    expect(await purge({ org: a.org }, a.org)).toBe("42501");
    expect(await purge({}, a.org)).toBe("42501");
    expect(await counts(a)).toEqual(ALL_ONE);
    expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
  });

  it("organisation avec un second membre : refus pour son owner comme pour le membre, rien n'est supprimé", async () => {
    const shared = await createOrg(auth, 1);
    const member = shared.members[0];
    await inTx(app, { org: shared.org, user: shared.owner }, (c) =>
      c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'Porto', '2027-06-01', '2027-06-03', 2, 'Europe/Lisbon')",
        [shared.org, shared.owner],
      ),
    );
    // Ligne posée par l'administration (une écriture par store_place_coordinates supprimerait la ligne expirée de A).
    await poser(admin, shared.org, `ChIJpurgeS${unique()}`, "vivante");
    expect(await purge({ org: shared.org, user: shared.owner }, shared.org)).toBe("42501");
    expect(await purge({ org: shared.org, user: member }, shared.org)).toBe("42501");
    expect(await countAs(app, { org: shared.org, user: shared.owner }, "trips")).toBe(1);
    expect(await coordonneesDe(shared.org)).toBe(1);
    expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
  });

  it("purge d'org_prototype avec son propriétaire technique : refus (déclencheur S3 de 0003), ses coordonnées restent", async () => {
    expect(await purge({ org: PROTOTYPE_ORG_ID, user: PROTOTYPE_USER_ID }, PROTOTYPE_ORG_ID)).toBe("42501");
    expect(await coordonneesPosees()).toEqual(TOUTES_POSEES);
  });

  it("avec le contexte de A et son owner : seules les lignes de A disparaissent, sauf billing et usage_ledger ; un second appel ne lève pas d'erreur", async () => {
    expect(await purge({ org: a.org, user: a.owner }, a.org)).toBeUndefined();
    const after = await counts(a);
    for (const table of PURGED_TABLES) expect(after[table], table).toBe(0);
    expect(after.billing).toBe(1);
    expect(after.usage_ledger).toBe(1);
    expect(await counts(b)).toEqual(ALL_ONE);
    // 0167, « Tests exigés » 3 : plus aucune ligne de place_coordinates de A, l'expirée comprise ; celles de B et
    // d'org_prototype intactes.
    expect(await coordonneesDe(a.org)).toBe(0);
    expect(await coordonneesPosees()).toEqual({ a: 0, aExpiree: 0, b: 1, proto: 1 });
    const deletion = await inTx(app, { org: a.org, user: a.owner }, async (c) => (await c.query("SELECT deletion_requested_at FROM organizations")).rows);
    expect(deletion).toHaveLength(1);
    expect(deletion[0].deletion_requested_at).toBeInstanceOf(Date);
    expect(await purge({ org: a.org, user: a.owner }, a.org)).toBeUndefined();
    expect(await coordonneesPosees()).toEqual({ a: 0, aExpiree: 0, b: 1, proto: 1 });
  });

  it("une ligne expirée de l'organisation, cachée à vadrouille_app, disparaît aussi ; une ligne expirée d'une autre organisation reste (0167, « Tests exigés » 3)", async () => {
    const o = await createOrg(auth);
    const autre = await createOrg(auth);
    const vivante = `ChIJpurgeV${unique()}`;
    await ecrire(app, o, [vivante]);
    // Après l'écriture par store_place_coordinates, qui supprimerait les lignes expirées.
    const expiree = `ChIJpurgeE${unique()}`;
    await poser(admin, o.org, expiree, "expiree");
    const expireeAutre = `ChIJpurgeX${unique()}`;
    await poser(admin, autre.org, expireeAutre, "expiree");
    expect(await coordonneesDe(o.org)).toBe(2);
    expect(await countAs(app, { org: o.org, user: o.owner }, "place_coordinates")).toBe(1);
    expect(await purge({ org: o.org, user: o.owner }, o.org)).toBeUndefined();
    expect(await coordonneesDe(o.org)).toBe(0);
    expect(await coordonneesDe(autre.org)).toBe(1);
    expect(await coordonneesPosees()).toEqual({ a: 0, aExpiree: 0, b: 1, proto: 1 });
  });
});

const UP_0028 = readFileSync(path.join(process.cwd(), "db/migrations/0028_purge_place_coordinates.sql"), "utf8");
const DOWN_0028 = readFileSync(path.join(process.cwd(), "db/migrations/0028_purge_place_coordinates.down.sql"), "utf8");
const LIGNE_0028 = "  DELETE FROM public.place_coordinates AS x WHERE x.organization_id = v_org;\n";

describe("0028 : montée, descente, montée (base jetable ; 0167, « Tests exigés » 5)", () => {
  it("la descente rétablit la purge de 0027, retire politique et droits, ne supprime aucune ligne ; le texte de 0028 se rejoue ; le migrateur ne rejoue rien", async () => {
    const nom = await creerBase("purge_coords_retour");
    const urlMigrateur = { VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) };
    await runMigrations(urlMigrateur);
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    const o = await createOrg(authJ);
    await ecrire(appJ, o, [`ChIJretour${unique()}`]);
    const definition = async () =>
      (await adminJ.query("SELECT pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) AS d")).rows[0].d as string;
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT pg_catalog.has_table_privilege('vadrouille_fn_purge', 'public.place_coordinates', 'DELETE') AS droit_delete,
                  pg_catalog.has_column_privilege('vadrouille_fn_purge', 'public.place_coordinates', 'organization_id', 'SELECT') AS droit_select,
                  pg_catalog.has_any_column_privilege('vadrouille_fn_purge', 'public.place_coordinates', 'INSERT, UPDATE, REFERENCES') AS autres_droits,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'place_coordinates') AS politiques,
                  (SELECT count(*)::int FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND policyname = 'place_coordinates_fn_purge') AS politique_purge,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%place_coordinates%' AS purge_0028,
                  pg_catalog.pg_get_functiondef('public.purge_organization_data(uuid)'::regprocedure) LIKE '%reminder_relays%' AS purge_0027,
                  (SELECT pg_catalog.pg_get_userbyid(p.proowner) FROM pg_catalog.pg_proc p WHERE p.oid = 'public.purge_organization_data(uuid)'::regprocedure) AS proprietaire,
                  pg_catalog.has_function_privilege('vadrouille_account_admin', 'public.purge_organization_data(uuid)', 'EXECUTE') AS execution,
                  pg_catalog.has_schema_privilege('vadrouille_fn_purge', 'public', 'CREATE') AS creation,
                  (SELECT count(*)::int FROM pg_catalog.pg_auth_members m
                   WHERE m.roleid = 'vadrouille_fn_purge'::regrole AND m.member = 'vadrouille_migrator'::regrole AND (m.set_option OR m.inherit_option)) AS appartenance,
                  (SELECT count(*)::int FROM public.place_coordinates WHERE organization_id = $1) AS lignes`,
          [o.org],
        )
      ).rows[0];
    const monte = {
      droit_delete: true,
      droit_select: true,
      autres_droits: false,
      politiques: 8,
      politique_purge: 1,
      purge_0028: true,
      purge_0027: true,
      proprietaire: "vadrouille_fn_purge",
      execution: true,
      creation: false,
      appartenance: 0,
      lignes: 1,
    };
    const descendu = { ...monte, droit_delete: false, droit_select: false, politiques: 7, politique_purge: 0, purge_0028: false };
    expect(await etat()).toEqual(monte);
    const definitionMontee = await definition();
    expect(definitionMontee).toContain(LIGNE_0028);

    /** Texte SQL dans une transaction du migrateur ; code SQLSTATE si elle échoue (transaction annulée). */
    const jouer = async (texte: string): Promise<string | undefined> => {
      await migrateur.query("BEGIN");
      try {
        await migrateur.query(texte);
        expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
        await migrateur.query("COMMIT");
        return undefined;
      } catch (e) {
        await migrateur.query("ROLLBACK");
        return (e as { code?: string }).code;
      }
    };

    // 1. Descente : purge de 0027 à l'identique (la seule ligne de 0028 en moins), politique et droits retirés, la ligne reste.
    expect(await jouer(DOWN_0028)).toBeUndefined();
    expect(await etat()).toEqual(descendu);
    expect(await definition()).toBe(definitionMontee.replace(LIGNE_0028, ""));
    // La purge de 0027 passe sans nommer place_coordinates (aucun 42501) ; la ligne de l'organisation reste.
    await inTx(appJ, { org: o.org, user: o.owner }, (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    expect(await etat()).toEqual(descendu);

    // 2. Texte de 0028 rejoué (forme d'une migration corrective vers l'avant) : tout est rétabli, aucune ligne touchée.
    expect(await jouer(UP_0028)).toBeUndefined();
    expect(await etat()).toEqual(monte);
    expect(await definition()).toBe(definitionMontee);

    // 3. Montée par le migrateur : 0028 est au journal, rien n'est rejoué.
    await runMigrations(urlMigrateur);
    expect(await etat()).toEqual(monte);

    // 4. La purge de 0028 supprime alors la ligne restée (second appel admis pour une organisation déjà marquée).
    await inTx(appJ, { org: o.org, user: o.owner }, (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    expect(await etat()).toEqual({ ...monte, lignes: 0 });
  });
});
