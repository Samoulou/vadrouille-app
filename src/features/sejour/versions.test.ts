import { describe, expect, it } from "vitest";

import type { TripVersionSummary } from "@/contracts";

import { avantLeDeblocage, formatMomentPhrase, formatMomentVersion, libelleVersion } from "./versions";

/** Libellés de « Versions du programme » (M5b ; spécification M5 § 4) : composés à l'affichage, jamais stockés. */

const ZONE = "Europe/Zurich";
const v = (extra: Partial<TripVersionSummary>): TripVersionSummary => ({
  version: 2,
  createdAt: "2026-10-28T13:05:00.000Z",
  kind: "complete",
  current: false,
  revertible: true,
  ...extra,
});

describe("versions: libellés", () => {
  it("date et heure de l'appareil : « mer. 28.10, 14:05 » ; dans une phrase : « mer. 28.10 à 14:05 »", () => {
    expect(formatMomentVersion("2026-10-28T13:05:00.000Z", ZONE)).toBe("mer. 28.10, 14:05");
    expect(formatMomentPhrase("2026-10-28T13:05:00.000Z", ZONE)).toBe("mer. 28.10 à 14:05");
  });

  it("une phrase par sorte, avec les noms du programme", () => {
    expect(libelleVersion(v({ kind: "prepared" }), ZONE)).toBe("Programme préparé");
    expect(libelleVersion(v({ kind: "adjusted" }), ZONE)).toBe("Programme ajusté après ton tri");
    expect(libelleVersion(v({ kind: "complete" }), ZONE)).toBe("Voyage complet");
    expect(libelleVersion(v({ kind: "replaced", subject: "Dean Village", previous: "Calton Hill" }), ZONE)).toBe("Calton Hill remplacé par Dean Village");
    expect(libelleVersion(v({ kind: "added", subject: "Café" }), ZONE)).toBe("Café ajouté");
    expect(libelleVersion(v({ kind: "moved", subject: "Café", day: 3 }), ZONE)).toBe("Café déplacé au jour 3");
    expect(libelleVersion(v({ kind: "locked", subject: "Château" }), ZONE)).toBe("Château verrouillé");
    expect(libelleVersion(v({ kind: "unlocked", subject: "Château" }), ZONE)).toBe("Verrou retiré : Château");
    expect(libelleVersion(v({ kind: "reverted", revertedTo: { version: 1, createdAt: "2026-10-27T08:30:00.000Z" } }), ZONE)).toBe(
      "Retour à la version du mar. 27.10 à 09:30",
    );
  });

  it("avant le déblocage : ni actuelle ni proposée au retour", () => {
    expect(avantLeDeblocage(v({ revertible: false }))).toBe(true);
    expect(avantLeDeblocage(v({ revertible: true }))).toBe(false);
    expect(avantLeDeblocage(v({ revertible: false, current: true }))).toBe(false);
  });
});
