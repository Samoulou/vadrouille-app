// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import { CODE_CLE_ABSENTE, CODES_ERREUR_IA } from "@/ai/erreurs";
import { CODES_ECHEC_ECRITURE } from "@/contracts/prototype-ecriture";
import { CODES_ECHEC_TRAVAIL } from "@/contracts/prototype-travail";
import { ErreurBudgetRoutes } from "@/grounding/budget-routes";
import { CODES_ERREUR_GOOGLE, ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { CODES_ERREUR_ANCRAGE, ErreurAncrage } from "@/grounding/interfaces";
import { CODES_ARRET, PHASES } from "@/prototype/arret";
import { ReductionRefusee } from "@/prototype/reduction";
import { formatLogLine, LOG_EVENTS, LOG_STEP_FAILURE_CODES, LOG_STEP_PHASES } from "@/server/log";
import { champsEchecEtape, codeFermeDe, journaliserEchecEtape, PHASES_JOURNAL } from "@/server/p0/journal-etape";

/**
 * Journal fermé de l'arrêt d'une étape de `p0Run` (ticket 493 ; verdict Sécurité S4 attendu) : `p0.step_failed`,
 * avec la phase, la classe de l'erreur et son code fermé ; aucun message, aucune donnée Google, aucun identifiant.
 */

afterEach(() => vi.restoreAllMocks());

const SENTINELLE = "SENTINELLE-ChIJ-placeId-1234s-48.85";

describe("p0: journal de l'arrêt d'une étape (p0.step_failed)", () => {
  it("l'événement est dans la liste fermée", () => {
    expect(LOG_EVENTS).toContain("p0.step_failed");
  });

  it("LOG_STEP_FAILURE_CODES = union des listes fermées des erreurs d'étape, plus `autre`", () => {
    const union = new Set<string>([
      ...CODES_ERREUR_GOOGLE,
      ...CODES_ERREUR_ANCRAGE,
      ...CODES_ERREUR_IA,
      ...CODES_ARRET,
      ...CODES_ECHEC_TRAVAIL,
      ...CODES_ECHEC_ECRITURE,
      new ReductionRefusee().code,
      new ErreurBudgetRoutes().code,
      "autre",
    ]);
    expect(new Set(LOG_STEP_FAILURE_CODES)).toEqual(union);
    expect(LOG_STEP_FAILURE_CODES.length).toBe(union.size);
    expect(LOG_STEP_FAILURE_CODES).toContain(CODE_CLE_ABSENTE);
  });

  it("LOG_STEP_PHASES = phases de prototype.runs plus fiches, routes et moteur ; égale au type du module", () => {
    expect([...LOG_STEP_PHASES]).toEqual([...PHASES_JOURNAL]);
    expect(new Set(LOG_STEP_PHASES)).toEqual(new Set([...PHASES, "fiches", "routes", "moteur"]));
  });

  it.each([
    ["routes", new ErreurClientGoogle("invalid_response"), { phase: "routes", errorName: "ErreurClientGoogle", failureCode: "invalid_response" }],
    ["routes", new ErreurClientGoogle("upstream_rate_limited"), { phase: "routes", errorName: "ErreurClientGoogle", failureCode: "upstream_rate_limited" }],
    ["routes", new ErreurBudgetRoutes(), { phase: "routes", errorName: "ErreurBudgetRoutes", failureCode: "cap_reached" }],
    ["planification", new ErreurAncrage("lodging_unresolved"), { phase: "planification", errorName: "ErreurAncrage", failureCode: "lodging_unresolved" }],
    ["moteur", new RangeError(SENTINELLE), { phase: "moteur", errorName: "RangeError", failureCode: "autre" }],
    ["validation", new ReductionRefusee(), { phase: "validation", errorName: "Error", failureCode: "reduction_refused" }],
  ] as const)("%s : %o", (phase, erreur, attendu) => {
    expect(champsEchecEtape(phase, erreur)).toEqual(attendu);
  });

  it("code hors liste, code non textuel, valeur non objet ou accesseur qui lève : `autre`, jamais la valeur", () => {
    expect(codeFermeDe(Object.assign(new Error(SENTINELLE), { code: SENTINELLE }))).toBe("autre");
    expect(codeFermeDe(Object.assign(new Error("x"), { code: 42 }))).toBe("autre");
    expect(codeFermeDe(SENTINELLE)).toBe("autre");
    expect(codeFermeDe(null)).toBe("autre");
    const piege = Object.defineProperty({}, "code", {
      get() {
        throw new Error(SENTINELLE);
      },
    });
    expect(codeFermeDe(piege)).toBe("autre");
  });

  it("la ligne écrite ne contient ni message, ni pile, ni valeur de l'erreur ; niveau error", () => {
    const ecrit = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const erreur = Object.assign(new ErreurClientGoogle("invalid_response"), { cause: SENTINELLE, details: SENTINELLE });
    erreur.message = SENTINELLE;
    journaliserEchecEtape("routes", erreur);
    expect(ecrit).toHaveBeenCalledTimes(1);
    const ligne = String(ecrit.mock.calls[0]?.[0]);
    expect(JSON.parse(ligne)).toEqual({
      level: "error",
      event: "p0.step_failed",
      phase: "routes",
      errorName: "ErreurClientGoogle",
      failureCode: "invalid_response",
    });
    expect(ligne).not.toContain("SENTINELLE");
  });

  it("champs refusés par le journal : phase ou code hors liste retirés (dropped)", () => {
    const ligne = JSON.parse(formatLogLine("p0.step_failed", { phase: SENTINELLE, failureCode: SENTINELLE, errorName: "ErreurClientGoogle" }, "error"));
    expect(ligne).toEqual({ level: "error", event: "p0.step_failed", errorName: "ErreurClientGoogle", dropped: 2 });
  });

  it("ne lève jamais, même si l'écriture échoue", () => {
    vi.spyOn(console, "error").mockImplementation(() => {
      throw new Error("console");
    });
    expect(() => journaliserEchecEtape("routes", new Error("x"))).not.toThrow();
  });
});
