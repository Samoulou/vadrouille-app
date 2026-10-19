import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import type { AdapterContext } from "@/adapters/types";
import { GenerationStatusSchema, fail, type Brief, type Lodging, type TripCommitment, type TripDraft, type TripRequest } from "@/contracts";
import { lireBrouillon } from "@/server/creation/brouillon";
import { expirerExecutions } from "@/server/generation/expiration";
import { creerWithOrg, executeurSql } from "@/server/with-org";

import { createDatabase } from "../../db/index";
import { closeAll, connect, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Création du voyage et état de génération sur la base réelle (spécification B9, critères de B9b ; décisions 0081
 * B9-TL-3, B9-TL-5 à B9-TL-7, B9-TL-11 et 0087 §§ 1.1, 4 et 5). Adaptateur `api` de la création, sur `vadrouille_app`
 * (`withOrg` du client de test), horloge injectée, démarrage du workflow 1 par un espion sans appel. Chaque test crée
 * ses organisations (règle « un aperçu actif à la fois » par organisation). Aucune donnée Google : `placeId`
 * sentinelles `test_place_…`, centres et noms maison.
 */

const db = createDatabase("vadrouille_app");
const withOrg = creerWithOrg(db);
let app: DbClient;
let auth: DbClient;

/** 2027-07-01 12:00 UTC : avant toutes les dates des brouillons. */
const NOW = Date.parse("2027-07-01T12:00:00Z");
const MINUTE = 60_000;

const contexte = (org: Org): AdapterContext => ({ organizationId: org.org, userId: org.owner, role: "owner" });

function banc(maintenant = () => NOW) {
  const demarrer = vi.fn<(generationRunId: string) => Promise<string | null>>(async () => null);
  const adapter = createApiCreationAdapter({ withOrg, maintenant, demarrerApercu: demarrer });
  return { adapter, demarrer };
}

const BRIEF: Brief = {
  travellers: { adults: 2, children: 1 },
  pace: "balanced",
  wishes: ["nature", "tasting", "restaurant"],
  limits: ["nightlife"],
  mobility: ["walk", "transit"],
  mealBudgetPerPerson: 40,
  inferredFields: ["travellers", "pace", "wishes", "mobility"],
};

const DRAFT: TripDraft = {
  destination: "Paris",
  start: "2027-07-10",
  end: "2027-07-14",
  lodging: { kind: "known", label: "Hôtel de test" },
  otherCities: [],
  commitments: [],
};

const demande = (draft: Partial<TripDraft> = {}, brief: Brief = BRIEF): TripRequest => ({ requestId: randomUUID(), draft: { ...DRAFT, ...draft }, brief });

async function nouvelleOrg(): Promise<Org> {
  return createOrg(auth);
}

/** Lignes de l'organisation (RLS forcée, contexte posé), sous `vadrouille_app`. */
async function compter(org: Org, table: string, condition = "TRUE", valeurs: unknown[] = []): Promise<number> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM public.${table} WHERE ${condition}`, valeurs);
    return rows[0].n as number;
  });
}

async function toutCompter(org: Org): Promise<Record<string, number>> {
  const tables = ["trips", "briefs", "stays", "trip_commitments", "generation_runs"];
  return Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await compter(org, t)] as const)));
}

/** Pose l'état d'une exécution (comme le fera le workflow 1 de B9c), sous `vadrouille_app`. */
async function poser(org: Org, tripId: string, colonnes: { phase: string; stopReason?: string | null; updatedAt?: number; workflowRunId?: string | null }, kind = "preview") {
  await inTx(app, { org: org.org, user: org.owner }, (c) =>
    c.query(
      `UPDATE public.generation_runs SET phase = $3, stop_reason = $4, updated_at = $5::timestamptz, workflow_run_id = COALESCE($6, workflow_run_id)
       WHERE organization_id = $1 AND trip_id = $2 AND kind = $7
         AND started_at = (SELECT max(started_at) FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = $7)`,
      [org.org, tripId, colonnes.phase, colonnes.stopReason ?? null, new Date(colonnes.updatedAt ?? NOW).toISOString(), colonnes.workflowRunId ?? null, kind],
    ),
  );
}

async function dernierRun(org: Org, tripId: string, kind = "preview"): Promise<{ id: string; phase: string; stop_reason: string | null }> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(
      "SELECT id, phase, stop_reason FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = $3 ORDER BY started_at DESC, id DESC LIMIT 1",
      [org.org, tripId, kind],
    );
    return rows[0];
  });
}

/** Cases de l'aperçu de la dernière exécution : `prets` cases `proposal` (J1 puis J2), le reste en `noOption`. */
async function cases(org: Org, tripId: string, prets: number) {
  const run = await dernierRun(org, tripId);
  await inTx(app, { org: org.org, user: org.owner }, async (c) => {
    for (let position = 1; position <= 8; position++) {
      const proposition = position <= prets;
      await c.query(
        "INSERT INTO public.proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content) VALUES ($1, $2, $3, 'preview', $4, $5, $6, '10:00', 'activity', $7)",
        [
          org.org,
          tripId,
          run.id,
          position,
          proposition ? "proposal" : "noOption",
          position <= 4 ? 1 : 2,
          proposition ? JSON.stringify({ id: `p${position}`, stop: { name: "SENTINELLE_LIEU", placeId: "test_place_sentinelle" } }) : null,
        ],
      );
    }
  });
}

function trip(resultat: { ok: boolean; value?: { tripId: string } }): string {
  expect(resultat.ok).toBe(true);
  return resultat.value?.tripId ?? "";
}

beforeAll(async () => {
  app = await connect("app");
  auth = await connect("auth");
});

afterAll(async () => {
  await db.$client.end();
  await closeAll();
});

describe("création du voyage (B9b)", () => {
  it("création: idempotente par requestId", async () => {
    const a = await nouvelleOrg();
    const b = await nouvelleOrg();
    const { adapter, demarrer } = banc();
    const req = demande();
    const premier = trip(await adapter.createTrip(contexte(a), req));
    expect(trip(await adapter.createTrip(contexte(a), req))).toBe(premier);
    expect(await toutCompter(a)).toEqual({ trips: 1, briefs: 1, stays: 1, trip_commitments: 0, generation_runs: 1 });
    expect(demarrer).toHaveBeenCalledTimes(1);

    // Deux appels simultanés d'une nouvelle organisation : un seul voyage, une seule exécution, un seul démarrage.
    const c = await nouvelleOrg();
    const simultanes = await Promise.all([adapter.createTrip(contexte(c), req), adapter.createTrip(contexte(c), req)]);
    expect(trip(simultanes[0])).toBe(trip(simultanes[1]));
    expect(await toutCompter(c)).toMatchObject({ trips: 1, briefs: 1, generation_runs: 1 });
    expect(demarrer).toHaveBeenCalledTimes(2);

    // Après une génération `failed` et réessayable : le même voyage, sans nouvelle exécution (createTrip ne relance rien).
    await poser(a, premier, { phase: "failed", stopReason: "upstream_unavailable" });
    expect(trip(await adapter.createTrip(contexte(a), req))).toBe(premier);
    expect(await compter(a, "generation_runs")).toBe(1);
    expect(demarrer).toHaveBeenCalledTimes(2);

    // Rejeu après la date d'arrivée (horloge au-delà du départ) : le même voyage, avant tout contrôle du brouillon.
    const tard = banc(() => Date.parse("2027-08-01T12:00:00Z"));
    expect(trip(await tard.adapter.createTrip(contexte(a), req))).toBe(premier);
    expect(await tard.adapter.createTrip(contexte(a), demande())).toEqual(fail("validation_failed", "draft.start"));
    expect(await compter(a, "trips")).toBe(1);
    expect(tard.demarrer).not.toHaveBeenCalled();

    // Le même requestId dans une autre organisation crée un autre voyage.
    const autre = trip(await adapter.createTrip(contexte(b), req));
    expect(autre).not.toBe(premier);
    expect(await compter(b, "trips")).toBe(1);
  });

  it("création: un nouvel essai relance sans second voyage", async () => {
    const a = await nouvelleOrg();
    const { adapter, demarrer } = banc();
    const creation = demande();
    const tripId = trip(await adapter.createTrip(contexte(a), creation));
    await poser(a, tripId, { phase: "failed", stopReason: "upstream_timeout" });
    // Le requestId de createTrip n'est pas un essai : validation_failed, sans écriture.
    expect(await adapter.retryGeneration(contexte(a), { tripId, requestId: creation.requestId })).toEqual(fail("validation_failed"));
    expect(await compter(a, "generation_runs")).toBe(1);
    expect(demarrer).toHaveBeenCalledTimes(1);
    const essai = { tripId, requestId: randomUUID() };
    const deux = await Promise.all([adapter.retryGeneration(contexte(a), essai), adapter.retryGeneration(contexte(a), essai)]);
    expect(deux).toEqual([
      { ok: true, value: { tripId } },
      { ok: true, value: { tripId } },
    ]);
    expect(await adapter.retryGeneration(contexte(a), essai)).toEqual({ ok: true, value: { tripId } });
    expect(await toutCompter(a)).toMatchObject({ trips: 1, generation_runs: 2 });
    expect(demarrer).toHaveBeenCalledTimes(2);
    expect(await dernierRun(a, tripId)).toMatchObject({ phase: "queued", stop_reason: null });

    // Rien à relancer : en cours, prêt, incomplet, échec non réessayable ; refus sans écriture.
    for (const etat of [
      { phase: "queued" },
      { phase: "preparing" },
      { phase: "ready" },
      { phase: "incomplete" },
      { phase: "failed", stopReason: "cap_reached" },
      { phase: "failed", stopReason: "daily_quota_insufficient" },
      { phase: "failed", stopReason: "model_output_invalid" },
    ]) {
      await poser(a, tripId, etat);
      expect(await adapter.retryGeneration(contexte(a), { tripId, requestId: randomUUID() }), etat.phase).toEqual(fail("validation_failed"));
      expect(await toutCompter(a)).toMatchObject({ trips: 1, generation_runs: 2 });
    }
    // Voyage complet : aucune ligne `full` avant B9d (0087 § 1.1.4).
    await poser(a, tripId, { phase: "failed", stopReason: "step_expired" });
    expect(await adapter.retryGeneration(contexte(a), { tripId, requestId: randomUUID(), kind: "full" })).toEqual(fail("validation_failed"));
    expect(await compter(a, "generation_runs")).toBe(2);

    // Voyage d'une autre organisation ou identifiant illisible : not_found, sans écriture.
    const b = await nouvelleOrg();
    expect(await adapter.retryGeneration(contexte(b), { tripId, requestId: randomUUID() })).toEqual(fail("not_found"));
    expect(await adapter.retryGeneration(contexte(a), { tripId: "mock_trip_edimbourg", requestId: randomUUID() })).toEqual(fail("not_found"));

    // Une autre génération de l'organisation en cours : active_preview_exists, sans écriture.
    const second = trip(await adapter.createTrip(contexte(a), demande()));
    expect(await adapter.retryGeneration(contexte(a), { tripId, requestId: randomUUID() })).toEqual({ ok: false, error: { code: "active_preview_exists", activeTripId: second } });
    expect(await compter(a, "generation_runs", "trip_id = $1", [tripId])).toBe(2);
  });

  it("création: le brouillon est écrit sans perte", async () => {
    const engagements: TripCommitment[] = Array.from({ length: 10 }, (_, i) => ({
      kind: (["flight", "booking", "ticket"] as const)[i % 3] ?? "flight",
      label: `Engagement ${i + 1}`,
      date: `2027-07-${String(10 + (i % 8)).padStart(2, "0")}`,
      start: `${String(8 + i).padStart(2, "0")}:15`,
      ...(i % 2 === 0 ? { end: `${String(9 + i).padStart(2, "0")}:45` } : {}),
    }));
    const logements: Lodging[][] = [
      [
        { kind: "known", label: "Hôtel du Test" },
        { kind: "area", label: "Vieux-Lyon" },
        { kind: "none" },
      ],
      [
        { kind: "suggestedLodging", lodgingId: "lodging_test_1", placeId: "test_place_logement", name: "[Logement maison]" },
        { kind: "suggestedArea", areaId: "area_test_1", name: "[Quartier maison]", center: { lat: 45.76, lng: 4.83 }, radiusM: 800 },
        { kind: "suggestedLodging", lodgingId: "lodging_test_2", name: "[Logement sans lieu]" },
      ],
    ];
    const { adapter } = banc();
    for (const [premier, deuxieme, troisieme] of logements) {
      const a = await nouvelleOrg();
      const draft: TripDraft = {
        destination: "Paris",
        start: "2027-07-10",
        end: "2027-07-18",
        lodging: premier!,
        otherCities: [
          { name: "Lyon", arrival: "2027-07-13", lodging: deuxieme! },
          { name: "Nice", arrival: "2027-07-16", lodging: troisieme! },
        ],
        commitments: engagements,
      };
      const brief: Brief = { ...BRIEF, limits: [], mealBudgetPerPerson: undefined } as Brief;
      delete (brief as { mealBudgetPerPerson?: number }).mealBudgetPerPerson;
      for (const b of [BRIEF, brief]) {
        const org = b === BRIEF ? a : await nouvelleOrg();
        const tripId = trip(await adapter.createTrip(contexte(org), { requestId: randomUUID(), draft, brief: b }));
        const relu = await withOrg(contexte(org), (tx) => lireBrouillon(executeurSql(tx), org.org, tripId));
        expect(relu).toEqual({ draft, brief: b, timeZone: "Europe/Paris" });
        expect(await compter(org, "stays")).toBe(3);
        expect(await compter(org, "trip_commitments")).toBe(10);
        // Bornes exclusives : chaque ville va de son arrivée à l'arrivée suivante, la dernière jusqu'au départ.
        const bornes = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
          (await c.query("SELECT to_char(from_date, 'YYYY-MM-DD') AS f, to_char(to_date, 'YYYY-MM-DD') AS t FROM stays WHERE trip_id = $1 ORDER BY from_date", [tripId])).rows,
        );
        expect(bornes).toEqual([
          { f: "2027-07-10", t: "2027-07-13" },
          { f: "2027-07-13", t: "2027-07-16" },
          { f: "2027-07-16", t: "2027-07-18" },
        ]);
        // Le récit n'est pas dans TripRequest : rien n'est écrit ; l'ancienne colonne de mobilité n'est plus écrite.
        expect(await compter(org, "briefs", "story IS NULL AND mobility IS NULL AND version = 1")).toBe(1);
      }
    }
  });

  it("création: un aperçu actif à la fois", async () => {
    const a = await nouvelleOrg();
    const { adapter, demarrer } = banc();
    const premier = trip(await adapter.createTrip(contexte(a), demande()));
    const avant = await toutCompter(a);
    for (const phase of ["queued", "preparing"]) {
      await poser(a, premier, { phase });
      expect(await adapter.createTrip(contexte(a), demande({ destination: "Lyon" }))).toEqual({ ok: false, error: { code: "active_preview_exists", activeTripId: premier } });
      expect(await toutCompter(a)).toEqual(avant);
    }
    expect(demarrer).toHaveBeenCalledTimes(1);
    // Une génération finie libère la règle.
    await poser(a, premier, { phase: "ready" });
    const second = trip(await adapter.createTrip(contexte(a), demande({ destination: "Lyon" })));
    expect(second).not.toBe(premier);
    // Une autre organisation n'est jamais bloquée.
    const b = await nouvelleOrg();
    await poser(a, second, { phase: "preparing" });
    trip(await adapter.createTrip(contexte(b), demande()));
  });

  it("création: sans session, rien n'est créé", async () => {
    const a = await nouvelleOrg();
    const { adapter, demarrer } = banc();
    const req = demande();
    for (const ctx of [null, undefined, { organizationId: "", userId: "", role: "owner" }, { organizationId: a.org, userId: "mock_user", role: "owner" }, { organizationId: "mock_org", userId: a.owner, role: "owner" }]) {
      expect(await adapter.createTrip(ctx as never, req)).toEqual(fail("unauthenticated"));
      expect(await adapter.retryGeneration(ctx as never, { tripId: randomUUID(), requestId: randomUUID() })).toEqual(fail("unauthenticated"));
      expect(await adapter.getGenerationStatus(ctx as never, randomUUID())).toEqual(fail("unauthenticated"));
    }
    expect(await toutCompter(a)).toEqual({ trips: 0, briefs: 0, stays: 0, trip_commitments: 0, generation_runs: 0 });
    expect(demarrer).not.toHaveBeenCalled();
  });

  it("création: villes de fuseaux différents refusées", async () => {
    const a = await nouvelleOrg();
    const { adapter } = banc();
    const ville = (name: string, arrival = "2027-07-12") => ({ name, arrival, lodging: { kind: "none" } as const });
    // Édimbourg puis Paris : décalages différents ; ville inconnue de la table : refusée. Aucune écriture.
    expect(await adapter.createTrip(contexte(a), demande({ destination: "Édimbourg", otherCities: [ville("Paris")] }))).toEqual(
      fail("validation_failed", "draft.otherCities.0.name"),
    );
    expect(await adapter.createTrip(contexte(a), demande({ otherCities: [ville("Lyon"), ville("Atlantis", "2027-07-13")] }))).toEqual(
      fail("validation_failed", "draft.otherCities.1.name"),
    );
    expect(await adapter.createTrip(contexte(a), demande({ destination: "Atlantis" }))).toEqual(fail("validation_failed", "draft.destination"));
    expect(await adapter.createTrip(contexte(a), demande({ destination: "Lisbonne", otherCities: [ville("Madrid")] }))).toEqual(
      fail("validation_failed", "draft.otherCities.0.name"),
    );
    expect(await toutCompter(a)).toEqual({ trips: 0, briefs: 0, stays: 0, trip_commitments: 0, generation_runs: 0 });

    // Deux villes au même fuseau que la destination : acceptées ; fuseau du voyage celui de la destination.
    const tripId = trip(await adapter.createTrip(contexte(a), demande({ otherCities: [ville("Lyon"), ville("Nice", "2027-07-13")] })));
    const lu = await withOrg(contexte(a), (tx) => lireBrouillon(executeurSql(tx), a.org, tripId));
    expect(lu?.timeZone).toBe("Europe/Paris");
    expect(lu?.draft.otherCities.map((v) => v.name)).toEqual(["Lyon", "Nice"]);

    // Paris puis Berlin : même décalage pendant le voyage, accepté (0087 § 5, amende 0081 B9-TL-7).
    const b = await nouvelleOrg();
    trip(await adapter.createTrip(contexte(b), demande({ otherCities: [ville("Berlin")] })));
  });

  it("création: date d'arrivée passée refusée dans le fuseau du voyage", async () => {
    const a = await nouvelleOrg();
    // 2027-07-09 22:30 UTC : déjà le 10 à Paris, encore le 9 à Reykjavik (UTC toute l'année).
    const { adapter } = banc(() => Date.parse("2027-07-09T22:30:00Z"));
    expect(await adapter.createTrip(contexte(a), demande({ start: "2027-07-09" }))).toEqual(fail("validation_failed", "draft.start"));
    expect(await toutCompter(a)).toMatchObject({ trips: 0, generation_runs: 0 });
    trip(await adapter.createTrip(contexte(a), demande({ start: "2027-07-10" })));
    const b = await nouvelleOrg();
    trip(await adapter.createTrip(contexte(b), demande({ destination: "Reykjavik", start: "2027-07-09" })));
  });
});

describe("état de génération (B9b)", () => {
  it("génération: état lu sans donnée de lieu", async () => {
    const a = await nouvelleOrg();
    const b = await nouvelleOrg();
    const { adapter } = banc();
    const tripId = trip(
      await adapter.createTrip(contexte(a), demande({ lodging: { kind: "suggestedLodging", lodgingId: "l1", placeId: "test_place_sentinelle", name: "SENTINELLE_LIEU" } })),
    );
    expect(await adapter.getGenerationStatus(contexte(b), tripId)).toEqual(fail("not_found"));
    expect(await adapter.getGenerationStatus(contexte(a), "mock_trip_edimbourg")).toEqual(fail("not_found"));
    expect(await adapter.getGenerationStatus(contexte(a), randomUUID())).toEqual(fail("not_found"));

    const lire = async () => {
      const resultat = await adapter.getGenerationStatus(contexte(a), tripId);
      expect(resultat.ok).toBe(true);
      if (!resultat.ok) throw new Error("état illisible");
      expect(GenerationStatusSchema.safeParse(resultat.value).success).toBe(true);
      const texte = JSON.stringify(resultat.value);
      for (const interdit of ["SENTINELLE_LIEU", "test_place_sentinelle", "placeId", "step", "Paris", "Hôtel"]) expect(texte).not.toContain(interdit);
      return resultat.value;
    };
    const jours = (state: string, j1: number, j2: number) => [
      { index: 1, state, readyStops: j1 },
      { index: 2, state, readyStops: j2 },
    ];
    expect(await lire()).toEqual({ phase: "preparing", tripId, days: jours("preparing", 0, 0), expected: 8, ready: 0 });
    await poser(a, tripId, { phase: "preparing" });
    expect(await lire()).toMatchObject({ phase: "preparing", ready: 0 });
    await poser(a, tripId, { phase: "failed", stopReason: "cap_reached" });
    expect(await lire()).toEqual({ phase: "failed", tripId, days: jours("preparing", 0, 0), expected: 8, ready: 0, reason: "cost_cap_reached", retryable: false });
    await poser(a, tripId, { phase: "failed", stopReason: "daily_quota_insufficient" });
    expect(await lire()).toMatchObject({ phase: "failed", reason: "quota_reached", retryable: false });
    await poser(a, tripId, { phase: "failed", stopReason: "upstream_unavailable" });
    expect(await lire()).toMatchObject({ phase: "failed", reason: "provider_error", retryable: true });
    await poser(a, tripId, { phase: "failed", stopReason: "lodging_unresolved" });
    expect(await lire()).toMatchObject({ phase: "failed", reason: "provider_error", retryable: false });

    // no_option n'est jamais une raison d'échec : des cases `noOption` donnent `incomplete` (PO-6).
    await cases(a, tripId, 5);
    await poser(a, tripId, { phase: "incomplete" });
    expect(await lire()).toEqual({ phase: "incomplete", tripId, days: jours("ready", 4, 1), expected: 8, ready: 5 });

    const c = await nouvelleOrg();
    const pret = trip(await adapter.createTrip(contexte(c), demande()));
    await cases(c, pret, 8);
    await poser(c, pret, { phase: "ready" });
    expect(await adapter.getGenerationStatus(contexte(c), pret)).toEqual({ ok: true, value: { phase: "ready", tripId: pret, days: jours("ready", 4, 4), expected: 8, ready: 8 } });
  });

  it("génération: une exécution figée expire", async () => {
    let maintenant = NOW;
    const { adapter } = banc(() => maintenant);
    const a = await nouvelleOrg();
    const tripId = trip(await adapter.createTrip(contexte(a), demande()));

    // `preparing` touchée il y a 19 minutes : rien ne change.
    await poser(a, tripId, { phase: "preparing", updatedAt: NOW });
    maintenant = NOW + 19 * MINUTE;
    expect(await adapter.getGenerationStatus(contexte(a), tripId)).toMatchObject({ ok: true, value: { phase: "preparing" } });
    expect(await dernierRun(a, tripId)).toMatchObject({ phase: "preparing", stop_reason: null });

    // 21 minutes : failed, provider_error, réessayable, par une seule écriture (deux appels simultanés).
    maintenant = NOW + 21 * MINUTE;
    const touches = await Promise.all([0, 1].map(() => withOrg(contexte(a), (tx) => expirerExecutions(executeurSql(tx), a.org, tripId, maintenant))));
    expect(touches.flat()).toHaveLength(1);
    expect(await adapter.getGenerationStatus(contexte(a), tripId)).toMatchObject({ ok: true, value: { phase: "failed", reason: "provider_error", retryable: true } });
    expect(await dernierRun(a, tripId)).toMatchObject({ phase: "failed", stop_reason: "step_expired" });
    // Réessayable : retryGeneration repart.
    expect(await adapter.retryGeneration(contexte(a), { tripId, requestId: randomUUID() })).toEqual({ ok: true, value: { tripId } });

    // `preview` resté `queued` 21 minutes : expire de même, par getGenerationStatus.
    const b = await nouvelleOrg();
    maintenant = NOW;
    const enFile = trip(await adapter.createTrip(contexte(b), demande()));
    maintenant = NOW + 21 * MINUTE;
    expect(await adapter.getGenerationStatus(contexte(b), enFile)).toMatchObject({ ok: true, value: { phase: "failed", reason: "provider_error", retryable: true } });

    // `full` resté `queued` 21 minutes : expire avec un workflow_run_id, jamais sans (laissé à la réconciliation).
    for (const workflowRunId of ["wrun_test", null]) {
      const c = await nouvelleOrg();
      maintenant = NOW;
      const complet = trip(await adapter.createTrip(contexte(c), demande()));
      await poser(c, complet, { phase: "ready" });
      await inTx(app, { org: c.org, user: c.owner }, (q) =>
        q.query("INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, workflow_run_id, started_at, updated_at) VALUES ($1, $2, 'full', 'queued', $3, $4::timestamptz, $4::timestamptz)", [
          c.org,
          complet,
          workflowRunId,
          new Date(NOW + MINUTE).toISOString(),
        ]),
      );
      maintenant = NOW + 22 * MINUTE;
      const etat = await adapter.getGenerationStatus(contexte(c), complet);
      if (workflowRunId === null) {
        expect(etat).toMatchObject({ ok: true, value: { phase: "preparing" } });
        expect(await dernierRun(c, complet, "full")).toMatchObject({ phase: "queued", stop_reason: null });
      } else {
        expect(etat).toMatchObject({ ok: true, value: { phase: "failed", reason: "provider_error", retryable: true } });
        expect(await dernierRun(c, complet, "full")).toMatchObject({ phase: "failed", stop_reason: "step_expired" });
      }
    }
  });
});
