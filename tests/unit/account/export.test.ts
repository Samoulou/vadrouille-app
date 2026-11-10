// @vitest-environment node
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it, vi } from "vitest";

import { creationDeSessionBranchee, sessionBranchee } from "@/adapters";
import { brancherConnexionReelle, ConnexionIndisponibleError, debrancherConnexionReellePourTests } from "@/adapters/better-auth";
import { PRODUCT_NAME } from "@/config/site";
import { ACCOUNT_EXPORT_FORBIDDEN_KEYS, AccountExportSchema, accountExportKeys } from "@/contracts/account-export";
import { TripSnapshotSchema } from "@/contracts/snapshot";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { RATE_LIMITS } from "@/server/config/limites";
import {
  creerExportCompte,
  dateDeZurich,
  type ExecuteurExport,
  joursEnListeBlanche,
  nomFichierExport,
  REQUETES_EXPORT,
  serialiserExport,
  type TransactionExport,
} from "@/server/account/export";
import { connexionRecente, creerControleConnexionRecente, FENETRE_CONNEXION_RECENTE_MS } from "@/server/account/reauthentification";
import { createRateLimiter, type RateLimitClient, type RateLimitPool, rateLimitKey, rateLimitMessage } from "@/server/rate-limit";

/**
 * « Exporter mes données », sans base (spécification M9 § 6.2, tests unitaires : contrat, nom du fichier et fuseau,
 * parcours des clés ; ticket 1097, M9a). La construction est éprouvée sur un exécuteur simulé qui rend des lignes de la
 * forme de la base pour chaque requête de `REQUETES_EXPORT` ; les tests de base réels sont `tests/db/export-compte.test.ts`.
 */

const ORG = "0d000000-0000-4000-8000-0000000000a1";
const MOI = "0d000000-0000-4000-8000-0000000000b1";
const VOYAGE = "0d000000-0000-4000-8000-0000000000c1";
const CTX = { organizationId: ORG, userId: MOI };
const T = "2026-11-09T10:00:00.000Z";

/** Instantané stocké d'une version, avec des clés hors liste blanche (durée Google ancienne, note, positions). */
const INSTANTANE = {
  days: [
    {
      index: 1,
      date: "2026-08-29",
      theme: "Vieille ville",
      travelMinutes: 4321,
      travelBudgetMinutes: 240,
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "Hôtel Balmoral" },
        {
          type: "stop",
          stop: {
            id: "s1",
            kind: "activity",
            placeId: "ChIJ-chateau",
            name: "Château d'Édimbourg",
            start: "09:30",
            end: "11:00",
            facts: { area: "Old Town", tip: "Réserve le créneau de 9 h", rating: 4.7 },
            source: { label: "Site officiel", url: "https://www.edinburghcastle.scot", displayName: "SENTINELLE-NOM-GOOGLE-M9A" },
            exceptions: [],
            locked: false,
            displayName: "SENTINELLE-NOM-GOOGLE-M9A",
            formattedAddress: "SENTINELLE-ADRESSE-M9A",
            location: { lat: 12.345, lng: 65.432 },
          },
        },
        { type: "segment", segment: { mode: "walk", minutes: 4321, estimated: false } },
        { type: "terminus", role: "end", time: "18:00", label: "Hôtel Balmoral" },
      ],
      events: [],
    },
  ],
};

function lignes(texte: string): Record<string, unknown>[] {
  const R = REQUETES_EXPORT;
  switch (texte) {
    case R.adhesions:
      return [{ user_id: MOI, role: "owner" }];
    case R.organisation:
      return [{ kind: "personal" }];
    case R.compte:
      return [{ email: "samuel@exemple.test", created_at: "2026-08-01T08:00:00.000Z" }];
    case R.voyages:
      return [
        {
          id: VOYAGE,
          destination: "Édimbourg",
          start_date: "2026-08-29",
          end_date: "2026-09-03",
          time_zone: "Europe/London",
          adults: 2,
          children: 0,
          status: "active",
          created_at: "2026-08-02T08:00:00.000Z",
          current_version: 3,
          unlocked: true,
        },
      ];
    case R.briefs:
      return [
        {
          trip_id: VOYAGE,
          version: 1,
          story: "Un long week-end",
          pace: "balanced",
          mobility_modes: ["walk"],
          wishes: ["museum"],
          limit_categories: null,
          limits: null,
          meal_budget: null,
          inferred_fields: [],
          created_at: T,
        },
      ];
    case R.sejours:
      return [
        {
          trip_id: VOYAGE,
          kind: "lodging",
          lodging_kind: "known",
          label: "Hôtel Balmoral",
          city: null,
          from_date: "2026-08-29",
          to_date: "2026-09-03",
          arrival_time: null,
          departure_time: null,
          luggage: null,
          place_id: "ChIJ-balmoral",
        },
      ];
    case R.engagements:
      return [{ trip_id: VOYAGE, kind: "flight", label: "Vol LX 460", date: "2026-08-29", start_time: "07:10", end_time: "08:05" }];
    case R.versions:
      return [1, 2, 3].map((version) => ({
        trip_id: VOYAGE,
        version,
        parent_version: version === 1 ? null : version - 1,
        author_kind: "engine",
        created_at: T,
        snapshot: INSTANTANE,
      }));
    case R.propositions:
      return [{ trip_id: VOYAGE, phase: "preview", position: 1, day: 1, time: "10:00", kind: "activity", name: "Musée", category: "museum", place_id: null }];
    case R.gestes:
      return [{ trip_id: VOYAGE, signal: "like", category: "museum", place_id: "ChIJ-musee", status: "confirmed", created_at: T, cancelled_at: null }];
    case R.clotures:
      return [{ trip_id: VOYAGE, phase: "preview", through_position: 8, created_at: T }];
    case R.aFaire:
      return [{ trip_id: VOYAGE, label: "Réserver le château", moment: { type: "beforeDeparture" }, done: false, booking_url: "https://exemple.test/r" }];
    case R.signalements:
      return [{ trip_id: VOYAGE, target_stop_id: "s1", place_id: "ChIJ-chateau", reason: "closed", created_at: T }];
    case R.avis:
      return [
        { trip_id: VOYAGE, stop_id: "s1", place_id: "ChIJ-chateau", opinion: "liked", updated_at: T },
        { trip_id: VOYAGE, stop_id: "s2", place_id: null, opinion: "notDone", updated_at: T },
      ];
    case R.accords:
      return [{ trip_id: VOYAGE, consented_at: T, withdrawn_at: "2026-11-09T11:00:00.000Z" }];
    case R.envois:
      return [{ trip_id: VOYAGE, day_index: 1, claimed_at: T }];
    case R.liens:
      return [{ trip_id: VOYAGE, created_at: T, expires_at: "2026-12-09T10:00:00.000Z", revoked_at: null }];
    case R.paiements:
      return [{ trip_id: VOYAGE, method: "twint", amount_cents: 2900, currency: "CHF", status: "succeeded", created_at: T }];
    case R.droits:
      return [{ trip_id: VOYAGE, kind: "tripUnlocked", granted_at: T }];
    case R.gouts:
      return [{ subject_kind: "category", category: "museum", direction: "more", origin: "confirmed", source_trip_id: VOYAGE, consented_at: T }];
    default:
      throw new Error("requête inattendue");
  }
}

/** Transaction simulée : note chaque requête et ses valeurs, rend les lignes ci-dessus (ou `surcharge`). */
function banc(surcharge: (texte: string) => Record<string, unknown>[] | undefined = () => undefined) {
  const requetes: { texte: string; valeurs: readonly unknown[] }[] = [];
  const executeur: ExecuteurExport = {
    async query(texte, valeurs = []) {
      requetes.push({ texte, valeurs });
      return { rows: surcharge(texte) ?? lignes(texte) };
    },
  };
  const transaction: TransactionExport = (_ctx, fn) => fn(executeur);
  return { cas: creerExportCompte(transaction), requetes };
}

describe("compte: contrat de l'export (critère 3)", () => {
  it("le fichier construit valide AccountExportSchema strict : en-tête, blocs du § 3.2, trois versions, deux avis, un accord retiré", async () => {
    const { cas } = banc();
    const resultat = await cas.construire(CTX, new Date(T));
    if (!resultat.ok) throw new Error("export refusé");
    const fichier = resultat.value;
    expect(AccountExportSchema.parse(fichier)).toEqual(fichier);
    expect(fichier.format).toBe("vadrouille-export");
    expect(fichier.version).toBe(1);
    expect(fichier.exportedAt).toBe(T);
    expect(fichier.notice).toBe(format(messages.compte.export.notice, { produit: PRODUCT_NAME }));
    expect(fichier.notice).not.toContain("{produit}");
    expect(Object.keys(fichier)).toEqual(["format", "version", "exportedAt", "notice", "account", "trips", "tastes"]);
    expect(fichier.account).toEqual({ email: "samuel@exemple.test", createdAt: "2026-08-01T08:00:00.000Z" });
    const [voyage] = fichier.trips;
    expect(voyage?.versions.map((v) => v.version)).toEqual([1, 2, 3]);
    expect(voyage?.reviews).toHaveLength(2);
    expect(voyage?.reminders.consents).toEqual([{ consentedAt: T, withdrawnAt: "2026-11-09T11:00:00.000Z" }]);
    expect(voyage?.payments).toEqual([{ method: "twint", amountCents: 2900, currency: "CHF", status: "succeeded", createdAt: T }]);
    expect(voyage?.unlocked).toBe(true);
    expect(voyage?.currentVersion).toBe(3);
    expect(fichier.tastes).toHaveLength(1);
    expect(Object.keys(voyage ?? {})).toEqual([
      "id",
      "destination",
      "startDate",
      "endDate",
      "timeZone",
      "travellers",
      "status",
      "createdAt",
      "unlocked",
      "currentVersion",
      "briefs",
      "stays",
      "commitments",
      "versions",
      "deck",
      "checklist",
      "reports",
      "reviews",
      "reminders",
      "shareLinks",
      "payments",
      "entitlements",
    ]);
  });

  it("strict : une clé en trop, à n'importe quel niveau, est refusée", async () => {
    const resultat = await banc().cas.construire(CTX, new Date(T));
    if (!resultat.ok) throw new Error("export refusé");
    const fichier = resultat.value;
    expect(AccountExportSchema.safeParse({ ...fichier, organizationId: ORG }).success).toBe(false);
    expect(AccountExportSchema.safeParse({ ...fichier, account: { ...fichier.account, emailVerified: true } }).success).toBe(false);
    const voyage = fichier.trips[0];
    if (voyage === undefined) throw new Error("voyage absent");
    for (const ajout of [
      { requestId: "x" },
      { shareLinks: [{ ...voyage.shareLinks[0], tokenHash: "x" }] },
      { payments: [{ ...voyage.payments[0], stripeCheckoutSessionId: "cs_test" }] },
      { payments: [{ ...voyage.payments[0], stripeReceiptUrl: "x" }] },
      { versions: [{ ...voyage.versions[0], patch: [] }] },
    ]) {
      expect(AccountExportSchema.safeParse({ ...fichier, trips: [{ ...voyage, ...ajout }] }).success, Object.keys(ajout)[0]).toBe(false);
    }
  });

  it("instantané : liste blanche des clés du schéma de stockage, sans durée de trajet, note, nom ni adresse Google", () => {
    const jours = joursEnListeBlanche(INSTANTANE);
    expect(TripSnapshotSchema.safeParse(INSTANTANE).success).toBe(false);
    expect(TripSnapshotSchema.parse({ days: jours })).toEqual({ days: jours });
    const texte = JSON.stringify(jours);
    for (const interdit of ["SENTINELLE-NOM-GOOGLE-M9A", "SENTINELLE-ADRESSE-M9A", "12.345", "65.432", "rating", "minutes", "travelMinutes"]) {
      expect(texte, interdit).not.toContain(interdit);
    }
    // Ce qui reste : nom maison, heure, placeId, source web, infos pratiques.
    expect(texte).toContain("Château d'Édimbourg");
    expect(texte).toContain("ChIJ-chateau");
    expect(texte).toContain("https://www.edinburghcastle.scot");
    expect(texte).toContain("Réserve le créneau de 9 h");
    // Type de ligne inconnu : recopié, puis refusé par la validation stricte.
    expect(TripSnapshotSchema.safeParse({ days: joursEnListeBlanche({ days: [{ ...INSTANTANE.days[0], items: [{ type: "photo", url: "x" }] }] }) }).success).toBe(false);
  });
});

describe("compte: parcours des clés (critère 6)", () => {
  it("aucune clé exclue du § 3.2 à aucun niveau ; le parcours voit les clés imbriquées", async () => {
    const resultat = await banc().cas.construire(CTX, new Date(T));
    if (!resultat.ok) throw new Error("export refusé");
    const vues = new Set(accountExportKeys(JSON.parse(serialiserExport(resultat.value))));
    for (const interdite of ACCOUNT_EXPORT_FORBIDDEN_KEYS) expect(vues.has(interdite), interdite).toBe(false);
    expect(vues.has("facts")).toBe(true);
    expect(vues.has("area")).toBe(true);
    expect(accountExportKeys({ a: [{ b: { c: 1 } }, { d: null }] })).toEqual(["a", "b", "c", "d"]);
    expect(accountExportKeys([1, "x", null])).toEqual([]);
  });
});

describe("compte: accès et lectures de l'export (critère 1, § 3.4)", () => {
  it("organisation à deux membres, conseiller, organisation non personnelle : forbidden, seule la vérification d'accès est lue", async () => {
    const cas = [
      (t: string) => (t === REQUETES_EXPORT.adhesions ? [{ user_id: MOI, role: "owner" }, { user_id: "0d000000-0000-4000-8000-0000000000b2", role: "member" }] : undefined),
      (t: string) => (t === REQUETES_EXPORT.adhesions ? [{ user_id: MOI, role: "member" }] : undefined),
      (t: string) => (t === REQUETES_EXPORT.organisation ? [{ kind: "agency" }] : undefined),
    ];
    for (const surcharge of cas) {
      const { cas: exportCas, requetes } = banc(surcharge);
      expect(await exportCas.construire(CTX, new Date(T))).toEqual({ ok: false, code: "forbidden" });
      expect(requetes.every((r) => r.texte === REQUETES_EXPORT.adhesions || r.texte === REQUETES_EXPORT.organisation)).toBe(true);
      expect(await exportCas.organisationAdmise(CTX)).toBe(false);
    }
  });

  it("tables par personne filtrées par la personne de la session ; toute requête filtrée par l'organisation", async () => {
    const { cas, requetes } = banc();
    await cas.construire(CTX, new Date(T));
    const parPersonne = [REQUETES_EXPORT.signalements, REQUETES_EXPORT.avis, REQUETES_EXPORT.accords, REQUETES_EXPORT.envois, REQUETES_EXPORT.gouts];
    for (const texte of parPersonne) {
      expect(texte).toMatch(/organization_id = \$1 AND (created_by|user_id) = \$2/);
      expect(requetes.find((r) => r.texte === texte)?.valeurs).toEqual([ORG, MOI]);
    }
    for (const r of requetes.filter((q) => q.texte !== REQUETES_EXPORT.compte)) expect(r.valeurs[0]).toBe(ORG);
    expect(requetes.find((r) => r.texte === REQUETES_EXPORT.compte)?.valeurs).toEqual([MOI]);
    // Aucune table hors liste : ni sessions, ni place_coordinates, ni billing, ni usage_ledger, ni candidates.
    const tout = requetes.map((r) => r.texte).join("\n");
    for (const table of ["sessions", "accounts", "verifications", "place_coordinates", "billing", "usage_ledger", "candidates", "research_runs", "generation_runs", "reminder_relays", "token_hash", "stripe_"]) {
      expect(tout, table).not.toContain(table);
    }
    expect(new Set(requetes.map((r) => r.texte))).toEqual(new Set(Object.values(REQUETES_EXPORT)));
  });

  it("aucun appel réseau pendant la construction (critère 5, part unitaire) ; deux exports identiques hormis exportedAt (critère 8)", async () => {
    const reseau = vi.spyOn(globalThis, "fetch").mockImplementation(async () => Promise.reject(new Error("réseau interdit")));
    try {
      const { cas } = banc();
      const a = await cas.construire(CTX, new Date(T));
      const b = await cas.construire(CTX, new Date("2026-11-09T10:05:00.000Z"));
      if (!a.ok || !b.ok) throw new Error("export refusé");
      expect({ ...a.value, exportedAt: "" }).toEqual({ ...b.value, exportedAt: "" });
      expect(reseau).not.toHaveBeenCalled();
    } finally {
      reseau.mockRestore();
    }
  });

  it("ligne illisible de la base : lève (la route répond 500), jamais un fichier partiel", async () => {
    const { cas } = banc((t) => (t === REQUETES_EXPORT.voyages ? [{ ...lignes(t)[0], adults: "deux" }] : undefined));
    await expect(cas.construire(CTX, new Date(T))).rejects.toThrow();
    const { cas: sansCompte } = banc((t) => (t === REQUETES_EXPORT.compte ? [] : undefined));
    await expect(sansCompte.construire(CTX, new Date(T))).rejects.toThrow();
  });
});

describe("compte: nom du fichier et fuseau (critère 7, part unitaire)", () => {
  it("date de Zurich : 2026-11-09 à 23:30 heure de Zurich → 09 ; 00:30 le 10 → 10", () => {
    // Novembre : heure normale d'Europe centrale, UTC+1.
    expect(nomFichierExport(new Date("2026-11-09T22:30:00Z"))).toBe("vadrouille-mes-donnees-2026-11-09.json");
    expect(nomFichierExport(new Date("2026-11-09T23:30:00Z"))).toBe("vadrouille-mes-donnees-2026-11-10.json");
    // Été : UTC+2.
    expect(dateDeZurich(new Date("2026-07-01T21:59:59Z"))).toBe("2026-07-01");
    expect(dateDeZurich(new Date("2026-07-01T22:00:00Z"))).toBe("2026-07-02");
    expect(nomFichierExport(new Date(T))).toMatch(/^vadrouille-mes-donnees-\d{4}-\d{2}-\d{2}\.json$/);
  });

  it("JSON indenté de 2 espaces, clés dans l'ordre du contrat, fin de ligne finale", async () => {
    const resultat = await banc().cas.construire(CTX, new Date(T));
    if (!resultat.ok) throw new Error("export refusé");
    const texte = serialiserExport(resultat.value);
    expect(texte.startsWith('{\n  "format": "vadrouille-export",\n  "version": 1,\n  "exportedAt": "2026-11-09T10:00:00.000Z",\n  "notice": ')).toBe(true);
    expect(texte.endsWith("}\n")).toBe(true);
    expect(JSON.parse(texte)).toEqual(resultat.value);
  });
});

describe("compte: export et suppression exigent une réauthentification récente (part unitaire)", () => {
  it("fenêtre de 10 minutes : 9 min 59 s récente, 10 min 00 s ancienne ; session inconnue jamais récente", async () => {
    expect(FENETRE_CONNEXION_RECENTE_MS).toBe(600_000);
    const creee = new Date("2026-11-09T10:00:00.000Z");
    expect(connexionRecente(creee, new Date(creee.getTime() + 599_999))).toBe(true);
    expect(connexionRecente(creee, new Date(creee.getTime() + 599_000))).toBe(true);
    expect(connexionRecente(creee, new Date(creee.getTime() + 600_000))).toBe(false);
    expect(connexionRecente(creee, new Date(creee.getTime() + 7 * 86_400_000))).toBe(false);
    expect(connexionRecente(null, creee)).toBe(false);
    expect(connexionRecente(new Date(Number.NaN), creee)).toBe(false);
    const controle = creerControleConnexionRecente(async (id) => (id === "s1" ? creee : null));
    expect(await controle("s1", new Date(creee.getTime() + 599_000))).toBe(true);
    expect(await controle("s1", new Date(creee.getTime() + 600_000))).toBe(false);
    expect(await controle("s2", creee)).toBe(false);
    // Lecture en panne : échec fermé (un code de plus, jamais un export).
    expect(await creerControleConnexionRecente(async () => Promise.reject(new Error("base")))("s1", creee)).toBe(false);
  });
});

describe("compte: limite export (S7, proposition du § 5 point 7)", () => {
  const [HMAC = ""] = Object.keys({ RATE_LIMIT_HMAC_SECRET: 0 });

  function poolSimule() {
    const increments: unknown[][] = [];
    const compteurs = new Map<string, number>();
    const client: RateLimitClient = {
      async query(text, values) {
        if (text.startsWith("INSERT INTO action_rate_limits")) {
          increments.push(values ?? []);
          const cle = String(values?.[0]);
          compteurs.set(cle, (compteurs.get(cle) ?? 0) + 1);
          return { rows: [{ count: compteurs.get(cle) }] };
        }
        return { rows: [] };
      },
      release() {},
    };
    const pool: RateLimitPool = { connect: async () => client };
    return { pool, increments };
  }

  it("5 par heure et par personne (espèce user) ; clé rl/v1/export/3600s/user/<uuid> ; la 6e est refusée", async () => {
    expect(RATE_LIMITS.export).toEqual([{ kind: "user", windowSeconds: 3600, threshold: 5 }]);
    const octets = randomBytes(32);
    const env = { VADROUILLE_ENV: "ci", [HMAC]: octets.toString("base64url") };
    const { pool, increments } = poolSimule();
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      const limiteur = createRateLimiter({ pool, env, config: RATE_LIMITS });
      const demande = { action: "export", headers: new Headers(), userId: MOI.toUpperCase() };
      for (let i = 0; i < 5; i += 1) expect(await limiteur.verdict(demande)).toEqual({ ok: true });
      expect(await limiteur.verdict(demande)).toEqual({ ok: false, kind: "user" });
      expect(increments[0]?.[0]).toBe(rateLimitKey(octets, rateLimitMessage("export", 3600, `user/${MOI}`)));
      // Une autre personne a son propre compteur.
      expect(await limiteur.verdict({ ...demande, userId: "0d000000-0000-4000-8000-0000000000b2" })).toEqual({ ok: true });
    } finally {
      journal.mockRestore();
    }
  });

  it("sans identifiant de personne lisible : refus fermé, aucun incrément", async () => {
    const env = { VADROUILLE_ENV: "ci", [HMAC]: randomBytes(32).toString("base64url") };
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const journal = vi.spyOn(console, "log").mockImplementation(() => undefined);
    try {
      for (const userId of [undefined, "", "personne", `${MOI}x`]) {
        const { pool, increments } = poolSimule();
        const limiteur = createRateLimiter({ pool, env, config: RATE_LIMITS });
        expect((await limiteur.verdict({ action: "export", headers: new Headers(), ...(userId === undefined ? {} : { userId }) })).ok).toBe(false);
        expect(increments).toEqual([]);
      }
      expect(erreurs.mock.calls.flat().map(String).join("\n")).toContain("MissingUserId");
    } finally {
      erreurs.mockRestore();
      journal.mockRestore();
    }
  });
});

describe("compte: session et création de session lues par la connexion branchée (M9a)", () => {
  afterEach(() => {
    debrancherConnexionReellePourTests();
  });

  it("non branché : lève ; branché : délègue à readSession et readSessionCreatedAt ; opération absente : lève, contrôle à false", async () => {
    await expect(sessionBranchee(new Headers())).rejects.toBeInstanceOf(ConnexionIndisponibleError);
    await expect(creationDeSessionBranchee("0d000000-0000-4000-8000-0000000000d1")).rejects.toBeInstanceOf(ConnexionIndisponibleError);

    const session = { sessionId: "0d000000-0000-4000-8000-0000000000d1", userId: "0d000000-0000-4000-8000-0000000000b1", organizationId: "0d000000-0000-4000-8000-0000000000a1", role: "owner" as const };
    const creeeLe = new Date("2026-11-09T10:00:00Z");
    const lus: string[] = [];
    const operations = {
      requestCode: async () => ({ ok: true as const }),
      verifyCode: async () => ({ ok: false as const, code: "invalid_code" as const }),
      readSession: async (headers: Headers) => {
        lus.push(headers.get("cookie") ?? "");
        return session;
      },
      signOut: async () => ({ ok: true as const }),
      readSessionCreatedAt: async (id: string) => (id === session.sessionId ? creeeLe : null),
    };
    brancherConnexionReelle({ operations: () => operations, limiter: async () => ({ ok: true, value: undefined }), contexte: async () => null });
    expect(await sessionBranchee(new Headers({ cookie: "c=1" }))).toEqual(session);
    expect(lus).toEqual(["c=1"]);
    expect(await creationDeSessionBranchee(session.sessionId)).toEqual(creeeLe);
    expect(await creerControleConnexionRecente(creationDeSessionBranchee)(session.sessionId, new Date(creeeLe.getTime() + 60_000))).toBe(true);

    debrancherConnexionReellePourTests();
    const sansCreation = { ...operations, readSessionCreatedAt: undefined };
    brancherConnexionReelle({ operations: () => sansCreation, limiter: async () => ({ ok: true, value: undefined }), contexte: async () => null });
    await expect(creationDeSessionBranchee(session.sessionId)).rejects.toBeInstanceOf(ConnexionIndisponibleError);
    expect(await creerControleConnexionRecente(creationDeSessionBranchee)(session.sessionId, creeeLe)).toBe(false);
  });
});
