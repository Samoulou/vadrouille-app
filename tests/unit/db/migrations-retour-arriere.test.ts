// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Critère du handover § 12 (spécification B1) : chaque migration a sa migration inverse écrite et relue
 * (`db/migrations/<tag>.down.sql`), ou la mention « irréversible » avec sa raison dans `db/README.md`.
 */
const root = process.cwd();
const journal = JSON.parse(readFileSync(path.join(root, "db/migrations/meta/_journal.json"), "utf8")) as {
  entries: { tag: string }[];
};
const readme = readFileSync(path.join(root, "db/README.md"), "utf8");

describe("migrations : retour arrière documenté", () => {
  it("le journal contient au moins les migrations de B1", () => {
    expect(journal.entries.map((entry) => entry.tag).slice(0, 2)).toEqual(["0000_socle", "0001_securite"]);
  });

  it.each(journal.entries.map((entry) => entry.tag))("%s : migration inverse ou « irréversible » motivée", (tag) => {
    if (existsSync(path.join(root, "db/migrations", `${tag}.down.sql`))) return;
    const row = readme.split("\n").find((line) => line.startsWith(`| \`${tag}\` |`));
    expect(row, `ligne de ${tag} absente du tableau de db/README.md`).toBeDefined();
    const cells = (row ?? "").split("|").map((cell) => cell.trim());
    expect(cells[2]).toBe("irréversible");
    expect((cells[3] ?? "").length, `raison de ${tag} trop courte`).toBeGreaterThan(40);
  });
});

/**
 * Décision 0158 § 2.6 (M6a-D, migration 0023_lien_prive_partage) : la descente défait la migration entière, au-delà de
 * la seule existence du fichier ; ce cas en vérifie le contenu et l'ordre (commentaires retirés).
 */
describe("migrations : retour arrière de 0023_lien_prive_partage (0158 § 2.6)", () => {
  const down = readFileSync(path.join(root, "db/migrations/0023_lien_prive_partage.down.sql"), "utf8")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  const position = (fragment: string) => {
    const index = down.indexOf(fragment);
    expect(index, fragment).toBeGreaterThan(-1);
    return index;
  };
  /** Instruction complète qui commence par `debut`, jusqu'au premier `;`. */
  const instruction = (debut: string) => down.slice(position(debut), down.indexOf(";", position(debut)) + 1);

  it("shared_checklist recréée : droit sur checklist_items et politique, puis vue sous son propriétaire, REVOKE ALL, GRANT à vadrouille_share", () => {
    const droit = position("GRANT SELECT (id, organization_id, trip_id, stop_id, kind, label, moment, booking_url, sponsored, done)\n  ON public.checklist_items TO vadrouille_fn_share_views;");
    const politique = position("CREATE POLICY checklist_items_fn_share_views ON public.checklist_items FOR SELECT TO vadrouille_fn_share_views");
    const role = position("SET LOCAL ROLE vadrouille_fn_share_views;");
    const vue = position("CREATE VIEW public.shared_checklist WITH (security_barrier = true) AS");
    const revoke = position("REVOKE ALL ON public.shared_checklist FROM PUBLIC;");
    const grant = position("GRANT SELECT ON public.shared_checklist TO vadrouille_share;");
    const fin = down.indexOf("RESET ROLE;", role);
    expect(droit).toBeLessThan(politique);
    expect(politique).toBeLessThan(role);
    // Propriété : la vue est créée sous vadrouille_fn_share_views, avant le RESET ROLE qui clôt le cadre.
    expect(role).toBeLessThan(vue);
    expect(vue).toBeLessThan(revoke);
    expect(revoke).toBeLessThan(grant);
    expect(grant).toBeLessThan(fin);
    // Cadre de 0158 § 2.4 : CREATE sur le schéma et appartenance SET accordés puis retirés.
    expect(position("GRANT CREATE ON SCHEMA public TO vadrouille_fn_share_views;")).toBeLessThan(role);
    expect(position("REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_share_views;")).toBeGreaterThan(fin);
    expect(position("REVOKE vadrouille_fn_share_views FROM vadrouille_migrator GRANTED BY vadrouille_migrator;")).toBeGreaterThan(fin);
  });

  it("shared_trip et shared_trip_version rendues sans entitlements ; DROP POLICY et REVOKE sur entitlements après les vues", () => {
    for (const vue of ["shared_trip", "shared_trip_version"]) {
      const texte = instruction(`CREATE OR REPLACE VIEW public.${vue} WITH (security_barrier = true) AS`);
      expect(texte, vue).not.toContain("entitlements");
      expect(texte, vue).toContain("s.revoked_at IS NULL AND s.expires_at > pg_catalog.now();");
    }
    const derniereVue = position("CREATE OR REPLACE VIEW public.shared_trip_version");
    expect(position("DROP POLICY entitlements_fn_share_views ON public.entitlements;")).toBeGreaterThan(derniereVue);
    expect(position("REVOKE SELECT (organization_id, trip_id, kind) ON public.entitlements FROM vadrouille_fn_share_views;")).toBeGreaterThan(derniereVue);
  });

  it("part de T9 défaite : déclencheur, fonction et bornes retirés, droits de table de 0001 rendus à vadrouille_app", () => {
    position("DROP TRIGGER share_links_revoke_once ON public.share_links;");
    position("DROP FUNCTION public.share_links_revoke_once();");
    position("DROP CONSTRAINT share_links_expires_within_3_years_check;");
    position("DROP CONSTRAINT share_links_expires_after_created_check;");
    const colonnes = position("REVOKE INSERT (organization_id, trip_id, token_hash, created_by, expires_at) ON public.share_links FROM vadrouille_app;");
    const table = position("GRANT INSERT, UPDATE ON public.share_links TO vadrouille_app;");
    expect(position("REVOKE UPDATE (revoked_at) ON public.share_links FROM vadrouille_app;")).toBeLessThan(table);
    expect(colonnes).toBeLessThan(table);
    // Aucune suppression de données (règle du rôle data).
    expect(down).not.toMatch(/\b(DELETE FROM|TRUNCATE|DROP TABLE|DROP COLUMN)\b/i);
  });
});
