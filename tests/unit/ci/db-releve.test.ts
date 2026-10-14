// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { commandes, etape, lignesUtiles, remplacerUneFois } from "../../support/workflows";

/**
 * Tests imposés par la décision 0057 pour `.github/workflows/db-releve.yml` (sans base ; la partie avec base est dans
 * `tests/db/db-releve.test.ts`) :
 * - `ci: workflow db-releve conforme à 0057` : contrôle statique, un cas négatif par exigence (mutation du fichier) ;
 * - `ci: motif de sortie de db-releve figé par 0057` : ligne d'affectation, valeur, emploi, cas figés, bloc `case` ;
 * - `ci: sortie de db-releve en échec fermé` : bloc `run:` joué par bash, l'appel de `psql` remplacé par l'écriture
 *   d'un fichier préparé (substitution à exactement une occurrence) ;
 * - `ci: l'environnement db-releve et les secrets RELEVE_PG* ne sont nommés que par db-releve.yml`.
 * Les chaînes de comparaison sont recopiées de la décision, jamais relues du YAML seul.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const FICHIER = "db-releve.yml";
const WORKFLOW = readFileSync(path.join(DOSSIER, FICHIER), "utf8");
const NOM_ETAPE = "Relever le catalogue";

// --- Textes recopiés de la décision 0057 ------------------------------------------------------------------------

/** § 5.1, ligne exacte. */
const LIGNE_MOTIF = `motif='^R[1-8](\\|[][A-Za-z0-9_.,:;=/{}"()*+$'"'"'@<>#\\ -]{0,500}){1,8}$'`;
/** § 5.1, valeur obtenue. */
const VALEUR_MOTIF = `^R[1-8](\\|[][A-Za-z0-9_.,:;=/{}"()*+$'@<>#\\ -]{0,500}){1,8}$`;
/** § 5.3, bloc exact (indentation relative). */
const BLOC_CASE = [
  "seps=${ligne//[^|]/}",
  "case ${ligne:0:2}:${#seps} in",
  '  R1:3|R2:6|R3:8|R4:6|R5:3|R5:7|R6:5|R7:4|R8:2) affichees+=("$ligne") ;;',
  "  *) echec=colonnes ;;",
  "esac",
];
const A500 = "a".repeat(500);
/** § 5.5, cas positifs. */
const POSITIFS = [
  "R1|plpgsql|1.0|pg_catalog",
  "R2|pgcrypto|public.armor(bytea, text[], text[])|f|neondb_owner||f",
  "R3|vadrouille_prototype|f|t|f|f|t|f|f",
  "R4|vadrouille_fn_coords|vadrouille_migrator|neondb_owner|t|f|f",
  "R5|public|place_coordinates|r|vadrouille_owner|{vadrouille_owner=arwdDxtm/vadrouille_owner,vadrouille_fn_coords=arwd/vadrouille_owner}|t|t",
  "R5|public.places|nom|{vadrouille_app=r/vadrouille_owner}",
  'R6|public.store_prototype_coordinates(uuid, text, double precision, double precision)|t|vadrouille_fn_coords|{vadrouille_fn_coords=X/vadrouille_fn_coords}|{"search_path=pg_catalog, pg_temp"}',
  'R6|public."Fonction"(integer[])|f|vadrouille_owner||{"search_path=\\"$user\\", public"}',
  "R7|vadrouille_owner|public|r|{vadrouille_app=r/vadrouille_owner}",
  "R7|vadrouille_owner||f|{=X/vadrouille_owner}",
  "R8|public.store_prototype_coordinates(uuid, text, double precision)|f",
];
const R1_BORNE = `R1|${A500}`;
const R1_PIRE = `R1${`|${A500}`.repeat(8)}`;
const R3_PIRE = `R3${`|${A500}`.repeat(8)}`;
/** § 5.5, cas négatifs. */
const NEGATIFS = [
  'psql: error: connection to server at "…"',
  "R9|x",
  "R1",
  "r1|x",
  " R1|x",
  "::add-mask::x",
  "R1|a\tb",
  "R1|a\u001bb",
  `R1${"|a".repeat(9)}`,
  `R1|${"a".repeat(501)}`,
  "R1|50%",
  "R1|a!",
  "R1|a&b",
  "R1|~",
  "R1|?",
  "R1|^",
  "R1|café",
];
/** § 5.5, nombre de colonnes : retenus (positifs et R3 pire cas) et refusés bien qu'ils suivent le motif. */
const COLONNES_REFUSEES = [
  "R1|plpgsql|1.0|pg_catalog|x",
  "R1|plpgsql|1.0",
  "R2|pgcrypto|public.armor(bytea, text[], text[])|f|neondb_owner|",
  "R5|public|place_coordinates|r|vadrouille_owner|{}",
  "R8|public.f(uuid)",
  R1_BORNE,
  R1_PIRE,
];

/** § 1, § 3 : requêtes et textes approuvés avec le YAML (copie de référence ; la décision en fixe le contenu). */
const ENV_ATTENDU = [
  "LC_ALL",
  "PGHOST",
  "PGDATABASE",
  "PGPASSWORD",
  "PGUSER",
  "PGSSLMODE",
  "PGSSLROOTCERT",
  "SQL_SET",
  "SQL_DO",
  "SQL_BEGIN",
  "SQL_R1",
  "SQL_R2",
  "SQL_R3",
  "SQL_R4",
  "SQL_R5",
  "SQL_R6",
  "SQL_R7",
  "SQL_R8",
];
const COLONNES_CONTROLE = [
  "r.rolname",
  "n.nspname",
  "c.relname",
  "a.attname",
  "p.proname",
  "t.typname",
  "e.extname",
  "e.extversion",
  "p.proconfig::text",
];
const APPEL_PSQL =
  `psql -X -v ON_ERROR_STOP=1 -A -t -F '|' -c "$SQL_SET" -c "$SQL_DO" -c "$SQL_BEGIN" -c "$SQL_DO" -c "$SQL_R1" -c "$SQL_R2" -c "$SQL_R3" ` +
  `-c "$SQL_R4" -c "$SQL_R5" -c "$SQL_R6" -c "$SQL_R7" -c "$SQL_R8" > "$sortie" 2>&1 || code=$?`;

// --- Contrôle statique -----------------------------------------------------------------------------------------

const COMMANDES_ADMISES = new Set([
  "set",
  "refus",
  "printf",
  "exit",
  "if",
  "then",
  "fi",
  "elif",
  "else",
  "for",
  "do",
  "done",
  "case",
  "esac",
  "mapfile",
  "psql",
  "[[",
  "}",
  "]]",
]);

/** Écarts de `db-releve.yml` aux exigences de 0057 (codes stables, un par exigence). */
function ecartsReleve(texte: string): string[] {
  const e = new Set<string>();
  const lignes = lignesUtiles(texte);
  const code = lignes.join("\n");
  const bloc = (cle: string) => {
    const i = lignes.findIndex((l) => l.startsWith(`${cle}:`));
    if (i < 0) return [] as string[];
    const fin = lignes.findIndex((l, j) => j > i && /^\S/.test(l));
    return lignes.slice(i, fin < 0 ? undefined : fin).map((l) => l.trim());
  };
  if (JSON.stringify(lignes.filter((l) => /^\S/.test(l)).map((l) => l.split(":")[0])) !== JSON.stringify(["name", "on", "permissions", "concurrency", "jobs"])) e.add("cles");
  if (JSON.stringify(bloc("on")) !== JSON.stringify(["on:", "workflow_dispatch:"])) e.add("declencheur");
  if (JSON.stringify(bloc("permissions")) !== JSON.stringify(["permissions: {}"]) || /^\s+permissions:/m.test(code)) e.add("permissions");
  if (JSON.stringify(bloc("concurrency")) !== JSON.stringify(["concurrency:", "group: db-releve", "cancel-in-progress: false"])) e.add("concurrence");
  const job = lignes.filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim());
  if (!job.includes("if: github.ref == 'refs/heads/main'")) e.add("branche");
  if (job.filter((l) => l.startsWith("environment:")).join() !== "environment: db-releve") e.add("environnement");
  if (job.filter((l) => l.startsWith("runs-on:")).join() !== "runs-on: ubuntu-24.04" || code.includes("ubuntu-latest")) e.add("runner");
  if (job.filter((l) => l.startsWith("timeout-minutes:")).join() !== "timeout-minutes: 15") e.add("delai-job");
  if (/\buses:/.test(code) || /checkout/.test(code)) e.add("action");
  if (/p0-purge|P0_PURGE_|db-migrate|MIGRATOR_/.test(texte)) e.add("mention-interdite");
  if (lignes.filter((l) => l.trim() === "env:").join("|") !== "        env:") e.add("env-niveau");
  if (lignes.filter((l) => /^ {6}- /.test(l)).length !== 1) e.add("etapes");
  let et;
  try {
    et = etape(texte, NOM_ETAPE);
  } catch {
    e.add("etape");
    return [...e];
  }
  if (et.shell !== "bash") e.add("shell");
  if (JSON.stringify(et.cles) !== JSON.stringify(ENV_ATTENDU)) e.add("env-liste");
  const secrets = [...texte.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  if (
    JSON.stringify(secrets) !== JSON.stringify(["RELEVE_PGHOST", "RELEVE_PGDATABASE", "RELEVE_PGPASSWORD"]) ||
    et.brut.PGHOST !== "${{ secrets.RELEVE_PGHOST }}" ||
    et.brut.PGDATABASE !== "${{ secrets.RELEVE_PGDATABASE }}" ||
    et.brut.PGPASSWORD !== "${{ secrets.RELEVE_PGPASSWORD }}"
  )
    e.add("secrets");
  if (et.brut.PGUSER !== "vadrouille_prototype_purge") e.add("pguser");
  if (et.brut.PGSSLMODE !== "verify-full" || et.brut.PGSSLROOTCERT !== "system") e.add("sslmode");
  if (et.brut.LC_ALL !== "C") e.add("locale");
  const sql = Object.entries(et.env).filter(([k]) => k.startsWith("SQL_"));
  if (sql.some(([, v]) => v.includes("${{"))) e.add("expression-sql");
  const run = et.run;
  const runCode = run
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  if (/\$\{\{/.test(runCode)) e.add("expression-run");
  if (/\bSELECT\s|\bBEGIN TRANSACTION\b|DO \$\$|SET search_path|\bFROM pg_/.test(runCode)) e.add("sql-dans-run");
  for (const mot of commandes(runCode)) if (!COMMANDES_ADMISES.has(mot)) e.add("commande-interdite");
  if (/\b(eval|exec|trap|export|declare|let|source)\b|\(\(|\$\(\(|set -x|printenv|\benv\b/.test(runCode)) e.add("commande-interdite");
  const appels = runCode.split("\n").filter((l) => /^\s*psql\s|\$\(psql\s/.test(l));
  const appelsConnexion = appels.filter((l) => !l.includes("psql --version"));
  if (appels.filter((l) => l.includes("psql --version")).length !== 1 || !/version_psql=\$\(psql --version\)/.test(runCode)) e.add("psql-version");
  if (appelsConnexion.length !== 1 || appelsConnexion[0]!.trim() !== APPEL_PSQL) e.add("psql-appel");
  if (appels.some((l) => /\s-f\b|\s<[^<]|<<|\|\s*psql/.test(l)) || /\|\s*psql\b/.test(runCode)) e.add("psql-entree");
  if (et.brut.SQL_BEGIN !== '"BEGIN TRANSACTION READ ONLY"') e.add("lecture-seule");
  if (et.brut.SQL_SET !== '"SET search_path = pg_catalog, pg_temp"') e.add("chemin");
  const doBloc = et.env.SQL_DO ?? "";
  if (!/^DO \$\$/.test(doBloc) || !doBloc.includes("session_user <> 'vadrouille_prototype_purge'") || !doBloc.includes("rolbypassrls") || !doBloc.includes("pg_catalog.pg_stat_ssl")) e.add("controle-role");
  for (const colonne of COLONNES_CONTROLE) if (!doBloc.includes(`${colonne} ~ '[[:cntrl:]|]'`)) e.add("controle-caracteres");
  const requetes = [et.env.SQL_R1, et.env.SQL_R2, et.env.SQL_R3, et.env.SQL_R4, et.env.SQL_R5, et.env.SQL_R6, et.env.SQL_R7, et.env.SQL_R8];
  for (const [i, requete] of requetes.entries()) {
    const r = requete ?? "";
    if (!r.trimStart().startsWith(`SELECT 'R${i + 1}'`)) e.add("requetes");
    const tables = [...r.matchAll(/\b(?:FROM|JOIN)\s+([a-z_.]+)/g)].map((m) => m[1]!);
    if (tables.some((t) => !t.startsWith("pg_catalog."))) e.add("hors-catalogue");
  }
  if (!/pg_catalog\.has_function_privilege\('vadrouille_prototype', p\.oid, 'EXECUTE'\)/.test(et.env.SQL_R2 ?? "")) e.add("r2-privilege");
  if (!/d\.classid = 'pg_proc'::regclass/.test(et.env.SQL_R2 ?? "")) e.add("r2-classid");
  if (/store_prototype_coordinates\(/.test(et.env.SQL_R8 ?? "") || !/p\.proname = 'store_prototype_coordinates'/.test(et.env.SQL_R8 ?? "")) e.add("r8-oid");
  if (!runCode.includes("if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then")) e.add("forme-hote");
  if (!runCode.includes("if [[ $PGHOST == *-pooler* ]]; then")) e.add("pooler");
  if (!runCode.includes("if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then")) e.add("forme-base");
  const valeurs = runCode
    .split("\n")
    .filter((l) => /\$\{?PG(HOST|DATABASE)/.test(l))
    .map((l) => l.trim());
  const controles = [
    'if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then refus "PGHOST hors forme"; fi',
    `if [[ $PGHOST == *-pooler* ]]; then refus "PGHOST désigne l'hôte poolé (hôte direct exigé)"; fi`,
    'if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then refus "PGDATABASE hors forme"; fi',
  ];
  if (valeurs.some((l) => !controles.includes(l))) e.add("valeur-affichee");
  const iControle = runCode.indexOf("PGDATABASE hors forme");
  const iPsql = runCode.indexOf(APPEL_PSQL.slice(0, 30));
  if (iControle < 0 || iPsql < 0 || iControle > iPsql) e.add("ordre");
  return [...e];
}

const MUTATIONS: [string, string, string, string][] = [
  ["déclencheur ajouté", "  workflow_dispatch:\n", "  workflow_dispatch:\n  push:\n", "declencheur"],
  ["inputs ajoutés", "  workflow_dispatch:\n", "  workflow_dispatch:\n    inputs:\n      x:\n        type: string\n", "declencheur"],
  ["condition main absente", "    if: github.ref == 'refs/heads/main'\n", "", "branche"],
  ["autre environnement", "environment: db-releve", "environment: releve", "environnement"],
  ["secret au niveau du job", "    timeout-minutes: 15\n", "    timeout-minutes: 15\n    env:\n      X: ${{ secrets.RELEVE_PGHOST }}\n", "env-niveau"],
  ["variable PG* hors liste", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          PGPORT: \"5432\"\n", "env-liste"],
  ["autre variable d'env", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          AUTRE_VARIABLE: x\n", "env-liste"],
  ["PGUSER autre", "PGUSER: vadrouille_prototype_purge", "PGUSER: vadrouille_app", "pguser"],
  ["PGUSER par secret", "PGUSER: vadrouille_prototype_purge", "PGUSER: ${{ secrets.RELEVE_PGUSER }}", "secrets"],
  ["secret différent", "secrets.RELEVE_PGHOST", "secrets.RELEVE_HOTE", "secrets"],
  ["secrets échangés", "PGHOST: ${{ secrets.RELEVE_PGHOST }}", "PGHOST: ${{ secrets.RELEVE_PGDATABASE }}", "secrets"],
  ["shell absent", "        shell: bash\n", "", "shell"],
  ["shell sh", "        shell: bash\n", "        shell: sh\n", "shell"],
  ["PGSSLMODE require", "PGSSLMODE: verify-full", "PGSSLMODE: require", "sslmode"],
  ["checkout", "    steps:\n", "    steps:\n      - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0\n", "action"],
  ["mention de p0-purge", "# Fichier sous", "# p0-purge\n# Fichier sous", "mention-interdite"],
  ["mention de MIGRATOR_", "# Fichier sous", "# MIGRATOR_PGHOST\n# Fichier sous", "mention-interdite"],
  ["permissions élargies", "permissions: {}", "permissions:\n  contents: read", "permissions"],
  ["runs-on ubuntu-latest", "runs-on: ubuntu-24.04", "runs-on: ubuntu-latest", "runner"],
  ["timeout-minutes autre", "timeout-minutes: 15", "timeout-minutes: 10", "delai-job"],
  ["concurrence annulable", "cancel-in-progress: false", "cancel-in-progress: true", "concurrence"],
  ["commande externe", '          sortie="$RUNNER_TEMP/db-releve.txt"\n', '          sortie="$RUNNER_TEMP/db-releve.txt"\n          cat "$sortie"\n', "commande-interdite"],
  ["eval", '          sortie="$RUNNER_TEMP/db-releve.txt"\n', '          sortie="$RUNNER_TEMP/db-releve.txt"\n          eval "x=1"\n', "commande-interdite"],
  ["arithmétique", '          sortie="$RUNNER_TEMP/db-releve.txt"\n', '          sortie="$RUNNER_TEMP/db-releve.txt"\n          n=$((1 + 1))\n', "commande-interdite"],
  ["set -x", "          set -u\n", "          set -u\n          set -x\n", "commande-interdite"],
  ["psql sans -X", "psql -X -v ON_ERROR_STOP=1 -A", "psql -v ON_ERROR_STOP=1 -A", "psql-appel"],
  ["psql sans ON_ERROR_STOP", "psql -X -v ON_ERROR_STOP=1 -A", "psql -X -A", "psql-appel"],
  ["second psql --version", "          sortie=", "          psql --version\n          sortie=", "psql-version"],
  ["SQL dans run", '-c "$SQL_R8"', `-c "SELECT 'R8', 1"`, "sql-dans-run"],
  ["-c non issu de l'env", '-c "$SQL_R8"', '-c "$requete"', "psql-appel"],
  ["ordre des -c", '-c "$SQL_R1" -c "$SQL_R2"', '-c "$SQL_R2" -c "$SQL_R1"', "psql-appel"],
  ["second DO absent", '-c "$SQL_BEGIN" -c "$SQL_DO"', '-c "$SQL_BEGIN"', "psql-appel"],
  ["expression dans SQL", "SQL_BEGIN: \"BEGIN TRANSACTION READ ONLY\"", "SQL_BEGIN: \"BEGIN TRANSACTION READ ONLY -- ${{ github.actor }}\"", "expression-sql"],
  ["psql -f", '-c "$SQL_R8" > "$sortie"', '-f releve.sql > "$sortie"', "psql-appel"],
  ["entrée redirigée vers psql", '-c "$SQL_R8" > "$sortie" 2>&1', '-c "$SQL_R8" < /dev/null > "$sortie" 2>&1', "psql-entree"],
  ["bloc DO sans contrôle de rôle", "IF session_user <> 'vadrouille_prototype_purge'", "IF session_user <> 'vadrouille_app'", "controle-role"],
  ["contrôle des caractères sans |", "r.rolname ~ '[[:cntrl:]|]'", "r.rolname ~ '[[:cntrl:]]'", "controle-caracteres"],
  ["contrôle des caractères sans proconfig", "OR EXISTS (SELECT 1 FROM pg_catalog.pg_proc p WHERE p.proconfig::text ~ '[[:cntrl:]|]')\n", "", "controle-caracteres"],
  ["appel psql sans || code=$?", '> "$sortie" 2>&1 || code=$?', '> "$sortie" 2>&1', "psql-appel"],
  ["R2 sans has_function_privilege", ",\n              pg_catalog.has_function_privilege('vadrouille_prototype', p.oid, 'EXECUTE')\n", "\n", "r2-privilege"],
  ["READ ONLY absent", '"BEGIN TRANSACTION READ ONLY"', '"BEGIN"', "lecture-seule"],
  ["requête hors de pg_catalog", "FROM pg_catalog.pg_roles r\n            ORDER BY r.rolname", "FROM public.users r\n            ORDER BY r.rolname", "hors-catalogue"],
  ["requête différente", "SELECT 'R3', r.rolname", "SELECT 'R9', r.rolname", "requetes"],
  ["signature écrite", "WHERE n.nspname = 'public' AND p.proname = 'store_prototype_coordinates'", "WHERE p.oid = 'public.store_prototype_coordinates(uuid)'::regprocedure", "r8-oid"],
  ["R2 sans classid", "d.classid = 'pg_proc'::regclass AND ", "", "r2-classid"],
  ["contrôle -pooler absent", `          if [[ $PGHOST == *-pooler* ]]; then refus "PGHOST désigne l'hôte poolé (hôte direct exigé)"; fi\n`, "", "pooler"],
  ["contrôle de forme de PGHOST absent", '          if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then refus "PGHOST hors forme"; fi\n', "", "forme-hote"],
  ["contrôle de forme de PGDATABASE absent", '          if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then refus "PGDATABASE hors forme"; fi\n', "", "forme-base"],
  ["valeur de PGHOST affichée", 'refus "PGHOST hors forme"', 'refus "PGHOST hors forme : $PGHOST"', "valeur-affichee"],
  ["valeur de PGDATABASE affichée", 'refus "PGDATABASE hors forme"', 'refus "PGDATABASE hors forme : ${PGDATABASE:0:3}"', "valeur-affichee"],
  ["affichage de l'environnement", "          set -u\n", "          set -u\n          printenv\n", "commande-interdite"],
];

describe("ci: workflow db-releve conforme à 0057", () => {
  it("le fichier du dépôt n'a aucun écart", () => {
    expect(ecartsReleve(WORKFLOW)).toEqual([]);
  });

  it.each(MUTATIONS)("cas négatif : %s", (_cas, avant, apres, attendu) => {
    expect(ecartsReleve(remplacerUneFois(WORKFLOW, avant, apres))).toContain(attendu);
  });
});

/** Environnement des scripts bash des tests : `PATH`, `LC_ALL=C` et les variables du cas, rien d'autre. */
function envBash(extra: Readonly<Record<string, string>> = {}): NodeJS.ProcessEnv {
  const env: Record<string, string> = { PATH: process.env.PATH ?? "/usr/bin:/bin", LC_ALL: "C", ...extra };
  return env as NodeJS.ProcessEnv;
}

// --- Motif ------------------------------------------------------------------------------------------------------

const RUN = etape(WORKFLOW, NOM_ETAPE).run;

/** Résultat de `[[ $l =~ $motif ]]` en bash sous `LC_ALL=C`, pour chaque ligne, avec la valeur de `motif` donnée. */
function bashAccepte(motif: string, lignesAEvaluer: readonly string[]): boolean[] {
  const script = 'motif=$1; shift; for l in "$@"; do if [[ $l =~ $motif ]]; then printf o; else printf n; fi; done';
  const r = spawnSync("bash", ["--noprofile", "--norc", "-c", script, "bash", motif, ...lignesAEvaluer], { env: envBash(), encoding: "utf8" });
  expect(r.status, r.stderr).toBe(0);
  return [...r.stdout].map((c) => c === "o");
}

describe("ci: motif de sortie de db-releve figé par 0057", () => {
  it("(1) une seule ligne motif=, égale caractère pour caractère à celle du § 5.1", () => {
    const lignes = RUN.split("\n").filter((l) => l.trim().startsWith("motif="));
    expect(lignes.map((l) => l.trim())).toEqual([LIGNE_MOTIF]);
  });

  it("(2) la ligne exécutée par bash rend exactement la valeur du § 5.1", () => {
    const r = spawnSync("bash", ["--noprofile", "--norc", "-c", `${LIGNE_MOTIF}\nprintf '%s' "$motif"`], { env: envBash(), encoding: "utf8" });
    expect(r.stdout).toBe(VALEUR_MOTIF);
  });

  it("(3) motif employé seulement sous la forme [[ $ligne =~ $motif ]]", () => {
    const usages = RUN.split("\n").filter((l) => l.includes("$motif") || l.includes("${motif"));
    expect(usages.map((l) => l.trim())).toEqual(["if [[ $ligne =~ $motif ]]; then"]);
  });

  it("(4, 5) cas positifs acceptés et cas négatifs refusés, avec la valeur figée", () => {
    const positifs = [...POSITIFS, R1_BORNE, R1_PIRE, R3_PIRE];
    expect(bashAccepte(VALEUR_MOTIF, positifs)).toEqual(positifs.map(() => true));
    expect(bashAccepte(VALEUR_MOTIF, NEGATIFS)).toEqual(NEGATIFS.map(() => false));
    expect(Buffer.from("R1|café").includes(Buffer.from([0xc3, 0xa9]))).toBe(true);
  });

  it("(6) bloc case égal à celui du § 5.3 ; cas figés du nombre de colonnes", () => {
    const lignes = RUN.split("\n");
    const debut = lignes.findIndex((l) => l.trim() === BLOC_CASE[0]);
    expect(debut).toBeGreaterThan(-1);
    const marge = lignes[debut]!.search(/\S/);
    expect(lignes.slice(debut, debut + BLOC_CASE.length).map((l) => l.slice(marge))).toEqual(BLOC_CASE);
    const script = `ligne=$1\n${BLOC_CASE.join("\n").replace('affichees+=("$ligne")', "printf retenue").replace("echec=colonnes", "printf refusee")}`;
    const verdict = (ligne: string) => spawnSync("bash", ["--noprofile", "--norc", "-c", script, "bash", ligne], { env: envBash(), encoding: "utf8" }).stdout;
    for (const ligne of [...POSITIFS, R3_PIRE]) expect(verdict(ligne), ligne.slice(0, 40)).toBe("retenue");
    for (const ligne of COLONNES_REFUSEES) expect(verdict(ligne), ligne.slice(0, 40)).toBe("refusee");
    expect(bashAccepte(VALEUR_MOTIF, COLONNES_REFUSEES)).toEqual(COLONNES_REFUSEES.map(() => true));
  });
});

// --- Échec fermé ------------------------------------------------------------------------------------------------

const temporaires: string[] = [];
afterAll(() => {
  for (const d of temporaires.splice(0)) rmSync(d, { recursive: true, force: true });
});

const SUBSTITUT = `( cat "$FICHIER_PREPARE"; exit "$CODE_PREPARE" ) > "$sortie" 2>&1 || code=$?`;
const SENTINELLE = "sentinelle0valeur0secrete";

/** Bloc `run:` joué par `bash --noprofile --norc -eo pipefail`, psql remplacé par un fichier préparé. */
function jouer(contenu: string, options: { code?: number; env?: Record<string, string> } = {}) {
  const dossier = mkdtempSync(path.join(tmpdir(), "db-releve-"));
  temporaires.push(dossier);
  const prepare = path.join(dossier, "prepare.txt");
  writeFileSync(prepare, contenu);
  const script = path.join(dossier, "etape.sh");
  writeFileSync(script, remplacerUneFois(RUN, APPEL_PSQL, SUBSTITUT));
  const debut = Date.now();
  const r = spawnSync("bash", ["--noprofile", "--norc", "-eo", "pipefail", script], {
    env: envBash({
      PGHOST: "db.exemple.invalid",
      PGDATABASE: "base",
      RUNNER_TEMP: dossier,
      FICHIER_PREPARE: prepare,
      CODE_PREPARE: String(options.code ?? 0),
      ...options.env,
    }),
    encoding: "utf8",
    timeout: 900_000,
    maxBuffer: 64 * 1024 * 1024,
  });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, duree: Date.now() - debut };
}

const ENTETE = "SET\nDO\nBEGIN\nDO\n";
const CONFORMES = `${POSITIFS.join("\n")}\n`;
const COMPTEURS = /Lignes lues : (\d+) ; affichées : (\d+) ; masquées : (\d+) ; code de sortie de psql : (\d+)/;

describe("ci: sortie de db-releve en échec fermé", () => {
  it("sortie conforme : succès, lignes R affichées, lues = affichées + 4", () => {
    const r = jouer(`${ENTETE}${CONFORMES}`);
    expect(r.code, r.sortie).toBe(0);
    for (const l of POSITIFS) expect(r.sortie).toContain(`${l}\n`);
    const [, lues, affichees, masquees, code] = COMPTEURS.exec(r.sortie)!;
    expect([Number(lues), Number(affichees), Number(masquees), Number(code)]).toEqual([POSITIFS.length + 4, POSITIFS.length, 4, 0]);
    expect(r.sortie).not.toMatch(/^(SET|DO|BEGIN)$/m);
  });

  function echecSansLigne(contenu: string, cause: string, code = 0) {
    const r = jouer(contenu, { code });
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).toContain(`Échec : ${cause}`);
    expect(r.sortie).not.toMatch(/^R[1-9]/m);
    expect(r.sortie).not.toContain("psql: error");
    expect(r.sortie).toMatch(COMPTEURS);
    return r;
  }

  it("une ligne R hors motif fait échouer le job sans l'afficher", () => {
    echecSansLigne(`${ENTETE}${CONFORMES}R1|50%\n`, "lignes masquées");
  });

  it("une ligne R3 coupée en deux par un saut de ligne : échec, rien d'affiché", () => {
    echecSansLigne(`${ENTETE}${CONFORMES}R3|x|f|f|f|f|f|f|f\ny|f|t|f|f|t|f|f\n`, "lignes masquées");
  });

  it.each([
    ["une en moins", "SET\nDO\nBEGIN\n"],
    ["une en plus", "SET\nDO\nBEGIN\nDO\nDO\n"],
    ["ordre changé", "SET\nBEGIN\nDO\nDO\n"],
    ["NOTICE ajouté", "SET\nDO\nBEGIN\nNOTICE:  bonjour\nDO\n"],
  ])("lignes masquées autres que SET, DO, BEGIN, DO (%s) : échec sans rien afficher", (_cas, entete) => {
    echecSansLigne(`${entete}${CONFORMES}`, "lignes masquées");
  });

  it("ligne qui suit le motif avec un autre nombre de colonnes que son étiquette : échec sans rien afficher", () => {
    echecSansLigne(`${ENTETE}${CONFORMES}R1|plpgsql|1.0|pg_catalog|x\n`, "colonnes");
  });

  it("une ligne psql: error n'est pas affichée", () => {
    echecSansLigne(`psql: error: connection to server at "${SENTINELLE}" failed\n`, "psql", 2);
  });

  it("le case n'est qu'un filet : une ligne R5 de sept colonnes forgée par un nom à quatre | est affichée", () => {
    const r = jouer(`${ENTETE}R5|public.t|a|r|o|{x}|t|{lecteur=r/postgres}\n`);
    expect(r.code).toBe(0);
    expect(r.sortie).toContain("R5|public.t|a|r|o|{x}|t|{lecteur=r/postgres}");
  });

  it("601 lignes : échec sans rien afficher", () => {
    echecSansLigne(`${ENTETE}${"R8|public.f(uuid)|f\n".repeat(597)}`, "plafond");
  });

  it("code de sortie de psql non nul, sous -eo pipefail : contrôles faits, compteurs, code et cause psql, aucune ligne R", () => {
    const r = echecSansLigne(`${ENTETE}${CONFORMES}`, "psql", 3);
    expect(COMPTEURS.exec(r.sortie)?.[4]).toBe("3");
  });

  it.each([
    ["PGHOST poolé", { PGHOST: `ep-${SENTINELLE}-pooler.exemple.invalid` }, "PGHOST désigne l'hôte poolé"],
    ["PGHOST hors forme", { PGHOST: `${SENTINELLE}.Exemple` }, "PGHOST hors forme"],
    ["PGDATABASE hors forme", { PGDATABASE: `${SENTINELLE}-base` }, "PGDATABASE hors forme"],
  ])("%s : échec sans connexion, message fixe, valeur absente de la sortie", (_cas, env, message) => {
    const r = jouer(`${ENTETE}${CONFORMES}`, { env });
    expect(r.code).toBe(1);
    expect(r.sortie).toContain(message);
    expect(r.sortie).not.toContain(SENTINELLE);
    expect(r.sortie).not.toMatch(COMPTEURS);
  });

  it(
    "600 lignes du pire cas (SET, DO, BEGIN, DO et 596 lignes R3 de huit colonnes de 500 a) : le job finit dans la moitié du timeout-minutes",
    () => {
      const r = jouer(`${ENTETE}${`${R3_PIRE}\n`.repeat(596)}`);
      expect(r.code, r.sortie.slice(-300)).toBe(0);
      expect(COMPTEURS.exec(r.sortie)?.slice(1, 4)).toEqual(["600", "596", "4"]);
      // Mesure jointe à la PR (§ 5.2) : 171 s relevées sur ubuntu-24.04 (CI `verify` du head d647077, suite complète en
      // parallèle), soit 2,6 fois sous la borne. Borne : moitié de timeout-minutes: 15, exigée par 0057 § 5.2.
      console.info(`db-releve : 600 lignes du pire cas filtrées en ${Math.round(r.duree / 1000)} s`);
      expect(r.duree).toBeLessThan(450_000);
    },
    900_000,
  );
});

describe("ci: l'environnement db-releve et les secrets RELEVE_PG* ne sont nommés que par db-releve.yml", () => {
  it("aucun autre workflow ne les nomme", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f) && f !== FICHIER)) {
      expect(readFileSync(path.join(DOSSIER, fichier), "utf8"), fichier).not.toMatch(/db-releve|RELEVE_PG/);
    }
  });
});
