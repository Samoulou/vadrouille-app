import { readFileSync } from "node:fs";
import path from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { ECHECS_CONSECUTIFS_MAX, RELAIS_ESSAIS_MAX, RELAIS_JOURS } from "@/server/config/rappels";
import type { EtatRappel, SuiteRappel } from "@/server/rappels/etat";

const sdk = vi.hoisted(() => ({ sleep: vi.fn(), start: vi.fn(), getWorkflowMetadata: vi.fn() }));
vi.mock("workflow", () => ({ sleep: sdk.sleep, getWorkflowMetadata: sdk.getWorkflowMetadata }));
vi.mock("workflow/api", () => ({ start: sdk.start }));
const envoi = vi.hoisted(() => ({ reveillerRappel: vi.fn() }));
vi.mock("@/server/rappels/envoi", () => envoi);
const relais = vi.hoisted(() => ({ reclamerRelais: vi.fn() }));
vi.mock("@/server/rappels/relais", () => relais);
const composition = vi.hoisted(() => ({ rappelsDuServeur: vi.fn() }));
vi.mock("@/server/auth", () => composition);
const journal = vi.hoisted(() => ({ logEvent: vi.fn() }));
vi.mock("@/server/log", () => journal);

import { etapeAbandon, etapeReclamationRelais, etapeRelais, etapeReveil, rappelsVeille } from "./rappels";

/**
 * Workflow 7 `rappelsVeille` (M6c, ticket 1021 ; décision 0157 § 1.7 points 1 à 4 et 8 ; spécification M6 § 6.3, critère
 * 11) : SDK simulé (`sleep`, `start`), réveil simulé. Les règles d'envoi sont éprouvées par `src/server/rappels/envoi.test.ts`,
 * le monde local par `tests/e2e/rappels-api.api.spec.ts`. Relais en échec : revue de la PR 1024, bloquant 1 du Tech Lead.
 * Réclamation du relais (R-B, ticket 1075 ; décision 0162 § 3 point 3, § 6.2 critère 2) : `reclamerRelais` simulé, ses
 * règles éprouvées par `src/server/rappels/relais.test.ts` et `tests/db/rappels-relais-reclamation.test.ts`.
 */

const ENTREE: EtatRappel = {
  organizationId: "0a000000-0000-4000-8000-00000000000a",
  tripId: "0b000000-0000-4000-8000-00000000000b",
  userId: "0c000000-0000-4000-8000-00000000000c",
  consentId: "0d000000-0000-4000-8000-00000000000d",
};
const RUN_ID = "wrun_01M6ZWVHNG68KA5EAJ41PT0PCP";
const HEURE = 3_600_000;
const JOUR: SuiteRappel = { suite: "attendre", attenteMs: 24 * HEURE };

function suites(...liste: SuiteRappel[]) {
  for (const suite of liste) envoi.reveillerRappel.mockResolvedValueOnce(suite);
}

beforeEach(() => {
  vi.clearAllMocks();
  envoi.reveillerRappel.mockReset();
  sdk.start.mockReset();
  sdk.sleep.mockResolvedValue(undefined);
  sdk.start.mockResolvedValue({ runId: "wrun_2" });
  sdk.getWorkflowMetadata.mockReturnValue({ workflowRunId: RUN_ID });
  relais.reclamerRelais.mockReset();
  relais.reclamerRelais.mockResolvedValue("acquise");
});

describe("workflow rappelsVeille (M6c)", () => {
  it("directives : quatre étapes use step (réclamation du relais comprise, 0162 § 6.2), un use workflow ; imports du pont seulement ; aucune reprise", () => {
    const source = readFileSync(path.join(process.cwd(), "src/workflows/rappels.ts"), "utf8");
    expect(source.match(/^ +"use step";$/gm)).toHaveLength(4);
    expect(source.match(/^ +"use workflow";$/gm)).toHaveLength(1);
    expect([...source.matchAll(/^import .* from "([^"]+)";$/gm)].map((m) => m[1]).sort()).toEqual([
      "./region",
      "@/server/auth",
      "@/server/config/rappels",
      "@/server/log",
      "@/server/rappels/envoi",
      "@/server/rappels/etat",
      "@/server/rappels/relais",
      "workflow",
      "workflow/api",
    ]);
    expect(source).not.toContain('"fra1"');
    expect(etapeReveil.maxRetries).toBe(0);
    expect(etapeRelais.maxRetries).toBe(0);
    expect(etapeAbandon.maxRetries).toBe(0);
    expect(etapeReclamationRelais.maxRetries).toBe(0);
  });

  it("le réveil reçoit l'état sérialisé seul et la composition des rappels du serveur", async () => {
    suites({ suite: "fin" });
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledWith(ENTREE, { composer: composition.rappelsDuServeur });
    expect(composition.rappelsDuServeur).not.toHaveBeenCalled();
  });

  it("boucle : réveil, sommeil de l'attente rendue, réveil… jusqu'à la fin ; aucun relais avant 7 jours", async () => {
    suites({ suite: "attendre", attenteMs: 5 * HEURE }, JOUR, { suite: "fin" });
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(3);
    expect(sdk.sleep.mock.calls).toEqual([[5 * HEURE], [24 * HEURE]]);
    expect(sdk.start).not.toHaveBeenCalled();
    expect(journal.logEvent).not.toHaveBeenCalled();
  });

  it(`relais (0157 § 1.7 point 8) : au-delà de ${RELAIS_JOURS} jours de sommeil cumulé, une exécution successeur sur le dernier déploiement (région REGION_WORKFLOWS), puis fin`, async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    await rappelsVeille(ENTREE);
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(RELAIS_JOURS + 1);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(sdk.start).toHaveBeenCalledWith(rappelsVeille, [{ ...ENTREE, relayN: 1 }], { region: "fra1", deploymentId: "latest" });
    expect(journal.logEvent).not.toHaveBeenCalled();
  });

  it("étape de relais en échec : rend false sans lever, journalise rappels.relay_failed (nom seul, sans le message du SDK)", async () => {
    sdk.start.mockRejectedValueOnce(new Error("SENTINELLE"));
    expect(await etapeRelais(ENTREE)).toBe(false);
    expect(journal.logEvent.mock.calls).toEqual([["rappels.relay_failed", {}, "warn"]]);
    expect(JSON.stringify(journal.logEvent.mock.calls)).not.toContain("SENTINELLE");
    expect(await etapeRelais(ENTREE)).toBe(true);
    expect(journal.logEvent).toHaveBeenCalledTimes(1);
  });

  it("bloquant 1 : relais en échec, l'exécution continue ses réveils et réessaie avant chaque sommeil ; fin dès qu'un relais réussit", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    sdk.start.mockRejectedValueOnce(new Error("panne")).mockRejectedValueOnce(new Error("panne")).mockResolvedValueOnce({ runId: "wrun_3" });
    await rappelsVeille(ENTREE);
    expect(sdk.start).toHaveBeenCalledTimes(3);
    // Sept sommeils avant le premier essai, puis un après chacun des deux échecs ; un réveil de plus que de sommeils.
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS + 2);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(RELAIS_JOURS + 3);
    expect(journal.logEvent.mock.calls).toEqual([
      ["rappels.relay_failed", {}, "warn"],
      ["rappels.relay_failed", {}, "warn"],
    ]);
  });

  it(`bloquant 1 : relais toujours en échec, ${RELAIS_ESSAIS_MAX} essais, puis fin journalisée rappels.abandoned`, async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    sdk.start.mockRejectedValue(new Error("panne"));
    await rappelsVeille(ENTREE);
    expect(sdk.start).toHaveBeenCalledTimes(RELAIS_ESSAIS_MAX);
    expect(journal.logEvent.mock.calls.filter((c) => c[0] === "rappels.relay_failed")).toHaveLength(RELAIS_ESSAIS_MAX);
    expect(journal.logEvent.mock.calls.at(-1)).toEqual(["rappels.abandoned", {}, "warn"]);
    expect(journal.logEvent).toHaveBeenCalledTimes(RELAIS_ESSAIS_MAX + 1);
  });

  it("bloquant 1 : un réveil qui rend fin pendant les essais de relais termine l'exécution sans autre essai", async () => {
    for (let i = 0; i <= RELAIS_JOURS; i += 1) suites(JOUR);
    suites({ suite: "fin" });
    sdk.start.mockRejectedValue(new Error("panne"));
    await rappelsVeille(ENTREE);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    expect(journal.logEvent.mock.calls).toEqual([["rappels.relay_failed", {}, "warn"]]);
  });

  it(`pannes : ${ECHECS_CONSECUTIFS_MAX} échecs de suite terminent l'exécution (rappels.abandoned) ; une réussite remet le compte à zéro`, async () => {
    const echec: SuiteRappel = { suite: "attendre", attenteMs: HEURE, echec: true };
    suites(echec, echec, { suite: "attendre", attenteMs: HEURE });
    envoi.reveillerRappel.mockResolvedValue(echec);
    await rappelsVeille(ENTREE);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(3 + ECHECS_CONSECUTIFS_MAX);
    expect(journal.logEvent.mock.calls).toEqual([["rappels.abandoned", {}, "warn"]]);
  });
});

describe("workflow rappelsVeille : réclamation du relais (R-B, décision 0162 § 3 point 3)", () => {
  it("la réclamation de la génération 1 précède start, avec l'état et l'identifiant de l'exécution lus une fois ; start reçoit relayN 1", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    const ordre: string[] = [];
    relais.reclamerRelais.mockImplementation(async () => {
      ordre.push("reclamer");
      return "acquise";
    });
    sdk.start.mockImplementation(async () => {
      ordre.push("start");
      return { runId: "wrun_2" };
    });
    await rappelsVeille(ENTREE);
    expect(ordre).toEqual(["reclamer", "start"]);
    expect(relais.reclamerRelais.mock.calls).toEqual([[ENTREE, { relayN: 1, runId: RUN_ID }]]);
    expect(sdk.getWorkflowMetadata).toHaveBeenCalledTimes(1);
    expect(sdk.start).toHaveBeenCalledWith(rappelsVeille, [{ ...ENTREE, relayN: 1 }], { region: "fra1", deploymentId: "latest" });
    expect(journal.logEvent).not.toHaveBeenCalled();
  });

  it("état d'une génération n : réclamation de n + 1, et start reçoit relayN n + 1 (compteur seul)", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    const entree: EtatRappel = { ...ENTREE, relayN: 41 };
    await rappelsVeille(entree);
    expect(relais.reclamerRelais.mock.calls).toEqual([[entree, { relayN: 42, runId: RUN_ID }]]);
    expect(sdk.start.mock.calls).toEqual([[rappelsVeille, [{ ...ENTREE, relayN: 42 }], { region: "fra1", deploymentId: "latest" }]]);
  });

  it("doublon : aucun start, rappels.relay_duplicate (nom seul, info), fin sans autre réveil", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    relais.reclamerRelais.mockResolvedValue("doublon");
    await rappelsVeille(ENTREE);
    expect(sdk.start).not.toHaveBeenCalled();
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(1);
    expect(journal.logEvent.mock.calls).toEqual([["rappels.relay_duplicate", {}, "info"]]);
    expect(envoi.reveillerRappel).toHaveBeenCalledTimes(RELAIS_JOURS + 1);
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS);
  });

  it("fin (accord absent ou retiré, refus de la RLS compris) : aucun start, aucun journal, fin", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    relais.reclamerRelais.mockResolvedValue("fin");
    await rappelsVeille(ENTREE);
    expect(sdk.start).not.toHaveBeenCalled();
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(1);
    expect(journal.logEvent).not.toHaveBeenCalled();
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS);
  });

  it("panne : comptée comme un essai de relais ; nouvelle réclamation avant le sommeil suivant ; acquise ensuite, puis start", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    relais.reclamerRelais.mockResolvedValueOnce("panne").mockResolvedValueOnce("panne").mockResolvedValueOnce("acquise");
    await rappelsVeille(ENTREE);
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(3);
    expect(sdk.start).toHaveBeenCalledTimes(1);
    // Sept sommeils avant la première réclamation, puis un après chacune des deux pannes.
    expect(sdk.sleep).toHaveBeenCalledTimes(RELAIS_JOURS + 2);
  });

  it(`panne toujours : ${RELAIS_ESSAIS_MAX} réclamations, aucun start, puis rappels.abandoned`, async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    relais.reclamerRelais.mockResolvedValue("panne");
    await rappelsVeille(ENTREE);
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(RELAIS_ESSAIS_MAX);
    expect(sdk.start).not.toHaveBeenCalled();
    expect(journal.logEvent.mock.calls).toEqual([["rappels.abandoned", {}, "warn"]]);
  });

  it("pannes puis acquise puis start en échec : un seul compteur d'essais partagé, borne RELAIS_ESSAIS_MAX", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    relais.reclamerRelais.mockResolvedValueOnce("panne").mockResolvedValueOnce("panne").mockResolvedValue("acquise");
    sdk.start.mockRejectedValue(new Error("panne"));
    await rappelsVeille(ENTREE);
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(3);
    expect(sdk.start).toHaveBeenCalledTimes(RELAIS_ESSAIS_MAX - 2);
    expect(journal.logEvent.mock.calls.at(-1)).toEqual(["rappels.abandoned", {}, "warn"]);
  });

  it("après une réclamation acquise et des start en échec : aucune seconde réclamation, chaque essai porte sur la génération réclamée", async () => {
    envoi.reveillerRappel.mockResolvedValue(JOUR);
    sdk.start.mockRejectedValueOnce(new Error("panne")).mockRejectedValueOnce(new Error("panne")).mockResolvedValueOnce({ runId: "wrun_3" });
    await rappelsVeille(ENTREE);
    expect(relais.reclamerRelais).toHaveBeenCalledTimes(1);
    expect(sdk.start).toHaveBeenCalledTimes(3);
    for (const appel of sdk.start.mock.calls) expect(appel[1]).toEqual([{ ...ENTREE, relayN: 1 }]);
  });

  it("étape de réclamation : passe l'état, la génération et l'identifiant ; journalise rappels.relay_duplicate pour un doublon seulement", async () => {
    for (const issue of ["acquise", "fin", "panne"] as const) {
      relais.reclamerRelais.mockResolvedValueOnce(issue);
      expect(await etapeReclamationRelais(ENTREE, 3, RUN_ID)).toBe(issue);
    }
    expect(journal.logEvent).not.toHaveBeenCalled();
    relais.reclamerRelais.mockResolvedValueOnce("doublon");
    expect(await etapeReclamationRelais(ENTREE, 3, RUN_ID)).toBe("doublon");
    expect(journal.logEvent.mock.calls).toEqual([["rappels.relay_duplicate", {}, "info"]]);
    expect(relais.reclamerRelais).toHaveBeenLastCalledWith(ENTREE, { relayN: 3, runId: RUN_ID });
  });

  it("aucun relais avant 7 jours : aucune réclamation, aucune lecture de base pour le relais", async () => {
    suites({ suite: "attendre", attenteMs: 5 * HEURE }, JOUR, { suite: "fin" });
    await rappelsVeille(ENTREE);
    expect(relais.reclamerRelais).not.toHaveBeenCalled();
  });
});
