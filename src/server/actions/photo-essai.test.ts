// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { photoDuLieuEssai } from "./photo-essai";

/**
 * Action de la photo d'une carte du tri (décision 0128 ; PR 879 pour `api`) : fermée hors des adaptateurs `prototype` et
 * `api`, entrée revalidée (stricte), contexte de la requête. Adaptateur simulé : aucune base, aucun cookie, aucun appel
 * Google.
 */

const CARTE = { tripId: "proto_lisbonne_1", proposalId: "p1" };
const PHOTO = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana" }] };
const d = vi.hoisted(() => ({
  chemin: "prototype" as "prototype" | "api" | null,
  photoApi: vi.fn(),
  contexte: { organizationId: "org_prototype", userId: "user_prototype", role: "owner" } as unknown,
  photo: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  cheminPhotosDuTri: () => d.chemin,
  photoLieuEssai: (...args: unknown[]) => d.photo(...args),
  photoLieuApi: (...args: unknown[]) => d.photoApi(...args),
}));
vi.mock("@/features/compte/session", () => ({
  contexteFacultatif: async () => d.contexte,
}));

beforeEach(() => {
  vi.clearAllMocks();
  d.chemin = "prototype";
  d.contexte = { organizationId: "org_prototype", userId: "user_prototype", role: "owner" };
  d.photo.mockResolvedValue(PHOTO);
  d.photoApi.mockResolvedValue(PHOTO);
});

describe("photoDuLieuEssai", () => {
  it("chemin nominal : contexte de la requête et identifiant transmis, photo rendue", async () => {
    expect(await photoDuLieuEssai({ tripId: "proto_lisbonne_1", proposalId: "p1" })).toEqual({ photo: PHOTO });
    expect(d.photo).toHaveBeenCalledWith(d.contexte, { tripId: "proto_lisbonne_1", proposalId: "p1" });
  });

  it("hors adaptateur prototype, entrée refusée, sans session, adaptateur qui lève : photo nulle, sans appel", async () => {
    d.chemin = null;
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
    d.chemin = "prototype";
    for (const entree of [
      null,
      "ChIJ",
      {},
      { placeId: "ChIJ" },
      { ...CARTE, placeId: "ChIJ" },
      { tripId: "a/b", proposalId: "p1" },
      { tripId: "t".repeat(65), proposalId: "p1" },
      { tripId: "t1", proposalId: "" },
      { tripId: "t1", proposalId: "p".repeat(129) },
      { tripId: "t1" },
    ]) {
      expect(await photoDuLieuEssai(entree)).toEqual({ photo: null });
    }
    d.contexte = null;
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
    expect(d.photo).not.toHaveBeenCalled();
    d.contexte = { organizationId: "org_prototype", userId: "u", role: "owner" };
    d.photo.mockRejectedValueOnce(new Error("panne"));
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
  });

  it("PR 879, adaptateur api : contexte de la session et carte transmis à photoLieuApi, jamais un identifiant de lieu", async () => {
    d.chemin = "api";
    d.contexte = { organizationId: "org_a", userId: "user_a", role: "owner" };
    const carte = { tripId: "0b6f2c1e-8a2d-4c1b-9d2e-3f4a5b6c7d8e", proposalId: "p1" };
    expect(await photoDuLieuEssai(carte)).toEqual({ photo: PHOTO });
    expect(d.photoApi).toHaveBeenCalledWith(d.contexte, carte);
    expect(d.photo).not.toHaveBeenCalled();
  });

  it("PR 879, adaptateur api : identifiant de lieu dans l'entrée, entrée mal formée, sans session ou panne : photo nulle", async () => {
    d.chemin = "api";
    for (const entree of [{ ...CARTE, placeId: "ChIJ" }, { placeId: "ChIJ" }, { tripId: "a/b", proposalId: "p1" }, null]) {
      expect(await photoDuLieuEssai(entree)).toEqual({ photo: null });
    }
    d.contexte = null;
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
    expect(d.photoApi).not.toHaveBeenCalled();
    d.contexte = { organizationId: "org_a", userId: "user_a", role: "owner" };
    d.photoApi.mockRejectedValueOnce(new Error("panne"));
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
  });
});
