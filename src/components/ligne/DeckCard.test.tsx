import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Proposal } from "@/contracts";
import { propositions } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import type { PlacePhoto } from "@/contracts/photo";

import { CreditPhoto, DeckCard, deckCardTag } from "./DeckCard";

const byId = (id: string) => propositions.find((p) => p.id === id)!;
const chateau = byId("prop-j1-chateau");
const diner1 = byId("prop-j1-diner-1");
const deanVillage = byId("prop-j2-dean-village");
const distillerie = byId("prop-j5-distillerie");

/** Contexte composé par l'écran (B2, E2) : la carte l'affiche tel quel. */
const CONTEXTE = "Entre ton déjeuner et ton temps libre";

function renderCard(proposal: Proposal, isLastOption = false, context: string | null = CONTEXTE) {
  const handlers = { onLike: vi.fn(), onDislike: vi.fn(), onOpen: vi.fn() };
  const view = render(<DeckCard proposal={proposal} context={context} isLastOption={isLastOption} {...handlers} />);
  const card = screen.getByRole("button", { name: `Voir le détail de ${proposal.stop.name}` });
  return { ...view, ...handlers, card };
}

describe("DeckCard", () => {
  it("DeckCard: contenu", () => {
    const { card } = renderCard(chateau);
    expect(within(card).getByText("J1")).toBeInTheDocument();
    expect(within(card).getByText("vers 14:00")).toBeInTheDocument();
    expect(within(card).getByText(chateau.stop.name)).toBeInTheDocument();
    expect(within(card).getByText("[Old Town], 2 h")).toBeInTheDocument();
    expect(within(card).getByText(CONTEXTE)).toBeInTheDocument();
    expect(within(card).getByText(chateau.stop.reason!)).toBeInTheDocument();
    expect(within(card).getByText("À réserver")).toBeInTheDocument();
  });

  it("DeckCard: un seul tag, par priorité Non confirmé, À confirmer, À réserver", () => {
    expect(deckCardTag(["toReserve", "toConfirm"])).toBe("toConfirm");
    expect(deckCardTag(["toReserve", "unconfirmed"])).toBe("unconfirmed");
    expect(deckCardTag(["toConfirm", "unconfirmed"])).toBe("unconfirmed");
    expect(deckCardTag(["toReserve"])).toBe("toReserve");
    expect(deckCardTag([])).toBeUndefined();
    const { card } = renderCard(distillerie);
    expect(card.querySelectorAll("[data-kind='toConfirm'], [data-kind='toReserve'], [data-kind='unconfirmed']")).toHaveLength(1);
    expect(within(card).getByText("À confirmer")).toBeInTheDocument();
    expect(within(card).queryByText("À réserver")).toBeNull();
  });

  it("DeckCard: aucune photo affichée, même avec un photoUrl", () => {
    const { container, card } = renderCard({ ...chateau, photoUrl: "https://example.org/photo.jpg" });
    expect(container.querySelector("img")).toBeNull();
    expect(container.innerHTML).not.toContain("example.org/photo.jpg");
    expect(within(card).getByText("Photo du lieu")).toBeInTheDocument();
  });

  // Décision 0128 : photo du lieu (voyage d'essai), chargée à la demande par l'écran et passée à la carte.
  const PHOTO: PlacePhoto = {
    url: "https://lh3.googleusercontent.com/place-photos/test",
    authors: [{ name: "Ana", profileUrl: "https://maps.google.com/maps/contrib/1" }, { name: "Luís" }],
    mapsUrl: "https://www.google.com/maps/photo",
  };

  it("DeckCard: photo décorative (alt vide, F13) dans la même boîte, crédit « Google Maps · Photo : auteurs » en description, aucun lien", async () => {
    const handlers = { onLike: vi.fn(), onDislike: vi.fn(), onOpen: vi.fn() };
    const { container } = render(<DeckCard proposal={chateau} context={CONTEXTE} photo={PHOTO} {...handlers} />);
    const card = screen.getByRole("button", { name: `Voir le détail de ${chateau.stop.name}` });
    const image = card.querySelector("img")!;
    expect(image).toHaveAttribute("src", PHOTO.url);
    // Le nom du lieu est le nom accessible de la carte : l'image ne le répète pas (mineur 13 de la revue du head `8232ddb`).
    expect(image).toHaveAttribute("alt", "");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveAttribute("referrerpolicy", "no-referrer");
    const credit = container.querySelector<HTMLElement>("[data-part=credit]")!;
    expect(credit.textContent).toBe("Google Maps · Photo\u00a0: Ana, Luís");
    expect(credit.querySelector("[translate=no]")?.textContent).toBe("Google Maps");
    // Au plus deux lignes, quel que soit le nombre d'auteurs (mineur 9).
    expect(credit.className).toContain("line-clamp-2");
    expect(card.getAttribute("aria-describedby")?.split(" ")).toContain(credit.id);
    expect(within(card).queryByText("Photo du lieu")).toBeNull();
    expect(card.querySelector("a")).toBeNull();
    // Même boîte que l'emplacement (hauteur fixe du jeton) : aucun saut de mise en page.
    expect(container.querySelector("[data-part=photo]")?.className).toContain("h-(--ligne-deck-photo)");
    expect(await axeViolations(container)).toEqual([]);
  });

  it("DeckCard: crédit sans auteur nommé : « Google Maps » seul", () => {
    const { container } = render(<CreditPhoto photo={{ url: PHOTO.url, authors: [] }} />);
    expect(container.textContent).toBe("Google Maps");
  });

  it("DeckCard: photo en attente : l'emplacement garde sa boîte, sans icône ni libellé (mineur 8) ; même hauteur avec et sans photo", () => {
    const handlers = { onLike: vi.fn(), onDislike: vi.fn(), onOpen: vi.fn() };
    const attente = render(<DeckCard proposal={chateau} photoEnAttente {...handlers} />);
    const emplacement = attente.container.querySelector("[data-part=emplacement-photo]")!;
    expect(emplacement.textContent).toBe("");
    expect(emplacement.querySelector("svg")).toBeNull();
    const boite = emplacement.className.split(" ").filter((c) => c.startsWith("h-") || c.startsWith("min-h-"));
    attente.unmount();
    const avec = render(<DeckCard proposal={chateau} photo={PHOTO} {...handlers} />);
    const photo = avec.container.querySelector("[data-part=photo]")!;
    expect(photo.className.split(" ").filter((c) => c.startsWith("h-") || c.startsWith("min-h-"))).toEqual(boite);
    avec.unmount();
    const sans = render(<DeckCard proposal={chateau} {...handlers} />);
    expect(sans.getByText("Photo du lieu")).toBeInTheDocument();
  });

  it("DeckCard: image en échec : l'emplacement « Photo du lieu » revient, sans message", () => {
    const handlers = { onLike: vi.fn(), onDislike: vi.fn(), onOpen: vi.fn() };
    const { container } = render(<DeckCard proposal={chateau} photo={PHOTO} {...handlers} />);
    fireEvent.error(container.querySelector("img")!);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("Photo du lieu")).toBeInTheDocument();
  });

  it("DeckCard: trajet sans durée (minutes: null, décisions 0092 et 0095 § 4) : ni trajet ni détour, ni dans le rendu ni dans aria-describedby", () => {
    const sansDuree: Proposal = { ...distillerie, travelFromPrevious: { ...distillerie.travelFromPrevious!, minutes: null } };
    const { container, card } = renderCard(sansDuree);
    expect(container.querySelector("[data-part='trajet']")).toBeNull();
    expect(container.textContent).not.toContain(distillerie.detour!);
    expect(container.textContent).not.toMatch(/durée à confirmer|\d+\s*min/);
    const ids = (card.getAttribute("aria-describedby") ?? "").split(/\s+/);
    expect(ids.some((id) => id.endsWith("-trajet") || id.endsWith("-detour"))).toBe(false);
  });

  it("DeckCard: trajet au-delà de 20 min (distillerie 50 min, pas Dean Village à 20 min)", () => {
    const far = renderCard(distillerie);
    const trajet = far.container.querySelector("[data-part='trajet']");
    expect(trajet).toHaveTextContent("Bus, environ 50 min (estimation)");
    expect(trajet).toHaveTextContent(distillerie.detour!);
    far.unmount();
    const near = renderCard(deanVillage);
    expect(near.container.querySelector("[data-part='trajet']")).toBeNull();
    expect(near.container).not.toHaveTextContent("20 min");
  });

  it("DeckCard: nom et description accessibles", () => {
    const { card } = renderCard(distillerie);
    expect(card).toHaveAccessibleName("Voir le détail de [Distillerie accessible en bus]");
    const description = card.getAttribute("aria-describedby")!
      .split(" ")
      .map((id) => document.getElementById(id)?.textContent)
      .join(" ");
    for (const part of ["J5", "vers 13:30", "[East Lothian], 1 h 30", CONTEXTE, "Bus, environ 50 min (estimation)", distillerie.detour!, distillerie.stop.reason!, "À confirmer"]) {
      expect(description).toContain(part);
    }
  });

  it("sans contexte ni faits : aucune ligne vide, rien dans la description", () => {
    const sansFaits = { ...chateau, stop: { ...chateau.stop, facts: {} } };
    const { card, container } = renderCard(sansFaits, false, null);
    expect(container.querySelector('[data-part="contexte"]')).toBeNull();
    expect(container.querySelector('[data-part="faits"]')).toBeNull();
    for (const id of card.getAttribute("aria-describedby")!.split(" ")) expect(document.getElementById(id)).not.toBeNull();
  });

  it("toucher, Entrée ou Espace ouvre le détail (bouton natif)", () => {
    const { card, onOpen } = renderCard(chateau);
    fireEvent.click(card);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(card.tagName).toBe("BUTTON");
  });

  it("boutons « Pas pour moi » et « J'aime » : nom égal au libellé visible, geste « button »", () => {
    const { onLike, onDislike } = renderCard(chateau);
    fireEvent.click(screen.getByRole("button", { name: "J'aime" }));
    fireEvent.click(screen.getByRole("button", { name: "Pas pour moi" }));
    expect(onLike).toHaveBeenCalledWith("button");
    expect(onDislike).toHaveBeenCalledWith("button");
  });

  it("repas : « Je choisis », « Option suivante » et « option 1 sur 2 » ; dernière option : « Pas pour moi »", () => {
    const first = renderCard(diner1);
    expect(screen.getByRole("button", { name: "Je choisis" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Option suivante" })).toBeInTheDocument();
    expect(first.card).toHaveTextContent("option 1 sur 2");
    first.unmount();
    renderCard(byId("prop-j1-diner-2"), true);
    expect(screen.getByRole("button", { name: "Pas pour moi" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Option suivante" })).toBeNull();
  });

  it("glisser vers la droite décide « J'aime » (geste swipe) sans ouvrir le détail ; un toucher ouvre le détail", () => {
    const { card, onLike, onOpen } = renderCard(chateau);
    fireEvent.pointerDown(card, { pointerId: 1, clientX: 100, button: 0, pointerType: "touch" });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 160, pointerType: "touch" });
    expect(card).toHaveAttribute("data-dragging", "true");
    expect(screen.getByText("J'aime", { selector: "[data-swipe-label]" })).toHaveAttribute("aria-hidden", "true");
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 220, pointerType: "touch" });
    fireEvent.click(card);
    expect(onLike).toHaveBeenCalledWith("swipe");
    expect(onOpen).not.toHaveBeenCalled();
  });

  it("glisser vers la gauche affiche « Pas pour moi » et décide le refus", () => {
    const { card, onDislike } = renderCard(chateau);
    fireEvent.pointerDown(card, { pointerId: 2, clientX: 200, button: 0, pointerType: "mouse" });
    fireEvent.pointerMove(card, { pointerId: 2, clientX: 150, pointerType: "mouse" });
    expect(card.querySelector("[data-swipe-label]")).toHaveTextContent("Pas pour moi");
    fireEvent.pointerUp(card, { pointerId: 2, clientX: 100, pointerType: "mouse" });
    expect(onDislike).toHaveBeenCalledWith("swipe");
  });

  it("aucune violation axe (activité et repas)", async () => {
    const { container, unmount } = renderCard(distillerie);
    expect(await axeViolations(container)).toEqual([]);
    unmount();
    const meal = renderCard(diner1);
    expect(await axeViolations(meal.container)).toEqual([]);
  });
});
