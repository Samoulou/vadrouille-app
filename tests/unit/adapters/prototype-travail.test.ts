// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CANDIDATS_MAX,
  CLES_CANDIDAT_ENRICHI,
  cloreExecution,
  COUT_MAX_MICROS,
  EchecTravail,
  ecrireCoutModeles,
  ecrirePhase,
  ecrireSecteurs,
  lireCandidats,
  lireExecution,
  lireSecteurs,
  PHASES_TRAVAIL,
  remplacerCandidats,
  SECTEURS_STOCKES_MAX,
  SQL_SECTEURS_PRESENTS,
  SQL_SUPPRIMER_SECTEURS,
  supprimerSecteursDansTransaction,
} from "@/adapters/prototype-travail";
import { lirePlan, lirePlanSecteursStocke, planSecteursStocke, SECTEURS_MAX } from "@/ai/sorties";
import type { LigneCandidat } from "@/contracts/prototype-travail";
import { PHASES } from "@/prototype/arret";
import { CandidatSchema } from "@/prototype/candidat";
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
  reponses: {
    enCours?: boolean;
    execution?: Record<string, unknown>;
    candidats?: Record<string, unknown>[];
    echecSur?: string;
    phase?: string | null;
    /** Table `run_secteurs` présente (migration 0013 appliquée) ; vrai par défaut. */
    secteursPresents?: boolean;
    secteurs?: Record<string, unknown>[];
  } = {},
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
        if (texte.startsWith("SELECT r.mode")) return { rows: reponses.execution === undefined ? [] : [reponses.execution] };
        if (texte.startsWith("SELECT phase FROM prototype.runs")) return { rows: enCours ? [{ phase: reponses.phase ?? null }] : [] };
        if (texte.startsWith("SELECT 1 FROM prototype.runs")) return { rows: enCours ? [{ "?column?": 1 }] : [] };
        if (texte.startsWith("UPDATE prototype.runs")) return { rows: enCours ? [{ id: RUN_ID }] : [] };
        if (texte.startsWith("SELECT cle")) return { rows: reponses.candidats ?? [] };
        if (texte === SQL_SECTEURS_PRESENTS) return { rows: [{ presente: reponses.secteursPresents ?? true }] };
        if (texte.startsWith("SELECT secteurs")) return { rows: reponses.secteurs ?? [] };
        return { rows: [] };
      },
      release: () => {
        liberations += 1;
      },
    }),
  };
  return { pool, requetes, liberations: () => liberations };
}

const EXECUTION = { mode: "essai", brief: "edimbourg-1.json", variant: "B", cost_models_micros: null, jour_quota: "2026-10-15", numero_jour: "2" };

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
    expect(await lireExecution(pool, RUN_ID)).toEqual({ mode: "essai", brief: "edimbourg-1.json", variante: "B", coutModelesMicros: 120_000, jourQuota: "2026-10-15", numeroDuJour: 2 });
    // Jour de quota lu de la base (horloge de la base, jamais celle du serveur) ; plus de temps écoulé (0102 § 6).
    expect(requetes[2]?.texte).toContain("pg_catalog.to_char(r.quota_day, 'YYYY-MM-DD')");
    expect(requetes[2]?.texte).not.toContain("ecoule_ms");
    // 0071 : rang dans le jour de quota, compté par la base parmi les exécutions du même jour (début, puis identifiant).
    expect(requetes[2]?.texte).toContain("a.quota_day = r.quota_day AND a.mode IN ('reel', 'essai') AND (a.started_at, a.id) <= (r.started_at, r.id)");
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
    for (const mal of [{ jour_quota: null }, { jour_quota: "15/10/2026" }, { numero_jour: null }, { numero_jour: "0" }, { numero_jour: "1.5" }]) {
      expect((await echec(lireExecution(poolSimule({ execution: { ...EXECUTION, ...mal } }).pool, RUN_ID))).code).toBe("base");
    }
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
    // Plan de secteurs supprimé avec l'exécution arrêtée (0103, question 1, condition 7), dans la même transaction.
    expect(requetes[5]?.texte).toBe(SQL_SECTEURS_PRESENTS);
    expect(requetes[6]).toEqual({ texte: SQL_SUPPRIMER_SECTEURS, valeurs: [RUN_ID] });
    expect(requetes[7]?.texte).toBe("COMMIT");
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
  it("p0: plan de secteurs supprimé avec une exécution arrêtée ; table absente (avant 0013_secteurs_prototype) : aucune suppression tentée", async () => {
    const absente = poolSimule({ secteursPresents: false });
    await cloreExecution(absente.pool, RUN_ID, "pipeline_failed");
    expect(absente.requetes.map((r) => r.texte)).not.toContain(SQL_SUPPRIMER_SECTEURS);
    expect(absente.requetes.at(-1)?.texte).toBe("COMMIT");
    // Dans la transaction de l'appelant (écriture du programme) : aucune connexion, aucun BEGIN ni COMMIT propres.
    const requetes: string[] = [];
    const client = { query: async (texte: string) => (requetes.push(texte), texte === SQL_SECTEURS_PRESENTS ? { rows: [{ presente: true }] } : { rows: [] }), release: () => undefined };
    await supprimerSecteursDansTransaction(client, RUN_ID);
    expect(requetes).toEqual([SQL_SECTEURS_PRESENTS, SQL_SUPPRIMER_SECTEURS]);
    await expect(supprimerSecteursDansTransaction(client, "pas-un-uuid")).rejects.toMatchObject({ code: "entree_refusee" });
  });
});

describe("p0: plan de secteurs, écriture et relecture (décision 0094 § 2 point 1 ; verdict 0103, question 1)", () => {
  const PLAN = {
    secteurs: [
      { nom: "Rome antique", voisins: ["Monti"], incontournables: ["Colisée", "Forum romain"] },
      { nom: "Monti", voisins: ["Rome antique"], incontournables: [] },
      { nom: "Trastevere", voisins: [], incontournables: [] },
    ],
  };

  it("bornes égales à leur source : secteurs au plus, clés du candidat enrichi", () => {
    expect(SECTEURS_STOCKES_MAX).toBe(SECTEURS_MAX);
    expect([...CLES_CANDIDAT_ENRICHI]).toEqual(Object.keys(CandidatSchema.shape).slice(-5));
  });

  it("ecrireSecteurs : phase recherche verrouillée, DELETE puis INSERT (aucun UPDATE), contenu en paramètre ; id, organisation et expiration posés par la base", async () => {
    const { pool, requetes } = poolSimule({ phase: "recherche" });
    await ecrireSecteurs(pool, RUN_ID, PLAN);
    expect(textes(requetes)).toEqual([
      "BEGIN",
      "SELECT pg_catalog.set_config('app.organization_id', $1,",
      "SELECT phase FROM",
      "DELETE FROM prototype.run_secteurs",
      "INSERT INTO prototype.run_secteurs",
      "COMMIT",
    ]);
    expect(requetes[2]?.texte).toContain("FOR UPDATE");
    expect(requetes[4]?.texte).toBe("INSERT INTO prototype.run_secteurs (run_id, secteurs) VALUES ($1::uuid, $2::jsonb)");
    expect(requetes[4]?.valeurs).toEqual([RUN_ID, JSON.stringify(PLAN)]);
    for (const { texte } of requetes) {
      expect(texte).not.toContain("Colisée");
      expect(texte).not.toMatch(/UPDATE prototype\.run_secteurs|expires_at/);
      if (texte.startsWith("INSERT")) expect(texte).not.toMatch(/\b(id|organization_id)\b,/);
    }
  });

  it("ecrireSecteurs hors de la phase recherche (après l'ancrage, ou exécution close) : rien n'est écrit, ROLLBACK", async () => {
    for (const phase of [null, "ancrage", "notation", "ecriture"]) {
      const { pool, requetes } = poolSimule({ phase });
      expect((await echec(ecrireSecteurs(pool, RUN_ID, PLAN))).code, String(phase)).toBe("phase_deja_passee");
      expect(textes(requetes).some((t) => t.startsWith("DELETE") || t.startsWith("INSERT"))).toBe(false);
      expect(requetes.at(-1)?.texte).toBe("ROLLBACK");
    }
    const close = poolSimule({ enCours: false });
    expect((await echec(ecrireSecteurs(close.pool, RUN_ID, PLAN))).code).toBe("execution_absente");
  });

  it("ecrireSecteurs : forme refusée avant toute requête (raison, requêtes, jour, rang, position, compteur, dixième secteur, type erroné)", async () => {
    const { pool, requetes } = poolSimule({ phase: "recherche" });
    const secteur = PLAN.secteurs[0] as Record<string, unknown>;
    const refuses: unknown[] = [
      {},
      [],
      null,
      { secteurs: [] },
      { ...PLAN, requetes: [] },
      { ...PLAN, raison: "x" },
      { secteurs: Array.from({ length: 10 }, (_, i) => ({ ...secteur, nom: `S${i}` })) },
      ...["raison", "requetes", "jour", "rang", "ordre", "horaire", "retenu", "verdict", "lat", "lng", "placeId", "candidats"].map((cle) => ({ secteurs: [{ ...secteur, [cle]: 1 }] })),
      { secteurs: [{ nom: "Monti", voisins: [] }] },
      { secteurs: [{ ...secteur, nom: 3 }] },
      { secteurs: [{ ...secteur, nom: "" }] },
      { secteurs: [{ ...secteur, voisins: "Monti" }] },
      { secteurs: [{ ...secteur, voisins: [["Monti"]] }] },
      { secteurs: [{ ...secteur, incontournables: [{ nom: "Colisée" }] }] },
      { secteurs: ["Monti"] },
    ];
    for (const contenu of refuses) expect((await echec(ecrireSecteurs(pool, RUN_ID, contenu as never))).code, JSON.stringify(contenu)).toBe("entree_refusee");
    expect((await echec(ecrireSecteurs(pool, "pas-un-uuid", PLAN))).code).toBe("entree_refusee");
    expect(requetes).toEqual([]);
  });

  it("lireSecteurs : exécution en cours exigée ; ligne absente : undefined (erreur fermée laissée à l'étape) ; contenu hors forme : base", async () => {
    const { pool, requetes } = poolSimule({ secteurs: [{ secteurs: PLAN }] });
    expect(await lireSecteurs(pool, RUN_ID)).toEqual(PLAN);
    expect(requetes[3]).toEqual({ texte: "SELECT secteurs FROM prototype.run_secteurs WHERE run_id = $1::uuid", valeurs: [RUN_ID] });
    expect(await lireSecteurs(poolSimule({ secteurs: [] }).pool, RUN_ID)).toBeUndefined();
    expect((await echec(lireSecteurs(poolSimule({ enCours: false }).pool, RUN_ID))).code).toBe("execution_absente");
    for (const mal of [{ ...PLAN, raison: "x" }, "texte", null, { secteurs: [{ nom: "Monti", voisins: [], incontournables: [], lat: 41.9 }] }]) {
      expect((await echec(lireSecteurs(poolSimule({ secteurs: [{ secteurs: mal }] }).pool, RUN_ID))).code, JSON.stringify(mal)).toBe("base");
    }
  });

  it("écriture et relecture du plan : forme stockée du plan lu (sans raison ni requêtes), relue et validée par le schéma du plan restreint", async () => {
    const lu = lirePlan(
      JSON.stringify({
        secteurs: PLAN.secteurs.map((s) => ({ ...s, raison: "Raison maison du secteur." })),
        requetes: [{ requete: "Colisée horaires", creneau: "activity", secteur: "Rome antique" }],
      }),
      { jours: 5 },
    );
    expect(lu.illisible).toBeUndefined();
    const stocke = planSecteursStocke(lu.valeur);
    expect(stocke).toEqual(PLAN);
    expect(JSON.stringify(stocke)).not.toMatch(/raison|requete/i);
    expect(planSecteursStocke({ secteurs: [], requetes: [] })).toBeUndefined();
    const ecriture = poolSimule({ phase: "recherche" });
    await ecrireSecteurs(ecriture.pool, RUN_ID, stocke as NonNullable<typeof stocke>);
    const ecrit = JSON.parse(String(ecriture.requetes.find((r) => r.texte.startsWith("INSERT"))?.valeurs?.[1])) as unknown;
    const relu = await lireSecteurs(poolSimule({ secteurs: [{ secteurs: ecrit }] }).pool, RUN_ID);
    expect(lirePlanSecteursStocke(relu)).toEqual(PLAN);
    // Le schéma restreint refuse ce que la table refuse (raison, requêtes, dixième secteur) : aucun second schéma.
    expect(lirePlanSecteursStocke({ secteurs: [{ ...PLAN.secteurs[0], raison: "x" }] })).toBeUndefined();
    expect(lirePlanSecteursStocke({ ...PLAN, requetes: [] })).toBeUndefined();
    expect(lirePlanSecteursStocke({ secteurs: Array.from({ length: 10 }, (_, i) => ({ ...PLAN.secteurs[2], nom: `S${i}` })) })).toBeUndefined();
    expect(lirePlanSecteursStocke({ secteurs: [{ ...PLAN.secteurs[0], nom: "x".repeat(61) }] })).toBeUndefined();
  });
});

describe("p0: candidat enrichi et compatibilité de la contrainte de clés (migration 0013_secteurs_prototype)", () => {
  const ENRICHI = { id: "c_001", nom: "Colisée", secteur: "Rome antique", incontournable: "Colisée", prix: "18 EUR", horaires: "9h-19h", conseil: "Tôt." };

  it("table run_secteurs présente (0013 appliquée) : candidat écrit tel quel, cinq clés comprises", async () => {
    const { pool, requetes } = poolSimule();
    await remplacerCandidats(pool, RUN_ID, [{ cle: "c_001", candidat: ENRICHI, placeId: null }]);
    expect(requetes.map((r) => r.texte)).toContain(SQL_SECTEURS_PRESENTS);
    expect(requetes.find((r) => r.texte.startsWith("INSERT"))?.valeurs?.[2]).toBe(JSON.stringify(ENRICHI));
  });

  it("table absente (0013 non appliquée) : les cinq clés du candidat enrichi sont retirées, le reste écrit tel quel", async () => {
    const { pool, requetes } = poolSimule({ secteursPresents: false });
    await remplacerCandidats(pool, RUN_ID, [{ cle: "c_001", candidat: ENRICHI, placeId: null }, ligne(2)]);
    const ecrits = requetes.filter((r) => r.texte.startsWith("INSERT")).map((r) => JSON.parse(String(r.valeurs?.[2])) as Record<string, unknown>);
    expect(ecrits).toEqual([{ id: "c_001", nom: "Colisée" }, { id: "c_002", nom: "Lieu maison" }]);
  });

  it("candidats sans clé enrichie : aucune lecture du catalogue (requêtes inchangées)", async () => {
    const { pool, requetes } = poolSimule();
    await remplacerCandidats(pool, RUN_ID, [ligne(1)]);
    expect(requetes.map((r) => r.texte)).not.toContain(SQL_SECTEURS_PRESENTS);
  });
});
