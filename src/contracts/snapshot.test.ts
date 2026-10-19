// @vitest-environment node
import { describe, expect, it } from "vitest";

import { edimbourg, propositions } from "@/mocks/edimbourg";

import { DaySnapshotSchema, ProposalRecordSchema, TripSnapshotSchema, type Proposal, type Trip } from "./index";

/*
 * Schémas de stockage dérivés (spécification B2, § 1 ; décisions 0010, 0011 point 5, 0037) : ce que
 * `trip_versions.snapshot` et `proposals.content` refusent.
 */

type Json = Record<string, unknown>;

const clone = <T>(value: T): T => structuredClone(value);

/** Copie sans les clés données. */
function omit<T extends object, K extends keyof T>(value: T, ...keys: K[]): Omit<T, K> {
  const copy = { ...value };
  for (const key of keys) delete copy[key];
  return copy;
}

/** Retire les clés recomposées à la lecture d'une étape (ou d'une idée) du programme. */
function etapeStockee(stop: Json): Json {
  const reste = omit(stop, "verifiedAt");
  if (Array.isArray(reste.exceptions)) reste.exceptions = reste.exceptions.filter((e) => e !== "toConfirm");
  return reste;
}

/** Instantané valide construit depuis le voyage simulé : `TripSnapshot = { days }`, clés de lecture retirées. */
function instantane(trip: Trip): Json {
  return {
    days: clone(trip.days).map((day) => {
      const jour = omit(day as unknown as Json, "budgetPerPerson", "generating", "travelMinutes");
      return {
        ...jour,
        items: (jour.items as Json[]).map((item) => {
          if (item.type === "stop") return { ...item, stop: etapeStockee(item.stop as Json) };
          if (item.type === "segment") {
            return { ...item, segment: omit(item.segment as Json, "minutes") };
          }
          return item;
        }),
        events: (jour.events as Json[]).map(etapeStockee),
        ...(jour.surprise ? { surprise: etapeStockee(jour.surprise as Json) } : {}),
      };
    }),
  };
}

/** Enregistrement valide d'une proposition : clés calculées et de lecture retirées, `detour` présent. */
function enregistrement(proposal: Proposal): Json {
  const reste = omit(clone(proposal) as unknown as Json, "neighbours", "option", "photoUrl");
  const record: Json = { ...reste, stop: etapeStockee(reste.stop as Json), detour: proposal.detour ?? "[Détour]" };
  if (record.travelFromPrevious) {
    record.travelFromPrevious = omit(record.travelFromPrevious as Json, "minutes");
  }
  return record;
}

const premierePropositionAvecTrajet = (): Proposal => {
  const proposal = propositions.find((p) => p.travelFromPrevious !== undefined);
  if (!proposal) throw new Error("données simulées : aucune proposition avec trajet");
  return proposal;
};

/** Premier jour qui a une étape, un trajet, un événement et une idée, pour exercer chaque niveau. */
function jourComplet(snapshot: Json): { day: Json; index: number } {
  const days = snapshot.days as Json[];
  const index = days.findIndex(
    (day) =>
      (day.items as Json[]).some((i) => i.type === "segment") &&
      (day.events as Json[]).length > 0 &&
      day.surprise !== undefined,
  );
  if (index < 0) throw new Error("données simulées : aucun jour avec trajet, événement et idée");
  return { day: days[index] as Json, index };
}

describe("instantané et enregistrement de proposition", () => {
  it("versions: l'instantané ne contient ni durée de trajet ni date de contrôle", () => {
    const base = instantane(edimbourg);
    expect(TripSnapshotSchema.safeParse(base).success).toBe(true);

    const variantes: [string, (s: Json) => void][] = [
      [
        "minutes dans un trajet",
        (s) => {
          const { day } = jourComplet(s);
          const item = (day.items as Json[]).find((i) => i.type === "segment") as Json;
          (item.segment as Json).minutes = 12;
        },
      ],
      [
        "verifiedAt dans une étape",
        (s) => {
          const { day } = jourComplet(s);
          const item = (day.items as Json[]).find((i) => i.type === "stop") as Json;
          (item.stop as Json).verifiedAt = "2026-08-01";
        },
      ],
      [
        "verifiedAt dans un événement",
        (s) => {
          const { day } = jourComplet(s);
          ((day.events as Json[])[0] as Json).verifiedAt = "2026-08-01";
        },
      ],
      [
        "verifiedAt dans l'idée",
        (s) => {
          const { day } = jourComplet(s);
          (day.surprise as Json).verifiedAt = "2026-08-01";
        },
      ],
      [
        "travelMinutes dans un jour",
        (s) => {
          jourComplet(s).day.travelMinutes = 40;
        },
      ],
      [
        "toConfirm dans exceptions",
        (s) => {
          const { day } = jourComplet(s);
          const item = (day.items as Json[]).find((i) => i.type === "stop") as Json;
          (item.stop as Json).exceptions = ["toConfirm"];
        },
      ],
    ];
    for (const [nom, modifier] of variantes) {
      const snapshot = clone(base);
      modifier(snapshot);
      expect(TripSnapshotSchema.safeParse(snapshot).success, nom).toBe(false);
    }
    // Durée à confirmer (`null`, décision 0092 § 4) : la clé reste refusée, même sans valeur. `strictObject` refuse
    // la clé `minutes` (ou `travelMinutes`) quelle que soit sa valeur ; rien de plus n'est stocké côté MVP.
    const minutesNull = clone(base);
    const jour = jourComplet(minutesNull).day;
    (((jour.items as Json[]).find((i) => i.type === "segment") as Json).segment as Json).minutes = null;
    expect(TripSnapshotSchema.safeParse(minutesNull).success, "minutes: null dans un trajet").toBe(false);
    const totalNull = clone(base);
    jourComplet(totalNull).day.travelMinutes = null;
    expect(TripSnapshotSchema.safeParse(totalNull).success, "travelMinutes: null dans un jour").toBe(false);

    const record = enregistrement(premierePropositionAvecTrajet());
    expect(ProposalRecordSchema.safeParse(record).success).toBe(true);
    const avecMinutes = clone(record);
    (avecMinutes.travelFromPrevious as Json).minutes = 25;
    expect(ProposalRecordSchema.safeParse(avecMinutes).success).toBe(false);
    const minutesNulles = clone(record);
    (minutesNulles.travelFromPrevious as Json).minutes = null;
    expect(ProposalRecordSchema.safeParse(minutesNulles).success, "travelFromPrevious.minutes: null").toBe(false);
    const avecControle = clone(record);
    (avecControle.stop as Json).verifiedAt = "2026-08-01";
    expect(ProposalRecordSchema.safeParse(avecControle).success).toBe(false);
    const aConfirmer = clone(record);
    (aConfirmer.stop as Json).exceptions = ["toConfirm"];
    expect(ProposalRecordSchema.safeParse(aConfirmer).success).toBe(false);
  });

  it("versions: une écriture d'instantané passe par le schéma strict", () => {
    const base = instantane(edimbourg);
    const valeurs: Record<string, unknown> = {
      displayName: { text: "[Lieu]" },
      formattedAddress: "[Adresse]",
      location: { latitude: 0, longitude: 0 },
      rating: 4.5,
      regularOpeningHours: { periods: [] },
    };
    for (const [cle, valeur] of Object.entries(valeurs)) {
      const snapshot = clone(base);
      const { day } = jourComplet(snapshot);
      const item = (day.items as Json[]).find((i) => i.type === "stop") as Json;
      (item.stop as Json)[cle] = valeur;
      expect(TripSnapshotSchema.safeParse(snapshot).success, cle).toBe(false);

      const imbrique = clone(base);
      const jour = jourComplet(imbrique).day;
      (((jour.items as Json[]).find((i) => i.type === "stop") as Json).stop as Json).facts = { [cle]: valeur };
      expect(TripSnapshotSchema.safeParse(imbrique).success, `facts.${cle}`).toBe(false);
    }
  });

  it("contrats: ProposalRecord exige detour et suit PROPOSAL_RECORD_KEYS", () => {
    // Liste écrite à la main, égale à `PROPOSAL_RECORD_KEYS` de B1 (#188, non fusionnée à l'écriture de B2).
    const PROPOSAL_RECORD_KEYS = ["id", "kind", "day", "time", "stop", "category", "travelFromPrevious", "detour"];
    expect(Object.keys(ProposalRecordSchema.shape).sort()).toEqual([...PROPOSAL_RECORD_KEYS].sort());

    // Trajet sans durée stockée : `detour` reste exigé, quelle que soit la longueur du trajet.
    const court = enregistrement(premierePropositionAvecTrajet());
    expect(ProposalRecordSchema.safeParse(court).success).toBe(true);
    const sansDetour = omit(court, "detour");
    expect(ProposalRecordSchema.safeParse(sansDetour).success).toBe(false);
    const sansTrajet = omit(sansDetour, "travelFromPrevious");
    expect(ProposalRecordSchema.safeParse(sansTrajet).success).toBe(false);

    const engagement = "ticket";
    const avecEngagement = clone(court);
    (avecEngagement.stop as Json).commitment = engagement;
    expect(ProposalRecordSchema.safeParse(avecEngagement).success).toBe(false);

    const jour = clone(instantane(edimbourg).days as Json[])[0] as Json;
    const item = (jour.items as Json[]).find((i) => i.type === "stop") as Json;
    (item.stop as Json).commitment = engagement;
    expect(DaySnapshotSchema.safeParse(jour).success).toBe(true);
  });
});
