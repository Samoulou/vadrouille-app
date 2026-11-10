// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * Migration 0028_purge_place_coordinates (ticket 1091 ; décision 0167, option (a), « Décision » points 1 à 3 et « Tests
 * exigés » 5) : `vadrouille_fn_purge` reçoit `SELECT (organization_id)` et `DELETE` sur `place_coordinates` et une
 * politique bornée à l'organisation de la transaction ; la purge du compte est celle de 0027, dernière version sur `main`,
 * avec `place_coordinates` supprimée en tête ; rien d'autre ne change (ni table, ni clé, ni `vadrouille_fn_coords`) ; la
 * migration inverse rétablit la purge de 0027 à l'identique puis retire politique et droits, sans suppression de données.
 * Les effets en base : `tests/db/purge.test.ts` et `tests/db/roles.test.ts`.
 */
const RACINE = process.cwd();
const MIGRATIONS = path.join(RACINE, "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
const SQL = lire("0028_purge_place_coordinates.sql");
const DOWN = lire("0028_purge_place_coordinates.down.sql");
const SQL_0027 = lire("0027_rappels_relais.sql");
const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const instantane = (n: string) => JSON.parse(readFileSync(path.join(MIGRATIONS, `meta/${n}_snapshot.json`), "utf8")) as Record<string, unknown>;
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

/** Instructions du cadre de la purge de 0027 (de l'appartenance temporaire à son retrait), commentaires retirés. */
function cadrePurge(texte: string): string[] {
  const liste = instructions(texte);
  const debut = liste.indexOf("GRANT vadrouille_fn_purge TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;");
  const fin = liste.indexOf("REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;");
  expect(debut).toBeGreaterThan(-1);
  expect(fin).toBeGreaterThan(debut);
  return liste.slice(debut, fin + 1);
}

const LIGNE = "  DELETE FROM public.place_coordinates AS x WHERE x.organization_id = v_org;\n";
const GRANT = "GRANT SELECT (organization_id), DELETE ON public.place_coordinates TO vadrouille_fn_purge;";
const POLITIQUE =
  "CREATE POLICY place_coordinates_fn_purge ON public.place_coordinates AS PERMISSIVE FOR ALL TO vadrouille_fn_purge\n  USING (organization_id = public.app_current_org()) WITH CHECK (organization_id = public.app_current_org());";

describe("migration 0028 : journal", () => {
  it("dernière entrée du journal, après 0027 ; instantané identique à celui de 0027 (aucune table ni colonne ne change), chaîné", () => {
    const tags = journal.entries.map((e) => e.tag);
    expect(tags.indexOf("0028_purge_place_coordinates")).toBe(tags.indexOf("0027_rappels_relais") + 1);
    expect(journal.entries.find((e) => e.tag === "0028_purge_place_coordinates")?.idx).toBe(28);
    const sansIds = (cliche: Record<string, unknown>) => Object.fromEntries(Object.entries(cliche).filter(([cle]) => cle !== "id" && cle !== "prevId"));
    const avant = instantane("0027");
    const apres = instantane("0028");
    expect(apres.prevId).toBe(avant.id);
    expect(apres.id).not.toBe(avant.id);
    expect(sansIds(apres)).toEqual(sansIds(avant));
  });
});

describe("migration 0028 : droits et politique de vadrouille_fn_purge (0167, Décision 1.1 ; SP2)", () => {
  it("sous vadrouille_owner : SELECT (organization_id) et DELETE seulement, une seule politique, bornée à l'organisation de la transaction", () => {
    const liste = instructions(SQL);
    expect(liste.slice(0, 3)).toEqual(["SET LOCAL ROLE vadrouille_owner;", GRANT, POLITIQUE]);
    expect(liste[3]).toBe("RESET ROLE;");
    const texte = sansCommentaires(SQL);
    expect(texte.match(/^GRANT [^;]* ON public\.place_coordinates TO [^;]*;/gm)).toEqual([GRANT]);
    expect(texte.match(/CREATE POLICY \w+/g)).toEqual(["CREATE POLICY place_coordinates_fn_purge"]);
    expect(texte).not.toMatch(/GRANT ALL|TRUNCATE|UPDATE \(|INSERT \(|\b(lat|lng|place_id|fetched_at|expires_at)\b/);
  });

  it("rien d'autre ne change : ni table, ni colonne, ni contrainte, ni clé, ni vadrouille_fn_coords, ni vadrouille_app ; aucune ligne lue, modifiée ni supprimée hors de la purge", () => {
    const texte = sansCommentaires(SQL);
    expect(texte).not.toMatch(/CREATE TABLE|ALTER TABLE|DROP|CONSTRAINT|REFERENCES|CREATE TRIGGER|CREATE FUNCTION|NOT VALID/);
    expect(texte).not.toMatch(/vadrouille_fn_coords|vadrouille_app\b|vadrouille_prototype|store_place_coordinates|purge_expired_coordinates/);
    const horsPurge = texte.replace(corpsPurge(texte), "");
    expect(horsPurge).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|UPDATE\s+(public\.)?"?\w+"?\s+SET|INSERT\s+INTO)\b/i);
  });
});

describe("migration 0028 : purge du compte (0167, Décision 1.2 et 1.3)", () => {
  it("corps de 0027 (dernière version sur main), place_coordinates supprimée en tête, avant stop_reviews", () => {
    const attendu = corpsPurge(SQL_0027).replace("  DELETE FROM public.stop_reviews AS x", `${LIGNE}  DELETE FROM public.stop_reviews AS x`);
    expect(attendu).not.toBe(corpsPurge(SQL_0027));
    expect(corpsPurge(SQL)).toBe(attendu);
    const corps = corpsPurge(SQL);
    const suppressions = [...corps.matchAll(/DELETE FROM public\.(\w+) /g)].map((m) => m[1]);
    expect(suppressions[0]).toBe("place_coordinates");
    expect(suppressions.filter((t) => t === "place_coordinates")).toHaveLength(1);
    expect(corps.indexOf("UPDATE public.organizations")).toBeLessThan(corps.indexOf(LIGNE));
  });

  it("recréée sous vadrouille_fn_purge, dans le cadre de 0027 à l'identique ; droits d'exécution réécrits ; appartenance temporaire retirée en dernier", () => {
    expect(cadrePurge(SQL).map((i) => i.replace(LIGNE, ""))).toEqual(cadrePurge(SQL_0027));
    const texte = sansCommentaires(SQL);
    const role = texte.indexOf("SET LOCAL ROLE vadrouille_fn_purge;");
    const purge = texte.indexOf("CREATE OR REPLACE FUNCTION public.purge_organization_data");
    const fin = texte.indexOf("RESET ROLE;", purge);
    expect(role).toBeGreaterThan(-1);
    expect(role).toBeLessThan(purge);
    expect(texte.indexOf("REVOKE ALL ON FUNCTION public.purge_organization_data(uuid) FROM PUBLIC;")).toBeLessThan(fin);
    expect(texte.indexOf("GRANT EXECUTE ON FUNCTION public.purge_organization_data(uuid) TO vadrouille_account_admin;")).toBeLessThan(fin);
    expect(texte.indexOf("REVOKE CREATE ON SCHEMA public FROM vadrouille_fn_purge;")).toBeGreaterThan(fin);
    expect(texte.trimEnd().endsWith("REVOKE vadrouille_fn_purge FROM vadrouille_migrator GRANTED BY vadrouille_migrator;")).toBe(true);
  });
});

describe("migration 0028 : retour arrière sans suppression de données (0167, Décision 1.4)", () => {
  it("purge de 0027 rétablie à l'identique, dans son cadre, avant le retrait de la politique et des droits", () => {
    expect(corpsPurge(DOWN)).toBe(corpsPurge(SQL_0027));
    const liste = instructions(DOWN);
    const cadre = cadrePurge(DOWN);
    expect(cadre).toEqual(cadrePurge(SQL_0027));
    expect(liste).toEqual([
      ...cadre,
      "SET LOCAL ROLE vadrouille_owner;",
      "DROP POLICY place_coordinates_fn_purge ON public.place_coordinates;",
      "REVOKE SELECT (organization_id), DELETE ON public.place_coordinates FROM vadrouille_fn_purge;",
      "RESET ROLE;",
    ]);
  });

  it("aucune ligne supprimée, aucune table ni colonne retirée", () => {
    const horsPurge = sansCommentaires(DOWN).replace(corpsPurge(DOWN), "");
    expect(horsPurge).not.toMatch(/\b(DELETE\s+FROM|TRUNCATE|DROP TABLE|DROP COLUMN|ALTER TABLE)\b/i);
  });
});
