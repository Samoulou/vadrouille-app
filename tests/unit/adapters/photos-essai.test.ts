// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { photoLieuEssai } from "@/adapters";
import { brancherPhotosEssai, photosEssai, type PhotosEssaiBranchees } from "@/adapters/prototype-instance";
import type { AdapterContext } from "@/adapters/types";
import type { PlacePhoto } from "@/contracts/photo";
import { PROTOTYPE_ORG_ID } from "@/prototype/programme-reduit";

/**
 * Photos du tri d'un voyage d'essai par l'adaptateur `prototype` (décision 0128) : service simulé, branché comme au
 * démarrage (aucune base, aucun cookie, aucun appel Google) ; fermé hors prototype, hors organisation de l'essai et pour
 * un identifiant mal formé.
 */

const CTX: AdapterContext = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" };
const PHOTO: PlacePhoto = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana" }] };
const photo = vi.fn<PhotosEssaiBranchees["photo"]>(async () => PHOTO);

beforeEach(() => {
  vi.stubEnv("DATA_ADAPTER", "prototype");
  vi.stubEnv("NODE_ENV", "test");
  photo.mockClear();
  brancherPhotosEssai({ photo });
});

afterEach(() => {
  brancherPhotosEssai(undefined as never);
  vi.unstubAllEnvs();
});

describe("adaptateur prototype : photoLieuEssai (décision 0128)", () => {
  it("photo du service branché", async () => {
    expect(await photoLieuEssai(CTX, "ChIJ-abc_9")).toEqual(PHOTO);
    expect(photo).toHaveBeenCalledWith("ChIJ-abc_9");
  });

  it("autre organisation, autre adaptateur, identifiant mal formé : null, sans appel au service", async () => {
    expect(await photoLieuEssai({ ...CTX, organizationId: "org_autre" }, "ChIJ")).toBeNull();
    for (const placeId of ["", "a/b", "../x", "a".repeat(257), "x?key=1"]) expect(await photoLieuEssai(CTX, placeId)).toBeNull();
    vi.stubEnv("DATA_ADAPTER", "mock");
    expect(await photoLieuEssai(CTX, "ChIJ")).toBeNull();
    expect(photo).not.toHaveBeenCalled();
  });

  it("service qui lève ou non branché : null", async () => {
    photo.mockRejectedValueOnce(new Error("panne"));
    expect(await photoLieuEssai(CTX, "ChIJ")).toBeNull();
    brancherPhotosEssai(undefined as never);
    expect(photosEssai()).toBeNull();
    expect(await photoLieuEssai(CTX, "ChIJ")).toBeNull();
  });
});
