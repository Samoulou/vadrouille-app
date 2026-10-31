import { describe, expect, it } from "vitest";

import type { Day, Stop, Trip } from "@/contracts";
import { TripSchema } from "@/contracts";
import { tripRoutes } from "@/features/sejour/routes";
import { edimbourgDebloque } from "@/mocks/edimbourg";

import { entreesDuCalendrier, genererIcs, nettoyer, plier, uidEtape, type TextesCalendrier } from "./ics";

/**
 * Fichier `.ics` (spécification M6 § 4 et § 6.2, critères 4 à 10 ; décision 0157 § 1.6 et § 2.5 ; ticket 1005, M6b).
 * Le fichier est relu par une **relecture maison** (dépliage RFC 5545 § 3.1, puis lignes `NOM[;paramètres]:valeur`,
 * puis déséchappement § 3.3.11) : chaque propriété relue doit redonner la valeur écrite.
 */

const TEXTES: TextesCalendrier = { nomCalendrier: "Édimbourg · Programme", aReserver: "À réserver." };
const ORIGINE = "https://app.exemple.test";
const MAINTENANT = new Date("2026-08-01T10:00:00Z");

type Propriete = { nom: string; valeur: string };
type Composant = { type: string; proprietes: Propriete[]; enfants: Composant[] };

/** Lignes physiques du fichier (CRLF), sans la dernière ligne vide. */
function lignesPhysiques(ics: string): string[] {
  expect(ics.endsWith("\r\n")).toBe(true);
  expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  return ics.slice(0, -2).split("\r\n");
}

/** Relecture maison : dépliage, propriétés, composants imbriqués. */
function relire(ics: string): Composant {
  const logiques: string[] = [];
  for (const ligne of lignesPhysiques(ics)) {
    if (ligne.startsWith(" ")) logiques[logiques.length - 1] += ligne.slice(1);
    else logiques.push(ligne);
  }
  const racine: Composant = { type: "", proprietes: [], enfants: [] };
  const pile: Composant[] = [racine];
  for (const ligne of logiques) {
    const deuxPoints = ligne.indexOf(":");
    expect(deuxPoints, ligne).toBeGreaterThan(0);
    const nom = (ligne.slice(0, deuxPoints).split(";")[0] ?? "").toUpperCase();
    const valeur = ligne.slice(deuxPoints + 1);
    const courant = pile[pile.length - 1] as Composant;
    if (nom === "BEGIN") {
      const enfant: Composant = { type: valeur, proprietes: [], enfants: [] };
      courant.enfants.push(enfant);
      pile.push(enfant);
    } else if (nom === "END") {
      expect(courant.type).toBe(valeur);
      pile.pop();
    } else {
      courant.proprietes.push({ nom, valeur });
    }
  }
  expect(pile).toHaveLength(1);
  return racine;
}

/** Déséchappement d'une valeur `TEXT` (RFC 5545 § 3.3.11). */
function texte(valeur: string): string {
  return valeur.replace(/\\([\\;,nN])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

function calendrier(ics: string): Composant {
  const racine = relire(ics);
  expect(racine.enfants).toHaveLength(1);
  const vcal = racine.enfants[0] as Composant;
  expect(vcal.type).toBe("VCALENDAR");
  return vcal;
}

const evenements = (ics: string) => calendrier(ics).enfants.filter((c) => c.type === "VEVENT");
const valeurs = (c: Composant, nom: string) => c.proprietes.filter((p) => p.nom === nom).map((p) => p.valeur);
const une = (c: Composant, nom: string) => {
  const v = valeurs(c, nom);
  expect(v, nom).toHaveLength(1);
  return v[0] as string;
};

const ics = (trip: Pick<Trip, "id" | "timeZone" | "days">, version = 4, origine: string | null = ORIGINE, maintenant = MAINTENANT) =>
  genererIcs({ trip, version }, origine, maintenant, TEXTES);

function etape(partiel: Partial<Stop> & Pick<Stop, "id" | "name" | "start">): Stop {
  return { kind: "activity", facts: {}, exceptions: [], locked: false, ...partiel };
}

function jour(index: number, date: string, stops: Stop[], extra: Partial<Day> = {}): Day {
  return {
    index,
    date,
    items: stops.map((stop) => ({ type: "stop" as const, stop })),
    events: [],
    generating: false,
    travelMinutes: 0,
    travelBudgetMinutes: 120,
    ...extra,
  };
}

const voyage = (days: Day[], timeZone = "Europe/London", id = "4f1c2b9e-0d7a-4c51-9a3e-2b8d6f0e1a77") => ({ id, timeZone, days });

describe("calendrier : en-tête et format (§ 4 point 6, critère 3)", () => {
  it("commence par BEGIN:VCALENDAR, VERSION:2.0, puis PRODID, CALSCALE, METHOD et X-WR-CALNAME", () => {
    const fichier = ics(edimbourgDebloque);
    const lignes = lignesPhysiques(fichier);
    expect(lignes.slice(0, 2)).toEqual(["BEGIN:VCALENDAR", "VERSION:2.0"]);
    expect(lignes.at(-1)).toBe("END:VCALENDAR");
    const vcal = calendrier(fichier);
    expect(une(vcal, "PRODID")).toMatch(/^-\/\/.+\/\/FR$/);
    expect(une(vcal, "CALSCALE")).toBe("GREGORIAN");
    expect(une(vcal, "METHOD")).toBe("PUBLISH");
    expect(texte(une(vcal, "X-WR-CALNAME"))).toBe("Édimbourg · Programme");
  });

  it("le voyage simulé débloqué est un voyage valide du contrat", () => {
    expect(TripSchema.safeParse(edimbourgDebloque).success).toBe(true);
  });
});

describe("calendrier : une entrée par étape, et seulement par étape (critère 4, M6-PO-4)", () => {
  it("autant de VEVENT que d'étapes des journées servies, hors engagements ; ni terminus, temps libre, repas à choisir, idée ni événement", () => {
    const attendues = edimbourgDebloque.days
      .filter((day) => !day.generating)
      .flatMap((day) => day.items.flatMap((item) => (item.type === "stop" && item.stop.commitment === undefined ? [item.stop.name] : [])));
    const vevents = evenements(ics(edimbourgDebloque));
    expect(vevents.length).toBeGreaterThan(5);
    expect(vevents.map((v) => texte(une(v, "SUMMARY")))).toEqual(attendues);

    const resumes = new Set(vevents.map((v) => texte(une(v, "SUMMARY"))));
    for (const day of edimbourgDebloque.days) {
      for (const item of day.items) {
        if (item.type === "terminus") expect(resumes.has(item.label), item.label).toBe(false);
        if (item.type === "stop" && item.stop.commitment !== undefined) expect(resumes.has(item.stop.name), item.stop.name).toBe(false);
      }
      for (const event of day.events) expect(resumes.has(event.name), event.name).toBe(false);
      if (day.surprise) expect(resumes.has(day.surprise.name), day.surprise.name).toBe(false);
    }
    // Le jeu simulé a bien un engagement, des événements, des idées, des terminus et une journée en préparation.
    expect(edimbourgDebloque.days.some((d) => d.items.some((i) => i.type === "stop" && i.stop.commitment !== undefined))).toBe(true);
    expect(edimbourgDebloque.days.some((d) => d.events.length > 0 && d.surprise !== undefined)).toBe(true);
    expect(edimbourgDebloque.days.some((d) => d.generating)).toBe(true);
  });

  it("repas à choisir, temps libre, trajet et changement de ville ne donnent aucune entrée", () => {
    const day: Day = {
      ...jour(1, "2026-08-29", []),
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "[Logement]" },
        { type: "stop", stop: etape({ id: "s1", name: "[Musée]", start: "10:00", end: "11:00" }) },
        { type: "segment", segment: { mode: "walk", minutes: 10, estimated: false } },
        { type: "free", from: "11:10", to: "12:00" },
        { type: "openMeal", time: "12:30", meal: "lunch" },
        { type: "transfer", from: "[Ville A]", to: "[Ville B]", source: "estimated", start: "15:00", estimatedMinutes: 90, mode: "transit" },
        { type: "terminus", role: "end", time: "22:00", label: "[Logement]" },
      ],
    };
    const vevents = evenements(ics(voyage([day])));
    expect(vevents).toHaveLength(1);
    expect(texte(une(vevents[0] as Composant, "SUMMARY"))).toBe("[Musée]");
  });
});

describe("calendrier : heures converties par instantLocal (critère 5, 0157 § 1.6 points 4 et 5)", () => {
  it("Londres en été : « [Bonne table de New Town] » et « [Petite adresse du Grassmarket] » ; une étape sans fin n'a pas de DTEND", () => {
    const vevents = evenements(ics(edimbourgDebloque));
    const par = (nom: string) => vevents.find((v) => texte(une(v, "SUMMARY")) === nom) as Composant;
    expect(une(par("[Bonne table de New Town]"), "DTSTART")).toBe("20260830T180000Z");
    expect(une(par("[Bonne table de New Town]"), "DTEND")).toBe("20260830T193000Z");
    expect(une(par("[Petite adresse du Grassmarket]"), "DTSTART")).toBe("20260829T114500Z");

    const sansFin = evenements(ics(voyage([jour(1, "2026-08-29", [etape({ id: "s", name: "[Promenade]", start: "16:00" })])])));
    expect(valeurs(sansFin[0] as Composant, "DTEND")).toEqual([]);
    expect(une(sansFin[0] as Composant, "DTSTART")).toBe("20260829T150000Z");
  });

  it("Lisbonne, hiver et été ; aucun TZID ni VTIMEZONE", () => {
    const fichier = ics(
      voyage(
        [
          jour(1, "2026-07-14", [etape({ id: "a", name: "[Belém]", start: "09:30", end: "11:00" })]),
          jour(2, "2026-12-03", [etape({ id: "b", name: "[Alfama]", start: "09:30", end: "11:00" })]),
        ],
        "Europe/Lisbon",
      ),
    );
    const [ete, hiver] = evenements(fichier) as [Composant, Composant];
    expect([une(ete, "DTSTART"), une(ete, "DTEND")]).toEqual(["20260714T083000Z", "20260714T100000Z"]);
    expect([une(hiver, "DTSTART"), une(hiver, "DTEND")]).toEqual(["20261203T093000Z", "20261203T110000Z"]);
    expect(fichier).not.toMatch(/TZID|VTIMEZONE/);
  });

  it("passage à l'heure d'hiver le 2026-10-25 (Londres) : veille en BST, jour même en GMT, heure ambiguë à la première occurrence", () => {
    const fichier = ics(
      voyage([
        jour(1, "2026-10-24", [etape({ id: "a", name: "[Veille]", start: "10:00", end: "11:00" })]),
        jour(2, "2026-10-25", [
          etape({ id: "b", name: "[Nuit]", start: "01:30", end: "02:30" }),
          etape({ id: "c", name: "[Jour même]", start: "10:00", end: "11:00" }),
        ]),
      ]),
    );
    const [veille, nuit, jourMeme] = evenements(fichier) as [Composant, Composant, Composant];
    expect(une(veille, "DTSTART")).toBe("20261024T090000Z");
    expect([une(nuit, "DTSTART"), une(nuit, "DTEND")]).toEqual(["20261025T003000Z", "20261025T023000Z"]);
    expect(une(jourMeme, "DTSTART")).toBe("20261025T100000Z");
  });

  it("une fin après minuit tombe le lendemain", () => {
    const [soir] = evenements(ics(voyage([jour(1, "2026-08-29", [etape({ id: "a", name: "[Concert]", start: "23:00", end: "00:30" })])]))) as [Composant];
    expect([une(soir, "DTSTART"), une(soir, "DTEND")]).toEqual(["20260829T220000Z", "20260829T233000Z"]);
  });
});

describe("calendrier : SUMMARY, échappement et pliage (critère 6)", () => {
  it("échappe ;, \\ et le retour à la ligne, et se relit en donnant le même nom", () => {
    const nom = "[Café; bar, \\ terrasse]\nsur le toit";
    const fichier = ics(voyage([jour(1, "2026-08-29", [etape({ id: "a", name: nom, start: "10:00" })])]));
    const summary = une(evenements(fichier)[0] as Composant, "SUMMARY");
    expect(summary).toBe("[Café\\; bar\\, \\\\ terrasse]\\nsur le toit");
    expect(texte(summary)).toBe(nom);
  });

  it("plie un nom long à 75 octets sans couper un caractère UTF-8", () => {
    const nom = `[${"Église Saint-Étienne-du-Mont 🏛️ ".repeat(6)}]`;
    const fichier = ics(voyage([jour(1, "2026-08-29", [etape({ id: "a", name: nom, start: "10:00" })])]));
    const lignes = lignesPhysiques(fichier);
    expect(lignes.some((l) => l.startsWith(" "))).toBe(true);
    for (const ligne of lignes) {
      expect(Buffer.byteLength(ligne, "utf8"), ligne).toBeLessThanOrEqual(75);
      // Aucun demi-caractère : la ligne réencodée puis décodée est identique, sans U+FFFD ni surrogat isolé.
      expect(Buffer.from(ligne, "utf8").toString("utf8")).toBe(ligne);
      expect(ligne).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(texte(une(evenements(fichier)[0] as Composant, "SUMMARY"))).toBe(nom);
  });

  it("plier : une ligne courte reste entière ; la suite commence par une espace", () => {
    expect(plier("SUMMARY:court")).toBe("SUMMARY:court");
    const longue = plier(`SUMMARY:${"é".repeat(80)}`);
    expect(longue.split("\r\n").every((l, i) => i === 0 || l.startsWith(" "))).toBe(true);
  });

  it("injection (S5) : aucun nom ne crée de ligne, propriété ni composant ; un seul SUMMARY par entrée", () => {
    const noms = [
      "[A]\r\nATTACH:https://exemple.test/x",
      "[B]\nBEGIN:VALARM",
      "[C]\rEND:VEVENT",
      "[D]\nEND:VCALENDAR",
      "[E]\u0000X-INJECTE:1",
      "[F]\u2028DESCRIPTION:faux",
      "[G]\u0085LOCATION:faux",
      "[H]\u2029\u200B\u202E\uFEFF\u2066fin",
    ];
    const stops = noms.map((name, i) => etape({ id: `i${i}`, name, start: `1${i}:00` }));
    const fichier = ics(voyage([jour(1, "2026-08-29", stops)]));
    const vcal = calendrier(fichier);
    expect(vcal.enfants.map((c) => c.type)).toEqual(noms.map(() => "VEVENT"));
    for (const vevent of vcal.enfants) {
      expect(vevent.enfants).toEqual([]);
      expect(vevent.proprietes.map((p) => p.nom).sort()).toEqual(["DESCRIPTION", "DTSTAMP", "DTSTART", "SEQUENCE", "SUMMARY", "UID", "URL"].sort());
    }
    expect(vcal.proprietes.map((p) => p.nom)).toEqual(["VERSION", "PRODID", "CALSCALE", "METHOD", "X-WR-CALNAME"]);
    expect(fichier).not.toMatch(/^(ATTACH|BEGIN:VALARM|X-INJECTE|LOCATION)/m);
    const relus = vcal.enfants.map((v) => texte(une(v, "SUMMARY")));
    expect(relus).toEqual([
      "[A]\nATTACH:https://exemple.test/x",
      "[B]\nBEGIN:VALARM",
      "[C]END:VEVENT",
      "[D]\nEND:VCALENDAR",
      "[E]X-INJECTE:1",
      "[F]DESCRIPTION:faux",
      "[G]LOCATION:faux",
      "[H]fin",
    ]);
  });

  it("nettoyer : contrôles retirés, tabulation et U+000A gardés, CRLF ramené à U+000A", () => {
    expect(nettoyer("a\tb\r\nc\rd\u0007e\u007Ff\u0085g\u200Eh")).toBe("a\tb\ncdefgh");
  });
});

describe("calendrier : données Google (critère 7, § 4 point 5, M6-PO-5)", () => {
  it("calendrier: aucune donnée Google hors du nom maison", () => {
    const SENTINELLES = {
      placeId: "SENTINELLE_PLACE_ID_ChIJ",
      area: "SENTINELLE_SECTEUR",
      tip: "SENTINELLE_CONSEIL",
      priceNote: "SENTINELLE_NOTE_PRIX",
      hoursNote: "SENTINELLE_NOTE_HORAIRES",
      reason: "SENTINELLE_RAISON",
      sourceLabel: "SENTINELLE_SOURCE",
      sourceUrl: "https://www.google.com/maps/place/?q=place_id:SENTINELLE",
      surprise: "SENTINELLE_SURPRISE",
      evenement: "SENTINELLE_EVENEMENT",
      terminus: "SENTINELLE_LOGEMENT",
    };
    const piege = etape({
      id: "piege",
      name: "[Nom maison]",
      start: "10:00",
      end: "11:00",
      placeId: SENTINELLES.placeId,
      facts: { area: SENTINELLES.area, tip: SENTINELLES.tip, priceNote: SENTINELLES.priceNote, hoursNote: SENTINELLES.hoursNote, durationMinutes: 61, costPerPerson: 987.65 },
      reason: SENTINELLES.reason,
      source: { label: SENTINELLES.sourceLabel, url: SENTINELLES.sourceUrl },
      verifiedAt: "2026-07-31",
      exceptions: ["toReserve", "toConfirm"],
    });
    const day: Day = {
      ...jour(1, "2026-08-29", [piege]),
      items: [{ type: "terminus", role: "start", time: "09:00", label: SENTINELLES.terminus }, { type: "stop", stop: piege }],
      events: [{ ...piege, id: "ev", kind: "event", name: SENTINELLES.evenement }],
      surprise: { id: "su", placeId: SENTINELLES.placeId, name: SENTINELLES.surprise, facts: {}, reason: SENTINELLES.reason, source: { label: "x", url: "https://exemple.test" } },
    };
    // Positions sentinelles : elles ne sont pas dans `Trip` (carte à part, `getTripMap`) ; le générateur ne reçoit que le
    // voyage. On les glisse quand même dans l'objet pour vérifier qu'aucun champ inconnu n'est recopié.
    const trip = { ...voyage([day]), position: [55.948612345, -3.199912345] };
    const fichier = genererIcs({ trip, version: 3 }, ORIGINE, MAINTENANT, TEXTES);
    for (const valeur of [...Object.values(SENTINELLES), "SENTINELLE", "55.9486", "-3.1999", "987.65", "61", "2026-07-31", "20260731"]) {
      expect(fichier, valeur).not.toContain(valeur);
    }
    expect(fichier).not.toMatch(/^(LOCATION|GEO|ATTACH|ORGANIZER|ATTENDEE|CATEGORIES|COMMENT|CONTACT)[;:]/m);
    expect(fichier.toLowerCase()).not.toContain("google.");
    expect(fichier.toLowerCase()).not.toContain("maps");
    const [vevent] = evenements(fichier) as [Composant];
    expect(texte(une(vevent, "SUMMARY"))).toBe("[Nom maison]");
  });
});

describe("calendrier : DESCRIPTION et URL (critère 8, 0157 § 1.6 point 9)", () => {
  it("« À réserver. » pour une étape toReserve seulement ; URL = adresse de la Journée de l'étape", () => {
    const vevents = evenements(ics(edimbourgDebloque));
    for (const day of edimbourgDebloque.days.filter((d) => !d.generating)) {
      for (const { stop } of entreesDuCalendrier({ days: [day] })) {
        const vevent = vevents.find((v) => une(v, "UID") === uidEtape(edimbourgDebloque.id, stop.id)) as Composant;
        const adresse = `${ORIGINE}${tripRoutes("/voyages", edimbourgDebloque.id).jour(day.index)}`;
        expect(une(vevent, "URL")).toBe(adresse);
        const description = texte(une(vevent, "DESCRIPTION"));
        expect(description).toBe(stop.exceptions.includes("toReserve") ? `À réserver.\n${adresse}` : adresse);
      }
    }
    expect(vevents.some((v) => texte(une(v, "DESCRIPTION")).startsWith("À réserver."))).toBe(true);
    expect(vevents.some((v) => !texte(une(v, "DESCRIPTION")).startsWith("À réserver."))).toBe(true);
  });

  it("sans origine (APP_URL absente) : ni URL ni lien ; DESCRIPTION seulement pour une étape à réserver", () => {
    const fichier = ics(edimbourgDebloque, 4, null);
    expect(fichier).not.toMatch(/^URL:/m);
    expect(fichier).not.toContain("http");
    for (const vevent of evenements(fichier)) {
      const nom = texte(une(vevent, "SUMMARY"));
      const stop = entreesDuCalendrier(edimbourgDebloque).find((e) => e.stop.name === nom)?.stop as Stop;
      expect(valeurs(vevent, "DESCRIPTION").map(texte)).toEqual(stop.exceptions.includes("toReserve") ? ["À réserver."] : []);
    }
  });
});

describe("calendrier : UID et SEQUENCE (critère 9, 0157 § 1.6 point 6)", () => {
  it("UID identique pour la même étape entre deux téléchargements ; DTSTAMP = instant du téléchargement ; SEQUENCE = version", () => {
    const premier = evenements(ics(edimbourgDebloque, 4, ORIGINE, new Date("2026-08-01T10:00:00Z")));
    const second = evenements(ics(edimbourgDebloque, 7, ORIGINE, new Date("2026-08-02T11:30:15Z")));
    expect(premier.map((v) => une(v, "UID"))).toEqual(second.map((v) => une(v, "UID")));
    expect(new Set(premier.map((v) => une(v, "UID"))).size).toBe(premier.length);
    expect(premier.every((v) => une(v, "SEQUENCE") === "4")).toBe(true);
    expect(second.every((v) => une(v, "SEQUENCE") === "7")).toBe(true);
    expect(premier.every((v) => une(v, "DTSTAMP") === "20260801T100000Z")).toBe(true);
    expect(second.every((v) => une(v, "DTSTAMP") === "20260802T113015Z")).toBe(true);
  });

  it("forme : 22 caractères base64url sous vadrouille.invalid, sans identifiant interne en clair ; dépend du voyage et de l'étape", () => {
    const uid = uidEtape("4f1c2b9e-0d7a-4c51-9a3e-2b8d6f0e1a77", "j2-diner");
    expect(uid).toMatch(/^[A-Za-z0-9_-]{22}@vadrouille\.invalid$/);
    expect(uid).not.toContain("j2-diner");
    expect(uidEtape("4f1c2b9e-0d7a-4c51-9a3e-2b8d6f0e1a77", "j2-diner")).toBe(uid);
    expect(uidEtape("autre-voyage", "j2-diner")).not.toBe(uid);
    expect(uidEtape("4f1c2b9e-0d7a-4c51-9a3e-2b8d6f0e1a77", "j2-dejeuner")).not.toBe(uid);
  });
});

describe("calendrier : journées en préparation (critère 10)", () => {
  it("une journée en préparation n'a aucune entrée", () => {
    const j6 = edimbourgDebloque.days.find((d) => d.generating) as Day;
    const noms = new Set(evenements(ics(edimbourgDebloque)).map((v) => texte(une(v, "SUMMARY"))));
    const etapesJ6 = j6.items.flatMap((i) => (i.type === "stop" ? [i.stop.name] : []));
    expect(etapesJ6.length).toBeGreaterThan(0);
    // Un nom du J6 peut exister ailleurs ; on compare par identifiant.
    const uids = new Set(evenements(ics(edimbourgDebloque)).map((v) => une(v, "UID")));
    for (const item of j6.items) if (item.type === "stop") expect(uids.has(uidEtape(edimbourgDebloque.id, item.stop.id))).toBe(false);
    expect(noms.size).toBeGreaterThan(0);
  });

  it("toutes en préparation : aucune entrée", () => {
    const tout = { ...edimbourgDebloque, days: edimbourgDebloque.days.map((d) => ({ ...d, generating: true })) };
    expect(entreesDuCalendrier(tout)).toEqual([]);
    expect(evenements(ics(tout))).toEqual([]);
  });
});
