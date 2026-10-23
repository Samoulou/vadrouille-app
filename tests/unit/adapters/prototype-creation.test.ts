// @vitest-environment node
import { describe, expect, it, vi } from "vitest";

import { createPrototypeCreationAdapter, type EtatVoyageEssai, type IssueLancementEssai, type PortCreationEssai } from "@/adapters/prototype-creation";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import { GenerationStatusSchema, MAX_PREVIEW_SLOTS, type TripRequest } from "@/contracts";
import { MOCK_DEMO_TRIP_DRAFT } from "@/mocks/creation-edimbourg";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Création d'un voyage d'essai par l'adaptateur `prototype` (E2E-essai, lot 3, critère 5 ; décision 0125 § 4) : port
 * simulé (aucune base, aucun cookie, aucun lancement), lecture des voyages simulée.
 */

const TRIP = "proto_edimbourg_0123abcd45674890a123456789abcdef";
const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };
const AUTRE: AdapterContext = { organizationId: "org_autre", userId: "user_test", role: "owner" };
const REQUEST: TripRequest = {
  requestId: "11111111-1111-4111-8111-111111111111",
  draft: MOCK_DEMO_TRIP_DRAFT,
  brief: { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["heritage"], limits: [], mobility: [], inferredFields: [] },
};

const etape = (id: string, commitment?: string) => ({ type: "stop", stop: { id, ...(commitment ? { commitment } : {}) } });
const JOURS = [
  { index: 1, items: [etape("a1"), { type: "travel" }, etape("a2"), etape("billet", "ticket"), etape("a3")] },
  { index: 2, items: [etape("b1"), etape("b2")] },
  { index: 3, items: [etape("c1")] },
];

function adaptateur(options: { port?: PortCreationEssai | null; etat?: EtatVoyageEssai | null; issue?: IssueLancementEssai; jours?: unknown[] | null } = {}) {
  const port: PortCreationEssai = {
    lancer: vi.fn(async () => options.issue ?? { statut: "lancee", tripId: TRIP }),
    relancer: vi.fn(async () => options.issue ?? { statut: "lancee", tripId: TRIP }),
    etat: vi.fn(async () => (options.etat === undefined ? { etat: "en_cours" as const, jours: 6 } : options.etat)),
  };
  const getTrip = vi.fn(async () => (options.jours === null ? null : { days: options.jours ?? JOURS }));
  const trips = { getTrip } as unknown as TripAdapter;
  const branche = options.port === null ? null : (options.port ?? port);
  return { port, getTrip, creation: createPrototypeCreationAdapter({ port: () => branche, trips: () => trips }) };
}

describe("adaptateur prototype : createTrip (lancement du brief saisi)", () => {
  it("lancé : tripId du port ; récit transmis s'il est donné, absent sinon", async () => {
    const { creation, port } = adaptateur();
    expect(await creation.createTrip(CTX, { ...REQUEST, story: "On aime marcher le soir dans la vieille ville." })).toEqual({ ok: true, value: { tripId: TRIP } });
    expect(port.lancer).toHaveBeenLastCalledWith(expect.objectContaining({ requestId: REQUEST.requestId, recit: "On aime marcher le soir dans la vieille ville." }));
    await creation.createTrip(CTX, REQUEST);
    expect(vi.mocked(port.lancer).mock.calls[1]?.[0]).not.toHaveProperty("recit");
  });

  it.each([
    [{ statut: "entree_invalide", champ: "story" }, { code: "validation_failed", field: "story" }],
    [{ statut: "acces_refuse" }, { code: "unauthenticated" }],
    [{ statut: "cap_reached" }, { code: "cost_cap_reached" }],
    [{ statut: "envelope_reached" }, { code: "cost_cap_reached" }],
    [{ statut: "daily_quota_insufficient" }, { code: "cost_cap_reached" }],
    [{ statut: "fermee" }, { code: "provider_error" }],
    [{ statut: "demarrage_impossible" }, { code: "provider_error" }],
    [{ statut: "lancee" }, { code: "provider_error" }],
  ])("issue %j : erreur %j", async (issue, erreur) => {
    const { creation } = adaptateur({ issue });
    const result = await creation.createTrip(CTX, REQUEST);
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error).toMatchObject(erreur);
  });

  it("port non branché ou autre organisation : provider_error, rien n'est lancé", async () => {
    expect((await adaptateur({ port: null }).creation.createTrip(CTX, REQUEST)).ok).toBe(false);
    const { creation, port } = adaptateur();
    expect(await creation.createTrip(AUTRE, REQUEST)).toMatchObject({ ok: false, error: { code: "provider_error" } });
    expect(port.lancer).not.toHaveBeenCalled();
  });

  it("structuration et suggestion de logement : no_option (D2)", async () => {
    const { creation } = adaptateur();
    expect(await creation.structureBrief({} as never)).toMatchObject({ ok: false, error: { code: "no_option" } });
    expect(await creation.suggestLodging({} as never)).toMatchObject({ ok: false, error: { code: "no_option" } });
  });
});

describe("adaptateur prototype : getGenerationStatus (phases → GenerationStatus)", () => {
  it("en_cours → preparing : jours 1 et 2 en préparation, 8 attendues, aucune prête", async () => {
    const result = await adaptateur().creation.getGenerationStatus(CTX, TRIP);
    expect(result).toEqual({
      ok: true,
      value: { phase: "preparing", tripId: TRIP, days: [{ index: 1, state: "preparing", readyStops: 0 }, { index: 2, state: "preparing", readyStops: 0 }], expected: MAX_PREVIEW_SLOTS, ready: 0 },
    });
    expect(GenerationStatusSchema.safeParse(result.ok && result.value).success).toBe(true);
  });

  it("séjour d'un jour : un seul jour en préparation", async () => {
    const result = await adaptateur({ etat: { etat: "en_cours", jours: 1 } }).creation.getGenerationStatus(CTX, TRIP);
    expect(result.ok && result.value.days).toHaveLength(1);
  });

  it("programme_ecrit → ready : étapes de l'aperçu par jour (engagement exclu), toutes prêtes", async () => {
    const { creation, getTrip } = adaptateur({ etat: { etat: "programme_ecrit", jours: 3 } });
    const result = await creation.getGenerationStatus(CTX, TRIP);
    expect(result).toEqual({
      ok: true,
      value: { phase: "ready", tripId: TRIP, days: [{ index: 1, state: "ready", readyStops: 3 }, { index: 2, state: "ready", readyStops: 2 }], expected: 5, ready: 5 },
    });
    expect(getTrip).toHaveBeenCalledWith(CTX, TRIP);
    expect(GenerationStatusSchema.safeParse(result.ok && result.value).success).toBe(true);
  });

  it("arretee → failed, provider_error, retryable", async () => {
    const result = await adaptateur({ etat: { etat: "arretee", jours: 4 } }).creation.getGenerationStatus(CTX, TRIP);
    expect(result.ok && result.value).toMatchObject({ phase: "failed", reason: "provider_error", retryable: true, ready: 0 });
    expect(GenerationStatusSchema.safeParse(result.ok && result.value).success).toBe(true);
  });

  it("inconnu, programme illisible, autre organisation, port non branché : not_found", async () => {
    expect(await adaptateur({ etat: null }).creation.getGenerationStatus(CTX, TRIP)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await adaptateur({ etat: { etat: "programme_ecrit", jours: 3 }, jours: null }).creation.getGenerationStatus(CTX, TRIP)).toMatchObject({ ok: false, error: { code: "not_found" } });
    const { creation, port } = adaptateur();
    expect(await creation.getGenerationStatus(AUTRE, TRIP)).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(port.etat).not.toHaveBeenCalled();
    expect(await adaptateur({ port: null }).creation.getGenerationStatus(CTX, TRIP)).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
});

describe("adaptateur prototype : retryGeneration et voyage complet", () => {
  it("aperçu : relance du brief sous un nouveau voyage ; voyage complet : refus", async () => {
    const NOUVEAU = "proto_edimbourg_fedcba9876543210fedcba9876543210";
    const { creation, port } = adaptateur({ issue: { statut: "lancee", tripId: NOUVEAU } });
    expect(await creation.retryGeneration(CTX, { tripId: TRIP, requestId: REQUEST.requestId })).toEqual({ ok: true, value: { tripId: NOUVEAU } });
    expect(port.relancer).toHaveBeenCalledWith({ tripId: TRIP, requestId: REQUEST.requestId });
    expect(await creation.retryGeneration(CTX, { tripId: TRIP, requestId: REQUEST.requestId, kind: "full" })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(await creation.retryGeneration(AUTRE, { tripId: TRIP, requestId: REQUEST.requestId })).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(port.relancer).toHaveBeenCalledTimes(1);
  });

  it("voyage complet : aucune phase à suivre", async () => {
    expect(await adaptateur().creation.getFullTripStatus(CTX, TRIP)).toEqual({ ok: true, value: { phase: "none", tripId: TRIP } });
  });
});
