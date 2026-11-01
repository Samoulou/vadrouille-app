// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0024_rappels (M6c-D, ticket 1014 ; décision 0157 § 1.8) : la purge du compte est celle de 0015, avec les
 * réclamations puis les accords supprimés d'abord (clés `NO ACTION` vers `trips`) ; la migration inverse ne retire que
 * des droits (aucune suppression de données, purge de 0024 gardée). Les effets en base : `tests/db/rappels.test.ts`.
 */
const MIGRATIONS = path.join(process.cwd(), "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0024_rappels.sql");
const DOWN = lire("0024_rappels.down.sql");
const SQL_0015 = lire("0015_recalcul_lot.sql");
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

describe("migration 0024 : purge du compte (0157 § 1.8)", () => {
  it("corps de 0015, réclamations puis accords supprimés en premier", () => {
    const attendu = corpsPurge(SQL_0015).replace(
      "  DELETE FROM public.preference_prompts AS x",
      "  DELETE FROM public.reminder_sends AS x WHERE x.organization_id = v_org;\n" +
        "  DELETE FROM public.reminder_consents AS x WHERE x.organization_id = v_org;\n" +
        "  DELETE FROM public.preference_prompts AS x",
    );
    expect(corpsPurge(SQL)).toBe(attendu);
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

describe("migration 0024 : retour arrière sans suppression de données", () => {
  it("la descente ne retire que les droits de vadrouille_app, sans DELETE, DROP ni purge", () => {
    const instructions = sansCommentaires(DOWN)
      .split("--> statement-breakpoint")
      .map((i) => i.trim())
      .filter(Boolean);
    expect(instructions).toEqual([
      "SET LOCAL ROLE vadrouille_owner;",
      "REVOKE INSERT (organization_id, trip_id, user_id), UPDATE (withdrawn_at) ON public.reminder_consents FROM vadrouille_app;",
      "REVOKE SELECT ON public.reminder_consents FROM vadrouille_app;",
      "REVOKE SELECT, INSERT ON public.reminder_sends FROM vadrouille_app;",
      "RESET ROLE;",
    ]);
  });
});
