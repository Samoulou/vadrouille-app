// @vitest-environment node
import { describe, expect, it } from "vitest";

import { EchecSuivi, EXECUTIONS_MAX, lireContenuProgramme, lireSuivi, PHASES_SUIVIES, SQL_CONTENU, SQL_DERNIERE_PURGE, SQL_EXECUTIONS } from "@/adapters/prototype-suivi";
import { STATUTS_EXECUTION } from "@/contracts/prototype-suivi";
import { PHASES } from "@/prototype/arret";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Lecture du suivi (`src/adapters/prototype-suivi.ts` ; D24, S4) : client `pg` simulé. Lignes contrôlées champ par
 * champ ; erreurs réduites à un code fermé ; jamais la table de travail, les forfaits ni les positions.
 */

const LIGNE = {
  id: "22222222-2222-4222-8222-222222222222",
  mode: "reel",
  brief: "edimbourg-1.json",
  variant: "B",
  status: "arretee",
  phase: null,
  stop_code: "upstream_unavailable",
  cost_models_micros: null,
  ecoule_ms: null,
  jour_quota: "2026-10-15",
  canary_ok: null,
  commit_sha: "c".repeat(40),
};
const EN_COURS = { ...LIGNE, status: "en_cours", stop_code: null, phase: "ancrage", cost_models_micros: "120000", ecoule_ms: "61000" };

function base(lignes: Record<string, unknown>[], derniere: unknown = "2026-10-14T03:00:00Z") {
  const requetes: { texte: string; valeurs: readonly unknown[] | undefined }[] = [];
  let liberations = 0;
  const pool: PoolSql = {
    connect: async (): Promise<ClientSql> => ({
      async query(texte, valeurs) {
        requetes.push({ texte, valeurs });
        if (texte === SQL_EXECUTIONS) return { rows: lignes };
        if (texte === SQL_DERNIERE_PURGE) return { rows: [{ derniere }] };
        if (texte === SQL_CONTENU) return { rows: lignes };
        throw new Error("requête inattendue");
      },
      release: () => void (liberations += 1),
    }),
  };
  return { pool, requetes, liberations: () => liberations };
}

describe("p0: lecture du suivi (adaptateur)", () => {
  it("phases et statuts égaux à PHASES (src/prototype/arret.ts) et au CHECK de prototype.runs", () => {
    expect([...PHASES_SUIVIES]).toEqual([...PHASES]);
    expect([...STATUTS_EXECUTION]).toEqual(["en_cours", "programme_ecrit", "arretee"]);
  });

  it("requêtes : runs, purges et programmes seulement, aucune valeur interpolée", () => {
    for (const sql of [SQL_EXECUTIONS, SQL_DERNIERE_PURGE, SQL_CONTENU]) {
      expect(sql).not.toMatch(/run_candidates|forfaits|place_coordinates|positions|\$\{/);
    }
    expect(SQL_EXECUTIONS).toMatch(/FROM prototype\.runs ORDER BY started_at DESC/);
    // Écoulé : pendant l'exécution seulement (S4).
    expect(SQL_EXECUTIONS).toMatch(/CASE WHEN status = 'en_cours'/);
    expect(SQL_CONTENU).toBe("SELECT contenu FROM prototype.programmes WHERE run_id = $1::uuid");
  });

  it("exécution finie et exécution en cours : champs rendus ; une connexion, libérée", async () => {
    const b = base([EN_COURS, LIGNE]);
    const suivi = await lireSuivi(b.pool);
    expect(suivi.dernierePurge).toBe("2026-10-14T03:00:00Z");
    expect(suivi.executions).toEqual([
      {
        id: LIGNE.id,
        mode: "reel",
        brief: "edimbourg-1.json",
        variante: "B",
        statut: "en_cours",
        phase: "ancrage",
        codeArret: null,
        coutModelesMicros: 120_000,
        ecouleMs: 61_000,
        jourQuota: "2026-10-15",
        canaryOk: null,
        commitSha: "c".repeat(40),
      },
      {
        id: LIGNE.id,
        mode: "reel",
        brief: "edimbourg-1.json",
        variante: "B",
        statut: "arretee",
        phase: null,
        codeArret: "upstream_unavailable",
        coutModelesMicros: null,
        ecouleMs: null,
        jourQuota: "2026-10-15",
        canaryOk: null,
        commitSha: "c".repeat(40),
      },
    ]);
    expect(b.requetes.map((r) => r.texte)).toEqual([SQL_EXECUTIONS, SQL_DERNIERE_PURGE]);
    expect(b.liberations()).toBe(1);
  });

  it("au plus EXECUTIONS_MAX exécutions : la requête en demande une de plus ; au-delà, échec `base` (jamais tronqué)", async () => {
    expect(EXECUTIONS_MAX).toBe(1000);
    expect(SQL_EXECUTIONS).toMatch(/ORDER BY started_at DESC, id LIMIT 1001$/);
    expect((await lireSuivi(base(Array.from({ length: EXECUTIONS_MAX }, () => LIGNE)).pool)).executions).toHaveLength(EXECUTIONS_MAX);
    const b = base(Array.from({ length: EXECUTIONS_MAX + 1 }, () => LIGNE));
    await expect(lireSuivi(b.pool)).rejects.toEqual(new EchecSuivi("base"));
    expect(b.liberations()).toBe(1);
  });

  it("aucune purge : null ; écoulé négatif (horloge) : zéro", async () => {
    const suivi = await lireSuivi(base([{ ...EN_COURS, ecoule_ms: "-3" }], null).pool);
    expect(suivi.dernierePurge).toBeNull();
    expect(suivi.executions[0]?.ecouleMs).toBe(0);
  });

  it.each([
    ["statut inconnu", { status: "fini" }],
    ["phase inconnue", { ...EN_COURS, phase: "x" }],
    ["mode inconnu", { mode: "demo" }],
    ["variante inconnue", { variant: "C" }],
    ["brief hors forme", { brief: "../x.json" }],
    ["commit hors forme", { commit_sha: "abc" }],
    ["uuid hors forme", { id: "1" }],
    ["jour hors forme", { jour_quota: "15/10/2026" }],
    ["canari non booléen", { canary_ok: "true" }],
    ["coût non entier", { ...EN_COURS, cost_models_micros: "1.5" }],
    ["code d'arrêt hors forme", { stop_code: "Pipeline Failed!" }],
    // Invariants de S4 : rien de l'exécution ne reste après sa fin ; code d'arrêt si et seulement si arrêtée.
    ["coût après la fin", { cost_models_micros: "10000" }],
    ["écoulé après la fin", { ecoule_ms: "5" }],
    ["phase après la fin", { phase: "recherche" }],
    ["arrêtée sans code", { stop_code: null }],
    ["programme écrit avec code", { status: "programme_ecrit" }],
  ])("ligne illisible (%s) : EchecSuivi base, connexion libérée", async (_cas, champs) => {
    const b = base([{ ...LIGNE, ...champs }]);
    await expect(lireSuivi(b.pool)).rejects.toMatchObject({ name: "EchecSuivi", code: "base" });
    expect(b.liberations()).toBe(1);
  });

  it("date de purge hors forme : base ; connexion ou requête en échec : base, sans le message", async () => {
    await expect(lireSuivi(base([], "hier").pool)).rejects.toMatchObject({ code: "base" });
    const SENTINELLE = "SENTINELLE_MESSAGE_PG";
    const panne: PoolSql = { connect: async () => Promise.reject(new Error(SENTINELLE)) };
    const echec = await lireSuivi(panne).catch((e: unknown) => e);
    expect(echec).toBeInstanceOf(EchecSuivi);
    expect(String((echec as Error).message)).not.toContain(SENTINELLE);
  });

  it("contenu du programme : paramètre lié, null s'il n'y en a pas ; identifiant refusé sans requête", async () => {
    const vide = base([]);
    expect(await lireContenuProgramme(vide.pool, LIGNE.id)).toBeNull();
    expect(vide.requetes).toEqual([{ texte: SQL_CONTENU, valeurs: [LIGNE.id] }]);
    expect(await lireContenuProgramme(base([{ contenu: { schema: 1 } }]).pool, LIGNE.id)).toEqual({ schema: 1 });
    await expect(lireContenuProgramme(base([{ contenu: 1 }, { contenu: 2 }]).pool, LIGNE.id)).rejects.toMatchObject({ code: "base" });
    const refus = base([]);
    await expect(lireContenuProgramme(refus.pool, "x'; DROP TABLE y; --")).rejects.toMatchObject({ code: "entree_refusee" });
    expect(refus.requetes).toEqual([]);
  });
});
