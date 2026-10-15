// @vitest-environment node
import { describe, expect, it } from "vitest";

import { CANDIDATS_MAX, cloreExecution, COUT_MAX_MICROS, EchecTravail, ecrireCoutModeles, ecrirePhase, lireCandidats, lireExecution, PHASES_TRAVAIL, remplacerCandidats } from "@/adapters/prototype-travail";
import type { LigneCandidat } from "@/contracts/prototype-travail";
import { PHASES } from "@/prototype/arret";
import { BORNES_MODE_REEL, BORNES_PLAFONDS } from "@/prototype/config";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Table de travail de `p0Run` (P0r3c-4, décision 0063 point 9 ; 0046 D15 et S4) avec un client `pg` simulé :
 * paramètres liés, transaction et contexte d'organisation, contrôles avant toute requête, droits de
 * `vadrouille_prototype` (aucun `UPDATE` des candidats), erreurs réduites à un code et au SQLSTATE. Aucune base réelle.
 */

const RUN_ID = "44444444-4444-4444-8444-444444444444";
const SENTINELLE = "SENT_PLACE_ID_GOOGLE";
const CONTEXTE = "SELECT pg_catalog.set_config('app.organization_id', $1, true)";

type Requete = { texte: string; valeurs: readonly unknown[] | undefined };

function poolSimule(
  reponses: { enCours?: boolean; execution?: Record<string, unknown>; candidats?: Record<string, unknown>[]; echecSur?: string; phase?: string | null } = {},
) {
  const requetes: Requete[] = [];
  let liberations = 0;
  const pool: PoolSql = {
    connect: async (): Promise<ClientSql> => ({
      query: async (texte, valeurs) => {
        requetes.push({ texte, valeurs });
        if (reponses.echecSur !== undefined && texte.startsWith(reponses.echecSur)) {
          throw Object.assign(new Error(`panne ${SENTINELLE} ${String(valeurs?.[1])}`), { code: "23514", detail: SENTINELLE });
        }
        const enCours = reponses.enCours ?? true;
        if (texte.startsWith("SELECT mode")) return { rows: reponses.execution === undefined ? [] : [reponses.execution] };
        if (texte.startsWith("SELECT phase FROM prototype.runs")) return { rows: enCours ? [{ phase: reponses.phase ?? null }] : [] };
        if (texte.startsWith("SELECT 1 FROM prototype.runs")) return { rows: enCours ? [{ "?column?": 1 }] : [] };
        if (texte.startsWith("UPDATE prototype.runs")) return { rows: enCours ? [{ id: RUN_ID }] : [] };
        if (texte.startsWith("SELECT cle")) return { rows: reponses.candidats ?? [] };
        return { rows: [] };
      },
      release: () => {
        liberations += 1;
      },
    }),
  };
  return { pool, requetes, liberations: () => liberations };
}

const EXECUTION = { mode: "essai", brief: "edimbourg-1.json", variant: "B", cost_models_micros: null, jour_quota: "2026-10-15", ecoule_ms: "4250" };

const ligne = (n: number, placeId: string | null = null): LigneCandidat => ({ cle: `c_00${n}`, candidat: { id: `c_00${n}`, nom: "Lieu maison" }, placeId });

const textes = (requetes: Requete[]) => requetes.map((r) => r.texte.split(/\s+/).slice(0, 3).join(" "));

async function echec(promesse: Promise<unknown>): Promise<EchecTravail> {
  const erreur = await promesse.then(
    () => undefined,
    (e: unknown) => e,
  );
  expect(erreur).toBeInstanceOf(EchecTravail);
  return erreur as EchecTravail;
}

describe("p0: table de travail de p0Run (adaptateur unique)", () => {
  it("bornes égales à leur source (mineur 1 de la revue du head `608ee99`) : phases, candidats, coût", () => {
    expect(PHASES_TRAVAIL).toEqual(PHASES);
    expect(CANDIDATS_MAX).toBe(BORNES_PLAFONDS.candidatsTrouves);
    expect(COUT_MAX_MICROS).toBe(BORNES_PLAFONDS.coutUsd * 1_000_000);
    expect(COUT_MAX_MICROS).toBe(BORNES_MODE_REEL.coutUsd * 1_000_000);
  });

  it("lireExecution : transaction, contexte d'organisation, paramètres liés ; mode, brief, variante et coût", async () => {
    const { pool, requetes, liberations } = poolSimule({ execution: { ...EXECUTION, cost_models_micros: "120000" } });
    expect(await lireExecution(pool, RUN_ID)).toEqual({ mode: "essai", brief: "edimbourg-1.json", variante: "B", coutModelesMicros: 120_000, jourQuota: "2026-10-15", ecouleMs: 4_250 });
    // Jour de quota et temps écoulé lus de la base (horloge de la base, jamais celle du serveur).
    expect(requetes[2]?.texte).toContain("pg_catalog.to_char(quota_day, 'YYYY-MM-DD')");
    expect(requetes[2]?.texte).toContain("pg_catalog.now() - started_at");
    expect(requetes[0]?.texte).toBe("BEGIN");
    expect(requetes[1]).toEqual({ texte: CONTEXTE, valeurs: ["5e1f0000-0000-4000-8000-000000000001"] });
    expect(requetes[2]?.valeurs).toEqual([RUN_ID]);
    expect(requetes.at(-1)?.texte).toBe("COMMIT");
    expect(liberations()).toBe(1);
    for (const { texte } of requetes) expect(texte).not.toContain(RUN_ID);
  });

  it("exécution absente ou plus en cours : execution_absente ; ligne mal formée : base", async () => {
    expect((await echec(lireExecution(poolSimule().pool, RUN_ID))).code).toBe("execution_absente");
    const { pool } = poolSimule({ execution: { ...EXECUTION, mode: "simule" } });
    expect((await echec(lireExecution(pool, RUN_ID))).code).toBe("base");
    for (const mal of [{ jour_quota: null }, { jour_quota: "15/10/2026" }, { ecoule_ms: null }, { ecoule_ms: "1.5" }, { ecoule_ms: "9007199254740993" }]) {
      expect((await echec(lireExecution(poolSimule({ execution: { ...EXECUTION, ...mal } }).pool, RUN_ID))).code).toBe("base");
    }
    // Horloges décalées : un écoulé négatif compte pour zéro.
    expect((await lireExecution(poolSimule({ execution: { ...EXECUTION, ecoule_ms: -30 } }).pool, RUN_ID)).ecouleMs).toBe(0);
    expect((await echec(ecrirePhase(poolSimule({ enCours: false }).pool, RUN_ID, "ancrage"))).code).toBe("execution_absente");
  });

  it("entrées refusées avant toute requête : runId, phase, coût, clés, placeId, nombre de lignes", async () => {
    const { pool, requetes } = poolSimule();
    const cas: Promise<unknown>[] = [
      lireExecution(pool, "pas-un-uuid"),
      ecrirePhase(pool, RUN_ID, "SENTINELLE" as never),
      ecrireCoutModeles(pool, RUN_ID, -1),
      ecrireCoutModeles(pool, RUN_ID, Number.NaN),
      remplacerCandidats(pool, RUN_ID, [ligne(1), ligne(1)]),
      remplacerCandidats(pool, RUN_ID, [{ ...ligne(1), cle: "x_001" }]),
      remplacerCandidats(pool, RUN_ID, [ligne(1, "place id avec espaces")]),
      remplacerCandidats(pool, RUN_ID, [{ ...ligne(1), candidat: [] as never }]),
      remplacerCandidats(pool, RUN_ID, Array.from({ length: 301 }, (_, i) => ({ ...ligne(1), cle: `c_${String(i).padStart(3, "0")}` }))),
      cloreExecution(pool, RUN_ID, "Code Libre"),
    ];
    for (const promesse of cas) expect((await echec(promesse)).code).toBe("entree_refusee");
    expect(requetes).toEqual([]);
  });

  it("coût des modèles : arrondi au cent supérieur, plafonné à 3 USD, jamais abaissé (GREATEST)", async () => {
    const { pool, requetes } = poolSimule();
    await ecrireCoutModeles(pool, RUN_ID, 123_456);
    await ecrireCoutModeles(pool, RUN_ID, 9_000_000);
    const ecritures = requetes.filter((r) => r.texte.startsWith("UPDATE"));
    expect(ecritures.map((r) => r.valeurs)).toEqual([
      [RUN_ID, 130_000],
      [RUN_ID, 3_000_000],
    ]);
    expect(ecritures[0]?.texte).toContain("GREATEST");
  });

  it("remplacerCandidats : exécution verrouillée en cours, DELETE puis INSERT, aucun UPDATE des candidats ; placeId en paramètre", async () => {
    const { pool, requetes } = poolSimule();
    await remplacerCandidats(pool, RUN_ID, [ligne(1, SENTINELLE), ligne(2)]);
    expect(textes(requetes)).toEqual([
      "BEGIN",
      "SELECT pg_catalog.set_config('app.organization_id', $1,",
      "SELECT 1 FROM",
      "DELETE FROM prototype.run_candidates",
      "INSERT INTO prototype.run_candidates",
      "INSERT INTO prototype.run_candidates",
      "COMMIT",
    ]);
    expect(requetes[2]?.texte).toContain("FOR UPDATE");
    expect(requetes[4]?.valeurs).toEqual([RUN_ID, "c_001", JSON.stringify({ id: "c_001", nom: "Lieu maison" }), SENTINELLE]);
    expect(requetes[5]?.valeurs?.[3]).toBeNull();
    for (const { texte } of requetes) {
      expect(texte).not.toContain(SENTINELLE);
      expect(texte).not.toMatch(/UPDATE prototype\.run_candidates/);
    }
  });

  it("remplacerCandidats sur une exécution close : rien n'est écrit, ROLLBACK", async () => {
    const { pool, requetes } = poolSimule({ enCours: false });
    expect((await echec(remplacerCandidats(pool, RUN_ID, [ligne(1)]))).code).toBe("execution_absente");
    expect(textes(requetes).some((t) => t.startsWith("DELETE") || t.startsWith("INSERT"))).toBe(false);
    expect(requetes.at(-1)?.texte).toBe("ROLLBACK");
  });

  it("panne de la base : code base et SQLSTATE seuls, sans message, valeur ni placeId ; connexion libérée", async () => {
    const { pool, liberations } = poolSimule({ echecSur: "INSERT" });
    const erreur = await echec(remplacerCandidats(pool, RUN_ID, [ligne(1, SENTINELLE)]));
    expect(erreur.code).toBe("base");
    expect(erreur.sqlstate).toBe("23514");
    expect(`${erreur.message} ${String(erreur.stack)} ${JSON.stringify(erreur)}`).not.toContain(SENTINELLE);
    expect(liberations()).toBe(1);
  });

  it("lireCandidats : dans l'ordre des clés, exécution en cours exigée", async () => {
    const { pool } = poolSimule({ candidats: [{ cle: "c_001", candidat: { id: "c_001" }, place_id: SENTINELLE }] });
    expect(await lireCandidats(pool, RUN_ID)).toEqual([{ cle: "c_001", candidat: { id: "c_001" }, placeId: SENTINELLE }]);
    expect((await echec(lireCandidats(poolSimule({ enCours: false }).pool, RUN_ID))).code).toBe("execution_absente");
  });

  it("cloreExecution : candidats supprimés puis arretee avec le code ; sans effet si l'exécution n'est plus en cours", async () => {
    const { pool, requetes } = poolSimule();
    await cloreExecution(pool, RUN_ID, "pipeline_failed");
    expect(textes(requetes).slice(2, 5)).toEqual(["SELECT 1 FROM", "DELETE FROM prototype.run_candidates", "UPDATE prototype.runs SET"]);
    expect(requetes[4]?.texte).toContain("status = 'arretee'");
    expect(requetes[4]?.valeurs).toEqual([RUN_ID, "pipeline_failed"]);
    const close = poolSimule({ enCours: false });
    await cloreExecution(close.pool, RUN_ID, "pipeline_failed");
    expect(textes(close.requetes).some((t) => t.startsWith("DELETE") || t.startsWith("UPDATE"))).toBe(false);
  });

  it("ecrirePhase, garde d'idempotence (mineur 6 de la PR 348) : ligne verrouillée, phase écrite seulement après la précédente", async () => {
    const { pool, requetes } = poolSimule({ phase: "raisons" });
    await ecrirePhase(pool, RUN_ID, "validation");
    expect(textes(requetes)).toEqual(["BEGIN", "SELECT pg_catalog.set_config('app.organization_id', $1,", "SELECT phase FROM", "UPDATE prototype.runs SET", "COMMIT"]);
    expect(requetes[2]?.texte).toContain("FOR UPDATE");
    expect(requetes[2]?.valeurs).toEqual([RUN_ID]);
    expect(requetes[3]?.valeurs).toEqual([RUN_ID, "validation"]);
    // `recherche` : aucune phase avant elle.
    await ecrirePhase(poolSimule({ phase: null }).pool, RUN_ID, "recherche");
  });

  it("ecrirePhase rejouée ou hors d'ordre : phase_deja_passee, rien n'est écrit, ROLLBACK", async () => {
    for (const [enBase, ecrite] of [
      ["notation", "notation"],
      ["planification", "notation"],
      ["recherche", "recherche"],
      [null, "ancrage"],
      ["ancrage", "planification"],
    ] as const) {
      const { pool, requetes } = poolSimule({ phase: enBase });
      expect((await echec(ecrirePhase(pool, RUN_ID, ecrite))).code).toBe("phase_deja_passee");
      expect(textes(requetes).some((t) => t.startsWith("UPDATE"))).toBe(false);
      expect(requetes.at(-1)?.texte).toBe("ROLLBACK");
    }
  });
});
