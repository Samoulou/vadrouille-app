// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import type { DaySnapshot } from "@/contracts";
import { etapesAEvaluer } from "@/domain/apres-voyage";
import { edimbourgDebloque } from "@/mocks/edimbourg";
import { RATE_LIMITS } from "@/server/config/limites";
import { SQL_VERROU_VERSIONS } from "@/server/versions/ecrire";
import type { DependancesAction } from "@/server/voyages/actions";
import type { EtatApresVoyage } from "@/server/voyages/lecture";

import {
  ACTION_LIMITEUR_AVIS,
  avisVisibles,
  donnerAvis,
  lireRevue,
  SQL_AVIS_DU_VOYAGE,
  SQL_ECRIRE_AVIS,
  SQL_EFFACER_AVIS,
  SQL_PROPRIETAIRE,
  type DependancesAvis,
} from "./avis";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Avis rapide sur `api`, sans base (M8a, ticket 1062 ; décision 0160 § 1.1, § 1.5 points 3 et 5 ; spécification M8 § 6.3
 * critères 1, 4, 5, 6, 7). `withOrg` est un double qui répond selon le texte de la requête ; la lecture du voyage et le
 * limiteur sont injectés. La partie en base (RLS, index unique, rejeu, effacement) est dans `tests/db/avis.test.ts`.
 */

const CTX: AdapterContext = { organizationId: "0e000000-0000-4000-8000-000000000001", userId: "0e000000-0000-4000-8000-000000000002", role: "owner" };
const AUTRE = "0e000000-0000-4000-8000-000000000003";
const TRIP = "0e000000-0000-4000-8000-0000000000aa";
const REQUETE = "0e000000-0000-4000-8000-0000000000cc";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

const JOURS = edimbourgDebloque.days as unknown as readonly DaySnapshot[];
const ETAPES = etapesAEvaluer(JOURS);
const PREMIERE = ETAPES[0]!;
const ETAT: EtatApresVoyage = { end: "2026-09-03", timeZone: "Europe/London", debloque: true, jours: JOURS };

type Requete = { texte: string; valeurs: unknown[] };
type Base = { voyage?: boolean; proprietaire?: string | null; avis?: Record<string, unknown>[] };

function doubleWithOrg(base: Base = {}) {
  const requetes: Requete[] = [];
  const withOrg = vi.fn(async (_ctx: unknown, fn: (tx: never) => Promise<unknown>): Promise<unknown> => {
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
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
        const texte = morceaux.join("");
        requetes.push({ texte, valeurs });
        if (texte === "SET TRANSACTION READ ONLY") return { rows: [] };
        if (texte === SQL_VOYAGE) return { rows: base.voyage === false ? [] : [{ present: 1 }] };
        if (texte === SQL_VERROU_VERSIONS) return { rows: [{}] };
        if (texte === SQL_PROPRIETAIRE) return { rows: base.proprietaire === null ? [] : [{ created_by: base.proprietaire ?? CTX.userId }] };
        if (texte === SQL_AVIS_DU_VOYAGE) return { rows: base.avis ?? [] };
        if (texte === SQL_ECRIRE_AVIS || texte === SQL_EFFACER_AVIS) return { rows: [] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, requetes };
}

function banc(base: Base = {}, options: { etat?: EtatApresVoyage | null; maintenant?: string; limiteur?: DependancesAvis["limiteur"]; ctx?: AdapterContext | null } = {}) {
  const { withOrg, requetes } = doubleWithOrg(base);
  const limiteur = vi.fn(options.limiteur ?? (async () => ({ ok: true as const, value: undefined })));
  const etat = options.etat === undefined ? ETAT : options.etat;
  const dependances: DependancesAvis = {
    contexte: async () => (options.ctx === undefined ? CTX : options.ctx),
    withOrg,
    limiteur,
    maintenant: () => Date.parse(options.maintenant ?? "2026-09-10T12:00:00+01:00"),
    lireEtat: async () => etat,
  };
  const ecritures = () => requetes.filter((r) => r.texte === SQL_ECRIRE_AVIS || r.texte === SQL_EFFACER_AVIS);
  return { dependances, requetes, limiteur, ecritures };
}

const demande = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, stopId: PREMIERE.stopId, rating: "liked", requestId: REQUETE, ...extra });

describe("donnerAvis : écriture", () => {
  it("valeur : une instruction INSERT … ON CONFLICT avec le placeId de la version courante, l'auteur de la session et le requestId", async () => {
    const { dependances, ecritures, limiteur } = banc();
    expect(await donnerAvis(dependances, demande())).toEqual({ ok: true, value: { stopId: PREMIERE.stopId, rating: "liked" } });
    expect(ecritures()).toEqual([{ texte: SQL_ECRIRE_AVIS, valeurs: [CTX.organizationId, TRIP, PREMIERE.stopId, PREMIERE.placeId, "liked", CTX.userId, REQUETE] }]);
    expect(limiteur).toHaveBeenCalledOnce();
  });

  it("rating null : effacement de la ligne de l'étape et du lieu courant ; réponse null", async () => {
    const { dependances, ecritures } = banc();
    expect(await donnerAvis(dependances, demande({ rating: null }))).toEqual({ ok: true, value: null });
    expect(ecritures()).toEqual([{ texte: SQL_EFFACER_AVIS, valeurs: [CTX.organizationId, TRIP, PREMIERE.stopId, PREMIERE.placeId] }]);
  });

  it("un placeId ou une clé inconnue dans la demande est refusé par le schéma strict, rien n'est lu", async () => {
    const { dependances, requetes } = banc();
    expect((await donnerAvis(dependances, demande({ placeId: "ChIJ-client" }))).ok).toBe(false);
    expect((await donnerAvis(dependances, demande({ rating: "great" }))).ok).toBe(false);
    expect(requetes).toEqual([]);
  });
});

describe("donnerAvis : refus (critères 5, 6, 7)", () => {
  it("sans session : unauthenticated", async () => {
    const { dependances, requetes } = banc({}, { ctx: null });
    expect(await donnerAvis(dependances, demande())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(requetes).toEqual([]);
  });

  it.each([
    ["voyage hors de l'organisation", { voyage: false }, {}],
    ["membre non propriétaire", { proprietaire: AUTRE }, {}],
    ["voyage sans version lisible", {}, { etat: null }],
    ["voyage non débloqué", {}, { etat: { ...ETAT, debloque: false } }],
    ["avant le dernier jour (2026-09-02 à 23:59 à Londres)", {}, { maintenant: "2026-09-02T23:59:00+01:00" }],
    ["lecture seule (2026-10-04)", {}, { maintenant: "2026-10-04T00:00:00+01:00" }],
  ] as const)("%s : not_found, rien d'écrit, limiteur non appelé", async (_nom, base, options) => {
    const { dependances, ecritures, limiteur } = banc(base, options);
    expect(await donnerAvis(dependances, demande())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(ecritures()).toEqual([]);
    expect(limiteur).not.toHaveBeenCalled();
  });

  it("2026-09-03 à 00:00 et 2026-10-03 : écrit (bornes de l'accès)", async () => {
    for (const maintenant of ["2026-09-03T00:00:00+01:00", "2026-10-03T23:59:00+01:00"]) {
      const { dependances, ecritures } = banc({}, { maintenant });
      expect((await donnerAvis(dependances, demande())).ok, maintenant).toBe(true);
      expect(ecritures()).toHaveLength(1);
    }
  });

  it("limite `avis` atteinte : rate_limited, rien d'écrit ; vérifiée avant l'étape", async () => {
    const { dependances, ecritures } = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited" } }) });
    expect(await donnerAvis(dependances, demande({ stopId: "inconnue" }))).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(ecritures()).toEqual([]);
  });

  it("étape qui n'est pas à évaluer (inconnue, événement hors programme, jour en préparation) : validation_failed sur stopId", async () => {
    const horsProgramme = edimbourgDebloque.days.flatMap((day) => day.events.map((event) => event.id)).find((id) => !ETAPES.some((e) => e.stopId === id));
    const preparation = edimbourgDebloque.days.find((day) => day.generating)?.items.find((item) => item.type === "stop");
    for (const stopId of ["inconnue", horsProgramme, preparation?.type === "stop" ? preparation.stop.id : undefined].filter((v): v is string => v !== undefined)) {
      const { dependances, ecritures } = banc();
      expect(await donnerAvis(dependances, demande({ stopId })), stopId).toEqual({ ok: false, error: { code: "validation_failed", field: "stopId" } });
      expect(ecritures()).toEqual([]);
    }
  });

  it("limite `avis` : proposition de 0160 § 2.3 (S3), 120 par heure et par adresse IP", () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_AVIS]).toEqual([{ kind: "ip", windowSeconds: 3600, threshold: 120 }]);
  });
});

describe("lireRevue (getTripReview sur api)", () => {
  it("accès calculé par le serveur ; avis de la version courante seulement (critère 4 : autre placeId invisible)", async () => {
    const autre = ETAPES[1]!;
    const avis = [
      { stop_id: PREMIERE.stopId, place_id: PREMIERE.placeId, opinion: "liked" },
      { stop_id: autre.stopId, place_id: "ChIJ-ancien-lieu", opinion: "disliked" },
      { stop_id: "etape-disparue", place_id: null, opinion: "notDone" },
    ];
    const { dependances } = banc({ avis });
    expect(await lireRevue(dependances, CTX, TRIP)).toEqual({
      tripId: TRIP,
      access: "open",
      reviews: [{ stopId: PREMIERE.stopId, rating: "liked" }],
      tasteCandidates: [],
      retainedIds: [],
    });
  });

  it("avant le dernier jour : notEnded, aucun avis lu ; lecture seule : readOnly avec les avis", async () => {
    const avis = [{ stop_id: PREMIERE.stopId, place_id: PREMIERE.placeId, opinion: "notDone" }];
    const avant = banc({ avis }, { maintenant: "2026-09-02T12:00:00+01:00" });
    expect(await lireRevue(avant.dependances, CTX, TRIP)).toMatchObject({ access: "notEnded", reviews: [] });
    expect(avant.requetes.some((r) => r.texte === SQL_AVIS_DU_VOYAGE)).toBe(false);
    const apres = banc({ avis }, { maintenant: "2026-10-04T12:00:00+01:00" });
    expect(await lireRevue(apres.dependances, CTX, TRIP)).toMatchObject({ access: "readOnly", reviews: [{ stopId: PREMIERE.stopId, rating: "notDone" }] });
  });

  it.each([
    ["identifiant illisible", {}, {}, "pas-un-uuid"],
    ["membre non propriétaire", { proprietaire: AUTRE }, {}, TRIP],
    ["voyage inconnu", { proprietaire: null }, {}, TRIP],
    ["voyage non débloqué", {}, { etat: { ...ETAT, debloque: false } }, TRIP],
  ] as const)("%s : null (404)", async (_nom, base, options, tripId) => {
    const { dependances } = banc(base, options);
    expect(await lireRevue(dependances, CTX, tripId)).toBeNull();
  });
});

describe("avisVisibles", () => {
  it("ignore une valeur hors liste et garde l'ordre du programme", () => {
    const [a, b] = ETAPES;
    expect(
      avisVisibles(ETAPES, [
        { stop_id: b!.stopId, place_id: b!.placeId, opinion: "disliked" },
        { stop_id: a!.stopId, place_id: a!.placeId, opinion: "liked" },
        { stop_id: a!.stopId, place_id: a!.placeId, opinion: "great" },
      ]),
    ).toEqual([
      { stopId: a!.stopId, rating: "liked" },
      { stopId: b!.stopId, rating: "disliked" },
    ]);
  });
});
