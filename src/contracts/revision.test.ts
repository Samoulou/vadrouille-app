import { describe, expect, it } from "vitest";

import { edimbourg } from "@/mocks/edimbourg";

import { ReplacementDraftSchema, ReplacementOfferSchema, RevisionPreviewSchema, type Day, type Stop } from ".";

/**
 * Invariant des engagements d'un aperçu de révision (0016 § 4.2, 0015 § 9 ; précisé par la décision 0145 § 2, PR 869) :
 * ni l'étape visée ni une étape changée ne porte d'engagement ; une étape intacte du jour garde le sien.
 */

const DINER = "j1-diner";
const TATTOO = "j1-tattoo";
const NOUVELLE: Stop = {
  id: "remplacement-v2-abcdef12",
  kind: "meal",
  placeId: "mock_place_old_town_diner_2",
  name: "[Bistrot de Victoria Street]",
  start: "18:45",
  end: "20:15",
  facts: { area: "[Old Town]", durationMinutes: 90 },
  exceptions: ["toReserve"],
  locked: false,
};

/** Jour 1 d'Édimbourg, dîner remplacé ; `modifier` change une étape par identifiant. */
function jourUn(modifier: (stop: Stop) => Stop = (stop) => stop): Day {
  const jour = edimbourg.days.find((day) => day.index === 1)!;
  return {
    ...jour,
    items: jour.items.map((item) => {
      if (item.type !== "stop") return item;
      return { type: "stop" as const, stop: modifier(item.stop.id === DINER ? NOUVELLE : item.stop) };
    }),
  };
}

const apercu = (days: Day[], changedStopIds: string[], proposal: Stop = NOUVELLE) => ({
  kind: "replace" as const,
  id: "remplacement-1",
  baseVersion: 1,
  days,
  changes: [],
  changedStopIds,
  targetStopId: proposal.id,
  proposal,
  fromReserve: true,
});

describe("révision : engagements de l'aperçu (décision 0145 § 2, PR 869)", () => {
  it("PR 869 : accepté quand l'engagement est sur une étape intacte du jour", () => {
    const tattoo = jourUn().items.find((item) => item.type === "stop" && item.stop.id === TATTOO);
    expect(tattoo?.type === "stop" && tattoo.stop.commitment).toBe("ticket");
    expect(RevisionPreviewSchema.safeParse(apercu([jourUn()], [NOUVELLE.id])).success).toBe(true);
    const brouillon = { days: [jourUn()], changes: [], changedStopIds: [NOUVELLE.id], targetStopId: NOUVELLE.id, proposal: NOUVELLE, fromReserve: true };
    expect(ReplacementDraftSchema.safeParse(brouillon).success).toBe(true);
    expect(ReplacementOfferSchema.safeParse({ status: "offer", version: 1, candidateId: "3f0b7c1e-0000-4000-8000-000000000001", draft: brouillon }).success).toBe(true);
  });

  it("PR 869 : refusé quand l'étape visée porte un engagement", () => {
    const engagee: Stop = { ...NOUVELLE, commitment: "ticket" };
    const jour = jourUn((stop) => (stop.id === NOUVELLE.id ? engagee : stop));
    const resultat = RevisionPreviewSchema.safeParse(apercu([jour], [NOUVELLE.id], engagee));
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.map((issue) => issue.message).join()).toMatch(/commitment interdit/);
  });

  it("PR 869 : refusé quand une étape changée porte un engagement", () => {
    const resultat = RevisionPreviewSchema.safeParse(apercu([jourUn()], [NOUVELLE.id, TATTOO]));
    expect(resultat.success).toBe(false);
    expect(resultat.error?.issues.map((issue) => issue.message).join()).toMatch(/commitment interdit/);
  });
});
