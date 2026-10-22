import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, countAs, type DbClient, inTx, type SeedIds, seedOrganization } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Ligne d'exécution du recalcul par lot (B10b-migration, migration `0015_recalcul_lot`, décision 0119 § 1.1, § 1.2 et
 * § 5.2, « Conséquences ») : `base_version` et `deck_closure_id` nulles hors `batch` et non nulles pour `batch` ; clé
 * étrangère composée vers la clôture, dans l'organisation ; une seconde ligne `batch` pour la même clôture refusée, de
 * même qu'une seconde ligne `batch` en cours pour le même voyage ; purge du compte qui vide les lignes `batch` avant les
 * clôtures ; retour arrière sur une base jetable, sans perte de données. Chaque test d'écriture se connecte avec
 * `vadrouille_app` (contexte de l'organisation) ; la purge, avec `vadrouille_account_admin`.
 */

let app: DbClient;
let auth: DbClient;
let a: SeedIds;
let b: SeedIds;

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const ctx = (org: SeedIds) => ({ org: org.org, user: org.owner });

const INSERT_EXECUTION =
  "INSERT INTO generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, finished_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id";

/** Clôture du tri de l'exécution `preview` peuplée, à une position libre ; renvoie son identifiant. */
async function cloture(c: DbClient, org: SeedIds): Promise<string> {
  const { rows } = await c.query(
    "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', $4, gen_random_uuid()) RETURNING id",
    [org.org, org.trip, org.generationRun, Math.floor(Math.random() * 1e9) + 1],
  );
  return rows[0].id as string;
}

/** Ferme les lignes `batch` en cours du voyage (index « une en cours par voyage » libre pour le test). */
async function fermerLots(c: DbClient, org: SeedIds): Promise<void> {
  await c.query("UPDATE generation_runs SET phase = 'failed', finished_at = now() WHERE trip_id = $1 AND kind = 'batch' AND finished_at IS NULL", [org.trip]);
}

describe("recalcul par lot : migration appliquée (0119 § 1.1, § 1.2)", () => {
  it("colonnes nullables, contraintes et index uniques partiels présents", async () => {
    const colonnes = await app.query(
      "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'generation_runs' AND column_name IN ('base_version', 'deck_closure_id') ORDER BY column_name",
    );
    expect(colonnes.rows).toEqual([
      { column_name: "base_version", data_type: "integer", is_nullable: "YES" },
      { column_name: "deck_closure_id", data_type: "uuid", is_nullable: "YES" },
    ]);
    const contraintes = await app.query(
      "SELECT conname, contype FROM pg_catalog.pg_constraint WHERE conname IN ('generation_runs_batch_check', 'generation_runs_deck_closure_fk', 'deck_closures_organization_id_id_unique') ORDER BY conname",
    );
    expect(contraintes.rows).toEqual([
      { conname: "deck_closures_organization_id_id_unique", contype: "u" },
      { conname: "generation_runs_batch_check", contype: "c" },
      { conname: "generation_runs_deck_closure_fk", contype: "f" },
    ]);
    const index = await app.query(
      "SELECT indexname FROM pg_catalog.pg_indexes WHERE schemaname = 'public' AND indexname IN ('generation_runs_organization_id_trip_id_deck_closure_id_idx', 'generation_runs_organization_id_trip_id_batch_active_idx') ORDER BY indexname",
    );
    expect(index.rows.map((r) => r.indexname)).toEqual([
      "generation_runs_organization_id_trip_id_batch_active_idx",
      "generation_runs_organization_id_trip_id_deck_closure_id_idx",
    ]);
  });
});

describe("recalcul par lot : version de base et clôture si et seulement si batch (0119 § 1.1 point 1)", () => {
  it("batch avec les deux colonnes admis ; batch sans l'une d'elles refusé ; hors batch, l'une d'elles refusée", async () => {
    await inTx(app, ctx(a), async (c) => {
      await fermerLots(c, a);
      const k = await cloture(c, a);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, k, null])).code, "batch complet").toBeUndefined();
      await fermerLots(c, a);
      const cas: [string, unknown[]][] = [
        ["batch sans version de base", ["batch", "queued", null, await cloture(c, a), null]],
        ["batch sans clôture", ["batch", "queued", 1, null, null]],
        ["preview avec version de base", ["preview", "preparing", 1, null, null]],
        ["preview avec clôture", ["preview", "preparing", null, k, null]],
        ["full avec les deux", ["full", "queued", 1, k, null]],
        ["mini avec clôture", ["mini", "queued", null, k, null]],
      ];
      for (const [nom, valeurs] of cas) {
        expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, ...valeurs])).code, nom).toBe("23514");
      }
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "preview", "preparing", null, null, null])).code, "preview sans les deux").toBeUndefined();
      // Une ligne batch ne perd jamais sa version de base ni sa clôture, et une autre ligne ne devient pas batch.
      const lot = (await c.query(INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 2, await cloture(c, a), null])).rows[0].id as string;
      expect((await attempt(c, "UPDATE generation_runs SET base_version = NULL WHERE id = $1", [lot])).code).toBe("23514");
      expect((await attempt(c, "UPDATE generation_runs SET kind = 'preview' WHERE id = $1", [lot])).code).toBe("23514");
      expect((await attempt(c, "UPDATE generation_runs SET kind = 'batch' WHERE id = $1", [a.generationRun])).code).toBe("23514");
    });
  });

  it("une ligne batch ne vise jamais la clôture d'une autre organisation, ni une clôture absente (clé étrangère composée)", async () => {
    await inTx(app, ctx(a), async (c) => {
      await fermerLots(c, a);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, b.rows.deck_closures, null])).code).toBe("23503");
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, randomUUID(), null])).code).toBe("23503");
    });
  });
});

describe("recalcul par lot : unicités (0119 § 1.2 point 1)", () => {
  it("au plus un recalcul par tri clos : une seconde ligne batch pour la même clôture est refusée, même la première close", async () => {
    await inTx(app, ctx(a), async (c) => {
      await fermerLots(c, a);
      const k = await cloture(c, a);
      await c.query(INSERT_EXECUTION, [a.org, a.trip, "batch", "failed", 1, k, new Date()]);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 2, k, null])).code).toBe("23505");
      // Création idempotente de B10b-serveur : `ON CONFLICT DO NOTHING`, aucune seconde ligne.
      const rejeu = await c.query(
        "INSERT INTO generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id) VALUES ($1, $2, 'batch', 'queued', 1, $3) ON CONFLICT DO NOTHING",
        [a.org, a.trip, k],
      );
      expect(rejeu.rowCount).toBe(0);
      expect(Number((await c.query("SELECT count(*) AS n FROM generation_runs WHERE deck_closure_id = $1", [k])).rows[0].n)).toBe(1);
    });
  });

  it("au plus un recalcul en cours par voyage : une seconde ligne batch en cours est refusée ; la première close, admise", async () => {
    await inTx(app, ctx(a), async (c) => {
      await fermerLots(c, a);
      const premiere = (await c.query(INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, await cloture(c, a), null])).rows[0].id as string;
      const k2 = await cloture(c, a);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, k2, null])).code).toBe("23505");
      // Les exécutions hors batch en cours ne comptent pas.
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "preview", "preparing", null, null, null])).code).toBeUndefined();
      await c.query("UPDATE generation_runs SET phase = 'ready', finished_at = now() WHERE id = $1", [premiere]);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, k2, null])).code).toBeUndefined();
      // Rouvrir la première ferait deux recalculs en cours : refusé.
      expect((await attempt(c, "UPDATE generation_runs SET finished_at = NULL WHERE id = $1", [premiere])).code).toBe("23505");
    });
  });

  it("un recalcul en cours dans une autre organisation ne bloque pas", async () => {
    await inTx(app, ctx(b), async (c) => {
      await fermerLots(c, b);
      expect((await attempt(c, INSERT_EXECUTION, [b.org, b.trip, "batch", "queued", 1, await cloture(c, b), null])).code).toBeUndefined();
    });
    await inTx(app, ctx(a), async (c) => {
      await fermerLots(c, a);
      expect((await attempt(c, INSERT_EXECUTION, [a.org, a.trip, "batch", "queued", 1, await cloture(c, a), null])).code).toBeUndefined();
    });
  });
});

/** Organisation peuplée avec une ligne `batch` (en cours) qui vise une clôture, et une proposition de cette ligne. */
async function avecLot(appClient: DbClient, authClient: DbClient): Promise<SeedIds & { lot: string }> {
  const d = await seedOrganization(authClient, appClient);
  const lot = await inTx(appClient, ctx(d), async (c) => {
    const id = (await c.query(INSERT_EXECUTION, [d.org, d.trip, "batch", "queued", 1, d.rows.deck_closures, null])).rows[0].id as string;
    await c.query(
      `INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content)
       VALUES ($1, $2, $3, 'deck', 1, 'proposal', 1, '10:00', 'activity', $4)`,
      [d.org, d.trip, id, JSON.stringify({ id: "etape-lot", kind: "activity" })],
    );
    return id;
  });
  return { ...d, lot };
}

describe("recalcul par lot : purge du compte (0119 § 5.2)", () => {
  it("la purge vide lignes batch, clôtures et autres exécutions, sans toucher une autre organisation", async () => {
    const d = await avecLot(app, auth);
    const avantB = { runs: await countAs(app, ctx(b), "generation_runs"), closures: await countAs(app, ctx(b), "deck_closures") };
    await inTx(app, ctx(d), (c) => c.query("SELECT purge_organization_data($1)", [d.org]), "vadrouille_account_admin");
    for (const table of ["proposals", "generation_runs", "deck_closures", "preference_prompts", "preference_signals", "trips"]) {
      expect(await countAs(app, ctx(d), table), table).toBe(0);
    }
    expect(await countAs(app, ctx(b), "generation_runs")).toBe(avantB.runs);
    expect(await countAs(app, ctx(b), "deck_closures")).toBe(avantB.closures);
  });
});

describe("recalcul par lot : retour arrière (0015_recalcul_lot.down.sql, base jetable)", () => {
  it("index et contraintes retirés, colonnes et valeurs gardées, purge de 0014 rétablie et fonctionnelle, lecture de kind retirée", async () => {
    const nom = await creerBase("recalcul_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    try {
      const d = await avecLot(appJ, authJ);
      const retour = readFileSync(path.join(process.cwd(), "db/migrations/0015_recalcul_lot.down.sql"), "utf8");
      await migrateur.query("BEGIN");
      await migrateur.query(retour);
      expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
      await migrateur.query("COMMIT");

      const restes = await adminJ.query(
        `SELECT conname AS nom FROM pg_catalog.pg_constraint WHERE conname IN ('generation_runs_batch_check', 'generation_runs_deck_closure_fk', 'deck_closures_organization_id_id_unique')
         UNION ALL SELECT indexname FROM pg_catalog.pg_indexes WHERE indexname LIKE 'generation_runs_organization_id_trip_id_%' AND indexname NOT IN ('generation_runs_organization_id_trip_id_started_at_idx', 'generation_runs_organization_id_trip_id_request_id_idx', 'generation_runs_organization_id_trip_id_full_idx')`,
      );
      expect(restes.rows).toEqual([]);
      const ligne = await adminJ.query("SELECT kind, base_version, deck_closure_id FROM generation_runs WHERE id = $1", [d.lot]);
      expect(ligne.rows).toEqual([{ kind: "batch", base_version: 1, deck_closure_id: d.rows.deck_closures }]);
      const droit = await adminJ.query("SELECT pg_catalog.has_column_privilege('vadrouille_fn_purge', 'public.generation_runs', 'kind', 'SELECT') AS peut");
      expect(droit.rows[0].peut).toBe(false);
      const appartenance = await adminJ.query(
        "SELECT count(*)::int AS n FROM pg_catalog.pg_auth_members m WHERE m.roleid = 'vadrouille_fn_purge'::regrole AND m.member = 'vadrouille_migrator'::regrole AND m.grantor = 'vadrouille_migrator'::regrole",
      );
      expect(appartenance.rows[0].n).toBe(0);

      // Purge de 0014 (clôtures avant exécutions) : elle passe malgré la ligne batch, la clé étrangère étant retirée.
      await inTx(appJ, ctx(d), (c) => c.query("SELECT purge_organization_data($1)", [d.org]), "vadrouille_account_admin");
      for (const table of ["proposals", "generation_runs", "deck_closures", "trips"]) {
        expect(await countAs(appJ, ctx(d), table), table).toBe(0);
      }
    } finally {
      await Promise.all([appJ, authJ, adminJ, migrateur].map((c) => c.end().catch(() => undefined)));
    }
  });
});
