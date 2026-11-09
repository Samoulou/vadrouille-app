// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0027_rappels_relais (R-D, ticket 1061 ; décision 0162 § 2) : la purge du compte est celle de 0026, dernière
 * version sur `main`, avec les relais supprimés juste avant les réclamations et les accords (S-R6) ; la contrainte unique
 * de `reminder_consents` précède la clé étrangère qui s'y appuie ; aucun droit `UPDATE` ni `DELETE` pour l'application ;
 * le `CHECK` de `claimed_run_id` est le même dans le schéma Drizzle et dans le SQL, et accepte les identifiants réels du
 * Workflow SDK ; la migration inverse ne retire que les droits de `vadrouille_app` (0162 § 2 point 10). Les effets en
 * base : `tests/db/rappels-relais.test.ts`.
 */
const RACINE = process.cwd();
const MIGRATIONS = path.join(RACINE, "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0027_rappels_relais.sql");
const DOWN = lire("0027_rappels_relais.down.sql");
const SQL_0026 = lire("0026_apres_voyage.sql");
const SCHEMA = readFileSync(path.join(RACINE, "db/schema/business.ts"), "utf8");
const sansCommentaires = (texte: string) =>
  texte
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("--") || ligne.startsWith("--> statement-breakpoint"))
    .join("\n");
const instructions = (texte: string) =>
  sansCommentaires(texte)
    .split("--> statement-breakpoint")
    .map((i) => i.trim())
    .filter(Boolean);

/** Corps de `purge_organization_data` (de `CREATE OR REPLACE FUNCTION` au `$$;` qui le ferme). */
function corpsPurge(texte: string): string {
  const debut = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
  expect(debut).toBeGreaterThan(-1);
  const fin = texte.indexOf("$$;", texte.indexOf("AS $$", debut) + 5);
  return texte.slice(debut, fin + 3);
}

/** Motif du `CHECK` de `claimed_run_id` écrit dans `texte` (entre apostrophes après `~`). */
function motifRun(texte: string): string {
  const m = texte.match(/(?:"claimed_run_id"|\.claimedRunId\}) ~ '([^']+)'/);
  expect(m, "CHECK de claimed_run_id").not.toBeNull();
  return m?.[1] ?? "";
}

describe("migration 0027 : forme (0162 § 2)", () => {
  it("contrainte unique de reminder_consents avant la clé étrangère composée ; table créée sous vadrouille_owner", () => {
    const liste = instructions(SQL);
    expect(liste[0]).toBe("SET LOCAL ROLE vadrouille_owner;");
    const unique = liste.findIndex((i) => i.includes('ADD CONSTRAINT "reminder_consents_organization_id_id_key" UNIQUE("organization_id","id")'));
    const cle = liste.findIndex((i) => i.includes('ADD CONSTRAINT "reminder_relays_consent_fk"'));
    const table = liste.findIndex((i) => i.startsWith('CREATE TABLE "reminder_relays"'));
    expect(unique).toBeGreaterThan(0);
    expect(unique).toBeLessThan(cle);
    expect(table).toBeLessThan(cle);
    expect(liste.slice(0, cle + 1).some((i) => i.includes("RESET ROLE"))).toBe(false);
    expect(liste[cle]).toContain('REFERENCES "public"."reminder_consents"("organization_id","id") ON DELETE no action ON UPDATE no action;');
  });

  it("CHECK de claimed_run_id identique dans le schéma Drizzle et le SQL ; borne lâche (64 caractères au plus) ; identifiants réels du SDK acceptés", () => {
    const motif = motifRun(SQL);
    expect(motif).toBe("^wrun_[0-9A-Za-z]{1,59}$");
    expect(motifRun(SCHEMA)).toBe(motif);
    const re = new RegExp(motif);
    // Monde local (`monotonicUlid`, comme le repli `ulid()` de @workflow/core 5.1.0) et monde Vercel (`createRunId`,
    // ULID marqué de la région) : `wrun_` puis 26 caractères Crockford base 32.
    for (const id of ["wrun_01M6ZWVHNG68KA5EAJ41PT0PCP", "wrun_41M6ZWVHNG50W7N2HSG8R3DG98"]) expect(re.test(id), id).toBe(true);
    for (const id of ["01M6ZWVHNG68KA5EAJ41PT0PCP", "wrun_", "wrun_01M6-ZWVH", `wrun_${"A".repeat(60)}`, "step_01M6ZWVHNG68KA5EAJ41PT0PCP"]) {
      expect(re.test(id), id).toBe(false);
    }
    expect(SQL).toContain('CONSTRAINT "reminder_relays_relay_n_check" CHECK ("reminder_relays"."relay_n" >= 1)');
  });

  it("aucune colonne de texte libre ni JSON hors de claimed_run_id ; aucune ligne lue, modifiée ni supprimée hors de la purge ; aucun déclencheur", () => {
    const texte = sansCommentaires(SQL);
    const table = texte.slice(texte.indexOf('CREATE TABLE "reminder_relays"'), texte.indexOf(");", texte.indexOf('CREATE TABLE "reminder_relays"')));
    expect([...table.matchAll(/^\t"(\w+)" (\w+)/gm)].map((m) => `${m[1]} ${m[2]}`)).toEqual([
      "organization_id uuid",
      "consent_id uuid",
      "relay_n smallint",
      "claimed_run_id text",
      "claimed_at timestamp",
    ]);
    expect(texte).not.toMatch(/jsonb|NOT VALID|CREATE TRIGGER|CREATE FUNCTION/);
    const horsPurge = texte.replace(corpsPurge(texte), "");
    expect(horsPurge).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+(public\.)?"?\w+"?\s+SET|INSERT\s+INTO)\b/i);
  });
});

describe("migration 0027 : droits et politiques (propositions S-R1, S-R2)", () => {
  it("vadrouille_app : SELECT et INSERT des quatre colonnes ; ni UPDATE, ni DELETE, ni TRUNCATE ; purge : SELECT (organization_id), DELETE", () => {
    const texte = sansCommentaires(SQL);
    expect(texte).toContain("GRANT SELECT ON public.reminder_relays TO vadrouille_app;");
    expect(texte).toContain("GRANT INSERT (organization_id, consent_id, relay_n, claimed_run_id) ON public.reminder_relays TO vadrouille_app;");
    expect(texte).toContain("GRANT SELECT (organization_id), DELETE ON public.reminder_relays TO vadrouille_fn_purge;");
    const droitsApp = [...texte.matchAll(/GRANT ([^;]*) ON public\.reminder_relays TO vadrouille_app;/g)].map((m) => m[1]);
    expect(droitsApp).toEqual(["SELECT", "INSERT (organization_id, consent_id, relay_n, claimed_run_id)"]);
    expect(texte).not.toMatch(/TRUNCATE|GRANT ALL|claimed_at\) ON|UPDATE \(/);
  });

  it("politiques : lecture et insertion par l'accord de la personne de la transaction, insertion seulement pour un accord non retiré", () => {
    const texte = sansCommentaires(SQL);
    const accord =
      "organization_id = public.app_current_org() AND EXISTS (\n    SELECT 1 FROM public.reminder_consents AS c\n    WHERE c.organization_id = reminder_relays.organization_id AND c.id = reminder_relays.consent_id\n      AND c.user_id = public.app_current_user()";
    expect(texte).toContain(`FOR SELECT TO vadrouille_app\n  USING (${accord}));`);
    expect(texte).toContain(`FOR INSERT TO vadrouille_app\n  WITH CHECK (${accord} AND c.withdrawn_at IS NULL));`);
    expect(texte.match(/CREATE POLICY reminder_relays_\w+/g)).toEqual(["CREATE POLICY reminder_relays_app_select", "CREATE POLICY reminder_relays_app_insert", "CREATE POLICY reminder_relays_fn_purge"]);
    expect(texte).toContain("ALTER TABLE public.reminder_relays ENABLE ROW LEVEL SECURITY;");
    expect(texte).toContain("ALTER TABLE public.reminder_relays FORCE ROW LEVEL SECURITY;");
  });
});

describe("migration 0027 : purge du compte (0162 § 2 point 8, S-R6)", () => {
  it("corps de 0026 (dernière version sur main), relais supprimés avant les réclamations et les accords", () => {
    const attendu = corpsPurge(SQL_0026).replace(
      "  DELETE FROM public.reminder_sends AS x",
      "  DELETE FROM public.reminder_relays AS x WHERE x.organization_id = v_org;\n  DELETE FROM public.reminder_sends AS x",
    );
    expect(corpsPurge(SQL)).toBe(attendu);
    const corps = corpsPurge(SQL);
    const position = (table: string) => corps.indexOf(`DELETE FROM public.${table} `);
    expect(position("reminder_relays")).toBeLessThan(position("reminder_sends"));
    expect(position("reminder_sends")).toBeLessThan(position("reminder_consents"));
  });

  it("recréée sous vadrouille_fn_purge, droits d'exécution réécrits, appartenance temporaire retirée", () => {
    const texte = sansCommentaires(SQL);
    const role = texte.indexOf("SET LOCAL ROLE vadrouille_fn_purge;");
    const purge = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
    const fin = texte.indexOf("RESET ROLE;", purge);
    expect(role).toBeGreaterThan(-1);
    expect(role).toBeLessThan(purge);
    expect(texte.indexOf("REVOKE ALL ON FUNCTION public.purge_organization_data(uuid) FROM PUBLIC;")).toBeLessThan(fin);
    expect(texte.indexOf("GRANT EXECUTE ON FUNCTION public.purge_organization_data(uuid) TO vadrouille_account_admin;")).toBeLessThan(fin);
    expect(texte.trimEnd().endsWith("REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;")).toBe(true);
  });
});

describe("migration 0027 : retour arrière sans suppression de données (0162 § 2 point 10)", () => {
  it("la descente ne retire que les droits de vadrouille_app, sans DELETE, DROP, ALTER ni purge", () => {
    expect(instructions(DOWN)).toEqual([
      "SET LOCAL ROLE vadrouille_owner;",
      "REVOKE INSERT (organization_id, consent_id, relay_n, claimed_run_id) ON public.reminder_relays FROM vadrouille_app;",
      "REVOKE SELECT ON public.reminder_relays FROM vadrouille_app;",
      "RESET ROLE;",
    ]);
  });
});
