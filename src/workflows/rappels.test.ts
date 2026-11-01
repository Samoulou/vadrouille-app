import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ECHECS_CONSECUTIFS_MAX, RELAIS_JOURS } from "@/server/config/rappels";
import type { EtatRappel, SuiteRappel } from "@/server/rappels/etat";

const sdk = vi.hoisted(() => ({ sleep: vi.fn(), start: vi.fn() }));
vi.mock("workflow", () => ({ sleep: sdk.sleep }));
vi.mock("workflow/api", () => ({ start: sdk.start }));
const envoi = vi.hoisted(() => ({ reveillerRappel: vi.fn() }));
vi.mock("@/server/rappels/envoi", () => envoi);
const composition = vi.hoisted(() => ({ rappelsDuServeur: vi.fn() }));
vi.mock("@/server/auth", () => composition);

import { etapeRelais, etapeReveil, rappelsVeille } from "./rappels";

/**
 * Workflow 7 `rappelsVeille` (M6c, ticket 1021 ; décision 0157 § 1.7 points 1 à 4 et 8 ; spécification M6 § 6.3, critère
 * 11) : SDK simulé (`sleep`, `start`), réveil simulé. Les règles d'envoi sont éprouvées par `src/server/rappels/envoi.test.ts`.
 */

const ENTREE: EtatRappel = {
  organizationId: "0a000000-0000-4000-8000-00000000000a",
  tripId: "0b000000-0000-4000-8000-00000000000b",
  userId: "0c000000-0000-4000-8000-00000000000c",
  consentId: "0d000000-0000-4000-8000-00000000000d",
};
const HEURE = 3_600_000;

function suites(...liste: SuiteRappel[]) {
  for (const suite of liste) envoi.reveillerRappel.mockResolvedValueOnce(suite);
}

beforeEach(() => {
  vi.clearAllMocks();
  envoi.reveillerRappel.mockReset();
  sdk.sleep.mockResolvedValue(undefined);
  sdk.start.mockResolvedValue({ runId: "wrun_2" });
});

describe("workflow rappelsVeille (M6c)", () => {
  it("directives : deux étapes use step, un use workflow ; imports du pont seulement ; aucune reprise", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/rappels.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(2);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect([...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort()).toEqual([
      "@/server/auth",
      "@/server/config/rappels",
      "@/server/rappels/envoi",
      "@/server/rappels/etat",
      "workflow",
      "workflow/api",
    ]);
    expect(etapeReveil.maxRetries).toBe(0);
    expect(etapeRelais.maxRetries).toBe(0);
  });

  it("le réveil reçoit l'état sérialisé seul et la composition des rappels du serveur", async () => {
    suites({ suite: "fin" });
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledWith(ENTREE, {
      composer: composition.rappelsDuServeur,
    });
    expect(composition.rappelsDuServeur).not.toHaveBeenCalled();
  });

  it("boucle : réveil, sommeil de l'attente rendue, réveil… jusqu'à la fin ; aucun relais avant 7 jours", async () => {
    suites({ suite: "attendre", attenteMs: 5 * HEURE }, { suite: "attendre", attenteMs: 24 * HEURE }, { suite: "fin" });
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(3);
    expect(sdk.sleep.mock.calls).toEqual([[5 * HEURE], [24 * HEURE]]);
    expect(sdk.start).not.toHaveBeenCalled();
  });

  it(`relais (0157 § 1.7 point 8) : au-delà de ${RELAIS_JOURS} jours de sommeil cumulé, une exécution successeur sur le dernier déploiement, puis fin`, async () => {
    envoi.reveillerRappel.mockResolvedValue({
      suite: "attendre",
      attenteMs: 24 * HEURE,
    });
    await rappelsVeille(ENTREE);
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(RELAIS_JOURS + 1);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(sdk.start).toHaveBeenCalledWith(rappelsVeille, [ENTREE], {
      region: "fra1",
      deploymentId: "latest",
    });
  });

  it("relais en échec : l'exécution se termine sans lever (aucun envoi doublé : réclamation par journée)", async () => {
    sdk.start.mockRejectedValueOnce(new Error("SENTINELLE"));
    expect(await etapeRelais(ENTREE)).toBe(false);
    expect(await etapeRelais(ENTREE)).toBe(true);
  });

  it(`pannes : ${ECHECS_CONSECUTIFS_MAX} échecs de suite terminent l'exécution ; une réussite remet le compte à zéro`, async () => {
    const echec: SuiteRappel = {
      suite: "attendre",
      attenteMs: HEURE,
      echec: true,
    };
    suites(echec, echec, { suite: "attendre", attenteMs: HEURE });
    envoi.reveillerRappel.mockResolvedValue(echec);
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(3 + ECHECS_CONSECUTIFS_MAX);
  });
});
