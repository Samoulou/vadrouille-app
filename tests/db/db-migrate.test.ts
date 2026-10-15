import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { readMigrations, runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { closeAll, connectBaseJetable } from "./helpers";
import {
  creerBase,
  dossierTemporaire,
  ecrireMigration,
  espaceDeTravail,
  ETAPE_MIGRATE,
  executer,
  lancer,
  ligneApprouvee,
  type Options,
  remplacerListe,
  requeteAdmin,
  supprimerBases,
  WORKFLOWS,
} from "./workflows-harnais";

/**
 * `ci: l'exécuteur de db-migrate.yml et db/migrate.ts tiennent le même journal` (décision 0056, « Tests imposés »),
 * sur le serveur de la CI (`postgres:17.11`), dans des bases jetables créées vides par le harnais
 * (`tests/db/workflows-harnais.ts`, Q412). Le bloc `run:` du workflow est joué tel quel, avec une liste d'approbation
 * posée par le test, qui remplace le bloc entier de la liste du workflow quel qu'en soit le contenu (la liste du dépôt
 * grandit, 0056 § 3.4) ; aucune base réelle, aucun secret réel.
 */

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const WF = "db-migrate.yml";
const JOURNAL = readMigrations();
const LISTE_JOURNAL = JOURNAL.map((m) => `${m.tag} ${m.sha256}`);

/** La liste est toujours explicite : les tests ne dépendent pas du contenu de la liste du dépôt. */
function migrer(options: Options & { readonly liste: readonly string[] }) {
  return executer(WF, ETAPE_MIGRATE, options);
}

/** Lignes de `vadrouille_migrations.applied`, ou `null` si la table n'existe pas (aucune connexion de l'exécuteur). */
async function journal(base: string): Promise<string[] | null> {
  const [existe] = await requeteAdmin<{ t: string | null }>(base, "SELECT pg_catalog.to_regclass('vadrouille_migrations.applied')::text AS t");
  if (existe?.t === null) return null;
  return (await requeteAdmin<{ l: string }>(base, "SELECT tag || ' ' || sha256 AS l FROM vadrouille_migrations.applied ORDER BY tag")).map((r) => r.l);
}

async function existe(base: string, relation: string): Promise<boolean> {
  const [r] = await requeteAdmin<{ t: string | null }>(base, "SELECT pg_catalog.to_regclass($1)::text AS t", [relation]);
  return r?.t !== null;
}

/**
 * Catalogue d'une base, hors objets du système : schémas, relations, colonnes, contraintes, index, types, fonctions
 * (avec l'empreinte de leur définition), politiques, déclencheurs, règles, privilèges par défaut ; et appartenances
 * (communes au serveur). Propriétaires et droits compris.
 */
const CATALOGUE = [
  `SELECT 'schema' AS k, n.nspname || ' ' || pg_catalog.pg_get_userbyid(n.nspowner) || ' ' || COALESCE(n.nspacl::text, '') AS v
     FROM pg_catalog.pg_namespace n WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
  `SELECT 'relation', n.nspname || '.' || c.relname || ' ' || c.relkind::text || ' ' || pg_catalog.pg_get_userbyid(c.relowner) || ' ' || COALESCE(c.relacl::text, '')
       || ' ' || c.relrowsecurity || ' ' || c.relforcerowsecurity || ' ' || COALESCE(pg_catalog.array_to_string(c.reloptions, ','), '')
     FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
  `SELECT 'colonne', n.nspname || '.' || c.relname || '.' || a.attname || ' ' || pg_catalog.format_type(a.atttypid, a.atttypmod) || ' ' || a.attnotnull
       || ' ' || COALESCE(pg_catalog.pg_get_expr(d.adbin, d.adrelid), '') || ' ' || COALESCE(a.attacl::text, '')
     FROM pg_catalog.pg_attribute a JOIN pg_catalog.pg_class c ON c.oid = a.attrelid JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
     LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
     WHERE a.attnum > 0 AND NOT a.attisdropped AND n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
  `SELECT 'contrainte', n.nspname || '.' || c.conname || ' ' || pg_catalog.pg_get_constraintdef(c.oid)
     FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid = c.connamespace
     WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
  `SELECT 'index', schemaname || ' ' || indexdef FROM pg_catalog.pg_indexes WHERE schemaname NOT LIKE 'pg\\_%' AND schemaname <> 'information_schema'`,
  `SELECT 'type', n.nspname || '.' || t.typname || ' ' || t.typtype::text || ' ' || pg_catalog.pg_get_userbyid(t.typowner) || ' '
       || COALESCE((SELECT pg_catalog.string_agg(e.enumlabel, ',' ORDER BY e.enumsortorder) FROM pg_catalog.pg_enum e WHERE e.enumtypid = t.oid), '')
     FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
     WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema'`,
  `SELECT 'fonction', p.oid::pg_catalog.regprocedure::text || ' ' || pg_catalog.pg_get_userbyid(p.proowner) || ' ' || p.prosecdef || ' '
       || COALESCE(p.proacl::text, '') || ' ' || COALESCE(p.proconfig::text, '') || ' ' || pg_catalog.md5(pg_catalog.pg_get_functiondef(p.oid))
     FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname NOT LIKE 'pg\\_%' AND n.nspname <> 'information_schema' AND p.prokind IN ('f', 'p')`,
  `SELECT 'politique', schemaname || '.' || tablename || '.' || policyname || ' ' || permissive || ' ' || roles::text || ' ' || cmd || ' '
       || COALESCE(qual, '') || ' ' || COALESCE(with_check, '') FROM pg_catalog.pg_policies`,
  `SELECT 'declencheur', c.oid::pg_catalog.regclass::text || ' ' || pg_catalog.pg_get_triggerdef(t.oid)
     FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid WHERE NOT t.tgisinternal`,
  `SELECT 'regle', schemaname || '.' || tablename || '.' || rulename || ' ' || definition FROM pg_catalog.pg_rules
     WHERE schemaname NOT LIKE 'pg\\_%' AND schemaname <> 'information_schema'`,
  `SELECT 'defaut', pg_catalog.pg_get_userbyid(d.defaclrole) || ' ' || COALESCE(d.defaclnamespace::pg_catalog.regnamespace::text, '') || ' '
       || d.defaclobjtype::text || ' ' || COALESCE(d.defaclacl::text, '') FROM pg_catalog.pg_default_acl d`,
  `SELECT 'appartenance', pg_catalog.pg_get_userbyid(m.roleid) || ' ' || pg_catalog.pg_get_userbyid(m.member) || ' ' || m.admin_option
       || ' ' || m.inherit_option || ' ' || m.set_option FROM pg_catalog.pg_auth_members m`,
  `SELECT 'droits-base', COALESCE(NULLIF(a.grantee, 0)::pg_catalog.regrole::text, 'PUBLIC') || ':' || a.privilege_type
     FROM pg_catalog.pg_database d, LATERAL pg_catalog.aclexplode(COALESCE(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
     WHERE d.datname = pg_catalog.current_database()`,
];

async function catalogue(base: string): Promise<string[]> {
  const lignes: string[] = [];
  for (const sql of CATALOGUE) for (const r of await requeteAdmin<{ k: string; v: string }>(base, `SELECT x.k, x.v FROM (${sql}) AS x(k, v)`)) lignes.push(`${r.k} ${r.v}`);
  return lignes.sort();
}

/** Nombre d'objets du système (pg_catalog, pg_temp) : inchangé par les migrations, quel que soit l'exécuteur. */
async function objetsSysteme(base: string): Promise<string> {
  const [r] = await requeteAdmin<{ v: string }>(
    base,
    `SELECT (SELECT count(*) FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname IN ('pg_catalog') OR n.nspname LIKE 'pg\\_temp%')
       || ' ' || (SELECT count(*) FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname IN ('pg_catalog') OR n.nspname LIKE 'pg\\_temp%')
       || ' ' || (SELECT count(*) FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname IN ('pg_catalog') OR n.nspname LIKE 'pg\\_temp%') AS v`,
  );
  return r!.v;
}

async function migrerParDbMigrate(base: string) {
  return runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", base) });
}

function appliquees(sortie: string): string[] {
  return [...sortie.matchAll(/^Appliquée : (\S+)$/gm)].map((m) => m[1]!);
}
function ignorees(sortie: string): string[] {
  return [...sortie.matchAll(/^Ignorée \(déjà appliquée\) : (\S+)$/gm)].map((m) => m[1]!);
}

describe("ci: l'exécuteur de db-migrate.yml et db/migrate.ts tiennent le même journal (0056)", () => {
  it("toutes les migrations du journal, sur une base vide : même journal et même catalogue que db/migrate.ts ; objets dans public et prototype seulement", async () => {
    const [vide, parExecuteur, parDbMigrate] = await Promise.all([creerBase("dm_vide"), creerBase("dm_exec"), creerBase("dm_ts")]);
    const r = migrer({ base: parExecuteur, liste: LISTE_JOURNAL });
    expect(r.code, r.sortie).toBe(0);
    expect(appliquees(r.sortie)).toEqual(JOURNAL.map((m) => m.tag));
    expect(r.sortie).toContain(`Lignes de la liste d'approbation : ${JOURNAL.length}`);
    await migrerParDbMigrate(parDbMigrate);
    expect(await journal(parExecuteur)).toEqual(LISTE_JOURNAL);
    expect(await journal(parDbMigrate)).toEqual(LISTE_JOURNAL);
    const [cExec, cTs] = await Promise.all([catalogue(parExecuteur), catalogue(parDbMigrate)]);
    expect(cExec).toEqual(cTs);
    expect(cExec.some((l) => l.startsWith("relation public."))).toBe(true);
    expect(cExec.some((l) => l.startsWith("relation prototype."))).toBe(true);
    expect(await objetsSysteme(parExecuteur)).toBe(await objetsSysteme(vide));
    expect(await objetsSysteme(parDbMigrate)).toBe(await objetsSysteme(vide));
  });

  it("base vide puis db/migrate.ts, et l'inverse : rien de plus, même catalogue ; second passage sans effet", async () => {
    const [a, b] = await Promise.all([creerBase("dm_a"), creerBase("dm_b")]);
    expect(migrer({ base: a, liste: LISTE_JOURNAL }).code).toBe(0);
    const rapport = await migrerParDbMigrate(a);
    expect(rapport.applied).toEqual([]);
    expect(rapport.skipped).toEqual(JOURNAL.map((m) => m.tag));
    await migrerParDbMigrate(b);
    const r = migrer({ base: b, liste: LISTE_JOURNAL });
    expect(r.code, r.sortie).toBe(0);
    expect(appliquees(r.sortie)).toEqual([]);
    expect(ignorees(r.sortie)).toEqual(JOURNAL.map((m) => m.tag));
    expect(await catalogue(a)).toEqual(await catalogue(b));
    const avant = await catalogue(a);
    const second = migrer({ base: a, liste: LISTE_JOURNAL });
    expect(second.code).toBe(0);
    expect(appliquees(second.sortie)).toEqual([]);
    expect(await catalogue(a)).toEqual(avant);
    expect(await journal(a)).toEqual(LISTE_JOURNAL);
  });

  it("migration présente au journal mais absente de la liste : non appliquée", async () => {
    const base = await creerBase("dm_prefixe");
    const r = migrer({ base, liste: LISTE_JOURNAL.slice(0, 2) });
    expect(r.code, r.sortie).toBe(0);
    expect(await journal(base)).toEqual(LISTE_JOURNAL.slice(0, 2));
    expect(await existe(base, "prototype.runs")).toBe(false);
  });

  it("liste vide : aucune connexion", async () => {
    const base = await creerBase("dm_liste_vide");
    const r = migrer({ base, liste: [] });
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain("Aucune migration approuvée : aucune connexion.");
    expect(await journal(base)).toBeNull();
  });

  it("liste non vide dans le workflow (texte muté en mémoire) : le harnais la remplace en entier", async () => {
    const yaml = readFileSync(path.join(WORKFLOWS, WF), "utf8");
    const lignes = LISTE_JOURNAL.map((l) => `            "${l}"`).join("\n");
    const mute = yaml.replace(/^( *)MIGRATIONS_APPROUVEES=\($/m, (debut) => `${debut}\n${lignes}`);
    expect(mute).not.toBe(yaml);
    const vide = await creerBase("dm_yaml_vide");
    const r1 = migrer({ base: vide, liste: [], workflow: mute });
    expect(r1.code, r1.sortie).toBe(0);
    expect(r1.sortie).toContain("Aucune migration approuvée : aucune connexion.");
    expect(await journal(vide)).toBeNull();
    const une = await creerBase("dm_yaml_une");
    const r2 = migrer({ base: une, liste: LISTE_JOURNAL.slice(0, 1), workflow: mute });
    expect(r2.code, r2.sortie).toBe(0);
    expect(await journal(une)).toEqual(LISTE_JOURNAL.slice(0, 1));
  });
});

describe("harnais : remplacement de la liste d'approbation (motif à ancres, une seule occurrence)", () => {
  const run = 'set -eo pipefail\nMIGRATIONS_APPROUVEES=(\n  "0000_a 00"\n  "0001_b 11"\n)\nfor l in "${MIGRATIONS_APPROUVEES[@]}"; do :; done\n';

  it("remplace le bloc entier, liste vide comprise", () => {
    expect(remplacerListe(run, [])).toBe('set -eo pipefail\nMIGRATIONS_APPROUVEES=(\n)\nfor l in "${MIGRATIONS_APPROUVEES[@]}"; do :; done\n');
    expect(remplacerListe(run, ["0002_c 22"])).toContain('MIGRATIONS_APPROUVEES=(\n  "0002_c 22"\n)\nfor');
  });

  it("refuse un bloc absent ou en double", () => {
    expect(() => remplacerListe("echo rien\n", [])).toThrow(/0 bloc/);
    expect(() => remplacerListe(`${run}${run}`, [])).toThrow(/2 bloc/);
    expect(() => remplacerListe(`${run}MIGRATIONS_APPROUVEES=()\n`, [])).toThrow(/2 affectation/);
  });
});

describe("db-migrate : refus sans connexion, rien n'est appliqué (0056 § 2.6.1)", () => {
  const SENTINELLE = "sentinelle0hote0secret";

  async function refusSansConnexion(options: Omit<Options, "base"> & { readonly liste: readonly string[] }, message: RegExp): Promise<string> {
    const base = await creerBase("dm_refus");
    const r = migrer({ base, ...options });
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).toMatch(message);
    expect(await journal(base), "aucune connexion : la table du journal n'existe pas").toBeNull();
    expect(await existe(base, "public.organizations")).toBe(false);
    return r.sortie;
  }

  it("empreinte de la liste fausse", async () => {
    const liste = [...LISTE_JOURNAL];
    liste[1] = `${JOURNAL[1]!.tag} ${"0".repeat(64)}`;
    await refusSansConnexion({ liste }, /0001_securite : empreinte différente/);
  });

  it("fichier modifié après approbation", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "0002_place_coordinates", `${readFileSync(path.join(espace, "db/migrations/0002_place_coordinates.sql"), "utf8")}\n-- ajout\n`);
    await refusSansConnexion({ liste: LISTE_JOURNAL, espace }, /0002_place_coordinates : empreinte différente/);
  });

  it("lien symbolique : fichier, puis répertoire", async () => {
    const espace = espaceDeTravail();
    const ailleurs = dossierTemporaire("ailleurs-");
    const cible = path.join(ailleurs, "0000_socle.sql");
    renameSync(path.join(espace, "db/migrations/0000_socle.sql"), cible);
    symlinkSync(cible, path.join(espace, "db/migrations/0000_socle.sql"));
    await refusSansConnexion({ liste: LISTE_JOURNAL, espace }, /0000_socle : lien symbolique/);

    const espace2 = dossierTemporaire("espace-lien-");
    mkdirSync(path.join(espace2, "db"));
    symlinkSync(path.join(espaceDeTravail(), "db/migrations"), path.join(espace2, "db/migrations"));
    await refusSansConnexion({ liste: LISTE_JOURNAL, espace: espace2 }, /0000_socle : lien symbolique/);
  });

  it("fichier vide, avec octet NUL, de plus de 100 Kio, ou commençant par une barre oblique inverse", async () => {
    const cas: [string, string | Buffer, RegExp][] = [
      ["9001_vide", "", /9001_vide : fichier vide/],
      ["9002_nul", Buffer.from("SELECT 1;\0SELECT 2;\n"), /9002_nul : octet NUL/],
      ["9003_grand", `SELECT 1;\n${"-".repeat(102_400)}\n`, /9003_grand : plus de 100 Kio/],
      ["9004_barre", "\\! true\nSELECT 1;\n", /9004_barre : commence par une barre oblique inverse/],
    ];
    for (const [tag, contenu, message] of cas) {
      const espace = espaceDeTravail();
      ecrireMigration(espace, tag, contenu);
      await refusSansConnexion({ liste: [LISTE_JOURNAL[0]!, ligneApprouvee(espace, tag)], espace }, message);
    }
  });

  it("migration qui nomme vadrouille_migrate., quelle que soit la casse", async () => {
    for (const texte of ["SELECT pg_catalog.set_config('vadrouille_migrate.txid', '1', true);\n", "SET LOCAL Vadrouille_Migrate.txid = '1';\n"]) {
      const espace = espaceDeTravail();
      ecrireMigration(espace, "9005_repere", texte);
      await refusSansConnexion({ liste: [ligneApprouvee(espace, "9005_repere")], espace }, /9005_repere : nomme un paramètre vadrouille_migrate/);
    }
  });

  it("sha_attendu hors forme, ou différent du commit lancé", async () => {
    await refusSansConnexion({ liste: LISTE_JOURNAL, env: { SHA_ATTENDU: "C0FFEE".padEnd(40, "0") } }, /sha_attendu hors forme/);
    await refusSansConnexion({ liste: LISTE_JOURNAL, env: { SHA_ATTENDU: "1".repeat(40) } }, /sha_attendu différent du commit lancé/);
  });

  it("ligne de la liste hors forme", async () => {
    await refusSansConnexion({ liste: [`0000_Socle ${JOURNAL[0]!.sha256}`] }, /ligne de la liste d'approbation hors forme/);
  });

  it("PGHOST poolé ou hors forme, PGDATABASE hors forme : la valeur n'apparaît pas dans la sortie", async () => {
    for (const [env, message] of [
      [{ PGHOST: `ep-${SENTINELLE}-pooler.exemple.invalid` }, /PGHOST désigne l'hôte poolé/],
      [{ PGHOST: `${SENTINELLE}.Exemple` }, /PGHOST hors forme/],
      [{ PGHOST: `${SENTINELLE};x` }, /PGHOST hors forme/],
      [{ PGDATABASE: `${SENTINELLE}-base` }, /PGDATABASE hors forme/],
    ] as const) {
      const sortie = await refusSansConnexion({ liste: LISTE_JOURNAL, env }, message);
      expect(sortie).not.toContain(SENTINELLE);
    }
  });
});

describe("db-migrate : application, échecs et lots (0056 § 2.6.4)", () => {
  it("migration accentuée acceptée : même empreinte pour db/migrate.ts (texte décodé) et pour l'exécuteur (octets)", async () => {
    const espace = espaceDeTravail();
    const texte = "-- café, crème\nCREATE TABLE public.t_accent (v text);\n";
    ecrireMigration(espace, "9010_accent", texte);
    const ligne = ligneApprouvee(espace, "9010_accent");
    expect(ligne.split(" ")[1]).toBe(createHash("sha256").update(texte).digest("hex"));
    const base = await creerBase("dm_accent");
    const r = migrer({ base, liste: [ligne], espace });
    expect(r.code, r.sortie).toBe(0);
    expect(await journal(base)).toEqual([ligne]);
  });

  it("fichier commençant par un BOM : empreintes égales, mais le serveur rejette le texte envoyé", async () => {
    const espace = espaceDeTravail();
    const octets = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("CREATE TABLE public.t_bom (v text);\n")]);
    ecrireMigration(espace, "9011_bom", octets);
    const ligne = ligneApprouvee(espace, "9011_bom");
    expect(ligne.split(" ")[1]).toBe(createHash("sha256").update(octets.toString("utf8")).digest("hex"));
    const base = await creerBase("dm_bom");
    const r = migrer({ base, liste: [ligne], espace });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/migration 9011_bom ; code de sortie 1 ; SQLSTATE 42601/);
    expect(await existe(base, "public.t_bom")).toBe(false);
    expect(await journal(base)).toEqual([]);
  });

  it("textes que psql pourrait interpréter : envoyés tels quels au serveur, aucune substitution, aucune commande", async () => {
    const espace = espaceDeTravail();
    const sentinelle = path.join(dossierTemporaire("sentinelle-"), "touchee");
    ecrireMigration(
      espace,
      "9020_litteraux",
      `CREATE TABLE public.t_psql (n int, v text);\nINSERT INTO public.t_psql VALUES (1, ':DBNAME'), (2, ':''DBNAME'''), (3, ':"DBNAME"'), (4, ':{?DBNAME}'), (5, 'x'::text), (6, $$ :DBNAME \\! touch ${sentinelle} $$);\n`,
    );
    ecrireMigration(espace, "9021_variable", "SELECT :'DBNAME';\n");
    ecrireMigration(espace, "9022_commande", `SELECT 1;\n\\! touch ${sentinelle}\n`);
    const base = await creerBase("dm_psql");
    const r = migrer({ base, liste: [ligneApprouvee(espace, "9020_litteraux")], espace });
    expect(r.code, r.sortie).toBe(0);
    const valeurs = (await requeteAdmin<{ v: string }>(base, "SELECT v FROM public.t_psql ORDER BY n")).map((l) => l.v);
    expect(valeurs).toEqual([":DBNAME", ":'DBNAME'", ':"DBNAME"', ":{?DBNAME}", "x", ` :DBNAME \\! touch ${sentinelle} `]);
    // Hors d'un littéral, :'DBNAME' (variable définie par psql) arrive au serveur sans substitution : erreur de syntaxe.
    const variable = migrer({ base, liste: [ligneApprouvee(espace, "9020_litteraux"), ligneApprouvee(espace, "9021_variable")], espace });
    expect(variable.code).toBe(1);
    expect(variable.sortie).toMatch(/migration 9021_variable ; code de sortie 1 ; SQLSTATE 42601/);
    const commande = migrer({ base, liste: [ligneApprouvee(espace, "9020_litteraux"), ligneApprouvee(espace, "9022_commande")], espace });
    expect(commande.code).toBe(1);
    expect(commande.sortie).toMatch(/migration 9022_commande ; code de sortie 1 ; SQLSTATE 42601/);
    expect(existsSync(sentinelle)).toBe(false);
    expect(await journal(base)).toEqual([ligneApprouvee(espace, "9020_litteraux")]);
  });

  it("migration déjà appliquée avec une autre empreinte : échec, rien d'autre n'est appliqué", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9030_premiere", "CREATE TABLE public.t_premiere (v text);\n");
    const base = await creerBase("dm_autre_empreinte");
    const premiere = ligneApprouvee(espace, "9030_premiere");
    expect(migrer({ base, liste: [premiere], espace }).code).toBe(0);
    ecrireMigration(espace, "9030_premiere", "CREATE TABLE public.t_premiere (v text, w text);\n");
    ecrireMigration(espace, "9031_seconde", "CREATE TABLE public.t_seconde (v text);\n");
    const r = migrer({ base, liste: [ligneApprouvee(espace, "9030_premiere"), ligneApprouvee(espace, "9031_seconde")], espace });
    expect(r.code).toBe(1);
    expect(r.sortie).toContain("migration 9030_premiere déjà appliquée avec une autre empreinte : écrire une nouvelle migration");
    expect(await existe(base, "public.t_seconde")).toBe(false);
    expect(await journal(base)).toEqual([premiere]);
  });

  it("migration en échec : SQLSTATE affiché, rien ne reste ; lot partiel : les deux premières journalisées, les suivantes non tentées", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9040_un", "CREATE TABLE public.t_un (v text);\n");
    ecrireMigration(espace, "9041_deux", "CREATE TABLE public.t_deux (v text);\n");
    ecrireMigration(espace, "9042_trois", "CREATE TABLE public.t_trois (v text);\nSELECT 1 / 0;\n");
    ecrireMigration(espace, "9043_quatre", "CREATE TABLE public.t_quatre (v text);\n");
    const liste = ["9040_un", "9041_deux", "9042_trois", "9043_quatre"].map((t) => ligneApprouvee(espace, t));
    const base = await creerBase("dm_lot");
    const r = migrer({ base, liste, espace });
    expect(r.code).toBe(1);
    expect(appliquees(r.sortie)).toEqual(["9040_un", "9041_deux"]);
    expect(r.sortie).toMatch(/Échec : migration 9042_trois ; code de sortie 1 ; SQLSTATE 22012/);
    expect(r.sortie).not.toContain("division");
    expect(await journal(base)).toEqual(liste.slice(0, 2));
    expect(await existe(base, "public.t_trois")).toBe(false);
    expect(await existe(base, "public.t_quatre")).toBe(false);
  });

  it("contrôles après le texte : COMMIT, SET ROLE ou SET SESSION AUTHORIZATION dans la migration : échec, aucune insertion dans le journal", async () => {
    const cas: [string, string][] = [
      ["9050_commit", "CREATE TABLE public.t_commit (v text);\nCOMMIT;\n"],
      ["9051_role", "SET ROLE vadrouille_owner;\nCREATE TABLE public.t_role (v text);\n"],
      ["9052_session", "SET SESSION AUTHORIZATION vadrouille_owner;\n"],
    ];
    for (const [tag, texte] of cas) {
      const espace = espaceDeTravail();
      ecrireMigration(espace, tag, texte);
      const base = await creerBase("dm_apres");
      const r = migrer({ base, liste: [ligneApprouvee(espace, tag)], espace });
      expect(r.code, tag).toBe(1);
      expect(r.sortie, tag).toMatch(new RegExp(`Échec : migration ${tag} ; code de sortie \\d+ ; SQLSTATE [0-9A-Z]{5}`));
      expect(await journal(base), tag).toEqual([]);
    }
  });

  it("SET search_path non local dans une migration : sans effet sur la migration suivante, ouverte dans une autre session (cas accepté, sans effet : décision du Tech Lead à venir, revue de la PR 332)", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9060_chemin", "SET search_path = vadrouille_migrations;\n");
    ecrireMigration(espace, "9061_suivante", "CREATE TABLE t_suivante (v text);\n");
    const base = await creerBase("dm_chemin");
    const liste = [ligneApprouvee(espace, "9060_chemin"), ligneApprouvee(espace, "9061_suivante")];
    const r = migrer({ base, liste, espace });
    expect(r.code, r.sortie).toBe(0);
    expect(await existe(base, "public.t_suivante")).toBe(true);
    expect(await existe(base, "vadrouille_migrations.t_suivante")).toBe(false);
  });

  it("contrôle de chiffrement gardé : refusé sans connexion (PGSSLMODE=disable, PGPORT), rien n'est créé (0067)", async () => {
    const base = await creerBase("dm_ssl");
    const r = migrer({ base, liste: LISTE_JOURNAL, garderSsl: true });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/Échec : chiffrement : variables PG\* hors liste, ou PGSSLMODE autre que verify-full/);
    expect(r.sortie).not.toMatch(/connexion, rôle ou journal/);
    expect(await journal(base)).toBeNull();
  });

  it("délai : une migration qui attend un verrou tenu par une autre session échoue par lock_timeout (55P03)", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9070_table", "CREATE TABLE public.t_verrou (v text);\n");
    ecrireMigration(espace, "9071_attente", "ALTER TABLE public.t_verrou ADD COLUMN w text;\n");
    const base = await creerBase("dm_delai");
    const liste = [ligneApprouvee(espace, "9070_table"), ligneApprouvee(espace, "9071_attente")];
    expect(migrer({ base, liste: liste.slice(0, 1), espace }).code).toBe(0);
    const tiers = await connectBaseJetable("admin", base);
    await tiers.query("BEGIN");
    await tiers.query("LOCK TABLE public.t_verrou IN ACCESS EXCLUSIVE MODE");
    try {
      const r = migrer({ base, liste, espace });
      expect(r.code).toBe(1);
      expect(r.sortie).toMatch(/Échec : migration 9071_attente ; code de sortie 1 ; SQLSTATE 55P03/);
    } finally {
      await tiers.query("ROLLBACK");
      await tiers.end();
    }
    expect(await journal(base)).toEqual(liste.slice(0, 1));
  }, 60_000);

  it("job arrêté pendant une migration (processus tué) : migration en cours absente, précédentes journalisées", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9080_avant", "CREATE TABLE public.t_avant (v text);\n");
    ecrireMigration(espace, "9081_longue", "CREATE TABLE public.t_longue (v text);\nSELECT pg_catalog.pg_sleep(20);\n");
    const base = await creerBase("dm_arret");
    const liste = [ligneApprouvee(espace, "9080_avant"), ligneApprouvee(espace, "9081_longue")];
    const job = lancer(WF, ETAPE_MIGRATE, { base, liste, espace });
    let enCours = false;
    for (let i = 0; i < 100 && !enCours; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const [r] = await requeteAdmin<{ n: string }>(
        base,
        "SELECT count(*) AS n FROM pg_catalog.pg_stat_activity WHERE datname = pg_catalog.current_database() AND query LIKE '%pg_sleep(20)%' AND pid <> pg_catalog.pg_backend_pid()",
      );
      enCours = r?.n === "1";
    }
    expect(enCours).toBe(true);
    job.arreter();
    await job.fin;
    expect(await journal(base)).toEqual(liste.slice(0, 1));
    expect(await existe(base, "public.t_avant")).toBe(true);
    expect(await existe(base, "public.t_longue")).toBe(false);
  }, 60_000);
});

describe("db-migrate : fichier lu une seule fois (0056 § 2.6.1)", () => {
  it("le texte envoyé est celui qui a été haché, même si le fichier change après la lecture", async () => {
    const espace = espaceDeTravail();
    ecrireMigration(espace, "9090_lue", "CREATE TABLE public.t_lue (v text);\n");
    const base = await creerBase("dm_lecture");
    // Le fichier est remplacé par le script lui-même juste après la boucle de contrôle : aucune relecture du disque.
    const r = migrer({
      base,
      liste: [ligneApprouvee(espace, "9090_lue")],
      espace,
      substitutions: [['echo "Lignes de la liste d\'approbation', `printf 'CREATE TABLE public.t_autre (v text);\\n' > "$GITHUB_WORKSPACE/db/migrations/9090_lue.sql"\necho "Lignes de la liste d'approbation`]],
    });
    expect(r.code, r.sortie).toBe(0);
    expect(await existe(base, "public.t_lue")).toBe(true);
    expect(await existe(base, "public.t_autre")).toBe(false);
    writeFileSync(path.join(espace, "db/migrations/9090_lue.sql"), "");
  });
});
