// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";
import type { z } from "zod";

import * as contracts from "./index";
import { TransferItemSchema } from "./trip";
import { MAX_CITIES } from "./values";
import {
  ChangeSchema,
  DaySchema,
  ProposalSchema,
  StopSchema,
  TripSchema,
  type Change,
  type ChecklistItem,
  type Day,
  type DayLineItem,
  type Exception,
  type Proposal,
  type Segment,
  type Source,
  type Stop,
  type Trip,
  type Weekday,
} from "./index";

// --- Forme du handover § 9, recopiée telle quelle (+ Trip.organizationId, + Proposal.category : décision 0013 ; + Day.surprise, + Stop.commitment, + DayLineItem openMeal : décision 0015 ; évolutions E1 à E4 et E9 de B2) ---
type HandoverWeekday = "lun." | "mar." | "mer." | "jeu." | "ven." | "sam." | "dim.";
type HandoverException = "toReserve" | "toConfirm" | "unconfirmed";
interface HandoverSource { label: string; url: string }
/** B2, E3 : faits structurés à la place du texte `meta`. */
/** `tip`, `priceNote`, `hoursNote` : ajouts signalés (décisions 0094 § 7 et 0116 § 6, lot 1 bis). */
interface HandoverStopFacts { durationMinutes?: number; costPerPerson?: number; area?: string; tip?: string; priceNote?: string; hoursNote?: string }
interface HandoverStop {
  id: string;
  kind: "activity" | "meal" | "event";
  placeId?: string;
  name: string;
  start: string;
  end?: string;
  facts: HandoverStopFacts;
  reason?: string;
  source?: HandoverSource;
  verifiedAt?: string;
  exceptions: HandoverException[];
  locked: boolean;
  /** Ajout signalé (décision 0015, § 9) : engagement saisi par la personne. */
  commitment?: "ticket" | "reservation";
  /** Ajout signalé (décision 0147 § 6.1, M5-C) : lieu à soi, écrit par l'opération `add`. */
  addedBy?: "person";
}
/** `minutes` et `Day.travelMinutes` : `null` pour un temps indisponible (prototype seulement, décision 0092 § 4). */
interface HandoverSegment { mode: "walk" | "transit" | "car"; minutes: number | null; estimated: boolean }
type HandoverDayLineItem =
  | { type: "terminus"; role: "start" | "end"; time: string; label: string }
  | { type: "stop"; stop: HandoverStop }
  | { type: "segment"; segment: HandoverSegment }
  | { type: "free"; from: string; to: string }
  /** Ajout signalé (décision 0015, § 2) : créneau de repas pas encore choisi. */
  | { type: "openMeal"; time: string; meal: "lunch" | "dinner" }
  /** Ajout signalé (décision 0148 § 1, M4-C) : changement de ville, sans identifiant ni donnée Google. */
  | {
      type: "transfer";
      from: string;
      to: string;
      source: "entered" | "estimated";
      start: string;
      end?: string;
      estimatedMinutes?: number;
      label?: string;
      mode?: "car" | "transit";
    };
interface HandoverDay {
  index: number;
  date: string;
  items: HandoverDayLineItem[];
  budgetPerPerson?: number;
  events: HandoverStop[];
  generating: boolean;
  travelMinutes: number | null;
  travelBudgetMinutes: number;
  /** Ajout signalé (décision 0015, § 3), comme Trip.organizationId. */
  surprise?: HandoverSurpriseIdea;
  /** Ajout signalé (décision 0116 § 6, lot 1 bis) : titre libre du jour. */
  theme?: string;
}
/** Ajout signalé (décision 0015, § 3) : idée « Surprends-moi », hors handover § 9. */
interface HandoverSurpriseIdea {
  id: string;
  placeId?: string;
  name: string;
  facts: HandoverStopFacts;
  reason: string;
  source: HandoverSource;
  verifiedAt?: string;
}
/** B2, E4 et E9 : moment structuré, étape concernée facultative. */
type HandoverChecklistMoment = { type: "deadline"; date: string } | { type: "beforeDeparture" } | { type: "tripDay"; day: number };
interface HandoverChecklistItem {
  id: string;
  /** Ajout signalé (décision 0147 § 6.2, M5-C) : sorte de la ligne, seule `reservation` est comptée. */
  kind: "reservation" | "ticket" | "other";
  label: string;
  when: HandoverChecklistMoment;
  done: boolean;
  bookingUrl?: string;
  sponsored: boolean;
  stopId?: string;
}
/** B2, E2 : voisins du créneau, sans texte. */
type HandoverProposalNeighbour =
  | { type: "stop"; stopId: string }
  | { type: "meal"; meal: "lunch" | "dinner" }
  | { type: "free" }
  | { type: "terminus"; role: "start" | "end" };
interface HandoverTrip {
  id: string;
  organizationId: string;
  destination: string;
  destinationColor: "bruyere" | "azulejo" | "ocre" | "granit";
  start: string; end: string;
  /** Ajout signalé (décision 0021 § 3, forme de F10-TL-1) : fuseau IANA de la destination. */
  timeZone: string;
  travellers: { adults: number; children: number };
  days: HandoverDay[];
  checklist: HandoverChecklistItem[];
  unlocked: boolean;
  /** Ajout signalé (décision 0148 § 6, M4-C) : villes du voyage, absent pour une seule ville. */
  cities?: { name: string; start: string; end: string }[];
}
interface HandoverProposal {
  id: string;
  kind: "activity" | "meal";
  day: number; time: string;
  neighbours: { before?: HandoverProposalNeighbour; after?: HandoverProposalNeighbour };
  stop: HandoverStop;
  /** Ajout signalé (décision 0013, § 3.1), comme Trip.organizationId. */
  // Trois codes ajoutés par F8a (F8-TL-8, décision 0017 § 8, qui amende 0013 § 3.1) pour les envies du brief.
  category: "museum" | "walk" | "nature" | "tasting" | "restaurant" | "heritage" | "market" | "nightlife";
  option?: { index: number; total: number };
  photoUrl?: string;
  travelFromPrevious?: HandoverSegment;
  detour?: string;
}
type HandoverChange =
  | { type: "replaced"; time: string; before: string; after: string }
  // Formes de la décision 0016 § 4.5 (F7a) : `added`, `moved` en jour et heure, `segment` nommé.
  | { type: "added"; time: string; label: string }
  | { type: "moved"; label: string; before: { day: number; time: string }; after: { day: number; time: string } }
  | { type: "segment"; label: string; before: number; after: number; estimated: boolean }
  | { type: "budget"; deltaPerPerson: number }
  | { type: "unchanged"; label: string; time: string }
  // Ajouts signalés (décision 0147 § 5.1, M5-C), à la fin de l'union.
  | { type: "removed"; label: string; before: { day: number; time: string } }
  | { type: "locked"; label: string; time: string }
  | { type: "unlocked"; label: string; time: string }
  | { type: "checklist"; action: "added" | "removed"; label: string };

const validStop: Stop = {
  id: "s1",
  kind: "activity",
  placeId: "mock_place",
  name: "[Lieu]",
  start: "10:45",
  end: "11:45",
  facts: {},
  exceptions: [],
  locked: false,
};

const validProposal: Proposal = {
  id: "p1",
  kind: "activity",
  day: 1,
  time: "10:45",
  neighbours: {},
  stop: validStop,
  category: "museum",
};

describe("types exportés", () => {
  it("sont égaux aux types inférés des schémas", () => {
    expectTypeOf<Weekday>().toEqualTypeOf<z.infer<typeof contracts.WeekdaySchema>>();
    expectTypeOf<Exception>().toEqualTypeOf<z.infer<typeof contracts.ExceptionSchema>>();
    expectTypeOf<Source>().toEqualTypeOf<z.infer<typeof contracts.SourceSchema>>();
    expectTypeOf<Stop>().toEqualTypeOf<z.infer<typeof StopSchema>>();
    expectTypeOf<Segment>().toEqualTypeOf<z.infer<typeof contracts.SegmentSchema>>();
    expectTypeOf<DayLineItem>().toEqualTypeOf<z.infer<typeof contracts.DayLineItemSchema>>();
    expectTypeOf<Day>().toEqualTypeOf<z.infer<typeof DaySchema>>();
    expectTypeOf<Trip>().toEqualTypeOf<z.infer<typeof TripSchema>>();
    expectTypeOf<ChecklistItem>().toEqualTypeOf<z.infer<typeof contracts.ChecklistItemSchema>>();
    expectTypeOf<Proposal>().toEqualTypeOf<z.infer<typeof ProposalSchema>>();
    expectTypeOf<Change>().toEqualTypeOf<z.infer<typeof ChangeSchema>>();
  });

  it("ont exactement les champs du handover § 9 (plus Trip.organizationId et Proposal.category)", () => {
    expectTypeOf<Weekday>().toEqualTypeOf<HandoverWeekday>();
    expectTypeOf<Exception>().toEqualTypeOf<HandoverException>();
    expectTypeOf<Source>().toEqualTypeOf<HandoverSource>();
    expectTypeOf<Stop>().toEqualTypeOf<HandoverStop>();
    expectTypeOf<Segment>().toEqualTypeOf<HandoverSegment>();
    expectTypeOf<DayLineItem>().toEqualTypeOf<HandoverDayLineItem>();
    expectTypeOf<Day>().toEqualTypeOf<HandoverDay>();
    expectTypeOf<ChecklistItem>().toEqualTypeOf<HandoverChecklistItem>();
    expectTypeOf<Trip>().toEqualTypeOf<HandoverTrip>();
    expectTypeOf<Proposal>().toEqualTypeOf<HandoverProposal>();
    expectTypeOf<Change>().toEqualTypeOf<HandoverChange>();
  });

  it("réexporte schémas et types depuis src/contracts", () => {
    for (const name of [
      "WeekdaySchema",
      "ExceptionSchema",
      "SourceSchema",
      "StopSchema",
      "SegmentSchema",
      "DayLineItemSchema",
      "DaySchema",
      "TripSchema",
      "ChecklistItemSchema",
      "ProposalSchema",
      "ChangeSchema",
      "CategorySchema",
      "PreferencePromptSchema",
      "PreferenceAnswerSchema",
      "PreferenceReasonSchema",
      "SurpriseIdeaSchema",
      "CommitmentSchema",
      "MealSchema",
    ]) {
      expect(contracts).toHaveProperty(name);
    }
  });
});

describe("SurpriseIdeaSchema (décision 0015, § 3)", () => {
  const idea = {
    id: "idee-1",
    name: "[Idée]",
    facts: {},
    reason: "[Tu as choisi les balades]",
    source: { label: "[Source]", url: "https://example.org/mock/idee" },
  };

  it("accepte une idée avec justification et source", () => {
    expect(contracts.SurpriseIdeaSchema.safeParse(idea).success).toBe(true);
    expect(contracts.SurpriseIdeaSchema.safeParse({ ...idea, placeId: "mock_place", verifiedAt: "2026-08-15" }).success).toBe(true);
  });

  it.each(["reason", "source"])("refuse une idée sans %s", (key) => {
    const without: Record<string, unknown> = { ...idea };
    delete without[key];
    expect(contracts.SurpriseIdeaSchema.safeParse(without).success).toBe(false);
  });

  it.each([
    ["start", "10:00"],
    ["locked", false],
    ["rating", 4.5],
    ["location", { lat: 55.95, lng: -3.19 }],
  ])("refuse le champ inconnu %s", (key, value) => {
    expect(contracts.SurpriseIdeaSchema.safeParse({ ...idea, [key]: value }).success).toBe(false);
  });

  it("est facultative sur Day", () => {
    expect(DaySchema.shape.surprise.safeParse(undefined).success).toBe(true);
  });
});

describe("StopSchema", () => {
  it("accepte une étape valide", () => {
    expect(StopSchema.safeParse(validStop).success).toBe(true);
  });

  it.each([
    ["rating", 4.6],
    ["openingHours", ["10:00-18:00"]],
    ["photos", ["https://example.org/photo.jpg"]],
    ["location", { lat: 55.95, lng: -3.19 }],
  ])("refuse le champ inconnu %s (contenu Google)", (key, value) => {
    expect(StopSchema.safeParse({ ...validStop, [key]: value }).success).toBe(false);
  });

  it("refuse 3 exceptions", () => {
    const stop = { ...validStop, exceptions: ["toReserve", "toConfirm", "unconfirmed"] };
    expect(StopSchema.safeParse(stop).success).toBe(false);
  });

  it("accepte 2 exceptions", () => {
    const stop = { ...validStop, exceptions: ["toReserve", "toConfirm"] };
    expect(StopSchema.safeParse(stop).success).toBe(true);
  });

  it("refuse l'exception « verified »", () => {
    expect(StopSchema.safeParse({ ...validStop, exceptions: ["verified"] }).success).toBe(false);
  });

  it.each(["9:5", "9:05", "24:00", "12:60", "1045", ""])("refuse l'heure %j", (start) => {
    expect(StopSchema.safeParse({ ...validStop, start }).success).toBe(false);
  });

  it.each(["00:00", "09:05", "23:59"])("accepte l'heure %j", (start) => {
    expect(StopSchema.safeParse({ ...validStop, start }).success).toBe(true);
  });

  it("refuse une date de vérification non ISO", () => {
    expect(StopSchema.safeParse({ ...validStop, verifiedAt: "30.08.2026" }).success).toBe(false);
    expect(StopSchema.safeParse({ ...validStop, verifiedAt: "2026-08-30" }).success).toBe(true);
  });

  it("refuse une source dont l'URL est invalide", () => {
    const stop = { ...validStop, source: { label: "[Source]", url: "pas une url" } };
    expect(StopSchema.safeParse(stop).success).toBe(false);
  });

  it("commitment (décision 0015 § 9) : facultatif, « ticket » ou « reservation », indépendant du verrou", () => {
    expect(StopSchema.safeParse({ ...validStop, commitment: "ticket", locked: true }).success).toBe(true);
    expect(StopSchema.safeParse({ ...validStop, commitment: "reservation", locked: false }).success).toBe(true);
    expect(StopSchema.safeParse({ ...validStop, commitment: "booking" }).success).toBe(false);
    expect(StopSchema.safeParse({ ...validStop, commitment: true }).success).toBe(false);
    expect(StopSchema.shape.commitment.safeParse(undefined).success).toBe(true);
  });
});

describe("DayLineItemSchema, variante openMeal (décision 0015 § 2)", () => {
  it.each(["lunch", "dinner"])("accepte un créneau %s pas encore choisi", (meal) => {
    expect(contracts.DayLineItemSchema.safeParse({ type: "openMeal", time: "12:30", meal }).success).toBe(true);
  });

  it.each([
    [{ type: "openMeal", time: "12:30", meal: "breakfast" }],
    [{ type: "openMeal", time: "12h30", meal: "lunch" }],
    [{ type: "openMeal", meal: "lunch" }],
    [{ type: "openMeal", time: "12:30", meal: "lunch", name: "[Restaurant]" }],
    [{ type: "openMeal", time: "12:30", meal: "lunch", placeId: "mock_place" }],
  ])("refuse %j (objet strict, sans lieu)", (item) => {
    expect(contracts.DayLineItemSchema.safeParse(item).success).toBe(false);
  });
});

describe("DaySchema", () => {
  const validDay: Day = {
    index: 1,
    date: "2026-08-29",
    items: [
      { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
      { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
      { type: "terminus", role: "end", time: "09:10", label: "[Hôtel]" },
    ],
    budgetPerPerson: 80,
    events: [],
    generating: false,
    travelMinutes: 10,
    travelBudgetMinutes: 90,
  };

  it("accepte un jour valide", () => {
    expect(DaySchema.safeParse(validDay).success).toBe(true);
  });

  it("refuse un budgetPerPerson en chaîne", () => {
    expect(DaySchema.safeParse({ ...validDay, budgetPerPerson: "80" }).success).toBe(false);
    expect(DaySchema.safeParse({ ...validDay, budgetPerPerson: "environ 35 CHF" }).success).toBe(
      false,
    );
  });

  it("refuse un budgetPerPerson négatif", () => {
    expect(DaySchema.safeParse({ ...validDay, budgetPerPerson: -1 }).success).toBe(false);
  });

  it.each(["travelMinutes", "travelBudgetMinutes"])("refuse %s négatif ou décimal", (key) => {
    expect(DaySchema.safeParse({ ...validDay, [key]: -5 }).success).toBe(false);
    expect(DaySchema.safeParse({ ...validDay, [key]: 12.5 }).success).toBe(false);
  });

  it("refuse un segment aux minutes négatives ou décimales", () => {
    for (const minutes of [-1, 2.5]) {
      const items = [{ type: "segment", segment: { mode: "walk", minutes, estimated: false } }];
      expect(DaySchema.safeParse({ ...validDay, items }).success).toBe(false);
    }
  });

  it("durée à confirmer (décision 0092 § 4) : Segment.minutes et Day.travelMinutes acceptent null ; refusent undefined, une chaîne, un négatif", () => {
    const avecMinutes = (minutes: unknown) => ({
      ...validDay,
      items: [validDay.items[0], { type: "segment", segment: { mode: "walk", minutes, estimated: false } }, validDay.items[2]],
    });
    expect(DaySchema.parse(avecMinutes(null)).items[1]).toEqual({ type: "segment", segment: { mode: "walk", minutes: null, estimated: false } });
    expect(DaySchema.parse({ ...validDay, travelMinutes: null }).travelMinutes).toBeNull();
    for (const invalide of [undefined, "20", -1]) {
      expect(DaySchema.safeParse(avecMinutes(invalide)).success, `minutes ${String(invalide)}`).toBe(false);
      expect(DaySchema.safeParse({ ...validDay, travelMinutes: invalide }).success, `travelMinutes ${String(invalide)}`).toBe(false);
    }
    // Clé absente : refusée (null se dit explicitement, jamais par omission).
    expect(DaySchema.safeParse({ ...validDay, items: [{ type: "segment", segment: { mode: "walk", estimated: false } }] }).success).toBe(false);
    expect(DaySchema.safeParse(Object.fromEntries(Object.entries(validDay).filter(([cle]) => cle !== "travelMinutes"))).success).toBe(false);
  });

  it("refuse une date non ISO", () => {
    expect(DaySchema.safeParse({ ...validDay, date: "29.08.2026" }).success).toBe(false);
    expect(DaySchema.safeParse({ ...validDay, date: "2026-02-30" }).success).toBe(false);
  });

  it("n'accepte que des étapes « event » dans events", () => {
    const event = { ...validStop, kind: "event" as const };
    expect(DaySchema.safeParse({ ...validDay, events: [event] }).success).toBe(true);
    expect(DaySchema.safeParse({ ...validDay, events: [validStop] }).success).toBe(false);
  });

  it("refuse un champ inconnu dans un élément de ligne", () => {
    const items = [{ type: "free", from: "10:00", to: "11:00", lat: 55.9 }];
    expect(DaySchema.safeParse({ ...validDay, items }).success).toBe(false);
  });
});

describe("ProposalSchema", () => {
  const bus25 = { mode: "transit", minutes: 25, estimated: false } as const;

  it("accepte une proposition sans trajet", () => {
    expect(ProposalSchema.safeParse(validProposal).success).toBe(true);
  });

  it("refuse une proposition à 25 min sans detour", () => {
    const proposal = { ...validProposal, travelFromPrevious: bus25 };
    expect(ProposalSchema.safeParse(proposal).success).toBe(false);
  });

  it("accepte une proposition à 25 min avec detour", () => {
    const proposal = {
      ...validProposal,
      travelFromPrevious: bus25,
      detour: "[À 25 min de ton hôtel en bus, sur ton chemin vers …]",
    };
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
  });

  it("refineDetour : trajet sans durée (minutes: null, décision 0092 § 4) accepté sans detour, jamais compté comme un détour", () => {
    const proposal = { ...validProposal, travelFromPrevious: { ...bus25, minutes: null } };
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
    expect(ProposalSchema.parse(proposal).travelFromPrevious?.minutes).toBeNull();
    expect(ProposalSchema.safeParse({ ...validProposal, travelFromPrevious: { ...bus25, minutes: "25" } }).success).toBe(false);
  });

  it("accepte 20 min pile sans detour", () => {
    const proposal = { ...validProposal, travelFromPrevious: { ...bus25, minutes: 20 } };
    expect(ProposalSchema.safeParse(proposal).success).toBe(true);
  });

  const meal = { ...validProposal, kind: "meal" as const, stop: { ...validStop, kind: "meal" as const } };

  it("refuse un repas avec option 4 sur 3", () => {
    expect(ProposalSchema.safeParse({ ...meal, option: { index: 4, total: 3 } }).success).toBe(false);
  });

  it.each([
    { index: 0, total: 3 },
    { index: 2, total: 4 },
    { index: 1.5, total: 3 },
    { index: 3, total: 2 },
  ])("refuse l'option %j", (option) => {
    expect(ProposalSchema.safeParse({ ...meal, option }).success).toBe(false);
  });

  it.each([
    { index: 1, total: 1 },
    { index: 1, total: 3 },
    { index: 3, total: 3 },
  ])("accepte l'option %j", (option) => {
    expect(ProposalSchema.safeParse({ ...meal, option }).success).toBe(true);
  });

  it("exige une catégorie du vocabulaire fermé (décision 0013)", () => {
    const withoutCategory: Partial<Proposal> = { ...validProposal };
    delete withoutCategory.category;
    expect(ProposalSchema.safeParse(withoutCategory).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...validProposal, category: "museums" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...validProposal, category: "restaurant" }).success).toBe(true);
  });

  it("refuse une proposition dont l'étape est un engagement (décision 0015 § 9)", () => {
    const committed = { ...validProposal, stop: { ...validStop, commitment: "ticket" as const } };
    const result = ProposalSchema.safeParse(committed);
    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path.join("."))).toContain("stop.commitment");
  });

  it("refuse une photoUrl invalide et un champ inconnu", () => {
    expect(ProposalSchema.safeParse({ ...validProposal, photoUrl: "photo" }).success).toBe(false);
    expect(ProposalSchema.safeParse({ ...validProposal, rating: 5 }).success).toBe(false);
  });
});

describe("TripSchema, ChecklistItem et Change", () => {
  const validTrip: Trip = {
    id: "t1",
    organizationId: "org1",
    destination: "[Ville]",
    destinationColor: "granit",
    start: "2026-08-29",
    end: "2026-09-03",
    timeZone: "Europe/London",
    travellers: { adults: 2, children: 0 },
    days: [],
    checklist: [
      { id: "c1", kind: "ticket", label: "[Billet]", when: { type: "beforeDeparture" }, done: false, sponsored: false },
    ],
    unlocked: false,
  };

  it("accepte un voyage valide", () => {
    expect(TripSchema.safeParse(validTrip).success).toBe(true);
  });

  it("exige organizationId", () => {
    const withoutOrganization: Partial<Trip> = { ...validTrip };
    delete withoutOrganization.organizationId;
    expect(TripSchema.safeParse(withoutOrganization).success).toBe(false);
  });

  it("exige un fuseau horaire IANA, alias compris (décision 0021 § 3, F10-TL-1)", () => {
    const withoutTimeZone: Partial<Trip> = { ...validTrip };
    delete withoutTimeZone.timeZone;
    expect(TripSchema.safeParse(withoutTimeZone).success).toBe(false);
    expect(TripSchema.safeParse({ ...validTrip, timeZone: "" }).success).toBe(false);
    expect(TripSchema.safeParse({ ...validTrip, timeZone: "Europe/Nulle-Part" }).success).toBe(false);
    for (const timeZone of ["Europe/Lisbon", "Asia/Kolkata", "UTC"]) {
      expect(TripSchema.safeParse({ ...validTrip, timeZone }).success, timeZone).toBe(true);
    }
  });

  it("refuse une bookingUrl invalide", () => {
    const checklist = [{ ...validTrip.checklist[0], bookingUrl: "réserver" }];
    expect(TripSchema.safeParse({ ...validTrip, checklist }).success).toBe(false);
  });

  it("refuse une couleur de destination hors palette", () => {
    expect(TripSchema.safeParse({ ...validTrip, destinationColor: "rouge" }).success).toBe(false);
  });

  it("valide les variantes de Change", () => {
    const changes: Change[] = [
      { type: "replaced", time: "10:45", before: "[A]", after: "[B]" },
      { type: "added", time: "15:15", label: "[C]" },
      { type: "moved", label: "[A]", before: { day: 2, time: "13:25" }, after: { day: 4, time: "15:45" } },
      { type: "segment", label: "[B]", before: 10, after: 25, estimated: true },
      { type: "budget", deltaPerPerson: -12 },
      { type: "unchanged", label: "[Dîner]", time: "19:00" },
    ];
    expect(ChangeSchema.array().safeParse(changes).success).toBe(true);
    expect(ChangeSchema.safeParse({ type: "budget", deltaPerPerson: "12 CHF" }).success).toBe(
      false,
    );
    // Décision 0016 § 4.5 : plus de texte composé pour `moved`, `segment` sans nom refusé, jour ≥ 1.
    expect(ChangeSchema.safeParse({ type: "moved", label: "[A]", before: "[J2]", after: "[J3]" }).success).toBe(false);
    expect(ChangeSchema.safeParse({ type: "segment", before: 10, after: 25, estimated: true }).success).toBe(false);
    expect(
      ChangeSchema.safeParse({ type: "moved", label: "[A]", before: { day: 0, time: "13:25" }, after: { day: 4, time: "15:45" } }).success,
    ).toBe(false);
  });
});

describe("DayLineItemSchema, variante transfer (décision 0148 § 1)", () => {
  const saisi = { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "12:00", end: "13:40", label: "[Train Rome–Florence]" };
  const estime = { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "11:30", estimatedMinutes: 180, mode: "transit" };

  it("est exportée par trip.ts (comme les autres variantes) et reprise par DayLineItemSchema", () => {
    expect(TransferItemSchema.safeParse(saisi).success).toBe(true);
    expect(contracts.DayLineItemSchema.options).toContain(TransferItemSchema);
  });

  it.each([
    ["saisi, départ et arrivée", saisi],
    ["saisi sans arrivée (« à confirmer »)", { ...saisi, end: undefined }],
    ["estimé, durée et mode", estime],
    ["estimé sans durée (« durée à confirmer ») ni mode (marche seule)", { type: "transfer", from: "Lisbonne", to: "Porto", source: "estimated", start: "09:00" }],
  ])("accepte un transfer %s", (_nom, item) => {
    expect(contracts.DayLineItemSchema.safeParse(item).success).toBe(true);
  });

  it.each([
    ["saisi sans label", { ...saisi, label: undefined }],
    ["saisi avec estimatedMinutes", { ...saisi, estimatedMinutes: 100 }],
    ["saisi avec mode", { ...saisi, mode: "transit" }],
    ["estimé avec end", { ...estime, end: "14:30" }],
    ["estimé avec label", { ...estime, label: "[Train]" }],
    ["end égal à start", { ...saisi, end: "12:00" }],
    ["end antérieur à start", { ...saisi, end: "11:00" }],
    ["source inconnue", { ...estime, source: "google" }],
    ["mode walk", { ...estime, mode: "walk" }],
    ["durée négative", { ...estime, estimatedMinutes: -5 }],
    ["durée non entière", { ...estime, estimatedMinutes: 90.5 }],
    ["heure invalide", { ...estime, start: "11h30" }],
    ["ville vide", { ...estime, to: "" }],
    ["sans from", { ...estime, from: undefined }],
  ])("refuse un transfer %s", (_nom, item) => {
    expect(contracts.DayLineItemSchema.safeParse(item).success).toBe(false);
  });

  it.each([
    ["placeId", "mock_place"],
    ["id", "transfer-1"],
    ["location", { lat: 41.9, lng: 12.5 }],
    ["displayName", "Roma Termini"],
    ["minutes", 95],
  ])("refuse le champ %s (objet strict : aucun identifiant, aucune donnée Google)", (key, value) => {
    expect(contracts.DayLineItemSchema.safeParse({ ...estime, [key]: value }).success).toBe(false);
  });

  it("est admis dans la ligne d'un jour", () => {
    const day = {
      index: 3,
      date: "2027-04-12",
      items: [{ type: "terminus", role: "start", time: "08:30", label: "[Hôtel]" }, saisi, { type: "terminus", role: "end", time: "16:40", label: "[Hôtel 2]" }],
      events: [],
      generating: false,
      travelMinutes: 0,
      travelBudgetMinutes: 90,
    };
    expect(DaySchema.safeParse(day).success).toBe(true);
  });
});

describe("Trip.cities (décision 0148 § 6)", () => {
  const base: Trip = {
    id: "t1",
    organizationId: "org1",
    destination: "Rome",
    destinationColor: "ocre",
    start: "2027-04-10",
    end: "2027-04-14",
    timeZone: "Europe/Rome",
    travellers: { adults: 2, children: 0 },
    days: [],
    checklist: [],
    unlocked: false,
  };
  const ville = (name: string, start: string, end: string) => ({ name, start, end });

  it("plusieurs-villes: Trip.cities absent pour une ville (facultatif)", () => {
    expect(TripSchema.safeParse(base).success).toBe(true);
    expect(TripSchema.shape.cities.safeParse(undefined).success).toBe(true);
  });

  it(`de 2 à MAX_CITIES (${MAX_CITIES}) villes`, () => {
    const villes = [ville("Rome", "2027-04-10", "2027-04-12"), ville("Florence", "2027-04-12", "2027-04-13"), ville("Venise", "2027-04-13", "2027-04-14"), ville("Milan", "2027-04-14", "2027-04-15")];
    expect(TripSchema.safeParse({ ...base, cities: villes.slice(0, 2) }).success).toBe(true);
    expect(TripSchema.safeParse({ ...base, cities: villes.slice(0, MAX_CITIES) }).success).toBe(true);
    expect(TripSchema.safeParse({ ...base, cities: villes.slice(0, MAX_CITIES + 1) }).success).toBe(false);
    expect(TripSchema.safeParse({ ...base, cities: villes.slice(0, 1) }).success).toBe(false);
    expect(TripSchema.safeParse({ ...base, cities: [] }).success).toBe(false);
  });

  it.each([
    ["nom vide", { name: "", start: "2027-04-10", end: "2027-04-12" }],
    ["date non ISO", { name: "Rome", start: "10.04.2027", end: "2027-04-12" }],
    ["sans end", { name: "Rome", start: "2027-04-10" }],
    ["placeId", { name: "Rome", start: "2027-04-10", end: "2027-04-12", placeId: "mock_place" }],
  ])("refuse une ville %s", (_nom, premiere) => {
    expect(TripSchema.safeParse({ ...base, cities: [premiere, ville("Florence", "2027-04-12", "2027-04-14")] }).success).toBe(false);
  });
});
