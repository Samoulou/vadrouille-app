// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0023_lien_prive_partage (M6a-D, ticket 1009) : elle porte **le texte exact** de la décision 0158 § 2 (droit,
 * politique, deux vues, commentaire), dans l'ordre du § 2 (droit, politique, puis vues), et le retrait de
 * `shared_checklist` de 0157 § 1.5 (T5). Les blocs SQL sont lus dans la décision elle-même, sans copie.
 */
const racine = process.cwd();
const migration = readFileSync(path.join(racine, "db/migrations/0023_lien_prive_partage.sql"), "utf8");
const decision = readFileSync(path.join(racine, "docs/decisions/0158-partage-voyage-reverrouille.md"), "utf8");
const section2 = decision.slice(decision.indexOf("### 2. Texte exact"), decision.indexOf("### 3. Lecture"));
const blocs = [...section2.matchAll(/```sql\n([\s\S]*?)```/g)].map((m) => (m[1] ?? "").trimEnd());
/** Instructions des blocs (le bloc du § 2.3 porte les deux vues, séparées par une ligne vide). */
const instructions = blocs.flatMap((bloc) => bloc.split("\n\n"));

describe("migration 0023 : texte exact de la décision 0158 § 2", () => {
  it("les quatre blocs SQL du § 2 (droit, politique, vues, commentaire) sont dans la migration, à l'identique", () => {
    expect(blocs).toHaveLength(4);
    expect(instructions).toHaveLength(5);
    for (const texte of instructions) expect(migration, texte.slice(0, 60)).toContain(texte);
  });

  it("ordre : droit, politique, puis vues ; le commentaire du § 2.5 en tête de la redéfinition des vues", () => {
    const droit = migration.indexOf("GRANT SELECT (organization_id, trip_id, kind) ON public.entitlements TO vadrouille_fn_share_views;");
    const politique = migration.indexOf("CREATE POLICY entitlements_fn_share_views");
    const commentaire = migration.indexOf("-- Vues partagées (décision 0158");
    const vues = migration.indexOf("CREATE OR REPLACE VIEW public.shared_trip ");
    expect(droit).toBeGreaterThan(-1);
    expect(droit).toBeLessThan(politique);
    expect(politique).toBeLessThan(commentaire);
    expect(commentaire).toBeLessThan(vues);
  });

  it("vues redéfinies sous vadrouille_fn_share_views, dans le cadre du § 2.4 ; shared_checklist supprimée (0157 § 1.5)", () => {
    const role = migration.indexOf("SET LOCAL ROLE vadrouille_fn_share_views;");
    const fin = migration.indexOf("RESET ROLE;", role);
    expect(migration.indexOf("GRANT CREATE ON SCHEMA public TO vadrouille_fn_share_views;")).toBeLessThan(role);
    for (const fragment of ["DROP VIEW public.shared_checklist;", "CREATE OR REPLACE VIEW public.shared_trip ", "CREATE OR REPLACE VIEW public.shared_trip_version "]) {
      const i = migration.indexOf(fragment);
      expect(i, fragment).toBeGreaterThan(role);
      expect(i, fragment).toBeLessThan(fin);
    }
    expect(migration.indexOf("REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share_views;")).toBeGreaterThan(fin);
    expect(migration.indexOf("REVOKE vadrouille_fn_share_views FROM vadrouille_migrator GRANTED BY vadrouille_migrator;")).toBeGreaterThan(fin);
    // La politique et le droit sur checklist_items ne partent qu'après la vue qui les lisait.
    expect(migration.indexOf("DROP POLICY checklist_items_fn_share_views ON public.checklist_items;")).toBeGreaterThan(fin);
    expect(migration).not.toMatch(/CREATE (OR REPLACE )?VIEW public\.shared_checklist/);
    const sansCommentaires = migration
      .split("\n")
      .filter((l) => !l.trimStart().startsWith("--"))
      .join("\n");
    expect(sansCommentaires).not.toMatch(/USING \(true\)|WITH CHECK \(true\)/);
  });
});
