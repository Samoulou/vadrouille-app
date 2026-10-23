// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { valeurCookieAcces } from "@/server/p0/acces";
import { clesRevision } from "@/server/p0/cles-revision";
import { reviserVoyageSaisi, type CleRevisionLue, type DemandeRevisionSaisi } from "@/server/p0/lancement";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Révision d'un voyage de l'app après le tri (E2E-essai, lot 4 ; décision 0126) : même garde que le lancement (code
 * d'accès, `P0RUN_COMPLET`, verrou S8, réservation), forfait `revision`, clés déterministes par voyage (deux au plus).
 * Tout sur doubles : aucun SDK, aucune base, aucune clé.
 */

const RUN = "66666666-6666-4666-8666-666666666666";
const TRIP = "proto_rome_44444444444444448444444444444444";

const d = vi.hoisted(() => ({
  ouvert: true,
  jeton: Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(32))),
  complet: true,
  journal: [] as string[],
  verrouLeve: true,
  tient: true,
  reservation: { ok: true, runId: "66666666-6666-4666-8666-666666666666" } as unknown,
  demarrage: { ok: true, workflowRunId: "wrun_r" } as unknown,
  reserver: vi.fn(),
  demarrer: vi.fn(),
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
vi.mock("@/workflows", () => {
  // Double de `choixRevisionValides` (le vrai est testé dans `tests/unit/p0/revision.test.ts`) : identifiants maison,
  // au moins un « Pas pour moi », sans recouvrement.
  const ID = /^j[0-9]{1,2}-[0-9]{1,2}$/;
  const choixRevisionValides = ({ tripId, pasPourMoi, jAime }: { tripId: unknown; pasPourMoi: unknown; jAime: unknown }) =>
    typeof tripId === "string" &&
    Array.isArray(pasPourMoi) &&
    pasPourMoi.length > 0 &&
    Array.isArray(jAime) &&
    [...pasPourMoi, ...jAime].every((id) => typeof id === "string" && ID.test(id)) &&
    !jAime.some((id) => pasPourMoi.includes(id));
  return {
    get P0RUN_COMPLET() {
      d.journal.push("complet");
      return d.complet;
    },
    REVISIONS_PAR_VOYAGE: 1,
    NOMS_BRIEFS: [],
    briefLancable: () => false,
    briefTientDansLeMode: () => false,
    choixRevisionValides,
    validerBriefSaisi: (brut: unknown) => {
      d.journal.push("valider");
      return brut === null ? { ok: false } : { ok: true, brief: brut };
    },
    briefSaisiTientDansLeMode: (mode: string) => {
      d.journal.push(`plafonds:${mode}`);
      return d.tient;
    },
    lancementDuMode: (mode: string, sorte: string, plafonds?: unknown) => {
      d.journal.push(`mode:${mode}:${sorte}${plafonds === undefined ? "" : ":plafonds"}`);
      return { forfait: { nature: mode, sorte, ...(plafonds === undefined ? {} : { plafonds }) }, regles: { dureeMaxMs: 900_000 } };
    },
    plafondsGoogleRevision: (mode: string, version: unknown, tripId: string, logements: number) => {
      d.journal.push("plafonds");
      return version === null ? null : { textSearch: 10 + logements, details: 10 + logements, routesRequetes: 4, routesElements: 40, tripId };
    },
    verrouS8Leve: async () => {
      d.journal.push("s8");
      return d.verrouLeve;
    },
    startWorkflow: async () => {
      throw new Error("p0Run ne doit pas démarrer pour une révision");
    },
    demarrerRevision: async (...args: unknown[]) => {
      d.journal.push("demarrer");
      d.demarrer(...args);
      return d.demarrage;
    },
    cloreExecutionNonDemarree: async () => {
      d.journal.push("clore");
    },
  };
});
vi.mock("@/server/usage/neon", () => ({
  BRIEF_SAISI: "saisi",
  MARGE_ORPHELINE_MS: 300_000,
  reserverExecution: async (...args: unknown[]) => {
    d.journal.push("reserver");
    d.reserver(...args);
    return d.reservation;
  },
}));

const pool: PoolSql = {
  connect: async (): Promise<ClientSql> => {
    throw new Error("aucune connexion attendue");
  },
};

const BRIEF_VERSION = { destination: "Rome", recit: "brief de la version servie", logements: [{ texte: "Rome", nuits: 4 }] };
const DEMANDE: DemandeRevisionSaisi = { tripId: TRIP, pasPourMoi: ["j1-2"], jAime: ["j1-1"] };
const CLES = clesRevision(TRIP, 1);

let briefVersion: unknown;
let version: unknown;
let ecrites: CleRevisionLue[];
const cookieValide = () => valeurCookieAcces(d.jeton, Date.now());
/** Cookie valide par défaut ; `cookie` passé (même `undefined`) : celui-là. */
const reviser = (demande: DemandeRevisionSaisi = DEMANDE, ...cookie: [string | undefined] | []) =>
  reviserVoyageSaisi(demande, {
    cookie: cookie.length === 0 ? cookieValide() : cookie[0],
    pool: () => pool,
    briefVersion: async (_pool, tripId) => {
      d.journal.push(`version:${tripId}`);
      return structuredClone(briefVersion);
    },
    clesEcrites: async (_pool, cles) => {
      d.journal.push(`cles:${cles.length}`);
      return ecrites.filter((cle) => cles.includes(cle.requestId));
    },
    versionServie: async (_pool, tripId) => {
      d.journal.push(`servie:${tripId}`);
      return version;
    },
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL_ENV", "preview");
  Object.assign(d, { ouvert: true, complet: true, journal: [], verrouLeve: true, tient: true });
  d.reservation = { ok: true, runId: RUN };
  d.demarrage = { ok: true, workflowRunId: "wrun_r" };
  briefVersion = BRIEF_VERSION;
  version = { trip: { id: TRIP } };
  ecrites = [];
  vi.spyOn(console, "log").mockImplementation(() => undefined);
});

describe("p0: révision d'un voyage de l'app après le tri (E2E-essai, lot 4 ; décision 0126)", () => {
  it("chemin nominal : même garde que le lancement, forfait revision, brief de la version recopié sous la première clé, p0Revision démarré", async () => {
    expect(await reviser()).toEqual({ statut: "lancee" });
    expect(d.journal).toEqual([
      "garde",
      "complet",
      "mode:essai:revision",
      "commit",
      "s8",
      `version:${TRIP}`,
      "valider",
      "plafonds:essai",
      "cles:1",
      `servie:${TRIP}`,
      "plafonds",
      "mode:essai:revision:plafonds",
      "reserver",
      "demarrer",
    ]);
  });

  it("réservation : nature essai, variante A, brief saisi sous la première clé libre ; démarrage avec les seuls identifiants", async () => {
    await reviser();
    const [, execution] = d.reserver.mock.calls[0] as [unknown, Record<string, unknown>];
    // Plafonds Google réduits au besoin de la version servie (mineur 9 de la revue de la PR 717 ; 0126 § 2).
    expect(execution).toMatchObject({
      mode: "essai",
      brief: "saisi",
      variant: "A",
      forfait: { sorte: "revision", plafonds: { textSearch: 11, details: 11, routesRequetes: 4, routesElements: 40, tripId: TRIP } },
      briefSaisi: { requestId: CLES[0], contenu: BRIEF_VERSION },
    });
    const [, choix] = d.demarrer.mock.calls[0] as [unknown, Record<string, unknown>];
    expect(choix).toEqual({ tripId: TRIP, pasPourMoi: ["j1-2"], jAime: ["j1-1"] });
  });

  it("une seule révision par voyage (réponse de Samuel du 2026-10-23) : clé terminée ou arrêtée : epuisees ; en cours : en_cours ; rien n'est réservé", async () => {
    expect(CLES).toHaveLength(1);
    for (const statut of ["programme_ecrit", "arretee"]) {
      ecrites = [{ requestId: CLES[0]!, statut, ecouleMs: 60_000 }];
      expect(await reviser()).toEqual({ statut: "epuisees" });
    }
    ecrites = [{ requestId: CLES[0]!, statut: "en_cours", ecouleMs: 60_000 }];
    expect(await reviser()).toEqual({ statut: "en_cours" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("révision orpheline (en_cours au-delà de dureeMaxMs + marge, ou d'âge illisible) : clé prise, plus « en cours » : epuisees (bloquant 3 de la revue de la PR 717)", async () => {
    // Double du mode : dureeMaxMs 900 000 ms ; marge des orphelines 300 000 ms.
    ecrites = [{ requestId: CLES[0]!, statut: "en_cours", ecouleMs: 900_000 + 300_000 }];
    expect(await reviser()).toEqual({ statut: "en_cours" });
    ecrites = [{ requestId: CLES[0]!, statut: "en_cours", ecouleMs: 900_000 + 300_001 }];
    expect(await reviser()).toEqual({ statut: "epuisees" });
    ecrites = [{ requestId: CLES[0]!, statut: "en_cours", ecouleMs: null }];
    expect(await reviser()).toEqual({ statut: "epuisees" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("statut inattendu d'une clé : prise, jamais « en cours » ni libre (mineur 7 de la revue de la PR 717)", async () => {
    ecrites = [{ requestId: CLES[0]!, statut: "inconnu", ecouleMs: 1 }];
    expect(await reviser()).toEqual({ statut: "epuisees" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("clé trouvée écrite par la réservation (demande simultanée) : en_cours, jamais redémarrée", async () => {
    d.reservation = { ok: true, runId: RUN, existante: true };
    expect(await reviser()).toEqual({ statut: "en_cours" });
    expect(d.demarrer).not.toHaveBeenCalled();
  });

  it("cookie absent, P0RUN_COMPLET faux, verrou S8 fermé : refus sans réservation", async () => {
    expect(await reviser(DEMANDE, undefined)).toEqual({ statut: "acces_refuse" });
    d.complet = false;
    expect(await reviser()).toEqual({ statut: "real_mode_unavailable" });
    d.complet = true;
    d.verrouLeve = false;
    expect(await reviser()).toEqual({ statut: "real_mode_unavailable" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("choix mal formés, voyage d'un brief commité, version absente ou d'une autre destination : entree_invalide", async () => {
    for (const demande of [
      { ...DEMANDE, pasPourMoi: [] },
      { ...DEMANDE, pasPourMoi: ["ChIJ-SENTINELLE"] },
      { ...DEMANDE, jAime: ["j1-2"] },
      { ...DEMANDE, tripId: "proto_rome_2026-10-12_1" },
    ]) {
      expect(await reviser(demande as DemandeRevisionSaisi)).toEqual({ statut: "entree_invalide" });
    }
    briefVersion = null;
    expect(await reviser()).toEqual({ statut: "entree_invalide" });
    briefVersion = { destination: "Lisbonne", logements: [] };
    expect(await reviser()).toEqual({ statut: "entree_invalide" });
    briefVersion = BRIEF_VERSION;
    version = null;
    expect(await reviser()).toEqual({ statut: "entree_invalide" });
    version = { trip: { id: TRIP } };
    d.tient = false;
    expect(await reviser()).toEqual({ statut: "brief_hors_plafonds" });
    expect(d.reserver).not.toHaveBeenCalled();
  });

  it("réservation refusée : même statut ; démarrage refusé : demarrage_impossible et exécution close", async () => {
    d.reservation = { ok: false, code: "cap_reached" };
    expect(await reviser()).toEqual({ statut: "cap_reached" });
    d.reservation = { ok: true, runId: RUN };
    d.demarrage = { ok: false, code: "start_failed" };
    expect(await reviser()).toEqual({ statut: "demarrage_impossible" });
    expect(d.journal.slice(-2)).toEqual(["demarrer", "clore"]);
  });

  it("aucun journal ne contient le brief ni les choix", async () => {
    await reviser();
    const journal = JSON.stringify(vi.mocked(console.log).mock.calls);
    expect(journal).not.toContain("brief de la version servie");
    expect(journal).not.toContain("j1-2");
  });
});

describe("p0: clés de révision déterministes (décision 0126 § 5)", () => {
  it("une clé UUID par rang, stable pour un voyage, différente d'un voyage à l'autre", () => {
    const deux = clesRevision(TRIP, 2);
    expect(deux).toHaveLength(2);
    expect(new Set(deux).size).toBe(2);
    for (const cle of deux) expect(cle).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(clesRevision(TRIP, 2)).toEqual(deux);
    expect(clesRevision("proto_rome_55555555555555558555555555555555", 2)).not.toContain(deux[0]);
    expect(clesRevision(TRIP, 1)).toEqual([deux[0]]);
    expect(CLES).toEqual([deux[0]]);
  });
});
