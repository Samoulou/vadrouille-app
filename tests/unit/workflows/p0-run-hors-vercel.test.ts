// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FatalError } from "workflow";

import { etapeAncrage, etapeClore, etapeRecherche, p0Run } from "@/workflows/p0-run";

/**
 * Barrière hors de Vercel (réponse 4 de la Sécurité, PR 326 ; décision 0063 point 8) : la route du SDK est exposée sans
 * authentification propre hors de Vercel (monde local). Ici, la **garde réelle** (`verifierGardeEtape`) est exercée
 * dans un environnement sans aucune variable de Vercel ni du mode réel : chaque étape s'arrête avant toute connexion à
 * la base, toute composition et tout appel ; aucun module de capacité n'est chargé par la garde fermée.
 */

const RUN_ID = "22222222-2222-4222-8222-222222222222";

const d = vi.hoisted(() => ({
  connect: vi.fn(),
  composerP0Reel: vi.fn(),
  chercherCandidats: vi.fn(),
  cloreExecution: vi.fn(),
  lireExecution: vi.fn(),
}));

vi.mock("@/server/p0/base", () => ({ poolPrototype: () => ({ connect: d.connect }) }));
vi.mock("@/server/composition/p0-reel", () => ({ composerP0Reel: d.composerP0Reel }));
// Ticket 407 : vérification d'échéance remise à l'agent ; l'agent étant simulé, toujours le temps.
vi.mock("@/research/agent", () => ({ chercherCandidats: d.chercherCandidats, tempsPourAppel: () => () => true }));
vi.mock("@/adapters/prototype-travail", () => ({
  lireExecution: d.lireExecution,
  ecrirePhase: vi.fn(),
  ecrireCoutModeles: vi.fn(),
  remplacerCandidats: vi.fn(),
  lireCandidats: vi.fn(),
  cloreExecution: d.cloreExecution,
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VERCEL", undefined);
  vi.stubEnv("VERCEL_ENV", undefined);
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", undefined);
  vi.stubEnv("VERCEL_URL", undefined);
  vi.stubEnv("P0_REAL_RUNS", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("p0Run hors de Vercel : garde réelle fermée à chaque étape", () => {
  it.each([
    ["recherche", etapeRecherche],
    ["ancrage", etapeAncrage],
  ])("étape %s : FatalError real_mode_unavailable, aucune connexion, composition ni appel", async (_nom, etape) => {
    const erreur = await etape({ runId: RUN_ID }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(erreur).toBeInstanceOf(FatalError);
    expect((erreur as Error).message).toBe("real_mode_unavailable");
    expect(d.connect).not.toHaveBeenCalled();
    expect(d.lireExecution).not.toHaveBeenCalled();
    expect(d.composerP0Reel).not.toHaveBeenCalled();
    expect(d.chercherCandidats).not.toHaveBeenCalled();
  });

  it("p0Run entier : rien n'est lu, écrit ni appelé ; sortie { runId }", async () => {
    expect(await p0Run({ runId: RUN_ID })).toEqual({ runId: RUN_ID });
    expect(d.connect).not.toHaveBeenCalled();
    expect(d.cloreExecution).not.toHaveBeenCalled();
    expect(d.composerP0Reel).not.toHaveBeenCalled();
  });

  it("clôture : garde fermée, aucune écriture", async () => {
    expect(await etapeClore({ runId: RUN_ID, code: "pipeline_failed" })).toEqual({ runId: RUN_ID });
    expect(d.cloreExecution).not.toHaveBeenCalled();
  });
});
