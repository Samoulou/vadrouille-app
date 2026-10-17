import { describe, expect, it } from "vitest";

import { AnalyticsEventSchema } from "./events";

/** `preview_ready` (spécification F8, « Événements de mesure », F8-PO-15) : `duration_ms` seule, absente après un rechargement. */

const event = (properties: Record<string, unknown>) => ({
  name: "preview_ready",
  properties,
});

describe("analytics: preview_ready", () => {
  it.each([[{ duration_ms: 0 }], [{ duration_ms: 8123 }], [{}]])("accepte %j", (properties) => {
    expect(AnalyticsEventSchema.safeParse(event(properties)).success).toBe(true);
  });

  it.each([
    ["durée négative", { duration_ms: -1 }],
    ["durée non entière", { duration_ms: 1.5 }],
    ["identifiant du voyage", { duration_ms: 1000, trip_id: "mock_trip_edimbourg" }],
    ["destination", { destination: "Édimbourg" }],
  ])("refuse : %s", (_label, properties) => {
    expect(AnalyticsEventSchema.safeParse(event(properties)).success).toBe(false);
  });
});
