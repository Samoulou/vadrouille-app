// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration du recalcul par lot (B10b-migration, décision 0119 § 1.1, § 1.2 et § 5.2) : ordre de la purge du compte
 * (lignes `batch` avant les clôtures, puis les autres exécutions) ; migration inverse sans suppression de données, qui
 * retire la clé étrangère avant de rétablir la purge de 0014 recopiée à l'identique.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0015_recalcul_lot.sql");
const DOWN = lire("0015_recalcul_lot.down.sql");
const SQL_0014 = lire("0014_tri_enregistre.sql");

/** Corps de `purge_organization_data` (de `CREATE OR REPLACE FUNCTION` au `$$;` qui le ferme). */
function corpsPurge(texte: string): string {
  const debut = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
  expect(debut).toBeGreaterThan(-1);
  const fin = texte.indexOf("$$;", texte.indexOf("AS $$", debut) + 5);
  return texte.slice(debut, fin + 3);
}

/** Instructions `DELETE` de la purge, dans l'ordre. */
const suppressions = (texte: string) => [...corpsPurge(texte).matchAll(/DELETE FROM public\.(\w+) AS x WHERE ([^;]+);/g)].map((m) => `${m[1]} ${m[2]}`);

describe("migration 0015 : ordre de la purge du compte (0119 § 5.2)", () => {
  const ordre = suppressions(SQL);
  const rang = (ligne: string) => {
    const i = ordre.indexOf(ligne);
    expect(i, ligne).toBeGreaterThan(-1);
    return i;
  };
  const BATCH = "generation_runs x.organization_id = v_org AND x.kind = 'batch'";
  const CLOTURES = "deck_closures x.organization_id = v_org";
  const EXECUTIONS = "generation_runs x.organization_id = v_org";

  it("lignes batch, puis clôtures, puis les autres exécutions", () => {
    expect(rang(BATCH)).toBeLessThan(rang(CLOTURES));
    expect(rang(CLOTURES)).toBeLessThan(rang(EXECUTIONS));
  });

  it("les tables qui visent une exécution sont vidées avant les lignes batch", () => {
    for (const table of ["proposals", "event_occurrences", "candidates", "research_runs", "preference_signals", "preference_prompts"]) {
      expect(rang(`${table} x.organization_id = v_org`), table).toBeLessThan(rang(BATCH));
    }
  });

  it("mêmes tables que la purge de 0014, plus la seule suppression des lignes batch", () => {
    const avant = suppressions(SQL_0014);
    expect(ordre.filter((l) => l !== BATCH).sort()).toEqual([...avant].sort());
    expect(ordre).toHaveLength(avant.length + 1);
  });

  it("vadrouille_fn_purge lit kind, seule colonne accordée de plus", () => {
    expect(SQL).toContain("GRANT SELECT (kind) ON public.generation_runs TO vadrouille_fn_purge;");
    expect(SQL.match(/^GRANT SELECT/gm)).toHaveLength(1);
  });
});

describe("migration 0015 : contraintes (0119 § 1.1 et § 1.2)", () => {
  it("contrainte unique de deck_closures avant la clé étrangère qui la vise", () => {
    const unique = SQL.indexOf('ADD CONSTRAINT "deck_closures_organization_id_id_unique" UNIQUE("organization_id","id")');
    const fk = SQL.indexOf('REFERENCES "public"."deck_closures"("organization_id","id")');
    expect(unique).toBeGreaterThan(-1);
    expect(fk).toBeGreaterThan(unique);
  });

  it("deux index uniques partiels sur les lignes batch", () => {
    expect(SQL).toMatch(/CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_deck_closure_id_idx" ON "generation_runs" USING btree \("organization_id","trip_id","deck_closure_id"\) WHERE "generation_runs"\."kind" = 'batch';/);
    expect(SQL).toMatch(/CREATE UNIQUE INDEX "generation_runs_organization_id_trip_id_batch_active_idx" ON "generation_runs" USING btree \("organization_id","trip_id"\) WHERE "generation_runs"\."kind" = 'batch' AND "generation_runs"\."finished_at" IS NULL;/);
  });
});

describe("migration 0015 : retour arrière", () => {
  const instructions = DOWN.split("\n").filter((l) => !l.startsWith("--")).join("\n");

  it("aucune donnée supprimée : ni table, ni colonne, ni ligne (hors du corps de la purge rétablie)", () => {
    const horsPurge = instructions.replace(corpsPurge(DOWN), "");
    expect(horsPurge).not.toMatch(/\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE|UPDATE)\b/i);
  });

  it("la purge rétablie est celle de 0014, recopiée à l'identique", () => {
    expect(corpsPurge(DOWN)).toBe(corpsPurge(SQL_0014));
  });

  it("la clé étrangère est retirée avant le rétablissement de la purge de 0014, la lecture de kind après", () => {
    const fk = instructions.indexOf("DROP CONSTRAINT IF EXISTS generation_runs_deck_closure_fk;");
    const purge = instructions.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
    const droit = instructions.indexOf("REVOKE SELECT (kind) ON public.generation_runs FROM vadrouille_fn_purge;");
    expect(fk).toBeGreaterThan(-1);
    expect(purge).toBeGreaterThan(fk);
    expect(droit).toBeGreaterThan(purge);
  });

  it("chaque index et chaque contrainte de 0015 est retiré", () => {
    for (const nom of [
      "generation_runs_organization_id_trip_id_batch_active_idx",
      "generation_runs_organization_id_trip_id_deck_closure_id_idx",
      "generation_runs_batch_check",
      "generation_runs_deck_closure_fk",
      "deck_closures_organization_id_id_unique",
    ]) {
      expect(instructions, nom).toMatch(new RegExp(`DROP (INDEX|CONSTRAINT) IF EXISTS (public\\.)?${nom};`));
    }
  });

  it("se termine par RESET ROLE", () => {
    expect(instructions.trim().endsWith("RESET ROLE;")).toBe(true);
  });
});
