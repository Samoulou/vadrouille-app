import { describe, expect, it } from "vitest";

import type { DemandeRelectures, Plage } from "@/domain/relectures";
import { creerRelecturesVoyages, lieuConverti, lieuDeTest, logementDeTest, tableDesRelectures, VOYAGES_SIMULES, type TableRelectures } from "@/mocks/relectures-voyages";
import { voyageARelire } from "../../support/voyage-a-relire";

/**
 * Double de relectures de la lecture des voyages (spécification B6, B6a point 3 ; décision 0086 § 1.2 point 4) :
 * indexé par `placeId` et par triplet (lieu, lieu, mode), jamais par voyage ; ne répond qu'à la demande ; compte ses
 * appels ; refus simulés. Valeurs sentinelles (`test_place_*`, 9 et 17 min).
 */

const A = "test_place_a";
const B = "test_place_b";
const H = "test_place_hotel";

const table: TableRelectures = {
  plages: new Map<string, ReadonlyMap<string, readonly Plage[] | "inconnu">>([
    [A, new Map([["2027-05-01", [{ debut: 540, fin: 1080 }]]])],
    [B, new Map([["2027-05-01", "inconnu" as const]])],
  ]),
  durees: new Map([
    [`${H}|${A}|walk`, 9],
    [`${A}|${B}|transit`, 17],
  ]),
  conflits: [],
  ecartsPropositions: [],
};

const demande: DemandeRelectures = {
  lieux: [
    { placeId: A, dates: ["2027-05-01"] },
    { placeId: B, dates: ["2027-05-01"] },
  ],
  trajets: [
    { depuis: { logement: 0 }, vers: { lieu: A }, modes: ["walk"] },
    { depuis: { lieu: A }, vers: { lieu: B }, modes: ["transit", "car"] },
  ],
};

async function relire(options: Parameters<typeof creerRelecturesVoyages>[0], logements: (string | null)[] = [H], recue = demande) {
  const double = creerRelecturesVoyages({ table, ...options });
  const reponse = await double.pour(voyageARelire(logements), recue);
  return { double, reponse };
}

describe("double de relectures : indexation et demande", () => {
  it("valeurs par placeId et par triplet, logement résolu par sa nuit", async () => {
    const { reponse } = await relire({});
    expect(reponse.ok).toBe(true);
    if (!reponse.ok) return;
    const r = reponse.relectures;
    expect(r.validite(A)).toBe("valide");
    expect(r.plages(A, "2027-05-01")).toEqual([{ debut: 540, fin: 1080 }]);
    expect(r.plages(B, "2027-05-01")).toBe("inconnu");
    expect(r.duree({ logement: 0 }, { lieu: A }, "walk")).toEqual({ minutes: 9, estimee: false });
    expect(r.duree({ lieu: A }, { lieu: B }, "transit")).toEqual({ minutes: 17, estimee: false });
    // Demandé mais absent de la table : inconnu.
    expect(r.duree({ lieu: A }, { lieu: B }, "car")).toBe("inconnu");
  });

  it("hors de la demande : inconnu (lieu, date, couple ou mode non demandés)", async () => {
    const { reponse } = await relire({});
    if (!reponse.ok) throw new Error("refus inattendu");
    const r = reponse.relectures;
    expect(r.validite("test_place_z")).toBe("inconnu");
    expect(r.plages(A, "2027-05-02")).toBe("inconnu");
    expect(r.duree({ lieu: A }, { lieu: B }, "walk")).toBe("inconnu");
    expect(r.duree({ lieu: B }, { lieu: A }, "transit")).toBe("inconnu");
    expect(r.duree({ logement: 0 }, { lieu: A }, "transit")).toBe("inconnu");
  });

  it("logement sans lieu ou nuit absente : inconnu", async () => {
    for (const logements of [[null], []]) {
      const { reponse } = await relire({}, logements);
      if (!reponse.ok) throw new Error("refus inattendu");
      expect(reponse.relectures.duree({ logement: 0 }, { lieu: A }, "walk")).toBe("inconnu");
    }
  });

  it("jamais indexé par voyage : deux voyages aux mêmes lieux reçoivent les mêmes valeurs", async () => {
    const double = creerRelecturesVoyages({ table });
    const un = await double.pour(voyageARelire([H]), demande);
    const deux = await double.pour(voyageARelire([H]), demande);
    if (!un.ok || !deux.ok) throw new Error("refus inattendu");
    expect(deux.relectures.duree({ logement: 0 }, { lieu: A }, "walk")).toEqual(un.relectures.duree({ logement: 0 }, { lieu: A }, "walk"));
  });

  it("filtrerDemande : une entrée retirée devient inconnue", async () => {
    const { reponse } = await relire({ filtrerDemande: (d) => ({ ...d, trajets: d.trajets.slice(1) }) });
    if (!reponse.ok) throw new Error("refus inattendu");
    expect(reponse.relectures.duree({ logement: 0 }, { lieu: A }, "walk")).toBe("inconnu");
    expect(reponse.relectures.duree({ lieu: A }, { lieu: B }, "transit")).toEqual({ minutes: 17, estimee: false });
  });
});

describe("double de relectures : appels et refus", () => {
  it("compte ses appels et garde la dernière demande", async () => {
    const double = creerRelecturesVoyages({ table });
    expect(double.appels()).toBe(0);
    expect(double.derniereDemande()).toBeUndefined();
    await double.pour(voyageARelire([H]), demande);
    await double.pour(voyageARelire([H]), { lieux: [], trajets: [] });
    expect(double.appels()).toBe(2);
    expect(double.derniereDemande()).toEqual({ lieux: [], trajets: [] });
  });

  it.each(["quota_reached", "unavailable"] as const)("refus simulé %s", async (refus) => {
    const { double, reponse } = await relire({ refus });
    expect(reponse).toEqual({ ok: false, refus });
    expect(double.appels()).toBe(1);
  });

  it("exception simulée", async () => {
    const double = creerRelecturesVoyages({ table, leve: true });
    await expect(double.pour(voyageARelire([H]), demande)).rejects.toThrow();
    expect(double.appels()).toBe(1);
  });
});

describe("double de relectures : table des quatre voyages simulés (B6a point 7 ; réponse de data, point 6)", () => {
  const complete = tableDesRelectures();

  it("aucun conflit sur les quatre voyages réunis", () => {
    expect(VOYAGES_SIMULES.map((v) => v.trip.id)).toEqual(["mock_trip_edimbourg", "mock_trip_edimbourg_debloque", "mock_trip_lisbonne", "mock_trip_porto"]);
    expect(complete.conflits).toEqual([]);
  });

  it("clés : placeId du jeu, sentinelles test_place_ ; logement par id de mock", () => {
    expect(lieuDeTest("j1-x")).toBe("test_place_j1-x");
    expect(logementDeTest("mock_trip_lisbonne")).toBe("test_place_logement_mock_trip_lisbonne");
    expect(lieuConverti({ id: "j1-x" })).toBe("test_place_j1-x");
    expect(lieuConverti({ id: "j1-x", placeId: "mock_place_y" })).toBe("mock_place_y");
    for (const cle of [...complete.plages.keys(), ...[...complete.durees.keys()].flatMap((c) => c.split("|").slice(0, 2))]) {
      expect(cle.startsWith("mock_place_") || cle.startsWith("test_place_"), cle).toBe(true);
    }
  });

  it("une étape que mock marque toConfirm a des plages inconnues", () => {
    const marquees = VOYAGES_SIMULES.flatMap(({ trip }) =>
      trip.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" && item.stop.exceptions.includes("toConfirm") ? [{ lieu: lieuConverti(item.stop), date: day.date }] : []))),
    );
    expect(marquees.length).toBeGreaterThan(0);
    for (const { lieu, date } of marquees) expect(complete.plages.get(lieu)?.get(date), lieu).toBe("inconnu");
  });
});
