import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DeckCard } from "@/components/ligne/DeckCard";
import type { Proposal, ProposalNeighbours } from "@/contracts";
import { propositions } from "@/mocks/edimbourg";

import { formatContexte } from "./contexte";

const STOPS = [
  { id: "j2-royal-mile", name: "[Royal Mile]" },
  { id: "j2-concert", name: "[Concert]" },
];

describe("formatContexte (B2, E2)", () => {
  it("interface: contexte d'une proposition composé depuis ses voisins", () => {
    const cas: [ProposalNeighbours, string | null][] = [
      [{ before: { type: "stop", stopId: "j2-royal-mile" }, after: { type: "meal", meal: "lunch" } }, "Entre [Royal Mile] et ton déjeuner"],
      [{ before: { type: "free" } }, "Après ton temps libre"],
      [{ after: { type: "meal", meal: "dinner" } }, "Avant ton dîner"],
      [{ before: { type: "terminus", role: "start" }, after: { type: "terminus", role: "end" } }, "Entre le départ du logement et le retour au logement"],
      [{}, null],
      // `stopId` introuvable dans le jour : voisin absent, rien n'est inventé.
      [{ before: { type: "stop", stopId: "inconnu" }, after: { type: "stop", stopId: "j2-concert" } }, "Avant [Concert]"],
      [{ before: { type: "stop", stopId: "inconnu" } }, null],
    ];
    for (const [neighbours, attendu] of cas) expect(formatContexte(neighbours, STOPS), JSON.stringify(neighbours)).toBe(attendu);

    // Rendu : la carte affiche le texte composé, et aucune ligne sans voisin.
    const proposal: Proposal = { ...propositions[3]!, neighbours: { before: { type: "stop", stopId: "j2-royal-mile" }, after: { type: "meal", meal: "lunch" } } };
    const noop = () => {};
    const { unmount } = render(
      <DeckCard proposal={proposal} context={formatContexte(proposal.neighbours, STOPS)} onLike={noop} onDislike={noop} onOpen={noop} />,
    );
    expect(screen.getByText("Entre [Royal Mile] et ton déjeuner")).toHaveAttribute("data-part", "contexte");
    unmount();
    const { container } = render(
      <DeckCard proposal={{ ...proposal, neighbours: {} }} context={formatContexte({}, STOPS)} onLike={noop} onDislike={noop} onOpen={noop} />,
    );
    expect(container.querySelector('[data-part="contexte"]')).toBeNull();
  });
});
