import { describe, expect, it } from "vitest";

import { TripSnapshotSchema, type StopSnapshot, type TripSnapshot } from "@/contracts";

import { choisirRemplacement, DemandeApercuSchema, DemandeApplicationSchema, identifiantRemplacement, type PropositionDuVoyage } from "./remplacement";

/**
 * Choix d'un remplacement (tâche M1g, PR 869), sans base : proposition compatible, refus, étape créée au créneau remplacé.
 * Noms entre crochets et `placeId` sentinelles (`test_place_…`) : aucune donnée Google.
 */

const etape = (id: string, kind: "activity" | "meal", start: string, extra: Partial<StopSnapshot> = {}): StopSnapshot => ({
  id,
  kind,
  placeId: `test_place_${id}`,
  name: `[Nom ${id}]`,
  start,
  facts: {},
  exceptions: [],
  locked: false,
  ...extra,
});

const INSTANTANE: TripSnapshot = TripSnapshotSchema.parse({
  days: [
    {
      index: 1,
      date: "2027-05-01",
      travelBudgetMinutes: 90,
      events: [],
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: etape("musee", "activity", "09:30", { end: "11:30" }) },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: etape("diner", "meal", "19:00", { end: "20:30", reason: "[Raison]" }) },
        { type: "stop", stop: etape("concert", "activity", "21:00", { locked: true }) },
        { type: "terminus", role: "end", time: "23:00", label: "[Hôtel]" },
      ],
    },
    { index: 2, date: "2027-05-02", travelBudgetMinutes: 90, events: [], items: [{ type: "stop", stop: etape("parc", "activity", "10:00") }] },
  ],
});

const proposition = (id: string, stop: StopSnapshot, day = 1): PropositionDuVoyage => ({ id, day, stop });
const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_C = "cccccccc-0000-4000-8000-000000000003";

const choisir = (stopId: string, propositions: readonly PropositionDuVoyage[], options: { etapesAFaire?: Set<string>; proposalId?: string } = {}) =>
  choisirRemplacement({ instantane: INSTANTANE, baseVersion: 1, stopId, propositions, etapesAFaire: options.etapesAFaire ?? new Set(), ...(options.proposalId ? { proposalId: options.proposalId } : {}) });

describe("remplacement : choix de la proposition (PR 869)", () => {
  const dejaLa = proposition(ID_A, etape("musee-bis", "meal", "19:00", { placeId: "test_place_musee" }));
  const activite = proposition(ID_B, etape("galerie", "activity", "15:00"));
  const repas = proposition(ID_C, etape("bistrot", "meal", "19:30", { end: "21:00", reason: "[Raison du bistrot]", exceptions: ["toReserve"] }));

  it("PR 869 : première proposition de même nature dont le lieu n'est pas au programme, au créneau remplacé", () => {
    const choix = choisir("diner", [dejaLa, activite, repas]);
    if (!choix.ok) throw new Error(choix.refus);
    expect(choix.proposition.id).toBe(ID_C);
    expect(choix.etape).toEqual({ ...repas.stop, id: identifiantRemplacement(1, ID_C), start: "19:00", end: "20:30", locked: false });
    // Seule la ligne de l'étape change ; l'instantané valide le contrat de stockage.
    const avant = INSTANTANE.days[0]!.items;
    const apres = choix.instantane.days[0]!.items;
    expect(apres.filter((_, i) => i !== 4)).toEqual(avant.filter((_, i) => i !== 4));
    expect(apres[4]).toEqual({ type: "stop", stop: choix.etape });
    expect(choix.instantane.days[1]).toEqual(INSTANTANE.days[1]);
    expect(() => TripSnapshotSchema.parse(choix.instantane)).not.toThrow();
  });

  it("PR 869 : sans `end` à l'étape remplacée, l'étape créée n'en a pas ; jamais verrouillée ni engagement", () => {
    const choix = choisir("parc", [activite]);
    if (!choix.ok) throw new Error(choix.refus);
    expect(choix.etape.end).toBeUndefined();
    expect(choix.etape.start).toBe("10:00");
    expect(choix.etape.locked).toBe(false);
    expect(choix.etape.commitment).toBeUndefined();
  });

  it("PR 869 : la proposition de l'aperçu est revérifiée à l'application (même identifiant, toujours compatible)", () => {
    expect(choisir("diner", [dejaLa, repas], { proposalId: ID_C }).ok).toBe(true);
    expect(choisir("diner", [dejaLa, repas], { proposalId: ID_A })).toEqual({ ok: false, refus: "no_option" });
    expect(choisir("diner", [dejaLa, repas], { proposalId: ID_B })).toEqual({ ok: false, refus: "no_option" });
  });

  it("PR 869 : refus : étape inconnue, verrouillée, engagement, désignée par « À faire », aucune proposition compatible", () => {
    expect(choisir("inconnue", [repas])).toEqual({ ok: false, refus: "unknown_stop" });
    expect(choisir("concert", [activite])).toEqual({ ok: false, refus: "locked_stop" });
    expect(choisir("diner", [repas], { etapesAFaire: new Set(["diner"]) })).toEqual({ ok: false, refus: "no_option" });
    expect(choisir("diner", [dejaLa, activite])).toEqual({ ok: false, refus: "no_option" });
    const engagement = TripSnapshotSchema.parse({
      days: [{ ...INSTANTANE.days[0], items: [{ type: "stop", stop: etape("billet", "activity", "10:00", { commitment: "ticket" }) }] }],
    });
    expect(choisirRemplacement({ instantane: engagement, baseVersion: 1, stopId: "billet", propositions: [activite], etapesAFaire: new Set() })).toEqual({ ok: false, refus: "no_option" });
  });

  it("PR 869 : identifiant de l'étape créée fixé par la version de base et la proposition", () => {
    expect(identifiantRemplacement(1, ID_C)).toBe("remplacement-v2-cccccccc");
    expect(identifiantRemplacement(4, ID_C)).toBe("remplacement-v5-cccccccc");
  });

  it("PR 869 : entrées strictes : un champ d'organisation est refusé, le souhait est borné", () => {
    const base = { tripId: "t", stopId: "diner", reason: "notMyStyle", baseVersion: 1 };
    expect(DemandeApercuSchema.safeParse(base).success).toBe(true);
    expect(DemandeApercuSchema.safeParse({ ...base, organizationId: ID_A }).success).toBe(false);
    expect(DemandeApercuSchema.safeParse({ ...base, wish: "x".repeat(201) }).success).toBe(false);
    expect(DemandeApplicationSchema.safeParse({ tripId: "t", requestId: ID_A, stopId: "diner", proposalId: "pas-un-uuid", baseVersion: 1 }).success).toBe(false);
  });
});
