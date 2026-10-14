// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { commandes, etape, lignesUtiles, remplacerUneFois } from "../../support/workflows";

/**
 * Tests imposés par la décision 0056 pour `.github/workflows/db-migrate.yml` (sans base ; l'exécuteur est joué sur la
 * base de service de la CI par `tests/db/db-migrate.test.ts`) :
 * - `ci: workflow des migrations conforme à 0056` : contrôle statique, un cas négatif par exigence (mutation) ;
 * - `ci: l'environnement db-migrate et les secrets MIGRATOR_PG* ne sont nommés que par db-migrate.yml et
 *   db-reverrouillage.yml` ;
 * - `ci: liste approuvée = préfixe du journal`, `ci: liste approuvée en ajout seulement` (contre le commit de base de
 *   la PR et la tête d'`origin/main` ; premier parent sur un `push` vers `main`), `ci: migrations en UTF-8 valide,
 *   sans BOM`.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const FICHIER = "db-migrate.yml";
const CHEMIN = `.github/workflows/${FICHIER}`;
const WORKFLOW = readFileSync(path.join(DOSSIER, FICHIER), "utf8");
const NOM_ETAPE = "Appliquer les migrations approuvées";
const MIGRATIONS = path.join(RACINE, "db/migrations");

/** `actions/checkout` épinglé, celui de `ci.yml`. */
const CHECKOUT = /uses: (actions\/checkout@[0-9a-f]{40} # v[\d.]+)/.exec(readFileSync(path.join(DOSSIER, "ci.yml"), "utf8"))![1]!;

const ENV_PG = ["PGHOST", "PGDATABASE", "PGPASSWORD", "PGUSER", "PGSSLMODE", "PGSSLROOTCERT"];
const COMMANDES_ADMISES = new Set([
  "set",
  "echec",
  "printf",
  "echo",
  "exit",
  "if",
  "then",
  "fi",
  "for",
  "do",
  "done",
  "while",
  "read",
  "IFS=",
  ":",
  "[[",
  "}",
  "sha256sum",
  "stat",
  "realpath",
  "psql",
]);
const APPLICATION =
  'psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$SQL_DELAIS" -c "BEGIN" -c "$SQL_VERROU" -c "$SQL_REPERE" -c "$non_appliquee" ' +
  '-c "${textes[$i]}" -c "$SQL_APRES_CHEMIN" -c "$SQL_APRES" -c "$inserer" -c "COMMIT" > "$sortie" 2>&1 || code=$?';
const CONTROLES_VALEUR = [
  'if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then echec "PGHOST hors forme"; fi',
  `if [[ $PGHOST == *-pooler* ]]; then echec "PGHOST désigne l'hôte poolé (hôte direct exigé)"; fi`,
  'if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then echec "PGDATABASE hors forme"; fi',
];
const LECTURE = `if IFS= read -r -d '' texte < "$f"; then echec "migration $tag : octet NUL"; fi`;

/** Écarts de `db-migrate.yml` aux exigences de 0056 (codes stables, un par exigence). */
function ecartsMigrate(texte: string): string[] {
  const e = new Set<string>();
  const lignes = lignesUtiles(texte);
  const code = lignes.join("\n");
  const bloc = (cle: string) => {
    const i = lignes.findIndex((l) => l.startsWith(`${cle}:`));
    if (i < 0) return [] as string[];
    const fin = lignes.findIndex((l, j) => j > i && /^\S/.test(l));
    return lignes.slice(i, fin < 0 ? undefined : fin).map((l) => l.trim());
  };
  const on = bloc("on");
  if (on[1] !== "workflow_dispatch:" || on.some((l) => /^(push|pull_request|schedule|workflow_run|repository_dispatch|pull_request_target|workflow_call):/.test(l))) e.add("declencheur");
  const entrees = on.slice(on.indexOf("inputs:") + 1);
  if (
    !on.includes("inputs:") ||
    JSON.stringify(entrees.filter((l) => !l.startsWith("description:"))) !== JSON.stringify(["sha_attendu:", "required: true", "type: string"])
  )
    e.add("inputs");
  if (JSON.stringify(bloc("permissions")) !== JSON.stringify(["permissions: {}"])) e.add("permissions");
  const permsJob = lignes.filter((l) => /^\s+permissions:/.test(l));
  if (permsJob.join("|") !== "    permissions:" || !code.includes("    permissions:\n      contents: read\n    steps:")) e.add("permissions");
  if (JSON.stringify(bloc("concurrency")) !== JSON.stringify(["concurrency:", "group: db-migrate", "cancel-in-progress: false"])) e.add("concurrence");
  const job = lignes.filter((l) => /^ {4}\S/.test(l)).map((l) => l.trim());
  if (!job.includes("if: github.ref == 'refs/heads/main'")) e.add("branche");
  if (job.filter((l) => l.startsWith("environment:")).join() !== "environment: db-migrate") e.add("environnement");
  if (job.filter((l) => l.startsWith("runs-on:")).join() !== "runs-on: ubuntu-24.04" || code.includes("ubuntu-latest")) e.add("runner");
  if (job.filter((l) => l.startsWith("timeout-minutes:")).join() !== "timeout-minutes: 30") e.add("delai-job");
  const uses = lignes.filter((l) => /\buses:/.test(l)).map((l) => l.trim());
  if (uses.length !== 1) e.add("action");
  if (uses[0] !== `- uses: ${CHECKOUT}`) e.add("checkout");
  const avecCheckout = code.slice(code.indexOf("- uses:"), code.indexOf("- name:"));
  for (const attendu of ["ref: ${{ github.sha }}", "persist-credentials: false", "fetch-depth: 1"]) if (!avecCheckout.includes(attendu)) e.add("checkout");
  if (/submodules: (true|recursive)|lfs: true/.test(avecCheckout)) e.add("checkout");
  if (lignes.filter((l) => l.trim() === "env:").join("|") !== "        env:") e.add("env-niveau");
  const secrets = [...texte.matchAll(/\$\{\{\s*secrets\.([A-Za-z0-9_]+)\s*\}\}/g)].map((m) => m[1]);
  let et;
  try {
    et = etape(texte, NOM_ETAPE);
  } catch {
    e.add("etape");
    return [...e];
  }
  if (
    JSON.stringify(secrets) !== JSON.stringify(["MIGRATOR_PGHOST", "MIGRATOR_PGDATABASE", "MIGRATOR_PGPASSWORD"]) ||
    et.brut.PGHOST !== "${{ secrets.MIGRATOR_PGHOST }}" ||
    et.brut.PGDATABASE !== "${{ secrets.MIGRATOR_PGDATABASE }}" ||
    et.brut.PGPASSWORD !== "${{ secrets.MIGRATOR_PGPASSWORD }}"
  )
    e.add("secrets");
  const pg = et.cles.filter((k) => k.startsWith("PG"));
  if (JSON.stringify([...pg].sort()) !== JSON.stringify([...ENV_PG].sort())) e.add("variables-pg");
  if (et.cles.some((k) => !k.startsWith("PG") && !k.startsWith("SQL_") && k !== "SHA_ATTENDU" && k !== "LC_ALL")) e.add("variables-pg");
  if (et.brut.PGUSER !== "vadrouille_migrator") e.add("pguser");
  if (et.brut.PGSSLMODE !== "verify-full" || et.brut.PGSSLROOTCERT !== "system") e.add("sslmode");
  if (et.brut.SHA_ATTENDU !== "${{ inputs.sha_attendu }}" || et.brut.LC_ALL !== "C") e.add("entree");
  if (Object.entries(et.env).some(([k, v]) => k.startsWith("SQL_") && v.includes("${{"))) e.add("expression-sql");
  if (et.shell !== "bash") e.add("shell");
  const run = et.run
    .split("\n")
    .filter((l) => !l.trim().startsWith("#"))
    .join("\n");
  if (/\$\{\{/.test(run)) e.add("expression-run");
  for (const mot of commandes(run)) if (!COMMANDES_ADMISES.has(mot)) e.add("commande-interdite");
  if (/\b(eval|exec|trap|export|declare|let|source|pnpm|npm|npx|node|corepack|tsx|make|cat|bash)\b|\(\(|\$\(\(|\$\(<|set -x|printenv|\benv\b/.test(run)) e.add("commande-interdite");
  if (/(^|[;&|]|then|do)\s*\.\s/m.test(run)) e.add("commande-interdite");
  if (/_journal\.json|meta\//.test(texte)) e.add("journal-lu");
  const appels = run.split("\n").filter((l) => /^\s*psql\s|\$\(psql\s/.test(l));
  if (appels.some((l) => !/^\s*psql -X -v ON_ERROR_STOP=1 /.test(l) && !/\$\(psql -X --version\)/.test(l))) e.add("psql-options");
  if (appels.some((l) => /\s-f\b|\s<[^<]|<<|\|\s*psql/.test(l)) || /\|\s*psql\b/.test(run)) e.add("psql-entree");
  const appApplication = appels.filter((l) => l.includes("$SQL_DELAIS"));
  if (appApplication.length !== 1 || appApplication[0]!.trim() !== APPLICATION) e.add("application");
  const iLecture = run.indexOf(LECTURE);
  if (iLecture < 0 || run.split(LECTURE).length !== 2) e.add("controle-nul");
  if (run.split("\n").filter((l) => /<\s*"\$f"|\$\(<|\bcat\b/.test(l)).length !== 1) e.add("relecture");
  if (!/^\s*textes\+=\("\$texte"\)$/m.test(run) || (run.match(/\btextes\b/g) ?? []).length !== 3) e.add("relecture");
  if (!run.includes(`lue=$(printf '%s' "$texte" | sha256sum)`)) e.add("empreinte");
  for (const k of ["SQL_ROLE", "SQL_NON_APPLIQUEE", "SQL_APRES"]) if (!/^DO \$\$\nBEGIN\n/.test(et.env[k] ?? "")) e.add("controle-do");
  if (!(et.env.SQL_ROLE ?? "").includes("pg_catalog.pg_stat_ssl") || !(et.env.SQL_ROLE ?? "").includes("rolbypassrls")) e.add("controle-do");
  if (!(et.env.SQL_APRES ?? "").includes("pg_catalog.current_setting('vadrouille_migrate.txid', true) IS DISTINCT FROM pg_catalog.txid_current()::text")) e.add("controle-do");
  if (!(et.env.SQL_APRES ?? "").includes("current_setting('session_replication_role') <> 'origin'")) e.add("controle-do");
  if (et.brut.SQL_DELAIS !== `"SET lock_timeout = '10s'; SET statement_timeout = '5min'"`) e.add("delais");
  const avantTexte = APPLICATION.slice(0, APPLICATION.indexOf('"${textes[$i]}"'));
  for (const v of [...avantTexte.matchAll(/"\$([A-Z_]+)"/g)].map((m) => m[1]!)) if (/search_path/i.test(et.env[v] ?? "")) e.add("chemin-avant");
  if (/search_path/i.test(et.env.SQL_NON_APPLIQUEE ?? "")) e.add("chemin-avant");
  if (et.brut.SQL_APRES_CHEMIN !== '"SET LOCAL search_path = pg_catalog, pg_temp"') e.add("chemin-avant");
  if (!run.includes("if [[ ${texte,,} == *vadrouille_migrate.* ]]; then")) e.add("repere-casse");
  if (!run.includes("if [[ $PGHOST == *-pooler* ]]; then")) e.add("pooler");
  if (!run.includes("if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then")) e.add("forme-hote");
  if (!run.includes("if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then")) e.add("forme-base");
  if (
    run
      .split("\n")
      .filter((l) => /\$\{?PG(HOST|DATABASE)/.test(l))
      .some((l) => !CONTROLES_VALEUR.includes(l.trim()))
  )
    e.add("valeur-affichee");
  if (!run.includes('if [[ ! $SHA_ATTENDU =~ ^[0-9a-f]{40}$ ]]; then') || !run.includes('if [[ "$SHA_ATTENDU" == "$GITHUB_SHA" ]]; then')) e.add("sha");
  if ((run.match(/^\s*MIGRATIONS_APPROUVEES=\($/gm) ?? []).length !== 1) e.add("liste");
  const iControles = run.indexOf("PGDATABASE hors forme");
  const iConnexion = run.indexOf("psql -X -v ON_ERROR_STOP=1");
  if (iControles < 0 || iConnexion < 0 || iControles > iConnexion || iLecture > iConnexion) e.add("ordre");
  return [...e];
}

const MUTATIONS: [string, string, string, string][] = [
  ["déclencheur ajouté", "on:\n  workflow_dispatch:\n", "on:\n  push:\n  workflow_dispatch:\n", "declencheur"],
  ["autre inputs", "        type: string\n", "        type: string\n      lot:\n        type: string\n", "inputs"],
  ["entrée facultative", "required: true", "required: false", "inputs"],
  ["${{ inputs }} dans run", '          echo "Terminé."\n', '          echo "Terminé."\n          echo "${{ inputs.sha_attendu }}"\n', "expression-run"],
  ["${{ github.event }} dans run", '          echo "Terminé."\n', '          echo "Terminé."\n          echo "${{ github.event.sender.login }}"\n', "expression-run"],
  ["condition main absente", "    if: github.ref == 'refs/heads/main'\n", "", "branche"],
  ["environnement absent", "    environment: db-migrate\n", "", "environnement"],
  ["secret au niveau du job", "    timeout-minutes: 30\n", "    timeout-minutes: 30\n    env:\n      PGHOST: ${{ secrets.MIGRATOR_PGHOST }}\n", "env-niveau"],
  ["secret au niveau du workflow", "permissions: {}\n", "permissions: {}\nenv:\n  PGHOST: ${{ secrets.MIGRATOR_PGHOST }}\n", "env-niveau"],
  ["variable PG* hors liste", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          PGPORT: \"5432\"\n", "variables-pg"],
  ["autre variable", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          AUTRE_VARIABLE: x\n", "variables-pg"],
  ["PGUSER autre", "PGUSER: vadrouille_migrator", "PGUSER: vadrouille_owner", "pguser"],
  ["PGSSLMODE autre", "PGSSLMODE: verify-full", "PGSSLMODE: require", "sslmode"],
  ["checkout non épinglé", CHECKOUT, "actions/checkout@v4", "checkout"],
  ["checkout d'une autre référence", "ref: ${{ github.sha }}", "ref: ${{ github.head_ref }}", "checkout"],
  ["checkout avec persist-credentials", "persist-credentials: false", "persist-credentials: true", "checkout"],
  ["checkout avec sous-modules", "submodules: false", "submodules: true", "checkout"],
  ["autre action", "      - name: Appliquer", "      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0\n      - name: Appliquer", "action"],
  ["pnpm", '          echo "Terminé."\n', '          echo "Terminé."\n          pnpm db:migrate\n', "commande-interdite"],
  ["node", '          echo "Terminé."\n', '          echo "Terminé."\n          node db/migrate.ts\n', "commande-interdite"],
  ["source", '          echo "Terminé."\n', '          echo "Terminé."\n          . ./script.sh\n', "commande-interdite"],
  ["bash fichier", '          echo "Terminé."\n', '          echo "Terminé."\n          bash script.sh\n', "commande-interdite"],
  ["eval", '          echo "Terminé."\n', '          echo "Terminé."\n          eval "$x"\n', "commande-interdite"],
  ["export", "          set -u\n", "          set -u\n          export PGPORT=5432\n", "commande-interdite"],
  ["arithmétique", '          echo "Terminé."\n', '          echo "Terminé."\n          n=$((1 + 1))\n', "commande-interdite"],
  ["psql -f", '-c "COMMIT" > "$sortie"', '-f "$f" > "$sortie"', "psql-entree"],
  ["entrée redirigée vers psql", '-c "COMMIT" > "$sortie" 2>&1', '-c "COMMIT" < "$f" > "$sortie" 2>&1', "psql-entree"],
  ["tube vers psql", '          echo "Terminé."\n', '          echo "Terminé."\n          printf \'%s\' "$texte" | psql -X -v ON_ERROR_STOP=1\n', "psql-entree"],
  ["psql sans -X", "psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c", "psql -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c", "psql-options"],
  ["psql sans ON_ERROR_STOP", "psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c", "psql -X -v VERBOSITY=sqlstate -c", "psql-options"],
  ["lecture du journal de drizzle-kit", '          echo "Terminé."\n', '          echo "Terminé."\n          read -r x < "$GITHUB_WORKSPACE/db/migrations/meta/_journal.json"\n', "journal-lu"],
  ["permissions élargies", "      contents: read\n", "      contents: write\n", "permissions"],
  ["permissions au workflow", "permissions: {}", "permissions:\n  contents: read", "permissions"],
  ["ubuntu-latest", "runs-on: ubuntu-24.04", "runs-on: ubuntu-latest", "runner"],
  ["cancel-in-progress: true", "cancel-in-progress: false", "cancel-in-progress: true", "concurrence"],
  ["deuxième lecture par cat", '          echo "Terminé."\n', '          echo "Terminé."\n          x=$(cat "$f")\n', "relecture"],
  ["deuxième lecture par $(<)", '          echo "Terminé."\n', '          echo "Terminé."\n          x=$(< "$f")\n', "relecture"],
  ["seconde redirection depuis $f", '          echo "Terminé."\n', '          echo "Terminé."\n          read -r x < "$f"\n', "relecture"],
  ["psql -c qui ne reçoit pas la variable hachée", '-c "${textes[$i]}"', '-c "$texte"', "application"],
  ["contrôle NUL absent", LECTURE, `IFS= read -r -d '' texte < "$f" || true`, "controle-nul"],
  ["contrôle NUL écrit autrement", LECTURE, `if read -d '' -r texte < "$f"; then echec "migration $tag : octet NUL"; fi`, "controle-nul"],
  ["contrôle en -c SELECT", "SQL_NON_APPLIQUEE: |\n            DO $$", "SQL_NON_APPLIQUEE: |\n            SELECT 1; DO $$", "controle-do"],
  ["contrôle de rôle sans ssl", "pg_catalog.pg_stat_ssl s", "pg_catalog.pg_stat_activity s", "controle-do"],
  ["repère de transaction non contrôlé", "IS DISTINCT FROM pg_catalog.txid_current()::text", "IS NULL", "controle-do"],
  ["lock_timeout absent", `"SET lock_timeout = '10s'; SET statement_timeout = '5min'"`, `"SET statement_timeout = '5min'"`, "delais"],
  ["statement_timeout absent", `"SET lock_timeout = '10s'; SET statement_timeout = '5min'"`, `"SET lock_timeout = '10s'"`, "delais"],
  ["search_path avant le texte", `SQL_REPERE: "SELECT`, `SQL_REPERE: "SET LOCAL search_path = pg_catalog, pg_temp; SELECT`, "chemin-avant"],
  ["contrôle vadrouille_migrate. sensible à la casse", "if [[ ${texte,,} == *vadrouille_migrate.* ]]; then", "if [[ $texte == *vadrouille_migrate.* ]]; then", "repere-casse"],
  ["contrôle -pooler absent", `          if [[ $PGHOST == *-pooler* ]]; then echec "PGHOST désigne l'hôte poolé (hôte direct exigé)"; fi\n`, "", "pooler"],
  ["contrôle de forme de PGHOST absent", '          if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then echec "PGHOST hors forme"; fi\n', "", "forme-hote"],
  ["contrôle de forme de PGDATABASE absent", '          if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then echec "PGDATABASE hors forme"; fi\n', "", "forme-base"],
  ["valeur de PGHOST dans un message", 'echec "PGHOST hors forme"', 'echec "PGHOST hors forme : $PGHOST"', "valeur-affichee"],
  ["valeur de PGDATABASE dans un message", 'echec "PGDATABASE hors forme"', 'echec "PGDATABASE hors forme : ${PGDATABASE:0:4}"', "valeur-affichee"],
  ["timeout-minutes absent", "    timeout-minutes: 30\n", "", "delai-job"],
  ["sha_attendu non comparé", 'if [[ "$SHA_ATTENDU" == "$GITHUB_SHA" ]]; then :; else echec "sha_attendu différent du commit lancé"; fi', ":", "sha"],
  ["set -x", "          set -u\n", "          set -u\n          set -x\n", "commande-interdite"],
  ["affichage de l'environnement", "          set -u\n", "          set -u\n          printenv\n", "commande-interdite"],
];

describe("ci: workflow des migrations conforme à 0056", () => {
  it("le fichier du dépôt n'a aucun écart", () => {
    expect(ecartsMigrate(WORKFLOW)).toEqual([]);
  });

  it.each(MUTATIONS)("cas négatif : %s", (_cas, avant, apres, attendu) => {
    expect(ecartsMigrate(remplacerUneFois(WORKFLOW, avant, apres))).toContain(attendu);
  });
});

describe("ci: l'environnement db-migrate et les secrets MIGRATOR_PG* ne sont nommés que par db-migrate.yml et db-reverrouillage.yml", () => {
  it("aucun autre workflow ne les nomme ; p0-purge.yml reste inchangé (son test passe)", () => {
    for (const fichier of readdirSync(DOSSIER).filter((f) => /\.ya?ml$/.test(f) && f !== FICHIER && f !== "db-reverrouillage.yml")) {
      expect(readFileSync(path.join(DOSSIER, fichier), "utf8"), fichier).not.toMatch(/db-migrate|MIGRATOR_PG/);
    }
  });
});

// --- Liste d'approbation -----------------------------------------------------------------------------------------

/** Lignes de `MIGRATIONS_APPROUVEES` d'un texte de workflow ; une ligne hors forme fait échouer la lecture. */
function liste(texte: string): string[] {
  const run = etape(texte, NOM_ETAPE).run.split("\n");
  const debut = run.findIndex((l) => l.trim() === "MIGRATIONS_APPROUVEES=(");
  if (debut < 0) throw new Error("MIGRATIONS_APPROUVEES introuvable");
  const lignes: string[] = [];
  for (const l of run.slice(debut + 1)) {
    const t = l.trim();
    if (t === ")") return lignes;
    if (t === "" || t.startsWith("#")) continue;
    const m = /^"([0-9]{4}_[a-z0-9_]{1,60} [0-9a-f]{64})"$/.exec(t);
    if (!m) throw new Error(`ligne de la liste hors forme : ${t}`);
    lignes.push(m[1]!);
  }
  throw new Error("MIGRATIONS_APPROUVEES non fermée");
}

const sha256 = (octets: Buffer | string) => createHash("sha256").update(octets).digest("hex");
const journal = () =>
  (JSON.parse(readFileSync(path.join(MIGRATIONS, "meta/_journal.json"), "utf8")) as { entries: { idx: number; tag: string }[] }).entries
    .sort((a, b) => a.idx - b.idx)
    .map((e) => e.tag);

/** Écart de la liste au préfixe du journal (tag dans l'ordre, empreinte des octets du fichier), ou `null`. */
function ecartPrefixe(lignesListe: readonly string[], tags: readonly string[], empreinte: (tag: string) => string): string | null {
  if (lignesListe.length > tags.length) return "liste plus longue que le journal";
  for (const [i, ligne] of lignesListe.entries()) {
    const [tag, sha] = ligne.split(" ");
    if (tag !== tags[i]) return `ligne ${i + 1} : ${tag} au lieu de ${tags[i]}`;
    if (sha !== empreinte(tag!)) return `ligne ${i + 1} : empreinte de ${tag} différente du fichier`;
  }
  return null;
}

/**
 * Écart à « ajout seulement » : la liste de la tête commence ligne pour ligne par la liste de référence ; seule
 * exception, une empreinte remplacée pour un fichier de migration que la PR modifie aussi (§ 3.1, lot partiel).
 */
function ecartAjout(reference: readonly string[], tete: readonly string[], fichiersModifies: ReadonlySet<string>): string | null {
  if (tete.length < reference.length) return "ligne retirée";
  for (const [i, ligne] of reference.entries()) {
    if (tete[i] === ligne) continue;
    const [tag] = ligne.split(" ");
    const [tagTete] = tete[i]!.split(" ");
    if (tag === tagTete && fichiersModifies.has(`db/migrations/${tag}.sql`)) continue;
    return `ligne ${i + 1} changée`;
  }
  return null;
}

const git = (...args: string[]) => execFileSync("git", args, { cwd: RACINE, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

/** Liste du workflow à un commit ; vide si le fichier n'y existe pas encore. */
function listeAu(commit: string): string[] {
  const present = git("ls-tree", "--name-only", commit, CHEMIN).trim() !== "";
  return present ? liste(git("show", `${commit}:${CHEMIN}`)) : [];
}

describe("ci: liste approuvée = préfixe du journal", () => {
  const tags = journal();
  const empreinte = (tag: string) => sha256(readFileSync(path.join(MIGRATIONS, `${tag}.sql`)));
  const complete = tags.map((t) => `${t} ${empreinte(t)}`);

  it("la liste du workflow est un préfixe du journal, empreintes des fichiers", () => {
    expect(ecartPrefixe(liste(WORKFLOW), tags, empreinte)).toBeNull();
  });

  it("cas de la règle : préfixe accepté ; ordre, tag absent du journal, empreinte fausse, liste trop longue refusés", () => {
    expect(ecartPrefixe(complete, tags, empreinte)).toBeNull();
    expect(ecartPrefixe(complete.slice(0, 2), tags, empreinte)).toBeNull();
    expect(ecartPrefixe([complete[1]!, complete[0]!], tags, empreinte)).toMatch(/au lieu de/);
    expect(ecartPrefixe([`9999_inconnue ${"0".repeat(64)}`], tags, empreinte)).toMatch(/au lieu de/);
    expect(ecartPrefixe([`${tags[0]} ${"0".repeat(64)}`], tags, empreinte)).toMatch(/empreinte/);
    expect(ecartPrefixe([...complete, `9999_x ${"0".repeat(64)}`], tags, empreinte)).toMatch(/plus longue/);
  });

  it("lecture de la liste : une ligne hors forme est refusée", () => {
    const avec = (lignes: string) => remplacerUneFois(WORKFLOW, "MIGRATIONS_APPROUVEES=(\n", `MIGRATIONS_APPROUVEES=(\n${lignes}`);
    expect(liste(avec(`            "${complete[0]}"\n`))).toEqual([complete[0]]);
    expect(() => liste(avec(`            ${complete[0]}\n`))).toThrow(/hors forme/);
    expect(() => liste(avec(`            "${complete[0]!.toUpperCase()}"\n`))).toThrow(/hors forme/);
  });
});

describe("ci: liste approuvée en ajout seulement", () => {
  it("cas de la règle", () => {
    const a = `0000_a ${"a".repeat(64)}`;
    const b = `0001_b ${"b".repeat(64)}`;
    const b2 = `0001_b ${"c".repeat(64)}`;
    expect(ecartAjout([a], [a, b], new Set())).toBeNull();
    expect(ecartAjout([a, b], [a], new Set())).toBe("ligne retirée");
    expect(ecartAjout([a, b], [b, a], new Set())).toMatch(/changée/);
    expect(ecartAjout([a, b], [a, b2], new Set())).toMatch(/changée/);
    expect(ecartAjout([a, b], [a, b2], new Set(["db/migrations/0001_b.sql"]))).toBeNull();
  });

  it("contre le commit de base de la PR et la tête d'origin/main (premier parent sur un push vers main)", () => {
    const tete = liste(WORKFLOW);
    const evenement = process.env.GITHUB_EVENT_NAME;
    const references: string[] =
      evenement === "push" ? [git("rev-parse", "HEAD^1").trim()] : [git("merge-base", "HEAD", "origin/main").trim(), git("rev-parse", "origin/main").trim()];
    for (const reference of references) {
      const modifies = new Set(git("diff", "--name-only", `${reference}...HEAD`).split("\n").filter(Boolean));
      expect(ecartAjout(listeAu(reference), tete, modifies), reference).toBeNull();
    }
  });
});

describe("ci: migrations en UTF-8 valide, sans BOM", () => {
  const fichiers = readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql"));

  it.each(fichiers)("%s", (fichier) => {
    const octets = readFileSync(path.join(MIGRATIONS, fichier));
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(octets)).not.toThrow();
    expect(octets.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
  });

  it("écart évité : un octet hors UTF-8 donne deux empreintes différentes (U+FFFD côté db/migrate.ts)", () => {
    const octets = Buffer.concat([Buffer.from("SELECT '"), Buffer.from([0xe9]), Buffer.from("';\n")]);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(octets)).toThrow();
    const decode = octets.toString("utf8");
    expect(decode).toContain("�");
    expect(sha256(decode)).not.toBe(sha256(octets));
  });

  it("BOM : les empreintes coïncident (le refus vient du serveur, tests/db/db-migrate.test.ts)", () => {
    const octets = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("SELECT 1;\n")]);
    expect(sha256(octets.toString("utf8"))).toBe(sha256(octets));
  });
});
