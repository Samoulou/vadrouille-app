import { randomBytes } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { type ClientSql, type DemandeVille, type LimitesVille, type PoolSql, reserverVille } from "@/server/usage/neon";

import { closeAll, connect, type DbClient } from "./helpers";

/**
 * Plafond persistant de la recherche de ville du site d'essai (décision 0129 § 3, migration 0019), sous
 * `vadrouille_prototype`. Chaque cas tourne dans une transaction **annulée** (le port y ouvre un point de sauvegarde à la
 * place de sa transaction) : aucune ligne `ville` n'est gardée.
 */

let proto: DbClient;

beforeAll(async () => {
  proto = await connect("p0");
});

afterAll(closeAll);

function poolDansTransaction(client: DbClient): PoolSql {
  const traduction = new Map([
    ["BEGIN", "SAVEPOINT ville"],
    ["COMMIT", "RELEASE SAVEPOINT ville"],
    ["ROLLBACK", "ROLLBACK TO SAVEPOINT ville"],
  ]);
  const sql: ClientSql = {
    query: async (texte, valeurs) => client.query(traduction.get(texte) ?? texte, valeurs as unknown[] | undefined),
    release: () => undefined,
  };
  return { connect: async () => sql };
}

async function annulee<T>(fn: (pool: PoolSql) => Promise<T>): Promise<T> {
  await proto.query("BEGIN");
  try {
    return await fn(poolDansTransaction(proto));
  } finally {
    await proto.query("ROLLBACK");
  }
}

const empreinte = () => randomBytes(32).toString("hex");
const suggestions = (e: string): DemandeVille => ({ action: "suggestions", empreinte: e, coutGoogleMicros: 2_830 });
const choix = (e: string): DemandeVille => ({ action: "choix", empreinte: e, coutGoogleMicros: 5_000 });
const LARGES: LimitesVille = { suggestionsParJour: 1_000_000, choixParJour: 1_000_000, actionsParMinuteEtCookie: 1_000_000 };

async function jour(): Promise<{ suggestions: number; choix: number; lignes: number }> {
  const r = await proto.query(
    `SELECT COALESCE(SUM(autocomplete_requests), 0)::int AS s, COALESCE(SUM(place_details_requests), 0)::int AS c, count(*)::int AS n
     FROM prototype.forfaits WHERE nature = 'ville' AND quota_day = prototype.quota_day_at(now())`,
  );
  return { suggestions: r.rows[0].s, choix: r.rows[0].c, lignes: r.rows[0].n };
}

describe("p0: recherche de ville, forfait `ville` en base (0129 § 3)", () => {
  it("une ligne par action, valeurs posées par la base, comptée dans le mois Google ; au plafond du jour, refus sans rien écrire", async () => {
    await annulee(async (pool) => {
      const e = empreinte();
      const avant = await jour();
      const moisAvant = Number((await proto.query("SELECT COALESCE(SUM(google_cost_micros), 0) AS m FROM prototype.forfaits")).rows[0].m);
      const limites: LimitesVille = { ...LARGES, suggestionsParJour: avant.suggestions + 2, choixParJour: avant.choix + 1 };
      expect(await reserverVille(pool, suggestions(e), limites)).toEqual({ ok: true });
      expect(await reserverVille(pool, suggestions(e), limites)).toEqual({ ok: true });
      expect(await reserverVille(pool, suggestions(e), limites)).toEqual({ ok: false, code: "ville_jour_atteint" });
      expect(await reserverVille(pool, choix(e), limites)).toEqual({ ok: true });
      expect(await reserverVille(pool, choix(e), limites)).toEqual({ ok: false, code: "ville_jour_atteint" });
      expect((await jour()).lignes).toBe(avant.lignes + 3);
      const lignes = await proto.query(
        `SELECT nature, run_id, text_search_requests, place_details_requests, routes_requests, routes_elements, google_cost_micros,
                models_cost_micros, autocomplete_requests, quota_day = prototype.quota_day_at(now()) AS du_jour
         FROM prototype.forfaits WHERE acces_empreinte = $1 ORDER BY place_details_requests`,
        [e],
      );
      const commun = { nature: "ville", run_id: null, text_search_requests: 0, routes_requests: 0, routes_elements: 0, models_cost_micros: null, du_jour: true };
      expect(lignes.rows.map((l) => ({ ...l, google_cost_micros: Number(l.google_cost_micros) }))).toEqual([
        { ...commun, place_details_requests: 0, autocomplete_requests: 1, google_cost_micros: 2_830 },
        { ...commun, place_details_requests: 0, autocomplete_requests: 1, google_cost_micros: 2_830 },
        { ...commun, place_details_requests: 1, autocomplete_requests: 0, google_cost_micros: 5_000 },
      ]);
      const moisApres = Number((await proto.query("SELECT COALESCE(SUM(google_cost_micros), 0) AS m FROM prototype.forfaits")).rows[0].m);
      expect(moisApres - moisAvant).toBe(2 * 2_830 + 5_000);
    });
  });

  it("débit par cookie : au-delà de la limite par minute, refus pour ce cookie seulement", async () => {
    await annulee(async (pool) => {
      const a = empreinte();
      const limites: LimitesVille = { ...LARGES, actionsParMinuteEtCookie: 2 };
      expect(await reserverVille(pool, suggestions(a), limites)).toEqual({ ok: true });
      expect(await reserverVille(pool, choix(a), limites)).toEqual({ ok: true });
      expect(await reserverVille(pool, suggestions(a), limites)).toEqual({ ok: false, code: "ville_debit_atteint" });
      expect(await reserverVille(pool, suggestions(empreinte()), limites)).toEqual({ ok: true });
    });
  });

  it("échec fermé : base injoignable, requête en erreur ou empreinte mal formée → usage_unavailable, rien d'écrit", async () => {
    const injoignable: PoolSql = { connect: async () => Promise.reject(new Error("ECONNREFUSED")) };
    expect(await reserverVille(injoignable, suggestions(empreinte()), LARGES)).toEqual({ ok: false, code: "usage_unavailable" });
    await annulee(async (pool) => {
      const avant = await jour();
      const enErreur: PoolSql = {
        connect: async () => {
          const reel = await pool.connect();
          return {
            query: async (texte, valeurs) => {
              if (texte.startsWith("INSERT INTO prototype.forfaits")) throw new Error("panne");
              return reel.query(texte, valeurs);
            },
            release: reel.release,
          };
        },
      };
      expect(await reserverVille(enErreur, suggestions(empreinte()), LARGES)).toEqual({ ok: false, code: "usage_unavailable" });
      expect(await reserverVille(pool, suggestions("COOKIE"), LARGES)).toEqual({ ok: false, code: "usage_unavailable" });
      expect((await jour()).lignes).toBe(avant.lignes);
    });
  });

  it("contraintes de 0019 : empreinte exigée pour `ville` seulement, au format hexadécimal ; suggestions réservées à `ville`", async () => {
    const cas: [string, unknown[]][] = [
      ["('ville', NULL, 0, 0, 0, 0, 2830, NULL, 1, NULL)", []],
      ["('ville', NULL, 0, 0, 0, 0, 2830, NULL, 1, 'pas-une-empreinte')", []],
      ["('relecture', NULL, 0, 0, 60, 60, 300, NULL, 1, NULL)", []],
      ["('relecture', NULL, 0, 0, 60, 60, 300, NULL, 0, $1)", [empreinte()]],
      ["('ville', NULL, 0, 0, 0, 0, 2830, 0, 1, $1)", [empreinte()]],
    ];
    for (const [valeurs, parametres] of cas) {
      await proto.query("BEGIN");
      try {
        await expect(
          proto.query(
            `INSERT INTO prototype.forfaits (nature, run_id, text_search_requests, place_details_requests, routes_requests, routes_elements,
               google_cost_micros, models_cost_micros, autocomplete_requests, acces_empreinte) VALUES ${valeurs}`,
            parametres,
          ),
          valeurs,
        ).rejects.toMatchObject({ code: "23514" });
      } finally {
        await proto.query("ROLLBACK");
      }
    }
  });
});
