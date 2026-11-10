// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { TripReviewSchema, type DaySnapshot, type RetainedTaste } from "@/contracts";
import { edimbourgDebloque } from "@/mocks/edimbourg";
import { lireRevue, SQL_AVIS_DU_VOYAGE, SQL_PROPRIETAIRE } from "@/server/avis/avis";
import { GOUT_DEDUIT_SEUIL, GOUT_DISTANCE_PROPOSE } from "@/server/config/gouts";
import { RATE_LIMITS } from "@/server/config/limites";
import type { SignalLuDuRecalcul } from "@/server/generation/signaux";
import type { DependancesAction } from "@/server/voyages/actions";
import type { EtatApresVoyage } from "@/server/voyages/lecture";

import {
  ACTION_LIMITEUR_GOUTS,
  restaurerGout,
  retenirGouts,
  retirerGout,
  retirerTousLesGouts,
  SQL_RETENIR_GOUT,
  SQL_RETIRER_GOUT,
  SQL_RETIRER_TOUS_LES_GOUTS,
  SQL_VOYAGE_DE_LA_PERSONNE,
  type DependancesGouts,
} from "./gouts";
import { candidatsDuVoyage, lireGoutsRetenus, projeterSignal, SQL_GOUTS_DE_LA_PERSONNE, sujetDeCle } from "./lecture";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Goûts retenus sur `api`, sans base (M8c-1, ticket 1121 ; spécification M8 § 5.1 à § 5.3 et § 6.5, critères 1 à 7 ;
 * décision 0160 § 1.7, § 1.8 et § 3.5). `withOrg` est un double qui répond selon le texte de la requête ; la lecture du
 * voyage, les signaux et le limiteur sont injectés. La partie en base (RLS par personne, index unique, ordre, clé du voyage
 * d'origine) est dans `tests/db/gouts.test.ts`.
 */

const CTX: AdapterContext = { organizationId: "0e000000-0000-4000-8000-000000000001", userId: "0e000000-0000-4000-8000-000000000002", role: "owner" };
const AUTRE = "0e000000-0000-4000-8000-000000000003";
const TRIP = "0e000000-0000-4000-8000-0000000000aa";
const AUTRE_VOYAGE = "0e000000-0000-4000-8000-0000000000ab";
const REQUETE = "0e000000-0000-4000-8000-0000000000cc";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

const JOURS = edimbourgDebloque.days as unknown as readonly DaySnapshot[];
const ETAT: EtatApresVoyage = { end: "2026-09-03", timeZone: "Europe/London", debloque: true, jours: JOURS };

/** Sentinelles : aucune ne doit atteindre le domaine, une requête d'écriture ni une réponse. */
const SENTINELLE_PLACE = "SENTINELLE_PLACE_GOUTS_M8C1";
const SENTINELLE_CANDIDAT = "SENTINELLE_CANDIDAT_GOUTS_M8C1";
const SENTINELLE_CARTE = "SENTINELLE_CARTE_GOUTS_M8C1";

let ligne = 0;
const lu = (signal: SignalLuDuRecalcul["signal"], category: SignalLuDuRecalcul["category"], status: SignalLuDuRecalcul["status"] = "confirmed"): SignalLuDuRecalcul => ({
  signal,
  category,
  origin: signal === "answerYes" || signal === "travelReduction" ? "question" : "gesture",
  status,
  proposalId: SENTINELLE_CARTE,
  candidatId: SENTINELLE_CANDIDAT,
  placeId: SENTINELLE_PLACE,
  ligne: `ligne-${++ligne}`,
});

/** Tri du voyage : musées arrêtés, trois dégustations aimées, deux marchés aimés, une réduction des trajets. */
const SIGNAUX: readonly SignalLuDuRecalcul[] = [
  lu("answerYes", "museum"),
  lu("like", "tasting"),
  lu("like", "tasting"),
  lu("choose", "tasting"),
  lu("like", "market"),
  lu("like", "market"),
  lu("travelReduction", null),
];

const EVITER_MUSEES = "category:museum:less";
const AIMER_DEGUSTATIONS = "category:tasting:more";

type Requete = { texte: string; valeurs: unknown[] };
type Base = {
  voyage?: boolean;
  proprietaire?: string | null;
  /** Lignes de `preferences` de la personne (lecture). */
  gouts?: Record<string, unknown>[];
  /** Sujets déjà retenus : l'`INSERT … ON CONFLICT DO NOTHING` n'écrit rien pour eux. */
  dejaRetenus?: string[];
  /** Ligne rendue par le `DELETE … RETURNING` ; absente : aucun goût à retirer. */
  retire?: Record<string, unknown>;
  voyageDeLaPersonne?: boolean;
};

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
        if (texte === SQL_PROPRIETAIRE) return { rows: base.proprietaire === null ? [] : [{ created_by: base.proprietaire ?? CTX.userId }] };
        if (texte === SQL_AVIS_DU_VOYAGE) return { rows: [] };
        if (texte === SQL_GOUTS_DE_LA_PERSONNE) return { rows: base.gouts ?? [] };
        if (texte === SQL_RETENIR_GOUT) {
          const cle = valeurs[2] === "distance" ? "distance" : `category:${String(valeurs[3])}:${String(valeurs[4])}`;
          return { rows: base.dejaRetenus?.includes(cle) ? [] : [{ subject_kind: valeurs[2] }] };
        }
        if (texte === SQL_RETIRER_GOUT) return { rows: base.retire === undefined ? [] : [base.retire] };
        if (texte === SQL_RETIRER_TOUS_LES_GOUTS) return { rows: [] };
        if (texte === SQL_VOYAGE_DE_LA_PERSONNE) return { rows: base.voyageDeLaPersonne === false ? [] : [{ present: 1 }] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, requetes };
}

type Options = {
  etat?: EtatApresVoyage | null;
  maintenant?: string;
  limiteur?: DependancesGouts["limiteur"];
  compter?: DependancesGouts["compter"];
  ctx?: AdapterContext | null;
  signaux?: readonly SignalLuDuRecalcul[];
};

function banc(base: Base = {}, options: Options = {}) {
  const { withOrg, requetes } = doubleWithOrg(base);
  const limiteur = vi.fn(options.limiteur ?? (async () => ({ ok: true as const, value: undefined })));
  const compter = vi.fn(options.compter ?? (async () => undefined));
  const lireEtat = vi.fn(async () => (options.etat === undefined ? ETAT : options.etat));
  const lireSignaux = vi.fn(async () => options.signaux ?? SIGNAUX);
  const dependances: DependancesGouts = {
    contexte: async () => (options.ctx === undefined ? CTX : options.ctx),
    withOrg,
    limiteur,
    compter,
    maintenant: () => Date.parse(options.maintenant ?? "2026-09-10T12:00:00+01:00"),
    lireEtat,
    lireSignaux,
  };
  const de = (texte: string) => requetes.filter((r) => r.texte === texte);
  const ecritures = () => requetes.filter((r) => [SQL_RETENIR_GOUT, SQL_RETIRER_GOUT, SQL_RETIRER_TOUS_LES_GOUTS].includes(r.texte));
  return { dependances, requetes, limiteur, compter, lireEtat, lireSignaux, de, ecritures };
}

const retenue = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, candidateIds: [AIMER_DEGUSTATIONS, EVITER_MUSEES], requestId: REQUETE, ...extra });

const GOUT_MUSEES: RetainedTaste = {
  id: EVITER_MUSEES,
  origin: "confirmed",
  subject: { kind: "category", category: "museum", direction: "less" },
  fromTripId: TRIP,
};

describe("candidats du voyage (critère 1 ; 0160 § 1.7 et § 1.8)", () => {
  it("projection explicite : trois clés, aucune sentinelle ne passe au domaine", () => {
    for (const signal of SIGNAUX) {
      const projete = projeterSignal(signal);
      expect(Object.keys(projete).sort()).toEqual(["category", "signal", "status"]);
      expect(JSON.stringify(projete)).not.toMatch(/SENTINELLE/);
    }
  });

  it("candidats recalculés depuis les signaux du voyage ; aucun « distance » sur api tant que GOUT_DISTANCE_PROPOSE est faux", async () => {
    const { lireSignaux } = banc();
    const executeur = { query: async () => ({ rows: [] }) };
    const candidats = await candidatsDuVoyage(executeur, CTX, TRIP, lireSignaux);
    expect(candidats).toEqual([
      { id: EVITER_MUSEES, origin: "confirmed", subject: { kind: "category", category: "museum", direction: "less" } },
      { id: AIMER_DEGUSTATIONS, origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" } },
    ]);
    expect(lireSignaux).toHaveBeenCalledWith(executeur, CTX.organizationId, TRIP);
    expect(GOUT_DISTANCE_PROPOSE).toBe(false);
    expect(GOUT_DEDUIT_SEUIL).toBe(3);
    expect(JSON.stringify(candidats)).not.toMatch(/SENTINELLE/);
  });

  it("sujetDeCle : clés de préférence seulement", () => {
    expect(sujetDeCle("distance")).toEqual({ kind: "distance" });
    expect(sujetDeCle(EVITER_MUSEES)).toEqual({ kind: "category", category: "museum", direction: "less" });
    for (const cle of ["", "category:museum", "category:museum:less:x", "category:inconnue:less", "category:museum:autre", "place:ChIJ:less"]) {
      expect(sujetDeCle(cle), cle).toBeNull();
    }
  });
});

describe("lireRevue : goûts de l'écran 16", () => {
  it("accès open : candidats du voyage et clés déjà retenues par la personne, valides au schéma strict", async () => {
    const { dependances, de } = banc({ gouts: [{ subject_kind: "category", category: "museum", direction: "less", origin: "confirmed", source_trip_id: AUTRE_VOYAGE }] });
    const revue = await lireRevue(dependances, CTX, TRIP);
    expect(revue?.tasteCandidates.map((c) => c.id)).toEqual([EVITER_MUSEES, AIMER_DEGUSTATIONS]);
    expect(revue?.retainedIds).toEqual([EVITER_MUSEES]);
    expect(TripReviewSchema.safeParse(revue).success).toBe(true);
    expect(de(SQL_GOUTS_DE_LA_PERSONNE)).toEqual([{ texte: SQL_GOUTS_DE_LA_PERSONNE, valeurs: [CTX.organizationId, CTX.userId] }]);
    expect(JSON.stringify(revue)).not.toMatch(/SENTINELLE/);
  });

  it("avant le dernier jour : ni candidat ni goût lu ; lecture seule : candidats et goûts retenus encore rendus", async () => {
    const avant = banc({}, { maintenant: "2026-09-02T12:00:00+01:00" });
    expect(await lireRevue(avant.dependances, CTX, TRIP)).toMatchObject({ access: "notEnded", tasteCandidates: [], retainedIds: [] });
    expect(avant.lireSignaux).not.toHaveBeenCalled();
    expect(avant.de(SQL_GOUTS_DE_LA_PERSONNE)).toEqual([]);
    const apres = banc({}, { maintenant: "2026-10-04T12:00:00+01:00" });
    expect((await lireRevue(apres.dependances, CTX, TRIP))?.tasteCandidates).toHaveLength(2);
  });
});

describe("retenirGouts (critères 2 et 3)", () => {
  it("une ligne par goût coché, dans l'ordre de preferenceKey : sujet, origine et voyage d'origine recalculés, personne de la session", async () => {
    const { dependances, ecritures, limiteur } = banc();
    const resultat = await retenirGouts(dependances, retenue());
    expect(resultat).toEqual({
      ok: true,
      value: [GOUT_MUSEES, { id: AIMER_DEGUSTATIONS, origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" }, fromTripId: TRIP }],
    });
    expect(ecritures()).toEqual([
      { texte: SQL_RETENIR_GOUT, valeurs: [CTX.organizationId, CTX.userId, "category", "museum", "less", "confirmed", TRIP] },
      { texte: SQL_RETENIR_GOUT, valeurs: [CTX.organizationId, CTX.userId, "category", "tasting", "more", "inferred", TRIP] },
    ]);
    expect(limiteur).toHaveBeenCalledOnce();
  });

  it("aucune donnée Google ni texte : sentinelles des signaux absentes des requêtes d'écriture et de la réponse ; sept colonnes, pas d'instant", async () => {
    const { dependances, ecritures } = banc();
    const resultat = await retenirGouts(dependances, retenue());
    expect(JSON.stringify([ecritures(), resultat])).not.toMatch(/SENTINELLE/);
    expect(SQL_RETENIR_GOUT).toContain("(organization_id, user_id, subject_kind, category, direction, origin, source_trip_id)");
    expect(SQL_RETENIR_GOUT).not.toMatch(/consented_at|created_at|\bid\b/);
  });

  it("un sujet déjà retenu n'est pas retenu deux fois : rien n'est rendu pour lui (première origine et premier voyage gardés)", async () => {
    const { dependances } = banc({ dejaRetenus: [EVITER_MUSEES] });
    const resultat = await retenirGouts(dependances, retenue());
    expect(resultat.ok && resultat.value.map((g) => g.id)).toEqual([AIMER_DEGUSTATIONS]);
    const tout = banc({ dejaRetenus: [EVITER_MUSEES, AIMER_DEGUSTATIONS] });
    expect(await retenirGouts(tout.dependances, retenue())).toEqual({ ok: true, value: [] });
  });

  it.each([
    ["sans case cochée", { candidateIds: [] }],
    ["clé inconnue", { candidateIds: ["category:museum:plus"] }],
    ["doublon", { candidateIds: [EVITER_MUSEES, EVITER_MUSEES] }],
    ["placeId dans la demande", { placeId: "ChIJ-client" }],
    ["origine fournie par le client", { origin: "confirmed" }],
  ])("%s : refusé par le schéma strict, rien n'est lu ni écrit", async (_nom, extra) => {
    const { dependances, requetes } = banc();
    expect(await retenirGouts(dependances, retenue(extra))).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(requetes).toEqual([]);
  });

  it("clé valide qui n'est pas un candidat recalculé (deux « J'aime » seulement, distance fermée) : validation_failed, rien n'est écrit", async () => {
    for (const cle of ["category:market:more", "distance", "category:tasting:less"]) {
      const { dependances, ecritures } = banc();
      expect(await retenirGouts(dependances, retenue({ candidateIds: [EVITER_MUSEES, cle] })), cle).toEqual({ ok: false, error: { code: "validation_failed", field: "candidateIds" } });
      expect(ecritures()).toEqual([]);
    }
  });

  it("sans session : unauthenticated", async () => {
    const { dependances, requetes } = banc({}, { ctx: null });
    expect(await retenirGouts(dependances, retenue())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(requetes).toEqual([]);
  });

  it.each([
    ["voyage hors de l'organisation", { voyage: false }, {}],
    ["membre non propriétaire", { proprietaire: AUTRE }, {}],
    ["voyage non débloqué", {}, { etat: { ...ETAT, debloque: false } }],
    ["avant le dernier jour", {}, { maintenant: "2026-09-02T23:59:00+01:00" }],
    ["lecture seule (critère 7)", {}, { maintenant: "2026-10-04T00:00:00+01:00" }],
  ] as const)("%s : not_found, rien d'écrit, ni limiteur ni signaux lus", async (_nom, base, options) => {
    const { dependances, ecritures, limiteur, lireSignaux } = banc(base, options);
    expect(await retenirGouts(dependances, retenue())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(ecritures()).toEqual([]);
    expect(limiteur).not.toHaveBeenCalled();
    expect(lireSignaux).not.toHaveBeenCalled();
  });

  it("limite `gouts` atteinte : rate_limited, rien d'écrit", async () => {
    const { dependances, ecritures } = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited" } }) });
    expect(await retenirGouts(dependances, retenue())).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(ecritures()).toEqual([]);
  });

  it("limite `gouts` : 0160 § 2.3 (S3), 20 par heure et par adresse IP", () => {
    expect(RATE_LIMITS[ACTION_LIMITEUR_GOUTS]).toEqual([{ kind: "ip", windowSeconds: 3600, threshold: 20 }]);
  });
});

describe("retirerGout et retirerTousLesGouts (critères 4, 5 et 6)", () => {
  const RETIRE = { origin: "confirmed", source_trip_id: TRIP };

  it("retire le goût de la personne de la session et le rend pour « Annuler »", async () => {
    const { dependances, ecritures } = banc({ retire: RETIRE });
    expect(await retirerGout(dependances, { tasteId: EVITER_MUSEES, requestId: REQUETE })).toEqual({ ok: true, value: GOUT_MUSEES });
    expect(ecritures()).toEqual([{ texte: SQL_RETIRER_GOUT, valeurs: [CTX.organizationId, CTX.userId, "category", "museum", "less"] }]);
  });

  it("distance et voyage d'origine supprimé : clés vides pour COALESCE, fromTripId nul", async () => {
    const { dependances, ecritures } = banc({ retire: { origin: "confirmed", source_trip_id: null } });
    expect(await retirerGout(dependances, { tasteId: "distance", requestId: REQUETE })).toEqual({
      ok: true,
      value: { id: "distance", origin: "confirmed", subject: { kind: "distance" }, fromTripId: null },
    });
    expect(ecritures()[0]?.valeurs).toEqual([CTX.organizationId, CTX.userId, "distance", "", ""]);
  });

  it("jamais refusé : limiteur en panne ou qui refuse, le retrait réussit ; ni voyage, ni déblocage, ni dates lus", async () => {
    for (const compter of [
      async () => {
        throw new Error("limiteur en panne");
      },
      async () => ({ ok: false, error: { code: "rate_limited" } }),
    ]) {
      const un = banc({ retire: RETIRE }, { compter, limiteur: async () => ({ ok: false, error: { code: "rate_limited" } }), etat: null, maintenant: "2027-01-01T00:00:00Z" });
      expect((await retirerGout(un.dependances, { tasteId: EVITER_MUSEES, requestId: REQUETE })).ok).toBe(true);
      expect(un.compter).toHaveBeenCalledOnce();
      const tous = banc({}, { compter, limiteur: async () => ({ ok: false, error: { code: "rate_limited" } }), etat: null, maintenant: "2027-01-01T00:00:00Z" });
      expect(await retirerTousLesGouts(tous.dependances, { requestId: REQUETE })).toEqual({ ok: true, value: undefined });
      expect(tous.compter).toHaveBeenCalledOnce();
      for (const b of [un, tous]) {
        expect(b.limiteur).not.toHaveBeenCalled();
        expect(b.lireEtat).not.toHaveBeenCalled();
        expect(b.requetes.map((r) => r.texte).filter((texte) => /trips|trip_versions|unlock/i.test(texte))).toEqual([]);
      }
    }
  });

  it("goût absent, d'une autre personne ou d'une autre organisation : not_found sans distinguer les cas (la requête porte l'organisation et la personne de la session)", async () => {
    const { dependances, ecritures } = banc();
    expect(await retirerGout(dependances, { tasteId: EVITER_MUSEES, requestId: REQUETE })).toEqual({ ok: false, error: { code: "not_found" } });
    expect(ecritures()[0]?.valeurs.slice(0, 2)).toEqual([CTX.organizationId, CTX.userId]);
  });

  it("tout retirer : une instruction pour la personne de la session ; réussit aussi sans goût", async () => {
    const { dependances, ecritures } = banc();
    expect(await retirerTousLesGouts(dependances, { requestId: REQUETE })).toEqual({ ok: true, value: undefined });
    expect(ecritures()).toEqual([{ texte: SQL_RETIRER_TOUS_LES_GOUTS, valeurs: [CTX.organizationId, CTX.userId] }]);
  });

  it("entrée stricte et session : identifiant de ligne, organisation ou personne dans la demande refusés ; sans session, unauthenticated", async () => {
    const { dependances, requetes } = banc({ retire: RETIRE });
    for (const entree of [{ tasteId: "pas-une-cle", requestId: REQUETE }, { tasteId: EVITER_MUSEES, requestId: REQUETE, userId: AUTRE }, { tasteId: EVITER_MUSEES, requestId: REQUETE, organizationId: AUTRE }, { tasteId: EVITER_MUSEES }]) {
      expect(await retirerGout(dependances, entree)).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    }
    expect(await retirerTousLesGouts(dependances, { requestId: REQUETE, userId: AUTRE })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(requetes).toEqual([]);
    const sans = banc({ retire: RETIRE }, { ctx: null });
    expect(await retirerGout(sans.dependances, { tasteId: EVITER_MUSEES, requestId: REQUETE })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(await retirerTousLesGouts(sans.dependances, { requestId: REQUETE })).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(sans.requetes).toEqual([]);
  });

  it("erreur de la base : internal, sans message", async () => {
    const { dependances } = banc();
    const casse = { ...dependances, withOrg: (async () => Promise.reject(new Error("SENTINELLE base"))) as unknown as FonctionWithOrg };
    expect(await retirerGout(casse, { tasteId: EVITER_MUSEES, requestId: REQUETE })).toEqual({ ok: false, error: { code: "internal" } });
  });
});

describe("restaurerGout (« Annuler », critère 4)", () => {
  it("réinsère le goût rendu par removeTaste (sujet, origine, voyage d'origine), sans instant : la base le pose", async () => {
    const { dependances, requetes, limiteur } = banc();
    expect(await restaurerGout(dependances, { taste: GOUT_MUSEES, requestId: REQUETE })).toEqual({ ok: true, value: undefined });
    expect(requetes.map((r) => r.texte)).toEqual([SQL_VOYAGE_DE_LA_PERSONNE, SQL_RETENIR_GOUT]);
    expect(requetes[0]?.valeurs).toEqual([CTX.organizationId, TRIP, CTX.userId]);
    expect(requetes[1]?.valeurs).toEqual([CTX.organizationId, CTX.userId, "category", "museum", "less", "confirmed", TRIP]);
    expect(limiteur).toHaveBeenCalledOnce();
  });

  it("voyage d'origine supprimé (fromTripId nul) : réinséré sans voyage, aucun voyage lu", async () => {
    const { dependances, requetes } = banc();
    expect((await restaurerGout(dependances, { taste: { ...GOUT_MUSEES, fromTripId: null }, requestId: REQUETE })).ok).toBe(true);
    expect(requetes.map((r) => r.texte)).toEqual([SQL_RETENIR_GOUT]);
    expect(requetes[0]?.valeurs[6]).toBeNull();
  });

  it("voyage d'origine qui n'est pas un voyage de la personne, ou identifiant illisible : validation_failed, rien n'est écrit", async () => {
    const autre = banc({ voyageDeLaPersonne: false });
    expect(await restaurerGout(autre.dependances, { taste: GOUT_MUSEES, requestId: REQUETE })).toEqual({ ok: false, error: { code: "validation_failed", field: "taste" } });
    expect(autre.ecritures()).toEqual([]);
    const illisible = banc();
    expect(await restaurerGout(illisible.dependances, { taste: { ...GOUT_MUSEES, fromTripId: "mock_trip_lisbonne" }, requestId: REQUETE })).toEqual({ ok: false, error: { code: "validation_failed", field: "taste" } });
    expect(illisible.requetes).toEqual([]);
  });

  it("goût mal formé (id qui n'est pas la clé du sujet, nom, placeId) : refusé par le schéma strict", async () => {
    const { dependances, requetes } = banc();
    for (const taste of [{ ...GOUT_MUSEES, id: AIMER_DEGUSTATIONS }, { ...GOUT_MUSEES, name: "SENTINELLE" }, { ...GOUT_MUSEES, placeId: "ChIJ" }, { ...GOUT_MUSEES, origin: "brief" }]) {
      expect(await restaurerGout(dependances, { taste, requestId: REQUETE })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    }
    expect(requetes).toEqual([]);
  });

  it("limite `gouts` atteinte : rate_limited, rien d'écrit, et aucune requête avant la limite (revue de la PR 1124, mineur 2)", async () => {
    const { dependances, ecritures, requetes } = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited" } }) });
    expect(await restaurerGout(dependances, { taste: GOUT_MUSEES, requestId: REQUETE })).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(ecritures()).toEqual([]);
    expect(requetes).toEqual([]);
  });

  it("goût que la règle des candidats ne produit pas : validation_failed (taste), ni limite comptée ni requête (revue de la PR 1124, mineur 1)", async () => {
    const { dependances, requetes, limiteur } = banc();
    const refus = { ok: false, error: { code: "validation_failed", field: "taste" } };
    const impossibles = [
      // « distance » tant que GOUT_DISTANCE_PROPOSE est faux (0160 § 1.7 point 2), quelle que soit l'origine.
      { id: "distance", origin: "confirmed", subject: { kind: "distance" }, fromTripId: TRIP },
      { id: "distance", origin: "inferred", subject: { kind: "distance" }, fromTripId: null },
      // « éviter » n'est jamais déduit ; « aimer » n'est jamais confirmé.
      { ...GOUT_MUSEES, origin: "inferred" },
      { id: AIMER_DEGUSTATIONS, origin: "confirmed", subject: { kind: "category", category: "tasting", direction: "more" }, fromTripId: TRIP },
    ];
    for (const taste of impossibles) expect(await restaurerGout(dependances, { taste, requestId: REQUETE }), JSON.stringify(taste)).toEqual(refus);
    expect(requetes).toEqual([]);
    expect(limiteur).not.toHaveBeenCalled();
  });

  it("« aimer » déduit, jamais candidat de ce voyage : rétabli (le serveur ne garde rien du retrait, option (a) de S2)", async () => {
    const { dependances, de } = banc({}, { signaux: [] });
    const taste = { id: AIMER_DEGUSTATIONS, origin: "inferred", subject: { kind: "category", category: "tasting", direction: "more" }, fromTripId: TRIP };
    expect(await restaurerGout(dependances, { taste, requestId: REQUETE })).toEqual({ ok: true, value: undefined });
    expect(de(SQL_RETENIR_GOUT).map((r) => r.valeurs)).toEqual([[CTX.organizationId, CTX.userId, "category", "tasting", "more", "inferred", TRIP]]);
  });
});

describe("lireGoutsRetenus (« Tes goûts retenus », critères 4 et 6)", () => {
  it("goûts de la personne de la session dans l'ordre de la requête ; voyage d'origine nul gardé ; lecture seule", async () => {
    const { withOrg, requetes } = doubleWithOrg({
      gouts: [
        { subject_kind: "category", category: "museum", direction: "less", origin: "confirmed", source_trip_id: TRIP },
        { subject_kind: "distance", category: null, direction: null, origin: "confirmed", source_trip_id: null },
      ],
    });
    expect(await lireGoutsRetenus({ withOrg }, CTX)).toEqual([GOUT_MUSEES, { id: "distance", origin: "confirmed", subject: { kind: "distance" }, fromTripId: null }]);
    expect(requetes).toEqual([
      { texte: "SET TRANSACTION READ ONLY", valeurs: [] },
      { texte: SQL_GOUTS_DE_LA_PERSONNE, valeurs: [CTX.organizationId, CTX.userId] },
    ]);
    expect(SQL_GOUTS_DE_LA_PERSONNE).toContain("ORDER BY consented_at, subject_kind, category, direction");
  });

  it("ligne illisible (catégorie hors liste) : erreur, jamais un goût inventé", async () => {
    const { withOrg } = doubleWithOrg({ gouts: [{ subject_kind: "category", category: "SENTINELLE", direction: "less", origin: "confirmed", source_trip_id: null }] });
    await expect(lireGoutsRetenus({ withOrg }, CTX)).rejects.toThrow();
  });
});
