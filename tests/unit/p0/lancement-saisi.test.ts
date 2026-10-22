// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { Brief, TripDraft } from "@/contracts";
import { valeurCookieAcces } from "@/server/p0/acces";
import { lancerBriefSaisi, relancerBriefSaisi, type DemandeLancementSaisi } from "@/server/p0/lancement";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Lancement depuis l'app sur un brief saisi (E2E-essai, lot 3, critère 3 ; décision 0125 § 2) : même garde et même ordre
 * que `/prototype/executions`, nature `essai`, variante `A`, brief converti puis validé avant toute connexion ; réservation
 * idempotente par `requestId`. Tout sur doubles : aucun SDK, aucune base, aucune clé.
 */

const RUN = "44444444-4444-4444-8444-444444444444";
const TRIP = "proto_rome_44444444444444448444444444444444";

const d = vi.hoisted(() => ({
  ouvert: true,
  jeton: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  complet: true,
  journal: [] as string[],
  verrouLeve: true,
  tient: true,
  valide: null as null | { ok: false; champ?: string },
  reservation: { ok: true, runId: "44444444-4444-4444-8444-444444444444" } as unknown,
  demarrage: { ok: true, workflowRunId: "wrun_1" } as unknown,
  reserver: vi.fn(),
  start: vi.fn(),
}));

vi.mock("@/server/env/p0", () => ({
  CODES_ENV_P0: [],
  CAUSES_ENV_P0: [],
  EXCEPTIONS_ENV_P0: [],
  ZONES_ENV_P0: [],
  VERDICTS_ENV_P0: [],
  DIRECTIVES_ENV_P0: [],
  lireEnvP0: () => {
    d.journal.push("garde");
    return d.ouvert ? { ok: true, jeton: d.jeton } : { ok: false, code: "branch_refused" };
  },
  decoderJetonSaisi: () => null,
  commitDuDeploiement: () => {
    d.journal.push("commit");
    return "d".repeat(40);
  },
}));
vi.mock("@/workflows", () => ({
  get P0RUN_COMPLET() {
    d.journal.push("complet");
    return d.complet;
  },
  NOMS_BRIEFS: [],
  briefLancable: () => false,
  briefTientDansLeMode: () => false,
  validerBriefSaisi: (brut: unknown) => {
    d.journal.push("valider");
    return d.valide ?? (brut === null ? { ok: false } : { ok: true, brief: brut });
  },
  briefSaisiTientDansLeMode: (mode: string) => {
    d.journal.push(`plafonds:${mode}`);
    return d.tient;
  },
  lancementDuMode: (mode: string) => {
    d.journal.push(`mode:${mode}`);
    return { forfait: { nature: mode }, regles: { dureeMaxMs: 900_000 } };
  },
  verrouS8Leve: async () => {
    d.journal.push("s8");
    return d.verrouLeve;
  },
  startWorkflow: async (...args: unknown[]) => {
    d.journal.push("start");
    d.start(...args);
    return d.demarrage;
  },
  cloreExecutionNonDemarree: async () => {
    d.journal.push("clore");
  },
}));
vi.mock("@/server/usage/neon", () => ({
  BRIEF_SAISI: "saisi",
  reserverExecution: async (...args: unknown[]) => {
    d.journal.push("reserver");
    d.reserver(...args);
    return d.reservation;
  },
}));

let connexions = 0;
const pool: PoolSql = {
  connect: async (): Promise<ClientSql> => {
    connexions += 1;
    throw new Error("aucune connexion attendue");
  },
};

const DRAFT: TripDraft = { destination: "Rome", start: "2027-05-04", end: "2027-05-08", lodging: { kind: "none" }, otherCities: [], commitments: [] };
const BRIEF: Brief = { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["heritage"], limits: [], mobility: [], inferredFields: [] };
const DEMANDE: DemandeLancementSaisi = { requestId: "11111111-1111-4111-8111-111111111111", draft: DRAFT, brief: BRIEF, recit: "On aime la Rome antique et les trattorias." };

const cookieValide = () => valeurCookieAcces(d.jeton, Date.now());
/** Cookie valide par défaut ; `cookie` passé (même `undefined`) : celui-là. */
const lancer = (demande: DemandeLancementSaisi = DEMANDE, ...cookie: [string | undefined] | []) =>
  lancerBriefSaisi(demande, { cookie: cookie.length === 0 ? cookieValide() : cookie[0], pool: () => pool });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  d.ouvert = true;
  d.complet = true;
  d.journal = [];
  d.verrouLeve = true;
  d.tient = true;
  d.valide = null;
  d.reservation = { ok: true, runId: RUN };
  d.demarrage = { ok: true, workflowRunId: "wrun_1" };
  connexions = 0;
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("p0: lancement d'un brief saisi depuis l'app (E2E-essai, lot 3)", () => {
  it("chemin nominal : même ordre que /prototype/executions, nature essai, variante A, brief saisi réservé, voyage connu", async () => {
    expect(await lancer()).toEqual({ statut: "lancee", tripId: TRIP });
    expect(d.journal).toEqual(["garde", "complet", "valider", "mode:essai", "commit", "plafonds:essai", "s8", "reserver", "start"]);
    const [, execution] = d.reserver.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(execution).toMatchObject({ mode: "essai", brief: "saisi", variant: "A", forfait: { nature: "essai" } });
    expect(execution.briefSaisi).toMatchObject({ requestId: DEMANDE.requestId, contenu: { destination: "Rome", pays: "Italie", recit: DEMANDE.recit } });
    expect(d.start).toHaveBeenCalledWith("p0Run", expect.objectContaining({ runId: RUN }));
  });

  it("garde fermée ou cookie absent : refus sans connexion, sans conversion ni réservation", async () => {
    d.ouvert = false;
    expect(await lancer()).toEqual({ statut: "fermee" });
    d.ouvert = true;
    d.journal = [];
    expect(await lancer(DEMANDE, undefined)).toEqual({ statut: "acces_refuse" });
    expect(d.journal).toEqual(["garde"]);
    expect(connexions).toBe(0);
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("P0RUN_COMPLET faux : real_mode_unavailable avant la conversion", async () => {
    d.complet = false;
    expect(await lancer()).toEqual({ statut: "real_mode_unavailable" });
    expect(d.journal).toEqual(["garde", "complet"]);
  });

  it("refus de la conversion : entree_invalide avec son champ, sans réservation", async () => {
    expect(await lancer({ ...DEMANDE, draft: { ...DRAFT, destination: "Atlantide" } })).toEqual({ statut: "entree_invalide", champ: "draft.destination" });
    expect(d.journal).toEqual(["garde", "complet"]);
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("refus de BriefSchema (récit) : entree_invalide sur story, sans réservation", async () => {
    d.valide = { ok: false, champ: "story" };
    expect(await lancer()).toEqual({ statut: "entree_invalide", champ: "story" });
    d.valide = { ok: false };
    expect(await lancer()).toEqual({ statut: "entree_invalide" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("hors plafonds du mode, verrou S8 fermé : refus sans réservation", async () => {
    d.tient = false;
    expect(await lancer()).toEqual({ statut: "brief_hors_plafonds" });
    d.tient = true;
    d.verrouLeve = false;
    expect(await lancer()).toEqual({ statut: "real_mode_unavailable" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("même requestId : exécution existante rendue, jamais redémarrée", async () => {
    d.reservation = { ok: true, runId: RUN, existante: true };
    expect(await lancer()).toEqual({ statut: "lancee", tripId: TRIP });
    expect(d.start).not.toHaveBeenCalled();
  });

  it("réservation refusée : même statut, sans voyage ; démarrage refusé : demarrage_impossible", async () => {
    d.reservation = { ok: false, code: "cap_reached" };
    expect(await lancer()).toEqual({ statut: "cap_reached" });
    d.reservation = { ok: true, runId: RUN };
    d.demarrage = { ok: false, code: "start_failed" };
    expect(await lancer()).toEqual({ statut: "demarrage_impossible" });
    expect(d.journal.slice(-2)).toEqual(["start", "clore"]);
  });

  it("aucun journal ne contient le brief ni le récit", async () => {
    const log = vi.mocked(console.log);
    await lancer();
    expect(JSON.stringify(log.mock.calls)).not.toContain("Rome antique");
  });
});

describe("p0: « Réessayer » d'un voyage de l'app arrêté (E2E-essai, lot 3, critère 5)", () => {
  const briefArrete = vi.fn<(pool: PoolSql, tripId: string) => Promise<unknown>>(async () => ({ destination: "Rome", recit: "brief relu" }));

  it("brief de l'exécution arrêtée relu dans la réservation, revalidé, nouvelle exécution et nouveau voyage", async () => {
    const NOUVEAU = "55555555-5555-4555-8555-555555555555";
    d.reservation = { ok: true, runId: NOUVEAU };
    const issue = await relancerBriefSaisi({ tripId: TRIP, requestId: "22222222-2222-4222-8222-222222222222" }, { cookie: cookieValide(), pool: () => pool, briefArrete });
    expect(issue).toEqual({ statut: "lancee", tripId: "proto_rome_55555555555545558555555555555555" });
    expect(briefArrete).toHaveBeenCalledWith(pool, TRIP);
    const [, execution] = d.reserver.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(execution).toMatchObject({ mode: "essai", brief: "saisi", briefSaisi: { requestId: "22222222-2222-4222-8222-222222222222" } });
  });

  it("aucun brief arrêté (inconnu, en cours, écrit) : entree_invalide, rien n'est réservé ; cookie absent : sans lecture", async () => {
    briefArrete.mockResolvedValueOnce(null);
    expect(await relancerBriefSaisi({ tripId: TRIP, requestId: DEMANDE.requestId }, { cookie: cookieValide(), pool: () => pool, briefArrete })).toEqual({ statut: "entree_invalide" });
    briefArrete.mockClear();
    expect(await relancerBriefSaisi({ tripId: TRIP, requestId: DEMANDE.requestId }, { cookie: undefined, pool: () => pool, briefArrete })).toEqual({ statut: "acces_refuse" });
    expect(briefArrete).not.toHaveBeenCalled();
    expect(d.reserver).not.toHaveBeenCalled();
  });
});
