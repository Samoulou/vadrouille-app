// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { createPrototypeAdapter } from "@/adapters/prototype";
import { ProgrammeReduitSchema, PROTOTYPE_ORG_ID, type ProgrammeReduit } from "@/prototype/programme-reduit";

/**
 * Badge « à confirmer » calculé à la lecture (décision 0116 § 5.1, 0011 § 5 ; critère A7) : jamais écrit dans le
 * programme, posé à la lecture sur toute étape sans `placeId`. La relecture des horaires à l'affichage (T8) sort du lot 1
 * (future décision 0118) : une étape avec `placeId` ne reçoit aucun badge.
 */

const ctx = { organizationId: PROTOTYPE_ORG_ID, userId: "user_test", role: "owner" as const };

/** Programme de test avec la deuxième étape du premier jour sans `placeId` (lieu non vérifié, 0116 § 5.1). */
function programmeAvecEtapeSansLieu(): ProgrammeReduit {
  const brut = JSON.parse(readFileSync(join(process.cwd(), "prototype", "programmes-test", "proto_test_20261012_1.json"), "utf8")) as ProgrammeReduit;
  const jour = brut.trip.days[0]!;
  const rang = jour.items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.placeId === "SENTINELLE_PLACE_ID_2");
  const ligne = jour.items[rang]!;
  if (ligne.type !== "stop") throw new Error("fixture");
  const stop = { ...ligne.stop };
  delete stop.placeId;
  // Aucun trajet vers une étape sans `placeId` : le segment qui la précède est retiré (pairesDuProgramme la saute).
  jour.items = [...jour.items.slice(0, rang - 1), { ...ligne, stop }, ...jour.items.slice(rang + 1)];
  return ProgrammeReduitSchema.parse(brut);
}

describe("p0: badge « à confirmer » à la lecture (A7)", () => {
  it("p0: toConfirm jamais stocké, calculé à la lecture", async () => {
    const programme = programmeAvecEtapeSansLieu();
    // Stocké : aucune étape ne porte toConfirm ; l'étape sans placeId n'a ni position ni trajet.
    const stocke = JSON.stringify(programme);
    expect(stocke).not.toContain("toConfirm");
    const items = programme.trip.days[0]!.items;
    const rang = items.findIndex((ligne) => ligne.type === "stop" && ligne.stop.placeId === undefined);
    expect(rang).toBeGreaterThan(0);
    expect(items[rang - 1]?.type).not.toBe("segment");
    // Lu : badge sur l'étape sans placeId, et sur elle seule ; le programme source reste intact.
    const adaptateur = createPrototypeAdapter({
      programmes: { ids: async () => [programme.trip.id], lire: async (id) => (id === programme.trip.id ? structuredClone(programme) : null) },
      relecteurs: { trajets: { relireJournee: async (paires) => ({ ok: true, minutes: paires.map(() => 7) }) } },
    });
    for (const jour of [await adaptateur.getDay(ctx, programme.trip.id, 1), (await adaptateur.getTrip(ctx, programme.trip.id))!.days[0]]) {
      const etapes = (jour?.items ?? []).flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
      expect(etapes.map((stop) => stop.exceptions.includes("toConfirm"))).toEqual(etapes.map((stop) => stop.placeId === undefined));
      expect(etapes.filter((stop) => stop.exceptions.includes("toConfirm"))).toHaveLength(1);
    }
    expect(JSON.stringify(programme)).toBe(stocke);
  });
});
