// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { ApiErrorSchema, PlaceSearchResultsSchema } from "@/contracts";
import { ErreurClientGoogle } from "@/grounding/enveloppe-google";
import { creerRechercheLieuxSimulee, SENTINELLE_ADRESSE_LIEU, SENTINELLE_NOM_LIEU } from "@/grounding/places.simule";
import { barriereLieuxApi, journaliserExceptionLieux, NIVEAUX_LIEU_API, rechercherLieuxApiTerminal, type DependancesLieuxApi } from "@/server/composition/lieux-api";
import { RATE_LIMITS } from "@/server/config/limites";
import { SEUILS_LIEUX, SEUILS_LIEUX_VALIDES } from "@/server/config/lieux";
import { evaluerBarriere, type EtatBarriere } from "@/server/generation/barriere";
import { resultatsRendus, SQL_VILLE_DU_JOUR } from "@/server/lieux/recherche";
import { LOG_LIEU_REASONS } from "@/server/log";
import { SQL_DROIT_VOYAGE } from "@/server/payment/paiements";
import { createRateLimiter, type RateLimitClient, type RateLimitPool } from "@/server/rate-limit";

/**
 * Recherche d'un lieu à soi de `api` (tâche M5d-1, ticket 939 ; décision 0147 § 3 point 6, § 6.4, § 12 S1 à S3) : cœur
 * `src/server/lieux/recherche.ts` et terminal `src/server/composition/lieux-api.ts`. Base, client Places, limiteur,
 * compteurs et purge doublés : aucun appel Google, aucune base, aucune clé lue.
 */

type FonctionWithOrg = NonNullable<DependancesLieuxApi["withOrg"]>;

const CTX: AdapterContext = { organizationId: "0d000000-0000-4000-8000-000000000001", userId: "0d000000-0000-4000-8000-000000000002", role: "owner" };
const TRIP = "0d000000-0000-4000-8000-0000000000aa";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";
const SAISIE = "SENTINELLE-SAISIE-M5D";
const VILLE = "SENTINELLE-VILLE-M5D";
const BRANCHE = "m1h-essai";
const ENV_REUNI = { VERCEL_ENV: "preview", VERCEL_GIT_COMMIT_REF: BRANCHE, GENERATION_APPELS_REELS: "1" };
const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });

afterEach(() => {
  vi.restoreAllMocks();
});

/** Le double numérote chaque paramètre lié : `$3` répété dans la requête devient `$3`, `$4`, `$5`. */
let rang = 0;
const VILLE_DU_JOUR = SQL_VILLE_DU_JOUR.replace(/\$\d+/g, () => `$${String((rang += 1))}`);

type Base = { voyage?: boolean; debloque?: boolean; ville?: unknown };

/** `withOrg` doublé : texte SQL reconstitué (paramètres `$n`), réponses fixées par requête. */
function doubleWithOrg(base: Base = {}) {
  const textes: string[] = [];
  const parametres: unknown[][] = [];
  const withOrg = vi.fn(async (_ctx: unknown, fn: (tx: never) => Promise<unknown>): Promise<unknown> => {
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const morceaux: string[] = [];
        const valeurs: unknown[] = [];
        let n = 0;
        for (const morceau of requete.queryChunks) {
          const m = morceau as { value?: unknown; queryChunks?: unknown[] };
          if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
          else if (m.queryChunks !== undefined) {
            for (const interne of m.queryChunks) {
              const i = interne as { value?: unknown };
              if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
              else {
                valeurs.push(i.value);
                morceaux.push(`$${(n += 1)}`);
              }
            }
          }
        }
        const texte = morceaux.join("");
        textes.push(texte);
        parametres.push(valeurs);
        if (texte === "SET TRANSACTION READ ONLY") return { rows: [] };
        if (texte === SQL_VOYAGE) return { rows: base.voyage === false ? [] : [{ present: 1 }] };
        if (texte === SQL_DROIT_VOYAGE) return { rows: base.debloque === false ? [] : [{ id: "droit-1" }] };
        if (texte === VILLE_DU_JOUR) return { rows: base.ville === undefined ? [] : [{ city: base.ville }] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, textes, parametres };
}

/** Client doublé (sentinelles), fabrique, limiteur, réservation et purge ; tous accordés par défaut. */
function doubles(resultats = 3) {
  const ordre: string[] = [];
  const simule = creerRechercheLieuxSimulee({ resultats });
  const client = {
    rechercherLieux: vi.fn(async (texte: string, ville: string | null) => {
      ordre.push("google");
      return simule.rechercherLieux(texte, ville);
    }),
  };
  const fabrique = vi.fn((...args: [unknown]) => {
    void args;
    ordre.push("client");
    return client;
  });
  const limiteur = vi.fn<NonNullable<DependancesLieuxApi["limiteur"]>>(async () => {
    ordre.push("limiteur");
    return { ok: true };
  });
  const reserver = vi.fn<NonNullable<DependancesLieuxApi["reserver"]>>(async () => {
    ordre.push("reserver");
    return { ok: true, compte: 1 };
  });
  const purger = vi.fn(async () => {
    ordre.push("purger");
  });
  return { client, fabrique, limiteur, reserver, purger, ordre };
}

type Doubles = ReturnType<typeof doubles>;

function dependances(d: Doubles, base: Base = {}, options: Partial<DependancesLieuxApi> = {}) {
  const w = doubleWithOrg(base);
  const dep: DependancesLieuxApi = {
    contexte: async () => CTX,
    withOrg: w.withOrg,
    headers: new Headers(),
    seuilsValides: () => true,
    barriere: async () => "reelle",
    client: d.fabrique as unknown as NonNullable<DependancesLieuxApi["client"]>,
    limiteur: d.limiteur,
    reserver: d.reserver,
    purger: d.purger,
    ...options,
  };
  return { dep, ...w };
}

const entree = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, day: 2, query: SAISIE, ...extra });

/** Lignes du journal écrites pendant `corps` (toutes, brutes et lues). */
async function journal(corps: () => Promise<unknown>): Promise<{ lignes: Record<string, unknown>[]; brut: string }> {
  const brutes: string[] = [];
  const sortie = vi.spyOn(console, "log").mockImplementation((...a: unknown[]) => void brutes.push(a.map(String).join(" ")));
  const erreurs = vi.spyOn(console, "error").mockImplementation((...a: unknown[]) => void brutes.push(a.map(String).join(" ")));
  try {
    await corps();
    return { lignes: brutes.map((l) => JSON.parse(l) as Record<string, unknown>), brut: brutes.join("\n") };
  } finally {
    sortie.mockRestore();
    erreurs.mockRestore();
  }
}

/** Aucune valeur sensible dans le journal (0147 § 12 S1 point 5). */
function sansValeurSensible(brut: string): void {
  for (const interdit of [SAISIE, VILLE, SENTINELLE_NOM_LIEU, SENTINELLE_ADRESSE_LIEU, "ChIJ-M5D", TRIP, CTX.organizationId, CTX.userId]) {
    expect(brut, interdit).not.toContain(interdit);
  }
}

describe("lieux api: configuration (0147 § 6.4)", () => {
  it("seuils : 150 recherches par jour, garde non validée ; limiteur lieu-recherche : 5 par minute par adresse IP, puis 20 par voyage et par 24 heures", () => {
    expect(SEUILS_LIEUX).toEqual({ recherches: 150 });
    expect(SEUILS_LIEUX_VALIDES).toBe(false);
    expect(RATE_LIMITS["lieu-recherche"]).toEqual([
      { kind: "ip", windowSeconds: 60, threshold: 5 },
      { kind: "trip", windowSeconds: 86_400, threshold: 20 },
    ]);
  });

  it("motifs fermés : chaque motif a un niveau, et un seul", () => {
    const tous = [...NIVEAUX_LIEU_API.info, ...NIVEAUX_LIEU_API.warn];
    expect([...tous].sort()).toEqual([...LOG_LIEU_REASONS].sort());
    expect(new Set(tous).size).toBe(tous.length);
  });
});

describe("lieux api: ordre d'une action (0147 § 3 point 6)", () => {
  it("par défaut (garde non validée) : provider_error, aucune barrière lue, aucun client, aucun limiteur, aucun compteur, une ligne seuils_non_valides", async () => {
    const d = doubles();
    const barriere = vi.fn(async () => "reelle" as const);
    const { dep } = dependances(d, {}, { seuilsValides: undefined, barriere });
    const { lignes, brut } = await journal(async () => {
      expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: false, error: { code: "provider_error" } });
    });
    expect(barriere).not.toHaveBeenCalled();
    expect(d.ordre).toEqual([]);
    expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "seuils_non_valides" }]);
    sansValeurSensible(brut);
  });

  it("barrière fermée (production, simulée, en erreur) ou crochet accesReelApi par défaut : provider_error, aucun client ni compteur", async () => {
    const fermees: (() => Promise<EtatBarriere>)[] = [
      async () => "production",
      async () => "simulee",
      async () => {
        throw new Error("SENTINELLE");
      },
      () => barriereLieuxApi({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true }),
    ];
    for (const barriere of fermees) {
      const d = doubles();
      const { dep } = dependances(d, {}, { barriere });
      const { lignes } = await journal(async () => {
        expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: false, error: { code: "provider_error" } });
      });
      expect(d.ordre).toEqual([]);
      expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "barriere" }]);
    }
    // Seul le crochet manque : avec un crochet vrai, la même barrière serait réelle.
    expect(await evaluerBarriere({ env: ENV_REUNI, branche: BRANCHE, plafondsNonNuls: true, cookieValide: async () => true })).toBe("reelle");
    expect(["production", "simulee"]).toContain(await barriereLieuxApi());
  });

  it("ouverte (injectée) : client, limiteur, réservation lieux, un appel, purge ; résultats rendus, ville maison du jour passée, journal ok sans valeur", async () => {
    const d = doubles();
    const { dep, textes, parametres } = dependances(d, { ville: VILLE });
    const { lignes, brut } = await journal(async () => {
      const resultat = await rechercherLieuxApiTerminal(entree(), dep);
      expect(resultat.ok).toBe(true);
      if (!resultat.ok) return;
      expect(PlaceSearchResultsSchema.parse(resultat.value)).toEqual([
        { resultId: "ChIJ-M5D-1", name: `${SENTINELLE_NOM_LIEU} 1`, address: `${SENTINELLE_ADRESSE_LIEU} 1` },
        { resultId: "ChIJ-M5D-2", name: `${SENTINELLE_NOM_LIEU} 2`, address: `${SENTINELLE_ADRESSE_LIEU} 2` },
        { resultId: "ChIJ-M5D-3", name: `${SENTINELLE_NOM_LIEU} 3` },
      ]);
    });
    expect(d.ordre).toEqual(["client", "limiteur", "reserver", "google", "purger"]);
    expect(d.client.rechercherLieux).toHaveBeenCalledTimes(1);
    expect(d.client.rechercherLieux).toHaveBeenCalledWith(SAISIE, VILLE);
    expect(d.limiteur).toHaveBeenCalledWith({ action: "lieu-recherche", headers: dep.headers, tripId: TRIP });
    expect(d.reserver).toHaveBeenCalledWith("lieux");
    // Lecture seule : voyage, droit, ville du jour (organisation, voyage, jour liés).
    expect(textes).toEqual([SQL_VOYAGE, "SET TRANSACTION READ ONLY", SQL_DROIT_VOYAGE, VILLE_DU_JOUR]);
    expect(parametres[3]).toEqual([CTX.organizationId, TRIP, 2, 2, 2]);
    // Port borné à un appel ; aucun plafond de forfait.
    const options = d.fabrique.mock.calls[0]?.[0] as { usage: { reserve: () => Promise<{ ok: boolean }> }; plafonds: unknown[] };
    expect(options.plafonds).toEqual([]);
    expect((await options.usage.reserve()).ok).toBe(true);
    expect((await options.usage.reserve()).ok).toBe(false);
    expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "ok", places: 3 }]);
    sansValeurSensible(brut);
  });

  it("sans ville du jour (ou ville illisible) : texte saisi seul", async () => {
    for (const ville of [undefined, null, "", "  ", "a\u0007b", "x".repeat(121), 42]) {
      const d = doubles();
      const { dep } = dependances(d, { ville });
      await journal(() => rechercherLieuxApiTerminal(entree(), dep));
      expect(d.client.rechercherLieux, JSON.stringify(ville)).toHaveBeenCalledWith(SAISIE, null);
    }
  });

  it("aucun résultat : liste vide, journal aucun_resultat places 0", async () => {
    const d = doubles(0);
    const { dep } = dependances(d);
    const { lignes } = await journal(async () => {
      expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: true, value: [] });
    });
    expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "aucun_resultat", places: 0 }]);
  });

  it("refus du cadre (session, entrée, voyage) : rien d'appelé, aucune ligne lieu.recherche", async () => {
    const cas: [Partial<DependancesLieuxApi>, Base, unknown, string][] = [
      [{ contexte: async () => null }, {}, entree(), "unauthenticated"],
      [{}, {}, entree({ query: "a" }), "validation_failed"],
      [{}, {}, entree({ query: "x".repeat(81) }), "validation_failed"],
      [{}, {}, entree({ organizationId: CTX.organizationId }), "validation_failed"],
      [{}, {}, entree({ name: "Mon lieu" }), "validation_failed"],
      [{}, {}, entree({ day: 0 }), "validation_failed"],
      [{}, { voyage: false }, entree(), "not_found"],
    ];
    for (const [options, base, valeur, code] of cas) {
      const d = doubles();
      const { dep } = dependances(d, base, options);
      const { lignes } = await journal(async () => {
        const resultat = await rechercherLieuxApiTerminal(valeur, dep);
        expect(resultat.ok ? null : resultat.error.code, JSON.stringify(valeur)).toBe(code);
      });
      expect(d.ordre).toEqual([]);
      expect(lignes.filter((l) => l.event === "lieu.recherche")).toEqual([]);
    }
  });

  it("caractère de contrôle dans le texte : validation_failed (query), entree_invalide, rien d'appelé", async () => {
    const d = doubles();
    const { dep } = dependances(d);
    const { lignes } = await journal(async () => {
      expect(await rechercherLieuxApiTerminal(entree({ query: "Café\u0000 bleu" }), dep)).toEqual({ ok: false, error: { code: "validation_failed", field: "query" } });
    });
    expect(d.ordre).toEqual([]);
    expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "entree_invalide" }]);
  });

  it("voyage non débloqué : not_unlocked (retryable faux) avant la garde, la barrière, le client et le limiteur", async () => {
    const d = doubles();
    const seuils = vi.fn(() => true);
    const { dep, textes } = dependances(d, { debloque: false, ville: VILLE }, { seuilsValides: seuils });
    const { lignes } = await journal(async () => {
      const resultat = await rechercherLieuxApiTerminal(entree(), dep);
      expect(resultat).toEqual({ ok: false, error: { code: "not_unlocked", retryable: false } });
      expect(ApiErrorSchema.safeParse(resultat.ok ? null : resultat.error).success).toBe(true);
    });
    expect(seuils).not.toHaveBeenCalled();
    expect(d.ordre).toEqual([]);
    // La ville n'est pas lue pour un voyage non débloqué.
    expect(textes).not.toContain(VILLE_DU_JOUR);
    expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: "non_debloque" }]);
  });

  it("fabrique en erreur : provider_error, motif client (warn), aucun limiteur ni compteur", async () => {
    const d = doubles();
    d.fabrique.mockImplementationOnce(() => {
      throw new TypeError(`clé absente ${SAISIE}`);
    });
    const { dep } = dependances(d);
    const { lignes, brut } = await journal(async () => {
      expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: false, error: { code: "provider_error" } });
    });
    expect(d.limiteur).not.toHaveBeenCalled();
    expect(d.reserver).not.toHaveBeenCalled();
    expect(lignes).toEqual([{ level: "warn", event: "lieu.recherche", reason: "client", errorName: "TypeError" }]);
    sansValeurSensible(brut);
  });

  it("limiteur : refus ip → rate_limited (retryable), motif limite ; refus trip → limite_voyage ; aucun compteur, aucun appel", async () => {
    for (const [verdict, motif] of [
      [{ ok: false }, "limite"],
      [{ ok: false, kind: "ip" }, "limite"],
      [{ ok: false, kind: "trip" }, "limite_voyage"],
    ] as const) {
      const d = doubles();
      d.limiteur.mockResolvedValueOnce(verdict);
      const { dep } = dependances(d);
      const { lignes } = await journal(async () => {
        expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
      });
      expect(d.reserver).not.toHaveBeenCalled();
      expect(d.client.rechercherLieux).not.toHaveBeenCalled();
      expect(d.purger).not.toHaveBeenCalled();
      expect(lignes).toEqual([{ level: "info", event: "lieu.recherche", reason: motif }]);
    }
  });

  it("compteur du jour : plafond → cost_cap_reached (limite_jour) ; indisponible ou en erreur → provider_error (warn) ; aucun appel", async () => {
    const cas: [NonNullable<DependancesLieuxApi["reserver"]>, string, Record<string, unknown>][] = [
      [async () => ({ ok: false, raison: "plafond" }), "cost_cap_reached", { level: "info", reason: "limite_jour" }],
      [async () => ({ ok: false, raison: "indisponible", errorName: "Error" }), "provider_error", { level: "warn", reason: "compteur_indisponible", errorName: "Error" }],
      [
        async () => {
          throw new RangeError(SAISIE);
        },
        "provider_error",
        { level: "warn", reason: "compteur_indisponible", errorName: "RangeError" },
      ],
    ];
    for (const [reserver, code, ligne] of cas) {
      const d = doubles();
      const { dep } = dependances(d, {}, { reserver });
      const { lignes, brut } = await journal(async () => {
        const resultat = await rechercherLieuxApiTerminal(entree(), dep);
        expect(resultat.ok ? null : resultat.error.code).toBe(code);
      });
      expect(d.client.rechercherLieux).not.toHaveBeenCalled();
      expect(lignes).toEqual([{ event: "lieu.recherche", ...ligne }]);
      sansValeurSensible(brut);
    }
  });

  it("erreur de Google : provider_error, purge faite, google_erreur avec code et statut fermés seulement", async () => {
    const d = doubles();
    d.client.rechercherLieux.mockRejectedValueOnce(new ErreurClientGoogle("upstream_error", 503));
    const { dep } = dependances(d);
    const { lignes, brut } = await journal(async () => {
      expect(await rechercherLieuxApiTerminal(entree(), dep)).toEqual({ ok: false, error: { code: "provider_error" } });
    });
    expect(d.purger).toHaveBeenCalledTimes(1);
    expect(lignes).toHaveLength(1);
    expect(lignes[0]).toMatchObject({ level: "warn", event: "lieu.recherche", reason: "google_erreur", googleCode: "upstream_error", httpStatus: 503 });
    sansValeurSensible(brut);
  });

  it("purge en erreur : sans effet sur la réponse", async () => {
    const d = doubles();
    d.purger.mockRejectedValueOnce(new Error("purge"));
    const { dep } = dependances(d);
    const { lignes } = await journal(async () => {
      expect((await rechercherLieuxApiTerminal(entree(), dep)).ok).toBe(true);
    });
    expect(lignes.map((l) => l.reason)).toEqual(["ok"]);
  });

  it("exception attrapée par l'action : motif exception, nom de classe seulement", async () => {
    const { lignes, brut } = await journal(async () => {
      journaliserExceptionLieux(new SyntaxError(SAISIE));
    });
    expect(lignes).toEqual([{ level: "warn", event: "lieu.recherche", reason: "exception", errorName: "SyntaxError" }]);
    sansValeurSensible(brut);
  });
});

describe("lieux api: résultats rendus (contrat PlaceSearchResult)", () => {
  it("5 au plus, doublons et résultats hors contrat écartés, adresse facultative", () => {
    const rendus = resultatsRendus([
      { placeId: "p1", nom: "Un", adresse: null },
      { placeId: "p1", nom: "Un bis", adresse: "x" },
      { placeId: "", nom: "Sans identifiant", adresse: null },
      { placeId: "p2", nom: "", adresse: null },
      ...Array.from({ length: 6 }, (_, i) => ({ placeId: `q${String(i)}`, nom: `Q${String(i)}`, adresse: `A${String(i)}` })),
    ]);
    expect(rendus.map((r) => r.resultId)).toEqual(["p1", "q0", "q1", "q2", "q3"]);
    expect(rendus[0]).toEqual({ resultId: "p1", name: "Un" });
  });
});

/** Pool simulé du limiteur : compteurs en mémoire par clé HMAC. */
function poolLimiteur() {
  const compteurs = new Map<string, number>();
  const cles: string[] = [];
  const client: RateLimitClient = {
    async query(text, values) {
      if (text.startsWith("INSERT INTO action_rate_limits")) {
        const cle = String(values?.[0]);
        cles.push(cle);
        const compte = (compteurs.get(cle) ?? 0) + 1;
        compteurs.set(cle, compte);
        return { rows: [{ count: compte }] };
      }
      if (text.includes("reltuples")) return { rows: [{ n: -1 }] };
      return { rows: [] };
    },
    release() {},
  };
  const pool: RateLimitPool = { connect: async () => client };
  return { pool, cles };
}

describe("lieux api: limiteur réel (pool simulé)", () => {
  const env = { VADROUILLE_ENV: "ci", TRUSTED_IP_HEADER: "x-vercel-forwarded-for", [HMAC]: randomBytes(32).toString("base64url") };

  it("21e recherche du même voyage depuis des adresses différentes : rate_limited, motif limite_voyage ; un autre voyage reste admis", async () => {
    const { pool } = poolLimiteur();
    const limiteur = createRateLimiter({ pool, env });
    const d = doubles();
    const codes: string[] = [];
    const { lignes } = await journal(async () => {
      for (let i = 0; i < 21; i += 1) {
        const { dep } = dependances(d, {}, { headers: new Headers({ "x-vercel-forwarded-for": `198.51.100.${String(i)}` }), limiteur: (r) => limiteur.verdict(r) });
        const resultat = await rechercherLieuxApiTerminal(entree(), dep);
        codes.push(resultat.ok ? "ok" : resultat.error.code);
      }
      const autre = "0d000000-0000-4000-8000-0000000000bb";
      const { dep } = dependances(d, {}, { headers: new Headers({ "x-vercel-forwarded-for": "198.51.100.200" }), limiteur: (r) => limiteur.verdict(r) });
      const resultat = await rechercherLieuxApiTerminal(entree({ tripId: autre }), dep);
      codes.push(resultat.ok ? "ok" : resultat.error.code);
    });
    expect(codes.slice(0, 20).every((c) => c === "ok")).toBe(true);
    expect(codes[20]).toBe("rate_limited");
    expect(codes[21]).toBe("ok");
    expect(lignes.filter((l) => l.event === "lieu.recherche").map((l) => l.reason)[20]).toBe("limite_voyage");
    expect(d.client.rechercherLieux).toHaveBeenCalledTimes(21);
  });

  it("6e recherche en une minute depuis la même adresse : rate_limited, motif limite ; le compteur du voyage n'est pas incrémenté", async () => {
    const { pool, cles } = poolLimiteur();
    const limiteur = createRateLimiter({ pool, env });
    const d = doubles();
    const motifs: unknown[] = [];
    const { lignes } = await journal(async () => {
      for (let i = 0; i < 6; i += 1) {
        const { dep } = dependances(d, {}, { headers: new Headers({ "x-vercel-forwarded-for": "198.51.100.7" }), limiteur: (r) => limiteur.verdict(r) });
        await rechercherLieuxApiTerminal(entree(), dep);
      }
    });
    for (const l of lignes) if (l.event === "lieu.recherche") motifs.push(l.reason);
    expect(motifs).toEqual(["ok", "ok", "ok", "ok", "ok", "limite"]);
    // 5 admises : clé ip puis clé trip ; la 6e : la clé ip seule.
    expect(cles).toHaveLength(11);
    expect(new Set(cles).size).toBe(2);
  });
});
