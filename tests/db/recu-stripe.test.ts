import { readFileSync } from "node:fs";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { runMigrations } from "../../db/migrate";
import { urlBaseJetable } from "./env";
import { attempt, closeAll, connect, connectBaseJetable, createOrg, type DbClient, inTx } from "./helpers";
import { creerBase, supprimerBases } from "./workflows-harnais";

/**
 * Migration 0025_recu_stripe (B4e, partie `data`, ticket 887 ; décision 0144 § 5.2, conditions de la Sécurité, et
 * § 5.4, tests de base attendus). `checkouts.stripe_receipt_url` : `CHECK` du motif de la Sécurité (et refus de `..`,
 * `%2e%2e`, plus de 2048 caractères), écriture unique et jamais à l'insertion (déclencheur `checkouts_receipt_once`, pour
 * tout rôle), `UPDATE` de la colonne à `vadrouille_webhook` seul, isolation entre organisations (RLS de 0001), purge,
 * aller-retour de la migration sur une base jetable.
 *
 * L'insertion non nulle étant refusée pour tout rôle, une valeur s'obtient comme la tâche `back` l'écrira : ligne
 * insérée à `NULL` par `vadrouille_app`, puis `UPDATE` sous `vadrouille_webhook`, organisation positionnée (0144 § 5.4).
 */

type Orga = { org: string; owner: string; trip: string; checkout: string };

const RECU = "https://pay.stripe.com/receipts/payment/CAcaFwoVYWNjdF8xVGVzdEV4ZW1wbGUwMDAwKKCw_pi_3TestExemple";
const RECU_REQUETE = `${RECU}?s=ap`;
const ECRIRE = "UPDATE checkouts SET stripe_receipt_url = $1 WHERE id = $2";
const INSERT_CHECKOUT =
  "INSERT INTO checkouts (organization_id, trip_id, request_id, price_variant, amount_cents, currency, method, created_by) VALUES ($1, $2, gen_random_uuid(), 'chf_29', 2900, 'CHF', 'twint', $3) RETURNING id";
const INSERT_CHECKOUT_AVEC_RECU =
  "INSERT INTO checkouts (organization_id, trip_id, request_id, price_variant, amount_cents, currency, method, created_by, stripe_receipt_url) VALUES ($1, $2, gen_random_uuid(), 'chf_29', 2900, 'CHF', 'card', $3, $4)";
const MESSAGE_INSERTION = "checkouts : stripe_receipt_url refusé à l'insertion";
const MESSAGE_REECRITURE = "checkouts : stripe_receipt_url déjà écrit";

let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let a: Orga;
let b: Orga;
const ctx = (o: Orga) => ({ org: o.org, user: o.owner });

/** Organisation, voyage et paiement (colonne `NULL`), écrits par `vadrouille_auth` puis `vadrouille_app`. */
async function organisation(appClient: DbClient, authClient: DbClient): Promise<Orga> {
  const base = await createOrg(authClient);
  return inTx(appClient, { org: base.org, user: base.owner }, async (c) => {
    const trip = (
      await c.query(
        "INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, time_zone) VALUES ($1, $2, gen_random_uuid(), 'Édimbourg', '2027-05-01', '2027-05-06', 2, 'Europe/London') RETURNING id",
        [base.org, base.owner],
      )
    ).rows[0].id as string;
    const checkout = (await c.query(INSERT_CHECKOUT, [base.org, trip, base.owner])).rows[0].id as string;
    return { org: base.org, owner: base.owner, trip, checkout };
  });
}

/** Un second paiement (colonne `NULL`) sur le voyage de `o`. */
async function paiement(appClient: DbClient, o: Orga): Promise<string> {
  return inTx(appClient, ctx(o), async (c) => (await c.query(INSERT_CHECKOUT, [o.org, o.trip, o.owner])).rows[0].id as string);
}

/** Erreur Postgres (code et message) d'une instruction, dans un point de sauvegarde ; `{}` si elle passe. */
async function erreur(c: DbClient, sql: string, params: unknown[] = []): Promise<{ code?: string; message?: string; rowCount?: number | null }> {
  await c.query("SAVEPOINT essai");
  try {
    const r = await c.query(sql, params);
    await c.query("RELEASE SAVEPOINT essai");
    return { rowCount: r.rowCount };
  } catch (e) {
    await c.query("ROLLBACK TO SAVEPOINT essai");
    return { code: (e as { code?: string }).code, message: (e as { message?: string }).message };
  }
}

/** Écriture du lien sous `vadrouille_webhook` dans le contexte `contexte`, validée ; code d'erreur ou nombre de lignes. */
async function ecrire(contexte: { org?: string }, checkout: string, url: string | null, client: DbClient = app) {
  return inTx(client, contexte, async (c) => attempt(c, ECRIRE, [url, checkout]), "vadrouille_webhook");
}

/** Même écriture, annulée à la fin (essais de la contrainte sur une même ligne). */
async function essayer(o: Orga, checkout: string, url: string): Promise<{ code?: string; rowCount: number | null }> {
  await app.query("BEGIN");
  try {
    await app.query("SET LOCAL ROLE vadrouille_webhook");
    await app.query("SELECT set_config('app.organization_id', $1, true)", [o.org]);
    return await attempt(app, ECRIRE, [url, checkout]);
  } finally {
    await app.query("ROLLBACK");
  }
}

/** Valeur de la colonne vue par `vadrouille_app` dans le contexte de `o` (`undefined` : ligne invisible). */
async function lu(o: Orga, checkout: string): Promise<string | null | undefined> {
  return inTx(app, ctx(o), async (c) => {
    const { rows } = await c.query("SELECT stripe_receipt_url FROM checkouts WHERE id = $1", [checkout]);
    return rows.length === 0 ? undefined : (rows[0].stripe_receipt_url as string | null);
  });
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
  admin = await connect("admin");
  a = await organisation(app, auth);
  b = await organisation(app, auth);
  expect(await ecrire({ org: a.org }, a.checkout, RECU)).toEqual({ rowCount: 1 });
  expect(await ecrire({ org: b.org }, b.checkout, RECU_REQUETE)).toEqual({ rowCount: 1 });
});

afterAll(async () => {
  await closeAll();
  await supprimerBases();
});

describe("reçu Stripe (0025) : forme", () => {
  it("colonne text nullable ; contrainte, déclencheur ordinaire et fonction de vadrouille_owner (SECURITY INVOKER, search_path fixé)", async () => {
    const colonne = await admin.query(
      "SELECT data_type AS type, is_nullable AS nul, column_default AS defaut FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'checkouts' AND column_name = 'stripe_receipt_url'",
    );
    expect(colonne.rows).toEqual([{ type: "text", nul: "YES", defaut: null }]);
    const contrainte = await admin.query(
      "SELECT pg_catalog.pg_get_constraintdef(oid) AS def FROM pg_catalog.pg_constraint WHERE conrelid = 'public.checkouts'::regclass AND conname = 'checkouts_stripe_receipt_url_check'",
    );
    expect(contrainte.rows).toHaveLength(1);
    expect(contrainte.rows[0].def).toContain("'^https://pay\\.stripe\\.com/receipts/[A-Za-z0-9_%./~-]+(\\?[A-Za-z0-9_%=&.~-]*)?$'");
    const declencheur = await admin.query(
      `SELECT t.tgenabled AS mode, pg_catalog.pg_get_triggerdef(t.oid) AS def, pg_catalog.pg_get_userbyid(p.proowner) AS proprietaire,
              p.prosecdef AS definer, p.proconfig::text[] AS config
       FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_proc p ON p.oid = t.tgfoid
       WHERE t.tgrelid = 'public.checkouts'::regclass AND t.tgname = 'checkouts_receipt_once'`,
    );
    expect(declencheur.rows).toEqual([
      {
        mode: "O",
        def: "CREATE TRIGGER checkouts_receipt_once BEFORE INSERT OR UPDATE OF stripe_receipt_url ON public.checkouts FOR EACH ROW EXECUTE FUNCTION checkouts_receipt_once()",
        proprietaire: "vadrouille_owner",
        definer: false,
        config: ["search_path=pg_catalog, pg_temp"],
      },
    ]);
  });
});

describe("reçu Stripe (0025) : lien hors préfixe refusé par la contrainte (0144 § 5.4)", () => {
  const REFUSES: ReadonlyArray<readonly [string, string]> = [
    ["http", "http://pay.stripe.com/receipts/x"],
    ["hôte prolongé", "https://pay.stripe.com.example/receipts/x"],
    ["autre hôte", "https://checkout.stripe.com/receipts/x"],
    ["préfixe collé", "https://pay.stripe.com/receiptsx"],
    ["chemin vide", "https://pay.stripe.com/receipts/"],
    ["hôte en majuscules", "https://PAY.STRIPE.COM/receipts/x"],
    ["schéma en majuscules", "HTTPS://pay.stripe.com/receipts/x"],
    ["remontée", "https://pay.stripe.com/receipts/../x"],
    ["remontée encodée", "https://pay.stripe.com/receipts/%2e%2e/x"],
    ["remontée encodée, majuscules", "https://pay.stripe.com/receipts/%2E%2E/x"],
    ["remontée mi-encodée", "https://pay.stripe.com/receipts/.%2e/x"],
    ["remontée mi-encodée (2)", "https://pay.stripe.com/receipts/%2E./x"],
    ["javascript", "javascript:alert(1)"],
    ["espace", "https://pay.stripe.com/receipts/a b"],
    ["fragment", "https://pay.stripe.com/receipts/x#fragment"],
    ["identifiants", "https://u@pay.stripe.com/receipts/x"],
    ["port", "https://pay.stripe.com:443/receipts/x"],
    ["fin de ligne", "https://pay.stripe.com/receipts/x\n"],
    ["chaîne vide", ""],
    ["2049 caractères", `https://pay.stripe.com/receipts/${"a".repeat(2049 - "https://pay.stripe.com/receipts/".length)}`],
  ];

  it.each(REFUSES)("%s : 23514, rien n'est écrit", async (_nom, url) => {
    const checkout = await paiement(app, a);
    expect(await essayer(a, checkout, url)).toEqual({ code: "23514", rowCount: null });
    expect(await lu(a, checkout)).toBeNull();
  });

  it("forme conforme admise, avec et sans requête, jusqu'à 2048 caractères", async () => {
    const checkout = await paiement(app, a);
    const long = `https://pay.stripe.com/receipts/${"a".repeat(2048 - "https://pay.stripe.com/receipts/".length)}`;
    expect(long).toHaveLength(2048);
    for (const url of [RECU, RECU_REQUETE, long, "https://pay.stripe.com/receipts/a.b~c_d-e%20f/g?h=i&j=k.l~m"]) {
      expect(await essayer(a, checkout, url), url).toEqual({ rowCount: 1 });
    }
  });
});

describe("reçu Stripe (0025) : jamais à l'insertion (0144 § 5.3 point 1, exigé)", () => {
  it("INSERT non nul refusé pour vadrouille_app (42501, message sans la valeur) ; INSERT NULL admis (parcours de createCheckout)", async () => {
    const r = await inTx(app, ctx(a), (c) => erreur(c, INSERT_CHECKOUT_AVEC_RECU, [a.org, a.trip, a.owner, RECU]));
    expect(r.code).toBe("42501");
    expect(r.message).toBe(MESSAGE_INSERTION);
    const nul = await inTx(app, ctx(a), (c) => erreur(c, INSERT_CHECKOUT_AVEC_RECU, [a.org, a.trip, a.owner, null]));
    expect(nul).toEqual({ rowCount: 1 });
  });

  it("INSERT non nul refusé pour le propriétaire des migrations et pour l'administration (le déclencheur vaut pour tout rôle)", async () => {
    const migrateur = await connect("migrator");
    await migrateur.query("BEGIN");
    try {
      await migrateur.query("SET LOCAL ROLE vadrouille_owner");
      const r = await erreur(migrateur, INSERT_CHECKOUT_AVEC_RECU, [a.org, a.trip, a.owner, RECU]);
      expect(r.code).toBe("42501");
      expect(r.message).toBe(MESSAGE_INSERTION);
    } finally {
      await migrateur.query("ROLLBACK");
    }
    await admin.query("BEGIN");
    try {
      const r = await erreur(admin, INSERT_CHECKOUT_AVEC_RECU.replace("INTO checkouts", "INTO public.checkouts"), [a.org, a.trip, a.owner, RECU]);
      expect(r.code).toBe("42501");
      expect(r.message).toBe(MESSAGE_INSERTION);
    } finally {
      await admin.query("ROLLBACK");
    }
  });
});

describe("reçu Stripe (0025) : écriture unique (0144 § 5.4)", () => {
  it("première écriture admise ; remplacement et remise à NULL refusés (42501) ; la même valeur ne change rien", async () => {
    const checkout = await paiement(app, a);
    expect(await ecrire({ org: a.org }, checkout, RECU)).toEqual({ rowCount: 1 });
    for (const url of [RECU_REQUETE, null]) {
      const r = await inTx(app, { org: a.org }, (c) => erreur(c, ECRIRE, [url, checkout]), "vadrouille_webhook");
      expect(r.code, String(url)).toBe("42501");
      expect(r.message).toBe(MESSAGE_REECRITURE);
    }
    expect(await ecrire({ org: a.org }, checkout, RECU)).toEqual({ rowCount: 1 });
    expect(await lu(a, checkout)).toBe(RECU);
  });

  it("forme de la tâche back (`… WHERE stripe_receipt_url IS NULL`) : une ligne la première fois, aucune ensuite", async () => {
    const checkout = await paiement(app, a);
    const sql = "UPDATE checkouts SET stripe_receipt_url = $1 WHERE id = $2 AND stripe_receipt_url IS NULL";
    const fois = async (url: string) => inTx(app, { org: a.org }, async (c) => attempt(c, sql, [url, checkout]), "vadrouille_webhook");
    expect(await fois(RECU)).toEqual({ rowCount: 1 });
    expect(await fois(RECU_REQUETE)).toEqual({ rowCount: 0 });
    expect(await lu(a, checkout)).toBe(RECU);
  });

  it("le déclencheur vaut aussi pour l'administration : remplacement et remise à NULL refusés", async () => {
    await admin.query("BEGIN");
    try {
      for (const url of [RECU_REQUETE, null]) {
        expect((await attempt(admin, "UPDATE public.checkouts SET stripe_receipt_url = $1 WHERE id = $2", [url, a.checkout])).code, String(url)).toBe("42501");
      }
    } finally {
      await admin.query("ROLLBACK");
    }
    expect(await lu(a, a.checkout)).toBe(RECU);
  });
});

describe("reçu Stripe (0025) : droit de colonne (0144 § 5.4)", () => {
  it("UPDATE par vadrouille_app refusé (42501), même sur une colonne nulle ; rien n'est écrit", async () => {
    const checkout = await paiement(app, a);
    const r = await inTx(app, ctx(a), (c) => erreur(c, ECRIRE, [RECU, checkout]));
    expect(r.code).toBe("42501");
    expect(r.message).toMatch(/permission denied/);
    expect(await lu(a, checkout)).toBeNull();
  });

  it("UPDATE de la colonne : vadrouille_webhook seul parmi les rôles du studio ; aucun droit des rôles vadrouille_fn_* sur la colonne", async () => {
    const { rows } = await admin.query(
      `SELECT r.rolname,
              pg_catalog.has_column_privilege(r.oid, 'public.checkouts', 'stripe_receipt_url', 'UPDATE') AS maj,
              pg_catalog.has_column_privilege(r.oid, 'public.checkouts', 'stripe_receipt_url', 'SELECT')
                OR pg_catalog.has_column_privilege(r.oid, 'public.checkouts', 'stripe_receipt_url', 'INSERT')
                OR pg_catalog.has_column_privilege(r.oid, 'public.checkouts', 'stripe_receipt_url', 'REFERENCES') AS autre
       FROM pg_catalog.pg_roles r WHERE r.rolname LIKE 'vadrouille\\_%' ORDER BY r.rolname`,
    );
    // vadrouille_owner, propriétaire de la table, a tous les droits, et vadrouille_migrator les voit par son appartenance
    // (cadre des migrations, décision 0007) ; hors de ces deux rôles, seul le webhook met à jour.
    expect(rows.filter((r) => r.maj).map((r) => r.rolname)).toEqual(["vadrouille_migrator", "vadrouille_owner", "vadrouille_webhook"]);
    // Droits écrits sur la colonne elle-même : UPDATE à vadrouille_webhook, rien d'autre.
    const acl = await admin.query(
      `SELECT pg_catalog.pg_get_userbyid(x.grantee) AS role, x.privilege_type AS droit
       FROM pg_catalog.pg_attribute a, LATERAL pg_catalog.aclexplode(a.attacl) x
       WHERE a.attrelid = 'public.checkouts'::regclass AND a.attname = 'stripe_receipt_url'`,
    );
    expect(acl.rows).toEqual([{ role: "vadrouille_webhook", droit: "UPDATE" }]);
    // Droit de table : aucun UPDATE de table hors du propriétaire (un UPDATE de table couvrirait la colonne).
    const table = await admin.query(
      `SELECT pg_catalog.pg_get_userbyid(x.grantee) AS role FROM pg_catalog.pg_class c, LATERAL pg_catalog.aclexplode(c.relacl) x
       WHERE c.oid = 'public.checkouts'::regclass AND x.privilege_type = 'UPDATE'`,
    );
    expect(table.rows.map((r) => r.role)).toEqual(["vadrouille_owner"]);
    const fonctions = rows.filter((r) => String(r.rolname).startsWith("vadrouille_fn_"));
    expect(fonctions.length).toBeGreaterThan(0);
    for (const r of fonctions) expect({ role: r.rolname, maj: r.maj, autre: r.autre }).toEqual({ role: r.rolname, maj: false, autre: false });
  });
});

describe("reçu Stripe (0025) : isolation entre organisations (0144 § 5.4)", () => {
  it("vadrouille_app : chaque organisation lit son lien, jamais celui de l'autre ; sans contexte, aucune ligne", async () => {
    expect(await lu(a, a.checkout)).toBe(RECU);
    expect(await lu(b, b.checkout)).toBe(RECU_REQUETE);
    expect(await lu(a, b.checkout)).toBeUndefined();
    expect(await lu(b, a.checkout)).toBeUndefined();
    const sansContexte = await inTx(app, {}, async (c) => (await c.query("SELECT count(*)::int AS n FROM checkouts WHERE stripe_receipt_url IS NOT NULL")).rows[0].n);
    expect(sansContexte).toBe(0);
  });

  it("vadrouille_webhook : écriture dans une autre organisation sans effet ; sans organisation positionnée, 0 ligne", async () => {
    const cibleB = await paiement(app, b);
    expect(await ecrire({ org: a.org }, cibleB, RECU)).toEqual({ rowCount: 0 });
    expect(await ecrire({}, cibleB, RECU)).toEqual({ rowCount: 0 });
    expect(await lu(b, cibleB)).toBeNull();
    const lecture = await inTx(app, { org: a.org }, async (c) => (await c.query("SELECT count(*)::int AS n FROM checkouts WHERE id = $1", [cibleB])).rows[0].n, "vadrouille_webhook");
    expect(lecture).toBe(0);
  });
});

describe("reçu Stripe (0025) : purge (0144 § 5.3 point 8)", () => {
  it("la purge du compte efface les paiements de l'organisation, lien non nul compris ; l'autre organisation garde le sien", async () => {
    const o = await organisation(app, auth);
    expect(await ecrire({ org: o.org }, o.checkout, RECU)).toEqual({ rowCount: 1 });
    expect(await lu(o, o.checkout)).toBe(RECU);
    await inTx(app, ctx(o), (c) => c.query("SELECT purge_organization_data($1)", [o.org]), "vadrouille_account_admin");
    const reste = await admin.query("SELECT count(*)::int AS n FROM public.checkouts WHERE organization_id = $1", [o.org]);
    expect(reste.rows[0].n).toBe(0);
    expect(await lu(b, b.checkout)).toBe(RECU_REQUETE);
  });
});

const UP_0025 = readFileSync(path.join(process.cwd(), "db/migrations/0025_recu_stripe.sql"), "utf8");
const DOWN_0025 = readFileSync(path.join(process.cwd(), "db/migrations/0025_recu_stripe.down.sql"), "utf8");

describe("0025 : aller-retour (base jetable ; 0144 § 5.3 point 1)", () => {
  it("montée, descente (déclencheur, fonction et colonne retirés, lignes gardées), puis texte de 0025 rejoué", async () => {
    const nom = await creerBase("recu_stripe_retour");
    await runMigrations({ VADROUILLE_DATABASE_URL_MIGRATOR: urlBaseJetable("migrator", nom) });
    const [appJ, authJ, adminJ, migrateur] = await Promise.all([
      connectBaseJetable("app", nom),
      connectBaseJetable("auth", nom),
      connectBaseJetable("admin", nom),
      connectBaseJetable("migrator", nom),
    ]);
    const o = await organisation(appJ, authJ);
    expect(await ecrire({ org: o.org }, o.checkout, RECU, appJ)).toEqual({ rowCount: 1 });
    const etat = async () =>
      (
        await adminJ.query(
          `SELECT (SELECT count(*)::int FROM pg_catalog.pg_attribute WHERE attrelid = 'public.checkouts'::regclass AND attname = 'stripe_receipt_url' AND NOT attisdropped) AS colonne,
                  (SELECT count(*)::int FROM pg_catalog.pg_constraint WHERE conname = 'checkouts_stripe_receipt_url_check') AS contrainte,
                  (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'checkouts_receipt_once') AS declencheur,
                  pg_catalog.to_regprocedure('public.checkouts_receipt_once()') IS NOT NULL AS fonction,
                  (SELECT count(*)::int FROM pg_catalog.pg_trigger WHERE tgname = 'checkouts_session_once') AS session_once,
                  (SELECT count(*)::int FROM public.checkouts WHERE organization_id = $1) AS lignes`,
          [o.org],
        )
      ).rows[0];
    const monte = { colonne: 1, contrainte: 1, declencheur: 1, fonction: true, session_once: 1, lignes: 1 };
    expect(await etat()).toEqual(monte);

    await migrateur.query("BEGIN");
    await migrateur.query(DOWN_0025);
    expect((await migrateur.query("SELECT current_user::text AS u")).rows[0].u).toBe("vadrouille_migrator");
    await migrateur.query("COMMIT");
    expect(await etat()).toEqual({ colonne: 0, contrainte: 0, declencheur: 0, fonction: false, session_once: 1, lignes: 1 });
    // Droits de 0001 inchangés pour vadrouille_webhook : status et updated_at seulement.
    const droits = await adminJ.query(
      `SELECT a.attname FROM pg_catalog.pg_attribute a WHERE a.attrelid = 'public.checkouts'::regclass AND a.attnum > 0 AND NOT a.attisdropped
         AND pg_catalog.has_column_privilege('vadrouille_webhook', a.attrelid, a.attnum, 'UPDATE') ORDER BY 1`,
    );
    expect(droits.rows.map((r) => r.attname)).toEqual(["status", "updated_at"]);

    await migrateur.query("BEGIN");
    await migrateur.query(UP_0025);
    await migrateur.query("COMMIT");
    expect(await etat()).toEqual(monte);
    expect(await ecrire({ org: o.org }, o.checkout, RECU, appJ)).toEqual({ rowCount: 1 });
    expect((await ecrire({ org: o.org }, o.checkout, RECU_REQUETE, appJ)).code).toBe("42501");
  });
});
