import { createHash } from "node:crypto";
import { chmodSync, cpSync, existsSync, mkdirSync, readFileSync, renameSync, symlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { closeAll, connectBaseJetable, type DbClient } from "./helpers";
import { creerBase, dossierTemporaire, executer, lancer, type Options, requeteAdmin, supprimerBases } from "./workflows-harnais";

/**
 * `ci: db-reverrouillage retire l'EXECUTE de vadrouille_prototype` (décision 0056, « Tests imposés » ; § 4.6), sur le
 * serveur de la CI (`postgres:17.11`), dans des bases jetables créées vides et migrées jusqu'au lot 2 (migration de
 * remplacement `0005_prototype_coordinates_run`, `store_prototype_coordinates` à quatre paramètres) par
 * `db/migrate.ts`. Le bloc `run:` de `.github/workflows/db-reverrouillage.yml` est joué tel quel par le harnais
 * (`tests/db/workflows-harnais.ts`) ; aucune base réelle, aucun secret réel. La migration de déverrouillage n'existe
 * pas encore : le `GRANT EXECUTE` est posé par le test.
 *
 * Dernier recours du § 4.6 (point 3) : les appartenances de l'identifiant propriétaire de Neon ne sont pas relevées
 * (future décision 0057) ; la commande est jouée sous un rôle `CREATEROLE` non superutilisateur, avec l'option ADMIN sur
 * `vadrouille_prototype` (celle que reçoit le créateur d'un rôle sous PostgreSQL 16 ou plus), dans un cas avec
 * `pg_signal_backend` et dans un cas sans.
 */

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

const RACINE = fileURLToPath(new URL("../../", import.meta.url));
const WF = "db-reverrouillage.yml";
const ETAPE = "Retirer l'EXECUTE de vadrouille_prototype";
const TEXTE_FIGE = "db/reverrouillage/retour-deverrouillage.sql";
const SIGNATURE = "public.store_prototype_coordinates(uuid, text, double precision, double precision)";
const SUCCES = "EXECUTE de vadrouille_prototype retiré ; contrôle final passé.";

function reverrouiller(options: Options) {
  return executer(WF, ETAPE, options);
}

/** Base jetable amorcée puis migrée par `db/migrate.ts` jusqu'à la dernière migration du journal (lot 2 compris). */
async function baseMigree(suffixe: string): Promise<string> {
  const base = await creerBase(suffixe);
  await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", base) });
  return base;
}

/** `has_function_privilege('vadrouille_prototype', oid, 'EXECUTE')` pour chaque surcharge, par signature. */
async function privileges(base: string): Promise<Record<string, boolean>> {
  const lignes = await requeteAdmin<{ s: string; e: boolean }>(
    base,
    `SELECT p.oid::pg_catalog.regprocedure::text AS s, pg_catalog.has_function_privilege('vadrouille_prototype', p.oid, 'EXECUTE') AS e
       FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.proname = 'store_prototype_coordinates'`,
  );
  return Object.fromEntries(lignes.map((l) => [l.s, l.e]));
}

/** Surcharge à quatre paramètres, telle que `regprocedure` l'écrit (schéma `public` omis, dans le chemin par défaut). */
const SURCHARGE = "store_prototype_coordinates(uuid,text,double precision,double precision)";
const deverrouille = { [SURCHARGE]: true };
const verrouille = { [SURCHARGE]: false };

async function accorder(base: string, beneficiaire = "vadrouille_prototype"): Promise<void> {
  await requeteAdmin(base, `GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO ${beneficiaire}`);
}

async function journal(base: string): Promise<string[]> {
  return (await requeteAdmin<{ t: string }>(base, "SELECT tag AS t FROM vadrouille_migrations.applied ORDER BY tag")).map((r) => r.t);
}

/** Appartenances de `vadrouille_migrator` à `vadrouille_fn_coords` avec SET ou INHERIT (l'amorçage n'en donne aucune). */
async function appartenancesResiduelles(base: string): Promise<number> {
  const [r] = await requeteAdmin<{ n: string }>(
    base,
    `SELECT count(*) AS n FROM pg_catalog.pg_auth_members m
       WHERE m.roleid = 'vadrouille_fn_coords'::pg_catalog.regrole AND m.member = 'vadrouille_migrator'::pg_catalog.regrole
         AND (m.set_option OR m.inherit_option)`,
  );
  return Number(r!.n);
}

/** Copie de travail contenant le texte figé (les tests le modifient ou le remplacent). */
function espaceTexteFige(): string {
  const espace = dossierTemporaire("db-reverrouillage-espace-");
  mkdirSync(path.join(espace, "db/reverrouillage"), { recursive: true });
  cpSync(path.join(RACINE, TEXTE_FIGE), path.join(espace, TEXTE_FIGE));
  return espace;
}

/**
 * `psql` espion placé en tête du `PATH` : répond à `psql -X --version` comme le vrai, et pour tout autre appel (une
 * connexion) crée une sentinelle et échoue. La sentinelle absente prouve qu'aucune connexion n'a été tentée.
 */
function psqlEspion(): { readonly env: Record<string, string>; readonly sentinelle: string } {
  const dossier = dossierTemporaire("psql-espion-");
  const sentinelle = path.join(dossier, "connexion-tentee");
  const script = path.join(dossier, "psql");
  writeFileSync(
    script,
    `#!/bin/sh\nif [ "$1" = "-X" ] && [ "$2" = "--version" ]; then echo "psql (PostgreSQL) 17.11"; exit 0; fi\n: > '${sentinelle}'\nexit 2\n`,
  );
  chmodSync(script, 0o755);
  return { env: { PATH: `${dossier}:${process.env.PATH ?? "/usr/bin:/bin"}` }, sentinelle };
}

describe("ci: db-reverrouillage retire l'EXECUTE de vadrouille_prototype (0056 § 4.6)", () => {
  it("après un GRANT EXECUTE posé par le test : droit retiré, contrôle final passé ; second lancement sans effet ; journal et appartenances inchangés", async () => {
    const base = await baseMigree("dr_retrait");
    const tags = await journal(base);
    expect(tags).toContain("0005_prototype_coordinates_run");
    expect(await privileges(base)).toEqual(verrouille);
    await accorder(base);
    expect(await privileges(base)).toEqual(deverrouille);

    const r = reverrouiller({ base });
    expect(r.code, r.sortie).toBe(0);
    expect(r.sortie).toContain("Texte figé vérifié contre REVERROUILLAGE_SHA256.");
    expect(r.sortie).toContain(SUCCES);
    expect(await privileges(base)).toEqual(verrouille);

    const second = reverrouiller({ base });
    expect(second.code, second.sortie).toBe(0);
    expect(second.sortie).toContain(SUCCES);
    expect(await privileges(base)).toEqual(verrouille);

    expect(await journal(base)).toEqual(tags);
    expect(await appartenancesResiduelles(base)).toBe(0);
  });

  it("EXECUTE restant par PUBLIC : le REVOKE passe, mais le contrôle final échoue (SQLSTATE P0001)", async () => {
    const base = await baseMigree("dr_public");
    await accorder(base);
    await accorder(base, "PUBLIC");
    const r = reverrouiller({ base });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/Échec : retrait ou contrôle final ; code de sortie \d+ ; SQLSTATE P0001/);
    expect(r.sortie).not.toContain(SUCCES);
    expect(await privileges(base)).toEqual(deverrouille);
    const [acl] = await requeteAdmin<{ a: string }>(base, `SELECT p.proacl::text AS a FROM pg_catalog.pg_proc p WHERE p.oid = '${SIGNATURE}'::pg_catalog.regprocedure`);
    expect(acl!.a).not.toContain("vadrouille_prototype=");
    expect(await appartenancesResiduelles(base)).toBe(0);
  });

  it("contrôle de chiffrement gardé : refusé sans connexion (PGSSLMODE=disable, PGPORT), droit inchangé (0067)", async () => {
    const base = await baseMigree("dr_ssl");
    await accorder(base);
    const r = reverrouiller({ base, garderSsl: true });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/Échec : chiffrement : variables PG\* hors liste, ou PGSSLMODE autre que verify-full/);
    expect(await privileges(base)).toEqual(deverrouille);
  });
});

describe("db-reverrouillage : refus sans connexion (0056 § 2.6.1, § 4.6 point 1)", () => {
  const SENTINELLE = "sentinelle0hote0secret";

  async function refusSansConnexion(options: Omit<Options, "base">, message: RegExp): Promise<string> {
    const base = await baseMigree("dr_refus");
    await accorder(base);
    const espion = psqlEspion();
    const r = reverrouiller({ base, ...options, env: { ...espion.env, ...options.env } });
    expect(r.code, r.sortie).toBe(1);
    expect(r.sortie).toMatch(message);
    expect(existsSync(espion.sentinelle), "aucune connexion tentée").toBe(false);
    expect(await privileges(base)).toEqual(deverrouille);
    return r.sortie;
  }

  it("le psql espion voit une connexion quand les contrôles passent (témoin)", async () => {
    const base = await baseMigree("dr_temoin");
    const espion = psqlEspion();
    const r = reverrouiller({ base, env: espion.env });
    expect(r.code).toBe(1);
    expect(r.sortie).toMatch(/Échec : connexion ou rôle ; code de sortie 2/);
    expect(existsSync(espion.sentinelle)).toBe(true);
  });

  it("empreinte de la constante fausse", async () => {
    const yaml = readFileSync(path.join(RACINE, ".github/workflows", WF), "utf8");
    const valeur = /REVERROUILLAGE_SHA256=([0-9a-f]{64})/.exec(yaml)![1]!;
    const faux = yaml.replace(`REVERROUILLAGE_SHA256=${valeur}`, `REVERROUILLAGE_SHA256=${"0".repeat(64)}`);
    expect(faux).not.toBe(yaml);
    await refusSansConnexion({ workflow: faux }, /texte figé : empreinte différente de REVERROUILLAGE_SHA256/);
  });

  it("texte figé modifié", async () => {
    const espace = espaceTexteFige();
    const texte = readFileSync(path.join(espace, TEXTE_FIGE), "utf8");
    writeFileSync(path.join(espace, TEXTE_FIGE), `${texte}GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO vadrouille_prototype;\n`);
    await refusSansConnexion({ espace }, /texte figé : empreinte différente de REVERROUILLAGE_SHA256/);
  });

  it("texte figé absent, ou remplacé par un lien symbolique", async () => {
    const vide = dossierTemporaire("db-reverrouillage-vide-");
    await refusSansConnexion({ espace: vide }, /texte figé absent/);
    const espace = espaceTexteFige();
    const cible = path.join(dossierTemporaire("ailleurs-"), "retour-deverrouillage.sql");
    renameSync(path.join(espace, TEXTE_FIGE), cible);
    symlinkSync(cible, path.join(espace, TEXTE_FIGE));
    await refusSansConnexion({ espace }, /texte figé : lien symbolique/);
  });

  it("texte figé vide, avec octet NUL, de plus de 100 Kio, commençant par une barre oblique inverse ou nommant vadrouille_migrate. (constante égale à son empreinte)", async () => {
    const yaml = readFileSync(path.join(RACINE, ".github/workflows", WF), "utf8");
    const valeur = /REVERROUILLAGE_SHA256=([0-9a-f]{64})/.exec(yaml)![1]!;
    const cas: [string, string | Buffer, RegExp][] = [
      ["vide", "", /texte figé : fichier vide/],
      ["NUL", Buffer.from("RESET ROLE;\0RESET ROLE;\n"), /texte figé : octet NUL/],
      ["plus de 100 Kio", `RESET ROLE;\n${"-".repeat(102_400)}\n`, /texte figé : plus de 100 Kio/],
      ["barre oblique inverse", "\\! true\nRESET ROLE;\n", /texte figé : commence par une barre oblique inverse/],
      ["vadrouille_migrate.", "SET LOCAL Vadrouille_Migrate.txid = '1';\n", /texte figé : nomme un paramètre vadrouille_migrate/],
    ];
    for (const [libelle, contenu, message] of cas) {
      const espace = espaceTexteFige();
      writeFileSync(path.join(espace, TEXTE_FIGE), contenu);
      const empreinte = createHash("sha256").update(contenu).digest("hex");
      const workflow = yaml.replace(`REVERROUILLAGE_SHA256=${valeur}`, `REVERROUILLAGE_SHA256=${empreinte}`);
      expect(workflow === yaml, libelle).toBe(false);
      await refusSansConnexion({ espace, workflow }, message);
    }
  }, 60_000);

  it("sha_attendu hors forme, ou différent du commit lancé", async () => {
    await refusSansConnexion({ env: { SHA_ATTENDU: "C0FFEE".padEnd(40, "0") } }, /sha_attendu hors forme/);
    await refusSansConnexion({ env: { SHA_ATTENDU: "1".repeat(40) } }, /sha_attendu différent du commit lancé/);
  });

  it("PGHOST poolé ou hors forme, PGDATABASE hors forme : la valeur n'apparaît pas dans la sortie", async () => {
    for (const [env, message] of [
      [{ PGHOST: `ep-${SENTINELLE}-pooler.exemple.invalid` }, /PGHOST désigne l'hôte poolé/],
      [{ PGHOST: `${SENTINELLE}.Exemple` }, /PGHOST hors forme/],
      [{ PGDATABASE: `${SENTINELLE}-base` }, /PGDATABASE hors forme/],
    ] as const) {
      const sortie = await refusSansConnexion({ env }, message);
      expect(sortie).not.toContain(SENTINELLE);
    }
  });
});

describe("db-reverrouillage : verrou consultatif des migrations (0056 § 4.6 point 1)", () => {
  it("un GRANT tenu dans une transaction ouverte sous le verrou consultatif : le REVOKE attend sa fin et passe après", async () => {
    const base = await baseMigree("dr_verrou");
    const tiers = await connectBaseJetable("admin", base);
    await tiers.query("BEGIN");
    let job: ReturnType<typeof lancer> | undefined;
    try {
      await tiers.query("SELECT pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('vadrouille_migrations'))");
      await tiers.query(`GRANT EXECUTE ON FUNCTION ${SIGNATURE} TO vadrouille_prototype`);
      job = lancer(WF, ETAPE, { base });
      let enAttente = false;
      for (let i = 0; i < 50 && !enAttente; i++) {
        await new Promise((r) => setTimeout(r, 100));
        const [r] = await requeteAdmin<{ n: string }>(
          base,
          `SELECT count(*) AS n FROM pg_catalog.pg_locks l
             WHERE l.locktype = 'advisory' AND NOT l.granted
               AND l.database = (SELECT d.oid FROM pg_catalog.pg_database d WHERE d.datname = pg_catalog.current_database())`,
        );
        enAttente = r?.n === "1";
      }
      expect(enAttente, "le retrait attend le verrou consultatif").toBe(true);
      await tiers.query("COMMIT");
    } catch (erreur) {
      await tiers.query("ROLLBACK").catch(() => undefined);
      job?.arreter();
      throw erreur;
    }
    expect(await job!.fin).toBe(0);
    expect(await privileges(base)).toEqual(verrouille);
  }, 60_000);
});

describe("db-reverrouillage : dernier recours de la console Neon (0056 § 4.6 point 3)", () => {
  const ROLE = "essai_identifiant_neon";
  const NOLOGIN = "ALTER ROLE vadrouille_prototype NOLOGIN";
  const TERMINER = "SELECT pg_catalog.pg_terminate_backend(pid) FROM pg_catalog.pg_stat_activity WHERE usename = 'vadrouille_prototype'";

  const code = (promesse: Promise<unknown>) =>
    promesse.then(
      () => undefined,
      (erreur: { code?: string }) => erreur.code ?? "sans-code",
    );

  /** Rôle CREATEROLE non superutilisateur, ADMIN sur vadrouille_prototype ; la session admin le prend par SET ROLE. */
  async function scenario(base: string, avecSignal: boolean, corps: (identifiant: DbClient, prototype: DbClient) => Promise<void>): Promise<void> {
    const identifiant = await connectBaseJetable("admin", base);
    await identifiant.query(`DROP ROLE IF EXISTS ${ROLE}`);
    await identifiant.query(`CREATE ROLE ${ROLE} NOLOGIN CREATEROLE NOSUPERUSER NOBYPASSRLS`);
    try {
      await identifiant.query(`GRANT vadrouille_prototype TO ${ROLE} WITH ADMIN TRUE, INHERIT FALSE, SET FALSE`);
      if (avecSignal) await identifiant.query(`GRANT pg_signal_backend TO ${ROLE}`);
      const prototype = await connectBaseJetable("p0", base);
      prototype.on("error", () => undefined);
      await prototype.query("SELECT 1");
      await identifiant.query(`SET ROLE ${ROLE}`);
      const [r] = (await identifiant.query("SELECT current_user AS u, (SELECT rolsuper FROM pg_catalog.pg_roles WHERE rolname = current_user) AS s")).rows;
      expect(r).toEqual({ u: ROLE, s: false });
      await corps(identifiant, prototype);
    } finally {
      await identifiant.query("RESET ROLE");
      await identifiant.query("ALTER ROLE vadrouille_prototype LOGIN");
      await identifiant.query(`DROP ROLE ${ROLE}`);
    }
  }

  it("avec pg_signal_backend : la commande coupe la connexion de vadrouille_prototype et refuse les nouvelles", async () => {
    const base = await creerBase("dr_signal");
    await scenario(base, true, async (identifiant, prototype) => {
      await identifiant.query(NOLOGIN);
      const termines = (await identifiant.query(TERMINER)).rows as { pg_terminate_backend: boolean }[];
      expect(termines.length).toBeGreaterThan(0);
      expect(termines.every((t) => t.pg_terminate_backend)).toBe(true);
      expect(await code(prototype.query("SELECT 1"))).toBeDefined();
      expect(await code(connectBaseJetable("p0", base))).toBe("28000");
    });
  });

  it("sans pg_signal_backend : la coupure des sessions est refusée (42501) ; ALTER ROLE NOLOGIN seul refuse les nouvelles connexions, la session ouverte continue", async () => {
    const base = await creerBase("dr_sans_signal");
    await scenario(base, false, async (identifiant, prototype) => {
      await identifiant.query(NOLOGIN);
      expect(await code(identifiant.query(TERMINER))).toBe("42501");
      expect(await code(prototype.query("SELECT 1"))).toBeUndefined();
      expect(await code(connectBaseJetable("p0", base))).toBe("28000");
    });
  });
});
