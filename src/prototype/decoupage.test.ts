// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CLES_CONTENU, decouperProgramme, recomposerProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";

/** Décision 0046, D15 points 1 et 9 : `p0: programme découpé puis recomposé`. */

const PROGRAMME = ProgrammeReduitSchema.parse(
  JSON.parse(readFileSync(path.join(import.meta.dirname, "../../prototype/programmes-test/proto_test_20261012_1.json"), "utf8")),
);

describe("p0: programme découpé puis recomposé", () => {
  it("le contenu n'a aucune position ; la recomposition rend le programme d'origine", () => {
    const { contenu, positions } = decouperProgramme(PROGRAMME);
    expect(Object.keys(contenu).sort()).toEqual([...CLES_CONTENU].sort());
    expect(JSON.stringify(contenu)).not.toMatch(/"(lat|lng|positions)"/);
    expect(positions.size).toBe(Object.keys(PROGRAMME.positions).length);
    // Aller-retour par JSON, comme la colonne jsonb.
    const lu = JSON.parse(JSON.stringify(contenu)) as unknown;
    expect(recomposerProgramme(lu, (placeId) => positions.get(placeId))).toEqual({ ok: true, programme: PROGRAMME });
  });

  it("une position absente ou expirée : programme incomplet jamais servi", () => {
    const { contenu, positions } = decouperProgramme(PROGRAMME);
    const premier = [...positions.keys()][0]!;
    expect(recomposerProgramme(contenu, (placeId) => (placeId === premier ? undefined : positions.get(placeId)))).toEqual({ ok: false });
    expect(recomposerProgramme(contenu, () => undefined)).toEqual({ ok: false });
  });

  it("contenu qui porte des positions, une clé inconnue ou une forme invalide : refusé", () => {
    const { contenu, positions } = decouperProgramme(PROGRAMME);
    const lire = (placeId: string) => positions.get(placeId);
    expect(recomposerProgramme({ ...contenu, positions: {} }, lire)).toEqual({ ok: false });
    expect(recomposerProgramme({ ...contenu, note: 1 }, lire)).toEqual({ ok: false });
    expect(recomposerProgramme(null, lire)).toEqual({ ok: false });
    expect(recomposerProgramme([], lire)).toEqual({ ok: false });
    expect(recomposerProgramme({ schema: 1, trip: 3 }, lire)).toEqual({ ok: false });
    expect(recomposerProgramme(contenu, (placeId) => ({ ...positions.get(placeId)!, lat: 120 }))).toEqual({ ok: false });
  });
});
