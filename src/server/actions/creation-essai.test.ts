// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { fail, ok, type Brief, type TripRequest } from "@/contracts";
import { MOCK_DEMO_TRIP_DRAFT } from "@/mocks/creation-edimbourg";

import { createTrip, relancerVoyageEssai } from "./creation";

/**
 * Actions de création sur le site d'essai (adaptateur `prototype` ; E2E-essai, lot 3 ; décision 0125 § 2 et § 4) : pas
 * de session (le code d'accès est contrôlé par l'adaptateur), même validation que `createTrip`, « Réessayer » sous un
 * nouveau voyage. Adaptateur simulé : aucune base, aucun cookie, aucun lancement.
 */

const d = vi.hoisted(() => ({
  prototype: true,
  createTrip: vi.fn(),
  retryGeneration: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  isPrototypeAdapter: () => d.prototype,
  authAdapterChoice: () => "mock",
  getAuthAdapter: () => ({ getSession: d.getSession }),
  getCreationAdapter: () => ({ createTrip: d.createTrip, retryGeneration: d.retryGeneration }),
}));
vi.mock("@/adapters/simulation", () => ({
  getSimulationScope: async () => ({ clock: { now: () => Date.parse("2027-04-01T12:00:00Z") } }),
}));
vi.mock("@/features/compte/session", () => ({
  contexteFacultatif: async () => ({ organizationId: "org_prototype", userId: "user_prototype", role: "owner" }),
}));

const TRIP = "proto_rome_0123abcd45674890a123456789abcdef";
const NOUVEAU = "proto_rome_fedcba9876543210fedcba9876543210";
const BRIEF: Brief = { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["heritage"], limits: [], mobility: [], inferredFields: [] };
const REQUEST: TripRequest = {
  requestId: "5b0f3f39-4a5e-4d0c-9a59-1c2f0a7c5e11",
  draft: { ...MOCK_DEMO_TRIP_DRAFT, destination: "Rome", start: "2027-05-04", end: "2027-05-08" },
  brief: BRIEF,
  story: "On aime la Rome antique et les trattorias de quartier.",
};

beforeEach(() => {
  vi.clearAllMocks();
  d.prototype = true;
  d.createTrip.mockResolvedValue(ok({ tripId: TRIP }));
  d.retryGeneration.mockResolvedValue(ok({ tripId: NOUVEAU }));
});

describe("createTrip sur le site d'essai", () => {
  it("sans session : lancé, contexte org_prototype, récit transmis à l'adaptateur", async () => {
    expect(await createTrip(REQUEST)).toEqual(ok({ tripId: TRIP }));
    expect(d.getSession).not.toHaveBeenCalled();
    expect(d.createTrip).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_prototype" }), REQUEST);
  });

  it("entrée invalide ou arrivée passée : validation_failed avant tout appel à l'adaptateur", async () => {
    expect(await createTrip({ ...REQUEST, requestId: "123" })).toEqual(fail("validation_failed", "requestId"));
    expect(await createTrip({ ...REQUEST, draft: { ...REQUEST.draft, start: "2027-03-01", end: "2027-03-04" } })).toEqual(fail("validation_failed", "draft.start"));
    expect(d.createTrip).not.toHaveBeenCalled();
  });

  it.each([
    [fail("validation_failed", "story"), fail("validation_failed", "story")],
    [fail("unauthenticated"), fail("unauthenticated")],
    [fail("cost_cap_reached"), fail("cost_cap_reached")],
    [fail("not_found"), fail("provider_error")],
  ])("refus de l'adaptateur %j : %j", async (refus, attendu) => {
    d.createTrip.mockResolvedValue(refus);
    expect(await createTrip(REQUEST)).toEqual(attendu);
  });

  it("adaptateur qui lève : provider_error", async () => {
    d.createTrip.mockRejectedValue(new Error("panne"));
    expect(await createTrip(REQUEST)).toEqual(fail("provider_error"));
  });
});

describe("relancerVoyageEssai (« Réessayer » de l'écran 5)", () => {
  it("nouveau voyage rendu ; le même voyage serait une sortie non conforme", async () => {
    const demande = { tripId: TRIP, requestId: REQUEST.requestId };
    expect(await relancerVoyageEssai(demande)).toEqual(ok({ tripId: NOUVEAU }));
    expect(d.retryGeneration).toHaveBeenCalledWith(expect.objectContaining({ organizationId: "org_prototype" }), demande);
    d.retryGeneration.mockResolvedValue(ok({ tripId: TRIP }));
    expect(await relancerVoyageEssai(demande)).toEqual(fail("provider_error"));
  });

  it("hors adaptateur prototype : not_found avant toute lecture ; voyage complet ou entrée invalide : validation_failed", async () => {
    d.prototype = false;
    expect(await relancerVoyageEssai({ tripId: TRIP, requestId: REQUEST.requestId })).toEqual(fail("not_found"));
    d.prototype = true;
    expect(await relancerVoyageEssai({ tripId: TRIP, requestId: REQUEST.requestId, kind: "full" })).toEqual(fail("validation_failed", "kind"));
    expect(await relancerVoyageEssai({ tripId: TRIP })).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(d.retryGeneration).not.toHaveBeenCalled();
  });

  it("refus : unauthenticated et cost_cap_reached transmis, le reste provider_error", async () => {
    d.retryGeneration.mockResolvedValue(fail("unauthenticated"));
    expect(await relancerVoyageEssai({ tripId: TRIP, requestId: REQUEST.requestId })).toEqual(fail("unauthenticated"));
    d.retryGeneration.mockResolvedValue(fail("validation_failed"));
    expect(await relancerVoyageEssai({ tripId: TRIP, requestId: REQUEST.requestId })).toEqual(fail("provider_error"));
  });
});
