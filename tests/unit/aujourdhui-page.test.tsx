import { afterEach, describe, expect, it, vi } from "vitest";

import * as adapters from "@/adapters";
import AujourdhuiPage, { generateMetadata } from "@/app/voyages/[id]/aujourdhui/page";
import { MOCK_ORGANIZATION_ID } from "@/mocks/edimbourg";

import { nextConfig, RESPONSE_HEADERS } from "../../next.config";

// `workflow/next` charge esbuild, incompatible avec jsdom ; seule la configuration de Next est lue ici (décision 0063).
vi.mock("workflow/next", () => ({ withWorkflow: <T,>(config: T) => config }));

/** Page de l'écran 15 (`R15`, spécification F10, C6) : lecture par `getTripReader()`, 404, erreur, en-têtes. */

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));

const contextMock = vi.hoisted(() => ({ organizationId: "mock_org_personnelle" }));
vi.mock("@/adapters", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/adapters")>();
  return { ...actual, getRequestContext: () => ({ ...contextMock }), getTripReader: vi.fn(actual.getTripReader) };
});

const params = (id: string) => ({ params: Promise.resolve({ id }) });
const TRIP = "mock_trip_edimbourg";

afterEach(() => {
  contextMock.organizationId = MOCK_ORGANIZATION_ID;
  vi.mocked(adapters.getTripReader).mockClear();
});

describe("R15 : lecture, 404 et erreur (C6)", () => {
  it("voyage de l'organisation : rendu de l'écran avec les jours projetés, lu par getTripReader()", async () => {
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    const element = (await AujourdhuiPage(params(TRIP))) as { props: { trip: { id: string; days: unknown[] }; placesFromGoogle: boolean } };
    expect(element.props.trip.id).toBe(TRIP);
    expect(element.props.trip.days).toHaveLength(6);
    expect(element.props.placesFromGoogle).toBe(false);
    expect(adapters.getTripReader).toHaveBeenCalled();
  });

  it("voyage d'une autre organisation : 404, après lecture par getTripReader()", async () => {
    contextMock.organizationId = "mock_org_autre";
    await expect(AujourdhuiPage(params(TRIP))).rejects.toThrow("NEXT_NOT_FOUND");
    expect(adapters.getTripReader).toHaveBeenCalled();
  });

  it("voyage inconnu : 404", async () => {
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    await expect(AujourdhuiPage(params("inconnu"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("erreur de l'adaptateur : l'erreur remonte (page d'erreur commune), jamais un 404", async () => {
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    const failing = { ...adapters.getTripReader(), getTrip: () => Promise.reject(new Error("adaptateur indisponible")) };
    vi.mocked(adapters.getTripReader).mockReturnValueOnce(failing);
    await expect(AujourdhuiPage(params("voyage_en_erreur"))).rejects.toThrow("adaptateur indisponible");
  });

  it("titre du document « Édimbourg · Aujourd'hui », non indexé ; inconnu : pas de titre", async () => {
    contextMock.organizationId = MOCK_ORGANIZATION_ID;
    expect(await generateMetadata(params(TRIP))).toEqual({ title: "Édimbourg · Aujourd'hui", robots: { index: false, follow: false } });
    expect((await generateMetadata(params("inconnu"))).title).toBeUndefined();
  });
});

describe("R15 : en-têtes (F10-TL-8)", () => {
  it("Cache-Control privé et no-store sur /voyages/:id/aujourdhui, posé par next.config.ts", async () => {
    expect(await nextConfig.headers?.()).toEqual(RESPONSE_HEADERS);
    const rule = RESPONSE_HEADERS.find((entry) => entry.source === "/voyages/:id/aujourdhui");
    const value = rule?.headers.find((header) => header.key === "Cache-Control")?.value ?? "";
    expect(value).toContain("private");
    expect(value).toContain("no-store");
  });
});
