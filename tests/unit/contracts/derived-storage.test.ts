// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { z } from "zod";

import * as contracts from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";

import { DERIVED_STORAGE_SCHEMAS } from "./exclusions";

/*
 * Schémas de stockage dérivés (spécification B2, § 1 ; décisions 0010, 0011 point 5, 0037) : chaque clé existe dans
 * son schéma source, les clés omises sont exactement celles du § 1, et une clé reprise sans être remplacée porte la
 * même instance de champ que la source (aucune copie).
 */

type Schema = z.ZodType;
type Def = { type: string; innerType?: Schema; options?: Schema[]; discriminator?: string; values?: unknown[] };

const exported = new Map(
  Object.entries(contracts as Record<string, unknown>)
    .filter(([name]) => name.endsWith("Schema"))
    .map(([name, value]) => [name.slice(0, -"Schema".length), value as Schema]),
);
const get = (name: string): Schema => {
  const schema = exported.get(name);
  if (!schema) throw new Error(`${name}Schema non exporté`);
  return schema;
};
const defOf = (schema: Schema): Def => (schema as unknown as { _zod: { def: Def } })._zod.def;
const shapeOf = (schema: Schema): Record<string, Schema> => (schema as unknown as { shape: Record<string, Schema> }).shape;

/** Copie sans les clés données. */
function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

interface Expectation {
  /** Clés de la source absentes du schéma dérivé. */
  omitted: string[];
  /** Clés remplacées par leur version de stockage (objet ou tableau), ou rendues obligatoires. */
  replaced: string[];
}

/** § 1 de la spécification B2 : clés omises et remplacées de chaque schéma dérivé objet. */
const EXPECTED: Record<string, Expectation> = {
  TripSnapshot: {
    // `cities` (décision 0148 § 6 point 2) : lu depuis `stays`, jamais depuis l'instantané.
    omitted: ["id", "organizationId", "destination", "destinationColor", "start", "end", "timeZone", "travellers", "checklist", "unlocked", "cities"],
    replaced: ["days"],
  },
  DaySnapshot: { omitted: ["budgetPerPerson", "generating", "travelMinutes"], replaced: ["items", "events", "surprise"] },
  StopSnapshot: { omitted: ["verifiedAt"], replaced: [] },
  EventSnapshot: { omitted: [], replaced: [] },
  SegmentSnapshot: { omitted: ["minutes"], replaced: [] },
  SurpriseIdeaSnapshot: { omitted: ["verifiedAt"], replaced: [] },
  ProposalRecord: { omitted: ["neighbours", "option", "photoUrl"], replaced: ["stop", "travelFromPrevious", "detour"] },
};

/** Variante d'une union discriminée par la valeur de son discriminant. */
function variants(union: Schema): Map<string, Schema> {
  const discriminator = defOf(union).discriminator as string;
  return new Map(
    (defOf(union).options as Schema[]).map((option) => [
      String((defOf(shapeOf(option)[discriminator] as Schema).values ?? [])[0]),
      option,
    ]),
  );
}

describe("schémas de stockage dérivés", () => {
  it("contrats: les schémas de stockage sont dérivés sans copie", () => {
    expect(DERIVED_STORAGE_SCHEMAS.map((e) => e.contract).sort()).toEqual(
      ["TripSnapshot", "DaySnapshot", "DayLineItemSnapshot", "StopSnapshot", "EventSnapshot", "SegmentSnapshot", "SurpriseIdeaSnapshot", "ProposalRecord"].sort(),
    );

    for (const { contract, source } of DERIVED_STORAGE_SCHEMAS) {
      const derived = get(contract);
      const origin = get(source);
      if (contract === "DayLineItemSnapshot") {
        // Par variante : mêmes discriminants ; `terminus`, `free`, `openMeal` repris par référence.
        const d = variants(derived);
        const o = variants(origin);
        expect([...d.keys()].sort()).toEqual([...o.keys()].sort());
        for (const value of ["terminus", "free", "openMeal"]) expect(d.get(value), value).toBe(o.get(value));
        // `transfer` (décision 0148 § 1 point 1) : repris par référence, sans copie.
        expect(d.get("transfer"), "transfer").toBe(o.get("transfer"));
        for (const [value, field] of [["stop", "stop"], ["segment", "segment"]] as const) {
          const dv = shapeOf(d.get(value) as Schema);
          const ov = shapeOf(o.get(value) as Schema);
          expect(Object.keys(dv).sort()).toEqual(Object.keys(ov).sort());
          expect(dv.type).toBe(ov.type);
          expect(dv[field]).not.toBe(ov[field]);
        }
        expect(shapeOf(d.get("stop") as Schema).stop).toBe(get("StopSnapshot"));
        expect(shapeOf(d.get("segment") as Schema).segment).toBe(get("SegmentSnapshot"));
        continue;
      }

      const expected = EXPECTED[contract] as Expectation;
      const dShape = shapeOf(derived);
      const oShape = shapeOf(origin);
      const dKeys = Object.keys(dShape);
      for (const key of dKeys) expect(oShape, `${contract}.${key} dans ${source}`).toHaveProperty(key);
      expect(Object.keys(oShape).filter((k) => !(k in dShape)).sort(), `${contract} : clés omises`).toEqual(
        [...expected.omitted].sort(),
      );
      for (const key of dKeys) {
        if (expected.replaced.includes(key)) expect(dShape[key], `${contract}.${key} remplacé`).not.toBe(oShape[key]);
        else expect(dShape[key], `${contract}.${key} repris sans copie`).toBe(oShape[key]);
      }
    }

    expect(Object.keys(shapeOf(get("TripSnapshot")))).toEqual(["days"]);
    // `detour` rendu obligatoire : enveloppe `nonoptional` autour du champ source, sans redéclaration.
    const detour = defOf(shapeOf(get("ProposalRecord")).detour as Schema);
    expect(detour.type).toBe("nonoptional");
    expect(detour.innerType).toBe(shapeOf(get("ProposalBase")).detour);

    // Un événement dont `kind` n'est pas `event` est refusé par DaySnapshotSchema, comme par DaySchema.
    const day = structuredClone(edimbourg.days.find((d) => d.events.length > 0));
    if (!day) throw new Error("données simulées : aucun jour avec événement");
    const event = day.events[0] as (typeof day.events)[number];
    expect(contracts.DaySchema.safeParse({ ...day, events: [{ ...event, kind: "activity" }] }).success).toBe(false);
    const stored = omit(day, "budgetPerPerson", "generating", "travelMinutes");
    const storedEvent = { ...event, verifiedAt: undefined };
    delete storedEvent.verifiedAt;
    const base = {
      ...stored,
      items: [],
      events: [{ ...storedEvent, exceptions: storedEvent.exceptions.filter((e) => e !== "toConfirm") }],
      surprise: undefined,
    };
    delete base.surprise;
    expect(contracts.DaySnapshotSchema.safeParse(base).success).toBe(true);
    expect(
      contracts.DaySnapshotSchema.safeParse({ ...base, events: [{ ...base.events[0], kind: "activity" }] }).success,
    ).toBe(false);
  });
});
