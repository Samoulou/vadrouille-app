import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  EDIMBOURG_TRIP_ID,
  MOCK_ORGANIZATION_ID,
  apercu,
  edimbourg,
  edimbourgDebloque,
  propositionsDebloque,
} from "@/mocks/edimbourg";

import { buildDeck } from "./deck";
import { loadPresentation } from "./load";

const ownCtx = { organizationId: MOCK_ORGANIZATION_ID, userId: "user_test", role: "owner" as const };

const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle", userId: "user_test", role: "owner" as const }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getRequestContext: () => ({ ...contextMock }) };
});

afterEach(() => {
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
});

describe("presentation: ordre et filtrage du paquet", () => {
  it("voyage non débloqué : lit l'aperçu (B2-PO-9), cartes dans l'ordre des cases, créneaux noOption à part", async () => {
    const data = await loadPresentation(createMockTripAdapter(), ownCtx, EDIMBOURG_TRIP_ID);
    expect(data?.unlocked).toBe(false);
    expect(data?.generatingDays).toEqual([]);
    const cartes = apercu.flatMap((slot) => (slot.type === "proposal" ? [slot.proposal.id] : []));
    expect(data!.proposals.map((p) => p.id)).toEqual(cartes);
    expect(buildDeck(data!.proposals).map((p) => p.id)).toEqual(cartes);
    expect(data!.noOptionSlots).toEqual([{ day: 4, time: "16:00", kind: "activity" }]);
  });

  it("une proposition locked injectée dans l'adaptateur n'est pas présentée", async () => {
    const base = propositionsDebloque[0]!;
    const locked = { ...base, id: "prop-verrouillee", stop: { ...base.stop, id: "s-verrou", locked: true } };
    const adapter = createMockTripAdapter([{ trip: edimbourgDebloque, proposals: [locked, ...propositionsDebloque] }]);
    const data = await loadPresentation(adapter, ownCtx, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(data?.proposals.map((p) => p.id)).toContain("prop-verrouillee");
    expect(buildDeck(data!.proposals).map((p) => p.id)).not.toContain("prop-verrouillee");
    expect(buildDeck(data!.proposals)).toHaveLength(propositionsDebloque.length);
  });

  it("voyage débloqué : J6 en préparation, listProposals et aucun créneau noOption", async () => {
    const data = await loadPresentation(createMockTripAdapter(), ownCtx, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(data?.unlocked).toBe(true);
    expect(data?.generatingDays).toEqual([6]);
    expect(data!.proposals.map((p) => p.id)).toEqual(propositionsDebloque.map((p) => p.id));
    expect(data!.noOptionSlots).toEqual([]);
  });
});

describe("loadPresentation : projection des jours (B2-PO-14)", () => {
  it("presentation: les données de l'écran ne transmettent ni placeId ni voyage complet", async () => {
    const data = (await loadPresentation(createMockTripAdapter(), ownCtx, EDIMBOURG_TRIP_ID))!;
    expect(Object.keys(data).sort()).toEqual(["days", "deck", "essai", "generatingDays", "noOptionSlots", "proposals", "tripId", "unlocked"]);
    // `mock` : aucun tri enregistré (session en mémoire de F6, B10-PO-18).
    expect(data.deck).toBeNull();
    expect(data.days).toHaveLength(edimbourg.days.length);
    for (const day of data.days) {
      expect(Object.keys(day).sort()).toEqual(["date", "index", "stops"]);
      for (const stop of day.stops) expect(Object.keys(stop).sort()).toEqual(["id", "name"]);
    }
    // Étapes et événements du jour, par identifiant et nom.
    expect(data.days[1]!.stops.map((stop) => stop.id)).toContain("j2-concert-orgue");
    const projection = JSON.stringify({ days: data.days, noOptionSlots: data.noOptionSlots });
    expect(projection).not.toContain("placeId");
    expect(projection).not.toContain("checklist");
    expect(projection).not.toContain("organizationId");
  });
});

describe("presentation: tri enregistré (B10a point 5, décision 0112 § 4 point 2)", () => {
  it("deck non nul : les cartes sont les propositions réduites aux proposalIds, dans leur ordre", async () => {
    const base = createMockTripAdapter();
    const cartes = apercu.flatMap((slot) => (slot.type === "proposal" ? [slot.proposal.id] : []));
    const reprise = [cartes[3]!, cartes[2]!, "inconnue"];
    const deck = { tripId: EDIMBOURG_TRIP_ID, proposalIds: reprise, openPrompt: { kind: "category" as const, category: "museum" as const }, closed: false, counts: { decided: 2, remaining: 3 } };
    const adapter = { ...base, getDeckSession: async () => deck };
    const data = (await loadPresentation(adapter, ownCtx, EDIMBOURG_TRIP_ID))!;
    expect(data.deck).toEqual(deck);
    expect(data.proposals.map((p) => p.id)).toEqual([cartes[3], cartes[2]]);
  });

  it("tri clos : aucune carte", async () => {
    const base = createMockTripAdapter();
    const deck = { tripId: EDIMBOURG_TRIP_ID, proposalIds: [], openPrompt: null, closed: true, counts: { decided: 0, remaining: 0 } };
    const data = (await loadPresentation({ ...base, getDeckSession: async () => deck }, ownCtx, EDIMBOURG_TRIP_ID))!;
    expect(data.proposals).toEqual([]);
    expect(data.deck?.closed).toBe(true);
  });
});

describe("presentation: 404 hors organisation", () => {
  it("loadPresentation renvoie null pour une autre organisation ou un voyage inconnu", async () => {
    const adapter = createMockTripAdapter();
    expect(await loadPresentation(adapter, { organizationId: "mock_org_autre", userId: "user_test", role: "owner" as const }, EDIMBOURG_TRIP_ID)).toBeNull();
    expect(await loadPresentation(adapter, ownCtx, "inconnu")).toBeNull();
  });

  it("la page répond 404 (notFound) pour un voyage d'une autre organisation", async () => {
    const { default: PresentationPage } = await import("@/app/voyages/[id]/presentation/page");
    contextMock.organizationId = "mock_org_autre";
    await expect(PresentationPage({ params: Promise.resolve({ id: EDIMBOURG_TRIP_ID }) })).rejects.toMatchObject({
      digest: expect.stringContaining("404"),
    });
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    await expect(PresentationPage({ params: Promise.resolve({ id: EDIMBOURG_TRIP_ID }) })).resolves.toBeTruthy();
  });
});
