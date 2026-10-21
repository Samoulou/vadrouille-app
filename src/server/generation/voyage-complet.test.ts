import { afterEach, describe, expect, it, vi } from "vitest";

import type { TripSnapshot } from "@/contracts";

import { lireArguments, reprendreParLeStudio } from "../../../scripts/reprise-studio";
import { signalerSiBloquee } from "./blocage";
import { partDuPassage, plusHautIntroduit, villesDuComplet, villesDuJour } from "./etapes-complet";
import { partCumulee, partDuJour } from "./forfait-etape";
import type { VoyageLu } from "./lecture";
import { CODES_REESSAYABLES } from "./raison-echec";
import { reprendreVoyageComplet, SQL_REPRISE_PERSONNE, SQL_REPRISE_STUDIO } from "./reprise";
import {
  ESPACE_NOMS_VOYAGE_COMPLET,
  estBloquee,
  etapeDuRang,
  identifiantForfait,
  joursDuPassage,
  passageDe,
  rangDuJour,
  requestIdDeVersion,
  uuidV5,
} from "./voyage-complet";

const ID = "3b241101-e2bb-4255-8caf-4136c566a962";
const ORG = "6f9619ff-8b86-4d01-b42d-00c04fc964ff";
const VOYAGE = "0b3e2c4d-5f6a-4b7c-8d9e-0f1a2b3c4d5e";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("voyage complet : identifiants dérivés (0087 § 1.7)", () => {
  it("uuidV5 suit la RFC 9562 (vecteur de l'espace DNS) et rend un UUID de version 5", () => {
    expect(uuidV5("www.example.com", "6ba7b810-9dad-11d1-80b4-00c04fd430c8")).toBe("2ed6657d-e927-568b-95e1-2665a8aea6a2");
    expect(uuidV5("x")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(() => uuidV5("x", "pas-un-uuid")).toThrow(RangeError);
    expect(ESPACE_NOMS_VOYAGE_COMPLET).toBe("7f1b4e2a-9c3d-5e6f-8a0b-1c2d3e4f5a6b");
  });

  it("request_id : déterministe, différent par jour et par passage, jamais égal à l'identifiant du forfait", () => {
    const ligne = { id: ID, reprisesPersonne: 0, reprisesStudio: 0 };
    expect(requestIdDeVersion(ligne, 3)).toBe(requestIdDeVersion({ ...ligne }, 3));
    expect(requestIdDeVersion(ligne, 3)).toBe(uuidV5(`full:${ID}:0:3`));
    expect(requestIdDeVersion(ligne, 3)).not.toBe(requestIdDeVersion(ligne, 4));
    expect(requestIdDeVersion(ligne, 3)).not.toBe(requestIdDeVersion({ ...ligne, reprisesPersonne: 1 }, 3));
    // Le passage compte les reprises de la personne et du studio.
    expect(passageDe({ reprisesPersonne: 2, reprisesStudio: 1 })).toBe(3);
    expect(requestIdDeVersion({ ...ligne, reprisesPersonne: 1 }, 3)).toBe(requestIdDeVersion({ ...ligne, reprisesStudio: 1 }, 3));
    expect(identifiantForfait(ligne)).toBe(uuidV5(`forfait:${ID}:0`));
    expect(identifiantForfait(ligne)).not.toBe(identifiantForfait({ ...ligne, reprisesStudio: 1 }));
    expect(() => requestIdDeVersion(ligne, 0)).toThrow(RangeError);
  });
});

describe("voyage complet : rangs step_seq (0087 § 1.3 point 4)", () => {
  it("a = 1, l = 2, puis 2 + 4i + k ; etapeDuRang en est l'inverse", () => {
    expect([rangDuJour(0, "b"), rangDuJour(0, "c"), rangDuJour(0, "d"), rangDuJour(0, "e")]).toEqual([3, 4, 5, 6]);
    expect(rangDuJour(2, "e")).toBe(14);
    for (let rang = 3; rang < 40; rang += 1) {
      const r = etapeDuRang(rang)!;
      expect(rangDuJour(r.i, r.etape)).toBe(rang);
    }
    expect(etapeDuRang(2)).toBeNull();
    expect(() => rangDuJour(-1, "b")).toThrow(RangeError);
  });
});

describe("voyage complet : jours du passage (0086 § 1.7, B9-PO-7)", () => {
  const jour = (index: number, etapes: number) => ({
    index,
    items: Array.from({ length: etapes }, (_, k) => ({ type: "stop", id: `s${index}-${k}` })),
  });
  const instantane = (jours: ReturnType<typeof jour>[]) => ({ days: jours }) as unknown as TripSnapshot;

  it("jours hors aperçu sans étape, plus ceux que le passage a déjà publiés ; jamais J1 ni J2", () => {
    const v = instantane([jour(1, 0), jour(2, 0), jour(3, 2), jour(4, 0), jour(5, 0)]);
    expect(joursDuPassage(v, new Set())).toEqual([4, 5]);
    expect(joursDuPassage(v, new Set([3]))).toEqual([3, 4, 5]);
    expect(joursDuPassage(instantane([jour(1, 1), jour(2, 1), jour(3, 1)]), new Set())).toEqual([]);
  });
});

describe("voyage complet : état bloqué (0087 § 1.4)", () => {
  const ligne = { phase: "failed", stopReason: "upstream_unavailable", reprisesPersonne: 0, reprisesStudio: 0 };

  it("bloquée : cause non réessayable, compteur de la personne au maximum, ou reprise du studio ; jamais hors failed", () => {
    expect(estBloquee(ligne, 3)).toBe(false);
    expect(estBloquee({ ...ligne, stopReason: "cap_reached" }, 3)).toBe(true);
    expect(estBloquee({ ...ligne, stopReason: null }, 3)).toBe(true);
    expect(estBloquee({ ...ligne, reprisesPersonne: 2 }, 3)).toBe(false);
    expect(estBloquee({ ...ligne, reprisesPersonne: 3 }, 3)).toBe(true);
    expect(estBloquee({ ...ligne, reprisesStudio: 1 }, 3)).toBe(true);
    expect(estBloquee({ ...ligne, phase: "queued", stopReason: "cap_reached" }, 3)).toBe(false);
    for (const code of CODES_REESSAYABLES) expect(estBloquee({ ...ligne, stopReason: code }, 3)).toBe(false);
  });

  it("generation.full_stuck : écrit une fois, identifiants internes et code fermé seulement, et rien pour une ligne non bloquée", () => {
    const espion = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const echec = { id: ID, tripId: VOYAGE, stopReason: "upstream_unavailable", reprisesPersonne: 0, reprisesStudio: 0 };
    expect(signalerSiBloquee(ORG, echec, 3)).toBe(false);
    expect(espion).not.toHaveBeenCalled();
    expect(signalerSiBloquee(ORG, { ...echec, reprisesPersonne: 3 }, 3)).toBe(true);
    expect(espion).toHaveBeenCalledTimes(1);
    const ecrit = JSON.parse(String(espion.mock.calls[0]![0]));
    expect(ecrit).toEqual({ level: "warn", event: "generation.full_stuck", tripId: VOYAGE, organizationId: ORG, generationRunId: ID, stopReason: "upstream_unavailable" });
  });
});

describe("voyage complet : reprise, module feuille (0087 § 1.2 et § 1.3)", () => {
  const executeur = (rows: Record<string, unknown>[] = [{ id: ID }]) => ({ query: vi.fn(async () => ({ rows })) });

  it("personne : une écriture conditionnelle failed → queued, sur les causes, le compteur, le studio et le requestId ; request_id jamais écrit", async () => {
    for (const condition of ["phase = 'failed'", "stop_reason = ANY($5::text[])", "cardinality(person_retry_request_ids) < $6", "studio_retries = 0", "NOT ($3::uuid = ANY(person_retry_request_ids))", "kind = 'full'"]) {
      expect(SQL_REPRISE_PERSONNE).toContain(condition);
    }
    for (const sql of [SQL_REPRISE_PERSONNE, SQL_REPRISE_STUDIO]) {
      expect(sql).toContain("phase = 'queued', step = NULL, step_seq = 0, workflow_run_id = NULL, stop_reason = NULL, finished_at = NULL");
      expect(sql).not.toMatch(/request_id\s*=/);
    }
    const x = executeur();
    const instant = new Date("2026-10-20T10:00:00Z");
    const requestId = "11111111-1111-4111-8111-111111111111";
    await expect(
      reprendreVoyageComplet(x, { organizationId: ORG, tripId: VOYAGE, instant }, { type: "personne", requestId, causesReessayables: CODES_REESSAYABLES, maximum: 3 }),
    ).resolves.toEqual({ generationRunId: ID });
    expect(x.query).toHaveBeenCalledWith(SQL_REPRISE_PERSONNE, [ORG, VOYAGE, requestId, instant.toISOString(), [...CODES_REESSAYABLES], 3]);
  });

  it("studio : aucune condition de cause ni de compteur, compteur du studio incrémenté ; aucune ligne touchée → null", async () => {
    expect(SQL_REPRISE_STUDIO).toContain("studio_retries = studio_retries + 1");
    expect(SQL_REPRISE_STUDIO).not.toContain("person_retry_request_ids");
    expect(SQL_REPRISE_STUDIO).not.toContain("stop_reason = ANY");
    const instant = new Date("2026-10-20T10:00:00Z");
    await expect(reprendreVoyageComplet(executeur([]), { organizationId: ORG, tripId: VOYAGE, instant }, { type: "studio" })).resolves.toBeNull();
  });
});

describe("commande du studio (0087 § 1.6)", () => {
  it("lit --organisation et --voyage (deux UUID) ; tout autre argument est refusé sans toucher la base", async () => {
    expect(lireArguments(["--organisation", ORG, "--voyage", VOYAGE])).toEqual({ organizationId: ORG, tripId: VOYAGE });
    expect(lireArguments(["--voyage", VOYAGE, "--organisation", ORG])).toEqual({ organizationId: ORG, tripId: VOYAGE });
    expect(lireArguments(["--organisation", ORG])).toBeNull();
    expect(lireArguments(["--organisation", "x", "--voyage", VOYAGE])).toBeNull();
    expect(lireArguments(["--organisation", ORG, "--voyage"])).toBeNull();
    const transaction = vi.fn();
    await expect(reprendreParLeStudio(["--voyage", VOYAGE], { transaction })).resolves.toBe("arguments_invalides");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("une écriture dans le contexte système de l'organisation passée ; rend repris ou rien_a_reprendre", async () => {
    const vues: string[] = [];
    const avec = (rows: Record<string, unknown>[]) =>
      (async (organizationId: string, travail: (x: { query: () => Promise<{ rows: Record<string, unknown>[] }> }) => Promise<unknown>) => {
        vues.push(organizationId);
        return travail({ query: async () => ({ rows }) });
      }) as never;
    await expect(reprendreParLeStudio(["--organisation", ORG, "--voyage", VOYAGE], { transaction: avec([{ id: ID }]), maintenant: () => 0 })).resolves.toBe("repris");
    await expect(reprendreParLeStudio(["--organisation", ORG, "--voyage", VOYAGE], { transaction: avec([]), maintenant: () => 0 })).resolves.toBe("rien_a_reprendre");
    expect(vues).toEqual([ORG, ORG]);
  });
});

describe("voyage complet : forfait du passage (revue de la PR 600, bloquant 1)", () => {
  const sejour = (ville: string, du: string, au: string) => ({ ville, du, au, logement: { kind: "none" as const }, placeId: null });
  // Six jours (23 au 28) : Glasgow du 24 au 26, Inverness du 26 au 28 ; le voyage complet planifie J3 à J6.
  const voyage = {
    draft: { start: "2026-11-23", end: "2026-11-28" },
    sejours: [sejour("Édimbourg", "2026-11-23", "2026-11-24"), sejour("Glasgow", "2026-11-24", "2026-11-26"), sejour("Inverness", "2026-11-26", "2026-11-28")],
  } as unknown as VoyageLu;
  const villes = villesDuComplet(voyage);

  it("villes du complet et du jour : borne de fin comprise, un jour de changement a ses deux villes", () => {
    expect(villes.map((v) => [v.rang, v.nom])).toEqual([
      [0, "Glasgow"],
      [1, "Inverness"],
    ]);
    expect(villesDuJour(voyage, villes, 3).map((v) => v.nom)).toEqual(["Glasgow"]);
    expect(villesDuJour(voyage, villes, 4).map((v) => v.nom)).toEqual(["Glasgow", "Inverness"]);
    expect(villesDuJour(voyage, villes, 6).map((v) => v.nom)).toEqual(["Inverness"]);
  });

  it("b, c, d : part répartie sur les villes que le passage introduit ; e : par jour ; a et l : inchangées", () => {
    const passage = { voyage, villes, jours: [3, 4, 5, 6] };
    expect([-1, 0, 1, 2, 3].map((i) => plusHautIntroduit(passage, i))).toEqual([-1, 0, 1, 1, 1]);
    expect([0, 1, 2, 3].map((i) => partDuPassage(passage, i, "b"))).toEqual([
      { avant: 0, ici: 1, total: 2 },
      { avant: 1, ici: 1, total: 2 },
      { avant: 2, ici: 0, total: 2 },
      { avant: 2, ici: 0, total: 2 },
    ]);
    expect(partDuPassage(passage, 2, "e")).toEqual({ avant: 2, ici: 1, total: 4 });
    // Reprise en cours de route (J3 publié) : le premier jour du passage introduit ses deux villes.
    const reprise = { voyage, villes, jours: [4, 5, 6] };
    expect(partDuPassage(reprise, 0, "c")).toEqual({ avant: 0, ici: 2, total: 2 });
    expect(partDuPassage(reprise, 1, "d")).toEqual({ avant: 2, ici: 0, total: 2 });
  });

  it("découpage cumulatif : la somme des parts vaut la part de l'étape, jamais 0 pour toutes (8 routes sur 9 jours)", () => {
    const parts = Array.from({ length: 9 }, (_, i) => partCumulee(8, { avant: i, ici: 1, total: 9 }));
    expect(parts.reduce((a, b) => a + b, 0)).toBe(8);
    expect(parts.filter((p) => p > 0)).toHaveLength(8);
    expect(partCumulee(10, { avant: 0, ici: 0, total: 2 })).toBe(0);
    expect(partCumulee(10, { avant: 0, ici: 1, total: 0 })).toBe(0);
    const forfait = { nature: "execution" as const, textSearchRequetes: 48, placeDetailsRequetes: 4, routesRequetes: 0, routesElements: 0, coutGoogleMicros: 0, coutModelesMicros: 120_000 };
    expect(partDuJour(forfait, { avant: 0, ici: 1, total: 2 })).toEqual({ ...forfait, textSearchRequetes: 24, placeDetailsRequetes: 2, coutModelesMicros: 60_000 });
    expect(partDuJour(forfait, { avant: 2, ici: 0, total: 2 })).toEqual({ ...forfait, textSearchRequetes: 0, placeDetailsRequetes: 0, coutModelesMicros: 0 });
  });
});
