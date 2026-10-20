// @vitest-environment node
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createSourceProgrammesReels, SQL_LISTE, SQL_POSITIONS, SQL_PROGRAMME } from "@/adapters/prototype-lecture";
import { recomposerProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import type { ClientSql, PoolSql } from "@/server/usage/neon";

/**
 * Parité de la recomposition (mineur 5 de la revue du head `e79fbed`, décision 0079 point 1) : la lecture des programmes
 * réels (`src/adapters/prototype-lecture.ts`) recompose elle-même, parce que l'application ne peut pas importer
 * `src/prototype/decoupage.ts` (0048 § 1). Ce test, sous `tests/`, vérifie qu'elle rend le même programme, ou le même
 * refus, que `recomposerProgramme` sur les mêmes contenus et positions.
 */

const TRIP_ID = "proto_test_20261012_1";
const DOSSIER = realpathSync(join(process.cwd(), "prototype", "programmes-test"));
const complet = ProgrammeReduitSchema.parse(JSON.parse(readFileSync(join(DOSSIER, `${TRIP_ID}.json`), "utf8")));
const contenu = (() => {
  const c: Partial<typeof complet> = structuredClone(complet);
  delete c.positions;
  return c as Record<string, unknown>;
})();

function pool(positions: Record<string, { lat: number; lng: number }>): PoolSql {
  const client: ClientSql = {
    async query(texte) {
      if (texte === SQL_LISTE || texte === SQL_PROGRAMME) return { rows: [{ contenu }] };
      if (texte === SQL_POSITIONS) return { rows: Object.entries(positions).map(([place_id, p]) => ({ place_id, ...p })) };
      return { rows: [] };
    },
    release: () => undefined,
  };
  return { connect: async () => client };
}

const ids = Object.keys(complet.positions);
const CAS: [string, Record<string, { lat: number; lng: number }>][] = [
  ["toutes les positions", { ...complet.positions }],
  ["une position en trop (autre lieu)", { ...complet.positions, lieu_hors_programme: { lat: 1, lng: 2 } }],
  ["une position manquante", Object.fromEntries(ids.slice(1).map((id) => [id, complet.positions[id]!]))],
  ["latitude hors bornes", { ...complet.positions, [ids[0]!]: { lat: 91, lng: 0 } }],
];

describe("p0: recomposition de la lecture réelle identique à recomposerProgramme", () => {
  it.each(CAS)("%s", async (_cas, positions) => {
    const attendu = recomposerProgramme(contenu, (placeId) => (Object.hasOwn(positions, placeId) ? positions[placeId] : undefined));
    const source = createSourceProgrammesReels({ pool: async () => pool(positions) });
    const liste = await source.lister();
    if (attendu.ok) {
      expect(liste.map((lu) => lu.programme)).toEqual([attendu.programme]);
      expect((await source.lire(TRIP_ID))?.programme).toEqual(attendu.programme);
    } else {
      expect(liste).toEqual([]);
      await expect(source.lire(TRIP_ID)).rejects.toThrow();
    }
  });
});
