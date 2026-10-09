import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Proposal } from "@/contracts";
import { propositions } from "@/mocks/edimbourg";

import { axeViolations } from "../../../tests/unit/axe";

import { DeckCard, deckCardTag } from "./DeckCard";

const byId = (id: string) => propositions.find((p) => p.id === id)!;
const chateau = byId("prop-j1-chateau");
const diner1 = byId("prop-j1-diner-1");
const deanVillage = byId("prop-j2-dean-village");
const distillerie = byId("prop-j5-distillerie");

function renderCard(proposal: Proposal, isLastOption = false) {
  const handlers = { onLike: vi.fn(), onDislike: vi.fn(), onOpen: vi.fn() };
  const view = render(<DeckCard proposal={proposal} isLastOption={isLastOption} {...handlers} />);
  const card = screen.getByRole("button", { name: `Voir le détail de ${proposal.stop.name}` });
  return { ...view, ...handlers, card };
}

describe("DeckCard", () => {
  it("DeckCard: contenu", () => {
    const { card } = renderCard(chateau);
    expect(within(card).getByText("J1")).toBeInTheDocument();
    expect(within(card).getByText("vers 14:00")).toBeInTheDocument();
    expect(within(card).getByText(chateau.stop.name)).toBeInTheDocument();
    expect(within(card).getByText(chateau.stop.meta)).toBeInTheDocument();
    expect(within(card).getByText(chateau.context)).toBeInTheDocument();
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
    for (const part of ["J5", "vers 13:30", distillerie.stop.meta, distillerie.context, "Bus, environ 50 min (estimation)", distillerie.detour!, distillerie.stop.reason!, "À confirmer"]) {
      expect(description).toContain(part);
    }
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
