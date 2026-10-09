import { afterEach, describe, expect, it, vi } from "vitest";

import { createMockTripAdapter } from "@/adapters/mock";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID, MOCK_ORGANIZATION_ID, edimbourg, propositions } from "@/mocks/edimbourg";

import { buildDeck } from "./deck";
import { loadPresentation } from "./load";

const ownCtx = { organizationId: MOCK_ORGANIZATION_ID };

const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle" }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getRequestContext: () => ({ ...contextMock }) };
});

afterEach(() => {
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
});

describe("presentation: ordre et filtrage du paquet", () => {
  it("lit les 8 propositions de l'aperçu dans l'ordre des données", async () => {
    const data = await loadPresentation(createMockTripAdapter(), ownCtx, EDIMBOURG_TRIP_ID);
    expect(data?.unlocked).toBe(false);
    expect(data?.generatingDays).toEqual([]);
    expect(buildDeck(data!.proposals).map((p) => p.id)).toEqual(propositions.map((p) => p.id));
  });

  it("une proposition locked injectée dans l'adaptateur n'est pas présentée", async () => {
    const base = propositions[0]!;
    const locked = { ...base, id: "prop-verrouillee", stop: { ...base.stop, id: "s-verrou", locked: true } };
    const adapter = createMockTripAdapter([{ trip: edimbourg, proposals: [locked, ...propositions] }]);
    const data = await loadPresentation(adapter, ownCtx, EDIMBOURG_TRIP_ID);
    expect(data?.proposals.map((p) => p.id)).toContain("prop-verrouillee");
    expect(buildDeck(data!.proposals).map((p) => p.id)).not.toContain("prop-verrouillee");
    expect(buildDeck(data!.proposals)).toHaveLength(8);
  });

  it("voyage débloqué : J6 en préparation", async () => {
    const data = await loadPresentation(createMockTripAdapter(), ownCtx, EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(data?.unlocked).toBe(true);
    expect(data?.generatingDays).toEqual([6]);
  });
});

describe("presentation: 404 hors organisation", () => {
  it("loadPresentation renvoie null pour une autre organisation ou un voyage inconnu", async () => {
    const adapter = createMockTripAdapter();
    expect(await loadPresentation(adapter, { organizationId: "mock_org_autre" }, EDIMBOURG_TRIP_ID)).toBeNull();
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
