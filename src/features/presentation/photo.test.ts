import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { chargerPhoto, DUREE_MEMOIRE_MS, lirePhoto, oublierPhotos, photosEnMemoire, usePhotoCarte } from "./photo";

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

const CARTE = { tripId: "proto_lisbonne_1", proposalId: "p1" };

describe("photos du tri : demande à l'affichage (décision 0128)", () => {
  it("forme contrôlée : hôte de l'image et des liens refait côté client (mineur 11) ; non https, auteur sans nom ou réponse vide → null", () => {
    expect(lirePhoto({ photo: PHOTO })).toEqual(PHOTO);
    expect(lirePhoto({ photo: null })).toBeNull();
    expect(lirePhoto(null)).toBeNull();
    expect(lirePhoto({ photo: { ...PHOTO, url: "http://lh3.googleusercontent.com/x" } })).toBeNull();
    for (const url of ["https://exemple.org/x.jpg", "https://googleusercontent.com.exemple.org/x", "https://u:p@lh3.googleusercontent.com/x", "https://lh3.googleusercontent.com:8443/x"]) {
      expect(lirePhoto({ photo: { ...PHOTO, url } }), url).toBeNull();
    }
    expect(lirePhoto({ photo: { ...PHOTO, authors: [{ name: " " }] } })).toBeNull();
    expect(lirePhoto({ photo: { url: PHOTO.url, authors: [{ name: "Ana", profileUrl: "javascript:alert(1)" }], mapsUrl: "http://x" } })).toEqual({
      url: PHOTO.url,
      authors: [{ name: "Ana" }],
    });
    expect(lirePhoto({ photo: { url: PHOTO.url, authors: [{ name: "Ana", profileUrl: "https://exemple.org/ana" }], mapsUrl: "https://maps.exemple.org/p" } })).toEqual({
      url: PHOTO.url,
      authors: [{ name: "Ana" }],
    });
  });

  it("demande par la carte (tripId, proposalId), jamais par un lieu ; une seule tant qu'elle est récente ; nouvelle après 5 minutes", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    expect(await chargerPhoto(CARTE, 0, demande)).toEqual(PHOTO);
    expect(await chargerPhoto(CARTE, DUREE_MEMOIRE_MS - 1, demande)).toEqual(PHOTO);
    expect(demande).toHaveBeenCalledTimes(1);
    expect(demande).toHaveBeenCalledWith({ tripId: "proto_lisbonne_1", proposalId: "p1" });
    await chargerPhoto(CARTE, DUREE_MEMOIRE_MS, demande);
    expect(demande).toHaveBeenCalledTimes(2);
    await chargerPhoto({ ...CARTE, proposalId: "p2" }, DUREE_MEMOIRE_MS, demande);
    expect(demande).toHaveBeenCalledTimes(3);
  });

  it("mémoire de la page supprimée au bout de 5 minutes, sans nouvelle demande (bloquant 4 de la revue du head `8232ddb`)", async () => {
    vi.useFakeTimers();
    try {
      const demande = vi.fn(async () => ({ photo: PHOTO }));
      await chargerPhoto(CARTE, Date.now(), demande);
      await chargerPhoto({ ...CARTE, proposalId: "p2" }, Date.now(), demande);
      expect(photosEnMemoire()).toBe(2);
      vi.advanceTimersByTime(DUREE_MEMOIRE_MS - 1);
      expect(photosEnMemoire()).toBe(2);
      vi.advanceTimersByTime(1);
      expect(photosEnMemoire()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("purge à chaque demande : une entrée expirée ne reste pas, même sans minuterie écoulée", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    await chargerPhoto(CARTE, 0, demande);
    await chargerPhoto({ ...CARTE, proposalId: "p2" }, DUREE_MEMOIRE_MS, demande);
    expect(photosEnMemoire()).toBe(1);
  });

  it("action qui lève : null, sans levée", async () => {
    expect(await chargerPhoto(CARTE, 0, vi.fn(async () => Promise.reject(new Error("réseau"))))).toBeNull();
  });

  it("hook : inactif (hors prototype), sans lieu ou sans carte, aucune demande ; actif, attente puis photo ; carte suivante sans lieu : rien", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    const inactif = renderHook(() => usePhotoCarte("t", { proposalId: "p1", avecLieu: true }, false, demande));
    const sansLieu = renderHook(() => usePhotoCarte("t", { proposalId: "p1", avecLieu: false }, true, demande));
    const sansCarte = renderHook(() => usePhotoCarte("t", null, true, demande));
    for (const rendu of [inactif, sansLieu, sansCarte]) expect(rendu.result.current).toEqual({ attente: false, photo: null });
    expect(demande).not.toHaveBeenCalled();
    const actif = renderHook(({ carte }) => usePhotoCarte("t", carte, true, demande), {
      initialProps: { carte: { proposalId: "p1", avecLieu: true } as { proposalId: string; avecLieu: boolean } | null },
    });
    expect(actif.result.current).toEqual({ attente: true, photo: null });
    await waitFor(() => expect(actif.result.current).toEqual({ attente: false, photo: PHOTO }));
    act(() => actif.rerender({ carte: { proposalId: "p2", avecLieu: false } }));
    expect(actif.result.current).toEqual({ attente: false, photo: null });
    expect(demande).toHaveBeenCalledTimes(1);
  });

  it("hook : réponse déjà arrivée pour la même carte rendue dès le premier rendu (détail ouvert après la carte)", async () => {
    const demande = vi.fn(async () => ({ photo: PHOTO }));
    await chargerPhoto({ tripId: "t", proposalId: "p1" }, Date.now(), demande);
    const detail = renderHook(() => usePhotoCarte("t", { proposalId: "p1", avecLieu: true }, true, demande));
    expect(detail.result.current).toEqual({ attente: false, photo: PHOTO });
    expect(demande).toHaveBeenCalledTimes(1);
  });
});
