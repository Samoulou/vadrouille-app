import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { lireBriefSaisi } from "@/adapters/prototype-travail";
import { identifiantVoyageSaisi } from "@/domain/identifiant";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";
import { lireBriefArrete, lireEtatVoyageSaisi } from "@/server/p0/creation-essai";
import type { Forfait, LimitesForfait } from "@/server/usage/forfait";
import { type ClientSql, type PoolSql, type ReglesForfait, reserverExecution } from "@/server/usage/neon";

import { attempt, closeAll, connect, createOrg, type DbClient, expectRefused, inTx, type Org, poserExecution } from "./helpers";

/**
 * Brief saisi dans l'app, lié à une exécution du prototype (spécification E2E-essai, lot 3, critère 2 ; décision 0125
 * § 1 ; migration 0017_brief_saisi_prototype). Chaque test se connecte avec le rôle qu'il éprouve ; l'administration ne
 * pose que des lignes datées ou expirées (déclencheurs désactivés pour sa seule transaction).
 */

const TABLE = "prototype.run_briefs";
const SHA = "c".repeat(40);
const BRIEF = {
  schema: 1,
  destination: "Rome",
  pays: "Italie",
  fuseau: "Europe/Rome",
  arrivee: "2027-05-04",
  depart: "2027-05-08",
  heureArrivee: "09:00",
  heureDepart: "22:30",
  voyageurs: { adultes: 2, enfants: 0 },
  rythme: "equilibre",
  envies: ["heritage"],
  deplacements: ["walk", "transit"],
  logements: [{ texte: "Rome", nuits: 4 }],
  recit: "On aime la Rome antique.",
};
/** Clés de premier niveau de `BriefSchema` (`src/prototype/brief.ts`), celles que la contrainte admet. */
const CLES_BRIEF = ["schema", "destination", "pays", "fuseau", "arrivee", "depart", "heureArrivee", "heureDepart", "voyageurs", "rythme", "envies", "aEviter", "deplacements", "budgetRepas", "logements", "engagements", "recit"];

const FORFAIT: Forfait = {
  nature: "execution",
  textSearchRequetes: 1,
  placeDetailsRequetes: 1,
  routesRequetes: 1,
  routesElements: 1,
  coutGoogleMicros: 1,
  coutModelesMicros: 1,
};
const LARGES: LimitesForfait = {
  quotaJourParMethode: 1_000_000_000,
  moisGoogleMicros: Number.MAX_SAFE_INTEGER,
  enveloppeGoogleMicros: Number.MAX_SAFE_INTEGER,
  moisModelesMicros: Number.MAX_SAFE_INTEGER,
  enveloppeModelesMicros: Number.MAX_SAFE_INTEGER,
};
const REGLES: ReglesForfait = { limites: LARGES, uniteQuotaRoutes: "requetes", dureeMaxMs: 900_000 };

let admin: DbClient;
let app: DbClient;
let proto: DbClient;
let purge: DbClient;
let a: Org;

beforeAll(async () => {
  admin = await connect("admin");
  app = await connect("app");
  proto = await connect("p0");
  purge = await connect("p0_purge");
  a = await createOrg(await connect("auth"));
});

afterAll(closeAll);

const compter = async (sql: string, params: unknown[] = []) => Number((await admin.query(sql, params)).rows[0].n);

/** Pool réel : une connexion `vadrouille_prototype` par transaction, fermée à la libération. */
const poolReel: PoolSql = {
  connect: async () => {
    const client = await connect("p0");
    return { query: (texte, valeurs) => client.query(texte, valeurs as unknown[] | undefined), release: () => void client.end() };
  },
};

/** Pool d'une connexion de test. */
function pool(client: DbClient): PoolSql {
  return {
    connect: async (): Promise<ClientSql> => ({
      query: async (texte, valeurs) => client.query(texte, valeurs ? [...valeurs] : undefined),
      release: () => undefined,
    }),
  };
}

const lancerSaisi = (requestId: string, contenu: unknown = BRIEF) =>
  reserverExecution(poolReel, { mode: "essai", brief: "saisi", variant: "A", commitSha: SHA, forfait: FORFAIT, briefSaisi: { requestId, contenu } }, REGLES);

/** Exécution `saisi` et son brief posés par l'administration (validés), statut et expiration voulus. */
async function poserSaisi(options: { statut?: "en_cours" | "programme_ecrit" | "arretee"; expire?: boolean; organisation?: string } = {}): Promise<{ run: string; brief: string }> {
  await admin.query("BEGIN");
  try {
    const run = await poserExecution(admin, { organisation: options.organisation ?? PROTOTYPE_ORG_ID, statut: options.statut ?? "en_cours" });
    await admin.query("SET LOCAL session_replication_role = replica");
    await admin.query("UPDATE prototype.runs SET brief = 'saisi', mode = 'essai' WHERE id = $1", [run]);
    const expires = options.expire ? "pg_catalog.now() - interval '1 hour'" : "pg_catalog.now() + interval '1 day'";
    const brief = (
      await admin.query(`INSERT INTO ${TABLE} (organization_id, run_id, request_id, brief, expires_at) VALUES ($1, $2, $3, $4, ${expires}) RETURNING id`, [
        options.organisation ?? PROTOTYPE_ORG_ID,
        run,
        randomUUID(),
        JSON.stringify(BRIEF),
      ])
    ).rows[0].id as string;
    await admin.query("COMMIT");
    return { run, brief };
  } catch (error) {
    await admin.query("ROLLBACK");
    throw error;
  }
}

describe("p0: brief saisi, une exécution porte un fichier ou un brief saisi (0125 § 1)", () => {
  it("contrainte : clés de BriefSchema seulement, objet, 16 Kio au plus (23514) ; une ligne par exécution", async () => {
    await proto.query("BEGIN");
    try {
      const executionSaisi = async () => (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'saisi', 'A', $1) RETURNING id", [SHA])).rows[0].id as string;
      const inserer = (run: string, contenu: unknown) => attempt(proto, `INSERT INTO ${TABLE} (run_id, request_id, brief) VALUES ($1, $2, $3)`, [run, randomUUID(), JSON.stringify(contenu)]);
      for (const [libelle, contenu] of [
        ["clé inconnue", { ...BRIEF, placeId: "x" }],
        ["clé limits", { ...BRIEF, limits: [] }],
        ["tableau", [BRIEF]],
        ["texte", "Rome"],
        ["taille excessive", { ...BRIEF, recit: "😀".repeat(5000) }],
      ] as const) {
        expect((await inserer(await executionSaisi(), contenu)).code, libelle).toBe("23514");
      }
      // `aEviter` admise depuis 0018_brief_saisi_a_eviter (E2E-essai, lot 5).
      const toutes = { ...BRIEF, budgetRepas: 2, engagements: [], aEviter: ["nightlife"] };
      expect(Object.keys(toutes).sort()).toEqual([...CLES_BRIEF].sort());
      const run = await executionSaisi();
      expect((await inserer(run, toutes)).code).toBeUndefined();
      expect((await inserer(run, BRIEF)).code).toBe("23505");
      // Valeurs posées par la base (S1) : identifiant, organisation, expiration = début + 29 jours.
      const { rows } = await proto.query(
        `SELECT b.organization_id::text AS org, b.expires_at = r.started_at + interval '29 days' AS expiration FROM ${TABLE} b JOIN prototype.runs r ON r.id = b.run_id WHERE b.run_id = $1`,
        [run],
      );
      expect(rows).toEqual([{ org: PROTOTYPE_ORG_ID, expiration: true }]);
    } finally {
      await proto.query("ROLLBACK");
    }
  });

  it("jamais les deux : un brief saisi pour une exécution à fichier, terminée ou inconnue est refusé (23503) ; un autre marqueur, refusé (23514)", async () => {
    await proto.query("BEGIN");
    try {
      const fichier = (await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'rome-1.json', 'A', $1) RETURNING id", [SHA])).rows[0].id as string;
      expect((await attempt(proto, `INSERT INTO ${TABLE} (run_id, request_id, brief) VALUES ($1, $2, $3)`, [fichier, randomUUID(), JSON.stringify(BRIEF)])).code).toBe("23503");
      expect((await attempt(proto, `INSERT INTO ${TABLE} (run_id, request_id, brief) VALUES ($1, $2, $3)`, [randomUUID(), randomUUID(), JSON.stringify(BRIEF)])).code).toBe("23503");
      for (const marqueur of ["Saisi", "saisi.json.x", "", "../rome-1.json"]) {
        expect((await attempt(proto, "INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', $1, 'A', $2)", [marqueur, SHA])).code, marqueur).toBe("23514");
      }
    } finally {
      await proto.query("ROLLBACK");
    }
    const arretee = await poserSaisi({ statut: "arretee" });
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      expect((await attempt(c, `INSERT INTO ${TABLE} (run_id, request_id, brief) VALUES ($1, $2, $3)`, [arretee.run, randomUUID(), JSON.stringify(BRIEF)])).code).toBe("23503");
    });
  });

  it("jamais aucun : une exécution saisi sans brief à la fin de sa transaction est refusée au COMMIT (23514), rien n'est écrit", async () => {
    const avant = await compter("SELECT count(*) AS n FROM prototype.runs WHERE brief = 'saisi'");
    await proto.query("BEGIN");
    await proto.query("INSERT INTO prototype.runs (mode, brief, variant, commit_sha) VALUES ('essai', 'saisi', 'A', $1)", [SHA]);
    const erreur = await proto.query("COMMIT").then(
      () => null,
      (e: { code?: string }) => e,
    );
    expect(erreur?.code).toBe("23514");
    expect(await compter("SELECT count(*) AS n FROM prototype.runs WHERE brief = 'saisi'")).toBe(avant);
  });

  it("droits : vadrouille_prototype n'a ni UPDATE ni DELETE ; organization_id et expires_at non insérables ; vadrouille_app ne voit rien", async () => {
    const { run, brief } = await poserSaisi();
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      await expectRefused(c, `UPDATE ${TABLE} SET brief = '{}' WHERE id = $1`, [brief]);
      await expectRefused(c, `DELETE FROM ${TABLE} WHERE id = $1`, [brief]);
      await expectRefused(c, `INSERT INTO ${TABLE} (run_id, request_id, brief, expires_at) VALUES ($1, $2, '{}', now())`, [run, randomUUID()]);
      await expectRefused(c, `INSERT INTO ${TABLE} (organization_id, run_id, request_id, brief) VALUES ($1, $2, $3, '{}')`, [a.org, run, randomUUID()]);
    });
    await inTx(app, { org: a.org }, async (c) => {
      await expectRefused(c, `SELECT id FROM ${TABLE}`);
    });
  });

  it("purge : un brief expiré est supprimé avec les programmes, un brief vivant n'est pas touché ; expiré, il n'est plus lisible avant", async () => {
    const vivant = await poserSaisi({ statut: "programme_ecrit" });
    const expire = await poserSaisi({ statut: "programme_ecrit", expire: true });
    await inTx(proto, { org: PROTOTYPE_ORG_ID }, async (c) => {
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [vivant.brief])).rows).toHaveLength(1);
      expect((await c.query(`SELECT id FROM ${TABLE} WHERE id = $1`, [expire.brief])).rows).toHaveLength(0);
    });
    await purge.query("SELECT prototype.purge_expired()");
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [expire.brief])).toBe(0);
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE id = $1`, [vivant.brief])).toBe(1);
    const { rows } = await admin.query("SELECT p.prosrc FROM pg_catalog.pg_proc p WHERE p.oid = 'prototype.purge_expired()'::regprocedure");
    expect(rows[0].prosrc).toContain(`${TABLE} `);
  });
});

describe("p0: réservation d'un brief saisi et lectures (0125 § 1, § 2 et § 4)", () => {
  it("réservation : exécution saisi, forfait et brief écrits ensemble ; même requestId : même exécution, rien de plus", async () => {
    const requestId = randomUUID();
    const premier = await lancerSaisi(requestId);
    expect(premier).toEqual({ ok: true, runId: expect.any(String) });
    if (!premier.ok) return;
    expect(await compter(`SELECT count(*) AS n FROM ${TABLE} WHERE run_id = $1 AND request_id = $2`, [premier.runId, requestId])).toBe(1);
    expect(await compter("SELECT count(*) AS n FROM prototype.forfaits WHERE run_id = $1", [premier.runId])).toBe(1);
    expect((await admin.query("SELECT brief, mode, variant FROM prototype.runs WHERE id = $1", [premier.runId])).rows[0]).toEqual({ brief: "saisi", mode: "essai", variant: "A" });
    const second = await lancerSaisi(requestId);
    expect(second).toEqual({ ok: true, runId: premier.runId, existante: true, destination: "Rome" });
    // Rejeu au bord d'un plafond (mineur TL 2 de la revue de #704) : la clé est lue avant le contrôle du forfait.
    const fermees: ReglesForfait = { ...REGLES, limites: { ...LARGES, quotaJourParMethode: 0, moisGoogleMicros: 0, enveloppeGoogleMicros: 0 } };
    expect(
      await reserverExecution(poolReel, { mode: "essai", brief: "saisi", variant: "A", commitSha: SHA, forfait: FORFAIT, briefSaisi: { requestId, contenu: BRIEF } }, fermees),
    ).toEqual({ ok: true, runId: premier.runId, existante: true, destination: "Rome" });
    expect((await lancerSaisi(randomUUID())).ok).toBe(true);
    expect(await compter("SELECT count(*) AS n FROM prototype.forfaits WHERE run_id = $1", [premier.runId])).toBe(1);
    // Lecture par l'étape : le brief tel qu'écrit.
    expect(await lireBriefSaisi(poolReel, premier.runId)).toEqual(BRIEF);
  });

  it("brief refusé par la base (clé inconnue) : rien n'est écrit, échec fermé ; brief sans marqueur ou marqueur sans brief : refus avant la base", async () => {
    const avant = await compter("SELECT count(*) AS n FROM prototype.runs");
    expect(await lancerSaisi(randomUUID(), { ...BRIEF, placeId: "x" })).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await reserverExecution(poolReel, { mode: "essai", brief: "saisi", variant: "A", commitSha: SHA, forfait: FORFAIT }, REGLES)).toEqual({ ok: false, code: "usage_unavailable" });
    expect(
      await reserverExecution(poolReel, { mode: "essai", brief: "rome-1.json", variant: "A", commitSha: SHA, forfait: FORFAIT, briefSaisi: { requestId: randomUUID(), contenu: BRIEF } }, REGLES),
    ).toEqual({ ok: false, code: "usage_unavailable" });
    expect(await compter("SELECT count(*) AS n FROM prototype.runs")).toBe(avant);
  });

  it("état du voyage : en_cours, programme_ecrit, arretee avec le nombre de jours ; autre slug, autre identifiant, expiré : null", async () => {
    const lecture = pool(proto);
    for (const statut of ["en_cours", "programme_ecrit", "arretee"] as const) {
      const { run } = await poserSaisi({ statut });
      expect(await lireEtatVoyageSaisi(lecture, identifiantVoyageSaisi("Rome", run))).toEqual({ etat: statut, jours: 5 });
      expect(await lireEtatVoyageSaisi(lecture, identifiantVoyageSaisi("Paris", run))).toBeNull();
    }
    const expire = await poserSaisi({ expire: true });
    expect(await lireEtatVoyageSaisi(lecture, identifiantVoyageSaisi("Rome", expire.run))).toBeNull();
    expect(await lireEtatVoyageSaisi(lecture, "proto_rome_20271010_1")).toBeNull();
    expect(await lireEtatVoyageSaisi(lecture, identifiantVoyageSaisi("Rome", randomUUID()))).toBeNull();
  });

  it("brief d'une exécution arrêtée seulement (« Réessayer ») ; lireBriefSaisi refuse une exécution terminée", async () => {
    const lecture = pool(proto);
    const arretee = await poserSaisi({ statut: "arretee" });
    const ecrite = await poserSaisi({ statut: "programme_ecrit" });
    expect(await lireBriefArrete(lecture, identifiantVoyageSaisi("Rome", arretee.run))).toEqual(BRIEF);
    expect(await lireBriefArrete(lecture, identifiantVoyageSaisi("Rome", ecrite.run))).toBeNull();
    await expect(lireBriefSaisi(lecture, ecrite.run)).rejects.toMatchObject({ code: "execution_absente" });
  });
});
