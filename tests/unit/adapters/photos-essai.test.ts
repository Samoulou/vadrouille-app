// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { photoLieuEssai } from "@/adapters";
import { brancherPhotosEssai, photosEssai, type PhotosEssaiBranchees } from "@/adapters/prototype-instance";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import type { PlacePhoto } from "@/contracts/photo";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Photos du tri d'un voyage d'essai par l'adaptateur `prototype` (décision 0128) : service simulé, branché comme au
 * démarrage (aucune base, aucun cookie, aucun appel Google) ; fermé hors prototype, hors organisation de l'essai et pour
 * une proposition hors du voyage demandé (lecteur simulé).
 */

const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };
const PHOTO: PlacePhoto = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana" }] };
/** Lieux reçus par le service simulé (il appelle `lieu` comme le service réel, garde ouverte). */
const lieux: (string | null)[] = [];
const photo = vi.fn<PhotosEssaiBranchees["photo"]>(async (lieu) => {
  const placeId = await lieu();
  lieux.push(placeId);
  return placeId === null ? null : PHOTO;
});

beforeEach(() => {
  vi.stubEnv("DATA_ADAPTER", "prototype");
  vi.stubEnv("NODE_ENV", "test");
  photo.mockClear();
  lieux.length = 0;
  brancherPhotosEssai({ photo });
});

afterEach(() => {
  brancherPhotosEssai(undefined as never);
  vi.unstubAllEnvs();
});

/**
 * Lecteur simulé : le voyage `t_debloque` (propositions `p1` à lieu `ChIJ-abc_9`, `p2` sans lieu, `p3` à lieu mal formé)
 * et le voyage `t_apercu` (non débloqué : aperçu, proposition `a1` à lieu `ChIJ-apercu`) ; tout autre voyage est inconnu.
 */
function lecteur(): () => TripAdapter {
  const proposition = (id: string, placeId?: string) => ({ id, stop: { id: `s_${id}`, name: "Lieu", ...(placeId === undefined ? {} : { placeId }) } });
  const voyages: Record<string, { unlocked: boolean; proposals: ReturnType<typeof proposition>[] }> = {
    t_debloque: { unlocked: true, proposals: [proposition("p1", "ChIJ-abc_9"), proposition("p2"), proposition("p3", "a/b?key=1")] },
    t_apercu: { unlocked: false, proposals: [proposition("a1", "ChIJ-apercu")] },
  };
  const adaptateur = {
    getTrip: vi.fn(async (_ctx: AdapterContext, tripId: string) => (voyages[tripId] === undefined ? null : { id: tripId, unlocked: voyages[tripId].unlocked, days: [] })),
    listProposals: vi.fn(async (_ctx: AdapterContext, tripId: string) => (voyages[tripId]?.unlocked ? voyages[tripId].proposals : [])),
    listPreviewSlots: vi.fn(async (_ctx: AdapterContext, tripId: string) =>
      voyages[tripId]?.unlocked === false ? voyages[tripId].proposals.map((proposal) => ({ type: "proposal", day: 1, time: "10:00", proposal })) : [],
    ),
  };
  return () => adaptateur as unknown as TripAdapter;
}

describe("adaptateur prototype : photoLieuEssai (décision 0128)", () => {
  it("lieu lu sur la proposition du voyage demandé (débloqué : propositions ; non débloqué : aperçu), jamais de l'entrée", async () => {
    const lire = lecteur();
    expect(await photoLieuEssai(CTX, { tripId: "t_debloque", proposalId: "p1" }, lire)).toEqual(PHOTO);
    expect(lieux.at(-1)).toBe("ChIJ-abc_9");
    expect(await photoLieuEssai(CTX, { tripId: "t_apercu", proposalId: "a1" }, lire)).toEqual(PHOTO);
    expect(lieux.at(-1)).toBe("ChIJ-apercu");
    expect(lire().listPreviewSlots).toHaveBeenCalledWith(CTX, "t_debloque");
  });

  it("lieu hors du voyage demandé : null, aucun lieu rendu au service (F13-TL-2)", async () => {
    const lire = lecteur();
    // Proposition d'un autre voyage, voyage inconnu (ou d'une autre organisation : l'adaptateur rend null), proposition
    // inconnue, sans lieu, lieu mal formé.
    for (const demande of [
      { tripId: "t_debloque", proposalId: "a1" },
      { tripId: "t_apercu", proposalId: "p1" },
      { tripId: "t_inconnu", proposalId: "p1" },
      { tripId: "t_debloque", proposalId: "p9" },
      { tripId: "t_debloque", proposalId: "p2" },
      { tripId: "t_debloque", proposalId: "p3" },
    ]) {
      expect(await photoLieuEssai(CTX, demande, lire), JSON.stringify(demande)).toBeNull();
    }
    expect(lieux).toEqual([null, null, null, null, null, null]);
  });

  it("autre organisation, autre adaptateur : null, sans lecture ni appel au service", async () => {
    const lire = lecteur();
    expect(await photoLieuEssai({ ...CTX, organizationId: "org_autre" }, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(await photoLieuEssai(CTX, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    expect(lire().listPreviewSlots).not.toHaveBeenCalled();
    expect(photo).not.toHaveBeenCalled();
  });

  it("service ou lecteur qui lève, service non branché : null", async () => {
    const lire = lecteur();
    photo.mockRejectedValueOnce(new Error("panne"));
    expect(await photoLieuEssai(CTX, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    expect(await photoLieuEssai(CTX, { tripId: "t_debloque", proposalId: "p1" }, () => ({ listPreviewSlots: async () => Promise.reject(new Error("base")) }) as unknown as TripAdapter)).toBeNull();
    brancherPhotosEssai(undefined as never);
    expect(photosEssai()).toBeNull();
    expect(await photoLieuEssai(CTX, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    // Non branché : aucune lecture du voyage.
    expect(lire().listPreviewSlots).not.toHaveBeenCalled();
  });
});
