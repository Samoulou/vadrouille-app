// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { TripSchema, type Brief, type TripDraft } from "@/contracts";
import type { EntreeProgrammeV5 as EntreeV5DeLIa } from "@/ai/entrees";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assemblerProgrammeIa, modeDeTrajet, type CreneauAssemble } from "@/server/programme/assemblage";
import { briefProgrammeDepuisFormulaire } from "@/server/programme/brief";
import { cadrerProgramme, type BriefCadrage } from "@/server/programme/cadrage";
import { entreeProgrammeV5DepuisBrief, type EntreeProgrammeV5 } from "@/server/programme/entree";
import type { BriefProgramme } from "@/server/programme/forme";

/**
 * Conversion, cadrage et assemblage d'un voyage à deux villes (M4b, ticket #928 ; décision 0148 § 4, § 5.1, § 7.1 et
 * § 8 ; verdict 0149 § 1.2) : fonctions pures, aucun appel.
 */

const C = CONFIGURATION_MOTEUR;
const BRIEF: Brief = {
  travellers: { adults: 2, children: 0 },
  pace: "balanced",
  wishes: ["heritage", "museum", "walk"],
  limits: [],
  mobility: ["walk", "transit"],
  inferredFields: [],
};
/** Rome du 04 au 07.05.2027, Florence du 07 au 09.05.2027 ; départ estimé (aucun billet). */
const DEUX_VILLES: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-09",
  lodging: { kind: "area", label: "Rione Monti" },
  otherCities: [{ name: "Florence", arrival: "2027-05-07", lodging: { kind: "area", label: "Santa Croce" } }],
  commitments: [],
};

function brief(draft: TripDraft = DEUX_VILLES): BriefProgramme {
  const conversion = briefProgrammeDepuisFormulaire(draft, BRIEF, undefined);
  if (!conversion.ok) throw new Error(conversion.champ);
  return conversion.brief;
}

const creneau = (debut: string, nature: CreneauAssemble["nature"], extra: Partial<CreneauAssemble> = {}): CreneauAssemble => ({ debut, nature, ...extra });

describe("conversion du brouillon à plusieurs villes (briefProgrammeDepuisFormulaire)", () => {
  it("villes, logements par ville, changement estimé sans libellé ; une ville hors de la table refusée sur son champ", () => {
    const b = brief();
    expect(b.villes.map((ville) => [ville.nom, ville.arrivee, ville.nuits])).toEqual([
      ["Rome", "2027-05-04", 3],
      ["Florence", "2027-05-07", 2],
    ]);
    expect(b.logements.map((logement) => logement.ville)).toEqual(["Rome", "Florence"]);
    expect(b.changements).toEqual([{ date: "2027-05-07", de: "Rome", vers: "Florence", source: "estimated", depart: "10:00", mode: "transit", activitesMax: 2 }]);
    const inconnue = briefProgrammeDepuisFormulaire({ ...DEUX_VILLES, otherCities: [{ ...DEUX_VILLES.otherCities[0]!, name: "Atlantide-M4b" }] }, BRIEF, undefined);
    expect(inconnue).toEqual({ ok: false, champ: "draft.otherCities.0.name" });
  });

  it("billet devenu changement de ville : libellé dans `billets` seulement, jamais dans les engagements ni dans l'entrée v5", () => {
    const draft: TripDraft = {
      ...DEUX_VILLES,
      commitments: [
        { kind: "ticket", label: "Train LIBELLE_BILLET_M4B", date: "2027-05-07", start: "10:12", end: "11:50" },
        { kind: "booking", label: "Musée du matin", date: "2027-05-05", start: "09:00" },
      ],
    };
    const b = brief(draft);
    expect(b.changements[0]).toMatchObject({ source: "entered", depart: "10:12", arrivee: "11:50" });
    expect(b.billets).toEqual([{ date: "2027-05-07", libelle: "Train LIBELLE_BILLET_M4B" }]);
    expect(b.engagements?.map((e) => e.libelle)).toEqual(["Musée du matin"]);
    const entree = entreeProgrammeV5DepuisBrief(b);
    expect(JSON.stringify(entree)).not.toContain("LIBELLE_BILLET_M4B");
    expect(entree.changements).toEqual([{ date: "2027-05-07", de: "Rome", vers: "Florence", source: "saisi", depart: "10:12", arrivee: "11:50", activitesMax: 2 }]);
    expect(entree.villes.map((ville) => ville.nom)).toEqual(["Rome", "Florence"]);
  });

  it("entrée v5 : même forme que celle du prompt (M4a)", () => {
    // Le type structurel est une intersection (`Omit<…> & {…}`) : aplati avant la comparaison, champ par champ.
    type Aplati<T> = { [K in keyof T]: T[K] };
    expectTypeOf<Aplati<EntreeProgrammeV5>>().toEqualTypeOf<EntreeV5DeLIa>();
  });
});

describe("changement de ville: cadrage (cadrerProgramme, 0148 § 5.1)", () => {
  const b = brief();
  const programme = {
    jours: [
      { date: "2027-05-05", creneaux: [creneau("09:30", "visite", { lieu: "Colisée", ville: "Paris" })] },
      {
        date: "2027-05-07",
        dureeEstimeeMinutes: 120,
        creneaux: [
          creneau("09:00", "visite", { lieu: "Panthéon", fin: "09:45" }),
          creneau("09:30", "visite", { lieu: "À cheval", fin: "10:30" }),
          creneau("11:00", "visite", { lieu: "Dans le créneau" }),
          creneau("12:30", "repas_midi", { lieu: "Trattoria" }),
          creneau("14:00", "visite", { lieu: "Offices", aReserver: true }),
          creneau("16:00", "visite", { lieu: "De trop" }),
        ],
      },
      { date: "2027-05-08", creneaux: [creneau("10:00", "visite", { lieu: "Duomo" })] },
    ],
    bonsPlans: [],
  };
  const cadre = cadrerProgramme(programme, b, C);
  const lieux = (date: string) => cadre.programme.jours.find((jour) => jour.date === date)?.creneaux.map((c) => [c.lieu, c.ville]);

  it("changement de ville: ville de l'IA écrasée par la ville du code", () => {
    expect(lieux("2027-05-05")).toEqual([["Colisée", "Rome"]]);
    expect(lieux("2027-05-08")).toEqual([["Duomo", "Florence"]]);
  });

  it("changement de ville: créneau de l'IA retiré (dans le créneau occupé, à cheval sur le départ) et activités au-delà du rythme retirées", () => {
    // Départ estimé 10:00, 120 minutes : créneau occupé 10:00-12:00 ; rythme équilibré : 2 activités au plus.
    expect(lieux("2027-05-07")).toEqual([
      ["Panthéon", "Rome"],
      ["Trattoria", "Florence"],
      ["Offices", "Florence"],
    ]);
    expect(cadre.retires).toBe(3);
    expect(cadre.programme.jours[1]?.dureeEstimeeMinutes).toBe(120);
  });

  it("changement de ville: aucun toReserve ce jour-là", () => {
    expect(cadre.programme.jours[1]?.creneaux.some((c) => c.aReserver !== undefined)).toBe(false);
  });

  it("idempotent : un programme cadré ressort inchangé, aucun retrait", () => {
    const encore = cadrerProgramme(cadre.programme, b, C);
    expect(encore.programme).toEqual(cadre.programme);
    expect(encore.retires).toBe(0);
  });

  it("durée estimée hors bornes reçue directement : rebornée ou retirée ; ignorée un jour ordinaire", () => {
    const jours = (duree: number) => cadrerProgramme({ jours: [{ ...programme.jours[1]!, dureeEstimeeMinutes: duree }, { ...programme.jours[0]!, dureeEstimeeMinutes: 60 }] }, b, C).programme.jours;
    expect(jours(900)[0]?.dureeEstimeeMinutes).toBeUndefined();
    expect(jours(123)[0]?.dureeEstimeeMinutes).toBe(125);
    expect(jours(123)[1]?.dureeEstimeeMinutes).toBeUndefined();
  });

  it("changement de ville: durée estimée longue bornée à la fin du jour (aucun créneau après la ligne)", () => {
    const tard: BriefCadrage = { villes: b.villes, changements: [{ ...b.changements[0]!, depart: "18:00" }] };
    const jour = { date: "2027-05-07", dureeEstimeeMinutes: 600, creneaux: [creneau("10:00", "visite", { lieu: "Matin", fin: "11:00" }), creneau("21:00", "soiree", { lieu: "Soir" })] };
    const sortie = cadrerProgramme({ jours: [jour] }, tard, C);
    expect(sortie.programme.jours[0]?.creneaux.map((c) => c.lieu)).toEqual(["Matin"]);
    expect(sortie.retires).toBe(1);
  });
});

describe("changement de ville: assemblage (assemblerProgrammeIa, 0148 § 5.1 point 3 (b))", () => {
  it("ligne « Vers Florence » au départ, thème écrit par le code, aucun trajet d'une ville à l'autre, voyage valide", () => {
    const b = brief();
    const jours = ["2027-05-04", "2027-05-05", "2027-05-06", "2027-05-07", "2027-05-08", "2027-05-09"].map((date) => ({
      date,
      titre: "Titre de l'IA",
      ...(date === "2027-05-07" ? { dureeEstimeeMinutes: 120 } : {}),
      creneaux:
        date === "2027-05-07"
          ? [creneau("09:00", "visite", { lieu: "Panthéon", fin: "09:45", placeId: "SENT_PANTHEON" }), creneau("14:00", "visite", { lieu: "Offices", placeId: "SENT_OFFICES" })]
          : [creneau("10:00", "visite", { lieu: `Lieu ${date}`, placeId: `SENT_${date}` })],
    }));
    const complet = assemblerProgrammeIa({
      tripId: "00000000-0000-4000-8000-0000000000cc",
      organizationId: "00000000-0000-4000-8000-0000000000dd",
      brief: b,
      jours,
      bonsPlans: [],
      logements: ["SENT_LOGEMENT_ROME", "SENT_LOGEMENT_FLORENCE"],
      configuration: C,
      mode: modeDeTrajet(b),
      trajets: () => undefined,
    });
    expect(TripSchema.parse(complet.trip)).toEqual(complet.trip);
    const jour = complet.trip.days.find((d) => d.date === "2027-05-07");
    expect(jour?.theme).toBe("De Rome à Florence");
    const items = jour?.items ?? [];
    const rang = items.findIndex((item) => item.type === "transfer");
    expect(items[rang]).toEqual({ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00", estimatedMinutes: 120, mode: "transit" });
    const avant = items.slice(0, rang).flatMap((item) => (item.type === "stop" ? [item.stop.name] : []));
    const apres = items.slice(rang + 1).flatMap((item) => (item.type === "stop" ? [item.stop.name] : []));
    expect(avant).toEqual(["Panthéon"]);
    expect(apres).toEqual(["Offices"]);
    expect(items[rang + 1]?.type).not.toBe("segment");
    // Aucune autre journée ne porte de transfer ; aucune donnée Google dans la ligne.
    expect(complet.trip.days.filter((d) => d.items.some((item) => item.type === "transfer")).map((d) => d.date)).toEqual(["2027-05-07"]);
    expect(JSON.stringify(items[rang])).not.toContain("SENT_");
  });
});
