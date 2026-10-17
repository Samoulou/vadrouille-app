import { afterEach, describe, expect, it } from "vitest";

import { launchNow, markLaunch, resetLaunchTiming, setLaunchClock, takePreviewReady } from "./launch-timing";

/** Durée de `preview_ready` (F8-PO-15) : de l'appel à `createTrip` à l'état prêt, dans l'onglet ; une fois par voyage. */

afterEach(() => resetLaunchTiming());

describe("launch-timing", () => {
  it("durée depuis le lancement, puis plus rien pour ce voyage (aucun doublon)", () => {
    let now = 1000;
    setLaunchClock(() => now);
    markLaunch("mock_trip_edimbourg", launchNow());
    now = 9400.6;
    expect(takePreviewReady("mock_trip_edimbourg")).toEqual({
      durationMs: 8401,
    });
    expect(takePreviewReady("mock_trip_edimbourg")).toBeNull();
  });

  it("aucun lancement connu (rechargement, ouverture directe) : sans durée", () => {
    expect(takePreviewReady("mock_trip_edimbourg")).toEqual({});
    expect(takePreviewReady("mock_trip_edimbourg")).toBeNull();
  });

  it("le dernier lancement l'emporte ; une durée n'est jamais négative", () => {
    setLaunchClock(() => 5000);
    markLaunch("mock_trip_edimbourg", 1000);
    markLaunch("mock_trip_edimbourg", 6000);
    expect(takePreviewReady("mock_trip_edimbourg")).toEqual({ durationMs: 0 });
  });
});
