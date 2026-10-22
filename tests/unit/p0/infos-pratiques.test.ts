// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { texteMaison as texteMaisonCopie } from "@/ai/candidat";
import { lireProgramme } from "@/ai/sorties";
import { LONGUEURS_CONTRAT, TripSchema, contientUrl, texteMaison, type Stop } from "@/contracts";
import { BriefSchema } from "@/prototype/brief";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assemblerProgrammeIa, type CreneauAssemble } from "@/server/p0/assemblage";

/**
 * Infos pratiques et titre du jour écrits depuis le programme de l'IA (décision 0116 § 6, lot 1 bis ; contrat de #631,
 * `src/contracts/texte.ts`) : `conseil` → `StopFacts.tip`, `prix` → `priceNote`, `horaires` → `hoursNote`, titre du
 * jour → `Day.theme`. Un texte refusé par la règle du contrat laisse le champ vide, jamais une erreur. Noms maison.
 */

const SEJOUR = { arrivee: "2026-11-23", depart: "2026-11-25" };
const lire = (valeur: unknown) => lireProgramme(JSON.stringify(valeur), SEJOUR);
const visite = (extra: Record<string, unknown> = {}) => ({ debut: "10:00", nature: "visite", lieu: "Musée", pourquoi: "Parce que.", ...extra });

/**
 * Textes refusés par la règle du contrat (`src/contracts/texte.ts`) que ne refusait pas l'ancienne copie de
 * `src/ai/candidat.ts` (avant la PR 652) : domaines `.it`, `.va`, `.nl`, `.es`, séparateur de ligne U+2028, point pleine
 * chasse U+FF0E. Les caractères invisibles sont écrits en échappement, pour être lisibles en revue.
 */
const REFUSES_PAR_LE_CONTRAT = [
  "Billets sur museo.it",
  "Voir museo.va",
  "museo.nl",
  "Infos sur museo.es",
  "Ouvert\u2028de 9:00 à 18:00",
  "Voir musee\uFF0Ecom",
];

describe("infos pratiques : lecture par la règle du contrat (0116 § 6, lot 1 bis)", () => {
  it("infos pratiques : chaque texte de la table est refusé par la règle du contrat, celle de src/ai/candidat.ts", () => {
    // Verdict direct du contrat sur chaque chaîne ; `src/ai/candidat.ts` réexporte la même fonction (ticket 633).
    expect(texteMaisonCopie).toBe(texteMaison);
    for (const texte of REFUSES_PAR_LE_CONTRAT) expect(texteMaison(LONGUEURS_CONTRAT.tip).safeParse(texte).success, texte).toBe(false);
    expect(REFUSES_PAR_LE_CONTRAT.filter((texte) => contientUrl(texte))).toHaveLength(REFUSES_PAR_LE_CONTRAT.length - 1);
  });

  it("infos pratiques : conseil, prix, horaires ou titre du jour refusés par le contrat, champ seul retiré et compté", () => {
    for (const texte of REFUSES_PAR_LE_CONTRAT) {
      for (const champ of ["conseil", "prix", "horaires"] as const) {
        const lecture = lire({ jours: [{ date: SEJOUR.arrivee, creneaux: [visite({ [champ]: texte })] }] });
        const creneau = lecture.valeur!.jours[0]!.creneaux[0]!;
        expect(creneau.lieu, `${champ} : ${texte}`).toBe("Musée");
        expect(creneau[champ], `${champ} : ${texte}`).toBeUndefined();
        expect(lecture.champsRetires, `${champ} : ${texte}`).toBe(1);
        expect(lecture.creneauxRetires).toBe(0);
      }
      const lecture = lire({ jours: [{ date: SEJOUR.arrivee, titre: texte, creneaux: [visite()] }] });
      expect(lecture.valeur!.jours[0]!.titre, texte).toBeUndefined();
      expect(lecture.valeur!.jours[0]!.creneaux).toHaveLength(1);
      expect(lecture.champsRetires, texte).toBe(1);
      expect(lecture.joursRetires).toBe(0);
    }
  });

  it("infos pratiques : texte admis gardé, espaces retirés, trop long coupé à la longueur du contrat", () => {
    const long = `${"Viens tôt le matin ".repeat(12)}fin`;
    const lecture = lire({
      jours: [{ date: SEJOUR.arrivee, titre: "  Vieille ville  ", creneaux: [visite({ conseil: long, prix: "  12 € par personne ", horaires: "9:30 à 18:00" })] }],
    });
    const jour = lecture.valeur!.jours[0]!;
    expect(jour.titre).toBe("Vieille ville");
    const creneau = jour.creneaux[0]!;
    expect(creneau.prix).toBe("12 € par personne");
    expect(creneau.horaires).toBe("9:30 à 18:00");
    expect(creneau.conseil!.length).toBeLessThanOrEqual(LONGUEURS_CONTRAT.tip);
    expect(long.startsWith(creneau.conseil!)).toBe(true);
    expect(lecture.textesCoupes).toBe(1);
    expect(lecture.champsRetires).toBe(0);
  });

  it("infos pratiques : un domaine que la coupe tronquerait est refusé sur le texte entier", () => {
    // « museo.it » au-delà de la coupe : refusé avant la coupe (le texte coupé ne le contiendrait plus).
    const texte = `${"Réserve à l'avance ".repeat(8)}sur museo.it`;
    expect(texte.length).toBeGreaterThan(LONGUEURS_CONTRAT.tip);
    const lecture = lire({ jours: [{ date: SEJOUR.arrivee, creneaux: [visite({ conseil: texte })] }] });
    expect(lecture.valeur!.jours[0]!.creneaux[0]!.conseil).toBeUndefined();
    expect(lecture.champsRetires).toBe(1);
  });
});

describe("infos pratiques : assemblage dans les étapes et les jours (0116 § 6, lot 1 bis)", () => {
  const brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")));
  const logements = brief.logements.map((_, rang) => `SENTINELLE_LOGEMENT_${rang + 1}`);
  const assembler = (titre: string | undefined, creneaux: CreneauAssemble[]) =>
    assemblerProgrammeIa({
      tripId: "proto_edimbourg_20261021_1",
      brief,
      jours: [{ date: brief.arrivee, ...(titre === undefined ? {} : { titre }), creneaux }],
      bonsPlans: [],
      logements,
      configuration: CONFIGURATION_MOTEUR,
      mode: "walk",
      trajets: () => 12,
    }).trip;
  const etapes = (trip: ReturnType<typeof assembler>): Stop[] => trip.days[0]!.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
  const creneau = (extra: Partial<CreneauAssemble> = {}): CreneauAssemble => ({ debut: "10:00", fin: "11:30", nature: "visite", lieu: "Musée", quartier: "Vieille ville", pourquoi: "Parce que.", ...extra });

  it("infos pratiques : conseil, prix, horaires et titre du jour recopiés dans tip, priceNote, hoursNote et theme", () => {
    const trip = assembler("Vieille ville et château", [creneau({ conseil: "Viens tôt.", prix: "12 €", horaires: "9:30 à 18:00" })]);
    TripSchema.parse(trip);
    expect(trip.days[0]!.theme).toBe("Vieille ville et château");
    expect(etapes(trip)[0]!.facts).toEqual({ durationMinutes: 90, area: "Vieille ville", tip: "Viens tôt.", priceNote: "12 €", hoursNote: "9:30 à 18:00" });
  });

  it("infos pratiques : sans info ni titre, aucun champ écrit (pas de valeur inventée)", () => {
    const trip = assembler(undefined, [creneau()]);
    expect(trip.days[0]).not.toHaveProperty("theme");
    expect(etapes(trip)[0]!.facts).toEqual({ durationMinutes: 90, area: "Vieille ville" });
  });

  it("infos pratiques : texte refusé par le contrat à l'assemblage, champ vide, jamais d'erreur", () => {
    // Entrée qui ne serait pas passée par `lireProgramme` : l'assemblage applique de nouveau la règle du contrat.
    const trop = (max: number) => "a".repeat(max + 1);
    for (const texte of [...REFUSES_PAR_LE_CONTRAT, "<b>gras</b>", "   ", ""]) {
      const trip = assembler(texte, [creneau({ conseil: texte, prix: texte, horaires: texte })]);
      TripSchema.parse(trip);
      expect(trip.days[0], texte).not.toHaveProperty("theme");
      expect(etapes(trip)[0]!.facts, texte).toEqual({ durationMinutes: 90, area: "Vieille ville" });
    }
    const trip = assembler(trop(LONGUEURS_CONTRAT.theme), [
      creneau({ conseil: trop(LONGUEURS_CONTRAT.tip), prix: trop(LONGUEURS_CONTRAT.priceNote), horaires: trop(LONGUEURS_CONTRAT.hoursNote) }),
    ]);
    expect(trip.days[0]).not.toHaveProperty("theme");
    expect(etapes(trip)[0]!.facts).toEqual({ durationMinutes: 90, area: "Vieille ville" });
  });

  it("infos pratiques : seul le texte de l'IA est recopié, jamais une donnée de fiche (aucun champ Google dans l'entrée)", () => {
    // L'entrée de l'assemblage n'a aucun champ pour une donnée Google : une clé glissée par erreur n'est pas recopiée.
    const glisse = { ...creneau(), nom: "SENTINELLE-NOM-GOOGLE", niveauPrix: "SENTINELLE_NIVEAU_PRIX", horairesGoogle: "SENTINELLE-HORAIRES" } as CreneauAssemble;
    const trip = assembler(undefined, [glisse]);
    expect(JSON.stringify(trip)).not.toMatch(/SENTINELLE[-_](?:NOM|NIVEAU|HORAIRES)/);
  });
});
