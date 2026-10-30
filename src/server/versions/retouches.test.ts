// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ApiErrorSchema, TripSnapshotSchema, type TripPatch, type TripSnapshot } from "@/contracts";
import { REFUS_MOTEUR } from "@/domain/version";
import { RATE_LIMITS } from "@/server/config/limites";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { SQL_VERROU_VERSIONS } from "@/server/versions/ecrire";
import type { DependancesAction } from "@/server/voyages/actions";

import { SQL_EN_COURS, SQL_PAR_DEMANDE } from "./remplacement";
import {
  ACTION_LIMITEUR_RETOUCHE,
  basculerVerrou,
  erreurDuMoteur,
  formeAdmise,
  FORMES_PATCH_PERSONNE,
  PatchHorsForme,
  patchDeLaPersonne,
  patchDuVerrou,
  situerEtapeAVerrouiller,
  SQL_DERNIERE_VERSION,
  SQL_DROIT_DEBLOQUE,
  type DependancesRetouche,
} from "./retouches";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Verrou sur `api` sans base (tâche M5a, ticket 919 ; décision 0147 § 8, § 9, § 11, § 6.4 point 4, § 5.3 point 7) : formes
 * admises d'un patch de la personne, étape verrouillable, correspondance des refus du moteur, et ordre des premiers refus
 * (déblocage, débit, borne des versions) avec un double de `withOrg`. Le chemin complet (version écrite, rejeu, conflit,
 * engagement, R3) est éprouvé sur la base réelle (`tests/db/verrou.test.ts`). Noms entre crochets, `placeId` sentinelles.
 */

const CTX: AdapterContext = { organizationId: "0d000000-0000-4000-8000-000000000001", userId: "0d000000-0000-4000-8000-000000000002", role: "owner" };
const TRIP = "0d000000-0000-4000-8000-0000000000aa";
const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

const INSTANTANE: TripSnapshot = TripSnapshotSchema.parse({
  days: [
    {
      index: 1,
      date: "2027-05-01",
      travelBudgetMinutes: 90,
      events: [{ id: "j1-c1", kind: "event", name: "[Billet du concert]", start: "21:00", facts: {}, exceptions: [], locked: true, commitment: "ticket" }],
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
        { type: "stop", stop: { id: "j1-1", kind: "activity", placeId: "test_place_musee", name: "[Musée]", start: "09:30", end: "11:00", facts: {}, exceptions: [], locked: false } },
        {
          type: "stop",
          stop: { id: "j1-billet", kind: "event", placeId: "test_place_salle", name: "[Spectacle]", start: "16:00", end: "17:00", facts: {}, exceptions: [], locked: true, commitment: "ticket" },
        },
        { type: "terminus", role: "end", time: "23:00", label: "[Hôtel]" },
      ],
    },
  ],
});

describe("retouches: formes admises d'un patch de la personne (0147 § 11)", () => {
  const p = (operations: TripPatch["operations"]): TripPatch => ({ requestId: REQUETE, baseVersion: 3, operations });

  it("liste fermée : [replace], [add, lock], [move], [lock], [unlock], [revert]", () => {
    expect(FORMES_PATCH_PERSONNE).toEqual([["replace"], ["add", "lock"], ["move"], ["lock"], ["unlock"], ["revert"]]);
    expect(formeAdmise(p([{ op: "lock", stopId: "j1-1" }]))).toBe(true);
    expect(formeAdmise(p([{ op: "unlock", stopId: "j1-1" }]))).toBe(true);
    expect(formeAdmise(p([{ op: "replace", stopId: "j1-1", candidateId: "0d000000-0000-4000-8000-0000000000ee", newStopId: "n1" }]))).toBe(true);
    expect(formeAdmise(p([{ op: "move", stopId: "j1-1", day: 1, time: "10:00" }]))).toBe(true);
    expect(formeAdmise(p([{ op: "revert", toVersion: 1 }]))).toBe(true);
    expect(formeAdmise(p([{ op: "add", stopId: "a1", kind: "activity", day: 1, time: "14:00", name: "[Mon lieu]" }, { op: "lock", stopId: "a1" }]))).toBe(true);
  });

  it("tout autre patch construit par le serveur est une erreur de programmation (PatchHorsForme)", () => {
    const hors: TripPatch["operations"][] = [
      [{ op: "lock", stopId: "j1-1" }, { op: "unlock", stopId: "j1-billet" }],
      [{ op: "add", stopId: "a1", kind: "activity", day: 1, time: "14:00", name: "[Mon lieu]" }],
      [{ op: "add", stopId: "a1", kind: "activity", day: 1, time: "14:00", name: "[Mon lieu]" }, { op: "lock", stopId: "j1-1" }],
      [{ op: "move", stopId: "j1-1", day: 1, time: "10:00" }, { op: "lock", stopId: "j1-1" }],
      [{ op: "lock", stopId: "j1-1" }, { op: "lock", stopId: "j1-billet" }],
    ];
    for (const operations of hors) {
      expect(formeAdmise(p(operations)), JSON.stringify(operations)).toBe(false);
      expect(() => patchDeLaPersonne(p(operations)), JSON.stringify(operations)).toThrow(PatchHorsForme);
    }
    // Un patch invalide pour le contrat lève avant même la forme.
    expect(() => patchDeLaPersonne({ requestId: REQUETE, baseVersion: 3, operations: [] })).toThrow();
  });

  it("patchDuVerrou : une seule opération, sur la version de base, même requestId", () => {
    expect(patchDuVerrou(REQUETE, 4, "lock", "j1-1")).toEqual({ requestId: REQUETE, baseVersion: 4, operations: [{ op: "lock", stopId: "j1-1" }] });
    expect(patchDuVerrou(REQUETE, 4, "unlock", "j1-1").operations).toEqual([{ op: "unlock", stopId: "j1-1" }]);
  });
});

describe("retouches: étape verrouillable (0147 § 8 point 3)", () => {
  it("étape du programme : verrouillable ; engagement (étape ou événement de Day.events) : non ; inconnue : absente", () => {
    expect(situerEtapeAVerrouiller(INSTANTANE, "j1-1")).toMatchObject({ type: "etape", stop: { id: "j1-1" } });
    expect(situerEtapeAVerrouiller(INSTANTANE, "j1-billet")).toEqual({ type: "non_verrouillable" });
    expect(situerEtapeAVerrouiller(INSTANTANE, "j1-c1")).toEqual({ type: "non_verrouillable" });
    expect(situerEtapeAVerrouiller(INSTANTANE, "j9-inconnue")).toEqual({ type: "absente" });
  });
});

describe("retouches: correspondance des refus du moteur (0147 § 8 point 4)", () => {
  it("chaque code de REFUS_MOTEUR a une erreur d'action valide", () => {
    const attendu: Record<(typeof REFUS_MOTEUR)[number], unknown> = {
      version_conflict: { code: "version_conflict", retryable: true, currentVersion: 7 },
      unknown_stop: { code: "not_found" },
      unknown_candidate: { code: "internal" },
      out_of_trip: { code: "not_found" },
      locked_stop: { code: "validation_failed", field: "stopId" },
      no_effect: { code: "validation_failed", field: "stopId" },
      no_option: { code: "no_option" },
      invalid_revert: { code: "validation_failed", field: "toVersion" },
    };
    for (const code of REFUS_MOTEUR) {
      const erreur = erreurDuMoteur(code === "version_conflict" ? { ok: false, code, currentVersion: 7 } : { ok: false, code });
      expect(erreur, code).toEqual(attendu[code]);
      expect(ApiErrorSchema.safeParse(erreur).success, code).toBe(true);
    }
  });
});

describe("retouches: configuration (0147 § 6.4 point 4, § 5.3 point 7)", () => {
  it("règle retouche : une règle ip, 3 600 s, 60 ; VERSIONS_MAX_PAR_VOYAGE = 200", () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_RETOUCHE]).toEqual([{ kind: "ip", windowSeconds: 3600, threshold: 60 }]);
    expect(VERSIONS_MAX_PAR_VOYAGE).toBe(200);
  });
});

// --- Ordre des premiers refus, avec un double de `withOrg` -----------------------------------------------------

type Base = { voyage?: boolean; debloque?: boolean; deja?: boolean; enCours?: boolean; derniere?: number };

/** Double de `withOrg` : réponses selon la requête ; une requête inconnue lève (elle devient `internal`). */
function doubleWithOrg(base: Base = {}) {
  const textes: string[] = [];
  const withOrg = vi.fn(async (_ctx: unknown, fn: (tx: never) => Promise<unknown>): Promise<unknown> => {
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const morceaux: string[] = [];
        let n = 0;
        for (const morceau of requete.queryChunks) {
          const m = morceau as { value?: unknown; queryChunks?: unknown[] };
          if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
          else if (m.queryChunks !== undefined) {
            for (const interne of m.queryChunks) {
              const i = interne as { value?: unknown };
              if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
              else morceaux.push(`$${(n += 1)}`);
            }
          }
        }
        const texte = morceaux.join("");
        textes.push(texte);
        if (texte === SQL_VOYAGE) return { rows: base.voyage === false ? [] : [{ present: 1 }] };
        if (texte === SQL_DROIT_DEBLOQUE) return { rows: base.debloque === false ? [] : [{ present: 1 }] };
        if (texte === SQL_VERROU_TRI || texte === SQL_VERROU_VERSIONS) return { rows: [{}] };
        if (texte === SQL_PAR_DEMANDE) return { rows: base.deja === true ? [{ version: 2, patch: null, author_kind: "engine" }] : [] };
        if (texte === SQL_EN_COURS) return { rows: [{ en_cours: base.enCours === true }] };
        if (texte === SQL_DERNIERE_VERSION) return { rows: [{ n: base.derniere ?? 1 }] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, textes };
}

function banc(base: Base = {}, options: { ctx?: AdapterContext | null; limiteur?: DependancesRetouche["limiteur"] } = {}) {
  const { withOrg, textes } = doubleWithOrg(base);
  const limiteur = vi.fn(options.limiteur ?? (async () => ({ ok: true as const, value: undefined })));
  const dependances: DependancesRetouche = { contexte: async () => (options.ctx === undefined ? CTX : options.ctx), withOrg, limiteur };
  return { dependances, textes, limiteur, withOrg };
}

const entree = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, requestId: REQUETE, stopId: "j1-1", baseVersion: 1, ...extra });

afterEach(() => vi.restoreAllMocks());

describe("retouches: ordre des refus d'un verrou (0147 § 8 point 2, § 6.4 point 4)", () => {
  it("sans session : unauthenticated, rien n'est lu", async () => {
    const b = banc({}, { ctx: null });
    expect(await basculerVerrou(b.dependances, "lock", entree())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(b.withOrg).not.toHaveBeenCalled();
  });

  it("entrée stricte : champ inconnu, requestId illisible, version 0 : validation_failed sans rien lire", async () => {
    for (const extra of [{ organizationId: CTX.organizationId }, { requestId: "x" }, { baseVersion: 0 }, { stopId: "" }]) {
      const b = banc();
      const resultat = await basculerVerrou(b.dependances, "lock", entree(extra));
      expect(resultat.ok ? null : resultat.error.code, JSON.stringify(extra)).toBe("validation_failed");
      expect(b.withOrg).not.toHaveBeenCalled();
    }
  });

  it("voyage hors de l'organisation : not_found, rien d'autre (ni déblocage, ni débit)", async () => {
    const b = banc({ voyage: false });
    expect(await basculerVerrou(b.dependances, "lock", entree())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(b.textes).toEqual([SQL_VOYAGE]);
    expect(b.limiteur).not.toHaveBeenCalled();
  });

  it("verrou: refusé avant le déblocage : not_unlocked (retryable faux), sans débit, verrou ni relecture", async () => {
    for (const op of ["lock", "unlock"] as const) {
      const b = banc({ debloque: false });
      const resultat = await basculerVerrou(b.dependances, op, entree());
      expect(resultat).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
      if (!resultat.ok) expect(ApiErrorSchema.safeParse(resultat.error).success).toBe(true);
      expect(b.textes).toEqual([SQL_VOYAGE, SQL_DROIT_DEBLOQUE]);
      expect(b.limiteur).not.toHaveBeenCalled();
    }
  });

  it("débit retouche refusé : rate_limited, aucun verrou pris, rien relu", async () => {
    const b = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited", retryable: true } }) });
    expect(await basculerVerrou(b.dependances, "lock", entree())).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(b.textes).toEqual([SQL_VOYAGE, SQL_DROIT_DEBLOQUE]);
  });

  it("recalcul en cours : generation_in_progress (retryable), après les verrous et le rejeu", async () => {
    const b = banc({ enCours: true });
    expect(await basculerVerrou(b.dependances, "lock", entree())).toEqual({ ok: false, error: { code: "generation_in_progress", retryable: true } });
    expect(b.textes).toEqual([SQL_VOYAGE, SQL_DROIT_DEBLOQUE, SQL_VERROU_TRI, SQL_VERROU_VERSIONS, SQL_PAR_DEMANDE, SQL_EN_COURS]);
    expect(b.limiteur).toHaveBeenCalledTimes(1);
  });

  it(`borne : ${VERSIONS_MAX_PAR_VOYAGE} versions atteintes, validation_failed sur baseVersion, sans relire le programme`, async () => {
    const b = banc({ derniere: VERSIONS_MAX_PAR_VOYAGE });
    expect(await basculerVerrou(b.dependances, "unlock", entree({ baseVersion: VERSIONS_MAX_PAR_VOYAGE }))).toEqual({
      ok: false,
      error: { code: "validation_failed", field: "baseVersion" },
    });
    expect(b.textes.at(-1)).toBe(SQL_DERNIERE_VERSION);
  });

  it("requêtes : déblocage lu dans l'organisation (droit tripUnlocked), borne par max(version)", () => {
    expect(SQL_DROIT_DEBLOQUE).toContain("organization_id = $1 AND trip_id = $2 AND kind = 'tripUnlocked'");
    expect(SQL_DERNIERE_VERSION).toContain("max(version)");
  });
});
