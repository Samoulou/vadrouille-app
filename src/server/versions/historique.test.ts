// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { TripSnapshotSchema, TripVersionSummarySchema, type TripSnapshot } from "@/contracts";
import { VERSIONS_MAX_PAR_VOYAGE } from "@/server/config/retouches";
import { SQL_DROIT_VOYAGE } from "@/server/payment/paiements";
import { SQL_VERROU_TRI } from "@/server/presentation/etat";
import { SQL_VERROU_VERSIONS } from "@/server/versions/ecrire";
import type { DependancesAction } from "@/server/voyages/actions";

import {
  aUneEtapeVerrouillee,
  appliquerRetour,
  listerVersions,
  patchDuRetour,
  proposerRetour,
  resumeDeVersion,
  SQL_APRES_DEBLOCAGE,
  SQL_PAGE_VERSIONS,
  VersionIllisible,
} from "./historique";
import { SQL_EN_COURS, SQL_PAR_DEMANDE } from "./remplacement";
import { SQL_DERNIERE_VERSION, type DependancesRetouche } from "./retouches";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Versions du programme sur `api` sans base (tâche M5b, ticket 934 ; décision 0147 § 5.3, § 8, § 6.4 point 4) : ligne de la
 * liste depuis une ligne lue (sorte, noms, proposée au retour), patch d'un retour, et ordre des premiers refus (déblocage,
 * débit, borne, version visée) avec un double de `withOrg`. Le chemin complet (liste, aperçu, version écrite, rejeu, liste
 * « À faire ») est éprouvé sur la base réelle (`tests/db/versions.test.ts`). Noms entre crochets, `placeId` sentinelles.
 */

const CTX: AdapterContext = { organizationId: "0d000000-0000-4000-8000-000000000001", userId: "0d000000-0000-4000-8000-000000000002", role: "owner" };
const TRIP = "0d000000-0000-4000-8000-0000000000aa";
const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";
const LECTURE_SEULE = "SET TRANSACTION READ ONLY";
const SQL_COURANTE = "SELECT current_version FROM public.trips WHERE organization_id = $1 AND id = $2";
const QUAND = "2027-05-01T10:00:00.000Z";

const ligne = (extra: Record<string, unknown>) => ({ version: 3, created_at: new Date(QUAND), operation: null, apres_deblocage: true, ...extra });

describe("versions: ligne de la liste depuis une ligne lue (0147 § 5.3 point 1)", () => {
  it("versions des workflows : sorte de l'exécution (preview, batch, full), à défaut prepared (v1) ou complete", () => {
    expect(resumeDeVersion(ligne({ version: 1, execution: "preview", apres_deblocage: false }), 4)).toEqual({ version: 1, createdAt: QUAND, kind: "prepared", revertible: false, current: false });
    expect(resumeDeVersion(ligne({ version: 2, execution: "batch" }), 4).kind).toBe("adjusted");
    expect(resumeDeVersion(ligne({ version: 3, execution: "full" }), 4).kind).toBe("complete");
    expect(resumeDeVersion(ligne({ version: 1, execution: null }), 4).kind).toBe("prepared");
    expect(resumeDeVersion(ligne({ version: 2, execution: null }), 4).kind).toBe("complete");
  });

  it("retouches : sorte de la première opération, noms tirés des instantanés ; [add, lock] donne added", () => {
    expect(resumeDeVersion(ligne({ operation: { op: "lock", stopId: "j1-1" }, sujet: "[Musée]" }), 4)).toMatchObject({ kind: "locked", subject: "[Musée]" });
    expect(resumeDeVersion(ligne({ operation: { op: "unlock", stopId: "j1-1" }, sujet: "[Musée]" }), 4)).toMatchObject({ kind: "unlocked", subject: "[Musée]" });
    expect(resumeDeVersion(ligne({ operation: { op: "add", stopId: "ajout-1" }, sujet: "[Mon lieu]" }), 4)).toMatchObject({ kind: "added", subject: "[Mon lieu]" });
    expect(resumeDeVersion(ligne({ operation: { op: "move", stopId: "j1-1" }, sujet: "[Musée]", jour: "2" }), 4)).toMatchObject({ kind: "moved", subject: "[Musée]", day: 2 });
    expect(resumeDeVersion(ligne({ operation: { op: "replace", stopId: "j1-1", newStopId: "r" }, sujet: "[Jardin]", ancien: "[Musée]" }), 4)).toMatchObject({
      kind: "replaced",
      subject: "[Jardin]",
      previous: "[Musée]",
    });
    expect(resumeDeVersion(ligne({ operation: { op: "revert", toVersion: 2 }, retour_du: "2027-04-30T08:00:00Z" }), 4)).toMatchObject({
      kind: "reverted",
      revertedTo: { version: 2, createdAt: "2027-04-30T08:00:00.000Z" },
    });
  });

  it("proposée au retour : écrite après le déblocage et pas la version courante ; la courante ne l'est jamais", () => {
    expect(resumeDeVersion(ligne({ version: 3 }), 4)).toMatchObject({ revertible: true, current: false });
    expect(resumeDeVersion(ligne({ version: 4 }), 4)).toMatchObject({ revertible: false, current: true });
    expect(resumeDeVersion(ligne({ version: 3, apres_deblocage: false }), 4)).toMatchObject({ revertible: false, current: false });
    expect(resumeDeVersion(ligne({ version: 3, apres_deblocage: null }), 4)).toMatchObject({ revertible: false });
  });

  it("ligne incohérente (nom absent, opération inconnue, date illisible) : VersionIllisible (internal par le cadre)", () => {
    expect(() => resumeDeVersion(ligne({ operation: { op: "lock" }, sujet: null }), 4)).toThrow(VersionIllisible);
    expect(() => resumeDeVersion(ligne({ operation: { op: "inconnue" } }), 4)).toThrow(VersionIllisible);
    expect(() => resumeDeVersion(ligne({ created_at: "pas une date" }), 4)).toThrow(VersionIllisible);
    expect(() => resumeDeVersion(ligne({ operation: { op: "revert", toVersion: 2 }, retour_du: null }), 4)).toThrow(VersionIllisible);
  });

  it("chaque ligne rendue suit TripVersionSummarySchema", () => {
    const lue = resumeDeVersion(ligne({ operation: { op: "lock", stopId: "j1-1" }, sujet: "[Musée]" }), 4);
    expect(TripVersionSummarySchema.parse(lue)).toEqual(lue);
  });

  it("requêtes : noms par chemin JSON (jamais un instantané rendu), droit tripUnlocked, 20 + 1 lignes, before exclusif", () => {
    expect(SQL_PAGE_VERSIONS).toContain("jsonb_path_query_first(v.snapshot");
    expect(SQL_PAGE_VERSIONS).not.toMatch(/SELECT\s+v\.snapshot|,\s*v\.snapshot\s*,/);
    expect(SQL_PAGE_VERSIONS).toContain("e.kind = 'tripUnlocked'");
    expect(SQL_PAGE_VERSIONS).toContain("v.version < $3::integer");
    expect(SQL_APRES_DEBLOCAGE).toContain("v.created_at >= e.granted_at");
  });
});

describe("versions: patch d'un retour et étape verrouillée", () => {
  it("patch [revert] seul, sur la version de base (forme admise)", () => {
    expect(patchDuRetour(REQUETE, 5, 3)).toEqual({ requestId: REQUETE, baseVersion: 5, operations: [{ op: "revert", toVersion: 3 }] });
  });

  it("aUneEtapeVerrouillee : vrai dès qu'une étape de la ligne d'un jour est verrouillée", () => {
    const jour = (locked: boolean): TripSnapshot =>
      TripSnapshotSchema.parse({
        days: [
          {
            index: 1,
            date: "2027-05-01",
            travelBudgetMinutes: 90,
            events: [],
            items: [{ type: "stop", stop: { id: "j1-1", kind: "activity", placeId: "test_place_musee", name: "[Musée]", start: "09:30", end: "11:00", facts: {}, exceptions: [], locked } }],
          },
        ],
      });
    expect(aUneEtapeVerrouillee(jour(true))).toBe(true);
    expect(aUneEtapeVerrouillee(jour(false))).toBe(false);
  });
});

// --- Ordre des premiers refus, avec un double de `withOrg` -----------------------------------------------------

const sansNumeros = (texte: string) => texte.replace(/\$\d+/g, "$?");

type Base = { voyage?: boolean; debloque?: boolean; enCours?: boolean; derniere?: number };

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
        if (texte === LECTURE_SEULE) return { rows: [] };
        if (texte === SQL_DROIT_VOYAGE) return { rows: base.debloque === false ? [] : [{ id: "droit-1" }] };
        if (texte === SQL_VERROU_TRI || texte === SQL_VERROU_VERSIONS) return { rows: [{}] };
        if (texte === SQL_PAR_DEMANDE) return { rows: [] };
        if (texte === SQL_EN_COURS) return { rows: [{ en_cours: base.enCours === true }] };
        if (texte === SQL_DERNIERE_VERSION) return { rows: [{ n: base.derniere ?? 2 }] };
        if (texte === SQL_COURANTE) return { rows: [{ current_version: 2 }] };
        // Un paramètre répété (`$3` deux fois) est renuméroté par la reconstruction du double : comparaison sans numéros.
        if (sansNumeros(texte) === sansNumeros(SQL_PAGE_VERSIONS)) {
          return {
            rows: [
              { version: 2, created_at: new Date(QUAND), operation: { op: "lock", stopId: "j1-1" }, sujet: "[Musée]", apres_deblocage: true },
              { version: 1, created_at: new Date(QUAND), operation: null, execution: "preview", apres_deblocage: false },
            ],
          };
        }
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

afterEach(() => vi.restoreAllMocks());

describe("versions: ordre des refus (0147 § 8 point 2, § 6.4 point 4, § 5.3 point 7)", () => {
  const apercu = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, baseVersion: 2, toVersion: 1, ...extra });
  const retour = (extra: Record<string, unknown> = {}) => ({ ...apercu(), requestId: REQUETE, ...extra });

  it("sans session : unauthenticated, rien n'est lu ; entrée stricte : validation_failed sans rien lire", async () => {
    for (const [cas, entree] of [
      ["liste", { tripId: TRIP }],
      ["apercu", apercu()],
      ["retour", retour()],
    ] as const) {
      const b = banc({}, { ctx: null });
      const fn = cas === "liste" ? listerVersions : cas === "apercu" ? proposerRetour : appliquerRetour;
      expect(await fn(b.dependances, entree), cas).toEqual({ ok: false, error: { code: "unauthenticated" } });
      expect(b.withOrg).not.toHaveBeenCalled();
    }
    for (const entree of [retour({ organizationId: CTX.organizationId }), retour({ requestId: "x" }), retour({ toVersion: 0 }), retour({ baseVersion: 1.5 })]) {
      const b = banc();
      const resultat = await appliquerRetour(b.dependances, entree);
      expect(resultat.ok ? null : resultat.error.code, JSON.stringify(entree)).toBe("validation_failed");
      expect(b.withOrg).not.toHaveBeenCalled();
    }
    const b = banc();
    expect(await listerVersions(b.dependances, { tripId: TRIP, before: 0 })).toMatchObject({ ok: false, error: { code: "validation_failed", field: "before" } });
  });

  it("voyage hors de l'organisation : not_found, ni déblocage ni débit", async () => {
    const b = banc({ voyage: false });
    expect(await listerVersions(b.dependances, { tripId: TRIP })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(b.textes).toEqual([SQL_VOYAGE]);
    expect(b.limiteur).not.toHaveBeenCalled();
  });

  it("versions: refusé avant le déblocage : not_unlocked (retryable faux) pour la liste, l'aperçu et le retour, sans débit ni relecture", async () => {
    for (const [cas, fn, entree] of [
      ["liste", listerVersions, { tripId: TRIP }],
      ["apercu", proposerRetour, apercu()],
      ["retour", appliquerRetour, retour()],
    ] as const) {
      const b = banc({ debloque: false });
      expect(await fn(b.dependances, entree), cas).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
      expect(b.textes.filter((texte) => texte !== LECTURE_SEULE), cas).toEqual([SQL_VOYAGE, SQL_DROIT_VOYAGE]);
      expect(b.limiteur).not.toHaveBeenCalled();
    }
  });

  it("débit retouche refusé : rate_limited, aucun verrou pris, rien relu", async () => {
    const b = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited", retryable: true } }) });
    expect(await appliquerRetour(b.dependances, retour())).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(b.textes).toEqual([SQL_VOYAGE, SQL_DROIT_VOYAGE]);
  });

  it("recalcul en cours : generation_in_progress, après les verrous et le rejeu", async () => {
    const b = banc({ enCours: true });
    expect(await appliquerRetour(b.dependances, retour())).toEqual({ ok: false, error: { code: "generation_in_progress", retryable: true } });
    expect(b.textes).toEqual([SQL_VOYAGE, SQL_DROIT_VOYAGE, SQL_VERROU_TRI, SQL_VERROU_VERSIONS, SQL_PAR_DEMANDE, SQL_EN_COURS]);
  });

  it(`borne : ${VERSIONS_MAX_PAR_VOYAGE} versions atteintes, validation_failed sur baseVersion, sans relire le programme`, async () => {
    const b = banc({ derniere: VERSIONS_MAX_PAR_VOYAGE });
    expect(await appliquerRetour(b.dependances, retour({ baseVersion: VERSIONS_MAX_PAR_VOYAGE }))).toEqual({ ok: false, error: { code: "validation_failed", field: "baseVersion" } });
    expect(b.textes.at(-1)).toBe(SQL_DERNIERE_VERSION);
  });

  it("liste : lecture seule, une page de la plus récente à la plus ancienne, version courante marquée, débit pris une fois", async () => {
    const b = banc();
    const page = await listerVersions(b.dependances, { tripId: TRIP });
    expect(page).toEqual({
      ok: true,
      value: {
        items: [
          { version: 2, createdAt: QUAND, kind: "locked", subject: "[Musée]", revertible: false, current: true },
          { version: 1, createdAt: QUAND, kind: "prepared", revertible: false, current: false },
        ],
        nextBefore: null,
      },
    });
    expect(b.textes[1]).toBe(LECTURE_SEULE);
    expect(b.limiteur).toHaveBeenCalledTimes(1);
  });
});
