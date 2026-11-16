// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  PREVENTE_CODES,
  PREVENTE_DECOUVERTES,
  PREVENTE_MOTIFS,
  PREVENTE_PARCOURS,
  PREVENTE_PERIODES,
  PREVENTE_PREPARATIONS,
  PREVENTE_PROVENANCES,
  PREVENTE_RUBRIQUES,
} from "../../../db/prevente-codes";

/**
 * Migration 0029_prevente_mesure (spécification `specs/C2-prevente-mesure.md`, § 4 et § 5 ; tâche C2a, ticket 1117) :
 * forme du texte de la migration et de sa descente, lisible sans base. Les effets en base (droits, contraintes,
 * concurrence, plafond, relevé, descente jouée) : `tests/db/prevente-mesure.test.ts` et `tests/db/roles.test.ts`.
 */
const RACINE = process.cwd();
const MIGRATIONS = path.join(RACINE, "db/migrations");
const lire = (fichier: string) => readFileSync(path.join(MIGRATIONS, fichier), "utf8");
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
const SQL = instructions(lire("0029_prevente_mesure.sql"));
const DOWN = instructions(lire("0029_prevente_mesure.down.sql"));
const journal = JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] };
const TABLES = ["prevente_visites", "prevente_reponses_jour", "prevente_reponses"];
const FONCTIONS = [
  "prevente_compter_visite",
  "prevente_enregistrer_reponse",
  "prevente_releve_visites",
  "prevente_releve_reponses",
  "prevente_releve_destinations",
];
const entreApostrophes = (texte: string) => [...texte.matchAll(/'([^']*)'/g)].map((m) => m[1] as string);
const une = (liste: string[], debut: string): string => {
  const trouvees = liste.filter((i) => i.startsWith(debut));
  expect(trouvees, debut).toHaveLength(1);
  return trouvees[0] as string;
};

describe("migration 0029_prevente_mesure : forme", () => {
  it("journal : 0029 suit 0028, seule entrée de ce rang", () => {
    expect(journal.entries.filter((e) => e.idx === 29).map((e) => e.tag)).toEqual(["0029_prevente_mesure"]);
    expect(journal.entries[28]?.tag).toBe("0028_purge_place_coordinates");
  });

  it("additive : trois CREATE TABLE, aucun DROP, DELETE, TRUNCATE ni ALTER d'une autre table ; aucun rôle créé ; se termine hors de tout rôle pris", () => {
    expect(SQL.filter((i) => i.startsWith("CREATE TABLE")).map((i) => /^CREATE TABLE "([a-z_]+)"/.exec(i)?.[1]).sort()).toEqual([...TABLES].sort());
    for (const i of SQL.filter((x) => !x.startsWith("CREATE FUNCTION"))) {
      expect(i).not.toMatch(/\b(DROP|DELETE|TRUNCATE|CREATE ROLE|ALTER ROLE)\b/);
    }
    for (const i of SQL.filter((x) => x.startsWith("ALTER TABLE"))) expect(i).toMatch(/^ALTER TABLE public\.prevente_[a-z_]+ (ENABLE|FORCE) ROW LEVEL SECURITY;$/);
    expect(SQL[0]).toBe("SET LOCAL ROLE vadrouille_owner;");
    expect(SQL.at(-1)).toBe("REVOKE vadrouille_fn_prevente_releve FROM vadrouille_migrator GRANTED BY vadrouille_migrator;");
    const pris = SQL.filter((i) => i.startsWith("SET LOCAL ROLE") || i === "RESET ROLE;");
    expect(pris).toEqual([
      "SET LOCAL ROLE vadrouille_owner;",
      "RESET ROLE;",
      "SET LOCAL ROLE vadrouille_fn_prevente;",
      "RESET ROLE;",
      "SET LOCAL ROLE vadrouille_fn_prevente_releve;",
      "RESET ROLE;",
    ]);
  });

  it("RLS activée et forcée sur chacune des trois tables", () => {
    for (const table of TABLES) {
      expect(SQL).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(SQL).toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }
  });

  it("aucun droit de table ni politique pour un rôle applicatif ou de connexion : seuls les deux propriétaires de fonctions", () => {
    const surTables = SQL.filter((i) => /^GRANT .* ON public\.prevente_/.test(i));
    expect(surTables).toHaveLength(7);
    for (const i of surTables) {
      expect(i).toMatch(/ TO vadrouille_fn_prevente(_releve)?;$/);
      expect(i).not.toMatch(/\b(DELETE|TRUNCATE|ALL)\b/);
    }
    const politiques = SQL.filter((i) => i.startsWith("CREATE POLICY"));
    expect(politiques).toHaveLength(9);
    for (const i of politiques) expect(i).toMatch(/ FOR (SELECT|INSERT|UPDATE) TO vadrouille_fn_prevente(_releve)? /);
    // Le relevé ne lit ni `id` ni `jour` d'une réponse, et rien du compteur du jour.
    expect(SQL).toContain(
      "GRANT SELECT (src, parcours, destination, periode, preparation, motifs, decouverte) ON public.prevente_reponses TO vadrouille_fn_prevente_releve;",
    );
    expect(SQL.some((i) => /prevente_reponses_jour TO vadrouille_fn_prevente_releve/.test(i))).toBe(false);
  });

  it("EXECUTE : écriture à vadrouille_app seul, relevé à vadrouille_prevente_releve seul ; PUBLIC retiré de chaque fonction", () => {
    const execute = SQL.filter((i) => i.startsWith("GRANT EXECUTE"));
    expect(execute.map((i) => /public\.([a-z_]+)\(.* TO ([a-z_]+);$/.exec(i)?.slice(1, 3))).toEqual([
      ["prevente_compter_visite", "vadrouille_app"],
      ["prevente_enregistrer_reponse", "vadrouille_app"],
      ["prevente_releve_visites", "vadrouille_prevente_releve"],
      ["prevente_releve_reponses", "vadrouille_prevente_releve"],
      ["prevente_releve_destinations", "vadrouille_prevente_releve"],
    ]);
    for (const fonction of FONCTIONS) {
      expect(SQL.filter((i) => i.startsWith(`REVOKE ALL ON FUNCTION public.${fonction}(`) && i.endsWith("FROM PUBLIC;")), fonction).toHaveLength(1);
    }
  });

  it("cinq fonctions, toutes SECURITY DEFINER au search_path figé ; le jour vient de l'horloge de la base, en UTC ; aucun SQL dynamique", () => {
    const fonctions = SQL.filter((i) => i.startsWith("CREATE FUNCTION"));
    expect(fonctions.map((i) => /^CREATE FUNCTION public\.([a-z_]+)\(/.exec(i)?.[1])).toEqual(FONCTIONS);
    for (const i of fonctions) {
      expect(i).toContain("SECURITY DEFINER");
      expect(i).toContain("SET search_path = pg_catalog, pg_temp");
      expect(i).not.toMatch(/\bEXECUTE\b/);
    }
    for (const i of fonctions.slice(0, 2)) expect(i).toContain("(pg_catalog.now() AT TIME ZONE 'UTC')::date");
    // Aucun paramètre de date ou d'heure : l'appelant ne pose jamais le jour.
    for (const i of fonctions) expect(i.slice(0, i.indexOf("AS $$"))).not.toMatch(/p_[a-z_]+ (date|timestamp|timestamptz|time)\b/);
    // Relevé : types rendus limités aux nombres, aux dates et au domaine des codes.
    expect(une(fonctions, "CREATE FUNCTION public.prevente_releve_visites")).toContain("RETURNS TABLE (semaine date, src public.prevente_code, visites bigint)");
    expect(une(fonctions, "CREATE FUNCTION public.prevente_releve_reponses")).toContain(
      "RETURNS TABLE (rubrique public.prevente_code, code public.prevente_code, reponses bigint)",
    );
    expect(une(fonctions, "CREATE FUNCTION public.prevente_releve_destinations")).toContain(
      "RETURNS TABLE (reponses_avec_destination bigint, destinations_citees_deux_fois bigint)",
    );
  });

  it("le plafond du jour est borné de 1 à 200 dans la fonction et dans la table", () => {
    const fonction = une(SQL, "CREATE FUNCTION public.prevente_enregistrer_reponse");
    expect(fonction).toContain("p_plafond integer DEFAULT 200)");
    expect(fonction).toContain("IF p_plafond IS NULL OR p_plafond < 1 OR p_plafond > 200 THEN");
    expect(fonction).toContain("WHERE j.reponses < p_plafond;");
    expect(une(SQL, 'CREATE TABLE "prevente_reponses_jour"')).toContain('CHECK ("prevente_reponses_jour"."reponses" BETWEEN 1 AND 200)');
  });

  it("listes fermées : les CHECK et le domaine portent exactement les codes de db/prevente-codes.ts ; interne n'y est nulle part", () => {
    const contrainte = (table: string, nom: string): string => {
      const ligne = une(SQL, `CREATE TABLE "${table}"`)
        .split("\n")
        .find((l) => l.includes(`CONSTRAINT "${nom}"`));
      expect(ligne, nom).toBeDefined();
      return ligne as string;
    };
    expect(entreApostrophes(contrainte("prevente_visites", "prevente_visites_src_check"))).toEqual([...PREVENTE_PROVENANCES]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_src_check"))).toEqual([...PREVENTE_PROVENANCES]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_parcours_check"))).toEqual([...PREVENTE_PARCOURS]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_periode_check"))).toEqual([...PREVENTE_PERIODES]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_preparation_check"))).toEqual([...PREVENTE_PREPARATIONS]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_decouverte_check"))).toEqual([...PREVENTE_DECOUVERTES]);
    expect(entreApostrophes(contrainte("prevente_reponses", "prevente_reponses_motifs_check"))).toEqual([
      "precommande",
      ...PREVENTE_MOTIFS.precommande,
      "visite",
      ...PREVENTE_MOTIFS.visite,
    ]);
    const domaine = une(SQL, "CREATE DOMAIN public.prevente_code AS text");
    expect(entreApostrophes(domaine)).toEqual([...PREVENTE_CODES]);
    expect(new Set(PREVENTE_CODES).size).toBe(PREVENTE_CODES.length);
    for (const rubrique of PREVENTE_RUBRIQUES) expect(PREVENTE_CODES).toContain(rubrique);
    for (const i of SQL) expect(i).not.toMatch(/'interne'/);
    expect(PREVENTE_CODES).not.toContain("interne");
    expect(PREVENTE_PROVENANCES).toHaveLength(9);
  });

  it("colonnes : ni heure, ni adresse réseau, ni document libre ; les seuls types sont date, integer, text, text[] et uuid", () => {
    const colonnes = SQL.filter((i) => i.startsWith("CREATE TABLE"))
      .flatMap((i) => i.split("\n"))
      .filter((l) => /^\t"[a-z_]+" /.test(l))
      .map((l) => /^\t"([a-z_]+)" ([a-z\[\]]+)/.exec(l)?.slice(1, 3).join(" "));
    expect(colonnes).toEqual([
      "id uuid",
      "jour date",
      "src text",
      "parcours text",
      "destination text",
      "periode text",
      "preparation text[]",
      "motifs text[]",
      "decouverte text",
      "jour date",
      "reponses integer",
      "jour date",
      "src text",
      "visites integer",
    ]);
  });
});

describe("migration 0029_prevente_mesure : descente partielle, sans suppression de données", () => {
  it("aucun DROP TABLE, DROP COLUMN, DELETE ni TRUNCATE ; la RLS n'est pas désactivée", () => {
    for (const i of DOWN) {
      expect(i).not.toMatch(/\b(DROP TABLE|DROP COLUMN|DELETE|TRUNCATE|DISABLE ROW LEVEL SECURITY|NO FORCE ROW LEVEL SECURITY)\b/);
    }
  });

  it("retire les cinq fonctions sous leur propriétaire, puis le domaine, les droits et les neuf politiques ; se termine par RESET ROLE", () => {
    const drops = DOWN.filter((i) => i.startsWith("DROP FUNCTION")).map((i) => /public\.([a-z_]+)\(/.exec(i)?.[1]);
    expect([...drops].sort()).toEqual([...FONCTIONS].sort());
    expect(DOWN.filter((i) => i.startsWith("DROP POLICY"))).toHaveLength(9);
    expect(DOWN.filter((i) => i.startsWith("DROP DOMAIN"))).toEqual(["DROP DOMAIN public.prevente_code;"]);
    expect(DOWN.filter((i) => /^REVOKE .* ON public\.prevente_/.test(i))).toHaveLength(7);
    expect(DOWN.at(-1)).toBe("RESET ROLE;");
    // Chaque politique et chaque droit de table créés par la montée sont retirés par la descente.
    const creees = SQL.filter((i) => i.startsWith("CREATE POLICY")).map((i) => /^CREATE POLICY ([a-z_]+) ON (public\.[a-z_]+)/.exec(i)?.slice(1, 3).join(" ON "));
    const retirees = DOWN.filter((i) => i.startsWith("DROP POLICY")).map((i) => /^DROP POLICY (.+);$/.exec(i)?.[1]);
    expect([...retirees].sort()).toEqual([...creees].sort());
    const accordes = SQL.filter((i) => /^GRANT .* ON public\.prevente_/.test(i)).map((i) => i.replace(/^GRANT /, "").replace(" TO ", " | "));
    const revoques = DOWN.filter((i) => /^REVOKE .* ON public\.prevente_/.test(i)).map((i) => i.replace(/^REVOKE /, "").replace(" FROM ", " | "));
    expect([...revoques].sort()).toEqual([...accordes].sort());
    // Les appartenances temporaires sont accordées puis retirées, pour les deux propriétaires.
    for (const role of ["vadrouille_fn_prevente", "vadrouille_fn_prevente_releve"]) {
      const accorde = DOWN.indexOf(`GRANT ${role} TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;`);
      const retire = DOWN.indexOf(`REVOKE ${role} FROM vadrouille_migrator GRANTED BY vadrouille_migrator;`);
      expect(accorde, role).toBeGreaterThan(-1);
      expect(retire, role).toBeGreaterThan(accorde);
    }
  });
});
