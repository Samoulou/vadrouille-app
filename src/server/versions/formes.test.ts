// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { TripPatch } from "@/contracts";

import { ajoutVerrouille } from "./formes";

/**
 * Reconnaissance commune du patch `[add, lock]` sur un même `stopId` (ticket 998, Q810), partagée par `formeAdmise`
 * (`retouches.test.ts`) et `estUnAjout` (`src/server/lieux/annulation.test.ts`), dont les tests restent inchangés.
 */

const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const ADD = { op: "add", stopId: "a1", kind: "activity", day: 1, time: "14:00", name: "[Mon lieu]" } as const;
const LOCK = { op: "lock", stopId: "a1" } as const;
const p = (operations: TripPatch["operations"]): TripPatch => ({ requestId: REQUETE, baseVersion: 3, operations });

describe("ajoutVerrouille (ticket 998)", () => {
  it("rend l'opération add d'un patch exactement [add, lock] sur un même stopId", () => {
    expect(ajoutVerrouille(p([ADD, LOCK]))).toEqual(ADD);
  });

  it("rend null pour toute autre suite d'opérations", () => {
    const autres: TripPatch["operations"][] = [
      [ADD],
      [LOCK],
      [LOCK, ADD],
      [ADD, { ...LOCK, stopId: "a2" }],
      [ADD, LOCK, LOCK],
      [ADD, { op: "unlock", stopId: "a1" }],
      [{ op: "revert", toVersion: 1 }],
    ];
    for (const operations of autres) expect(ajoutVerrouille(p(operations)), JSON.stringify(operations)).toBeNull();
  });
});
