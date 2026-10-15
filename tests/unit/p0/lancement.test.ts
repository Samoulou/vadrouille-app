// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SQL_DERNIERE_PURGE, SQL_EXECUTIONS } from "@/adapters/prototype-suivi";
import { valeurCookieAcces } from "@/server/p0/acces";
import { lancerExecutionP0, STATUTS_LANCEMENT, type DemandeLancement } from "@/server/p0/lancement";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Lancement d'une exécution (P0r3d ; 0055 § 8 ; 0063 points 7 et 10) : garde, contrôles avant réservation (sans rien
 * écrire), réservation, démarrage. Tout sur doubles : module étroit, interface des workflows et réservation simulés ;
 * aucun SDK, aucune base, aucune clé.
 */

const d = vi.hoisted(() => ({
  ouvert: true,
  commit: "d".repeat(40) as string | null,
  jeton: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  complet: true,
  journal: [] as string[],
  verrouLeve: true as boolean | Error,
  lancement: { forfait: { nature: "execution" }, regles: { dureeMaxMs: 900_000 } } as unknown,
  reservation: { ok: true, runId: "44444444-4444-4444-8444-444444444444" } as unknown,
  demarrage: { ok: true, workflowRunId: "wrun_1" } as unknown,
  clore: vi.fn(),
  reserver: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/server/env/p0", () => ({
  CODES_ENV_P0: [],
  CAUSES_ENV_P0: [],
  EXCEPTIONS_ENV_P0: [],
  ZONES_ENV_P0: [],
  VERDICTS_ENV_P0: [],
  lireEnvP0: () => {
    d.journal.push("garde");
    return d.ouvert ? { ok: true, jeton: d.jeton } : { ok: false, code: "branch_refused" };
  },
  decoderJetonSaisi: () => null,
  commitDuDeploiement: () => {
    d.journal.push("commit");
    return d.commit;
  },
}));
vi.mock("@/workflows", () => ({
  get P0RUN_COMPLET() {
    d.journal.push("complet");
    return d.complet;
  },
  NOMS_BRIEFS: ["edimbourg-1.json", "edimbourg-2.json", "casse.json"],
  briefLancable: (nom: string) => nom !== "casse.json",
  lancementDuMode: (mode: string) => {
    d.journal.push(`mode:${mode}`);
    return d.lancement;
  },
  verrouS8Leve: async () => {
    d.journal.push("s8");
    if (d.verrouLeve instanceof Error) throw d.verrouLeve;
    return d.verrouLeve;
  },
  startWorkflow: async (...args: unknown[]) => {
    d.journal.push("start");
    d.start(...args);
    return d.demarrage;
  },
  cloreExecutionNonDemarree: async (pool: unknown, garde: unknown) => {
    d.journal.push("clore");
    return d.clore(pool, garde);
  },
}));
vi.mock("@/server/usage/neon", () => ({
  reserverExecution: async (...args: unknown[]) => {
    d.journal.push("reserver");
    d.reserver(...args);
    return d.reservation;
  },
}));

let lignes: Record<string, unknown>[] = [];
let connexions = 0;
const pool: PoolSql = {
  connect: async (): Promise<ClientSql> => {
    connexions += 1;
    return {
      async query(texte) {
        if (texte === SQL_EXECUTIONS) {
          d.journal.push("suivi");
          return { rows: lignes };
        }
        if (texte === SQL_DERNIERE_PURGE) return { rows: [{ derniere: null }] };
        throw new Error("requête inattendue");
      },
      release: () => undefined,
    };
  },
};
const POOL = () => pool;

const ligne = (champs: Record<string, unknown>) => ({
  id: "55555555-5555-4555-8555-555555555555",
  mode: "reel",
  brief: "edimbourg-1.json",
  variant: "B",
  status: "programme_ecrit",
  phase: null,
  stop_code: null,
  cost_models_micros: null,
  ecoule_ms: null,
  jour_quota: "2026-10-14",
  canary_ok: true,
  commit_sha: "e".repeat(40),
  ...champs,
});

const DEMANDE: DemandeLancement = { mode: "reel", brief: "edimbourg-1.json", variante: "B" };
/** Cookie valide par défaut ; `cookie` passé (même `undefined`) : celui-là. */
const lancer = (demande: DemandeLancement = DEMANDE, ...cookie: [string | undefined] | []) =>
  lancerExecutionP0(demande, { cookie: cookie.length === 0 ? valeurCookieAcces(d.jeton, Date.now()) : cookie[0], pool: POOL });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  d.ouvert = true;
  d.commit = "d".repeat(40);
  d.complet = true;
  d.journal = [];
  d.verrouLeve = true;
  d.lancement = { forfait: { nature: "execution" }, regles: { dureeMaxMs: 900_000 } };
  d.reservation = { ok: true, runId: "44444444-4444-4444-8444-444444444444" };
  d.demarrage = { ok: true, workflowRunId: "wrun_1" };
  lignes = [];
  connexions = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("p0: lancement d'une exécution (P0r3d)", () => {
  it("chemin nominal, dans l'ordre : garde, interrupteur, mode, commit, verrou S8, décompte, réservation, démarrage", async () => {
    expect(await lancer()).toBe("lancee");
    expect(d.journal).toEqual(["garde", "complet", "mode:reel", "commit", "s8", "suivi", "reserver", "start"]);
    expect(d.reserver).toHaveBeenCalledWith(
      pool,
      { mode: "reel", brief: "edimbourg-1.json", variant: "B", commitSha: "d".repeat(40), forfait: { nature: "execution" } },
      { dureeMaxMs: 900_000 },
    );
    expect(d.start).toHaveBeenCalledWith("p0Run", expect.objectContaining({ runId: "44444444-4444-4444-8444-444444444444" }));
    expect(d.clore).not.toHaveBeenCalled();
  });

  it("garde fermée : « fermee », sans connexion, sans réservation ni démarrage", async () => {
    d.ouvert = false;
    expect(await lancer()).toBe("fermee");
    expect(d.journal).toEqual(["garde"]);
    expect(connexions).toBe(0);
  });

  it("cookie absent ou faux : « acces_refuse », aucun contrôle ni connexion (aucun oracle sur le choix)", async () => {
    for (const cookie of [undefined, "v1.0.x", valeurCookieAcces(Buffer.alloc(32, 7), Date.now())]) {
      d.journal = [];
      expect(await lancer({ mode: "x", brief: 1, variante: null }, cookie)).toBe("acces_refuse");
      expect(d.journal).toEqual(["garde"]);
    }
    expect(connexions).toBe(0);
  });

  it("P0RUN_COMPLET faux : real_mode_unavailable sans connexion à la base, sans réservation ni démarrage", async () => {
    d.complet = false;
    expect(await lancer()).toBe("real_mode_unavailable");
    expect(d.journal).toEqual(["garde", "complet"]);
    expect(connexions).toBe(0);
  });

  it.each([
    ["nature inconnue", { ...DEMANDE, mode: "demo" }],
    ["variante inconnue", { ...DEMANDE, variante: "C" }],
    ["brief absent de la liste", { ...DEMANDE, brief: "autre.json" }],
    ["brief invalide", { ...DEMANDE, brief: "casse.json" }],
    ["chemin", { ...DEMANDE, brief: "../edimbourg-1.json" }],
    ["champ non texte", { ...DEMANDE, brief: new Blob(["edimbourg-1.json"]) }],
    ["champs absents", { mode: null, brief: null, variante: null }],
    ["champs cachés vides (aucun choix)", { mode: "", brief: "", variante: "" }],
  ])("choix refusé (%s) : entree_invalide, sans connexion", async (_cas, demande) => {
    expect(await lancer(demande as DemandeLancement)).toBe("entree_invalide");
    expect(connexions).toBe(0);
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("configuration du mode refusée ou commit absent : real_mode_unavailable, sans connexion", async () => {
    d.lancement = null;
    expect(await lancer()).toBe("real_mode_unavailable");
    d.lancement = { forfait: {}, regles: {} };
    d.commit = null;
    expect(await lancer()).toBe("real_mode_unavailable");
    expect(connexions).toBe(0);
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("verrou S8 fermé : real_mode_unavailable avant tout décompte et toute réservation ; erreur de lecture : usage_unavailable", async () => {
    d.verrouLeve = false;
    expect(await lancer()).toBe("real_mode_unavailable");
    expect(d.journal).toEqual(["garde", "complet", "mode:reel", "commit", "s8"]);
    d.verrouLeve = new Error("panne");
    expect(await lancer()).toBe("usage_unavailable");
    expect(d.reserver).not.toHaveBeenCalled();
    expect(d.start).not.toHaveBeenCalled();
  });

  it("décompte atteint : run_quota_reached sans réservation ; un essai passe ; suivi illisible : usage_unavailable", async () => {
    lignes = [ligne({}), ligne({})];
    expect(await lancer()).toBe("run_quota_reached");
    expect(d.reserver).not.toHaveBeenCalled();
    expect(await lancer({ ...DEMANDE, mode: "essai" })).toBe("lancee");
    expect(d.journal).toContain("mode:essai");
    lignes = [ligne({ status: "inconnu" })];
    expect(await lancer()).toBe("usage_unavailable");
  });

  it.each(["daily_quota_insufficient", "envelope_reached", "cap_reached", "usage_unavailable"] as const)(
    "réservation refusée (%s) : même statut, aucun démarrage",
    async (code) => {
      d.reservation = { ok: false, code };
      expect(await lancer()).toBe(code);
      expect(d.start).not.toHaveBeenCalled();
    },
  );

  it("démarrage refusé ou en échec : exécution réservée close (cause externe), demarrage_impossible", async () => {
    for (const code of ["start_failed", "real_mode_unavailable"]) {
      d.demarrage = { ok: false, code };
      d.journal = [];
      expect(await lancer()).toBe("demarrage_impossible");
      expect(d.journal.slice(-2)).toEqual(["start", "clore"]);
    }
    expect(d.clore).toHaveBeenCalledWith(pool, expect.objectContaining({ runId: "44444444-4444-4444-8444-444444444444" }));
    d.clore.mockRejectedValueOnce(new Error("base injoignable"));
    expect(await lancer()).toBe("demarrage_impossible");
  });

  it("statuts : liste fermée, chacun a son texte", async () => {
    const messages = await import("@/i18n/messages");
    expect(Object.keys(messages.prototype.lancement.statuts).sort()).toEqual([...STATUTS_LANCEMENT].sort());
  });
});
