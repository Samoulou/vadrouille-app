import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { createPrototypeAdapter, type SourceProgrammes } from "@/adapters/prototype";
import { createMockTripAdapter } from "@/adapters/mock";
import { PROTOTYPE_ORG_ID, ProgrammeReduitSchema } from "@/prototype/programme-reduit";

import { joursADebloquer } from "@/features/sejour/SejourPanel";

import { axeViolations } from "../../../tests/unit/axe";

import { createLocalDeckActions } from "./actions";
import { DeckEnd } from "./DeckEnd";
import { loadPresentation } from "./load";

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

describe("essai: un seul prédicat, décidé par l'adaptateur (décision 0124 § 4)", () => {
  const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };
  const programme = (dossier: string, id: string) =>
    ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "prototype", dossier, `${id}.json`), "utf8")));
  const source = (...programmes: ReturnType<typeof programme>[]): SourceProgrammes => ({
    ids: async () => programmes.map((p) => p.trip.id),
    lire: async (id) => structuredClone(programmes.find((p) => p.trip.id === id) ?? null),
  });
  const relecteur = { async relireJournee(paires: readonly unknown[]) { return { ok: true as const, minutes: paires.map(() => 5) }; } };

  it("prototype : le programme d'essai est « essai », le programme de test (avec propositions) ne l'est pas", async () => {
    const essai = programme("programmes-essai", "proto_essai_20271010_1");
    const test = programme("programmes-test", "proto_test_20261012_1");
    const adapter = createPrototypeAdapter({ programmes: source(essai, test), relecteurs: { trajets: relecteur } });
    expect((await loadPresentation(adapter, ctx, essai.trip.id))?.essai).toBe(true);
    const deTest = await loadPresentation(adapter, ctx, test.trip.id);
    expect(deTest?.essai).toBe(false);
    expect(deTest?.proposals.length).toBe(test.proposals.length);
  });

  it("mock : jamais « essai » (méthode absente)", async () => {
    const adapter = createMockTripAdapter();
    const [premier] = await adapter.listTrips({ organizationId: "mock_org_personnelle", userId: "u", role: "owner" });
    const charge = await loadPresentation(adapter, { organizationId: "mock_org_personnelle", userId: "u", role: "owner" }, premier!.id);
    expect(charge?.essai).toBe(false);
    expect(charge?.revisable).toBe(false);
  });

  it("révisable (E2E-essai, lot 4 ; décision 0126) : voyage d'essai lancé depuis l'app seulement", async () => {
    const commite = programme("programmes-essai", "proto_essai_20271010_1");
    const deLApp = structuredClone(commite);
    deLApp.trip.id = "proto_essai_0123abcd45674890a123456789abcdef";
    const test = programme("programmes-test", "proto_test_20261012_1");
    const adapter = createPrototypeAdapter({ programmes: source(commite, deLApp, test), relecteurs: { trajets: relecteur } });
    expect(await loadPresentation(adapter, ctx, deLApp.trip.id)).toMatchObject({ essai: true, revisable: true });
    expect(await loadPresentation(adapter, ctx, commite.trip.id)).toMatchObject({ essai: true, revisable: false });
    expect(await loadPresentation(adapter, ctx, test.trip.id)).toMatchObject({ essai: false, revisable: false });
  });
});
