// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { TripPatchSchema, TripSnapshotSchema, type TripSnapshot } from "@/contracts";
import { ID_ETAPE_REVISION } from "@/ai/entree-revision";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { SQL_DROIT_VOYAGE } from "@/server/payment/paiements";
import { SQL_PAR_DEMANDE } from "@/server/versions/remplacement";
import { formeAdmise, SQL_DERNIERE_VERSION } from "@/server/versions/retouches";
import type { DependancesAction } from "@/server/voyages/actions";

import { appliquerAjout, identifiantAjout, jourProvisoire, patchDeLAjout, PREFIXE_ETAPE_AJOUTEE, proposerAjout, type DependancesAjout } from "./ajout";

/**
 * Lieu à soi, aperçu et application sur `api` (tâche M5d-1, ticket 939 ; décision 0147 § 3 point 5, § 8 point 2, § 11,
 * § 6.4 point 4). Fonctions pures et ordre des premiers refus, base doublée ; le chemin complet (moteur, écriture,
 * isolation) est sous `tests/db/lieu-a-soi.test.ts`.
 */

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

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
      events: [],
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
        { type: "stop", stop: { id: "j1-1", kind: "activity", placeId: "test_place_musee", name: "[Musée]", start: "09:30", end: "11:00", facts: {}, exceptions: [], locked: false } },
        { type: "stop", stop: { id: "j1-2", kind: "activity", placeId: "test_place_parc", name: "[Parc]", start: "15:00", end: "16:00", facts: {}, exceptions: [], locked: false } },
        { type: "terminus", role: "end", time: "23:00", label: "[Hôtel]" },
      ],
    },
  ],
});

const DEMANDE = { day: 1, time: "12:30", kind: "activity" as const, name: "SENTINELLE-NOM-SAISI-M5D", resultId: "ChIJ-M5D-1" };

describe("lieu à soi: patch et étape ajoutée (0147 § 3 point 5, § 11)", () => {
  it("identifiant ajout-<requestId>, jamais de la forme d'une étape de l'IA, refusé par l'entrée de la révision", () => {
    expect(PREFIXE_ETAPE_AJOUTEE).toBe("ajout-");
    expect(identifiantAjout(REQUETE)).toBe(`ajout-${REQUETE}`);
    expect(identifiantAjout(REQUETE)).not.toMatch(/^j\d+-\d+$/);
    expect(ID_ETAPE_REVISION.test(identifiantAjout(REQUETE))).toBe(false);
  });

  it("patch [add, lock] sur le même stopId, nom saisi et placeId du résultat ; forme admise ; contrat respecté", () => {
    const patch = patchDeLAjout(REQUETE, 3, DEMANDE);
    expect(patch).toEqual({
      requestId: REQUETE,
      baseVersion: 3,
      operations: [
        { op: "add", stopId: `ajout-${REQUETE}`, kind: "activity", day: 1, time: "12:30", name: DEMANDE.name, placeId: "ChIJ-M5D-1" },
        { op: "lock", stopId: `ajout-${REQUETE}` },
      ],
    });
    expect(TripPatchSchema.safeParse(patch).success).toBe(true);
    expect(formeAdmise(patch)).toBe(true);
  });

  it("jour provisoire : l'étape est posée à son heure (avant la première étape qui commence après elle, sinon avant le terminus de fin)", () => {
    const jour = INSTANTANE.days[0];
    if (jour === undefined) throw new Error("jour absent");
    const ordre = (time: string) =>
      jourProvisoire(jour, "ajout-x", { ...DEMANDE, time }).items.map((i) => (i.type === "stop" ? i.stop.id : i.type === "terminus" ? `terminus:${i.role}` : i.type));
    expect(ordre("12:30")).toEqual(["terminus:start", "j1-1", "ajout-x", "j1-2", "terminus:end"]);
    expect(ordre("09:10")).toEqual(["terminus:start", "ajout-x", "j1-1", "j1-2", "terminus:end"]);
    expect(ordre("20:00")).toEqual(["terminus:start", "j1-1", "j1-2", "ajout-x", "terminus:end"]);
    const pose = jourProvisoire(jour, "ajout-x", DEMANDE).items.find((i) => i.type === "stop" && i.stop.id === "ajout-x");
    expect(pose).toMatchObject({ stop: { placeId: "ChIJ-M5D-1", name: DEMANDE.name, locked: true, addedBy: "person" } });
    // Le jour de base n'est pas modifié.
    expect(jour.items).toHaveLength(4);
  });
});

type Base = { voyage?: boolean; debloque?: boolean; derniere?: number; deja?: Record<string, unknown> };

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
        if (texte === "SET TRANSACTION READ ONLY") return { rows: [] };
        if (texte === SQL_VOYAGE) return { rows: base.voyage === false ? [] : [{ present: 1 }] };
        if (texte === SQL_DROIT_VOYAGE) return { rows: base.debloque === false ? [] : [{ id: "droit-1" }] };
        if (texte === SQL_PAR_DEMANDE) return { rows: base.deja === undefined ? [] : [base.deja] };
        if (texte === SQL_DERNIERE_VERSION) return { rows: [{ n: base.derniere ?? 1 }] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, textes };
}

function banc(base: Base = {}, options: { ctx?: AdapterContext | null; limiteur?: DependancesAjout["limiteur"] } = {}) {
  const { withOrg, textes } = doubleWithOrg(base);
  const limiteur = vi.fn(options.limiteur ?? (async () => ({ ok: true as const, value: undefined })));
  const relectures = { relire: vi.fn(async () => {
    throw new Error("relecture inattendue");
  }) };
  const dependances = {
    contexte: async () => (options.ctx === undefined ? CTX : options.ctx),
    withOrg,
    limiteur,
    relectures,
  } as unknown as DependancesAjout;
  return { dependances, textes, limiteur, withOrg, relectures };
}

const apercu = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, baseVersion: 1, ...DEMANDE, ...extra });
const application = (extra: Record<string, unknown> = {}) => apercu({ requestId: REQUETE, ...extra });

afterEach(() => vi.restoreAllMocks());

describe("lieu à soi: ordre des premiers refus (0147 § 8 point 2, § 6.4 point 4)", () => {
  it("sans session : unauthenticated, rien n'est lu", async () => {
    const b = banc({}, { ctx: null });
    expect(await proposerAjout(b.dependances, apercu())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await appliquerAjout(b.dependances, application())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(b.withOrg).not.toHaveBeenCalled();
  });

  it("entrée stricte : aucun champ pour un nom ou une adresse Google, la requête ou l'organisation ; nom saisi invalide ; sans requestId à l'application", async () => {
    const extras: Record<string, unknown>[] = [
      { googleName: "SENTINELLE" },
      { address: "SENTINELLE" },
      { query: "SENTINELLE" },
      { organizationId: CTX.organizationId },
      { name: "" },
      { name: "x".repeat(500) },
      { kind: "hotel" },
      { time: "25:00" },
      { resultId: "a b" },
    ];
    for (const extra of extras) {
      const b = banc();
      const resultat = await proposerAjout(b.dependances, apercu(extra));
      expect(resultat.ok ? null : resultat.error.code, JSON.stringify(extra)).toBe("validation_failed");
      expect(b.withOrg).not.toHaveBeenCalled();
    }
    const b = banc();
    const sans = await appliquerAjout(b.dependances, apercu());
    expect(sans.ok ? null : sans.error.code).toBe("validation_failed");
  });

  it("voyage hors de l'organisation : not_found, ni déblocage ni débit", async () => {
    const b = banc({ voyage: false });
    expect(await proposerAjout(b.dependances, apercu())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(b.textes).toEqual([SQL_VOYAGE]);
    expect(b.limiteur).not.toHaveBeenCalled();
  });

  it("non débloqué : not_unlocked (retryable faux), avant le débit et toute relecture", async () => {
    for (const appeler of [(d: DependancesAjout) => proposerAjout(d, apercu()), (d: DependancesAjout) => appliquerAjout(d, application())]) {
      const b = banc({ debloque: false });
      expect(await appeler(b.dependances)).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
      expect(b.limiteur).not.toHaveBeenCalled();
      expect(b.relectures.relire).not.toHaveBeenCalled();
    }
  });

  it("débit retouche refusé : rate_limited, avant le rejeu, la borne et toute relecture", async () => {
    const b = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited", retryable: true } }) });
    expect(await appliquerAjout(b.dependances, application())).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(b.textes).not.toContain(SQL_PAR_DEMANDE);
    expect(b.textes).not.toContain(SQL_DERNIERE_VERSION);
    expect(b.relectures.relire).not.toHaveBeenCalled();
  });

  it(`borne de ${String(VERSIONS_MAX_PAR_VOYAGE)} versions : validation_failed (baseVersion), sans relecture`, async () => {
    const b = banc({ derniere: VERSIONS_MAX_PAR_VOYAGE });
    expect(await proposerAjout(b.dependances, apercu({ baseVersion: VERSIONS_MAX_PAR_VOYAGE }))).toEqual({ ok: false, error: { code: "validation_failed", field: "baseVersion" } });
    expect(b.relectures.relire).not.toHaveBeenCalled();
  });

  it("rejeu : même ajout déjà écrit, même réponse sans relecture ; autre geste sous le même requestId : version_conflict", async () => {
    const stopId = identifiantAjout(REQUETE);
    const ecrit = {
      version: 2,
      author_kind: "user",
      patch: {
        requestId: REQUETE,
        baseVersion: 1,
        operations: [
          { op: "add", stopId, kind: "activity", day: 1, time: "12:30", name: DEMANDE.name, placeId: DEMANDE.resultId },
          { op: "lock", stopId },
        ],
      },
    };
    const b = banc({ deja: ecrit, derniere: 2 });
    expect(await appliquerAjout(b.dependances, application())).toEqual({
      ok: true,
      value: { version: 2, touchedDays: [1], changes: [{ type: "added", time: "12:30", label: DEMANDE.name }] },
    });
    expect(b.relectures.relire).not.toHaveBeenCalled();
    for (const autre of [{ time: "13:00" }, { name: "Autre" }, { resultId: "ChIJ-M5D-2" }, { kind: "meal" }, { day: 2 }]) {
      const c = banc({ deja: ecrit, derniere: 3 });
      expect(await appliquerAjout(c.dependances, application(autre)), JSON.stringify(autre)).toEqual({
        ok: false,
        error: { code: "version_conflict", retryable: true, currentVersion: 3 },
      });
    }
    const verrou = banc({ deja: { version: 2, author_kind: "user", patch: { requestId: REQUETE, baseVersion: 1, operations: [{ op: "lock", stopId: "j1-1" }] } }, derniere: 2 });
    const resultat = await appliquerAjout(verrou.dependances, application());
    expect(resultat.ok ? null : resultat.error.code).toBe("version_conflict");
  });
});
