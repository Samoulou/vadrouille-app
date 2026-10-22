import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { joursADebloquer } from "@/features/sejour/SejourPanel";

import { axeViolations } from "../../../tests/unit/axe";

import { createLocalDeckActions } from "./actions";
import { DeckEnd } from "./DeckEnd";

/** Spécification E2E-essai, lot 1 (D4) : tri en mémoire sans question, fin du tri, journées à débloquer. */

const dislike = (proposalId: string) => ({ proposalId, kind: "activity" as const, category: "heritage" as const, decision: "dislike" as const });

describe("essai: tri en mémoire d'un voyage d'essai", () => {
  it("aucune question de préférence, même après plusieurs refus de la même catégorie ; refus notés en mémoire", async () => {
    const actions = createLocalDeckActions({ questions: false });
    for (const id of ["a", "b", "c"]) expect((await actions.decide(dislike(id))).prompt).toBeNull();
    expect(actions.session().dislikes.map((d) => d.proposalId)).toEqual(["a", "b", "c"]);
    // Par défaut, la question reste posée (comportement de F6 inchangé).
    const parDefaut = createLocalDeckActions();
    await parDefaut.decide(dislike("a"));
    expect((await parDefaut.decide(dislike("b"))).prompt).toEqual({ kind: "category", category: "heritage" });
  });

  it("fin du tri : la phrase « choix sans effet » seulement quand elle est demandée", async () => {
    const { container, rerender } = render(<DeckEnd variant="apercu" tripId="t1" choixSansEffet />);
    expect(screen.getByText("Voyage d'essai : tes choix ne changent pas encore ton programme.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Débloquer" })).toHaveAttribute("href", "/voyages/t1/debloquer");
    expect(await axeViolations(container)).toEqual([]);
    rerender(<DeckEnd variant="suite" tripId="t1" choixSansEffet />);
    expect(screen.getByText("Voyage d'essai : tes choix ne changent pas encore ton programme.")).toBeInTheDocument();
    rerender(<DeckEnd variant="apercu" tripId="t1" />);
    expect(screen.queryByText(/Voyage d'essai/)).toBeNull();
  });
});

describe("essai: journées à débloquer du Séjour", () => {
  const voyage = { start: "2027-05-10", end: "2027-05-12", days: [{ date: "2027-05-10" }, { date: "2027-05-11" }] };

  it("dates du séjour absentes des journées servies, avec leur numéro ; rien pour un voyage débloqué", () => {
    expect(joursADebloquer({ ...voyage, unlocked: false })).toEqual([{ index: 3, date: "2027-05-12" }]);
    expect(joursADebloquer({ ...voyage, unlocked: true })).toEqual([]);
    expect(joursADebloquer({ ...voyage, unlocked: false, days: [...voyage.days, { date: "2027-05-12" }] })).toEqual([]);
    expect(joursADebloquer({ ...voyage, unlocked: false, end: "2027-05-01" })).toEqual([]);
  });
});
