import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, type DbClient, inTx, type SeedIds, seedOrganization } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0022_feedback_signalements (plan du MVP, M5-D, ticket 896 ; décision 0147 § 2 et § 6.4 point 3).
 *
 * `feedback` durcie pour les signalements d'une étape : `request_id` et son index unique partiel (idempotence), index
 * unique partiel de déduplication `(organization_id, trip_id, target_stop_id, reason, COALESCE(place_id, ''))` des
 * lignes `scope = 'stop'`, motif fermé, aucun texte, étape exigée d'un signalement d'étape, aucun `UPDATE` pour
 * `vadrouille_app`. Isolation éprouvée sous `vadrouille_app` avec le contexte de `withOrg` (`inTx`), comme
 * `tests/db/isolation.test.ts` : une autre organisation ne lit ni n'écrit un signalement, et ses clés ne se heurtent
 * jamais à celles d'une autre. Puis la colonne `lieux` d'`autocomplete_daily_counts`, sous le seul rôle
 * `vadrouille_autocomplete_counter`, et la descente de 0022 sur une base jetable.
 *
 * Les insertions reprennent la forme que M5c écrira (0147 § 2, « Écriture ») : `INSERT … ON CONFLICT DO NOTHING`, sans
 * cible, qui couvre les deux index uniques partiels.
 */

const MOTIFS = ["closed", "hours", "wrongPlace", "price", "other"] as const;
const COMPTEUR = "vadrouille_autocomplete_counter";
const JOUR = "(pg_catalog.now() AT TIME ZONE 'UTC')::date";

type Signalement = { requestId?: string | null; stop?: string | null; reason?: string; placeId?: string | null; scope?: string; text?: string | null };

/** `INSERT` d'un signalement de l'organisation `ids`, forme de M5c ; rend la requête et ses paramètres. */
function signalement(ids: SeedIds, s: Signalement = {}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO public.feedback (organization_id, trip_id, target_stop_id, place_id, reason, text, scope, created_by, request_id)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT DO NOTHING RETURNING id`,
    params: [
      ids.org,
      ids.trip,
      s.stop === undefined ? "j2-3" : s.stop,
      s.placeId === undefined ? "ChIJ-lieu-de-test" : s.placeId,
      s.reason ?? "closed",
      s.text ?? null,
      s.scope ?? "stop",
      ids.owner,
      s.requestId === undefined ? randomUUID() : s.requestId,
    ],
  };
}

let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: SeedIds;
let b: SeedIds;
const ctx = (ids: SeedIds) => ({ org: ids.org, user: ids.owner });

/** Insère sous `vadrouille_app` dans le contexte de `ids` ; rend le nombre de lignes écrites. */
async function inserer(ids: SeedIds, s: Signalement = {}, sous: SeedIds = ids): Promise<number> {
  return inTx(app, ctx(sous), async (c) => {
    const { sql, params } = signalement(ids, s);
    return (await c.query(sql, params)).rowCount ?? 0;
  });
}

/** Code SQLSTATE d'une instruction de `vadrouille_app` dans le contexte de `ids` (point de sauvegarde), ou `undefined`. */
async function codeSous(ids: SeedIds, sql: string, params: unknown[] = []): Promise<string | undefined> {
  return inTx(app, ctx(ids), async (c) => (await attempt(c, sql, params)).code);
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await seedOrganization(auth, app);
  b = await seedOrganization(auth, app);
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

describe("feedback (0022) : forme", () => {
  it("colonne request_id uuid nullable ; deux index uniques partiels ; quatre CHECK nommées", async () => {
    const colonne = await admin.query(
      `SELECT pg_catalog.format_type(atttypid, atttypmod) AS type, attnotnull FROM pg_catalog.pg_attribute
       WHERE attrelid = 'public.feedback'::regclass AND attname = 'request_id' AND NOT attisdropped`,
    );
    expect(colonne.rows).toEqual([{ type: "uuid", attnotnull: false }]);
    const index = await admin.query(
      `SELECT c.relname AS nom, i.indisunique AS unique, pg_catalog.pg_get_expr(i.indpred, i.indrelid) AS predicat
       FROM pg_catalog.pg_index i JOIN pg_catalog.pg_class c ON c.oid = i.indexrelid
       WHERE i.indrelid = 'public.feedback'::regclass AND i.indisunique AND NOT i.indisprimary ORDER BY 1`,
    );
    expect(index.rows).toEqual([
      { nom: "feedback_organization_id_trip_id_request_id_idx", unique: true, predicat: "(request_id IS NOT NULL)" },
      { nom: "feedback_stop_dedup_idx", unique: true, predicat: "(scope = 'stop'::text)" },
    ]);
    const cle = await admin.query("SELECT pg_catalog.pg_get_indexdef('public.feedback_stop_dedup_idx'::regclass) AS def");
    expect(cle.rows[0].def).toContain("(organization_id, trip_id, target_stop_id, reason, COALESCE(place_id, ''::text))");
    const contraintes = await admin.query(
      "SELECT conname FROM pg_catalog.pg_constraint WHERE conrelid = 'public.feedback'::regclass AND contype = 'c' AND convalidated ORDER BY 1",
    );
    expect(contraintes.rows.map((r) => r.conname)).toEqual(["feedback_reason_check", "feedback_scope_check", "feedback_target_stop_check", "feedback_text_check"]);
  });

  it("RLS de feedback inchangée : activée, forcée, politique type de vadrouille_app et politique de la purge", async () => {
    const rls = await admin.query("SELECT relrowsecurity, relforcerowsecurity FROM pg_catalog.pg_class WHERE oid = 'public.feedback'::regclass");
    expect(rls.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const { rows } = await admin.query("SELECT roles::text[] AS roles FROM pg_catalog.pg_policies WHERE schemaname = 'public' AND tablename = 'feedback' ORDER BY 1");
    expect(rows.flatMap((r) => r.roles as string[]).sort()).toEqual(["vadrouille_app", "vadrouille_fn_purge"]);
  });
});

describe("feedback (0022) : contraintes", () => {
  it("les cinq motifs de STOP_REPORT_REASONS passent ; un autre motif est refusé (23514)", async () => {
    for (const reason of MOTIFS) expect(await inserer(a, { reason, stop: `motif-${reason}` }), reason).toBe(1);
    for (const reason of ["notMyStyle", "Closed", "", "autre"]) {
      const { sql, params } = signalement(a, { reason });
      expect(await codeSous(a, sql, params), reason).toBe("23514");
    }
  });

  it("aucun texte : text non nul refusé (23514), même vide, pour un signalement d'étape comme de voyage", async () => {
    for (const s of [{ text: "Fermé depuis mars" }, { text: "" }, { text: "x", scope: "trip", stop: null }]) {
      const { sql, params } = signalement(a, s);
      expect(await codeSous(a, sql, params), JSON.stringify(s)).toBe("23514");
    }
  });

  it("un signalement d'étape exige son étape (23514) ; un signalement de voyage s'en passe", async () => {
    const { sql, params } = signalement(a, { stop: null });
    expect(await codeSous(a, sql, params)).toBe("23514");
    expect(await inserer(a, { scope: "trip", stop: null, placeId: null })).toBe(1);
  });
});

describe("feedback (0022) : idempotence et déduplication", () => {
  it("même request_id rejoué : une seule ligne, ON CONFLICT DO NOTHING n'écrit rien ; sans ON CONFLICT, 23505", async () => {
    const requestId = randomUUID();
    expect(await inserer(a, { requestId, stop: "rejeu-1" })).toBe(1);
    // Rejeu, même pour une autre étape (le premier enregistrement fait foi).
    expect(await inserer(a, { requestId, stop: "rejeu-2" })).toBe(0);
    const { sql, params } = signalement(a, { requestId, stop: "rejeu-3" });
    expect(await codeSous(a, sql.replace(" ON CONFLICT DO NOTHING", ""), params)).toBe("23505");
    const { rows } = await inTx(app, ctx(a), (c) => c.query("SELECT target_stop_id FROM public.feedback WHERE request_id = $1", [requestId]));
    expect(rows).toEqual([{ target_stop_id: "rejeu-1" }]);
  });

  it("request_id nul : non soumis à l'index d'idempotence", async () => {
    expect(await inserer(a, { requestId: null, scope: "trip", stop: null, placeId: null, reason: "other" })).toBe(1);
    expect(await inserer(a, { requestId: null, scope: "trip", stop: null, placeId: null, reason: "other" })).toBe(1);
  });

  it("même motif, même étape, même lieu, autre request_id : dédoublonné ; autre motif, autre lieu ou autre étape : nouvelle ligne", async () => {
    expect(await inserer(a, { stop: "dedup", reason: "hours", placeId: "ChIJ-A" })).toBe(1);
    expect(await inserer(a, { stop: "dedup", reason: "hours", placeId: "ChIJ-A" })).toBe(0);
    expect(await inserer(a, { stop: "dedup", reason: "price", placeId: "ChIJ-A" })).toBe(1);
    // Identifiant d'étape réutilisé par une autre version pour un autre lieu (0142 § 5.1).
    expect(await inserer(a, { stop: "dedup", reason: "hours", placeId: "ChIJ-B" })).toBe(1);
    expect(await inserer(a, { stop: "dedup-autre", reason: "hours", placeId: "ChIJ-A" })).toBe(1);
  });

  it("étape sans placeId : COALESCE(place_id, '') la dédoublonne aussi", async () => {
    expect(await inserer(a, { stop: "sans-lieu", reason: "wrongPlace", placeId: null })).toBe(1);
    expect(await inserer(a, { stop: "sans-lieu", reason: "wrongPlace", placeId: null })).toBe(0);
  });

  it("signalements de voyage (scope trip) : hors de la clé de déduplication", async () => {
    for (let i = 0; i < 2; i++) expect(await inserer(a, { scope: "trip", stop: "voyage", reason: "closed" })).toBe(1);
  });
});

describe("feedback (0022) : isolation entre organisations", () => {
  it("B ne lit aucun signalement de A, ni par organisation, ni par voyage, ni par request_id", async () => {
    const requestId = randomUUID();
    expect(await inserer(a, { requestId, stop: "iso-lecture" })).toBe(1);
    await inTx(app, ctx(b), async (c) => {
      for (const [sql, param] of [
        ["SELECT count(*)::int AS n FROM public.feedback WHERE organization_id = $1", a.org],
        ["SELECT count(*)::int AS n FROM public.feedback WHERE trip_id = $1", a.trip],
        ["SELECT count(*)::int AS n FROM public.feedback WHERE request_id = $1", requestId],
      ] as const) {
        expect((await c.query(sql, [param])).rows[0].n, sql).toBe(0);
      }
      const { rows } = await c.query("SELECT DISTINCT organization_id FROM public.feedback");
      expect(rows).toEqual([{ organization_id: b.org }]);
    });
  });

  it("B n'écrit aucun signalement pour A ni sur le voyage de A (42501), même par ON CONFLICT DO NOTHING", async () => {
    const pourA = signalement(a, { stop: "iso-ecriture" });
    expect(await codeSous(b, pourA.sql, pourA.params)).toBe("42501");
    // Organisation de B, voyage de A : la clé composée vers trips ne voit pas le voyage de A (RLS) ; refus.
    const croise = signalement({ ...a, org: b.org, owner: b.owner }, { stop: "iso-ecriture" });
    expect(await codeSous(b, croise.sql, croise.params)).toMatch(/^(42501|23503)$/);
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM public.feedback WHERE target_stop_id = 'iso-ecriture'");
    expect(rows[0].n).toBe(0);
  });

  it("clés indépendantes par organisation : même request_id et même clé de déduplication chez B, nouvelle ligne", async () => {
    const requestId = randomUUID();
    const s = { requestId, stop: "iso-cle", reason: "closed", placeId: "ChIJ-commun" };
    expect(await inserer(a, s)).toBe(1);
    expect(await inserer(b, s)).toBe(1);
    // Un doublon de A ne révèle rien à B, et réciproquement : chacun rejoue chez soi seulement.
    expect(await inserer(b, s)).toBe(0);
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM public.feedback WHERE request_id = $1", [requestId]);
    expect(rows[0].n).toBe(2);
  });
});

describe("feedback (0022) : droits", () => {
  it("vadrouille_app ne peut pas mettre à jour feedback, même sa propre ligne et sans changement de valeur (42501)", async () => {
    const requestId = randomUUID();
    expect(await inserer(a, { requestId, stop: "maj" })).toBe(1);
    for (const sql of [
      "UPDATE public.feedback SET reason = 'other' WHERE request_id = $1",
      "UPDATE public.feedback SET text = NULL WHERE request_id = $1",
      "UPDATE public.feedback SET request_id = request_id WHERE request_id = $1",
    ]) {
      expect(await codeSous(a, sql, [requestId]), sql).toBe("42501");
    }
    const upsert = signalement(a, { requestId, stop: "maj" });
    expect(await codeSous(a, upsert.sql.replace("ON CONFLICT DO NOTHING", "ON CONFLICT (organization_id, trip_id, request_id) WHERE request_id IS NOT NULL DO UPDATE SET reason = 'other'"), upsert.params)).toBe("42501");
    const droits = await admin.query(
      `SELECT pg_catalog.has_table_privilege('vadrouille_app', 'public.feedback', 'UPDATE') AS table_update,
              pg_catalog.has_any_column_privilege('vadrouille_app', 'public.feedback', 'UPDATE') AS colonne_update,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.feedback', 'SELECT') AS lecture,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.feedback', 'INSERT') AS ajout,
              pg_catalog.has_table_privilege('vadrouille_app', 'public.feedback', 'DELETE') AS suppression`,
    );
    expect(droits.rows[0]).toEqual({ table_update: false, colonne_update: false, lecture: true, ajout: true, suppression: false });
  });

  it("aucun autre rôle n'a reçu de droit sur feedback : la purge garde DELETE, rien de plus", async () => {
    const { rows } = await admin.query(
      `SELECT r.rolname FROM pg_catalog.pg_roles r
       WHERE r.rolname LIKE 'vadrouille\\_%' AND r.rolname <> ALL (ARRAY['vadrouille_owner', 'vadrouille_migrator'])
         AND (pg_catalog.has_table_privilege(r.oid, 'public.feedback', 'UPDATE, TRUNCATE')
              OR pg_catalog.has_any_column_privilege(r.oid, 'public.feedback', 'UPDATE'))
       ORDER BY 1`,
    );
    expect(rows).toEqual([]);
  });
});

describe("autocomplete_daily_counts.lieux (0022)", () => {
  /** Une transaction de `vadrouille_app` sous `role` (`null` : sans `SET LOCAL ROLE`) ; code SQLSTATE ou `undefined` ; annulée. */
  async function sousCompteur(sql: string, role: string | null = COMPTEUR): Promise<string | undefined> {
    await app.query("BEGIN");
    try {
      if (role !== null) await app.query(`SET LOCAL ROLE ${role}`);
      await app.query(sql);
      return undefined;
    } catch (error) {
      return (error as { code?: string }).code;
    } finally {
      await app.query("ROLLBACK");
    }
  }

  it("colonne entière non nulle à défaut 0 ; CHECK (lieux >= 0) (23514)", async () => {
    const { rows } = await admin.query(
      `SELECT pg_catalog.format_type(atttypid, atttypmod) AS type, attnotnull, pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS defaut
       FROM pg_catalog.pg_attribute a LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
       WHERE a.attrelid = 'public.autocomplete_daily_counts'::regclass AND a.attname = 'lieux'`,
    );
    expect(rows).toEqual([{ type: "integer", attnotnull: true, defaut: "0" }]);
    await admin.query("BEGIN");
    try {
      await expect(admin.query(`INSERT INTO public.autocomplete_daily_counts (day, lieux) VALUES (${JOUR} + 400, -1)`)).rejects.toMatchObject({ code: "23514" });
    } finally {
      await admin.query("ROLLBACK");
    }
  });

  it("le rôle des compteurs crée la ligne du jour (lieux à 0) et incrémente lieux ; il n'insère jamais lieux ni ne touche day", async () => {
    await app.query("BEGIN");
    try {
      await app.query(`SET LOCAL ROLE ${COMPTEUR}`);
      // Jour lointain : n'interfère pas avec les compteurs du jour des autres fichiers (exécutés en série).
      await app.query(`INSERT INTO public.autocomplete_daily_counts (day) VALUES (${JOUR} + 500) ON CONFLICT (day) DO NOTHING`);
      const { rows } = await app.query(
        `UPDATE public.autocomplete_daily_counts SET lieux = lieux + 1 WHERE day = ${JOUR} + 500 AND lieux < $1::integer RETURNING lieux, suggestions, choix`,
        [150],
      );
      expect(rows).toEqual([{ lieux: 1, suggestions: 0, choix: 0 }]);
    } finally {
      await app.query("ROLLBACK");
    }
    expect(await sousCompteur(`INSERT INTO public.autocomplete_daily_counts (day, lieux) VALUES (${JOUR} + 501, 0)`)).toBe("42501");
    expect(await sousCompteur("UPDATE public.autocomplete_daily_counts SET day = day, lieux = lieux")).toBe("42501");
  });

  it("vadrouille_app sans SET LOCAL ROLE, vadrouille_auth et le rôle du plafond des e-mails n'atteignent pas lieux (42501)", async () => {
    expect(await sousCompteur("UPDATE public.autocomplete_daily_counts SET lieux = lieux", null)).toBe("42501");
    await expect(auth.query("UPDATE public.autocomplete_daily_counts SET lieux = lieux")).rejects.toMatchObject({ code: "42501" });
    expect(await sousCompteur("UPDATE public.autocomplete_daily_counts SET lieux = lieux", "vadrouille_mail_counter")).toBe("42501");
    const { rows } = await admin.query(
      `SELECT r.rolname FROM pg_catalog.pg_roles r
       WHERE r.rolname LIKE 'vadrouille\\_%' AND pg_catalog.has_column_privilege(r.oid, 'public.autocomplete_daily_counts', 'lieux', 'UPDATE')
       ORDER BY 1`,
    );
    // vadrouille_migrator hérite de vadrouille_owner, propriétaire (RLS forcée : aucune ligne visible).
    expect(rows.map((r) => r.rolname)).toEqual([COMPTEUR, "vadrouille_migrator", "vadrouille_owner"]);
  });
});

const DOWN_0022 = readFileSync(path.join(process.cwd(), "db/migrations/0022_feedback_signalements.down.sql"), "utf8");

describe("0022 : retour arrière (base jetable)", () => {
  it("la descente retire UPDATE (lieux) seulement ; colonnes, valeurs, index et CHECK restent ; feedback reste sans UPDATE", async () => {
    const nom = await creerBase("feedback_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, adminJ, migrateur] = await Promise.all([connectBaseJetable("app", nom), connectBaseJetable("admin", nom), connectBaseJetable("migrator", nom)]);
    await adminJ.query(`INSERT INTO public.autocomplete_daily_counts (day, suggestions, lieux) VALUES (${JOUR}, 2, 3)`);

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0022);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");

    const essai = async (sql: string): Promise<string | undefined> => {
      await appJ.query("BEGIN");
      try {
        await appJ.query(`SET LOCAL ROLE ${COMPTEUR}`);
        await appJ.query(sql);
        return undefined;
      } catch (error) {
        return (error as { code?: string }).code;
      } finally {
        await appJ.query("ROLLBACK");
      }
    };
    expect(await essai(`UPDATE public.autocomplete_daily_counts SET lieux = lieux + 1 WHERE day = ${JOUR}`)).toBe("42501");
    // Les droits de 0021 restent entiers.
    expect(await essai(`UPDATE public.autocomplete_daily_counts SET suggestions = suggestions + 1 WHERE day = ${JOUR}`)).toBeUndefined();
    const valeurs = await adminJ.query("SELECT suggestions, choix, lieux FROM public.autocomplete_daily_counts");
    expect(valeurs.rows).toEqual([{ suggestions: 2, choix: 0, lieux: 3 }]);

    const etat = await adminJ.query(
      `SELECT (SELECT count(*)::int FROM pg_catalog.pg_attribute WHERE attrelid = 'public.feedback'::regclass AND attname = 'request_id' AND NOT attisdropped) AS request_id,
              (SELECT count(*)::int FROM pg_catalog.pg_class WHERE relname IN ('feedback_organization_id_trip_id_request_id_idx', 'feedback_stop_dedup_idx')) AS index,
              (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conname IN ('feedback_reason_check', 'feedback_text_check', 'feedback_target_stop_check', 'autocomplete_daily_counts_lieux_check')) AS checks,
              pg_catalog.has_any_column_privilege('vadrouille_app', 'public.feedback', 'UPDATE') AS feedback_update,
              pg_catalog.has_any_column_privilege('${COMPTEUR}', 'public.autocomplete_daily_counts', 'UPDATE') AS compteur_update,
              pg_catalog.has_column_privilege('${COMPTEUR}', 'public.autocomplete_daily_counts', 'lieux', 'UPDATE') AS lieux_update`,
    );
    expect(etat.rows[0]).toEqual({ request_id: 1, index: 2, checks: 4, feedback_update: false, compteur_update: true, lieux_update: false });
  });
});
