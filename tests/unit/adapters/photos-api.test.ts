// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { cheminPhotosDuTri, photoLieuApi, photosDuTriActives } from "@/adapters";
import { brancherPhotosApi, debrancherPhotosApiPourTests, photosApi, PhotosApiDejaBrancheesError, type PhotosApiBranchees } from "@/adapters/api-photos-instance";
import type { AdapterContext, TripAdapter } from "@/adapters/types";
import type { PlacePhoto } from "@/contracts/photo";

/**
 * Photos du tri par l'adaptateur `api` (PR 879, M1e ; décision 0128 généralisée) : le lieu est lu par le lecteur de la
 * requête (en base, organisation de la session) sur la proposition du voyage demandé, jamais pris de l'entrée ; photos
 * simulées branchées comme au démarrage (aucune base, aucune barrière réelle, aucun appel Google).
 */

const CTX_A: AdapterContext = { organizationId: "org_a", userId: "user_a", role: "owner" };
const CTX_B: AdapterContext = { organizationId: "org_b", userId: "user_b", role: "owner" };
const PHOTO: PlacePhoto = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana" }] };
const lieux: (string | null)[] = [];
let ouverte = true;
const photo = vi.fn<PhotosApiBranchees["photo"]>(async (lieu) => {
  // Comme le service réel : le voyage n'est lu que barrière ouverte.
  if (!ouverte) return null;
  const placeId = await lieu();
  lieux.push(placeId);
  return placeId === null ? null : PHOTO;
});
const ouvertes = vi.fn(async () => ouverte);

beforeEach(() => {
  vi.stubEnv("DATA_ADAPTER", "api");
  photo.mockClear();
  ouvertes.mockClear();
  lieux.length = 0;
  ouverte = true;
  debrancherPhotosApiPourTests();
  brancherPhotosApi({ photo, ouvertes });
});

afterEach(() => {
  debrancherPhotosApiPourTests();
  vi.unstubAllEnvs();
});

/**
 * Lecteur simulé, filtré par organisation comme la lecture en base (RLS) : l'organisation A a le voyage `t_debloque`
 * (propositions `p1` à lieu `ChIJ-abc_9`, `p2` sans lieu, `p3` à lieu mal formé) et le voyage `t_apercu` (aperçu,
 * proposition `a1` à lieu `ChIJ-apercu`) ; toute autre organisation ne voit rien.
 */
function lecteur(): () => TripAdapter {
  const proposition = (id: string, placeId?: string) => ({ id, stop: { id: `s_${id}`, name: "Lieu", ...(placeId === undefined ? {} : { placeId }) } });
  const voyages: Record<string, { unlocked: boolean; proposals: ReturnType<typeof proposition>[] }> = {
    t_debloque: { unlocked: true, proposals: [proposition("p1", "ChIJ-abc_9"), proposition("p2"), proposition("p3", "a/b?key=1")] },
    t_apercu: { unlocked: false, proposals: [proposition("a1", "ChIJ-apercu")] },
  };
  const visible = (ctx: AdapterContext, tripId: string) => (ctx.organizationId === "org_a" ? voyages[tripId] : undefined);
  const adaptateur = {
    listProposals: vi.fn(async (ctx: AdapterContext, tripId: string) => (visible(ctx, tripId)?.unlocked ? (visible(ctx, tripId)?.proposals ?? []) : [])),
    listPreviewSlots: vi.fn(async (ctx: AdapterContext, tripId: string) =>
      visible(ctx, tripId)?.unlocked === false ? (visible(ctx, tripId)?.proposals ?? []).map((proposal) => ({ type: "proposal", day: 1, time: "10:00", proposal })) : [],
    ),
  };
  return () => adaptateur as unknown as TripAdapter;
}

describe("adaptateur api : photoLieuApi (PR 879)", () => {
  it("lieu lu sur la proposition du voyage demandé de l'organisation de la session (aperçu ou propositions)", async () => {
    const lire = lecteur();
    expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, lire)).toEqual(PHOTO);
    expect(lieux.at(-1)).toBe("ChIJ-abc_9");
    expect(await photoLieuApi(CTX_A, { tripId: "t_apercu", proposalId: "a1" }, lire)).toEqual(PHOTO);
    expect(lieux.at(-1)).toBe("ChIJ-apercu");
    expect(lire().listPreviewSlots).toHaveBeenCalledWith(CTX_A, "t_debloque");
    expect(lire().listProposals).toHaveBeenCalledWith(CTX_A, "t_debloque");
  });

  it("appartenance refusée : autre organisation, autre voyage, voyage inconnu, proposition inconnue, sans lieu ou lieu mal formé", async () => {
    const lire = lecteur();
    expect(await photoLieuApi(CTX_B, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    for (const demande of [
      { tripId: "t_debloque", proposalId: "a1" },
      { tripId: "t_apercu", proposalId: "p1" },
      { tripId: "t_inconnu", proposalId: "p1" },
      { tripId: "t_debloque", proposalId: "p9" },
      { tripId: "t_debloque", proposalId: "p2" },
      { tripId: "t_debloque", proposalId: "p3" },
    ]) {
      expect(await photoLieuApi(CTX_A, demande, lire), JSON.stringify(demande)).toBeNull();
    }
    expect(lieux).toEqual([null, null, null, null, null, null, null]);
  });

  it("barrière fermée : null, le voyage n'est pas lu", async () => {
    ouverte = false;
    const lire = lecteur();
    expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    expect(lire().listPreviewSlots).not.toHaveBeenCalled();
    expect(lire().listProposals).not.toHaveBeenCalled();
  });

  it("autre adaptateur, photos non branchées, lecteur ou service qui lève : null, sans lecture", async () => {
    const lire = lecteur();
    for (const valeur of ["mock", "prototype", ""]) {
      vi.stubEnv("DATA_ADAPTER", valeur);
      expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    }
    expect(photo).not.toHaveBeenCalled();
    vi.stubEnv("DATA_ADAPTER", "api");
    photo.mockRejectedValueOnce(new Error("panne"));
    expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, lire)).toBeNull();
    expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, () => ({ listPreviewSlots: async () => Promise.reject(new Error("base")) }) as unknown as TripAdapter)).toBeNull();
    debrancherPhotosApiPourTests();
    expect(photosApi()).toBeNull();
    const autre = lecteur();
    expect(await photoLieuApi(CTX_A, { tripId: "t_debloque", proposalId: "p1" }, autre)).toBeNull();
    expect(autre().listPreviewSlots).not.toHaveBeenCalled();
  });

  it("second branchement refusé", () => {
    expect(() => brancherPhotosApi({ photo, ouvertes })).toThrow(PhotosApiDejaBrancheesError);
  });
});

describe("écran du tri : photosDuTriActives et cheminPhotosDuTri (PR 879)", () => {
  it("chemin par adaptateur : prototype, api, aucun pour mock ou une valeur inconnue", () => {
    expect(cheminPhotosDuTri("prototype")).toBe("prototype");
    expect(cheminPhotosDuTri("api")).toBe("api");
    for (const valeur of ["", " ", "mock", "autre"]) expect(cheminPhotosDuTri(valeur)).toBeNull();
  });

  it("api : demandées seulement barrière ouverte ; fermée, non branchées ou en panne : aucune demande", async () => {
    expect(await photosDuTriActives()).toBe(true);
    ouverte = false;
    expect(await photosDuTriActives()).toBe(false);
    expect(await photosDuTriActives(() => null)).toBe(false);
    expect(await photosDuTriActives(() => ({ photo, ouvertes: async () => Promise.reject(new Error("panne")) }))).toBe(false);
  });

  it("site d'essai : toujours demandées (sa garde est celle de l'action) ; mock : jamais", async () => {
    vi.stubEnv("DATA_ADAPTER", "prototype");
    expect(await photosDuTriActives(() => null)).toBe(true);
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(await photosDuTriActives()).toBe(false);
    expect(ouvertes).not.toHaveBeenCalled();
  });
});
