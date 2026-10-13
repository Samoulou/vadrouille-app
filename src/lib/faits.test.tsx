import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DayLine } from "@/components/ligne/DayLine";
import type { Stop } from "@/contracts";

import { formatFaits } from "./faits";

const stop = (id: string, facts: Stop["facts"]): Stop => ({ id, kind: "activity", name: `[${id}]`, start: "10:00", facts, exceptions: [], locked: false });

describe("formatFaits (B2, E3)", () => {
  it("interface: faits d'une étape composés depuis StopFacts", () => {
    expect(formatFaits({ area: "[Old Town]", durationMinutes: 120 })).toBe("[Old Town], 2 h");
    expect(formatFaits({ area: "[Old Town]", durationMinutes: 75, costPerPerson: 0 })).toBe("[Old Town], 1 h 15, gratuit");
    expect(formatFaits({ durationMinutes: 45, costPerPerson: 35 })).toBe("45 min, ≈ 35 CHF");
    expect(formatFaits({ area: "[Leith]", costPerPerson: 12.5 })).toBe("[Leith], ≈ 13 CHF");
    expect(formatFaits({ costPerPerson: 0 })).toBe("gratuit");
    expect(formatFaits({})).toBe("");

    render(
      <DayLine
        items={[
          { type: "stop", stop: stop("a", { area: "[Old Town]", durationMinutes: 90, costPerPerson: 0 }) },
          { type: "stop", stop: stop("b", {}) },
        ]}
        getStopHref={(s) => `#${s.id}`}
      />,
    );
    expect(screen.getByRole("link", { name: /\[a\]/ })).toHaveTextContent("[Old Town], 1 h 30, gratuit");
    // Partie absente omise : sans fait, aucune ligne.
    expect(screen.getByRole("link", { name: /\[b\]/ }).querySelector('[data-part="faits"]')).toBeNull();
  });
});
