import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Proposal } from "@/contracts";
import type { PlacePhotoResponse } from "@/contracts/photo";
import { edimbourg, propositions } from "@/mocks/edimbourg";

import { presentationDay } from "./load";
import { oublierPhotos, type DemanderPhoto } from "./photo";
import { PresentationScreen, type PresentationScreenProps } from "./PresentationScreen";

/**
 * Câblage des photos du tri sur l'écran (décision 0128 ; bloquant 6 de la revue du head `8232ddb`) : demande injectée,
 * aucune action réelle. Aucune demande sans données de lieux Google, jamais la carte suivante en avance, une seule demande
 * partagée par la carte et sa feuille de détail.
 */

vi.mock("@/server/actions/p0-acces", () => ({ saisirCodeAccesP0: vi.fn() }));
vi.mock("@/server/actions/photo-essai", () => ({
  photoDuLieuEssai: () => {
    throw new Error("action réelle interdite dans les tests");
  },
}));

afterEach(() => {
  oublierPhotos();
});

const DAYS = edimbourg.days.map(presentationDay);
const TRIP = "proto_essai_1";
const PHOTO = { url: "https://lh3.googleusercontent.com/place-photos/ecran", authors: [{ name: "Ana" }] };

/** Paquet dont toutes les cartes ont un lieu (les propositions simulées n'en portent pas toutes). */
const AVEC_LIEU: Proposal[] = propositions.map((proposal, rang) => ({ ...proposal, stop: { ...proposal.stop, placeId: `ChIJ_ecran_${rang}` } }));

function setup(props: Partial<PresentationScreenProps> & { demanderPhoto: DemanderPhoto }) {
  return render(<PresentationScreen tripId={TRIP} unlocked={false} generatingDays={[]} proposals={AVEC_LIEU} days={DAYS} {...props} />);
}

const flush = () => act(async () => {});
const carte = () => document.querySelector<HTMLButtonElement>("[data-part='carte']")!;

describe("écran du tri : photos (décision 0128)", () => {
  it("sans données de lieux Google (placesFromGoogle faux) : aucune demande", async () => {
    const demanderPhoto = vi.fn<DemanderPhoto>(async () => ({ photo: PHOTO }));
    setup({ demanderPhoto });
    await flush();
    expect(demanderPhoto).not.toHaveBeenCalled();
    expect(carte().querySelector("img")).toBeNull();
  });

  it("carte affichée seulement : la suivante n'est jamais demandée en avance ; elle l'est quand elle s'affiche", async () => {
    const demanderPhoto = vi.fn<DemanderPhoto>(async () => ({ photo: PHOTO }));
    setup({ demanderPhoto, placesFromGoogle: true });
    await flush();
    expect(demanderPhoto.mock.calls).toEqual([[{ tripId: TRIP, proposalId: AVEC_LIEU[0]!.id }]]);
    expect(carte().querySelector("img")).toHaveAttribute("src", PHOTO.url);
    fireEvent.click(screen.getByRole("button", { name: "J'aime" }));
    await flush();
    expect(demanderPhoto.mock.calls).toEqual([[{ tripId: TRIP, proposalId: AVEC_LIEU[0]!.id }], [{ tripId: TRIP, proposalId: AVEC_LIEU[1]!.id }]]);
    expect(demanderPhoto.mock.calls.flat().some((carte) => carte.proposalId === AVEC_LIEU[2]!.id)).toBe(false);
  });

  it("carte sans lieu : aucune demande, emplacement « Photo du lieu »", async () => {
    const demanderPhoto = vi.fn<DemanderPhoto>(async () => ({ photo: PHOTO }));
    const { placeId: _lieu, ...sansLieu } = AVEC_LIEU[0]!.stop;
    void _lieu;
    setup({ demanderPhoto, placesFromGoogle: true, proposals: [{ ...AVEC_LIEU[0]!, stop: sansLieu }, ...AVEC_LIEU.slice(1)] });
    await flush();
    expect(demanderPhoto).not.toHaveBeenCalled();
    expect(carte()).toHaveTextContent("Photo du lieu");
  });

  it("une seule demande partagée par la carte et sa feuille de détail, photo affichée dans les deux dès l'ouverture", async () => {
    let repondre: (reponse: PlacePhotoResponse) => void = () => undefined;
    const demanderPhoto = vi.fn<DemanderPhoto>(() => new Promise((resolve) => (repondre = resolve)));
    setup({ demanderPhoto, placesFromGoogle: true });
    await flush();
    // En attente : l'emplacement reste, sans libellé.
    expect(carte()).not.toHaveTextContent("Photo du lieu");
    fireEvent.click(carte());
    const detail = await screen.findByRole("dialog");
    expect(detail.querySelector("[data-part=boite-photo]")).not.toBeNull();
    await act(async () => repondre({ photo: PHOTO }));
    expect(carte().querySelector("img")).toHaveAttribute("src", PHOTO.url);
    expect(detail.querySelector("figure img")).toHaveAttribute("src", PHOTO.url);
    expect(demanderPhoto).toHaveBeenCalledTimes(1);
  });
});
