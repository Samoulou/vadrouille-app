import type { ExecutionSuivie } from "@/contracts/prototype-suivi";

/** Exécution suivie de test : finie, programme écrit, sauf champs donnés. */
export function executionSuivie(champs: Partial<ExecutionSuivie> = {}): ExecutionSuivie {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    mode: "reel",
    brief: "edimbourg-1.json",
    variante: "B",
    statut: "programme_ecrit",
    phase: null,
    codeArret: null,
    coutModelesMicros: null,
    ecouleMs: null,
    jourQuota: "2026-10-15",
    canaryOk: true,
    commitSha: "a".repeat(40),
    ...champs,
  };
}

export const arretee = (codeArret: string, champs: Partial<ExecutionSuivie> = {}) => executionSuivie({ statut: "arretee", codeArret, ...champs });
