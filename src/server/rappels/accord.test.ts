import { beforeEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { RATE_LIMITS } from "@/server/config/limites";
import type { RateLimitRequest } from "@/server/rate-limit";

import {
  ACTION_LIMITEUR_RAPPELS,
  lireRappels,
  modifierRappels,
  SQL_ACCORDS,
  SQL_INSERT_ACCORD,
  SQL_RETRAIT,
  SQL_RETRAIT_ACCORD,
  SQL_VOYAGE_ACCORD,
  type DependancesRappels,
} from "./accord";

const journal = vi.hoisted(() => ({
  lignes: [] as { evenement: string; champs: Record<string, unknown> }[],
}));
vi.mock("@/server/log", async (original) => {
  const reel = await original<typeof import("@/server/log")>();
  return {
    ...reel,
    logEvent: (evenement: string, champs: Record<string, unknown>) => void journal.lignes.push({ evenement, champs }),
  };
});

/**
 * Accord et retrait des rappels sans base (M6c, ticket 1021 ; spécification M6 § 6.3, critères 1 à 3 ; décision 0157 § 1.7
 * points 5 et 6). `withOrg` simulé : voyage (propriétaire, déblocage) et lignes d'accord en mémoire ; limiteur simulé.
 */

const ORG = "0a000000-0000-4000-8000-00000000000a";
const USER = "0c000000-0000-4000-8000-00000000000c";
const AUTRE = "0e000000-0000-4000-8000-00000000000e";
const TRIP = "0b000000-0000-4000-8000-00000000000b";
const CTX = {
  organizationId: ORG,
  userId: USER,
  role: "owner",
} as unknown as AdapterContext;

type Accord = {
  id: string;
  org: string;
  trip: string;
  user: string;
  retire: boolean;
};
type Base = {
  voyage: { createdBy: string; debloque: boolean } | null;
  accords: Accord[];
};

function lire(requete: { queryChunks: unknown[] }): {
  texte: string;
  valeurs: unknown[];
} {
  const morceaux: string[] = [];
  const valeurs: unknown[] = [];
  for (const morceau of requete.queryChunks) {
    const m = morceau as { value?: unknown; queryChunks?: unknown[] };
    if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
    else if (m.queryChunks !== undefined) {
      for (const interne of m.queryChunks) {
        const i = interne as { value?: unknown };
        if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
        else {
          valeurs.push(i.value);
          morceaux.push(`$${valeurs.length}`);
        }
      }
    }
  }
  return { texte: morceaux.join(""), valeurs };
}

function banc(
  partiel: Partial<Base> = {},
  options: {
    verdict?: boolean;
    compterLeve?: boolean;
    demarre?: boolean;
    ctx?: AdapterContext | null;
    disponibles?: boolean;
  } = {},
) {
  const b: Base = {
    voyage: { createdBy: USER, debloque: true },
    accords: [],
    ...partiel,
  };
  const requetes: string[] = [];
  let n = 0;
  const withOrg = vi.fn(async (ctx: { organizationId: string }, fn: (tx: never) => Promise<unknown>) => {
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const { texte, valeurs } = lire(requete);
        requetes.push(texte);
        if (texte === SQL_VOYAGE_ACCORD)
          return {
            rows:
              b.voyage === null || valeurs[0] !== ORG
                ? []
                : [
                    {
                      created_by: b.voyage.createdBy,
                      debloque: b.voyage.debloque,
                    },
                  ],
          };
        const miens = () => b.accords.filter((a) => a.org === ctx.organizationId && a.org === valeurs[0] && a.trip === valeurs[1] && a.user === valeurs[2]);
        if (texte === SQL_INSERT_ACCORD) {
          expect(valeurs).toHaveLength(3);
          if (miens().some((a) => !a.retire)) return { rows: [] };
          n += 1;
          const id = `0d000000-0000-4000-8000-00000000000${n}`;
          b.accords.push({
            id,
            org: String(valeurs[0]),
            trip: String(valeurs[1]),
            user: String(valeurs[2]),
            retire: false,
          });
          return { rows: [{ id }] };
        }
        if (texte === SQL_ACCORDS)
          return {
            rows: [
              {
                n: miens().length,
                actifs: miens().filter((a) => !a.retire).length,
              },
            ],
          };
        if (texte === SQL_RETRAIT) {
          for (const a of miens()) a.retire = true;
          return { rows: [] };
        }
        if (texte === SQL_RETRAIT_ACCORD) {
          for (const a of miens()) if (a.id === valeurs[3]) a.retire = true;
          return { rows: [] };
        }
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  const verdict = vi.fn(async () => (options.verdict === false ? { ok: false as const, kind: "trip" as const } : { ok: true as const }));
  const compter = vi.fn<(espece: "ip" | "trip", request: RateLimitRequest) => Promise<void>>(async () => {
    if (options.compterLeve === true) throw new Error("panne du limiteur");
  });
  const demarrer = vi.fn(async () => ({ ok: options.demarre !== false }));
  const headers = new Headers();
  const deps: DependancesRappels = {
    disponibles: () => options.disponibles !== false,
    contexte: async () => (options.ctx === undefined ? CTX : options.ctx),
    headers: async () => headers,
    verdict,
    compter,
    demarrer,
    withOrg: withOrg as unknown as NonNullable<DependancesRappels["withOrg"]>,
  };
  return { b, deps, requetes, verdict, compter, demarrer, withOrg, headers };
}

beforeEach(() => {
  journal.lignes = [];
});

describe("rappels : limite rappels-accord (0157 § 1.7 point 5)", () => {
  it("20 par heure et par adresse IP, puis 6 par voyage et par 24 heures", () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_RAPPELS]).toEqual([
      { kind: "ip", windowSeconds: 3600, threshold: 20 },
      { kind: "trip", windowSeconds: 86_400, threshold: 6 },
    ]);
  });
});

describe("rappels : activation (setTripReminders, enabled: true)", () => {
  it("critère 2 : une ligne d'accord par ses trois colonnes, un workflow démarré avec les seuls identifiants", async () => {
    const t = banc();
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toEqual({ ok: true, value: { active: true } });
    expect(t.b.accords).toEqual([
      {
        id: "0d000000-0000-4000-8000-000000000001",
        org: ORG,
        trip: TRIP,
        user: USER,
        retire: false,
      },
    ]);
    expect(t.demarrer).toHaveBeenCalledWith({
      organizationId: ORG,
      tripId: TRIP,
      userId: USER,
      consentId: "0d000000-0000-4000-8000-000000000001",
    });
    expect(t.verdict).toHaveBeenCalledWith({
      action: "rappels-accord",
      headers: t.headers,
      tripId: TRIP,
    });
    expect(SQL_INSERT_ACCORD).toMatch(/INSERT INTO public\.reminder_consents \(organization_id, trip_id, user_id\) VALUES \(\$1, \$2, \$3\)/);
    expect(SQL_INSERT_ACCORD.split("VALUES")[0]).not.toMatch(/consented_at|withdrawn_at|\(id|, id/);
  });

  it("accord déjà actif : rien n'est écrit ni démarré, état actif", async () => {
    const t = banc({
      accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
    });
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toEqual({ ok: true, value: { active: true } });
    expect(t.b.accords).toHaveLength(1);
    expect(t.demarrer).not.toHaveBeenCalled();
  });

  it("critère 3 : sans session unauthenticated ; entrée hors contrat validation_failed ; rien n'est lu", async () => {
    const sans = banc({}, { ctx: null });
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, sans.deps)).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
    const t = banc();
    for (const entree of [{ tripId: TRIP }, { tripId: TRIP, enabled: true, organizationId: ORG }, { tripId: 42, enabled: true }, null]) {
      expect(await modifierRappels(entree, t.deps)).toMatchObject({
        ok: false,
        error: { code: "validation_failed" },
      });
    }
    expect(sans.withOrg).not.toHaveBeenCalled();
    expect(t.withOrg).not.toHaveBeenCalled();
  });

  it("critère 3 : voyage inconnu, d'une autre organisation, non débloqué, ou membre non propriétaire : not_found avant la limite, rien écrit", async () => {
    for (const voyage of [null, { createdBy: AUTRE, debloque: true }, { createdBy: USER, debloque: false }]) {
      const t = banc({ voyage });
      expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(t.verdict).not.toHaveBeenCalled();
      expect(t.b.accords).toEqual([]);
      expect(t.demarrer).not.toHaveBeenCalled();
    }
  });

  it("rappels indisponibles (port non branché, autre adaptateur) : not_found sans rien lire", async () => {
    const t = banc({}, { disponibles: false });
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await lireRappels({ tripId: TRIP }, t.deps)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(t.withOrg).not.toHaveBeenCalled();
  });

  it("7e geste dans la fenêtre : activation refusée (rate_limited, aucune ligne, aucun démarrage) ; retrait accepté", async () => {
    const t = banc(
      {
        accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
      },
      { verdict: false },
    );
    expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toEqual({ ok: true, value: { active: false } });
    expect(t.b.accords[0]?.retire).toBe(true);
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(t.b.accords).toHaveLength(1);
    expect(t.demarrer).not.toHaveBeenCalled();
  });

  it("démarrage échoué : l'accord est retiré aussitôt, erreur internal (jamais un accord actif sans exécution)", async () => {
    const t = banc({}, { demarre: false });
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(t.b.accords.map((a) => a.retire)).toEqual([true]);
  });

  it("erreur inattendue : internal, voyages.action_failed avec le nom de l'action et la classe seulement", async () => {
    const t = banc();
    t.withOrg.mockRejectedValueOnce(new TypeError("SENTINELLE voyageuse@exemple.test"));
    expect(await modifierRappels({ tripId: TRIP, enabled: true }, t.deps)).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(journal.lignes).toEqual([
      {
        evenement: "voyages.action_failed",
        champs: { action: "set-trip-reminders", errorName: "TypeError" },
      },
    ]);
  });
});

describe("rappels : retrait (setTripReminders, enabled: false), jamais refusé par la limite", () => {
  it("critère 2 : retrait idempotent ; espèce ip comptée dès la session, espèce trip après la ligne trouvée ; aucun workflow", async () => {
    const t = banc({
      accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
    });
    expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toEqual({ ok: true, value: { active: false } });
    expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toEqual({ ok: true, value: { active: false } });
    expect(t.b.accords[0]?.retire).toBe(true);
    expect(t.compter.mock.calls.map((c) => c[0])).toEqual(["ip", "trip", "ip", "trip"]);
    expect(t.compter).toHaveBeenCalledWith("trip", {
      action: "rappels-accord",
      headers: t.headers,
      tripId: TRIP,
    });
    expect(t.compter).toHaveBeenCalledWith("ip", {
      action: "rappels-accord",
      headers: t.headers,
    });
    expect(t.verdict).not.toHaveBeenCalled();
    expect(t.demarrer).not.toHaveBeenCalled();
    expect(SQL_RETRAIT).toMatch(/SET withdrawn_at = pg_catalog\.now\(\)/);
  });

  it("limiteur en panne : retrait accepté", async () => {
    const t = banc(
      {
        accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
      },
      { compterLeve: true },
    );
    expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toEqual({ ok: true, value: { active: false } });
    expect(t.b.accords[0]?.retire).toBe(true);
  });

  it("accord d'une autre personne ou d'une autre organisation, ou jamais donné : not_found sans les distinguer ; espèce trip non comptée", async () => {
    for (const accords of [
      [],
      [{ id: "x", org: ORG, trip: TRIP, user: AUTRE, retire: false }],
      [{ id: "y", org: AUTRE, trip: TRIP, user: USER, retire: false }],
    ]) {
      const t = banc({ accords });
      expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toMatchObject({ ok: false, error: { code: "not_found" } });
      expect(t.b.accords.every((a) => !a.retire)).toBe(true);
      expect(t.compter.mock.calls.map((c) => c[0])).toEqual(["ip"]);
    }
  });

  it("voyage non débloqué, personne qui n'est plus propriétaire, rappels indisponibles : retrait accepté (défense en profondeur)", async () => {
    for (const voyage of [{ createdBy: USER, debloque: false }, { createdBy: AUTRE, debloque: true }, null]) {
      const t = banc(
        {
          voyage,
          accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
        },
        { disponibles: false },
      );
      expect(await modifierRappels({ tripId: TRIP, enabled: false }, t.deps)).toEqual({ ok: true, value: { active: false } });
      expect(t.b.accords[0]?.retire).toBe(true);
      expect(t.requetes).not.toContain(SQL_VOYAGE_ACCORD);
    }
  });
});

describe("rappels : état (getTripReminders)", () => {
  it("accord actif ou non ; membre non propriétaire ou voyage inconnu : not_found", async () => {
    expect(await lireRappels({ tripId: TRIP }, banc().deps)).toEqual({
      ok: true,
      value: { active: false },
    });
    const actif = banc({
      accords: [{ id: "x", org: ORG, trip: TRIP, user: USER, retire: false }],
    });
    expect(await lireRappels({ tripId: TRIP }, actif.deps)).toEqual({
      ok: true,
      value: { active: true },
    });
    expect(await lireRappels({ tripId: TRIP }, banc({ voyage: { createdBy: AUTRE, debloque: true } }).deps)).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await lireRappels({ tripId: TRIP }, banc({ voyage: null }).deps)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await lireRappels({ tripId: TRIP }, banc({}, { ctx: null }).deps)).toMatchObject({ ok: false, error: { code: "unauthenticated" } });
  });
});
