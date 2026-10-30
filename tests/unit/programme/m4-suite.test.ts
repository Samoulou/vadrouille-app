// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSchema, type Brief, type Day, type DayLineItem, type TripDraft } from "@/contracts";
import { voisins } from "@/domain/calculs";
import { chevauchementDuChangement, departEstime, villeDeLEngagement, type EngagementLu } from "@/domain/changement-de-ville";
import { ConfigurationMoteurSchema, type ConfigurationMoteur } from "@/domain/configuration";
import type { JourProgramme } from "@/domain/programme";
import { formatContexte } from "@/features/presentation/contexte";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assemblerProgrammeIa, modeDeTrajet, type CreneauAssemble } from "@/server/programme/assemblage";
import { briefProgrammeDepuisFormulaire } from "@/server/programme/brief";
import { cadrerProgramme } from "@/server/programme/cadrage";
import { entreeProgrammeV5DepuisBrief } from "@/server/programme/entree";
import type { BriefProgramme } from "@/server/programme/forme";

/**
 * Journée du changement de ville (M4-suite-back, ticket #942) : critères 1 à 11, 14 et 15 de
 * `specs/M4-suite-changement-de-ville.md` (§ 2, § 3.1 à § 3.8), décisions 0148 (amendement du 2026-10-30) et 0151.
 * Fonctions pures, composition simulée, aucun appel. Voyage du § 9 : Rome du 2027-05-04 au 2027-05-08, puis Florence à
 * partir du 2027-05-06, rythme « équilibré » ; le jour du changement de ville est J3, le 2027-05-06. Les critères 3 et 9
 * (aucun créneau retiré cherché, Text Search) et 8 (`compteurs.slotsRemoved`) sont aussi tenus en base
 * (`tests/db/plusieurs-villes.test.ts`). L'affichage (« départ vers {heure} (estimation) », « arrivée à confirmer », « durée
 * à confirmer ») est celui de la ligne « Vers {ville} » de l'interface ; ici, les données qui le portent.
 */

const C = CONFIGURATION_MOTEUR;
const J3 = "2027-05-06";
const BRIEF: Brief = { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: ["heritage", "museum"], limits: [], mobility: ["walk", "transit"], inferredFields: [] };
const ROME_FLORENCE: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti" },
  otherCities: [{ name: "Florence", arrival: J3, lodging: { kind: "area", label: "Santa Croce" } }],
  commitments: [],
};
type Engagement = TripDraft["commitments"][number];
const billet = (start: string, end?: string, label = "Train Rome–Florence"): Engagement => ({ kind: "ticket", label, date: J3, start, ...(end === undefined ? {} : { end }) });
const vol = (start: string, end?: string): Engagement => ({ kind: "flight", label: "Vol Rome–Florence", date: J3, start, ...(end === undefined ? {} : { end }) });
const sortie = (start: string, end?: string, label = "Sortie", date = J3): Engagement => ({ kind: "booking", label, date, start, ...(end === undefined ? {} : { end }) });

function briefDe(commitments: Engagement[] = [], pace: Brief["pace"] = "balanced", configuration: ConfigurationMoteur = C): BriefProgramme {
  const conversion = briefProgrammeDepuisFormulaire({ ...ROME_FLORENCE, commitments }, { ...BRIEF, pace }, undefined, configuration);
  if (!conversion.ok) throw new Error(conversion.champ);
  return conversion.brief;
}

const creneau = (debut: string, nature: CreneauAssemble["nature"], lieu?: string, extra: Partial<CreneauAssemble> = {}): CreneauAssemble => ({
  debut,
  nature,
  ...(lieu === undefined ? {} : { lieu }),
  ...extra,
});
const visite = (debut: string, fin: string | undefined, lieu: string): CreneauAssemble => creneau(debut, "visite", lieu, fin === undefined ? {} : { fin });

/** Cadrage de J3 seul : lieux gardés (dans l'ordre), avec leur ville, et nombre de créneaux retirés. */
function cadrerJ3(b: BriefProgramme, creneaux: CreneauAssemble[], dureeEstimeeMinutes?: number, configuration: ConfigurationMoteur = C) {
  const jour = { date: J3, ...(dureeEstimeeMinutes === undefined ? {} : { dureeEstimeeMinutes }), creneaux };
  const sortie = cadrerProgramme({ jours: [jour] }, b, configuration);
  const garde = sortie.programme.jours[0]?.creneaux ?? [];
  return { lieux: garde.map((c) => c.lieu), villes: garde.map((c) => [c.lieu, c.ville]), retires: sortie.retires };
}

/** Un seul créneau de l'IA, J3 : `avant` ou `apres` la ligne « Vers Florence », ou `retire`. */
function rangDe(b: BriefProgramme, lu: CreneauAssemble, dureeEstimeeMinutes?: number): "avant" | "apres" | "retire" {
  const { villes } = cadrerJ3(b, [lu], dureeEstimeeMinutes);
  const ville = villes[0]?.[1];
  return ville === undefined ? "retire" : ville === "Rome" ? "avant" : "apres";
}

const DATES = ["2027-05-04", "2027-05-05", J3, "2027-05-07", "2027-05-08"];

/** Assemblage du voyage ; J3 reçoit `creneauxJ3`, les autres jours une visite ordinaire. Rend les lignes et les événements de J3. */
function assemblerJ3(b: BriefProgramme, creneauxJ3: CreneauAssemble[], dureeEstimeeMinutes?: number, configuration: ConfigurationMoteur = C) {
  const jours = DATES.map((date) => ({
    date,
    ...(date === J3 && dureeEstimeeMinutes !== undefined ? { dureeEstimeeMinutes } : {}),
    creneaux: date === J3 ? creneauxJ3 : [visite("10:00", "11:00", `Lieu ${date}`)],
  }));
  const complet = assemblerProgrammeIa({
    tripId: "00000000-0000-4000-8000-0000000000cc",
    organizationId: "00000000-0000-4000-8000-0000000000dd",
    brief: b,
    jours,
    bonsPlans: [],
    logements: ["", ""],
    configuration,
    mode: modeDeTrajet(b),
    trajets: () => undefined,
  });
  expect(TripSchema.parse(complet.trip)).toEqual(complet.trip);
  const jour = complet.trip.days.find((d) => d.date === J3)!;
  return { jour, items: jour.items, trip: complet.trip };
}

/** Lignes de J3 en forme courte : `free de-à`, `stop nom`, `transfer départ`, `start heure`, `end heure` (sans segment). */
function lignes(items: readonly DayLineItem[]): string[] {
  return items.flatMap((item) => {
    switch (item.type) {
      case "terminus":
        return [`${item.role} ${item.time}`];
      case "free":
        return [`free ${item.from}-${item.to}`];
      case "stop":
        return [`stop ${item.stop.name}`];
      case "transfer":
        return [`transfer ${item.start}`];
      default:
        return [];
    }
  });
}

/** Configuration avec une valeur de `changementDeVille` remplacée. */
const avecSection = (section: Partial<ConfigurationMoteur["changementDeVille"]>): unknown => ({ ...C, changementDeVille: { ...C.changementDeVille, ...section } });

describe("M4-suite-back : configuration (critère 1)", () => {
  it("M4-suite: configuration changementDeVille", () => {
    expect(C.changementDeVille).toEqual({
      activitesParRythme: { relaxed: 1, balanced: 2, intense: 2 },
      departEstime: { heureParDefaut: "10:00", limite: "18:00", arrondiMinutes: 15 },
      creneauSansDureeMinutes: 180,
      dureeEstimeeMinutes: { min: 20, max: 600 },
      margesMinutes: { avantDepart: { ticket: 45, flight: 120, estimated: 30 }, apresArrivee: { ticket: 30, flight: 60, estimated: 30 } },
      long: { seuilMinutes: 240, activitesMax: 1 },
    });
    expect(C.seuilTempsLibreMinutes).toBe(30);
    const accepte = (config: unknown) => ConfigurationMoteurSchema.safeParse(config).success;
    const { margesMinutes, departEstime: depart } = C.changementDeVille;
    // Clés exigées.
    const sans = (cle: "margesMinutes" | "long") => ({ ...C, changementDeVille: Object.fromEntries(Object.entries(C.changementDeVille).filter(([nom]) => nom !== cle)) });
    expect(accepte(sans("margesMinutes"))).toBe(false);
    expect(accepte(sans("long"))).toBe(false);
    expect(accepte(avecSection({ departEstime: { heureParDefaut: "10:00", limite: "18:00" } as typeof depart }))).toBe(false);
    // Marges : entiers de 0 à 240.
    const marge = (avantDepart: Record<string, number>) => avecSection({ margesMinutes: { ...margesMinutes, avantDepart: { ...margesMinutes.avantDepart, ...avantDepart } } });
    expect(accepte(marge({ ticket: -1 }))).toBe(false);
    expect(accepte(marge({ flight: 241 }))).toBe(false);
    expect(accepte(marge({ ticket: 0, flight: 240 }))).toBe(true);
    expect(accepte(avecSection({ margesMinutes: { ...margesMinutes, apresArrivee: { ...margesMinutes.apresArrivee, estimated: 241 } } }))).toBe(false);
    // Arrondi : diviseur de 60.
    expect(accepte(avecSection({ departEstime: { ...depart, arrondiMinutes: 7 } }))).toBe(false);
    expect(accepte(avecSection({ departEstime: { ...depart, arrondiMinutes: 20 } }))).toBe(true);
    // Long changement de ville : jamais au-dessus d'une valeur de `activitesParRythme` (relaxed : 1).
    expect(accepte(avecSection({ long: { seuilMinutes: 240, activitesMax: 2 } }))).toBe(false);
    // Somme du § 2 : 18:00 + 30 + 15 + 180 + 30 = 22:15, sous 22:30 ; limite à 18:30 : 22:45, refusée.
    expect(accepte(C)).toBe(true);
    expect(accepte(avecSection({ departEstime: { ...depart, limite: "18:30" } }))).toBe(false);
    expect(accepte(avecSection({ departEstime: { ...depart, limite: "18:15" } }))).toBe(true);
  });
});

describe("M4-suite-back : départ estimé (critère 2, § 3.1)", () => {
  it("M4-suite: départ estimé", () => {
    const lu = (engagements: Engagement[]): EngagementLu[] => engagements.map((e) => ({ kind: e.kind, date: e.date, start: e.start, ...(e.end === undefined ? {} : { end: e.end }) }));
    const tableau: [Engagement[], string][] = [
      [[], "10:00"],
      [[sortie("10:00", "11:30")], "12:00"],
      [[sortie("10:00")], "12:00"],
      [[sortie("11:00", "11:40")], "12:15"],
      [[sortie("08:30", "09:10")], "10:00"],
      [[sortie("17:00", "19:00")], "10:00"],
      [[sortie("20:00", undefined, "Dîner")], "10:00"],
      [[sortie("10:00", "11:30"), sortie("20:00", undefined, "Dîner")], "12:00"],
      [[sortie("16:00", "18:00")], "18:30"],
    ];
    for (const [engagements, attendu] of tableau) {
      expect(departEstime(lu(engagements), J3, C), JSON.stringify(engagements)).toBe(attendu);
      // Le brief et la ligne « Vers Florence » portent ce départ, en source `estimated` (« départ vers {heure} (estimation) »).
      const b = briefDe(engagements);
      expect(b.changements[0]).toMatchObject({ source: "estimated", depart: attendu });
      const transfer = assemblerJ3(b, [], 120).items.find((item) => item.type === "transfer");
      expect(transfer).toMatchObject({ type: "transfer", source: "estimated", start: attendu });
    }
    // Un engagement d'un autre jour ne compte pas.
    expect(departEstime(lu([sortie("10:00", "11:30", "Sortie", "2027-05-05")]), J3, C)).toBe("10:00");
  });
});

describe("M4-suite-back : marges, créneau et rangement (critères 3 à 6, § 3.2, § 3.3, § 3.8)", () => {
  it("M4-suite: marges et rangement", () => {
    const train = briefDe([billet("15:05", "16:40")]);
    expect(train.changements[0]).toMatchObject({ source: "entered", nature: "ticket" });
    expect(rangDe(train, visite("13:00", "14:20", "Fin 14:20"))).toBe("avant");
    expect(rangDe(train, visite("13:00", "14:25", "Fin 14:25"))).toBe("retire");
    expect(rangDe(train, visite("17:10", "18:00", "Début 17:10"))).toBe("apres");
    expect(rangDe(train, visite("17:05", "18:00", "Début 17:05"))).toBe("retire");

    const avion = briefDe([vol("15:00", "16:30")]);
    expect(avion.changements[0]).toMatchObject({ source: "entered", nature: "flight" });
    expect(rangDe(avion, visite("12:00", "13:00", "Fin 13:00"))).toBe("avant");
    expect(rangDe(avion, visite("12:00", "13:05", "Fin 13:05"))).toBe("retire");
    expect(rangDe(avion, visite("17:30", "18:30", "Début 17:30"))).toBe("apres");
    expect(rangDe(avion, visite("17:25", "18:30", "Début 17:25"))).toBe("retire");

    // Départ estimé à 12:00 (Sortie de 10:00 à 11:30), 120 minutes estimées.
    const estime = briefDe([sortie("10:00", "11:30")]);
    expect(estime.changements[0]).toMatchObject({ source: "estimated", depart: "12:00" });
    expect(rangDe(estime, visite("10:30", "11:30", "Fin 11:30"), 120)).toBe("avant");
    expect(rangDe(estime, visite("10:30", "11:35", "Fin 11:35"), 120)).toBe("retire");
    expect(rangDe(estime, visite("14:30", "15:30", "Début 14:30"), 120)).toBe("apres");
    expect(rangDe(estime, visite("14:25", "15:30", "Début 14:25"), 120)).toBe("retire");
    // Une étape sans `fin` est rangée par sa fin occupée (durée par défaut : 90 minutes).
    expect(rangDe(train, visite("12:50", undefined, "Sans fin 14:20"))).toBe("avant");
    expect(rangDe(train, visite("12:55", undefined, "Sans fin 14:25"))).toBe("retire");
  });

  it("M4-suite: billet sans heure de fin", () => {
    const b = briefDe([billet("15:05")]);
    expect(b.changements[0]).toMatchObject({ source: "entered", depart: "15:05" });
    expect(b.changements[0]?.arrivee).toBeUndefined();
    // Créneau de planification de 180 minutes (18:05), plus 30 minutes de marge après l'arrivée.
    expect(rangDe(b, visite("18:35", "19:30", "Début 18:35"))).toBe("apres");
    expect(rangDe(b, visite("18:30", "19:30", "Début 18:30"))).toBe("retire");
    const { items } = assemblerJ3(b, [visite("12:00", "13:00", "Matin"), visite("18:35", "19:30", "Soir")]);
    const transfer = items.find((item) => item.type === "transfer");
    // « Train Rome–Florence, départ à 15:05, arrivée à confirmer » : libellé et départ, ni arrivée ni durée inventées.
    expect(transfer).toEqual({ type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "15:05", label: "Train Rome–Florence" });
    const rang = items.findIndex((item) => item.type === "transfer");
    expect(lignes(items.slice(rang + 1))).toEqual(["stop Soir", "end 19:30"]);
  });

  it("M4-suite: départ estimé sans durée", () => {
    const b = briefDe();
    expect(b.changements[0]).toMatchObject({ source: "estimated", depart: "10:00" });
    expect(rangDe(b, visite("13:30", "14:30", "Début 13:30"))).toBe("apres");
    expect(rangDe(b, visite("13:25", "14:30", "Début 13:25"))).toBe("retire");
    // « durée à confirmer » : ni `estimatedMinutes` ni `end` sur la ligne.
    const transfer = assemblerJ3(b, [visite("13:30", "14:30", "Après")]).items.find((item) => item.type === "transfer");
    expect(transfer).toEqual({ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00", mode: "transit" });
  });

  it("M4-suite: fin du jour", () => {
    // Sortie de 16:00 à 18:00 : départ estimé 18:30 ; 600 minutes estimées, bien après la fin du jour.
    const tard = briefDe([sortie("16:00", "18:00")]);
    expect(tard.changements[0]?.depart).toBe("18:30");
    const { lieux } = cadrerJ3(tard, [visite("10:00", "11:00", "Matin"), visite("22:00", "22:20", "Tard"), creneau("21:00", "soiree", "Soirée")], 600);
    expect(lieux).toEqual(["Matin"]);
    const { items } = assemblerJ3(tard, [visite("10:00", "11:00", "Matin"), creneau("21:00", "soiree", "Soirée")], 600);
    const transfer = items.find((item) => item.type === "transfer");
    // Durée affichée comme estimation, sans heure d'arrivée ; la ligne finit la journée avant le terminus `end`.
    expect(transfer).toMatchObject({ source: "estimated", start: "18:30", estimatedMinutes: 600 });
    expect(transfer).not.toHaveProperty("end");
    expect(lignes(items).slice(-2)).toEqual(["transfer 18:30", "end 18:30"]);

    // Billet à 07:00, de 07:00 à 08:30 : ni étape ni « Temps libre » avant la ligne (une étape de l'IA à 05:00 est retirée).
    const tot = briefDe([billet("07:00", "08:30")]);
    expect(cadrerJ3(tot, [visite("05:00", "06:00", "Avant l'aube")]).lieux).toEqual([]);
    const matin = assemblerJ3(tot, [visite("05:00", "06:00", "Avant l'aube"), visite("10:00", "11:00", "Duomo")]).items;
    expect(lignes(matin).slice(0, 2)).toEqual(["start 07:00", "transfer 07:00"]);
  });
});

describe("M4-suite-back : temps libre (critère 7, § 3.4)", () => {
  it("M4-suite: temps libre", () => {
    // Départ estimé à 10:00, aucun engagement, aucune étape avant : « Temps libre » de 09:00 à 10:00, puis la ligne.
    const estime = assemblerJ3(briefDe(), [visite("13:00", "14:00", "Duomo")], 120).items;
    expect(lignes(estime)).toEqual(["start 09:00", "free 09:00-10:00", "transfer 10:00", "free 12:00-13:00", "stop Duomo", "end 14:00"]);

    const train = briefDe([billet("15:05", "16:40")]);
    const avant = (fin: string) => {
      const items = assemblerJ3(train, [visite("12:00", fin, "Matin")]).items;
      return lignes(items.slice(0, items.findIndex((item) => item.type === "transfer") + 1)).slice(-3);
    };
    expect(avant("13:30")).toEqual(["stop Matin", "free 13:30-15:05", "transfer 15:05"]);
    expect(avant("14:20")).toEqual(["stop Matin", "free 14:20-15:05", "transfer 15:05"]);

    const apres = (debut: string | undefined) => {
      const items = assemblerJ3(train, debut === undefined ? [] : [visite(debut, "19:00", "Florence")]).items;
      return lignes(items.slice(items.findIndex((item) => item.type === "transfer")));
    };
    expect(apres("18:00")).toEqual(["transfer 15:05", "free 16:40-18:00", "stop Florence", "end 19:00"]);
    expect(apres("17:10")).toEqual(["transfer 15:05", "free 16:40-17:10", "stop Florence", "end 19:00"]);
    // Aucune étape après la ligne : « Temps libre » jusqu'à l'heure du terminus `end`, qui la suit directement.
    expect(apres(undefined)).toEqual(["transfer 15:05", "free 16:40-22:30", "end 22:30"]);

    // Configuration de test : `avantDepart.ticket` à 10. Étape finie à 14:40, écart de 25 minutes : aucune ligne `free`.
    const marges = { ...C.changementDeVille.margesMinutes, avantDepart: { ...C.changementDeVille.margesMinutes.avantDepart, ticket: 10 } };
    const dix = ConfigurationMoteurSchema.parse(avecSection({ margesMinutes: marges }));
    const serre = assemblerJ3(briefDe([billet("15:05", "16:40")], "balanced", dix), [visite("13:30", "14:40", "Serré")], undefined, dix).items;
    expect(lignes(serre.slice(0, serre.findIndex((item) => item.type === "transfer") + 1)).slice(-2)).toEqual(["stop Serré", "transfer 15:05"]);

    // Arrivée « à confirmer » (départ estimé sans durée, billet sans heure de fin) : aucune ligne `free` juste après la ligne.
    for (const b of [briefDe(), briefDe([billet("10:00")])]) {
      const items = assemblerJ3(b, [visite("15:00", "16:00", "Après")]).items;
      expect(items[items.findIndex((item) => item.type === "transfer") + 1]?.type).not.toBe("free");
    }
  });
});

describe("M4-suite-back : activités, long changement de ville et repas (critères 8 et 9, § 3.6, § 3.7)", () => {
  it("M4-suite: long changement de ville", () => {
    // Billet de 09:00 à 14:00 (300 minutes), rythme intense : au plus 1 activité ; repas non comptés.
    const long = briefDe([billet("09:00", "14:00")], "intense");
    expect(long.changements[0]?.activitesMax).toBe(1);
    const sortie = cadrerJ3(long, [visite("15:00", "16:00", "Première"), visite("16:30", "17:30", "Deuxième"), creneau("19:30", "repas_soir", "Dîner", { fin: "21:00" })]);
    expect(sortie.lieux).toEqual(["Première", "Dîner"]);
    expect(sortie.retires).toBe(1);
    // Le maximum est aussi garanti par le cadrage quand le brief porterait le maximum du rythme (second contrôle).
    const brut: BriefProgramme = { ...long, changements: [{ ...long.changements[0]!, activitesMax: 2 }] };
    expect(cadrerJ3(brut, [visite("15:00", "16:00", "Première"), visite("16:30", "17:30", "Deuxième")]).lieux).toEqual(["Première"]);

    // Départ estimé avec 240 minutes estimées : au plus 1 activité (départ 10:00, après 14:30).
    const estime = briefDe([], "intense");
    expect(estime.changements[0]?.activitesMax).toBe(2);
    expect(cadrerJ3(estime, [visite("15:00", "16:00", "Première"), visite("16:30", "17:30", "Deuxième")], 240).lieux).toEqual(["Première"]);
    expect(cadrerJ3(estime, [visite("15:00", "16:00", "Première"), visite("16:30", "17:30", "Deuxième")], 235).lieux).toEqual(["Première", "Deuxième"]);
    // Départ estimé sans durée : la journée n'est pas longue, 2 activités en « équilibré ».
    expect(cadrerJ3(briefDe(), [visite("14:00", "15:00", "Première"), visite("15:30", "16:30", "Deuxième"), visite("17:00", "18:00", "Troisième")]).lieux).toEqual([
      "Première",
      "Deuxième",
    ]);
  });

  it("M4-suite: repas", () => {
    const b = briefDe();
    const sortie = cadrerJ3(
      b,
      [
        creneau("13:00", "repas_midi", "Premier déjeuner", { fin: "14:00" }),
        creneau("14:00", "repas_midi", "Second déjeuner", { fin: "15:00" }),
        creneau("18:00", "apero", "Apéro", { fin: "19:00" }),
        creneau("19:30", "repas_soir", "Dîner", { fin: "21:00" }),
      ],
      120,
    );
    expect(sortie.lieux).toEqual(["Premier déjeuner", "Dîner"]);
    expect(sortie.retires).toBe(2);
    // Un déjeuner de 12:30 à 13:45 avec un billet de 13:00 à 15:00 : retiré, sans texte de remplacement.
    const train = briefDe([billet("13:00", "15:00")]);
    expect(rangDe(train, creneau("12:30", "repas_midi", "Déjeuner", { fin: "13:45" }))).toBe("retire");
    const items = assemblerJ3(train, [creneau("12:30", "repas_midi", "Déjeuner", { fin: "13:45" })]).items;
    expect(lignes(items)).toEqual(["start 09:00", "free 09:00-13:00", "transfer 13:00", "free 15:00-22:30", "end 22:30"]);
    // Sortie maximale de l'IA : au plus 4 lieux gardés (2 activités, 1 déjeuner, 1 dîner), donc au plus 4 lieux à vérifier.
    const max = cadrerJ3(
      b,
      [
        visite("09:00", "09:30", "Matin"),
        creneau("12:30", "repas_midi", "Déjeuner", { fin: "13:30" }),
        visite("14:00", "15:00", "Après-midi"),
        visite("15:30", "16:30", "En trop"),
        creneau("17:00", "apero", "Apéro", { fin: "18:00" }),
        creneau("19:00", "repas_soir", "Dîner", { fin: "20:30" }),
        creneau("20:30", "repas_soir", "Second dîner", { fin: "22:00" }),
        creneau("21:00", "soiree", "Soirée"),
      ],
      120,
    );
    expect(max.lieux).toEqual(["Matin", "Déjeuner", "Après-midi", "Dîner"]);
    expect(max.retires).toBe(4);
  });
});

describe("M4-suite-back : contexte, engagements et chevauchement (critères 10 et 11, § 3.5, § 3.6 point 4, § 5)", () => {
  /** Jour assemblé tel que le lit `voisins` (instantané). */
  const programme = (jour: Day): Pick<JourProgramme, "items" | "generating"> => ({ items: jour.items as JourProgramme["items"], generating: false });
  const noms = (jour: Day) => jour.items.flatMap((item) => (item.type === "stop" ? [{ id: item.stop.id, name: item.stop.name }] : []));

  it("M4-suite: contexte avec déjeuner", () => {
    // J3 : départ estimé à 10:00 (120 minutes), déjeuner à Florence à 12:30, visite à 15:00 ; carte de l'après-midi à 14:30.
    const creneaux = [creneau("12:30", "repas_midi", "Trattoria", { fin: "13:45" }), visite("15:00", "16:00", "Offices")];
    const { jour, trip } = assemblerJ3(briefDe(), creneaux, 120);
    const contexte = formatContexte(voisins(programme(jour), { time: "14:30", stopId: "carte" }, C), noms(jour));
    // Même ligne de contexte qu'un jour ordinaire (J4, mêmes étapes, aucun changement de ville).
    const ordinaire = assemblerProgrammeIa({
      tripId: trip.id,
      organizationId: trip.organizationId,
      brief: briefDe(),
      jours: [{ date: "2027-05-07", creneaux }],
      bonsPlans: [],
      logements: ["", ""],
      configuration: C,
      mode: "transit",
      trajets: () => undefined,
    }).trip.days[0]!;
    expect(voisins(programme(jour), { time: "14:30", stopId: "carte" }, C)).toEqual({ before: { type: "meal", meal: "lunch" }, after: { type: "stop", stopId: "j3-2" } });
    expect(contexte).toBe(formatContexte(voisins(programme(ordinaire), { time: "14:30", stopId: "carte" }, C), noms(ordinaire)));
    expect(contexte).toContain("déjeuner");
    // Une carte dont le voisin serait de l'autre côté de la ligne (déjeuner de Rome avant le départ) n'a pas ce voisin.
    const autreCote = assemblerJ3(briefDe([billet("15:05")]), [creneau("12:00", "repas_midi", "Rome midi", { fin: "13:00" }), visite("18:40", "19:30", "Soir")]).jour;
    expect(voisins(programme(autreCote), { time: "18:35", stopId: "carte" }, C)).toEqual({ after: { type: "stop", stopId: "j3-2" } });
  });

  it("M4-suite: engagement et ville", () => {
    const changement = { depart: "12:00" };
    const lu = (start: string, end?: string): EngagementLu => ({ kind: "booking", date: J3, start, ...(end === undefined ? {} : { end }) });
    expect(villeDeLEngagement(lu("11:30", "12:30"), changement, C)).toBe("vers");
    expect(villeDeLEngagement(lu("09:30", "11:00"), changement, C)).toBe("de");
    // Sans heure de fin : fin occupée 13:00 (90 minutes) → Florence.
    expect(villeDeLEngagement(lu("11:30"), changement, C)).toBe("vers");

    // La Sortie reste dans `Day.events` avec ses heures et n'entre pas dans `Day.items`.
    const b = briefDe([billet("12:00", "13:30"), sortie("11:30", "12:30", "Concert")]);
    const { jour } = assemblerJ3(b, []);
    expect(jour.events).toEqual([expect.objectContaining({ kind: "event", name: "Concert", start: "11:30", end: "12:30", commitment: "reservation" })]);
    expect(jour.items.some((item) => item.type === "stop" && item.stop.name === "Concert")).toBe(false);
    // Elle chevauche la ligne affichée (12:00 à 13:30) : la fonction du bandeau la rend.
    expect(chevauchementDuChangement(jour.items, jour.events)).toEqual({ vers: "Florence", source: "entered", engagements: [jour.events[0]] });

    // Sortie à 11:30 sans heure de fin, billet à 12:00 : Florence (ci-dessus), mais aucun chevauchement (cas limite).
    const sansFin = assemblerJ3(briefDe([billet("12:00", "13:30"), sortie("11:30", undefined, "Visite libre")]), []).jour;
    expect(sansFin.events[0]).not.toHaveProperty("end");
    expect(chevauchementDuChangement(sansFin.items, sansFin.events)).toBeUndefined();
  });

  it("M4-suite: fonction du chevauchement (contrat de lecture pour le bandeau de M4-suite-front)", () => {
    const transfer = (extra: Partial<Extract<DayLineItem, { type: "transfer" }>>): DayLineItem[] => [
      { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "12:00", end: "13:30", label: "Train", ...extra },
    ];
    const ev = (start: string, end?: string) => ({ start, ...(end === undefined ? {} : { end }) });
    const saisi = transfer({});
    const qui = (items: DayLineItem[], events: { start: string; end?: string }[]) => chevauchementDuChangement(items, events)?.engagements.map((e) => e.start);
    expect(qui(saisi, [ev("11:30", "12:30")])).toEqual(["11:30"]);
    expect(qui(saisi, [ev("13:30", "14:00")])).toBeUndefined();
    expect(qui(saisi, [ev("12:30")])).toEqual(["12:30"]);
    expect(qui(saisi, [ev("11:00")])).toBeUndefined();
    // Dans la marge de 30 minutes après l'arrivée : les marges ne comptent pas.
    expect(qui(saisi, [ev("13:45")])).toBeUndefined();
    expect(qui(saisi, [ev("11:30", "12:30"), ev("13:00", "14:00"), ev("15:00")])).toEqual(["11:30", "13:00"]);
    // Départ estimé à 10:00 avec 480 minutes : Sortie de 17:00 à 19:00, source `estimated` (« d'après la durée estimée »).
    const estime: DayLineItem[] = [{ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00", estimatedMinutes: 480 }];
    expect(chevauchementDuChangement(estime, [ev("17:00", "19:00")])).toEqual({ vers: "Florence", source: "estimated", engagements: [ev("17:00", "19:00")] });
    // Arrivée « à confirmer » : aucun intervalle, aucun chevauchement, quelle que soit l'heure.
    const inconnue: DayLineItem[] = [{ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00" }];
    expect(chevauchementDuChangement(inconnue, [ev("10:30", "11:00"), ev("12:00")])).toBeUndefined();
    expect(chevauchementDuChangement(transfer({ end: undefined }), [ev("12:30", "13:00")])).toBeUndefined();
    // Aucun `transfer` (jour ordinaire, une seule ville) : rien.
    expect(chevauchementDuChangement([{ type: "free", from: "09:00", to: "10:00" }], [ev("09:30", "10:30")])).toBeUndefined();
  });
});

describe("M4-suite-back : aucune donnée Google, une seule ville et jours ordinaires (critères 14 et 15)", () => {
  it("M4-suite: aucune donnée Google", () => {
    // Le cadre du prompt v5 ne gagne aucun champ : ni nature du billet, ni marge, ni libellé, ni identifiant de lieu.
    const b = briefDe([vol("15:00", "16:30"), sortie("10:00", "11:00", "SENTINELLE_LIBELLE_M4S", "2027-05-05")]);
    const entree = entreeProgrammeV5DepuisBrief(b);
    expect(entree.changements).toEqual([{ date: J3, de: "Rome", vers: "Florence", source: "saisi", depart: "15:00", arrivee: "16:30", activitesMax: 2 }]);
    expect(JSON.stringify(entree)).not.toMatch(/nature|marge|Vol Rome|placeId|SENTINELLE_PLACE/);
    // Le chevauchement ne rend que les engagements reçus (libellé de la personne, heures) et le nom maison de la ville.
    const { jour } = assemblerJ3(briefDe([billet("12:00", "13:30"), sortie("11:30", "12:30", "Concert")]), [creneau("15:00", "visite", "Lieu", { fin: "16:00", placeId: "SENTINELLE_PLACE_M4S" })]);
    const resultat = chevauchementDuChangement(jour.items, jour.events);
    expect(JSON.stringify(resultat)).not.toContain("SENTINELLE_PLACE");
    expect(Object.keys(resultat ?? {})).toEqual(["vers", "source", "engagements"]);
  });

  it("M4-suite: une seule ville et jours ordinaires inchangés", () => {
    // Jour ordinaire d'un voyage à deux villes (J2, J4) : ni marge, ni plafond, ni retrait de repas, ni chevauchement.
    const b = briefDe([sortie("10:00", "11:00", "Musée", "2027-05-05")]);
    const creneaux = [
      visite("09:00", "10:00", "Un"),
      creneau("12:00", "repas_midi", "Midi", { fin: "13:00" }),
      creneau("13:00", "repas_midi", "Second midi", { fin: "14:00" }),
      visite("14:00", "15:00", "Deux"),
      visite("15:00", "16:00", "Trois"),
      creneau("18:00", "apero", "Apéro", { fin: "19:00" }),
      creneau("19:30", "repas_soir", "Soir", { fin: "21:00" }),
    ];
    const cadre = cadrerProgramme({ jours: [{ date: "2027-05-05", creneaux }, { date: "2027-05-07", creneaux }] }, b, C);
    expect(cadre.retires).toBe(0);
    for (const jour of cadre.programme.jours) expect(jour.creneaux.map((c) => c.lieu)).toEqual(creneaux.map((c) => c.lieu));
    const { trip } = assemblerJ3(b, []);
    for (const jour of trip.days.filter((d) => d.date !== J3)) {
      expect(jour.items.some((item) => item.type === "transfer")).toBe(false);
      expect(chevauchementDuChangement(jour.items, jour.events)).toBeUndefined();
    }
    // Les tests existants d'une seule ville (Édimbourg : assemblage, Journée, écran 1) passent sans modification : le brief
    // d'une seule ville (`BriefEssai`) ne porte pas d'heure de fin. À plusieurs villes, l'heure de fin saisie est gardée
    // dans `Day.events`, tous les jours, pour la fonction du chevauchement.
    const musee = trip.days.find((d) => d.date === "2027-05-05")!.events;
    expect(musee).toEqual([expect.objectContaining({ name: "Musée", start: "10:00", end: "11:00" })]);
  });
});
