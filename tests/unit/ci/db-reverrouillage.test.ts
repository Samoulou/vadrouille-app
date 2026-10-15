// @vitest-environment node
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { commandes, etape, lignesUtiles, remplacerUneFois } from "../../support/workflows";

/**
 * Tests imposés par la décision 0056 pour `.github/workflows/db-reverrouillage.yml` (§ 4.6, point 1 ; condition 7 du
 * § 4.1), sans base ; l'étape est jouée sur la base de service de la CI par `tests/db/db-reverrouillage.test.ts` :
 * - `ci: workflow des migrations conforme à 0056`, cas étendus à `db-reverrouillage.yml` : les mêmes exigences que
 *   `db-migrate.yml` (contrôle statique, un cas négatif par exigence), plus : groupe de `concurrency` autre que
 *   `db-migrate`, verrou consultatif absent avant le texte, texte envoyé autre que la variable vérifiée contre
 *   `REVERROUILLAGE_SHA256`, contrôle final `has_function_privilege` absent, écriture du journal des migrations ;
 * - `ci: texte figé de db-reverrouillage` : l'empreinte de `db/reverrouillage/retour-deverrouillage.sql` égale
 *   `REVERROUILLAGE_SHA256`, et le texte ne contient que le cadre de `0001_securite.sql` et le `REVOKE` du § 4.6.
 */

const RACINE = fileURLToPath(new URL("../../../", import.meta.url));
const DOSSIER = path.join(RACINE, ".github/workflows");
const FICHIER = "db-reverrouillage.yml";
const WORKFLOW = readFileSync(path.join(DOSSIER, FICHIER), "utf8");
const NOM_ETAPE = "Retirer l'EXECUTE de vadrouille_prototype";
const TEXTE_FIGE = path.join(RACINE, "db/reverrouillage/retour-deverrouillage.sql");

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
  "while",
  "do",
  "done",
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
const RETRAIT =
  'psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$SQL_DELAIS" -c "BEGIN" -c "$SQL_VERROU" -c "$SQL_REPERE" -c "$texte" ' +
  '-c "$SQL_APRES_CHEMIN" -c "$SQL_APRES" -c "COMMIT" -c "$SQL_SESSION" -c "$SQL_CONTROLE" > "$sortie" 2>&1 || code=$?';
const VERROU = `"SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vadrouille_migrations'))"`;
const CONTROLES_VALEUR = [
  'if [[ ! $PGHOST =~ ^[a-z0-9.-]{1,253}$ ]]; then echec "PGHOST hors forme"; fi',
  `if [[ $PGHOST == *-pooler* ]]; then echec "PGHOST désigne l'hôte poolé (hôte direct exigé)"; fi`,
  'if [[ ! $PGDATABASE =~ ^[a-z0-9_]{1,63}$ ]]; then echec "PGDATABASE hors forme"; fi',
];
const LECTURE = `if IFS= read -r -d '' texte < "$f"; then echec "texte figé : octet NUL"; fi`;
const CHEMIN_TEXTE = 'f="$GITHUB_WORKSPACE/db/reverrouillage/retour-deverrouillage.sql"';
const COMPARAISON = 'if [[ "$lue" != "$REVERROUILLAGE_SHA256" ]]; then echec "texte figé : empreinte différente de REVERROUILLAGE_SHA256"; fi';
const PRIVILEGE = "pg_catalog.has_function_privilege('vadrouille_prototype', p.oid, 'EXECUTE')";

/** Constante `REVERROUILLAGE_SHA256` du bloc `run:`, écrite en clair (une seule affectation), ou `null`. */
function constante(run: string): string | null {
  const affectations = [...run.matchAll(/^\s*REVERROUILLAGE_SHA256=(.*)$/gm)];
  if (affectations.length !== 1) return null;
  const valeur = affectations[0]![1]!;
  return /^[0-9a-f]{64}$/.test(valeur) ? valeur : null;
}

/** Écarts de `db-reverrouillage.yml` aux exigences de 0056 (codes stables, un par exigence). */
function ecartsReverrouillage(texte: string): string[] {
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
  if (job.filter((l) => l.startsWith("timeout-minutes:")).join() !== "timeout-minutes: 10") e.add("delai-job");
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
  // Rien n'est écrit dans le journal des migrations (§ 4.6, point 1).
  if (/vadrouille_migrations\.applied|INSERT\s+INTO/i.test(code)) e.add("journal-ecrit");
  const appels = run.split("\n").filter((l) => /^\s*psql\s|\$\(psql\s/.test(l));
  if (appels.some((l) => !/^\s*psql -X -v ON_ERROR_STOP=1 /.test(l) && !/\$\(psql -X --version\)/.test(l))) e.add("psql-options");
  if (appels.some((l) => /\s-f\b|\s<[^<]|<<|\|\s*psql/.test(l)) || /\|\s*psql\b/.test(run)) e.add("psql-entree");
  const retraits = appels.filter((l) => l.includes("$SQL_DELAIS"));
  if (retraits.length !== 1 || retraits[0]!.trim() !== RETRAIT) e.add("application");
  const retrait = retraits[0]?.trim() ?? "";
  // Verrou consultatif des migrations, dans la transaction, avant le texte (§ 4.6, point 1).
  const iBegin = retrait.indexOf('-c "BEGIN"');
  const iVerrou = retrait.indexOf('-c "$SQL_VERROU"');
  const iTexte = retrait.indexOf('-c "$texte"');
  if (et.brut.SQL_VERROU !== VERROU || iBegin < 0 || iVerrou < iBegin || iTexte < 0 || iVerrou > iTexte) e.add("verrou");
  // Texte envoyé : la seule variable lue une fois et vérifiée contre REVERROUILLAGE_SHA256.
  const texteEnvoye = [...retrait.matchAll(/-c "([^"]*)"/g)].map((m) => m[1]!).filter((c) => !/^(\$SQL_[A-Z_]+|BEGIN|COMMIT)$/.test(c));
  if (JSON.stringify(texteEnvoye) !== JSON.stringify(["$texte"])) e.add("texte-verifie");
  // Six références à la variable : lecture, taille, empreinte, deux contrôles, envoi ; aucune autre affectation.
  if ((run.match(/^\s*texte=/gm) ?? []).length !== 0 || (run.match(/\$\{#?texte\b|\$texte\b|-d '' texte\b/g) ?? []).length !== 6) e.add("texte-verifie");
  if (!run.includes(CHEMIN_TEXTE) || (run.match(/^\s*f=/gm) ?? []).length !== 1) e.add("texte-verifie");
  if (!run.includes(`lue=$(printf '%s' "$texte" | sha256sum)`)) e.add("empreinte");
  if (!run.includes(COMPARAISON) || constante(et.run) === null) e.add("constante");
  const iLecture = run.indexOf(LECTURE);
  if (iLecture < 0 || run.split(LECTURE).length !== 2) e.add("controle-nul");
  if (run.split("\n").filter((l) => /<\s*"\$f"|\$\(<|\bcat\b/.test(l)).length !== 1) e.add("relecture");
  for (const k of ["SQL_ROLE", "SQL_APRES", "SQL_CONTROLE"]) if (!/^DO \$\$\nBEGIN\n/.test(et.env[k] ?? "")) e.add("controle-do");
  if (!(et.env.SQL_ROLE ?? "").includes("pg_catalog.pg_stat_ssl") || !(et.env.SQL_ROLE ?? "").includes("rolbypassrls")) e.add("controle-do");
  if (!(et.env.SQL_APRES ?? "").includes("pg_catalog.current_setting('vadrouille_migrate.txid', true) IS DISTINCT FROM pg_catalog.txid_current()::text")) e.add("controle-do");
  if (!(et.env.SQL_APRES ?? "").includes("current_setting('session_replication_role') <> 'origin'")) e.add("controle-do");
  if (!(et.env.SQL_APRES ?? "").includes("IF session_user <> 'vadrouille_migrator' OR current_user <> 'vadrouille_migrator' THEN RAISE EXCEPTION")) e.add("controle-do");
  // Contrôle final : surcharges trouvées dans pg_proc par nom et schéma, privilège évalué par oid, après le COMMIT.
  const final = et.env.SQL_CONTROLE ?? "";
  const lignePrivilege = final.split("\n").filter((l) => l.includes(PRIVILEGE));
  if (
    lignePrivilege.length !== 1 ||
    !lignePrivilege[0]!.includes("FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND p.proname = 'store_prototype_coordinates' AND") ||
    !/^\s*IF EXISTS \(/.test(lignePrivilege[0]!) ||
    retrait.indexOf('-c "$SQL_CONTROLE"') < retrait.indexOf('-c "COMMIT"')
  )
    e.add("controle-final");
  if (et.brut.SQL_DELAIS !== `"SET lock_timeout = '10s'; SET statement_timeout = '5min'"`) e.add("delais");
  const avantTexte = retrait.slice(0, Math.max(iTexte, 0));
  for (const v of [...avantTexte.matchAll(/"\$([A-Z_]+)"/g)].map((m) => m[1]!)) if (/search_path/i.test(et.env[v] ?? "")) e.add("chemin-avant");
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
  if (!run.includes("if [[ ! $SHA_ATTENDU =~ ^[0-9a-f]{40}$ ]]; then") || !run.includes('if [[ "$SHA_ATTENDU" == "$GITHUB_SHA" ]]; then')) e.add("sha");
  const iControles = run.indexOf("PGDATABASE hors forme");
  const iComparaison = run.indexOf(COMPARAISON);
  const iConnexion = run.indexOf("psql -X -v ON_ERROR_STOP=1");
  if (iControles < 0 || iConnexion < 0 || iControles > iConnexion || iLecture > iConnexion || iComparaison < 0 || iComparaison > iConnexion) e.add("ordre");
  return [...e];
}

const FIN = '          echo "EXECUTE de vadrouille_prototype retiré ; contrôle final passé."\n';
const apres = (ligne: string) => `${FIN}          ${ligne}\n`;

const MUTATIONS: [string, string, string, string][] = [
  // Cas de db-migrate.yml (« Tests imposés » : « les mêmes cas s'appliquent à db-reverrouillage.yml »).
  ["déclencheur ajouté", "on:\n  workflow_dispatch:\n", "on:\n  push:\n  workflow_dispatch:\n", "declencheur"],
  ["autre inputs", "        type: string\n", "        type: string\n      cible:\n        type: string\n", "inputs"],
  ["entrée facultative", "required: true", "required: false", "inputs"],
  ["${{ inputs }} dans run", FIN, apres('echo "${{ inputs.sha_attendu }}"'), "expression-run"],
  ["${{ github.event }} dans run", FIN, apres('echo "${{ github.event.sender.login }}"'), "expression-run"],
  ["condition main absente", "    if: github.ref == 'refs/heads/main'\n", "", "branche"],
  ["environnement absent", "    environment: db-migrate\n", "", "environnement"],
  ["secret au niveau du job", "    timeout-minutes: 10\n", "    timeout-minutes: 10\n    env:\n      PGHOST: ${{ secrets.MIGRATOR_PGHOST }}\n", "env-niveau"],
  ["secret au niveau du workflow", "permissions: {}\n", "permissions: {}\nenv:\n  PGHOST: ${{ secrets.MIGRATOR_PGHOST }}\n", "env-niveau"],
  ["variable PG* hors liste", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          PGPORT: \"5432\"\n", "variables-pg"],
  ["autre variable", "          PGSSLROOTCERT: system\n", "          PGSSLROOTCERT: system\n          AUTRE_VARIABLE: x\n", "variables-pg"],
  ["PGUSER autre", "PGUSER: vadrouille_migrator", "PGUSER: vadrouille_owner", "pguser"],
  ["PGSSLMODE autre", "PGSSLMODE: verify-full", "PGSSLMODE: require", "sslmode"],
  ["checkout non épinglé", CHECKOUT, "actions/checkout@v4", "checkout"],
  ["checkout d'une autre référence", "ref: ${{ github.sha }}", "ref: ${{ github.head_ref }}", "checkout"],
  ["checkout avec persist-credentials", "persist-credentials: false", "persist-credentials: true", "checkout"],
  ["checkout avec sous-modules", "submodules: false", "submodules: true", "checkout"],
  ["autre action", "      - name: Retirer", "      - uses: actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020 # v4.4.0\n      - name: Retirer", "action"],
  ["pnpm", FIN, apres("pnpm db:migrate"), "commande-interdite"],
  ["node", FIN, apres("node db/migrate.ts"), "commande-interdite"],
  ["source", FIN, apres(". ./script.sh"), "commande-interdite"],
  ["bash fichier", FIN, apres("bash script.sh"), "commande-interdite"],
  ["eval", FIN, apres('eval "$x"'), "commande-interdite"],
  ["export", "          set -u\n", "          set -u\n          export PGPORT=5432\n", "commande-interdite"],
  ["arithmétique", FIN, apres("n=$((1 + 1))"), "commande-interdite"],
  ["psql -f", '-c "$SQL_CONTROLE" > "$sortie"', '-f "$f" > "$sortie"', "psql-entree"],
  ["entrée redirigée vers psql", '-c "$SQL_CONTROLE" > "$sortie" 2>&1', '-c "$SQL_CONTROLE" < "$f" > "$sortie" 2>&1', "psql-entree"],
  ["tube vers psql", FIN, apres(`printf '%s' "$texte" | psql -X -v ON_ERROR_STOP=1`), "psql-entree"],
  ["psql sans -X", 'psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$SQL_DELAIS"', 'psql -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$SQL_DELAIS"', "psql-options"],
  ["psql sans ON_ERROR_STOP", 'psql -X -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -c "$SQL_DELAIS"', 'psql -X -v VERBOSITY=sqlstate -c "$SQL_DELAIS"', "psql-options"],
  ["lecture du journal de drizzle-kit", FIN, apres('read -r x < "$GITHUB_WORKSPACE/db/migrations/meta/_journal.json"'), "journal-lu"],
  ["permissions élargies", "      contents: read\n", "      contents: write\n", "permissions"],
  ["permissions au workflow", "permissions: {}", "permissions:\n  contents: read", "permissions"],
  ["ubuntu-latest", "runs-on: ubuntu-24.04", "runs-on: ubuntu-latest", "runner"],
  ["cancel-in-progress: true", "cancel-in-progress: false", "cancel-in-progress: true", "concurrence"],
  ["deuxième lecture par cat", FIN, apres('x=$(cat "$f")'), "relecture"],
  ["deuxième lecture par $(<)", FIN, apres('x=$(< "$f")'), "relecture"],
  ["seconde redirection depuis $f", FIN, apres('read -r x < "$f"'), "relecture"],
  ["contrôle NUL absent", LECTURE, `IFS= read -r -d '' texte < "$f" || true`, "controle-nul"],
  ["contrôle NUL écrit autrement", LECTURE, `if read -d '' -r texte < "$f"; then echec "texte figé : octet NUL"; fi`, "controle-nul"],
  ["contrôle de rôle en -c SELECT", "SQL_APRES: |\n            DO $$", "SQL_APRES: |\n            SELECT 1; DO $$", "controle-do"],
  ["contrôle de connexion sans ssl", "pg_catalog.pg_stat_ssl s", "pg_catalog.pg_stat_activity s", "controle-do"],
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
  ["timeout-minutes absent", "    timeout-minutes: 10\n", "", "delai-job"],
  ["timeout-minutes de db-migrate", "    timeout-minutes: 10\n", "    timeout-minutes: 30\n", "delai-job"],
  ["sha_attendu non comparé", 'if [[ "$SHA_ATTENDU" == "$GITHUB_SHA" ]]; then :; else echec "sha_attendu différent du commit lancé"; fi', ":", "sha"],
  ["set -x", "          set -u\n", "          set -u\n          set -x\n", "commande-interdite"],
  ["affichage de l'environnement", "          set -u\n", "          set -u\n          printenv\n", "commande-interdite"],
  // Cas propres à db-reverrouillage.yml (« Tests imposés », 0056 § 4.6 point 1).
  ["groupe de concurrency autre que db-migrate", "  group: db-migrate\n", "  group: db-reverrouillage\n", "concurrence"],
  ["verrou consultatif absent", '-c "BEGIN" -c "$SQL_VERROU" -c "$SQL_REPERE"', '-c "BEGIN" -c "$SQL_REPERE"', "verrou"],
  ["verrou consultatif après le texte", '-c "$SQL_VERROU" -c "$SQL_REPERE" -c "$texte"', '-c "$SQL_REPERE" -c "$texte" -c "$SQL_VERROU"', "verrou"],
  ["verrou consultatif hors transaction", '-c "BEGIN" -c "$SQL_VERROU"', '-c "$SQL_VERROU" -c "BEGIN"', "verrou"],
  ["verrou consultatif d'une autre clé", "hashtext('vadrouille_migrations')", "hashtext('vadrouille_reverrouillage')", "verrou"],
  ["texte envoyé relu du disque", '-c "$texte"', '-c "$(< "$f")"', "texte-verifie"],
  ["texte envoyé d'une autre variable", '-c "$texte"', '-c "$SQL_TEXTE"', "texte-verifie"],
  ["texte réaffecté après la vérification", '          echo "Texte figé vérifié', '          texte="REVOKE ALL ON FUNCTION x() FROM y;"\n          echo "Texte figé vérifié', "texte-verifie"],
  ["autre fichier lu", CHEMIN_TEXTE, 'f="$GITHUB_WORKSPACE/db/migrations/0001_securite.sql"', "texte-verifie"],
  ["constante non comparée", COMPARAISON, ":", "constante"],
  ["constante comparée à une autre valeur", '"$lue" != "$REVERROUILLAGE_SHA256"', '"$lue" == "$REVERROUILLAGE_SHA256"', "constante"],
  ["constante lue ailleurs qu'en clair", /REVERROUILLAGE_SHA256=[0-9a-f]{64}/.exec(WORKFLOW)![0], "REVERROUILLAGE_SHA256=$SHA_ATTENDU", "constante"],
  ["contrôle final absent", ' -c "$SQL_SESSION" -c "$SQL_CONTROLE" > "$sortie"', ' > "$sortie"', "controle-final"],
  ["contrôle final avant le COMMIT", '-c "COMMIT" -c "$SQL_SESSION" -c "$SQL_CONTROLE"', '-c "$SQL_SESSION" -c "$SQL_CONTROLE" -c "COMMIT"', "controle-final"],
  ["contrôle final sans has_function_privilege", PRIVILEGE, "false", "controle-final"],
  [
    "contrôle final par signature écrite",
    "WHERE n.nspname = 'public' AND p.proname = 'store_prototype_coordinates' AND pg_catalog.has_function_privilege",
    "WHERE p.oid = 'public.store_prototype_coordinates(uuid, text, double precision, double precision)'::pg_catalog.regprocedure AND pg_catalog.has_function_privilege",
    "controle-final",
  ],
  ["contrôle final en -c SELECT", "SQL_CONTROLE: |\n            DO $$", "SQL_CONTROLE: |\n            SELECT 1; DO $$", "controle-do"],
  ["écriture du journal des migrations", '-c "COMMIT" -c "$SQL_SESSION"', `-c "INSERT INTO vadrouille_migrations.applied (tag, sha256) VALUES ('x', 'y')" -c "COMMIT" -c "$SQL_SESSION"`, "journal-ecrit"],
  ["empreinte calculée sur autre chose que le texte lu", `lue=$(printf '%s' "$texte" | sha256sum)`, `lue=$(sha256sum -- "$f")`, "empreinte"],
];

describe("ci: workflow des migrations conforme à 0056 — db-reverrouillage.yml (§ 4.6, point 1)", () => {
  it("le fichier du dépôt n'a aucun écart", () => {
    expect(ecartsReverrouillage(WORKFLOW)).toEqual([]);
  });

  it.each(MUTATIONS)("cas négatif : %s", (_cas, avant, apres, attendu) => {
    expect(ecartsReverrouillage(remplacerUneFois(WORKFLOW, avant, apres))).toContain(attendu);
  });
});

/**
 * Texte figé attendu (0056 § 4.6 point 1 et § 4.2) : le `REVOKE` encadré par le modèle de `0001_securite.sql`
 * (`RESET ROLE` ; appartenance `vadrouille_fn_coords` accordée à `vadrouille_migrator`, `SET TRUE, INHERIT FALSE` ;
 * `SET LOCAL ROLE vadrouille_fn_coords` ; l'instruction ; `RESET ROLE` ; appartenance révoquée `GRANTED BY
 * vadrouille_migrator`), rien d'autre que les séparateurs d'instruction de drizzle-kit.
 */
const ATTENDU = [
  "RESET ROLE;",
  "GRANT vadrouille_fn_coords TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;",
  "SET LOCAL ROLE vadrouille_fn_coords;",
  "REVOKE EXECUTE ON FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) FROM vadrouille_prototype;",
  "RESET ROLE;",
  "REVOKE vadrouille_fn_coords FROM vadrouille_migrator GRANTED BY vadrouille_migrator;",
];

describe("ci: texte figé de db-reverrouillage", () => {
  const octets = readFileSync(TEXTE_FIGE);

  it("l'empreinte de db/reverrouillage/retour-deverrouillage.sql égale REVERROUILLAGE_SHA256, écrite en clair dans le workflow", () => {
    const valeur = constante(etape(WORKFLOW, NOM_ETAPE).run);
    expect(valeur).not.toBeNull();
    expect(createHash("sha256").update(octets).digest("hex")).toBe(valeur);
  });

  it("le texte ne contient que le cadre de 0001_securite.sql et le REVOKE du § 4.6", () => {
    expect(octets.toString("utf8")).toBe(`${ATTENDU.join("\n--> statement-breakpoint\n")}\n`);
  });

  it("UTF-8 valide, sans BOM, sans octet NUL, premier caractère autre que la barre oblique inverse", () => {
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(octets)).not.toThrow();
    expect(octets.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf]))).toBe(false);
    expect(octets.includes(0)).toBe(false);
    expect(octets[0]).not.toBe(0x5c);
  });

  it("le cadre suit celui de 0001_securite.sql (mêmes instructions d'appartenance)", () => {
    const securite = readFileSync(path.join(RACINE, "db/migrations/0001_securite.sql"), "utf8");
    expect(securite).toContain("RESET ROLE;");
    expect(securite).toMatch(/TO vadrouille_migrator WITH INHERIT FALSE, SET TRUE;/);
    expect(securite).toMatch(/FROM vadrouille_migrator GRANTED BY vadrouille_migrator;/);
  });

  it("cas négatifs : texte modifié ou constante fausse détectés", () => {
    const modifie = Buffer.concat([octets, Buffer.from("GRANT EXECUTE ON FUNCTION public.f() TO vadrouille_prototype;\n")]);
    expect(createHash("sha256").update(modifie).digest("hex")).not.toBe(constante(etape(WORKFLOW, NOM_ETAPE).run));
    const valeur = constante(etape(WORKFLOW, NOM_ETAPE).run)!;
    const faux = remplacerUneFois(WORKFLOW, valeur, "0".repeat(64));
    expect(constante(etape(faux, NOM_ETAPE).run)).not.toBe(createHash("sha256").update(octets).digest("hex"));
    expect(constante(etape(remplacerUneFois(WORKFLOW, valeur, valeur.toUpperCase()), NOM_ETAPE).run)).toBeNull();
  });
});
