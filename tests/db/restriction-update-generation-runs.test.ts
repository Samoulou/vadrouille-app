import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { colonnesAccordees, releverEcrituresGenerationRuns } from "../support/releve-generation-runs";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, type DbClient, inTx, type SeedIds, seedOrganization } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0016_restriction_update_generation_runs (décision 0120 § 8, S8, point 3, forme de 0112 § 6 ; ticket #672) :
 * sous `vadrouille_app`, contexte de l'organisation, un `UPDATE` de `base_version` ou de `deck_closure_id` est refusé
 * (`42501`), de même que celui des autres colonnes figées (`kind`, `organization_id`, `trip_id`, `request_id`,
 * `started_at`, `id`) ; chaque `UPDATE` relevé dans `src/` (`tests/support/releve-generation-runs.ts`) reste permis ;
 * chaque colonne accordée s'écrit sur une ligne `batch` ; migration inverse sur une base jetable : l'`UPDATE` de table
 * revient, aucune ligne n'est touchée.
 */

const racine = process.cwd();
const SQL_0016 = readFileSync(path.join(racine, "db/migrations/0016_restriction_update_generation_runs.sql"), "utf8");
const DOWN_0016 = readFileSync(path.join(racine, "db/migrations/0016_restriction_update_generation_runs.down.sql"), "utf8");
const ACCORDEES = colonnesAccordees(SQL_0016);
const FIGEES = ["base_version", "deck_closure_id", "kind", "organization_id", "trip_id", "request_id", "started_at", "id"];

let app: DbClient;
let auth: DbClient;
let a: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const ctx = (org: SeedIds) => ({ org: org.org, user: org.owner });

/** Ligne `batch` en cours, par un seul `INSERT` qui porte sa version de base et sa clôture (rien d'autre en cours). */
async function ligneLot(c: DbClient, org: SeedIds): Promise<string> {
  await c.query("UPDATE generation_runs SET phase = 'failed', finished_at = now() WHERE trip_id = $1 AND kind = 'batch' AND finished_at IS NULL", [org.trip]);
  const cloture = (
    await c.query(
      "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', $4, gen_random_uuid()) RETURNING id",
      [org.org, org.trip, org.generationRun, Math.floor(Math.random() * 1e9) + 1],
    )
  ).rows[0].id as string;
  return (
    await c.query(
      "INSERT INTO generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id) VALUES ($1, $2, 'batch', 'queued', 1, $3) RETURNING id",
      [org.org, org.trip, cloture],
    )
  ).rows[0].id as string;
}

describe("generation_runs : UPDATE de vadrouille_app restreint aux colonnes du code (0120 S8)", () => {
  it("plus d'UPDATE de table ; UPDATE par colonnes exactement sur la liste de la migration", async () => {
    const table = await app.query("SELECT pg_catalog.has_table_privilege('vadrouille_app', 'public.generation_runs', 'UPDATE') AS peut");
    expect(table.rows[0].peut).toBe(false);
    const { rows } = await app.query(
      `SELECT a.attname FROM pg_catalog.pg_attribute a
       WHERE a.attrelid = 'public.generation_runs'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('vadrouille_app', a.attrelid, a.attnum, 'UPDATE')
       ORDER BY a.attname`,
    );
    expect(rows.map((r) => r.attname)).toEqual([...ACCORDEES].sort());
  });

  it("UPDATE de base_version ou de deck_closure_id d'une ligne batch par vadrouille_app : refusé (42501), ligne inchangée", async () => {
    await inTx(app, ctx(a), async (c) => {
      const lot = await ligneLot(c, a);
      const autre = (
        await c.query(
          "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', $4, gen_random_uuid()) RETURNING id",
          [a.org, a.trip, a.generationRun, Math.floor(Math.random() * 1e9) + 1],
        )
      ).rows[0].id as string;
      expect((await attempt(c, "UPDATE generation_runs SET base_version = 2 WHERE id = $1", [lot])).code, "base_version").toBe("42501");
      expect((await attempt(c, "UPDATE generation_runs SET deck_closure_id = $2 WHERE id = $1", [lot, autre])).code, "deck_closure_id").toBe("42501");
      expect((await attempt(c, "UPDATE generation_runs SET base_version = base_version, deck_closure_id = deck_closure_id WHERE id = $1", [lot])).code).toBe("42501");
      // Une affectation permise ne rend pas permise une affectation figée de la même requête.
      expect((await attempt(c, "UPDATE generation_runs SET updated_at = now(), base_version = 3 WHERE id = $1", [lot])).code).toBe("42501");
      const ligne = await c.query("SELECT base_version, deck_closure_id FROM generation_runs WHERE id = $1", [lot]);
      expect(ligne.rows[0].base_version).toBe(1);
      expect(ligne.rows[0].deck_closure_id).not.toBe(autre);
    });
  });

  it("UPDATE de chaque autre colonne figée (kind, organization_id, trip_id, request_id, started_at, id) : refusé (42501)", async () => {
    await inTx(app, ctx(a), async (c) => {
      const lot = await ligneLot(c, a);
      for (const colonne of FIGEES) {
        for (const ligne of [lot, a.generationRun]) {
          expect((await attempt(c, `UPDATE generation_runs SET ${colonne} = ${colonne} WHERE id = $1`, [ligne])).code, `${colonne} sur ${ligne}`).toBe("42501");
        }
      }
    });
  });

  it("chaque colonne accordée s'écrit sur une ligne batch et sur une ligne preview (une ligne touchée)", async () => {
    await inTx(app, ctx(a), async (c) => {
      const lot = await ligneLot(c, a);
      for (const colonne of ACCORDEES) {
        for (const ligne of [lot, a.generationRun]) {
          const resultat = await attempt(c, `UPDATE generation_runs SET ${colonne} = ${colonne} WHERE id = $1`, [ligne]);
          expect(resultat.code, `${colonne} sur ${ligne}`).toBeUndefined();
          expect(resultat.rowCount, `${colonne} sur ${ligne}`).toBe(1);
        }
      }
    });
  });

  it("chaque UPDATE de generation_runs relevé dans src/ est permis à vadrouille_app (paramètres nuls, aucune ligne touchée)", async () => {
    const { updates } = releverEcrituresGenerationRuns(racine);
    expect(updates.length).toBeGreaterThanOrEqual(26);
    await inTx(app, ctx(a), async (c) => {
      for (const update of updates) {
        const resultat = await attempt(c, update.texte, Array.from({ length: update.parametres }, () => null));
        expect(resultat.code, `${update.fichier}:${update.ligne}`).toBeUndefined();
        expect(resultat.rowCount, `${update.fichier}:${update.ligne}`).toBe(0);
      }
    });
  });
});

describe("generation_runs : retour arrière de 0016 (base jetable)", () => {
  it("l'UPDATE de table revient, le droit par colonnes de 0016 disparaît, aucune ligne touchée ; 0016 rejouée le repose", async () => {
    const nom = await creerBase("restriction_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    try {
      const d = await seedOrganization(authJ, appJ);
      const lot = await inTx(appJ, ctx(d), (c) => ligneLot(c, d));
      const lignes = async () => (await adminJ.query("SELECT id, kind, phase, base_version, deck_closure_id FROM generation_runs ORDER BY id")).rows;
      const avant = await lignes();
      const droitsApp = async () =>
        (
          await adminJ.query(
            `SELECT a.attname FROM pg_catalog.pg_attribute a, LATERAL aclexplode(a.attacl) x
             WHERE a.attrelid = 'public.generation_runs'::regclass AND x.grantee = 'vadrouille_app'::regrole AND x.privilege_type = 'UPDATE'
             ORDER BY a.attname`,
          )
        ).rows.map((r) => r.attname as string);
      const droitTable = async () =>
        (await adminJ.query("SELECT pg_catalog.has_table_privilege('vadrouille_app', 'public.generation_runs', 'UPDATE') AS peut")).rows[0].peut as boolean;
      expect(await droitsApp()).toEqual([...ACCORDEES].sort());
      expect(await droitTable()).toBe(false);

      await migrateur.query("BEGIN");
      await migrateur.query(DOWN_0016);
      expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
      await migrateur.query("COMMIT");

      expect(await droitsApp()).toEqual([]);
      expect(await droitTable()).toBe(true);
      expect(await lignes()).toEqual(avant);
      await inTx(appJ, ctx(d), async (c) => {
        expect((await attempt(c, "UPDATE generation_runs SET base_version = base_version WHERE id = $1", [lot])).code).toBeUndefined();
      });

      await migrateur.query("BEGIN");
      await migrateur.query(SQL_0016);
      await migrateur.query("COMMIT");
      expect(await droitsApp()).toEqual([...ACCORDEES].sort());
      expect(await droitTable()).toBe(false);
      await inTx(appJ, ctx(d), async (c) => {
        expect((await attempt(c, "UPDATE generation_runs SET base_version = base_version WHERE id = $1", [lot])).code).toBe("42501");
      });
    } finally {
      await Promise.all([appJ, authJ, adminJ, migrateur].map((c) => c.end().catch(() => undefined)));
    }
  });
});
