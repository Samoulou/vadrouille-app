// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

import { photoDuLieuEssai } from "./photo-essai";

/**
 * Action de la photo d'une carte du tri d'un voyage d'essai (décision 0128) : fermée hors de l'adaptateur `prototype`,
 * entrée revalidée (stricte), contexte de la requête. Adaptateur simulé : aucune base, aucun cookie, aucun appel Google.
 */

const CARTE = { tripId: "proto_lisbonne_1", proposalId: "p1" };
const PHOTO = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana" }] };
const d = vi.hoisted(() => ({
  prototype: true,
  contexte: { organizationId: "org_prototype", userId: "user_prototype", role: "owner" } as unknown,
  photo: vi.fn(),
}));
vi.mock("@/adapters", () => ({
  isPrototypeAdapter: () => d.prototype,
  photoLieuEssai: (...args: unknown[]) => d.photo(...args),
}));
vi.mock("@/features/compte/session", () => ({
  contexteFacultatif: async () => d.contexte,
}));

beforeEach(() => {
  vi.clearAllMocks();
  d.prototype = true;
  d.contexte = { organizationId: "org_prototype", userId: "user_prototype", role: "owner" };
  d.photo.mockResolvedValue(PHOTO);
});

describe("photoDuLieuEssai", () => {
  it("chemin nominal : contexte de la requête et identifiant transmis, photo rendue", async () => {
    expect(await photoDuLieuEssai({ tripId: "proto_lisbonne_1", proposalId: "p1" })).toEqual({ photo: PHOTO });
    expect(d.photo).toHaveBeenCalledWith(d.contexte, { tripId: "proto_lisbonne_1", proposalId: "p1" });
  });

  it("hors adaptateur prototype, entrée refusée, sans session, adaptateur qui lève : photo nulle, sans appel", async () => {
    d.prototype = false;
    expect(await photoDuLieuEssai(CARTE)).toEqual({ photo: null });
    d.prototype = true;
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
});
