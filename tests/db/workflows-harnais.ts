import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { etape, remplacerUneFois } from "../support/workflows";
import { nomBaseJetable, urlBaseJetable } from "./env";
import { connect, connectBaseJetable, type DbClient, urlFor } from "./helpers";

/**
 * Harnais des tests des workflows de la base sur le serveur de la CI (décisions 0056 et 0057, « Tests imposés » ;
 * harnais confié à la PR du workflow par Q412). Il ne touche jamais la base réelle : hôtes `127.0.0.1` ou `localhost`
 * seulement (`tests/db/env.ts`), aucun secret réel, chaque base est créée vide par le test et supprimée ensuite.
 *
 * - `creerBase` : `CREATE DATABASE <base>_<suffixe>` sous l'administrateur de la base de service, puis l'amorçage
 *   `db/bootstrap/roles.sql` dans la nouvelle base (droits de connexion, schéma `vadrouille_migrations`) : l'état d'une
 *   base Neon avant les migrations (S5 de 0046).
 * - `executer` : le bloc `run:` de l'étape, extrait du YAML, joué par `bash --noprofile --norc -eo pipefail` (forme de
 *   GitHub pour `shell: bash`) avec les textes SQL de l'`env:` de l'étape et un environnement posé par le test : hôte
 *   local, `PGSSLMODE=disable`, `GITHUB_WORKSPACE`, `RUNNER_TEMP`, `GITHUB_SHA`. Le contrôle de chiffrement côté client
 *   (décision 0067 : `PGSSLMODE=verify-full` et les six seules variables `PG*` de l'étape ; aucun chiffrement sur le
 *   serveur de la CI, qui reçoit aussi `PGPORT` et `PGCONNECT_TIMEOUT`) est retiré du bloc `run:` par une substitution
 *   qui doit trouver exactement une occurrence, sauf si le test le garde pour vérifier le refus sans connexion. L'ancien
 *   contrôle `pg_stat_ssl` ne doit plus figurer dans aucun texte SQL.
 */

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
export const WORKFLOWS = path.join(RACINE, ".github/workflows");
export const ETAPE_MIGRATE = "Appliquer les migrations approuvées";
export const ETAPE_RELEVE = "Relever le catalogue";
/**
 * Ligne du contrôle de chiffrement côté client (0067), identique dans les trois workflows à la fonction d'échec près ; la
 * liste exacte des variables est figée par les tests statiques de `tests/unit/ci/`.
 */
export const CONTROLE_CHIFFREMENT =
  /^[ \t]*if \[\[ "\$\{!PG\*\}" != "[A-Z ]+" \|\| \$PGSSLMODE != verify-full \|\| \$PGSSLROOTCERT != system \]\]; then (echec|refus) "chiffrement : variables PG\* hors liste, ou PGSSLMODE autre que verify-full"; fi$/gm;

const temporaires: string[] = [];
const bases: string[] = [];

function admin(): Promise<DbClient> {
  return connect("admin");
}

/** Base jetable vide, amorcée comme une base Neon avant les migrations. */
export async function creerBase(suffixe: string): Promise<string> {
  const nom = nomBaseJetable(urlFor("admin"), suffixe);
  const client = await admin();
  try {
    await client.query(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
    await client.query(`CREATE DATABASE "${nom}"`);
  } finally {
    await client.end();
  }
  bases.push(nom);
  const copie = await connectBaseJetable("admin", nom);
  try {
    await copie.query("SET client_min_messages = warning");
    await copie.query(readFileSync(path.join(RACINE, "db/bootstrap/roles.sql"), "utf8"));
  } finally {
    await copie.end();
  }
  return nom;
}

/** Suppression des bases jetables créées par le fichier de test (connexions restantes coupées). */
export async function supprimerBases(): Promise<void> {
  const client = await admin();
  try {
    for (const nom of bases.splice(0)) await client.query(`DROP DATABASE IF EXISTS "${nom}" WITH (FORCE)`);
  } finally {
    await client.end();
  }
  for (const dossier of temporaires.splice(0)) rmSync(dossier, { recursive: true, force: true });
}

/** Requête sous l'administrateur dans une base jetable ; lignes rendues. */
export async function requeteAdmin<T = Record<string, unknown>>(nom: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = await connectBaseJetable("admin", nom);
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export function dossierTemporaire(prefixe: string): string {
  const dossier = realpathSync(mkdtempSync(path.join(tmpdir(), prefixe)));
  temporaires.push(dossier);
  return dossier;
}

/** Copie de travail de `db/migrations` (les tests y modifient ou ajoutent des fichiers). */
export function espaceDeTravail(): string {
  const espace = dossierTemporaire("db-migrate-espace-");
  mkdirSync(path.join(espace, "db"));
  cpSync(path.join(RACINE, "db/migrations"), path.join(espace, "db/migrations"), { recursive: true });
  return espace;
}

export function ecrireMigration(espace: string, tag: string, contenu: string | Buffer): void {
  writeFileSync(path.join(espace, "db/migrations", `${tag}.sql`), contenu);
}

/** Ligne de la liste d'approbation pour le fichier `tag` de l'espace : `"<tag> <sha256 des octets>"`. */
export function ligneApprouvee(espace: string, tag: string): string {
  const r = spawnSync("sha256sum", [path.join(espace, "db/migrations", `${tag}.sql`)], { encoding: "utf8" });
  return `${tag} ${r.stdout.split(" ")[0]}`;
}

export type Options = {
  readonly base: string;
  /**
   * Liste d'approbation posée par le test : remplace le bloc entier `MIGRATIONS_APPROUVEES=( … )` du workflow, quel
   * qu'en soit le contenu (la liste du dépôt grandit, 0056 § 3.4) ; `[]` pose une liste vide.
   */
  readonly liste?: readonly string[];
  /** Texte du workflow à la place du fichier du dépôt (workflow muté en mémoire par le test). */
  readonly workflow?: string;
  readonly espace?: string;
  /** Garde le contrôle de chiffrement côté client (refus attendu sans connexion : `PGSSLMODE=disable`, `PGPORT`). */
  readonly garderSsl?: boolean;
  readonly env?: Readonly<Record<string, string>>;
  /** Rôle de connexion (login de `tests/db/env.ts`) dont le mot de passe est passé dans `PGPASSWORD`. */
  readonly login?: "migrator" | "p0_purge";
  /** Remplacements supplémentaires du bloc `run:`, chacun à exactement une occurrence. */
  readonly substitutions?: readonly (readonly [string, string])[];
};

export type Resultat = { readonly code: number | null; readonly sortie: string; readonly runnerTemp: string };

export const SHA = "c0ffee".padEnd(40, "0");

/** Bloc entier de la liste d'approbation, de `MIGRATIONS_APPROUVEES=(` à la première ligne `)` (ancres de ligne). */
const BLOC_LISTE = /^MIGRATIONS_APPROUVEES=\($[\s\S]*?^\)$/gm;

/**
 * Remplace le bloc `MIGRATIONS_APPROUVEES=( … )` du bloc `run:` par la liste du test. Le bloc doit apparaître
 * exactement une fois, et le nom `MIGRATIONS_APPROUVEES=` n'ouvrir aucune autre ligne.
 */
export function remplacerListe(run: string, liste: readonly string[]): string {
  const blocs = run.match(BLOC_LISTE)?.length ?? 0;
  const ouvertures = run.match(/^MIGRATIONS_APPROUVEES=/gm)?.length ?? 0;
  if (blocs !== 1 || ouvertures !== 1) throw new Error(`liste d'approbation : ${blocs} bloc(s), ${ouvertures} affectation(s) au lieu d'une`);
  const bloc = ["MIGRATIONS_APPROUVEES=(", ...liste.map((l) => `  "${l}"`), ")"].join("\n");
  return run.replace(BLOC_LISTE, () => bloc);
}

/** Script et environnement de l'étape, prêts à être lancés. */
export function preparer(fichier: string, nom: string, options: Options): { script: string; env: NodeJS.ProcessEnv; runnerTemp: string } {
  const e = etape(options.workflow ?? readFileSync(path.join(WORKFLOWS, fichier), "utf8"), nom);
  let run = e.run;
  if (options.liste !== undefined) run = remplacerListe(run, options.liste);
  for (const [avant, apres] of options.substitutions ?? []) run = remplacerUneFois(run, avant, apres);
  const chiffrement = run.match(CONTROLE_CHIFFREMENT)?.length ?? 0;
  if (chiffrement !== 1) throw new Error(`contrôle de chiffrement : ${chiffrement} occurrence(s) au lieu d'une`);
  if (!options.garderSsl) run = run.replace(CONTROLE_CHIFFREMENT, "");
  const sql: Record<string, string> = {};
  for (const [cle, valeur] of Object.entries(e.env)) {
    if (!cle.startsWith("SQL_")) continue;
    if (valeur.includes("pg_stat_ssl")) throw new Error(`${cle} : contrôle pg_stat_ssl, remplacé par le contrôle côté client (0067)`);
    sql[cle] = valeur;
  }
  const login = options.login ?? "migrator";
  const adresse = new URL(urlBaseJetable(login, options.base));
  const runnerTemp = dossierTemporaire("runner-temp-");
  const dossierScript = dossierTemporaire("script-");
  const script = path.join(dossierScript, "etape.sh");
  writeFileSync(script, run);
  const env: Record<string, string> = {
    ...sql,
    PATH: process.env.PATH ?? "/usr/bin:/bin",
    LC_ALL: "C",
    PGHOST: adresse.hostname,
    PGPORT: adresse.port || "5432",
    PGDATABASE: options.base,
    PGUSER: e.env.PGUSER!,
    PGPASSWORD: decodeURIComponent(adresse.password),
    PGSSLMODE: "disable",
    PGCONNECT_TIMEOUT: "10",
    GITHUB_WORKSPACE: options.espace ?? RACINE.replace(/\/$/, ""),
    RUNNER_TEMP: runnerTemp,
    GITHUB_SHA: SHA,
    SHA_ATTENDU: SHA,
    ...options.env,
  };
  return { script, env: env as NodeJS.ProcessEnv, runnerTemp };
}

const BASH = ["--noprofile", "--norc", "-eo", "pipefail"];

/** Lance l'étape et attend sa fin. */
export function executer(fichier: string, nom: string, options: Options): Resultat {
  const { script, env, runnerTemp } = preparer(fichier, nom, options);
  const r = spawnSync("bash", [...BASH, script], { env, encoding: "utf8", timeout: 120_000 });
  return { code: r.status, sortie: `${r.stdout}${r.stderr}`, runnerTemp };
}

/** Lance l'étape sans l'attendre, dans son propre groupe de processus (pour l'arrêter comme le ferait le runner). */
export function lancer(fichier: string, nom: string, options: Options): { arreter: () => void; fin: Promise<number | null> } {
  const { script, env } = preparer(fichier, nom, options);
  const enfant: ChildProcess = spawn("bash", [...BASH, script], { env, detached: true, stdio: "ignore" });
  // Drapeau « enfant terminé » : une fois le groupe sorti, son numéro peut être réattribué ; on ne le vise plus.
  let termine = false;
  const fin = new Promise<number | null>((resolve) =>
    enfant.on("exit", (code) => {
      termine = true;
      resolve(code);
    }),
  );
  return {
    arreter: () => {
      if (!termine && enfant.pid !== undefined) process.kill(-enfant.pid, "SIGKILL");
    },
    fin,
  };
}
