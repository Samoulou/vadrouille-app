// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { SHARED_SNAPSHOT_KEYS, SNAPSHOT_STOP_EXCEPTIONS, SNAPSHOT_STOP_EXCEPTIONS_MAX } from "../../../db/jsonb-keys";

/**
 * La liste blanche de l'instantané partagé est écrite à la main dans `db/migrations/0001_securite.sql` (fonctions
 * `shared_*`) ; ce test, sans base, la compare aux listes de `db/jsonb-keys.ts`, seul fichier de `db/` qui porte les
 * clés des JSONB (décision B1-PO-5). Le test `schéma: les clés JSONB suivent les contrats` compare ensuite ces
 * listes aux schémas Zod de B2.
 */
const sql = readFileSync(path.join(process.cwd(), "db/migrations/0001_securite.sql"), "utf8");

/** Corps d'une fonction `public.shared_<name>(jsonb)`, entre ses `$$`. */
function body(name: string): string {
  const match = new RegExp(`CREATE FUNCTION public\\.shared_${name}\\(p jsonb\\)[\\s\\S]*?\\$\\$([\\s\\S]*?)\\$\\$;`).exec(sql);
  if (!match?.[1]) throw new Error(`fonction public.shared_${name} introuvable`);
  return match[1];
}

/**
 * Clés émises par `jsonb_build_object` : chaque `'clé', <expression>` dont l'expression lit `p -> 'clé'` (hors
 * commentaires). Une clé émise sans lire la clé de même nom ferait échouer la comparaison.
 */
function emittedKeys(name: string): string[] {
  const code = body(name).replace(/--[^\n]*/g, "");
  // Une clé ouvre un argument : en début de ligne, après « ( » ou après une virgule (pas « p ->> 'url', 8 »).
  const marks = [...code.matchAll(/(?:^|\(|,)\s*'([A-Za-z]+)', /gm)];
  return marks
    .map((mark, i) => {
      const key = mark[1] as string;
      const segment = code.slice((mark.index ?? 0) + mark[0].length, marks[i + 1]?.index ?? code.length);
      return segment.includes(`p -> '${key}'`) ? key : `${key} (sans lecture de p -> '${key}')`;
    });
}

describe("vues partagées : la liste blanche de la migration suit db/jsonb-keys.ts", () => {
  it.each(Object.entries(SHARED_SNAPSHOT_KEYS))("shared_%s émet exactement les clés de SHARED_SNAPSHOT_KEYS", (name, keys) => {
    expect(emittedKeys(name)).toEqual([...keys]);
  });

  it("shared_exceptions : seulement les valeurs de SNAPSHOT_STOP_EXCEPTIONS, sans doublon, au plus SNAPSHOT_STOP_EXCEPTIONS_MAX", () => {
    const code = body("exceptions");
    const allowed = /IN \(([^)]*)\)/.exec(code)?.[1] ?? "";
    expect([...allowed.matchAll(/'([A-Za-z]+)'/g)].map((m) => m[1])).toEqual([...SNAPSHOT_STOP_EXCEPTIONS]);
    expect(code).toContain(`LIMIT ${SNAPSHOT_STOP_EXCEPTIONS_MAX}`);
    // Sans doublon avant la limite (revue de #188, mineur 2).
    expect(code).toContain("GROUP BY e.v");
    expect(code).not.toContain("toConfirm");
  });

  it("shared_source : url seulement en https://", () => {
    expect(body("source")).toMatch(/jsonb_typeof\(p -> 'url'\) = 'string' AND pg_catalog\.left\(p ->> 'url', 8\) = 'https:\/\/'/);
  });

  it("chaque fonction shared_* perd explicitement ses droits PUBLIC (REVOKE ALL … FROM PUBLIC, revue de la PR 188)", () => {
    const names = [...sql.matchAll(/CREATE FUNCTION public\.(shared_[a-z_]+)\(p jsonb\)/g)].map((m) => m[1]);
    expect(names.length).toBeGreaterThan(0);
    const revoke = /REVOKE ALL ON FUNCTION ([^;]*?) FROM PUBLIC;/g;
    const revoked = [...sql.matchAll(revoke)].flatMap((m) => [...(m[1] ?? "").matchAll(/public\.(shared_[a-z_]+)\(jsonb\)/g)].map((n) => n[1]));
    expect([...revoked].sort()).toEqual([...names].sort());
  });

  it("shared_stop utilise shared_exceptions pour exceptions (plus aucune fonction de chaînes libres)", () => {
    expect(body("stop")).toContain("'exceptions', public.shared_exceptions(p -> 'exceptions')");
    expect(sql).not.toContain("shared_strings");
  });
});
