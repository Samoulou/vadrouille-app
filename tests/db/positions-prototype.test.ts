import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { EchecEcritureProgramme, ecrireProgramme, verrouS8Leve } from "@/adapters/prototype-ecriture";
import type { EcritureProgrammePrototype } from "@/contracts/prototype-ecriture";
import { decouperProgramme, type PositionLieu } from "@/prototype/decoupage";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { attempt, closeAll, connect, createOrg, type DbClient, type Org, poserExecution, unique } from "./helpers";

/**
 * Écriture des positions du prototype (décision 0052 § 1 : S10, fonction du § 1.7, droits du § 1.9, module du
 * § 1.10, « Tests imposés » et « Harnais des tests sous verrou » ; 0055, section 8, ligne P0r3c ; migration
 * `0005_prototype_coordinates_run` ; déverrouillage par `0006_deverrouillage_positions_prototype`, 0056 § 4.5).
 *
 * - Fonction appelée par l'administration, qui a `EXECUTE` de droit ; exécutions posées dans des transactions annulées.
 * - Module `src/adapters/prototype-ecriture.ts` : il écrit sur la base migrée sous `vadrouille_prototype` (`EXECUTE`
 *   accordé par la migration 0006), avec de vrais `COMMIT` et `ROLLBACK`.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_PROGRAMME = readFileSync(path.join(RACINE, "prototype/programmes-test/proto_test_20261012_1.json"), "utf8");
const APPEL = "SELECT public.store_prototype_coordinates($1, $2, $3, $4)";

let admin: DbClient;
let a: Org;
let app: DbClient;
let proto: DbClient;

beforeAll(async () => {
  admin = await connect("admin");
  a = await createOrg(await connect("auth"));
  app = await connect("app");
  proto = await connect("p0");
});

afterAll(closeAll);

/** Transaction d'administration toujours annulée. */
async function annulee<T>(client: DbClient, fn: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

/** Exécution posée et validée (le module ouvre sa propre transaction). */
async function executionValidee(client: DbClient, statut: "en_cours" | "programme_ecrit" | "arretee" = "en_cours"): Promise<string> {
  await client.query("BEGIN");
  try {
    const id = await poserExecution(client, { organisation: PROTOTYPE_ORG_ID, statut });
    await client.query("COMMIT");
    return id;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

/** Programme de test aux `placeId` propres à l'appel (aucune interaction entre tests), positions sentinelles. */
function entree(runId: string, lat = 12.5): EcritureProgrammePrototype & { placeIds: string[] } {
  const prefixe = `S${unique()}_`;
  const programme = ProgrammeReduitSchema.parse(JSON.parse(SOURCE_PROGRAMME.replaceAll("SENTINELLE_PLACE_ID_", prefixe)));
  const { contenu, positions } = decouperProgramme(programme);
  const sentinelles = new Map<string, PositionLieu>([...positions.keys()].map((placeId, i) => [placeId, { lat, lng: 40 + i }]));
  return { runId, programme: contenu, positions: sentinelles, mode: "walk", trajets: new Map(), placeIds: [...positions.keys()].sort() };
}

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

const lignes = async (client: DbClient, placeIds: string[]) =>
  (
    await client.query("SELECT place_id, lat, lng, organization_id::text AS org FROM public.place_coordinates WHERE place_id = ANY($1::text[]) ORDER BY place_id", [
      placeIds,
    ])
  ).rows;

const etat = async (client: DbClient, runId: string) => ({
  statut: (await client.query("SELECT status FROM prototype.runs WHERE id = $1", [runId])).rows[0]?.status,
  programmes: Number((await client.query("SELECT count(*) AS n FROM prototype.programmes WHERE run_id = $1", [runId])).rows[0].n),
});

describe("fonctions: store_prototype_coordinates liée à une exécution en cours (0052 § 1.7)", () => {
  it("une seule forme, à quatre paramètres, sans paramètre d'heure ni d'organisation ; SECURITY DEFINER de vadrouille_fn_coords", async () => {
    const { rows } = await admin.query(
      `SELECT pg_catalog.pg_get_function_identity_arguments(p.oid) AS args, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proconfig
       FROM pg_catalog.pg_proc p WHERE p.proname = 'store_prototype_coordinates' ORDER BY p.oid`,
    );
    expect(rows).toEqual([
      {
        args: "p_run_id uuid, p_place_id text, p_lat double precision, p_lng double precision",
        prosecdef: true,
        owner: "vadrouille_fn_coords",
        proconfig: ["search_path=pg_catalog, pg_temp"],
      },
    ]);
  });

  it("exécution inconnue, close (programme_ecrit, arretee) ou d'une autre organisation : refusée, rien n'est écrit", async () => {
    await annulee(admin, async () => {
      const placeId = `Sref${unique()}`;
      const cas = [
        randomUUID(),
        await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, statut: "programme_ecrit" }),
        await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, statut: "arretee" }),
        await poserExecution(admin, { organisation: a.org }),
      ];
      for (const runId of cas) expect((await attempt(admin, APPEL, [runId, placeId, 10, 10])).code, runId).toBe("42501");
      expect((await admin.query("SELECT count(*) AS n FROM public.place_coordinates WHERE place_id = $1", [placeId])).rows[0].n).toBe("0");
    });
  });

  it("identifiant de lieu, latitude ou longitude hors forme : refusés (22023)", async () => {
    await annulee(admin, async () => {
      const runId = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
      for (const placeId of ["", "a b", "x'y", "é", "a".repeat(257), null]) {
        expect((await attempt(admin, APPEL, [runId, placeId, 10, 10])).code, String(placeId)).toBe("22023");
      }
      for (const [lat, lng] of [
        [90.5, 0],
        [-90.5, 0],
        [0, 180.5],
        [0, -180.5],
        ["NaN", 0],
        [0, "Infinity"],
        [null, 0],
        [0, null],
      ]) {
        expect((await attempt(admin, APPEL, [runId, "Sforme", lat, lng])).code, `${lat} ${lng}`).toBe("22023");
      }
      expect((await attempt(admin, APPEL, [runId, "a".repeat(256), 90, -180])).code).toBeUndefined();
    });
  });

  it("heures posées depuis started_at ; une ligne vivante d'expiration plus tardive n'est ni remplacée ni raccourcie", async () => {
    await annulee(admin, async () => {
      // Contexte d'une autre organisation : la ligne va quand même à org_prototype.
      await admin.query("SELECT set_config('app.organization_id', $1, true)", [a.org]);
      const tot = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, debut: "pg_catalog.now() - interval '2 hours'" });
      const tard = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, debut: "pg_catalog.now() - interval '1 hour'" });
      const placeId = `Sheure${unique()}`;
      const lire = async (runId: string) =>
        (
          await admin.query(
            `SELECT c.organization_id::text AS org, c.lat, c.fetched_at = r.started_at AS debut, c.expires_at = r.started_at + interval '29 days' AS a29
             FROM public.place_coordinates c, prototype.runs r WHERE c.place_id = $1 AND r.id = $2`,
            [placeId, runId],
          )
        ).rows;
      await admin.query(APPEL, [tot, placeId, 1, 1]);
      expect(await lire(tot)).toEqual([{ org: PROTOTYPE_ORG_ID, lat: 1, debut: true, a29: true }]);
      // Même exécution : même expiration, la ligne est gardée telle quelle (≥).
      await admin.query(APPEL, [tot, placeId, 2, 2]);
      expect(await lire(tot)).toEqual([{ org: PROTOTYPE_ORG_ID, lat: 1, debut: true, a29: true }]);
      // Exécution commencée plus tard : expiration plus tardive, la ligne est remplacée.
      await admin.query(APPEL, [tard, placeId, 3, 3]);
      expect(await lire(tard)).toEqual([{ org: PROTOTYPE_ORG_ID, lat: 3, debut: true, a29: true }]);
      // L'exécution commencée plus tôt ne raccourcit pas la ligne de la plus tardive.
      await admin.query(APPEL, [tot, placeId, 4, 4]);
      expect(await lire(tard)).toEqual([{ org: PROTOTYPE_ORG_ID, lat: 3, debut: true, a29: true }]);
    });
  });

  it("p0: heure des positions indépendante de la durée (deux exécutions de même début, durées différentes)", async () => {
    const debut = new Date(Date.now() - 10 * 60_000).toISOString();
    const placeId = `Sduree${unique()}`;
    const ecrire = () =>
      annulee(admin, async () => {
        const runId = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID, debut: `'${debut}'::timestamptz` });
        await admin.query(APPEL, [runId, placeId, 5, 5]);
        return (await admin.query("SELECT fetched_at, expires_at, now() AS fin FROM public.place_coordinates WHERE place_id = $1", [placeId])).rows[0];
      });
    const courte = await ecrire();
    await new Promise((r) => setTimeout(r, 1_100));
    const longue = await ecrire();
    expect(longue.fin.getTime()).toBeGreaterThan(courte.fin.getTime());
    expect(longue.fetched_at).toEqual(courte.fetched_at);
    expect(longue.expires_at).toEqual(courte.expires_at);
    expect(courte.fetched_at.toISOString()).toBe(debut);
    expect(courte.expires_at.getTime() - courte.fetched_at.getTime()).toBe(29 * 24 * 3_600_000);
  });
});

describe("migrations: aucune appartenance résiduelle à vadrouille_fn_coords (0052, « Tests imposés »)", () => {
  it("seule l'appartenance de l'amorçage reste : vadrouille_migrator, ADMIN sans INHERIT ni SET", async () => {
    const { rows } = await admin.query(
      `SELECT pg_catalog.pg_get_userbyid(m.member) AS member, m.admin_option, m.inherit_option, m.set_option
       FROM pg_catalog.pg_auth_members m WHERE m.roleid = 'vadrouille_fn_coords'::regrole`,
    );
    expect(rows).toEqual([{ member: "vadrouille_migrator", admin_option: true, inherit_option: false, set_option: false }]);
  });
});

describe("droits de vadrouille_fn_coords sur prototype.runs (0052 § 1.9)", () => {
  it("politique de lecture des seules exécutions en cours d'org_prototype ; aucune autre politique pour ce rôle dans le schéma", async () => {
    const { rows } = await admin.query(
      `SELECT tablename, policyname, cmd, qual FROM pg_catalog.pg_policies
       WHERE schemaname = 'prototype' AND 'vadrouille_fn_coords' = ANY(roles)`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ tablename: "runs", policyname: "runs_fn_coords_select", cmd: "SELECT" });
    expect(rows[0].qual).toContain("5e1f0000-0000-4000-8000-000000000001");
    expect(rows[0].qual).toContain("'en_cours'");
  });
});

describe("p0: positions et programme écrits ensemble ou pas du tout (module, base migrée)", () => {
  it("réussite : positions des seuls placeId du programme, depuis l'entrée ; programme sans positions ; exécution programme_ecrit", async () => {
    const runId = await executionValidee(admin);
    const e = entree(runId, 21.5);
    const { programmeId } = await ecrireProgramme(e, pool(proto));
    const ecrites = await lignes(admin, e.placeIds);
    expect(ecrites.map((l) => l.place_id)).toEqual(e.placeIds);
    for (const ligne of ecrites) {
      expect(ligne).toMatchObject({ org: PROTOTYPE_ORG_ID, lat: 21.5, lng: e.positions.get(ligne.place_id)?.lng });
    }
    const heures = await admin.query(
      `SELECT bool_and(c.fetched_at = r.started_at AND c.expires_at = r.started_at + interval '29 days') AS ok
       FROM public.place_coordinates c, prototype.runs r WHERE c.place_id = ANY($1::text[]) AND r.id = $2`,
      [e.placeIds, runId],
    );
    expect(heures.rows[0].ok).toBe(true);
    const programme = await admin.query("SELECT id, contenu ? 'positions' AS avec_positions, expires_at FROM prototype.programmes WHERE run_id = $1", [runId]);
    expect(programme.rows).toHaveLength(1);
    expect(programme.rows[0]).toMatchObject({ id: programmeId, avec_positions: false });
    expect(JSON.stringify(programme.rows[0])).not.toContain("21.5");
    expect((await etat(admin, runId)).statut).toBe("programme_ecrit");
    // Écrire une seconde fois pour la même exécution (désormais close) : refusé, rien de plus.
    await expect(ecrireProgramme(entree(runId), pool(proto))).rejects.toMatchObject({ code: "base", sqlstate: "42501" });
  });

  it.each([
    ["(a) après les appels à la fonction, avant l'insertion du programme", "INSERT INTO prototype.programmes"],
    ["(b) après l'insertion du programme, avant le passage à programme_ecrit", "UPDATE prototype.runs"],
  ])("échec forcé %s : aucune position, aucun programme, exécution toujours en cours", async (_cas, debutRequete) => {
    const runId = await executionValidee(admin);
    const e = entree(runId);
    let appelsFonction = 0;
    const echec = ecrireProgramme(
      e,
      pool(proto, (texte) => {
        if (texte.includes("store_prototype_coordinates")) appelsFonction += 1;
        if (texte.startsWith(debutRequete)) throw Object.assign(new Error("panne simulée"), { code: "08006" });
      }),
    );
    await expect(echec).rejects.toBeInstanceOf(EchecEcritureProgramme);
    await expect(echec).rejects.toMatchObject({ code: "base", sqlstate: "08006" });
    expect(appelsFonction).toBe(e.placeIds.length);
    expect(await lignes(admin, e.placeIds)).toEqual([]);
    expect(await etat(admin, runId)).toEqual({ statut: "en_cours", programmes: 0 });
  });

  it("exécution arrêtée entre-temps : refus de la fonction, rien n'est écrit", async () => {
    const runId = await executionValidee(admin, "arretee");
    const e = entree(runId);
    await expect(ecrireProgramme(e, pool(proto))).rejects.toMatchObject({ code: "base", sqlstate: "42501" });
    expect(await lignes(admin, e.placeIds)).toEqual([]);
    expect(await etat(admin, runId)).toEqual({ statut: "arretee", programmes: 0 });
  });

  it("base migrée (droit accordé par 0006) : verrouS8Leve vrai pour vadrouille_prototype, faux pour un rôle sans droit (0056 § 4.5)", async () => {
    expect(await verrouS8Leve(pool(proto))).toBe(true);
    expect(await verrouS8Leve(pool(app))).toBe(false);
  });
});
