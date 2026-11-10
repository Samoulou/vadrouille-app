import { beforeEach, describe, expect, it, vi } from "vitest";

import { SQL_ACCORD } from "./envoi";
import { EtatRappelSchema, RELAY_N_MAX, type EtatRappel } from "./etat";
import { reclamerRelais, SQL_RECLAMATION_RELAIS, SQL_RELAIS_TENU, type DependancesRelais } from "./relais";

const journal = vi.hoisted(() => ({
  lignes: [] as { evenement: string; champs: Record<string, unknown>; niveau: unknown }[],
}));
vi.mock("@/server/log", async (original) => {
  const reel = await original<typeof import("@/server/log")>();
  return {
    ...reel,
    logEvent: (evenement: string, champs: Record<string, unknown>, niveau?: unknown) => void journal.lignes.push({ evenement, champs, niveau }),
  };
});

/**
 * Réclamation du relais des rappels sans base (tâche R-B, ticket 1075 ; décision 0162 § 3 point 2, § 5, § 6.2 critères 1
 * et 3) : `withOrg` simulé (accords et réclamations en mémoire, réponses selon le texte de la requête), comme
 * `envoi.test.ts`. La vraie migration (clé primaire, RLS, concurrence) est éprouvée par
 * `tests/db/rappels-relais-reclamation.test.ts`.
 */

const ETAT: EtatRappel = {
  organizationId: "0a000000-0000-4000-8000-00000000000a",
  tripId: "0b000000-0000-4000-8000-00000000000b",
  userId: "0c000000-0000-4000-8000-00000000000c",
  consentId: "0d000000-0000-4000-8000-00000000000d",
};
const RUN = "wrun_01M6ZWVHNG68KA5EAJ41PT0PCP";
const RUN_AUTRE = "wrun_41M6ZWVHNG50W7N2HSG8R3DG98";

type Accord = { organizationId: string; tripId: string; userId: string; id: string; actif: boolean };

type Base = {
  accords: Accord[];
  /** Réclamations : clé `organisation/accord/génération` → identifiant d'exécution. */
  relais: Map<string, string>;
  /** Erreur levée par l'ouverture de la transaction (`withOrg`). */
  panne?: unknown;
  /** Erreur levée par l'insertion (après la lecture de l'accord). */
  panneInsertion?: unknown;
  /** Retrait de l'accord posé par une autre transaction entre la lecture et l'insertion (RLS : `42501`). */
  retraitAvantInsertion?: boolean;
  /** Relecture de l'accord en panne, après un `42501`. */
  panneRelecture?: boolean;
};

function base(partiel: Partial<Base> = {}): Base {
  return {
    accords: [{ organizationId: ETAT.organizationId, tripId: ETAT.tripId, userId: ETAT.userId, id: ETAT.consentId, actif: true }],
    relais: new Map(),
    ...partiel,
  };
}

/** Texte et valeurs d'une requête de `executeurSql` (morceaux de drizzle), comme `envoi.test.ts`. */
function lire(requete: { queryChunks: unknown[] }): { texte: string; valeurs: unknown[] } {
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

/** Erreur de `pg` enveloppée par Drizzle (`cause`), avec un message qui porte une valeur sentinelle. */
function erreurPg(code: string): Error {
  return Object.assign(new Error("Failed query: SENTINELLE voyageuse@exemple.test"), {
    cause: Object.assign(new Error("SENTINELLE_PG"), { code }),
  });
}

function doubleWithOrg(b: Base) {
  const requetes: { texte: string; valeurs: unknown[] }[] = [];
  const contextes: unknown[] = [];
  let transactions = 0;
  const withOrg = vi.fn(async (ctx: { organizationId: string; userId: string }, fn: (tx: never) => Promise<unknown>) => {
    contextes.push(ctx);
    transactions += 1;
    if (b.panne !== undefined) throw b.panne;
    const relecture = transactions > 1;
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const { texte, valeurs } = lire(requete);
        requetes.push({ texte, valeurs });
        if (texte === SQL_ACCORD) {
          if (relecture && b.panneRelecture === true) throw new Error("SENTINELLE_RELECTURE");
          const [org, trip, user, id] = valeurs;
          // RLS de `reminder_consents` : organisation de la transaction.
          const accord = b.accords.find((a) => a.organizationId === org && a.organizationId === ctx.organizationId && a.tripId === trip && a.userId === user && a.id === id);
          return { rows: accord === undefined ? [] : [{ consenti_ms: 0, actif: accord.actif }] };
        }
        if (texte === SQL_RECLAMATION_RELAIS) {
          if (b.panneInsertion !== undefined) throw b.panneInsertion;
          const [org, consent, n, run] = valeurs;
          if (b.retraitAvantInsertion === true) for (const a of b.accords) a.actif = false;
          // Politique `reminder_relays_app_insert` : accord non retiré de la personne de la transaction (le `WITH CHECK`
          // passe avant la détection du conflit).
          const accord = b.accords.find((a) => a.organizationId === org && a.organizationId === ctx.organizationId && a.id === consent && a.userId === ctx.userId);
          if (accord === undefined || !accord.actif) throw erreurPg("42501");
          const cle = `${String(org)}/${String(consent)}/${String(n)}`;
          if (b.relais.has(cle)) return { rows: [] };
          b.relais.set(cle, String(run));
          return { rows: [{ relay_n: n }] };
        }
        if (texte === SQL_RELAIS_TENU) {
          const [org, consent, n] = valeurs;
          const run = b.relais.get(`${String(org)}/${String(consent)}/${String(n)}`);
          return { rows: run === undefined ? [] : [{ claimed_run_id: run }] };
        }
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return {
    withOrg: withOrg as unknown as NonNullable<DependancesRelais["withOrg"]>,
    requetes,
    contextes,
    transactions: () => transactions,
  };
}

const cle = (n: number, etat: EtatRappel = ETAT) => `${etat.organizationId}/${etat.consentId}/${n}`;

beforeEach(() => {
  journal.lignes = [];
});

describe("relais des rappels : réclamation (0162 § 3 point 2, § 6.2 critère 1)", () => {
  it("acquise sur insertion : une ligne, quatre colonnes en paramètres liés, dans le contexte de l'organisation et de la personne de l'état", async () => {
    const b = base();
    const d = doubleWithOrg(b);
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: d.withOrg })).toBe("acquise");
    expect(b.relais.get(cle(1))).toBe(RUN);
    expect(d.contextes).toEqual([{ organizationId: ETAT.organizationId, userId: ETAT.userId }]);
    expect(d.requetes.map((r) => r.texte)).toEqual([SQL_ACCORD, SQL_RECLAMATION_RELAIS]);
    expect(d.requetes[0]?.valeurs).toEqual([ETAT.organizationId, ETAT.tripId, ETAT.userId, ETAT.consentId]);
    expect(d.requetes[1]?.valeurs).toEqual([ETAT.organizationId, ETAT.consentId, 1, RUN]);
    expect(SQL_RECLAMATION_RELAIS).toMatch(/\(organization_id, consent_id, relay_n, claimed_run_id\)/);
    expect(SQL_RECLAMATION_RELAIS).toMatch(/ON CONFLICT DO NOTHING RETURNING relay_n$/);
    expect(SQL_RECLAMATION_RELAIS).not.toContain("claimed_at");
    expect(journal.lignes).toEqual([]);
  });

  it("acquise quand la ligne existe avec le même runId (étape rejouée après son COMMIT, § 5 cas 1)", async () => {
    const b = base({ relais: new Map([[cle(2), RUN]]) });
    const d = doubleWithOrg(b);
    expect(await reclamerRelais(ETAT, { relayN: 2, runId: RUN }, { withOrg: d.withOrg })).toBe("acquise");
    expect(d.requetes.map((r) => r.texte)).toEqual([SQL_ACCORD, SQL_RECLAMATION_RELAIS, SQL_RELAIS_TENU]);
    expect(d.requetes[2]?.valeurs).toEqual([ETAT.organizationId, ETAT.consentId, 2]);
    expect(b.relais.get(cle(2))).toBe(RUN);
    expect(journal.lignes).toEqual([]);
  });

  it("doublon quand une autre exécution tient la génération ; la ligne n'est pas modifiée ; aucun journal dans le cœur", async () => {
    const b = base({ relais: new Map([[cle(1), RUN_AUTRE]]) });
    const d = doubleWithOrg(b);
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: d.withOrg })).toBe("doublon");
    expect(b.relais.get(cle(1))).toBe(RUN_AUTRE);
    expect(journal.lignes).toEqual([]);
  });

  it("deux exécutions de la même génération : une acquise, l'autre doublon ; une autre génération passe (§ 5 cas 4)", async () => {
    const b = base();
    const d = doubleWithOrg(b);
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: d.withOrg })).toBe("acquise");
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN_AUTRE }, { withOrg: d.withOrg })).toBe("doublon");
    expect(await reclamerRelais(ETAT, { relayN: 2, runId: RUN_AUTRE }, { withOrg: d.withOrg })).toBe("acquise");
    expect([...b.relais.entries()]).toEqual([
      [cle(1), RUN],
      [cle(2), RUN_AUTRE],
    ]);
  });

  it("fin pour un accord absent, retiré, d'un autre voyage, d'une autre personne ou d'une autre organisation : rien n'est réclamé", async () => {
    const autre = "0e000000-0000-4000-8000-00000000000e";
    const cas: [string, Partial<Base>, EtatRappel][] = [
      ["absent", { accords: [] }, ETAT],
      ["retiré", { accords: [{ ...base().accords[0]!, actif: false }] }, ETAT],
      ["autre voyage", {}, { ...ETAT, tripId: autre }],
      ["autre personne", {}, { ...ETAT, userId: autre }],
      ["autre organisation", {}, { ...ETAT, organizationId: autre }],
      ["autre accord", {}, { ...ETAT, consentId: autre }],
    ];
    for (const [nom, partiel, etat] of cas) {
      const b = base(partiel);
      const d = doubleWithOrg(b);
      expect(await reclamerRelais(etat, { relayN: 1, runId: RUN }, { withOrg: d.withOrg }), nom).toBe("fin");
      expect(d.requetes.map((r) => r.texte), nom).toEqual([SQL_ACCORD]);
      expect(b.relais.size, nom).toBe(0);
    }
    expect(journal.lignes).toEqual([]);
  });

  it("refus de la RLS (42501) : accord retiré entre la lecture et l'insertion → fin légitime, sans journal (revue de la PR 1067, mineur 2)", async () => {
    const b = base({ retraitAvantInsertion: true });
    const d = doubleWithOrg(b);
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: d.withOrg })).toBe("fin");
    // Relecture de l'accord dans une nouvelle transaction, même contexte.
    expect(d.transactions()).toBe(2);
    expect(d.contextes).toEqual([
      { organizationId: ETAT.organizationId, userId: ETAT.userId },
      { organizationId: ETAT.organizationId, userId: ETAT.userId },
    ]);
    expect(d.requetes.map((r) => r.texte)).toEqual([SQL_ACCORD, SQL_RECLAMATION_RELAIS, SQL_ACCORD]);
    expect(b.relais.size).toBe(0);
    expect(journal.lignes).toEqual([]);
  });

  it("42501 alors que l'accord est toujours actif (droit retiré, descente de 0027) ou relecture en panne → panne, rappels.relay_failed", async () => {
    const actif = doubleWithOrg(base({ panneInsertion: erreurPg("42501") }));
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: actif.withOrg })).toBe("panne");
    expect(actif.transactions()).toBe(2);
    const relecture = doubleWithOrg(base({ retraitAvantInsertion: true, panneRelecture: true }));
    expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: relecture.withOrg })).toBe("panne");
    expect(journal.lignes).toEqual([
      { evenement: "rappels.relay_failed", champs: {}, niveau: "warn" },
      { evenement: "rappels.relay_failed", champs: {}, niveau: "warn" },
    ]);
    expect(JSON.stringify(journal.lignes)).not.toMatch(/SENTINELLE|exemple\.test/);
  });

  it("panne sur erreur de base (transaction, CHECK de claimed_run_id, erreur sans code) : rappels.relay_failed, nom seul, sans le message", async () => {
    for (const partiel of [
      { panne: new Error("SENTINELLE voyageuse@exemple.test") },
      { panneInsertion: erreurPg("23514") },
      { panneInsertion: new Error("SENTINELLE") },
      { panne: erreurPg("08006") },
    ] satisfies Partial<Base>[]) {
      const d = doubleWithOrg(base(partiel));
      expect(await reclamerRelais(ETAT, { relayN: 1, runId: RUN }, { withOrg: d.withOrg })).toBe("panne");
      // Aucune relecture hors du refus de la RLS.
      expect(d.transactions()).toBe(1);
    }
    expect(journal.lignes).toHaveLength(4);
    for (const ligne of journal.lignes) expect(ligne).toEqual({ evenement: "rappels.relay_failed", champs: {}, niveau: "warn" });
    expect(JSON.stringify(journal.lignes)).not.toMatch(/SENTINELLE|exemple\.test|wrun_|0d000000/);
  });

  it("entrée invalide (état hors contrat, relayN hors de 1 à 32 767, runId non textuel) → fin sans lecture", async () => {
    const d = doubleWithOrg(base());
    const invalides: [unknown, { relayN: number; runId: string }][] = [
      [{ ...ETAT, email: "voyageuse@exemple.test" }, { relayN: 1, runId: RUN }],
      [{ ...ETAT, consentId: "pas-un-uuid" }, { relayN: 1, runId: RUN }],
      [null, { relayN: 1, runId: RUN }],
      [{ ...ETAT, relayN: 0 }, { relayN: 1, runId: RUN }],
      [ETAT, { relayN: 0, runId: RUN }],
      [ETAT, { relayN: -1, runId: RUN }],
      [ETAT, { relayN: 1.5, runId: RUN }],
      [ETAT, { relayN: RELAY_N_MAX + 1, runId: RUN }],
      [ETAT, { relayN: Number.NaN, runId: RUN }],
      [ETAT, { relayN: 1, runId: 42 as unknown as string }],
    ];
    for (const [entree, reclamation] of invalides) expect(await reclamerRelais(entree, reclamation, { withOrg: d.withOrg })).toBe("fin");
    expect(d.withOrg).not.toHaveBeenCalled();
    expect(journal.lignes).toEqual([]);
  });

  it("état d'une génération n (relayN présent) : accepté ; la réclamation porte sur la génération passée par l'appelant", async () => {
    const b = base();
    const d = doubleWithOrg(b);
    expect(await reclamerRelais({ ...ETAT, relayN: 7 }, { relayN: 8, runId: RUN }, { withOrg: d.withOrg })).toBe("acquise");
    expect(d.requetes[0]?.valeurs).toEqual([ETAT.organizationId, ETAT.tripId, ETAT.userId, ETAT.consentId]);
    expect(b.relais.get(cle(8))).toBe(RUN);
    expect(await reclamerRelais(ETAT, { relayN: RELAY_N_MAX, runId: RUN }, { withOrg: d.withOrg })).toBe("acquise");
  });
});

describe("relais des rappels : état sérialisé (0162 § 3 point 1, § 6.2 critère 3)", () => {
  it("compatibilité : l'état à quatre clés (setTripReminders, code d'avant R-B) reste accepté, relayN absent = génération 0", () => {
    const lu = EtatRappelSchema.safeParse(ETAT);
    expect(lu.success).toBe(true);
    expect(lu.data).toEqual(ETAT);
    expect(lu.data && "relayN" in lu.data).toBe(false);
  });

  it("relayN entier de 1 à 32 767 accepté ; 0, négatif, décimal, au-delà, non numérique ou une clé de plus refusés", () => {
    for (const n of [1, 2, 500, RELAY_N_MAX]) expect(EtatRappelSchema.safeParse({ ...ETAT, relayN: n }).success, String(n)).toBe(true);
    for (const n of [0, -1, 1.5, RELAY_N_MAX + 1, Number.NaN, Number.POSITIVE_INFINITY, "1", null])
      expect(EtatRappelSchema.safeParse({ ...ETAT, relayN: n }).success, String(n)).toBe(false);
    expect(EtatRappelSchema.safeParse({ ...ETAT, relayN: 1, generation: 1 }).success).toBe(false);
    expect(RELAY_N_MAX).toBe(32_767);
  });

  it("workflows: aucune donnée Google dans l'état sérialisé (workflow 7) : relayN est un compteur seul, l'objet reste strict", () => {
    const interdites = [
      "rating",
      "userRatingCount",
      "openingHours",
      "regularOpeningHours",
      "currentOpeningHours",
      "businessStatus",
      "priceLevel",
      "photos",
      "phone",
      "nationalPhoneNumber",
      "internationalPhoneNumber",
      "address",
      "formattedAddress",
      "displayName",
      "reviews",
      "lat",
      "lng",
      "latitude",
      "longitude",
      "location",
      "viewport",
      "duration",
      "staticDuration",
      "distanceMeters",
      "polyline",
      "placeId",
      "email",
    ];
    const avecCompteur = { ...ETAT, relayN: 3 };
    for (const cleInterdite of interdites) {
      expect(EtatRappelSchema.safeParse({ ...avecCompteur, [cleInterdite]: "SENTINELLE_ChIJ_sentinelle" }).success, cleInterdite).toBe(false);
    }
    // `relayN` ne porte qu'un nombre : ni texte, ni objet (un identifiant de lieu n'y entre pas).
    for (const valeur of ["ChIJ_sentinelle", { placeId: "ChIJ_sentinelle" }, [3]]) expect(EtatRappelSchema.safeParse({ ...ETAT, relayN: valeur }).success).toBe(false);
    const lu = EtatRappelSchema.parse(avecCompteur);
    expect(Object.keys(lu).sort()).toEqual(["consentId", "organizationId", "relayN", "tripId", "userId"]);
  });
});
