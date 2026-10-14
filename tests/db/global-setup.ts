import pg from "pg";

import { baseDeverrouillee, DB_ENV, type Login, productionGuardActive, readUrl, urlDeverrouillee } from "./env";

/**
 * Préalable de `pnpm test:db` (décision 0006, convention 6) : sans base joignable, les tests de base échouent avec
 * un message explicite ; ils ne sont jamais ignorés en silence. Le message ne contient aucune chaîne de connexion.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  if (productionGuardActive()) {
    throw new Error(
      "pnpm test:db : connexion à la base refusée par la garde de production (décision 0034 ; VERCEL_ENV ou VADROUILLE_ENV vaut « production »). " +
        "Les tests de base ne tournent jamais en production.",
    );
  }
  const logins = Object.keys(DB_ENV) as Login[];
  const missing = logins.filter((login) => !readUrl(login)).map((login) => DB_ENV[login]);
  if (missing.length > 0) {
    throw new Error(
      `pnpm test:db : base de test non configurée (variables absentes : ${missing.join(", ")}). ` +
        "Les tests de base font foi en CI, job « db » (décision B1-PO-1) ; voir db/README.md.",
    );
  }
  for (const login of logins) {
    const name = DB_ENV[login];
    const client = new pg.Client({ connectionString: readUrl(login), connectionTimeoutMillis: 5_000 });
    try {
      await client.connect();
      await client.query("SELECT 1");
    } catch (error) {
      const code = (error as { code?: string }).code ?? "inconnu";
      throw new Error(
        `pnpm test:db : base de test injoignable (connexion « ${login} », variable ${name}, code ${code}). ` +
          "Démarre la base (docker compose up db), amorce les rôles et applique les migrations (db/README.md) ; en CI, job « db ».",
      );
    } finally {
      await client.end().catch(() => undefined);
    }
  }
  await preparerBaseDeverrouillee();
  return supprimerBaseDeverrouillee;
}

/** Identifiant déjà vérifié par `baseDeverrouillee` (`^[a-z0-9_]{1,63}$`), entre guillemets doubles. */
const ident = (nom: string) => `"${nom}"`;

async function avecAdmin<T>(url: string, fn: (client: pg.Client) => Promise<T>): Promise<T> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 5_000 });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.end().catch(() => undefined);
  }
}

/** Droits de connexion d'une base, sans le concédant : `rôle:droit`, triés (PUBLIC pour l'oid 0). */
const SQL_DROITS_BASE = `SELECT COALESCE(NULLIF(a.grantee, 0)::regrole::text, 'PUBLIC') || ':' || a.privilege_type AS droit
  FROM pg_catalog.pg_database d, LATERAL pg_catalog.aclexplode(COALESCE(d.datacl, pg_catalog.acldefault('d', d.datdba))) a
  WHERE d.datname = $1 ORDER BY 1`;

/**
 * Harnais des tests sous verrou (décision 0052 § 1, option (b)) : après les migrations (appliquées avant
 * `pnpm test:db`) et avant tout test, copie de la base migrée en `<base>_dv` par `CREATE DATABASE … TEMPLATE`, sous
 * l'administrateur de la base de service (superutilisateur du conteneur en CI). La copie reprend les objets, pas les
 * droits de la base elle-même : le harnais réapplique le bloc final de `db/bootstrap/roles.sql` (CONNECT des rôles de
 * connexion, CREATE à `vadrouille_owner`) et vérifie que les droits de la copie égalent ceux du modèle ; un réglage
 * `ALTER DATABASE … SET` ou `ALTER ROLE … IN DATABASE … SET` du modèle (aucun aujourd'hui) arrête le préalable, le
 * harnais ne sachant pas encore le reporter. Puis, sur la copie seulement, `GRANT EXECUTE` de la fonction à quatre
 * paramètres à `vadrouille_prototype`. La base migrée garde le verrou S8 : le test de verrou y tourne.
 */
async function preparerBaseDeverrouillee(): Promise<void> {
  const adminUrl = readUrl("admin");
  const adminCopie = urlDeverrouillee("admin");
  if (adminUrl === undefined || adminCopie === undefined) throw new Error("pnpm test:db : adresse d'administration absente (seconde base jetable).");
  const { modele, nom } = baseDeverrouillee(adminUrl);
  const droitsModele = await avecAdmin(adminUrl, async (client) => {
    const reglages = await client.query("SELECT count(*) AS n FROM pg_catalog.pg_db_role_setting s JOIN pg_catalog.pg_database d ON d.oid = s.setdatabase WHERE d.datname = $1", [modele]);
    if (Number(reglages.rows[0].n) !== 0) throw new Error("pnpm test:db : la base migrée porte un réglage par base ; le harnais de la seconde base doit le reporter (0052 § 1).");
    await client.query(`DROP DATABASE IF EXISTS ${ident(nom)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${ident(nom)} TEMPLATE ${ident(modele)}`);
    return (await client.query(SQL_DROITS_BASE, [modele])).rows.map((r) => r.droit as string);
  });
  await avecAdmin(adminCopie, async (client) => {
    await client.query(`GRANT CONNECT ON DATABASE ${ident(nom)} TO vadrouille_migrator, vadrouille_app, vadrouille_auth, vadrouille_prototype, vadrouille_prototype_purge`);
    await client.query(`GRANT CREATE ON DATABASE ${ident(nom)} TO vadrouille_owner`);
    const droitsCopie = (await client.query(SQL_DROITS_BASE, [nom])).rows.map((r) => r.droit as string);
    if (JSON.stringify(droitsCopie) !== JSON.stringify(droitsModele)) {
      throw new Error("pnpm test:db : droits de la seconde base différents de ceux de la base migrée (0052 § 1) ; voir db/bootstrap/roles.sql.");
    }
    await client.query("GRANT EXECUTE ON FUNCTION public.store_prototype_coordinates(uuid, text, double precision, double precision) TO vadrouille_prototype");
  });
}

/** Retrait de la seconde base à la fin de `pnpm test:db` (connexions restantes coupées). */
async function supprimerBaseDeverrouillee(): Promise<void> {
  const adminUrl = readUrl("admin");
  if (adminUrl === undefined) return;
  const { nom } = baseDeverrouillee(adminUrl);
  await avecAdmin(adminUrl, (client) => client.query(`DROP DATABASE IF EXISTS ${ident(nom)} WITH (FORCE)`));
}
