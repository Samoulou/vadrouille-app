// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { colonnesAccordees, releverEcrituresGenerationRuns } from "../../support/releve-generation-runs";

/**
 * Migration 0016_restriction_update_generation_runs (décision 0120 § 8, S8, points 1 et 3 ; ticket #672) : l'`UPDATE`
 * de table de `vadrouille_app` sur `generation_runs` est retiré et accordé sur les seules colonnes que `src/` écrit ;
 * `base_version` et `deck_closure_id` en sont exclues (exigé), comme `kind`, `organization_id`, `trip_id`, `request_id`
 * et `started_at` (recommandation de la Sécurité, Q585) et `id`. Le relevé des `UPDATE` de `src/` est refait à chaque
 * passage : une requête qui écrirait une colonne non accordée fait échouer ce test (elle serait refusée en base,
 * `42501`). Migration inverse : droits seulement, elle rend l'`UPDATE` de table.
 */
const racine = process.cwd();
const MIGRATIONS = path.join(racine, "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0016_restriction_update_generation_runs.sql");
const DOWN = lire("0016_restriction_update_generation_runs.down.sql");

/** Instructions SQL (commentaires et séparateurs retirés), dans l'ordre. */
const instructions = (texte: string) =>
  texte
    .split("\n")
    .filter((l) => !l.startsWith("--"))
    .join("\n")
    .split(";")
    .map((i) => i.trim().replace(/\s+/g, " "))
    .filter((i) => i.length > 0);

/** Colonnes jamais écrites après l'insertion (0120 S8 et Q585), jamais accordées. */
const EXCLUES = ["base_version", "deck_closure_id", "kind", "organization_id", "trip_id", "request_id", "started_at", "id"];
const ACCORDEES = colonnesAccordees(SQL);
const releve = releverEcrituresGenerationRuns(racine);

describe("migration 0016 : relevé des UPDATE de generation_runs dans src/ (0120 S8 point 1)", () => {
  it("le relevé trouve chaque UPDATE du code, sous la forme unique « UPDATE public.generation_runs SET … WHERE »", () => {
    // 26 requêtes sur `main` 507d36a (liste dans la PR de #672) ; le nombre peut croître, chaque mention doit être relevée.
    expect(releve.updates.length).toBeGreaterThanOrEqual(26);
    expect(releve.updates).toHaveLength(releve.mentions);
    expect(releve.drizzle, "écriture Drizzle de generationRuns").toEqual([]);
    expect(releve.insertionsAvecMiseAJour, "INSERT … ON CONFLICT DO UPDATE sur generation_runs").toEqual([]);
  });

  it("chaque colonne écrite par un UPDATE de src/ est accordée à vadrouille_app", () => {
    for (const update of releve.updates) {
      for (const colonne of update.colonnes) expect(ACCORDEES, `${update.fichier}:${update.ligne} écrit ${colonne}`).toContain(colonne);
    }
  });

  it("aucune colonne figée n'est accordée ; aucune colonne exclue n'est écrite par src/", () => {
    for (const colonne of EXCLUES) expect(ACCORDEES, colonne).not.toContain(colonne);
    const ecrites = new Set(releve.updates.flatMap((u) => u.colonnes));
    for (const colonne of EXCLUES) expect(ecrites.has(colonne), colonne).toBe(false);
  });

  it("liste accordée : les dix colonnes du relevé de la PR, sans doublon", () => {
    expect([...ACCORDEES].sort()).toEqual(
      ["finished_at", "last_version", "person_retry_request_ids", "phase", "step", "step_seq", "stop_reason", "studio_retries", "updated_at", "workflow_run_id"],
    );
    expect(new Set(ACCORDEES).size).toBe(ACCORDEES.length);
  });
});

describe("migration 0016 : forme (comme 0014 et 0015)", () => {
  it("sous vadrouille_owner : retrait de l'UPDATE de table, puis droit par colonnes, puis RESET ROLE ; rien d'autre", () => {
    expect(instructions(SQL)).toEqual([
      "SET LOCAL ROLE vadrouille_owner",
      "REVOKE UPDATE ON public.generation_runs FROM vadrouille_app",
      `GRANT UPDATE (${ACCORDEES.join(", ")}) ON public.generation_runs TO vadrouille_app`,
      "RESET ROLE",
    ]);
  });

  it("chaque instruction est séparée par --> statement-breakpoint", () => {
    expect(SQL.match(/^--> statement-breakpoint$/gm)).toHaveLength(instructions(SQL).length - 1);
    expect(DOWN.match(/^--> statement-breakpoint$/gm)).toHaveLength(instructions(DOWN).length - 1);
  });

  it("droits seulement : aucune instruction de schéma ni de données", () => {
    const texte = instructions(SQL).join(";");
    expect(texte).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE\s+public\.)\b/i);
  });
});

describe("migration 0016 : retour arrière (0120 S8 point 3)", () => {
  it("retire le droit par colonnes (même liste), puis rend l'UPDATE de table de 0001_securite ; rien d'autre", () => {
    expect(instructions(DOWN)).toEqual([
      "SET LOCAL ROLE vadrouille_owner",
      `REVOKE UPDATE (${ACCORDEES.join(", ")}) ON public.generation_runs FROM vadrouille_app`,
      "GRANT UPDATE ON public.generation_runs TO vadrouille_app",
      "RESET ROLE",
    ]);
  });

  it("aucune donnée supprimée : ni table, ni colonne, ni ligne", () => {
    expect(instructions(DOWN).join(";")).not.toMatch(/\b(CREATE|ALTER|DROP|TRUNCATE|DELETE|INSERT|UPDATE\s+public\.)\b/i);
  });
});
