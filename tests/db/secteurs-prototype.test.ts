import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ecrireProgramme } from "@/adapters/prototype-ecriture";
import { cloreExecution, ecrireSecteurs, lireSecteurs, remplacerCandidats } from "@/adapters/prototype-travail";
import { lirePlanSecteursStocke } from "@/ai/sorties";
import { CandidatSchema } from "@/prototype/candidat";
import { decouperProgramme } from "@/prototype/decoupage";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

import { attempt, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org, poserExecution, unique } from "./helpers";

/**
 * Plan de secteurs d'une exécution du prototype et candidat enrichi (décision 0094 § 1 point 5 et § 2 point 1 ; verdict
 * de la Sécurité 0103, question 1, conditions 1 à 9 ; migration `0013_secteurs_prototype`). Chaque test se connecte avec
 * le rôle qu'il éprouve ; l'administration ne sert qu'à poser des lignes datées (déclencheurs désactivés pour sa seule
 * transaction) et à constater un résultat.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const SOURCE_PROGRAMME = readFileSync(path.join(RACINE, "prototype/programmes-test/proto_test_20261012_1.json"), "utf8");
const SHA = "a".repeat(40);
const TABLE = "prototype.run_secteurs";
const INSERT_PLAN = `INSERT INTO ${TABLE} (run_id, secteurs) VALUES ($1, $2)`;
const PLAN = {
  secteurs: [
    { nom: "Rome antique", voisins: ["Monti"], incontournables: ["Colisée", "Forum romain"] },
    { nom: "Monti", voisins: ["Rome antique"], incontournables: [] },
    { nom: "Trastevere", voisins: [], incontournables: [] },
  ],
};
const SECTEUR = PLAN.secteurs[0] as { nom: string; voisins: string[]; incontournables: string[] };

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

/** Exécution en cours posée sous `vadrouille_prototype` dans `c` (transaction ouverte, contexte d'org_prototype). */
async function executionVivante(c: DbClient): Promise<string> {
  return (await c.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'brief-test.json', 'A', $1) RETURNING id", [SHA])).rows[0].id as string;
}

/** Plan posé par l'administration (déclencheurs désactivés pour cette seule transaction, validée), vivant ou expiré. */
async function poser(expiration: "vivant" | "expire", organisation: string = PROTOTYPE_ORG_ID): Promise<{ run: string; plan: string }> {
  const expires = expiration === "vivant" ? "pg_catalog.now() + interval '1 day'" : "pg_catalog.now() - interval '1 hour'";
  await admin.query("BEGIN");
  try {
    const run = await poserExecution(admin, { organisation });
    await admin.query("SET LOCAL session_replication_role = replica");
    const plan = (
      await admin.query(`INSERT INTO ${TABLE} (organization_id, run_id, secteurs, expires_at) VALUES ($1, $2, $3, ${expires}) RETURNING id`, [organisation, run, PLAN])
    ).rows[0].id as string;
    await admin.query("COMMIT");
    return { run, plan };
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Exécution en cours posée et validée, à la phase voulue (le module ouvre sa propre transaction). */
async function executionValidee(phase: string | null = "recherche"): Promise<string> {
  await admin.query("BEGIN");
  try {
    const id = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
    await admin.query("UPDATE prototype.runs SET phase = $2 WHERE id = $1", [id, phase]);
    await admin.query("COMMIT");
    return id;
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

/** Pool minimal du module sur une connexion de test. */
function pool(client: DbClient): PoolSql {
  return {
    connect: async (): Promise<ClientSql> => ({
      query: async (texte, valeurs) => client.query(texte, valeurs ? [...valeurs] : undefined),
      release: () => undefined,
    }),
  };
}

describe("p0: plan de secteurs, clés fermées et purge (0094 § 10 ; 0103, question 1)", () => {
  it("base: run_secteurs, clés fermées à chaque niveau : chaque clé refusée, un dixième secteur, un type erroné, une taille excessive (23514)", async () => {
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const refuses: [string, unknown][] = [
        ...["raison", "requetes", "jour", "rang", "ordre", "horaire", "retenu", "verdict", "lat", "lng", "placeId", "candidats", "compteur"].map(
          (cle): [string, unknown] => [`clé ${cle} d'un secteur`, { secteurs: [{ ...SECTEUR, [cle]: cle === "raison" ? "x" : 1 }] }],
        ),
        ...["raison", "requetes", "jours", "secteurDuLogement"].map((cle): [string, unknown] => [`clé ${cle} du plan`, { ...PLAN, [cle]: [] }]),
        ["dixième secteur", { secteurs: Array.from({ length: 10 }, (_, i) => ({ ...SECTEUR, nom: `Secteur ${i}` })) }],
        ["aucun secteur", { secteurs: [] }],
        ["secteurs absents", {}],
        ["plan tableau", [PLAN]],
        ["secteurs texte", { secteurs: "Monti" }],
        ["secteur texte", { secteurs: ["Monti"] }],
        ["secteur tableau", { secteurs: [["Monti"]] }],
        ["clé manquante", { secteurs: [{ nom: "Monti", voisins: [] }] }],
        ["nom nombre", { secteurs: [{ ...SECTEUR, nom: 3 }] }],
        ["nom vide", { secteurs: [{ ...SECTEUR, nom: "" }] }],
        ["nom de 61 caractères", { secteurs: [{ ...SECTEUR, nom: "é".repeat(61) }] }],
        ["voisins texte", { secteurs: [{ ...SECTEUR, voisins: "Monti" }] }],
        ["voisin nombre", { secteurs: [{ ...SECTEUR, voisins: [1] }] }],
        ["voisin tableau", { secteurs: [{ ...SECTEUR, voisins: [["Monti"]] }] }],
        ["neuf voisins", { secteurs: [{ ...SECTEUR, voisins: Array.from({ length: 9 }, (_, i) => `V${i}`) }] }],
        ["incontournable objet", { secteurs: [{ ...SECTEUR, incontournables: [{ nom: "Colisée", lat: 41.89 }] }] }],
        ["incontournable de 81 caractères", { secteurs: [{ ...SECTEUR, incontournables: ["x".repeat(81)] }] }],
        ["taille excessive", { secteurs: Array.from({ length: 9 }, (_, i) => ({ nom: `S${i}`, voisins: [], incontournables: Array.from({ length: 62 }, (_, j) => `${"😀".repeat(79)}${i}${j}`.slice(0, 80)) })) }],
      ];
      for (const [libelle, contenu] of refuses) {
        const run = await executionVivante(proto);
        expect((await attempt(proto, INSERT_PLAN, [run, JSON.stringify(contenu)])).code, libelle).toBe("23514");
      }
      // Admis : le plan stocké (forme de `planSecteursStocke`), et ses bornes exactes.
      const admis: unknown[] = [
        PLAN,
        { secteurs: Array.from({ length: 9 }, (_, i) => ({ nom: `${"é".repeat(58)}${i}`, voisins: Array.from({ length: 8 }, (_, j) => `V${j}`), incontournables: ["x".repeat(80)] })) },
      ];
      for (const contenu of admis) {
        const run = await executionVivante(proto);
        expect((await attempt(proto, INSERT_PLAN, [run, JSON.stringify(contenu)])).code, JSON.stringify(contenu).slice(0, 60)).toBeUndefined();
        expect(lirePlanSecteursStocke((await proto.query(`SELECT secteurs FROM ${TABLE} WHERE run_id = $1`, [run])).rows[0].secteurs)).toEqual(contenu);
      }
      // Une ligne par exécution.
      const run = await executionVivante(proto);
      expect((await attempt(proto, INSERT_PLAN, [run, JSON.stringify(PLAN)])).code).toBeUndefined();
      expect((await attempt(proto, INSERT_PLAN, [run, JSON.stringify(PLAN)])).code).toBe("23505");
      // Exécution inconnue : clé étrangère composite.
      expect((await attempt(proto, INSERT_PLAN, ["5e1f0000-0000-4000-8000-0000000000cc", JSON.stringify(PLAN)])).code).toBe("23503");
    } finally {
      await proto.query("ROLLBACK");
    }
  });

  it("purge: un plan expiré est supprimé ; un plan vivant n'est pas touché ; un plan expiré n'est plus lisible avant la purge ; même fonction de purge", async () => {
    const vivant = await poser("vivant");
    const expire = await poser("expire");
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [vivant.plan])).rows).toHaveLength(1);
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [expire.plan])).rows).toHaveLength(0);
      // vadrouille_prototype ne supprime pas une ligne expirée (seule la purge le fait).
      expect((await c.query(`DELETE FROM ${TABLE} WHERE id = $1`, [expire.plan])).rowCount).toBe(0);
    });
    await purge.query("SELECT prototype.purge_expired()");
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [expire.plan])).toBe(0);
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [vivant.plan])).toBe(1);
    const { rows } = await admin.query(
      `SELECT p.pronargs, p.prosecdef, pg_catalog.pg_get_userbyid(p.proowner) AS owner, p.proconfig, p.prosrc,
              pg_catalog.has_function_privilege('vadrouille_prototype', p.oid, 'EXECUTE') AS proto,
              pg_catalog.has_function_privilege('vadrouille_prototype_purge', p.oid, 'EXECUTE') AS purge
       FROM pg_catalog.pg_proc p WHERE p.oid = 'prototype.purge_expired()'::regprocedure`,
    );
    const { prosrc, ...fonction } = rows[0];
    expect(fonction).toEqual({ pronargs: 0, prosecdef: true, owner: "vadrouille_fn_prototype_purge", proconfig: ["search_path=pg_catalog, pg_temp"], proto: false, purge: true });
    for (const table of ["trajets", "jugements", "programmes", "run_attempts", "run_candidates", "run_secteurs"]) expect(prosrc, table).toContain(`prototype.${table} `);
  });
});

describe("prototype: run_secteurs, droits et valeurs posées par la base (0103, question 1, conditions 4 et 5)", () => {
  it("vadrouille_prototype : SELECT, INSERT par colonnes (run_id, secteurs) et DELETE, aucun UPDATE ; purge : SELECT (expires_at) et DELETE ; rien pour vadrouille_app, vadrouille_share ni PUBLIC", async () => {
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
    expect(await droits("vadrouille_prototype")).toEqual(["DELETE", "INSERT", "SELECT"]);
    expect(await droits("vadrouille_fn_prototype_purge")).toEqual(["DELETE", "SELECT"]);
    for (const role of ["vadrouille_app", "vadrouille_share", "vadrouille_prototype_purge", "public"]) expect(await droits(role), role).toEqual([]);
    const colonnes = async (role: string, droit: string) =>
      (
        await admin.query(
          `SELECT a.attname FROM pg_catalog.pg_attribute a WHERE a.attrelid = '${TABLE}'::regclass AND a.attnum > 0 AND NOT a.attisdropped
             AND pg_catalog.has_column_privilege($1, '${TABLE}'::regclass, a.attname, $2) ORDER BY a.attname`,
          [role, droit],
        )
      ).rows.map((r) => r.attname as string);
    expect(await colonnes("vadrouille_prototype", "INSERT")).toEqual(["run_id", "secteurs"]);
    expect(await colonnes("vadrouille_fn_prototype_purge", "SELECT")).toEqual(["expires_at"]);
    const { rows } = await admin.query(`SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = '${TABLE}'::regclass`);
    expect(rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
  });

  it("base: valeurs fournies par l'appelant refusées ou ignorées : id, organization_id et expires_at posés par le déclencheur ; aucun UPDATE", async () => {
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [PROTOTYPE_ORG_ID]);
      const run = await executionVivante(proto);
      for (const [colonne, valeur] of [
        ["id", "gen_random_uuid()"],
        ["organization_id", `'${a.org}'::uuid`],
        ["expires_at", "pg_catalog.now() + interval '10 years'"],
      ] as const) {
        await expectRefused(proto, `INSERT INTO ${TABLE} (run_id, secteurs, ${colonne}) VALUES ($1, $2, ${valeur})`, [run, JSON.stringify(PLAN)]);
      }
      const ligne = await proto.query(
        `${INSERT_PLAN} RETURNING id, organization_id::text AS org, expires_at BETWEEN pg_catalog.now() + interval '23 hours 59 minutes' AND pg_catalog.now() + interval '24 hours' AS jour`,
        [run, JSON.stringify(PLAN)],
      );
      expect(ligne.rows[0]).toMatchObject({ org: PROTOTYPE_ORG_ID, jour: true });
      await expectRefused(proto, `UPDATE ${TABLE} SET secteurs = $2 WHERE id = $1`, [ligne.rows[0].id, JSON.stringify(PLAN)]);
      await expectRefused(proto, `UPDATE ${TABLE} SET expires_at = pg_catalog.now() + interval '1 year' WHERE id = $1`, [ligne.rows[0].id]);
      expect((await attempt(proto, `DELETE FROM ${TABLE} WHERE id = $1`, [ligne.rows[0].id])).rowCount).toBe(1);
    } finally {
      await proto.query("ROLLBACK");
    }
    // Même fournies par un rôle qui le pourrait (administration), elles sont écrasées par le déclencheur.
    await admin.query("BEGIN");
    try {
      const run = await poserExecution(admin, { organisation: PROTOTYPE_ORG_ID });
      const ecrit = await admin.query(
        `INSERT INTO ${TABLE} (id, organization_id, run_id, secteurs, expires_at)
         VALUES ('5e1f0000-0000-4000-8000-0000000000aa', $1, $2, $3, pg_catalog.now() + interval '10 years')
         RETURNING id::text, organization_id::text AS org, expires_at < pg_catalog.now() + interval '25 hours' AS jour`,
        [a.org, run, JSON.stringify(PLAN)],
      );
      expect(ecrit.rows[0].id).not.toBe("5e1f0000-0000-4000-8000-0000000000aa");
      expect(ecrit.rows[0]).toMatchObject({ org: PROTOTYPE_ORG_ID, jour: true });
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("isolation: run_secteurs d'org_prototype seulement (règle du rôle data)", () => {
  it("base: vadrouille_prototype avec un autre app.organization_id ne lit ni n'écrit hors d'org_prototype ; vadrouille_app ne lit rien", async () => {
    const autre = await poser("vivant", a.org);
    const prototype = await poser("vivant");
    for (const org of [a.org, PROTOTYPE_ORG_ID]) {
      await inTx(proto, { org }, async (c) => {
        const { rows } = await c.query(`SELECT id::text FROM ${TABLE} WHERE id = ANY($1::uuid[])`, [[autre.plan, prototype.plan]]);
        expect(rows.map((r) => r.id)).toEqual([prototype.plan]);
        expect((await c.query(`DELETE FROM ${TABLE} WHERE id = $1`, [autre.plan])).rowCount).toBe(0);
      });
    }
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [autre.plan])).toBe(1);
    // Une exécution d'une autre organisation, sans plan : la ligne serait posée dans org_prototype, la clé étrangère
    // composite refuse.
    await admin.query("BEGIN");
    let sansPlan: string;
    try {
      sansPlan = await poserExecution(admin, { organisation: a.org });
      await admin.query("COMMIT");
    } catch (error) {
      await admin.query("ROLLBACK");
      throw error;
    }
    await proto.query("BEGIN");
    try {
      await proto.query("SELECT set_config('app.organization_id', $1, true)", [a.org]);
      expect((await attempt(proto, INSERT_PLAN, [sansPlan, JSON.stringify(PLAN)])).code).toBe("23503");
    } finally {
      await proto.query("ROLLBACK");
    }
    await inTx(app, { org: a.org }, async (c) => {
      await expectRefused(c, `SELECT * FROM ${TABLE}`);
    });
  });
});

describe("p0: plan de secteurs écrit et relu par l'adaptateur, supprimé à la fin de l'exécution (module, base migrée)", () => {
  it("écriture et relecture : phase recherche seulement ; remplacement sans UPDATE ; relu tel qu'écrit et valide pour le schéma du plan restreint", async () => {
    const runId = await executionValidee("recherche");
    await ecrireSecteurs(pool(proto), runId, { secteurs: [SECTEUR] });
    await ecrireSecteurs(pool(proto), runId, PLAN);
    const relu = await lireSecteurs(pool(proto), runId);
    expect(relu).toEqual(PLAN);
    expect(lirePlanSecteursStocke(relu)).toEqual(PLAN);
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE run_id = $1`, [runId])).toBe(1);
    // Après l'ancrage : jamais écrit (0103, question 1, condition 2).
    const apres = await executionValidee("ancrage");
    await expect(ecrireSecteurs(pool(proto), apres, PLAN)).rejects.toMatchObject({ code: "phase_deja_passee" });
    expect(await lireSecteurs(pool(proto), apres)).toBeUndefined();
  });

  it("p0: plan de secteurs supprimé avec une exécution arrêtée", async () => {
    const runId = await executionValidee("recherche");
    await ecrireSecteurs(pool(proto), runId, PLAN);
    await cloreExecution(pool(proto), runId, "pipeline_failed");
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE run_id = $1`, [runId])).toBe(0);
    expect((await admin.query("SELECT status FROM prototype.runs WHERE id = $1", [runId])).rows[0].status).toBe("arretee");
  });

  it("p0: plan de secteurs supprimé à l'écriture du programme, dans la même transaction que les candidats (constat A de 0103)", async () => {
    const runId = await executionValidee("recherche");
    await ecrireSecteurs(pool(proto), runId, PLAN);
    const prefixe = `S${unique()}_`;
    const tripId = `proto_se${unique()}_1`;
    const programme = ProgrammeReduitSchema.parse(JSON.parse(SOURCE_PROGRAMME.replaceAll("SENTINELLE_PLACE_ID_", prefixe).replaceAll("proto_test_20261012_1", tripId)));
    const { contenu, positions } = decouperProgramme(programme);
    await ecrireProgramme({ runId, programme: contenu, positions, mode: "walk", trajets: new Map() }, pool(proto));
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE run_id = $1`, [runId])).toBe(0);
    expect(await compter("SELECT count(*) AS n FROM prototype.run_candidates WHERE run_id = $1", [runId])).toBe(0);
    expect((await admin.query("SELECT status FROM prototype.runs WHERE id = $1", [runId])).rows[0].status).toBe("programme_ecrit");
  });

  it("candidat enrichi écrit tel quel par l'adaptateur (quinze clés admises par la base)", async () => {
    const runId = await executionValidee("recherche");
    const candidat = CandidatSchema.parse({
      id: "c_001",
      nom: "Colisée",
      resume: "Amphithéâtre antique.",
      categorie: "heritage",
      typeEtape: "activity",
      source: { url: "https://guide.example/colisee", date: "2026-09-01", classe: "independante" },
      aReserver: true,
      secteur: "Rome antique",
      incontournable: "Colisée",
      prix: "18 EUR, billet combiné",
      horaires: "9h-19h",
      conseil: "Réserver le premier créneau.",
    });
    await remplacerCandidats(pool(proto), runId, [{ cle: "c_001", candidat, placeId: null }]);
    const lu = (await admin.query("SELECT candidat FROM prototype.run_candidates WHERE run_id = $1", [runId])).rows[0].candidat;
    expect(lu).toEqual(candidat);
  });
});
