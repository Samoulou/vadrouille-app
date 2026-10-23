import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chargerPhoto, DUREE_MEMOIRE_MS, lirePhoto, oublierPhotos, usePhotoLieu } from "./photo";

/** Décision 0128 : photo d'une carte du tri demandée à l'affichage, sans stockage ni cache HTTP. */

// L'action réelle n'est jamais appelée : chaque test injecte sa demande.
vi.mock("@/server/actions/photo-essai", () => ({
  photoDuLieuEssai: () => {
    throw new Error("action réelle interdite dans les tests");
  },
}));

const PHOTO = { url: "https://lh3.googleusercontent.com/x", authors: [{ name: "Ana", profileUrl: "https://maps.google.com/c/1" }], mapsUrl: "https://www.google.com/maps/p" };

afterEach(() => {
  oublierPhotos();
});

describe("photos du tri : demande à l'affichage (décision 0128)", () => {
  it("forme contrôlée : non https, auteur sans nom ou réponse vide → null ; liens non https écartés", () => {
    expect(lirePhoto({ photo: PHOTO })).toEqual(PHOTO);
    expect(lirePhoto({ photo: null })).toBeNull();
    expect(lirePhoto(null)).toBeNull();
    expect(lirePhoto({ photo: { ...PHOTO, url: "http://lh3.googleusercontent.com/x" } })).toBeNull();
    expect(lirePhoto({ photo: { ...PHOTO, authors: [{ name: " " }] } })).toBeNull();
    expect(lirePhoto({ photo: { url: PHOTO.url, authors: [{ name: "Ana", profileUrl: "javascript:alert(1)" }], mapsUrl: "http://x" } })).toEqual({
      url: PHOTO.url,
      authors: [{ name: "Ana" }],
    });
  });

  it("une seule demande par lieu tant qu'elle est récente ; nouvelle demande après 5 minutes", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    expect(await chargerPhoto("p", 0, demande)).toEqual(PHOTO);
    expect(await chargerPhoto("p", DUREE_MEMOIRE_MS - 1, demande)).toEqual(PHOTO);
    expect(demande).toHaveBeenCalledTimes(1);
    expect(demande).toHaveBeenCalledWith("p");
    await chargerPhoto("p", DUREE_MEMOIRE_MS, demande);
    expect(demande).toHaveBeenCalledTimes(2);
  });

  it("action qui lève : null, sans levée", async () => {
    expect(await chargerPhoto("a", 0, vi.fn(async () => Promise.reject(new Error("réseau"))))).toBeNull();
  });

  it("hook : inactif (hors prototype) ou sans placeId, aucune demande ; actif, la photo arrive ; carte suivante sans lieu : rien", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    const inactif = renderHook(() => usePhotoLieu("p", false, demande));
    const sansLieu = renderHook(() => usePhotoLieu(undefined, true, demande));
    expect(inactif.result.current).toBeNull();
    expect(sansLieu.result.current).toBeNull();
    expect(demande).not.toHaveBeenCalled();
    const actif = renderHook(({ lieu }) => usePhotoLieu(lieu, true, demande), { initialProps: { lieu: "p" as string | undefined } });
    await waitFor(() => expect(actif.result.current).toEqual(PHOTO));
    act(() => actif.rerender({ lieu: undefined }));
    expect(actif.result.current).toBeNull();
  });
});
