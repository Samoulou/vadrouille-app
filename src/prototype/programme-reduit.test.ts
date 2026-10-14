// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ProposalSchema, StopSchema, TripSchema } from "@/contracts";

import {
  PROTOTYPE_ORG_ID,
  ProgrammeReduitSchema,
  PropositionReduiteSchema,
  StopReduitSchema,
  placeIdsDuProgramme,
  urlSourceValide,
  type ProgrammeReduit,
} from "./programme-reduit";

/** Programme réduit minimal, à valeurs sentinelles (aucune donnée Google, contrainte 8). */
function exemple(): ProgrammeReduit {
  const etape = {
    id: "j1-a1",
    kind: "activity" as const,
    placeId: "SENTINELLE_PLACE_ID",
    name: "Lieu maison 1",
    start: "14:00",
    end: "15:30",
    facts: { durationMinutes: 90 },
    reason: "Raison maison.",
    source: { label: "exemple.org", url: "https://exemple.org/lieu-1" },
    exceptions: ["toReserve" as const],
    locked: false,
  };
  return {
    schema: 1,
    trip: {
      id: "proto_test_20261012_1",
      organizationId: PROTOTYPE_ORG_ID,
      destination: "Ville de test",
      destinationColor: "granit",
      start: "2026-11-23",
      end: "2026-11-23",
      timeZone: "Europe/London",
      travellers: { adults: 2, children: 0 },
      days: [
        {
          index: 1,
          date: "2026-11-23",
          weekday: "lun.",
          items: [
            { type: "terminus", role: "start", time: "12:00", label: "Logement" },
            { type: "segment", segment: { mode: "walk", estimated: false } },
            { type: "stop", stop: etape },
            { type: "segment", segment: { mode: "walk", estimated: false } },
            { type: "terminus", role: "end", time: "16:00", label: "Logement" },
          ],
          events: [],
          generating: false,
          travelBudgetMinutes: 90,
        },
      ],
      checklist: [],
      unlocked: true,
    },
    proposals: [
      {
        id: "p1",
        kind: "activity",
        day: 1,
        time: "14:00",
        stop: etape,
        category: "walk",
        travelFromPrevious: { mode: "walk", estimated: false },
        detour: "Le lieu le plus cité par nos sources.",
      },
    ],
    positions: {
      SENTINELLE_PLACE_ID: { lat: 55.9533123, lng: -3.1883123 },
      SENTINELLE_PLACE_ID_LOGEMENT: { lat: 55.9533123, lng: -3.1893123 },
    },
    terminus: [{ jour: 1, depart: "SENTINELLE_PLACE_ID_LOGEMENT", arrivee: "SENTINELLE_PLACE_ID_LOGEMENT" }],
  };
}

describe("p0: schéma strict de la forme réduite", () => {
  it("accepte un programme réduit à valeurs sentinelles", () => {
    expect(ProgrammeReduitSchema.safeParse(exemple()).success).toBe(true);
  });

  it("p0: le programme réduit ne contient aucune clé dérivée de Google", () => {
    const avecVerifiedAt = exemple();
    (avecVerifiedAt.trip.days[0]!.items[2] as { stop: Record<string, unknown> }).stop.verifiedAt = "2026-10-12";
    expect(ProgrammeReduitSchema.safeParse(avecVerifiedAt).success).toBe(false);

    const avecMinutes = exemple();
    (avecMinutes.trip.days[0]!.items[1] as { segment: Record<string, unknown> }).segment.minutes = 12;
    expect(ProgrammeReduitSchema.safeParse(avecMinutes).success).toBe(false);

    const avecTrajet = exemple();
    (avecTrajet.proposals[0]!.travelFromPrevious as Record<string, unknown>).minutes = 25;
    expect(ProgrammeReduitSchema.safeParse(avecTrajet).success).toBe(false);

    const avecTravelMinutes = exemple();
    (avecTravelMinutes.trip.days[0] as Record<string, unknown>).travelMinutes = 40;
    expect(ProgrammeReduitSchema.safeParse(avecTravelMinutes).success).toBe(false);

    const avecIdee = exemple();
    avecIdee.trip.days[0]!.surprise = {
      id: "s1",
      name: "Idée maison",
      facts: {},
      reason: "Raison maison.",
      source: { label: "exemple.org", url: "https://exemple.org/idee" },
    };
    expect(ProgrammeReduitSchema.safeParse(avecIdee).success).toBe(true);
    (avecIdee.trip.days[0]!.surprise as Record<string, unknown>).verifiedAt = "2026-10-12";
    expect(ProgrammeReduitSchema.safeParse(avecIdee).success).toBe(false);
  });

  it("type exceptions comme toReserve et unconfirmed seulement : toConfirm refusé", () => {
    const programme = exemple();
    (programme.trip.days[0]!.items[2] as { stop: { exceptions: string[] } }).stop.exceptions = ["toConfirm"];
    expect(ProgrammeReduitSchema.safeParse(programme).success).toBe(false);
    expect(StopReduitSchema.safeParse({ ...exemple().proposals[0]!.stop, exceptions: ["unconfirmed"] }).success).toBe(
      true,
    );
    expect(
      StopReduitSchema.safeParse({ ...exemple().proposals[0]!.stop, exceptions: ["toReserve", "unconfirmed", "toReserve"] })
        .success,
    ).toBe(false);
  });

  it("p0: detour présent sur chaque proposition, sans durée", () => {
    const sansDetour = exemple();
    delete (sansDetour.proposals[0] as Record<string, unknown>).detour;
    expect(ProgrammeReduitSchema.safeParse(sansDetour).success).toBe(false);
  });

  it("refuse une clé inconnue à tout niveau (note, horaires, coordonnées dans une étape)", () => {
    for (const [cle, valeur] of [
      ["rating", 4.5],
      ["regularOpeningHours", {}],
      ["location", { lat: 1, lng: 2 }],
      ["displayName", "x"],
    ] as const) {
      const programme = exemple();
      (programme.trip.days[0]!.items[2] as { stop: Record<string, unknown> }).stop[cle] = valeur;
      expect(ProgrammeReduitSchema.safeParse(programme).success, cle).toBe(false);
      const racine = { ...exemple(), [cle]: valeur };
      expect(ProgrammeReduitSchema.safeParse(racine).success, cle).toBe(false);
    }
    const photo = exemple();
    (photo.proposals[0] as Record<string, unknown>).photoUrl = "https://exemple.org/photo.jpg";
    expect(ProgrammeReduitSchema.safeParse(photo).success).toBe(false);
  });

  it("limite la table positions aux placeId du programme, chacun avec sa position", () => {
    const enTrop = exemple();
    enTrop.positions.AUTRE_PLACE_ID = { lat: 55.9533123, lng: -3.1 };
    expect(ProgrammeReduitSchema.safeParse(enTrop).success).toBe(false);

    const manquante = exemple();
    delete manquante.positions.SENTINELLE_PLACE_ID;
    expect(ProgrammeReduitSchema.safeParse(manquante).success).toBe(false);

    const champEnTrop = exemple();
    (champEnTrop.positions.SENTINELLE_PLACE_ID as Record<string, unknown>).name = "SENTINELLE-NOM-GOOGLE";
    expect(ProgrammeReduitSchema.safeParse(champEnTrop).success).toBe(false);
  });

  it("refuse un placeId de lieu nommé comme une propriété d'Object.prototype sans position (constructor, __proto__)", () => {
    for (const placeId of ["constructor", "__proto__", "toString", "hasOwnProperty"]) {
      const programme = exemple();
      (programme.trip.days[0]!.items[2] as { stop: { placeId: string } }).stop.placeId = placeId;
      programme.proposals[0]!.stop = { ...programme.proposals[0]!.stop, placeId };
      delete programme.positions.SENTINELLE_PLACE_ID;
      expect(ProgrammeReduitSchema.safeParse(programme).success, placeId).toBe(false);
    }
    // Clé propre « __proto__ » telle que JSON.parse la produit : la position est bien présente.
    const programme = exemple();
    (programme.trip.days[0]!.items[2] as { stop: { placeId: string } }).stop.placeId = "constructor";
    programme.proposals[0]!.stop = { ...programme.proposals[0]!.stop, placeId: "constructor" };
    programme.positions = JSON.parse(
      '{"constructor":{"lat":55.95,"lng":-3.18},"SENTINELLE_PLACE_ID_LOGEMENT":{"lat":55.95,"lng":-3.19}}',
    ) as ProgrammeReduit["positions"];
    expect(ProgrammeReduitSchema.safeParse(programme).success).toBe(true);
    const protoSansLieu = exemple();
    protoSansLieu.positions = JSON.parse(
      `{"__proto__":{"lat":1,"lng":2},${JSON.stringify(exemple().positions).slice(1)}`,
    ) as ProgrammeReduit["positions"];
    expect(ProgrammeReduitSchema.safeParse(protoSansLieu).success).toBe(false);
  });

  it("placeIdsDuProgramme couvre étapes, événements, idée « Surprends-moi », propositions et terminus", () => {
    const programme = exemple();
    const jour = programme.trip.days[0]!;
    jour.events = [{ ...programme.proposals[0]!.stop, id: "j1-e1", kind: "event", placeId: "ID_EVENEMENT" }];
    jour.surprise = {
      id: "s1",
      placeId: "ID_IDEE",
      name: "Idée maison",
      facts: {},
      reason: "Raison maison.",
      source: { label: "exemple.org", url: "https://exemple.org/idee" },
    };
    programme.proposals[0]!.stop = { ...programme.proposals[0]!.stop, placeId: "ID_PROPOSITION" };
    programme.terminus = [{ jour: 1, depart: "ID_DEPART", arrivee: "ID_ARRIVEE" }];
    expect([...placeIdsDuProgramme(programme)].sort()).toEqual(
      ["ID_ARRIVEE", "ID_DEPART", "ID_EVENEMENT", "ID_IDEE", "ID_PROPOSITION", "SENTINELLE_PLACE_ID"].sort(),
    );
  });

  it("Day.events ne contient que des étapes de kind « event »", () => {
    const programme = exemple();
    programme.trip.days[0]!.events = [{ ...programme.proposals[0]!.stop, id: "j1-e1", kind: "event" }];
    expect(ProgrammeReduitSchema.safeParse(programme).success).toBe(true);
    programme.trip.days[0]!.events = [{ ...programme.proposals[0]!.stop, id: "j1-e1", kind: "activity" }];
    expect(ProgrammeReduitSchema.safeParse(programme).success).toBe(false);
  });

  it("refuse commitment (étape du programme et proposition) et toute entrée de checklist", () => {
    const etape = exemple();
    (etape.trip.days[0]!.items[2] as { stop: Record<string, unknown> }).stop.commitment = "ticket";
    expect(ProgrammeReduitSchema.safeParse(etape).success).toBe(false);
    const proposition = exemple();
    (proposition.proposals[0]!.stop as Record<string, unknown>).commitment = "reservation";
    expect(ProgrammeReduitSchema.safeParse(proposition).success).toBe(false);
    const checklist = exemple();
    (checklist.trip as Record<string, unknown>).checklist = [
      { id: "c1", label: "Réserver", when: "avant", done: false, bookingUrl: "javascript:alert(1)", sponsored: false },
    ];
    expect(ProgrammeReduitSchema.safeParse(checklist).success).toBe(false);
  });

  it("refuse plus de 8 propositions, unlocked: false et des indices de jour en double", () => {
    const huit = exemple();
    huit.proposals = Array.from({ length: 8 }, (_, index) => ({ ...exemple().proposals[0]!, id: `p${index + 1}` }));
    expect(ProgrammeReduitSchema.safeParse(huit).success).toBe(true);
    const neuf = exemple();
    neuf.proposals = Array.from({ length: 9 }, (_, index) => ({ ...exemple().proposals[0]!, id: `p${index + 1}` }));
    expect(ProgrammeReduitSchema.safeParse(neuf).success).toBe(false);

    const verrouille = exemple();
    (verrouille.trip as Record<string, unknown>).unlocked = false;
    expect(ProgrammeReduitSchema.safeParse(verrouille).success).toBe(false);

    const doublon = exemple();
    doublon.trip.days.push({ ...doublon.trip.days[0]!, items: [], events: [] });
    doublon.terminus.push({ ...doublon.terminus[0]! });
    expect(ProgrammeReduitSchema.safeParse(doublon).success).toBe(false);
    doublon.trip.days[1]!.index = 2;
    doublon.terminus[1]!.jour = 2;
    expect(ProgrammeReduitSchema.safeParse(doublon).success).toBe(true);
  });

  it("exige un terminus par jour et l'organisation org_prototype (uuid fixe, 0046 D15 point 4)", () => {
    const sansTerminus = exemple();
    sansTerminus.terminus = [];
    expect(ProgrammeReduitSchema.safeParse(sansTerminus).success).toBe(false);
    const autreOrganisation = exemple();
    (autreOrganisation.trip as Record<string, unknown>).organizationId = "org_autre";
    expect(ProgrammeReduitSchema.safeParse(autreOrganisation).success).toBe(false);
    // L'ancien identifiant textuel est refusé : seul l'uuid fixe de la migration est admis.
    (autreOrganisation.trip as Record<string, unknown>).organizationId = "org_prototype";
    expect(ProgrammeReduitSchema.safeParse(autreOrganisation).success).toBe(false);
    expect(PROTOTYPE_ORG_ID).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("exige un identifiant de voyage conforme à TRIP_ID_PATTERN", () => {
    for (const id of ["../x", "proto test", "x".repeat(65), ""]) {
      const programme = exemple();
      programme.trip.id = id;
      expect(ProgrammeReduitSchema.safeParse(programme).success, id).toBe(false);
    }
  });

  it("p0: URL de source validée", () => {
    expect(urlSourceValide("https://exemple.org/a")).toBe(true);
    for (const url of [
      "javascript:alert(1)",
      "data:text/html,x",
      "http://exemple.org/",
      "https://moi:secret@exemple.org/",
      `https://exemple.org/${"a".repeat(2048)}`,
      "pas une url",
    ]) {
      expect(urlSourceValide(url), url).toBe(false);
    }
  });

  it("garde des clés qui restent un sous-ensemble des contrats", () => {
    const clesContrat = Object.keys(ProposalSchema.shape);
    for (const cle of Object.keys(PropositionReduiteSchema.shape)) expect(clesContrat, cle).toContain(cle);
    for (const cle of Object.keys(StopReduitSchema.shape)) expect(Object.keys(StopSchema.shape), cle).toContain(cle);
    expect(Object.keys(ProgrammeReduitSchema.shape.trip.shape).sort()).toEqual(Object.keys(TripSchema.shape).sort());
  });
});
