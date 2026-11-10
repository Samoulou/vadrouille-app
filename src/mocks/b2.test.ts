// @vitest-environment node
import { describe, expect, it } from "vitest";

import { PreviewSlotsSchema, type Proposal, type PreviewSlot, type Trip } from "@/contracts";

import { lisbonne, porto } from "./autres-voyages";
import { apercu, edimbourg, edimbourgDebloque, propositions, propositionsDebloque } from "./edimbourg";
import { edimbourgRevision } from "./edimbourg-revision";

/*
 * Données simulées après B2 (spécification B2, § 3) : aucun texte d'interface, voisins et liens cohérents,
 * aperçu d'Édimbourg avec une case `noOption`.
 */

const VOYAGES: Trip[] = [edimbourg, edimbourgDebloque, lisbonne, porto];
const PROPOSITIONS: Proposal[] = [
  ...propositions,
  ...propositionsDebloque,
  ...apercu.flatMap((slot) => (slot.type === "proposal" ? [slot.proposal] : [])),
];

/** Visite chaque objet d'une valeur JSON, avec son chemin. */
function visiter(value: unknown, visit: (obj: Record<string, unknown>, path: string) => void, path = "$"): void {
  if (Array.isArray(value)) {
    value.forEach((v, i) => visiter(v, visit, `${path}[${i}]`));
  } else if (value !== null && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    visit(obj, path);
    for (const [k, v] of Object.entries(obj)) visiter(v, visit, `${path}.${k}`);
  }
}

/** Identifiants des étapes et événements d'un jour. */
function etapesDuJour(trip: Trip, index: number): Set<string> {
  const day = trip.days.find((d) => d.index === index);
  const ids = new Set<string>();
  if (!day) return ids;
  for (const item of day.items) if (item.type === "stop") ids.add(item.stop.id);
  for (const event of day.events) ids.add(event.id);
  return ids;
}

describe("données simulées de B2", () => {
  it("aperçu: les créneaux sans proposition ancrée sont des cases noOption", () => {
    expect(apercu).toHaveLength(8);
    const sansOption = apercu.filter((slot) => slot.type === "noOption");
    expect(sansOption.length).toBeGreaterThanOrEqual(1);
    for (const slot of sansOption) {
      expect(Object.keys(slot).sort()).toEqual(["day", "kind", "time", "type"]);
      expect(JSON.stringify(slot)).not.toMatch(/placeId|name|stop/);
    }
    expect(() => PreviewSlotsSchema.parse(apercu)).not.toThrow();

    const neuf: PreviewSlot[] = [...apercu, { type: "noOption", day: 6, time: "10:00", kind: "activity" }];
    expect(PreviewSlotsSchema.safeParse(neuf).success).toBe(false);
    const doublon: PreviewSlot[] = [
      { type: "noOption", day: 2, time: "10:00", kind: "activity" },
      { type: "noOption", day: 2, time: "10:00", kind: "meal" },
    ];
    expect(PreviewSlotsSchema.safeParse(doublon).success).toBe(false);
  });

  it("données simulées: aucun texte d'interface", () => {
    const interdites = ["weekday", "title", "context", "meta"];
    const fautes: string[] = [];
    visiter([VOYAGES, PROPOSITIONS, apercu], (obj, path) => {
      for (const cle of interdites) if (cle in obj) fautes.push(`${path}.${cle}`);
      if ("when" in obj && typeof obj.when !== "object") fautes.push(`${path}.when (texte)`);
    });
    expect(fautes).toEqual([]);
  });

  it("données simulées: voisins et liens cohérents", () => {
    const voyageDe = (proposal: Proposal): Trip =>
      propositionsDebloque.includes(proposal) ? edimbourgDebloque : edimbourg;
    const fautes: string[] = [];
    for (const proposal of PROPOSITIONS) {
      const ids = etapesDuJour(voyageDe(proposal), proposal.day);
      for (const cote of ["before", "after"] as const) {
        const voisin = proposal.neighbours[cote];
        if (voisin?.type === "stop" && !ids.has(voisin.stopId)) {
          fautes.push(`${proposal.id}.neighbours.${cote} → ${voisin.stopId}`);
        }
      }
    }
    for (const trip of VOYAGES) {
      const ids = new Set(trip.days.flatMap((d) => [...etapesDuJour(trip, d.index)]));
      for (const item of trip.checklist) {
        if (item.stopId !== undefined && !ids.has(item.stopId)) fautes.push(`${trip.id}.${item.id} → ${item.stopId}`);
      }
    }
    expect(fautes).toEqual([]);
    // Au moins un voisin d'étape et un lien de réservation exercent la vérification.
    expect(PROPOSITIONS.some((p) => p.neighbours.before?.type === "stop" || p.neighbours.after?.type === "stop")).toBe(
      true,
    );
    expect(edimbourg.checklist.filter((item) => item.stopId !== undefined).length).toBeGreaterThanOrEqual(4);
  });
});

describe("jeu simulé et M5-C (décision 0147)", () => {
  it("changements: un remplacement ne produit aucun removed (aperçus F7a sur mock)", () => {
    for (const fixture of edimbourgRevision.replacements) {
      expect(fixture.draft.changes.map((change) => change.type), fixture.stopId).not.toContain("removed");
    }
  });

  it("chaque ligne « À faire » a une sorte (§ 6.2) ; les lignes faites d'un engagement sont `ticket` (§ 6.3)", () => {
    for (const voyage of VOYAGES) {
      for (const ligne of voyage.checklist) {
        if (ligne.done) expect(ligne.kind, `${voyage.id} ${ligne.id}`).toBe("ticket");
        else expect(ligne.kind, `${voyage.id} ${ligne.id}`).toBe("reservation");
      }
    }
    expect(edimbourg.checklist.map((ligne) => ligne.kind)).toEqual(["ticket", "reservation", "reservation", "reservation", "reservation"]);
  });
});
