// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CLES_CONTENU_ECRIT, EchecEcritureProgramme, ecrireProgramme, FONCTION_POSITIONS, SQL_VERROU_S8, verrouS8Leve } from "@/adapters/prototype-ecriture";
import type { EcritureProgrammePrototype } from "@/contracts/prototype-ecriture";
import { CLES_CONTENU, decouperProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Module d'écriture du prototype (décision 0052 § 1.8 et § 1.10) avec un client `pg` simulé : paramètres liés,
 * ordre des opérations, contrôles avant toute requête, erreurs sans valeur. Les écritures réelles (ensemble ou pas du
 * tout, verrou S8) sont éprouvées sur la base de la CI : `tests/db/positions-prototype.test.ts`.
 */

const PROGRAMME = ProgrammeReduitSchema.parse(
  JSON.parse(readFileSync(path.join(import.meta.dirname, "../../prototype/programmes-test/proto_test_20261012_1.json"), "utf8")),
);
const RUN_ID = "0f3a2b1c-4d5e-4f60-8a7b-9c0d1e2f3a4b";
/** Coordonnées sentinelles : aucune ne doit apparaître dans le texte d'une requête ni dans une erreur. */
const LAT = 12.3456789;
const LNG = -65.4321987;
const FONCTION = ["store", "prototype", "coordinates"].join("_");

function entree(): EcritureProgrammePrototype {
  const { contenu, positions } = decouperProgramme(PROGRAMME);
  return { runId: RUN_ID, programme: contenu, positions: new Map([...positions.keys()].map((placeId, i) => [placeId, { lat: LAT, lng: LNG + i / 1000 }])) };
}

type Requete = { texte: string; valeurs: readonly unknown[] | undefined };

function poolSimule(options: { echecSur?: string; statutRendu?: number } = {}) {
  const requetes: Requete[] = [];
  let connexions = 0;
  let liberations = 0;
  const pool: PoolSql = {
    connect: async (): Promise<ClientSql> => {
      connexions += 1;
      return {
        query: async (texte, valeurs) => {
          requetes.push({ texte, valeurs });
          if (options.echecSur !== undefined && texte.startsWith(options.echecSur)) {
            throw Object.assign(new Error(`panne ${String(valeurs?.[1])} ${LAT}`), { code: "23514", detail: `(${LAT}, ${LNG})` });
          }
          if (texte.startsWith("INSERT INTO prototype.programmes")) return { rows: [{ id: "programme-1" }] };
          if (texte.startsWith("UPDATE prototype.runs")) return { rows: Array.from({ length: options.statutRendu ?? 1 }, () => ({ id: RUN_ID })) };
          return { rows: [] };
        },
        release: () => {
          liberations += 1;
        },
      };
    },
  };
  return { pool, requetes, compte: () => ({ connexions, liberations }) };
}

describe("p0: coordonnées passées en paramètres liés (0052 § 1.8)", () => {
  it("le texte de chaque requête ne contient aucun placeId ni coordonnée ; les valeurs passent en paramètres", async () => {
    const e = entree();
    const { pool, requetes } = poolSimule();
    expect(await ecrireProgramme(e, pool)).toEqual({ programmeId: "programme-1" });
    const placeIds = [...e.positions.keys()];
    for (const { texte } of requetes) {
      for (const placeId of placeIds) expect(texte).not.toContain(placeId);
      expect(texte).not.toMatch(/\d+\.\d{3,}/);
      expect(texte).not.toContain(RUN_ID);
    }
    const appels = requetes.filter((r) => r.texte.includes(FONCTION));
    expect(appels.map((r) => r.valeurs?.[1])).toEqual([...placeIds].sort());
    for (const appel of appels) {
      expect(appel.texte).toBe(`SELECT public.${FONCTION}($1::uuid, $2::text, $3::double precision, $4::double precision)`);
      expect(appel.valeurs?.[0]).toBe(RUN_ID);
      expect(appel.valeurs?.[2]).toBe(LAT);
    }
  });

  it("ordre de 0052 § 1.1 dans une transaction : contexte, positions, programme sans positions, statut, COMMIT ; connexion libérée", async () => {
    const e = entree();
    const { pool, requetes, compte } = poolSimule();
    await ecrireProgramme(e, pool);
    const n = e.positions.size;
    expect(requetes[0]?.texte).toBe("BEGIN");
    expect(requetes[1]).toEqual({ texte: "SELECT pg_catalog.set_config('app.organization_id', $1, true)", valeurs: ["5e1f0000-0000-4000-8000-000000000001"] });
    expect(requetes.slice(2, 2 + n).every((r) => r.texte.includes(FONCTION))).toBe(true);
    expect(requetes[2 + n]?.texte.startsWith("INSERT INTO prototype.programmes")).toBe(true);
    const contenu = JSON.parse(String(requetes[2 + n]?.valeurs?.[1])) as Record<string, unknown>;
    expect(Object.keys(contenu).sort()).toEqual([...CLES_CONTENU_ECRIT].sort());
    expect(JSON.stringify(contenu)).not.toMatch(/"(lat|lng|positions)"/);
    expect(requetes[3 + n]?.texte.startsWith("UPDATE prototype.runs SET status = 'programme_ecrit'")).toBe(true);
    expect(requetes[4 + n]?.texte).toBe("COMMIT");
    expect(requetes).toHaveLength(5 + n);
    expect(compte()).toEqual({ connexions: 1, liberations: 1 });
  });

  it("clés du contenu égales à CLES_CONTENU de src/prototype/decoupage.ts", () => {
    expect([...CLES_CONTENU_ECRIT]).toEqual([...CLES_CONTENU]);
  });
});

describe("p0: écriture refusée avant toute requête si l'entrée s'écarte du programme (0052 § 1.10)", () => {
  const cas: [string, (e: EcritureProgrammePrototype) => EcritureProgrammePrototype][] = [
    ["une position manque", (e) => ({ ...e, positions: new Map([...e.positions].slice(1)) })],
    ["une position en trop", (e) => ({ ...e, positions: new Map([...e.positions, ["AUTRE_LIEU", { lat: 1, lng: 1 }]]) })],
    ["une position remplacée par un autre lieu", (e) => ({ ...e, positions: new Map([...[...e.positions].slice(1), ["AUTRE_LIEU", { lat: 1, lng: 1 }]]) })],
    ["contenu avec positions", (e) => ({ ...e, programme: { ...e.programme, positions: {} } as EcritureProgrammePrototype["programme"] })],
    ["contenu avec une clé inconnue", (e) => ({ ...e, programme: { ...e.programme, note: 1 } as EcritureProgrammePrototype["programme"] })],
    ["identifiant d'exécution hors forme", (e) => ({ ...e, runId: "run-1" })],
    ["latitude non finie", (e) => ({ ...e, positions: new Map([...e.positions].map(([k, p], i) => [k, i === 0 ? { ...p, lat: Number.NaN } : p])) })],
    ["longitude hors bornes", (e) => ({ ...e, positions: new Map([...e.positions].map(([k, p], i) => [k, i === 0 ? { ...p, lng: 180.5 } : p])) })],
  ];
  it.each(cas)("%s : entree_refusee, aucune connexion ouverte", async (_nom, modifier) => {
    const { pool, requetes, compte } = poolSimule();
    const echec = ecrireProgramme(modifier(entree()), pool);
    await expect(echec).rejects.toBeInstanceOf(EchecEcritureProgramme);
    await expect(echec).rejects.toMatchObject({ code: "entree_refusee" });
    expect(requetes).toEqual([]);
    expect(compte().connexions).toBe(0);
  });
});

describe("p0: échec de la base, transaction annulée, erreur sans valeur (0052 § 1.1 et § 1.8)", () => {
  it.each([FONCTION, "INSERT INTO prototype.programmes", "UPDATE prototype.runs"])("échec sur « %s » : ROLLBACK, code et SQLSTATE seuls", async (cible) => {
    const { pool, requetes, compte } = poolSimule({ echecSur: cible.startsWith("store") ? "SELECT public." : cible });
    let erreur: unknown;
    try {
      await ecrireProgramme(entree(), pool);
    } catch (e) {
      erreur = e;
    }
    expect(erreur).toBeInstanceOf(EchecEcritureProgramme);
    expect(erreur).toMatchObject({ code: "base", sqlstate: "23514" });
    const texte = `${String(erreur)} ${JSON.stringify(erreur)} ${(erreur as Error).stack ?? ""}`;
    expect(texte).not.toContain(String(LAT));
    expect(texte).not.toContain("SENTINELLE_PLACE_ID");
    expect((erreur as Error).cause).toBeUndefined();
    expect(requetes.at(-1)?.texte).toBe("ROLLBACK");
    expect(requetes.some((r) => r.texte === "COMMIT")).toBe(false);
    expect(compte()).toEqual({ connexions: 1, liberations: 1 });
  });

  it("exécution qui n'est plus en cours au passage de statut : execution_close, ROLLBACK", async () => {
    const { pool, requetes } = poolSimule({ statutRendu: 0 });
    await expect(ecrireProgramme(entree(), pool)).rejects.toMatchObject({ code: "execution_close" });
    expect(requetes.at(-1)?.texte).toBe("ROLLBACK");
  });

  it("connexion impossible : base, sans valeur", async () => {
    const pool: PoolSql = { connect: () => Promise.reject(Object.assign(new Error(`postgres://u:secret@h/b ${LAT}`), { code: "08001" })) };
    const echec = ecrireProgramme(entree(), pool);
    await expect(echec).rejects.toMatchObject({ code: "base", sqlstate: "08001", message: "écriture du programme refusée (base, 08001)" });
  });
});

describe("verrou S8 lu au lancement (P0r3d ; 0052 § 3, 0056 § 4)", () => {
  /** Pool d'une seule réponse ; note la requête et la libération. */
  function poolVerrou(reponse: () => Promise<{ rows: Record<string, unknown>[] }>) {
    const requetes: Requete[] = [];
    let liberations = 0;
    const pool: PoolSql = {
      connect: async (): Promise<ClientSql> => ({
        query: async (texte, valeurs) => {
          requetes.push({ texte, valeurs });
          return reponse();
        },
        release: () => void (liberations += 1),
      }),
    };
    return { pool, requetes, liberations: () => liberations };
  }

  it("droit EXECUTE sur la signature exacte de la fonction, en paramètre lié ; catalogue lu, fonction jamais appelée", async () => {
    expect(FONCTION_POSITIONS).toBe(`public.${FONCTION}(uuid, text, double precision, double precision)`);
    expect(SQL_VERROU_S8).toBe(
      "SELECT COALESCE(pg_catalog.has_function_privilege(pg_catalog.to_regprocedure($1), 'EXECUTE'), false) AS leve",
    );
    expect(SQL_VERROU_S8).not.toContain(FONCTION);
    for (const leve of [true, false]) {
      const b = poolVerrou(async () => ({ rows: [{ leve }] }));
      expect(await verrouS8Leve(b.pool)).toBe(leve);
      expect(b.requetes).toEqual([{ texte: SQL_VERROU_S8, valeurs: [FONCTION_POSITIONS] }]);
      expect(b.liberations()).toBe(1);
    }
  });

  it("réponse illisible, requête ou connexion en échec : EchecEcritureProgramme base, sans message d'origine", async () => {
    for (const reponse of [async () => ({ rows: [] }), async () => ({ rows: [{ leve: "t" }] }), () => Promise.reject(new Error("SENTINELLE_PG"))]) {
      const b = poolVerrou(reponse);
      const echec = await verrouS8Leve(b.pool).catch((e: unknown) => e);
      expect(echec).toBeInstanceOf(EchecEcritureProgramme);
      expect(echec).toMatchObject({ code: "base" });
      expect(String((echec as Error).message)).not.toContain("SENTINELLE_PG");
      expect(b.liberations()).toBe(1);
    }
    const panne: PoolSql = { connect: () => Promise.reject(new Error("SENTINELLE_PG")) };
    await expect(verrouS8Leve(panne)).rejects.toMatchObject({ code: "base", message: "écriture du programme refusée (base)" });
  });
});
