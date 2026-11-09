// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CATEGORIES, PREFERENCE_DIRECTIONS, PREFERENCE_ORIGINS, STOP_RATINGS } from "@/contracts/values";

/**
 * Migration 0026_apres_voyage (M8-D, ticket 1055 ; décision 0160 § 1.1, § 1.3 et § 3.2) : les listes fermées des `CHECK`
 * sont exactement les valeurs des contrats (`STOP_RATINGS`, `CATEGORIES`, `PREFERENCE_DIRECTIONS`,
 * `PREFERENCE_ORIGINS`), dans le même ordre ; la purge du compte est celle de 0024 avec les avis supprimés d'abord ; la
 * migration inverse refuse de s'exécuter dès qu'une ligne existe, puis rétablit la purge de 0024 à l'identique. Les effets
 * en base : `tests/db/apres-voyage.test.ts`.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0026_apres_voyage.sql");
const DOWN = lire("0026_apres_voyage.down.sql");
const SQL_0024 = lire("0024_rappels.sql");
const sansCommentaires = (texte: string) =>
  texte
    .split("\n")
    .filter((ligne) => !ligne.trimStart().startsWith("--") || ligne.startsWith("--> statement-breakpoint"))
    .join("\n");

/** Corps de `purge_organization_data` (de `CREATE OR REPLACE FUNCTION` au `$$;` qui le ferme). */
function corpsPurge(texte: string): string {
  const debut = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
  expect(debut).toBeGreaterThan(-1);
  const fin = texte.indexOf("$$;", texte.indexOf("AS $$", debut) + 5);
  return texte.slice(debut, fin + 3);
}

/** Valeurs entre apostrophes de la liste `IN (…)` de la contrainte `nom`. */
function liste(nom: string): string[] {
  const debut = SQL.indexOf(`"${nom}" CHECK`);
  expect(debut, nom).toBeGreaterThan(-1);
  const fin = SQL.indexOf("\n", debut);
  const valeurs = SQL.slice(debut, fin).match(/ IN \(([^)]*)\)/);
  expect(valeurs, nom).not.toBeNull();
  return [...(valeurs?.[1] ?? "").matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

describe("migration 0026 : valeurs fermées égales aux contrats", () => {
  it("stop_reviews_opinion_check : exactement STOP_RATINGS", () => {
    expect(liste("stop_reviews_opinion_check")).toEqual([...STOP_RATINGS]);
  });

  it("preferences : catégories de CATEGORIES, sens de PREFERENCE_DIRECTIONS, origines de PREFERENCE_ORIGINS, natures category et distance", () => {
    expect(liste("preferences_category_check")).toEqual([...CATEGORIES]);
    expect(liste("preferences_direction_check")).toEqual([...PREFERENCE_DIRECTIONS]);
    expect(liste("preferences_origin_check")).toEqual([...PREFERENCE_ORIGINS]);
    expect(liste("preferences_subject_kind_check")).toEqual(["category", "distance"]);
  });

  it("aucune colonne de texte libre ni de nom ; clé du voyage d'origine en SET NULL de source_trip_id seul ; aucune donnée modifiée hors de la purge", () => {
    const texte = sansCommentaires(SQL);
    expect(texte).toContain('ON DELETE SET NULL ("source_trip_id")');
    expect(texte).not.toMatch(/ON DELETE set null ON/);
    expect(texte).not.toMatch(/"(name|label|text|title|destination|address|rating)" text/);
    expect(texte).not.toMatch(/NOT VALID/);
    const horsPurge = texte.replace(corpsPurge(texte), "");
    expect(horsPurge).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+(public\.)?"?\w+"?\s+SET|INSERT\s+INTO)\b/i);
  });
});

describe("migration 0026 : droits et politiques (proposition de 0160 § 2.1, S1)", () => {
  it("vadrouille_app : droits par colonnes, aucun UPDATE sur preferences, aucun TRUNCATE ; politique type de preferences remplacée", () => {
    const texte = sansCommentaires(SQL);
    expect(texte).toContain("GRANT SELECT, DELETE ON public.stop_reviews TO vadrouille_app;");
    expect(texte).toContain(
      "GRANT INSERT (organization_id, trip_id, stop_id, place_id, opinion, created_by, request_id),\n  UPDATE (opinion, request_id, updated_at) ON public.stop_reviews TO vadrouille_app;",
    );
    expect(texte).toContain("REVOKE INSERT, UPDATE ON public.preferences FROM vadrouille_app;");
    expect(texte).toContain(
      "GRANT INSERT (organization_id, user_id, subject_kind, category, direction, origin, source_trip_id) ON public.preferences TO vadrouille_app;",
    );
    expect(texte).toContain("DROP POLICY preferences_app ON public.preferences;");
    expect(texte).not.toMatch(/TRUNCATE|GRANT ALL|UPDATE\s+ON public\.preferences TO/);
    // Lecture, insertion et suppression d'un goût bornées à la personne de la transaction.
    expect(texte.match(/ON public\.preferences AS PERMISSIVE FOR (SELECT|INSERT|DELETE) TO vadrouille_app\n {2}(USING|WITH CHECK) \(organization_id = public\.app_current_org\(\) AND user_id = public\.app_current_user\(\)\);/g)).toHaveLength(3);
  });
});

describe("migration 0026 : purge du compte (0160 § 3.2)", () => {
  it("corps de 0024, avis supprimés en premier ; preferences gardée avant trips", () => {
    const attendu = corpsPurge(SQL_0024).replace(
      "  DELETE FROM public.reminder_sends AS x",
      "  DELETE FROM public.stop_reviews AS x WHERE x.organization_id = v_org;\n  DELETE FROM public.reminder_sends AS x",
    );
    expect(corpsPurge(SQL)).toBe(attendu);
    const corps = corpsPurge(SQL);
    expect(corps.indexOf("DELETE FROM public.preferences")).toBeLessThan(corps.indexOf("DELETE FROM public.trips"));
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

describe("migration 0026 : retour arrière sans suppression de données (0160 § 1.3 point 8)", () => {
  const texte = sansCommentaires(DOWN);
  const instructions = texte
    .split("--> statement-breakpoint")
    .map((i) => i.trim())
    .filter(Boolean);

  it("les deux gardes de table vide viennent d'abord, avant toute modification", () => {
    expect(instructions[0]).toBe("SET LOCAL ROLE vadrouille_owner;");
    for (const [i, table] of [[1, "stop_reviews"], [3, "preferences"]] as const) {
      expect(instructions[i]).toContain(`ALTER TABLE public.${table} ADD CONSTRAINT ${table}_vide_0026_check CHECK (false);`);
      expect(instructions[i]).toContain("EXCEPTION WHEN check_violation THEN");
      expect(instructions[i]).toContain("USING ERRCODE = 'object_not_in_prerequisite_state';");
      expect(instructions[i + 1]).toBe(`ALTER TABLE public.${table} DROP CONSTRAINT ${table}_vide_0026_check;`);
    }
  });

  it("aucune ligne lue, modifiée ni supprimée : ni DELETE, ni TRUNCATE, ni UPDATE de lignes, hors du corps de la purge rétablie", () => {
    const horsPurge = texte.replace(corpsPurge(texte), "");
    expect(horsPurge).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+(public\.)?"?\w+"?\s+SET|INSERT\s+INTO)\b/i);
  });

  it("purge de 0024 rétablie à l'identique, sous son propriétaire, avant la suppression de stop_reviews", () => {
    expect(corpsPurge(texte)).toBe(corpsPurge(SQL_0024));
    const purge = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
    expect(texte.indexOf("SET LOCAL ROLE vadrouille_fn_purge;")).toBeLessThan(purge);
    expect(texte.indexOf("REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;")).toBeGreaterThan(purge);
    expect(texte.indexOf("DROP TABLE public.stop_reviews;")).toBeGreaterThan(purge);
  });

  it("preferences rendue au schéma de B1 : politique type et droits de 0001, value et category NOT NULL", () => {
    expect(texte).toContain(
      "CREATE POLICY preferences_app ON public.preferences AS PERMISSIVE FOR ALL TO vadrouille_app\n  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());",
    );
    expect(texte).toContain("GRANT INSERT, UPDATE ON public.preferences TO vadrouille_app;");
    expect(texte).toContain("ALTER TABLE public.preferences ALTER COLUMN category SET NOT NULL;");
    expect(texte).toContain("ALTER TABLE public.preferences ADD COLUMN value text NOT NULL;");
    expect(instructions.at(-1)).toBe("RESET ROLE;");
  });
});
