// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { DayLineItem } from "@/contracts";
import { CRENEAUX_PAR_JOUR_MAX, ELEMENTS_LISTE_PROGRAMME_MAX, lireProgramme, lieuxDuProgramme, ordreEcrit } from "@/ai/sorties";
import { LONGUEURS_TEXTE } from "@/ai/candidat";
import { BriefSchema } from "@/prototype/brief";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { assemblerProgrammeIa, pointsDeTrajet, type CreneauAssemble } from "@/server/p0/assemblage";

/**
 * Programme par l'IA, lot 1 (décisions 0115, 0116 § 1 et § 4 ; verdict Sécurité 0117 § 1) : lecture tolérante de la
 * sortie, ordre écrit, lieux distincts à vérifier, assemblage sans replanification. Noms maison seulement.
 */

const SEJOUR = { arrivee: "2026-11-23", depart: "2026-11-25" };
const lire = (valeur: unknown) => lireProgramme(JSON.stringify(valeur), SEJOUR);
const visite = (debut: string, lieu: string, extra: Record<string, unknown> = {}) => ({ debut, nature: "visite", lieu, pourquoi: `Parce que ${lieu}.`, ...extra });

describe("programme: lecture de la sortie de l'IA (0116 § 1, 0117 § 1)", () => {
  it("programme: sortie tolérante, créneau gardé", () => {
    const lecture = lire({
      titre: "Trois jours à pied",
      jours: [
        {
          date: "2026-11-23",
          titre: "Vieille ville",
          creneaux: [
            // Champ facultatif invalide (fin, quartier) : retiré seul, le créneau gardé.
            visite("10:00", "Musée des cartes", { fin: "25:00", quartier: 42 }),
            // Sans pourquoi : créneau retiré (pourquoi obligatoire dès qu'il y a un lieu, A11).
            { debut: "12:00", nature: "repas_midi", lieu: "Cantine du marché" },
            // Sans lieu hors arrivée, départ, pause : retiré.
            { debut: "14:00", nature: "visite", pourquoi: "Pour voir." },
            // Nature hors liste, heure invalide : retirés.
            { debut: "15:00", nature: "shopping", lieu: "Boutique", pourquoi: "Pour acheter." },
            { debut: "9h", nature: "visite", lieu: "Tour", pourquoi: "Pour voir." },
            // Pause sans lieu : gardée.
            { debut: "16:00", fin: "17:00", nature: "pause" },
            // Texte trop long : coupé, compté.
            visite("18:00", "Galerie", { pourquoi: "x".repeat(LONGUEURS_TEXTE.pourquoi + 40) }),
          ],
        },
        // Date hors séjour et date répétée : journées retirées, jamais un refus du programme.
        { date: "2026-12-01", creneaux: [visite("10:00", "Ailleurs")] },
        { date: "2026-11-23", creneaux: [visite("10:00", "Doublon")] },
        // Journée sans créneau valide : gardée (une journée n'est jamais retirée pour un créneau).
        { date: "2026-11-24", creneaux: [{ debut: "10:00", nature: "visite" }] },
      ],
      bonsPlans: Array.from({ length: ELEMENTS_LISTE_PROGRAMME_MAX + 2 }, (_, rang) => `Bon plan ${rang + 1}`),
      alternative: "ignorée",
    });
    expect(lecture.illisible).toBe(false);
    const valeur = lecture.valeur!;
    expect(valeur.titre).toBe("Trois jours à pied");
    expect(valeur.jours.map((jour) => jour.date)).toEqual(["2026-11-23", "2026-11-24"]);
    const [premier, second] = valeur.jours;
    expect(premier!.creneaux.map((creneau) => creneau.debut)).toEqual(["10:00", "16:00", "18:00"]);
    expect(premier!.creneaux[0]!.fin).toBeUndefined();
    expect(premier!.creneaux[0]!.quartier).toBeUndefined();
    expect(premier!.creneaux[2]!.pourquoi).toHaveLength(LONGUEURS_TEXTE.pourquoi);
    expect(second!.creneaux).toEqual([]);
    expect(valeur.bonsPlans).toHaveLength(ELEMENTS_LISTE_PROGRAMME_MAX);
    expect(lecture).toMatchObject({ joursRetires: 2, creneauxRetires: 5, textesCoupes: 1 });
    // fin, quartier, alternative, deux bons plans en trop.
    expect(lecture.champsRetires).toBe(5);
  });

  it("programme: bornes de quantité (créneaux par jour), réponse illisible ou sans journée : valeur nulle", () => {
    const creneaux = Array.from({ length: CRENEAUX_PAR_JOUR_MAX + 3 }, (_, rang) => visite(`${String(6 + Math.floor(rang / 2)).padStart(2, "0")}:${rang % 2 === 0 ? "00" : "30"}`, `Lieu ${rang}`));
    const lecture = lire({ jours: [{ date: "2026-11-23", creneaux }] });
    expect(lecture.valeur!.jours[0]!.creneaux).toHaveLength(CRENEAUX_PAR_JOUR_MAX);
    expect(lecture.creneauxRetires).toBe(3);
    expect(lireProgramme("pas du JSON", SEJOUR)).toMatchObject({ valeur: null, illisible: true });
    expect(lire({ jours: [{ date: "2027-01-01", creneaux: [] }] })).toMatchObject({ valeur: null, illisible: false, joursRetires: 1 });
  });

  it("programme: clé de lieu proposée par l'IA ignorée, jamais lue ni recopiée", () => {
    const lecture = lire({ jours: [{ date: "2026-11-23", creneaux: [visite("10:00", "Musée des cartes", { placeId: "ChIJ_inventé", url: "https://exemple.org", lat: 55.9 })] }] });
    const creneau = lecture.valeur!.jours[0]!.creneaux[0]!;
    expect(Object.keys(creneau).sort()).toEqual(["debut", "lieu", "nature", "pourquoi"]);
    expect(JSON.stringify(lecture.valeur)).not.toMatch(/ChIJ|exemple\.org|55\.9/);
    expect(lecture.champsRetires).toBe(3);
  });

  it("programme: domaine coupé refusé (texte contrôlé entier, coupé, recontrôlé)", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            // Nom de lieu avec un domaine : refusé, donc créneau retiré (lieu obligatoire pour une visite).
            visite("10:00", "Musée www.musee-exemple.org"),
            // Domaine au-delà de la coupe : le texte entier est contrôlé avant la coupe, donc refusé quand même.
            visite("10:30", `Musée ${"des cartes ".repeat(10)}www.musee-exemple.org`),
            // Conseil avec un domaine : seul le conseil est retiré.
            visite("11:00", "Galerie", { conseil: "Réserve sur billets.exemple.com avant." }),
          ],
        },
      ],
    });
    const creneaux = lecture.valeur!.jours[0]!.creneaux;
    expect(creneaux.map((creneau) => creneau.lieu)).toEqual(["Galerie"]);
    expect(creneaux[0]!.conseil).toBeUndefined();
    expect(JSON.stringify(lecture.valeur)).not.toMatch(/exemple/);
  });

  it("programme: pourquoi sur chaque lieu", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            { debut: "09:00", nature: "arrivee" },
            visite("10:00", "Musée des cartes"),
            { debut: "12:00", nature: "repas_midi", lieu: "Cantine" },
            { debut: "13:00", nature: "pause", lieu: "Jardin", pourquoi: "Pour souffler." },
            { debut: "14:00", nature: "pause" },
            { debut: "18:00", nature: "depart" },
          ],
        },
      ],
    });
    const creneaux = lecture.valeur!.jours[0]!.creneaux;
    for (const creneau of creneaux) if (creneau.lieu !== undefined) expect(creneau.pourquoi, creneau.lieu).toBeDefined();
    expect(creneaux.map((creneau) => creneau.nature)).toEqual(["arrivee", "visite", "pause", "pause", "depart"]);
  });

  it("programme: ordre écrit stable par début, lieux distincts dans cet ordre, arrivée et départ jamais vérifiés", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            visite("15:00", "Galerie"),
            { debut: "09:00", nature: "arrivee", lieu: "Gare", pourquoi: "Arrivée en train." },
            visite("11:00", "Musée des cartes"),
            visite("11:00", "Tour de l'horloge"),
            visite("16:00", "galerie"),
            visite("17:00", "Galerie", { ville: "Ville voisine" }),
          ],
        },
      ],
    });
    const ecrit = ordreEcrit(lecture.valeur!);
    expect(ecrit.jours[0]!.creneaux.map((creneau) => creneau.lieu)).toEqual(["Gare", "Musée des cartes", "Tour de l'horloge", "Galerie", "galerie", "Galerie"]);
    const { lieux, cleDe } = lieuxDuProgramme(ecrit, "Édimbourg");
    // « Galerie » et « galerie » : un lieu ; la même dans une autre ville : un autre ; la gare d'arrivée : jamais.
    expect(lieux.map((lieu) => [lieu.lieu, lieu.ville])).toEqual([
      ["Musée des cartes", undefined],
      ["Tour de l'horloge", undefined],
      ["Galerie", undefined],
      ["Galerie", "Ville voisine"],
    ]);
    expect(cleDe(0, 0)).toBeUndefined();
    expect(cleDe(0, 3)).toBe(cleDe(0, 4));
    expect(cleDe(0, 5)).not.toBe(cleDe(0, 3));
  });
});

describe("programme: assemblage sans replanification (0116 § 1.6 à § 1.8, § 3.3)", () => {
  const brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")));
  const logements = brief.logements.map((_, rang) => `SENTINELLE_LOGEMENT_${rang + 1}`);
  const assembler = (creneaux: CreneauAssemble[]) =>
    assemblerProgrammeIa({
      tripId: "proto_edimbourg_20261021_1",
      brief,
      jours: [{ date: brief.arrivee, creneaux }],
      bonsPlans: [],
      logements,
      configuration: CONFIGURATION_MOTEUR,
      mode: "walk",
      trajets: () => 12,
    }).trip.days[0]!.items;
  const libres = (items: DayLineItem[]) => items.flatMap((ligne) => (ligne.type === "free" ? [[ligne.from, ligne.to]] : []));

  it("programme: pause sans lieu gardée en ligne free, fin lue selon § 1.7, sinon bornée par le créneau suivant", () => {
    const etape = (debut: string, lieu: string, placeId?: string): CreneauAssemble => ({ debut, nature: "visite", lieu, pourquoi: "Parce que.", ...(placeId ? { placeId } : {}) });
    // `fin` présente : elle prévaut, même si le créneau suivant commence avant.
    expect(libres(assembler([etape("10:00", "Musée", "SENTINELLE_A"), { debut: "12:00", fin: "15:00", nature: "pause" }, etape("14:00", "Galerie", "SENTINELLE_B")]))).toEqual([["12:00", "15:00"]]);
    // `fin` antérieure au début (passe minuit) : bornée à 23:59.
    expect(libres(assembler([{ debut: "22:00", fin: "01:00", nature: "pause" }]))).toEqual([["22:00", "23:59"]]);
    // Sans `fin` : jusqu'au début du créneau suivant de l'ordre écrit.
    expect(libres(assembler([{ debut: "12:00", nature: "pause" }, etape("14:30", "Galerie", "SENTINELLE_B")]))).toEqual([["12:00", "14:30"]]);
    // Sans `fin` ni créneau suivant : 23:59 (le départ du jour, s'il existe, borne de même).
    expect(libres(assembler([etape("10:00", "Musée"), { debut: "20:00", nature: "pause" }]))).toEqual([["20:00", "23:59"]]);
    expect(libres(assembler([{ debut: "15:00", nature: "pause" }, { debut: "18:00", nature: "depart" }]))).toEqual([["15:00", "18:00"]]);
  });

  it("programme: aucun trajet vers ni depuis une étape sans placeId ; toConfirm jamais écrit", () => {
    const creneaux: CreneauAssemble[] = [
      { debut: "10:00", nature: "visite", lieu: "Musée", pourquoi: "Parce que.", placeId: "SENTINELLE_A" },
      { debut: "12:00", nature: "repas_midi", lieu: "Cantine introuvable", pourquoi: "Parce que.", aReserver: true },
      { debut: "14:00", nature: "visite", lieu: "Galerie", pourquoi: "Parce que.", placeId: "SENTINELLE_B" },
    ];
    const items = assembler(creneaux);
    expect(items.map((ligne) => ligne.type)).toEqual(["terminus", "segment", "stop", "stop", "segment", "stop", "segment", "terminus"]);
    expect(JSON.stringify(items)).not.toContain("toConfirm");
    const etapes = items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));
    expect(etapes.map((stop) => stop.exceptions)).toEqual([[], ["toReserve"], []]);
    expect(etapes[1]!.placeId).toBeUndefined();
    expect(pointsDeTrajet({ brief, jours: [{ date: brief.arrivee, creneaux }], logements })).toEqual([[logements[0], "SENTINELLE_A", "SENTINELLE_B", logements[0]]]);
  });
});

describe("programme: lot 2a, champ site (spécification § 11.2 et § 11.3 ; 0121 § 3.3 ; 0122 § 2.2)", () => {
  it("programme: site lu brut sur un créneau d'étape avec lieu, seule adresse admise", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            visite("10:00", "Musée des cartes", { site: "https://musee-des-cartes.example.org/?lang=fr#horaires" }),
            { debut: "13:00", nature: "pause", lieu: "Jardin", pourquoi: "Pour souffler.", site: "https://jardin.example.org/" },
          ],
        },
      ],
    });
    const [musee, jardin] = lecture.valeur!.jours[0]!.creneaux;
    // Lu brut : la réduction et la forme sont celles de `reduireSite`, jamais de la lecture.
    expect(musee!.site).toBe("https://musee-des-cartes.example.org/?lang=fr#horaires");
    // Une pause avec lieu devient une étape : même règle que tout créneau avec lieu (0122 § 2.2 point 1).
    expect(jardin!.site).toBe("https://jardin.example.org/");
    expect(lecture.champsRetires).toBe(0);
  });

  it("sites: clé url ou website ignorée, site hors créneau de lieu ignoré", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            { debut: "09:00", nature: "arrivee", site: "https://gare.example.org/" },
            { debut: "09:30", nature: "arrivee", lieu: "Gare", pourquoi: "Arrivée.", site: "https://gare.example.org/" },
            visite("10:00", "Musée", { url: "https://musee.example.org/", website: "https://musee.example.org/", source: { url: "https://musee.example.org/" }, lien: "https://musee.example.org/" }),
            { debut: "14:00", nature: "pause", site: "https://pause.example.org/" },
            visite("15:00", "Galerie", { site: 42 }),
            visite("16:00", "Tour", { site: "" }),
            visite("17:00", "Halle", { site: `https://halle.example.org/${"a".repeat(2_100)}` }),
            { debut: "18:00", nature: "depart", lieu: "Gare", pourquoi: "Départ.", site: "https://gare.example.org/" },
          ],
        },
      ],
    });
    const creneaux = lecture.valeur!.jours[0]!.creneaux;
    expect(creneaux.every((creneau) => creneau.site === undefined)).toBe(true);
    expect(JSON.stringify(lecture.valeur)).not.toMatch(/example\.org/);
    // url, website, source, lien : 4 clés inconnues ; site sur arrivée (×2), pause sans lieu, départ, non chaîne, vide, trop long : 7.
    expect(lecture.champsRetires).toBe(11);
    expect(creneaux).toHaveLength(8);
  });

  it("programme: URL hors du champ site toujours refusée", () => {
    const lecture = lire({
      jours: [
        {
          date: "2026-11-23",
          creneaux: [
            visite("10:00", "Musée https://musee.example.org", { site: "https://musee.example.org/" }),
            visite("11:00", "Galerie", {
              site: "https://galerie.example.org/",
              pourquoi: "Voir www.galerie.example.org avant.",
            }),
            visite("12:00", "Halle", {
              site: "https://halle.example.org/",
              conseil: "Réserve sur halle.example.org.",
              prix: "Voir https://halle.example.org/prix",
              horaires: "Sur halle.example.org",
            }),
          ],
        },
      ],
      bonsPlans: ["Billets sur billets.example.org", "Venir tôt"],
    });
    const creneaux = lecture.valeur!.jours[0]!.creneaux;
    // Lieu avec une URL : refusé, donc créneau retiré ; pourquoi avec un domaine : créneau retiré (pourquoi obligatoire).
    expect(creneaux.map((creneau) => creneau.lieu)).toEqual(["Halle"]);
    const halle = creneaux[0]!;
    expect([halle.conseil, halle.prix, halle.horaires]).toEqual([undefined, undefined, undefined]);
    expect(halle.site).toBe("https://halle.example.org/");
    expect(lecture.valeur!.bonsPlans).toEqual(["Venir tôt"]);
  });
});

describe("programme: lot 2a, source écrite depuis le site vérifié (A21 ; 0122 § 1 condition 14, § 2.2 point 2)", () => {
  const brief = BriefSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/rome-1.json"), "utf8")));
  const etapes = (creneaux: CreneauAssemble[]) =>
    assemblerProgrammeIa({
      tripId: "proto_rome_20261022_1",
      brief,
      jours: [{ date: brief.arrivee, creneaux }],
      bonsPlans: [],
      logements: brief.logements.map((_, rang) => `SENTINELLE_LOGEMENT_${rang + 1}`),
      configuration: CONFIGURATION_MOTEUR,
      mode: "walk",
      trajets: () => 12,
    }).trip.days[0]!.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));

  it("p0: source écrite depuis le site vérifié", () => {
    const [colisee, idn, sansSite, sansPlaceId] = etapes([
      { debut: "10:00", nature: "visite", lieu: "Colisée", pourquoi: "Parce que.", placeId: "SENTINELLE_A", site: "https://www.colosseo.example.org/visite" },
      { debut: "12:00", nature: "repas_midi", lieu: "Trattoria", pourquoi: "Parce que.", placeId: "SENTINELLE_B", site: "https://xn--msee-0ra.example.org/" },
      { debut: "14:00", nature: "visite", lieu: "Galerie", pourquoi: "Parce que.", placeId: "SENTINELLE_C" },
      { debut: "16:00", nature: "visite", lieu: "Halle", pourquoi: "Parce que.", site: "https://halle.www.example.org/" },
    ]);
    // `www.` retiré en tête seulement ; url = adresse réduite de l'IA ; aucun verifiedAt.
    expect(colisee!.source).toEqual({ label: "colosseo.example.org", url: "https://www.colosseo.example.org/visite" });
    expect(idn!.source).toEqual({ label: "xn--msee-0ra.example.org", url: "https://xn--msee-0ra.example.org/" });
    expect(sansSite!.source).toBeUndefined();
    // Indépendant du placeId : une étape non vérifiée garde son site vérifié.
    expect(sansPlaceId!.source).toEqual({ label: "halle.www.example.org", url: "https://halle.www.example.org/" });
    for (const stop of [colisee, idn, sansSite, sansPlaceId]) expect(stop).not.toHaveProperty("verifiedAt");
  });

  it("p0: libellé coupé à 120 caractères, adresse illisible sans source", () => {
    const long = `https://${"a".repeat(60)}.${"b".repeat(60)}.example.org/`;
    const [premier, second] = etapes([
      { debut: "10:00", nature: "visite", lieu: "Musée", pourquoi: "Parce que.", site: long },
      { debut: "12:00", nature: "visite", lieu: "Galerie", pourquoi: "Parce que.", site: "pas une adresse" },
    ]);
    expect(premier!.source?.label).toHaveLength(120);
    expect(premier!.source?.url).toBe(long);
    expect(second!.source).toBeUndefined();
  });
});
