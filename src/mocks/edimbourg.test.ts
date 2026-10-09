// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  DETOUR_THRESHOLD_MINUTES,
  ProposalSchema,
  TripSchema,
  type Day,
  type Proposal,
  type Stop,
  type Weekday,
} from "@/contracts";

import {
  EDIMBOURG_DEBLOQUE_TRIP_ID,
  edimbourg,
  edimbourgDebloque,
  propositions,
  propositionsDebloque,
} from "./edimbourg";

const WEEKDAYS: Weekday[] = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
};

const stopsOf = (day: Day): Stop[] =>
  day.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));

const allStops = (): Stop[] => edimbourg.days.flatMap((day) => [...stopsOf(day), ...day.events]);

describe("jeu Édimbourg : validation", () => {
  it("TripSchema.parse(edimbourg) réussit", () => {
    expect(() => TripSchema.parse(edimbourg)).not.toThrow();
  });

  it("ProposalSchema.array().parse(propositions) réussit", () => {
    expect(() => ProposalSchema.array().parse(propositions)).not.toThrow();
  });
});

describe("jeu Édimbourg : calendrier", () => {
  it("compte 6 jours, index 1 à 6, dates consécutives du 2026-08-29 au 2026-09-03", () => {
    expect(edimbourg.days).toHaveLength(6);
    expect(edimbourg.days.map((day) => day.index)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(edimbourg.start).toBe("2026-08-29");
    expect(edimbourg.end).toBe("2026-09-03");
    const first = Date.parse("2026-08-29T00:00:00Z");
    edimbourg.days.forEach((day, i) => {
      const expected = new Date(first + i * 86_400_000).toISOString().slice(0, 10);
      expect(day.date).toBe(expected);
    });
  });

  it("a un weekday cohérent avec la date (le J1 est un samedi)", () => {
    for (const day of edimbourg.days) {
      const weekday = WEEKDAYS[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
      expect(day.weekday, day.date).toBe(weekday);
    }
    expect(edimbourg.days[0]?.weekday).toBe("sam.");
  });

  it("place le Tattoo le samedi à 21:30, en étape verrouillée", () => {
    const saturday = edimbourg.days[0];
    const tattoo = saturday && stopsOf(saturday).find((stop) => stop.kind === "event");
    expect(tattoo?.start).toBe("21:30");
    expect(tattoo?.locked).toBe(true);
  });

  it("commence le J1 à midi", () => {
    const first = edimbourg.days[0]?.items[0];
    expect(first?.type === "terminus" && first.time).toBe("12:00");
  });
});

describe("jeu Édimbourg : aucun trou dans le programme", () => {
  it.each(edimbourg.days.map((day) => [day.index, day] as const))(
    "J%i commence par un terminus start et finit par un terminus end",
    (_index, day) => {
      const first = day.items[0];
      const last = day.items.at(-1);
      expect(first?.type === "terminus" && first.role).toBe("start");
      expect(last?.type === "terminus" && last.role).toBe("end");
      const termini = day.items.filter((item) => item.type === "terminus");
      expect(termini).toHaveLength(2);
    },
  );

  it.each(edimbourg.days.map((day) => [day.index, day] as const))(
    "J%i : entre deux arrêts ou terminus consécutifs se trouve un segment ou un temps libre",
    (_index, day) => {
      let previousWasAnchor = false;
      for (const item of day.items) {
        const isAnchor = item.type === "stop" || item.type === "terminus";
        expect(isAnchor && previousWasAnchor, `${day.date} : ${JSON.stringify(item)}`).toBe(false);
        previousWasAnchor = isAnchor;
      }
    },
  );

  it.each(edimbourg.days.map((day) => [day.index, day] as const))(
    "J%i : les heures ne reculent pas et les trajets tiennent dans les intervalles",
    (_index, day) => {
      let clock = -1;
      for (const item of day.items) {
        switch (item.type) {
          case "terminus":
            expect(toMinutes(item.time), item.label).toBeGreaterThanOrEqual(clock);
            clock = toMinutes(item.time);
            break;
          case "stop":
            expect(toMinutes(item.stop.start), item.stop.id).toBeGreaterThanOrEqual(clock);
            clock = toMinutes(item.stop.start);
            if (item.stop.end) {
              expect(toMinutes(item.stop.end), item.stop.id).toBeGreaterThanOrEqual(clock);
              clock = toMinutes(item.stop.end);
            }
            break;
          case "free":
            expect(toMinutes(item.from)).toBeGreaterThanOrEqual(clock);
            expect(toMinutes(item.to)).toBeGreaterThan(toMinutes(item.from));
            clock = toMinutes(item.to);
            break;
          case "segment":
            clock += item.segment.minutes;
            break;
        }
      }
    },
  );

  it("travelMinutes de chaque jour est la somme de ses segments", () => {
    for (const day of edimbourg.days) {
      const total = day.items.reduce(
        (sum, item) => sum + (item.type === "segment" ? item.segment.minutes : 0),
        0,
      );
      expect(day.travelMinutes, day.date).toBe(total);
    }
  });

  it("fournit travelBudgetMinutes dans les données, avec au moins un jour en dépassement", () => {
    for (const day of edimbourg.days) expect(day.travelBudgetMinutes).toBeGreaterThan(0);
    expect(edimbourg.days.some((day) => day.travelMinutes > day.travelBudgetMinutes)).toBe(true);
  });
});

describe("jeu Édimbourg : couverture des cas", () => {
  it("a des identifiants d'étape uniques dans le voyage", () => {
    const ids = allStops().map((stop) => stop.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a des identifiants de proposition et de liste uniques", () => {
    const proposalIds = propositions.map((p) => p.id);
    expect(new Set(proposalIds).size).toBe(proposalIds.length);
    const checklistIds = edimbourg.checklist.map((c) => c.id);
    expect(new Set(checklistIds).size).toBe(checklistIds.length);
  });

  it("contient chaque kind d'étape, chaque mode de segment, un segment estimé, un temps libre et un repas", () => {
    const stops = allStops();
    const items = edimbourg.days.flatMap((day) => day.items);
    const segments = items.flatMap((item) => (item.type === "segment" ? [item.segment] : []));
    expect(new Set(stops.map((stop) => stop.kind))).toEqual(new Set(["activity", "meal", "event"]));
    expect(new Set(segments.map((segment) => segment.mode))).toEqual(
      new Set(["walk", "transit", "car"]),
    );
    expect(segments.some((segment) => segment.estimated)).toBe(true);
    expect(items.some((item) => item.type === "free")).toBe(true);
    expect(stops.some((stop) => stop.kind === "meal")).toBe(true);
  });

  it("contient une étape verrouillée et une exception de chaque type", () => {
    const stops = allStops();
    expect(stops.some((stop) => stop.locked)).toBe(true);
    expect(new Set(stops.flatMap((stop) => stop.exceptions))).toEqual(
      new Set(["toReserve", "toConfirm", "unconfirmed"]),
    );
  });

  it("a une liste avec un élément fait, un élément à faire et un élément sponsorisé", () => {
    const { checklist } = edimbourg;
    expect(checklist.some((item) => item.done)).toBe(true);
    expect(checklist.some((item) => !item.done)).toBe(true);
    expect(checklist.some((item) => item.sponsored)).toBe(true);
  });

  it("rattache le voyage à une organisation fictive", () => {
    expect(edimbourg.organizationId).toMatch(/^mock_/);
  });
});

describe("jeu Édimbourg : propositions", () => {
  it("compte 8 propositions, aucune étape verrouillée", () => {
    expect(propositions).toHaveLength(8);
    expect(propositions.every((proposal) => !proposal.stop.locked)).toBe(true);
  });

  it("contient au moins un repas avec option", () => {
    expect(propositions.some((p) => p.kind === "meal" && p.option !== undefined)).toBe(true);
  });

  it(`contient une proposition à plus de ${DETOUR_THRESHOLD_MINUTES} min avec son detour`, () => {
    const far = propositions.filter(
      (p) => (p.travelFromPrevious?.minutes ?? 0) > DETOUR_THRESHOLD_MINUTES,
    );
    expect(far.length).toBeGreaterThan(0);
    for (const proposal of far) expect(proposal.detour).toBeTruthy();
  });

  it("est cohérente avec le programme : jour, weekday, heure et étape identique", () => {
    for (const proposal of propositions) {
      const day = edimbourg.days.find((candidate) => candidate.index === proposal.day);
      expect(day, proposal.id).toBeDefined();
      expect(proposal.weekday).toBe(day?.weekday);
      expect(proposal.time).toBe(proposal.stop.start);
      expect(proposal.stop.kind).toBe(proposal.kind);
      const inTrip = day && stopsOf(day).find((stop) => stop.id === proposal.stop.id);
      if (inTrip) expect(proposal.stop).toEqual(inTrip);
      else expect(proposal.option?.index, proposal.id).toBeGreaterThan(1);
    }
  });
});

describe("jeu Édimbourg : aucune donnée Google, montants en nombres", () => {
  const serialized = JSON.stringify({ edimbourg, propositions });

  it("n'a que des placeId fictifs préfixés mock_", () => {
    const placeIds = [...allStops(), ...propositions.map((p) => p.stop)].flatMap((stop) =>
      stop.placeId === undefined ? [] : [stop.placeId],
    );
    expect(placeIds.length).toBeGreaterThan(0);
    for (const placeId of placeIds) expect(placeId).toMatch(/^mock_/);
  });

  it.each(["lat", "lng", "location", "rating", "openingHours", "photos"])(
    "ne contient aucune clé %s",
    (key) => {
      expect(serialized).not.toContain(`"${key}":`);
    },
  );

  it("ne contient aucun montant formaté", () => {
    expect(serialized).not.toMatch(/CHF/i);
    for (const day of edimbourg.days) {
      if (day.budgetPerPerson !== undefined) expect(typeof day.budgetPerPerson).toBe("number");
    }
  });

  it("n'utilise que des URL fictives", () => {
    const urls = serialized.match(/https?:\/\/[^"]+/g) ?? [];
    expect(urls.length).toBeGreaterThan(0);
    for (const url of urls) expect(new URL(url).hostname).toBe("example.org");
  });

  it("écrit les contenus non vérifiés entre crochets (Q12)", () => {
    const texts = [
      ...allStops().flatMap((stop) => [stop.name, stop.meta, stop.reason ?? "[]"]),
      ...propositions.flatMap((p) => [p.context, p.detour ?? "[]", p.stop.name]),
      ...edimbourg.checklist.flatMap((item) => [item.label, item.when]),
      ...edimbourg.days.flatMap((day) =>
        day.items.flatMap((item) => (item.type === "terminus" ? [item.label] : [])),
      ),
    ];
    for (const text of texts) expect(text).toMatch(/^\[.*\]$/);
  });
});

/** Créneaux de repas : même jour, même heure ; `option.total` = nombre d'options présentes (F6-PO-7). */
function mealSlots(list: Proposal[]) {
  const slots = new Map<string, Proposal[]>();
  for (const proposal of list.filter((p) => p.kind === "meal")) {
    const key = `${proposal.day}-${proposal.time}`;
    slots.set(key, [...(slots.get(key) ?? []), proposal]);
  }
  return [...slots.values()];
}

describe("jeu Édimbourg : présentation (F6)", () => {
  it("mock: options de repas présentes (total égal au nombre d'options du créneau)", () => {
    for (const list of [propositions, propositionsDebloque]) {
      for (const slot of mealSlots(list)) {
        const withOption = slot.filter((p) => p.option !== undefined);
        if (withOption.length === 0) continue;
        expect(withOption).toHaveLength(slot.length);
        expect(slot.map((p) => p.option?.index)).toEqual(slot.map((_, i) => i + 1));
        for (const p of slot) expect(p.option?.total, p.id).toBe(slot.length);
      }
    }
    const diner = propositions.filter((p) => p.id.startsWith("prop-j1-diner"));
    expect(diner.map((p) => p.option)).toEqual([
      { index: 1, total: 2 },
      { index: 2, total: 2 },
    ]);
  });

  it("classe chaque proposition (F6-PO-10) : château et musée museum, Dean Village walk, jardin et Arthur's Seat nature, distillerie tasting, dîners restaurant", () => {
    const byId = Object.fromEntries(propositions.map((p) => [p.id, p.category]));
    expect(byId).toEqual({
      "prop-j1-chateau": "museum",
      "prop-j1-diner-1": "restaurant",
      "prop-j1-diner-2": "restaurant",
      "prop-j2-dean-village": "walk",
      "prop-j2-jardin-botanique": "nature",
      "prop-j4-arthurs-seat": "nature",
      "prop-j5-musee-national": "museum",
      "prop-j5-distillerie": "tasting",
    });
    for (const p of [...propositions, ...propositionsDebloque]) {
      expect(p.category === "restaurant", p.id).toBe(p.kind === "meal");
    }
  });

  it("le detour de la distillerie ne contient que la justification (F6-PO-11)", () => {
    const distillerie = propositions.find((p) => p.id === "prop-j5-distillerie");
    expect(distillerie?.detour).toBe("[La distillerie la plus proche accessible sans voiture]");
    expect(distillerie?.detour).not.toMatch(/\d+\s*min/);
  });
});

describe("jeu Édimbourg débloqué (écran 6b, décision 0013 § 3.6)", () => {
  it("est dérivé du voyage d'Édimbourg : débloqué, J6 en préparation, reste identique", () => {
    expect(() => TripSchema.parse(edimbourgDebloque)).not.toThrow();
    expect(edimbourgDebloque.id).toBe(EDIMBOURG_DEBLOQUE_TRIP_ID);
    expect(edimbourgDebloque.unlocked).toBe(true);
    expect(edimbourgDebloque.days.filter((d) => d.generating).map((d) => d.index)).toEqual([6]);
    expect(edimbourgDebloque.days.slice(0, 5)).toEqual(edimbourg.days.slice(0, 5));
    expect(edimbourgDebloque.organizationId).toBe(edimbourg.organizationId);
    expect(edimbourg.unlocked).toBe(false);
  });

  it("a au moins 7 propositions des jours 3 et 4, hors aperçu, entre crochets, valides", () => {
    expect(() => ProposalSchema.array().parse(propositionsDebloque)).not.toThrow();
    expect(propositionsDebloque.length).toBeGreaterThanOrEqual(7);
    expect(new Set(propositionsDebloque.map((p) => p.day))).toEqual(new Set([3, 4]));
    const preview = new Set(propositions.map((p) => p.stop.id));
    for (const p of propositionsDebloque) {
      expect(preview.has(p.stop.id), p.id).toBe(false);
      expect(p.stop.locked).toBe(false);
      expect(p.context).toMatch(/^\[.*\]$/);
      expect(p.stop.name).toMatch(/^\[.*\]$/);
      if (p.stop.placeId) expect(p.stop.placeId).toMatch(/^mock_/);
    }
    const ids = [...propositions, ...propositionsDebloque].map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("contient un créneau de repas à 3 options et deux activités d'une même catégorie, aucune du J6", () => {
    expect(mealSlots(propositionsDebloque).some((slot) => slot.length === 3)).toBe(true);
    const nature = propositionsDebloque.filter((p) => p.kind === "activity" && p.category === "nature");
    expect(nature.length).toBeGreaterThanOrEqual(2);
    expect(propositionsDebloque.some((p) => p.day === 6)).toBe(false);
  });

  it("est cohérent avec le programme : jour, weekday, heure", () => {
    for (const proposal of propositionsDebloque) {
      const day = edimbourgDebloque.days.find((candidate) => candidate.index === proposal.day);
      expect(proposal.weekday).toBe(day?.weekday);
      expect(proposal.time).toBe(proposal.stop.start);
      expect(proposal.stop.kind).toBe(proposal.kind);
    }
  });
});
