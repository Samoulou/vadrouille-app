// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import * as copieIa from "@/ai/candidat";
import type { CandidatPourModele } from "@/ai/entrees";
import * as reglagesIa from "@/ai/reglages";
import { urlSourceValide as urlSourceValideR1 } from "@/domain/validation";
import { MODES_ROUTES } from "@/grounding/interfaces";
import { PositionSchema as PositionAncrage } from "@/prototype/ancrage";
import { MODES_DEPLACEMENT } from "@/prototype/brief";
import * as originalCandidat from "@/prototype/candidat";
import * as originalConfig from "@/prototype/config";
import { PositionSchema as PositionReduite, urlSourceValide as urlSourceValideReduite } from "@/prototype/programme-reduit";
import * as copieRecherche from "@/research/candidat";
import { analyserUrl } from "@/research/fetch-page";

/**
 * Copies volontaires entre modules qui n'ont pas le droit de s'importer (décision 0032, A3.2) : elles doivent
 * rester d'accord. Revue Sécurité de #180, mineur 4 : une table par copie, pour qu'une divergence (comme le
 * `hostname !== ""` présent dans une seule copie avant cette correction) fasse échouer la CI.
 */

const lisible = (url: string) => (url.length > 80 ? `${url.slice(0, 40)}… (${url.length} caractères)` : url || "(vide)");

describe("p0: validation d'URL de source — même verdict partout (table)", () => {
  // [URL, source valide (programme réduit et R1), page lisible par le lecteur (plus strict : port 443, nom d'hôte)]
  const table: [string, boolean, boolean][] = [
    ["https://exemple.org/a", true, true],
    ["HTTPS://EXEMPLE.ORG/a", true, true],
    ["https://exemple.org./a", true, true],
    ["https://exemple.org/a?b=c#d", true, true],
    ["https://exemple.org:443/a", true, true],
    ["https://exemple.org:8443/a", true, false],
    ["https://127.0.0.1/", true, false],
    ["https://0x7f.1/", true, false],
    ["https://2130706433/", true, false],
    ["https://[::1]/", true, false],
    ["http://exemple.org/", false, false],
    ["ftp://exemple.org/", false, false],
    ["javascript:alert(1)", false, false],
    ["data:text/html,x", false, false],
    ["file:///etc/passwd", false, false],
    ["https://moi:secret@exemple.org/", false, false],
    ["https://moi@exemple.org/", false, false],
    ["https://:secret@exemple.org/", false, false],
    ["https://", false, false],
    ["https:///a", true, true],
    ["//exemple.org/a", false, false],
    ["pas une url", false, false],
    ["", false, false],
    [`https://exemple.org/${"a".repeat(2048 - "https://exemple.org/".length)}`, true, true],
    [`https://exemple.org/${"a".repeat(2049 - "https://exemple.org/".length)}`, false, true],
  ];

  for (const [url, source, lisibleParLeLecteur] of table) {
    it(lisible(url), () => {
      expect(urlSourceValideReduite(url), "programme-reduit.ts").toBe(source);
      expect(urlSourceValideR1(url), "domain/validation.ts").toBe(source);
      let lue: boolean;
      try {
        analyserUrl(url);
        lue = true;
      } catch {
        lue = false;
      }
      expect(lue, "research/fetch-page.ts").toBe(lisibleParLeLecteur);
      // Le lecteur n'est jamais plus permissif que la validation de source, sauf sur la longueur (il ne lit que des
      // URL déjà rendues par la recherche, et la source citée est contrôlée à la sortie).
      if (url.length <= 2048 && lue) expect(source, "lecteur plus permissif que la validation de source").toBe(true);
    });
  }
});

describe("p0: PositionSchema — ancrage.ts et programme-reduit.ts d'accord (table)", () => {
  const table: [unknown, boolean][] = [
    [{ lat: 55.95, lng: -3.19 }, true],
    [{ lat: 90, lng: 180 }, true],
    [{ lat: -90, lng: -180 }, true],
    [{ lat: 0, lng: 0 }, true],
    [{ lat: 90.0001, lng: 0 }, false],
    [{ lat: -90.0001, lng: 0 }, false],
    [{ lat: 0, lng: 180.0001 }, false],
    [{ lat: 0, lng: -180.0001 }, false],
    [{ lat: Number.NaN, lng: 0 }, false],
    [{ lat: Number.POSITIVE_INFINITY, lng: 0 }, false],
    [{ lat: "55.95", lng: -3.19 }, false],
    [{ lat: 55.95 }, false],
    [{ lat: 55.95, lng: -3.19, alt: 0 }, false],
    [[55.95, -3.19], false],
    [null, false],
  ];
  for (const [valeur, attendu] of table) {
    it(JSON.stringify(valeur) ?? String(valeur), () => {
      expect(PositionAncrage.safeParse(valeur).success, "ancrage.ts").toBe(attendu);
      expect(PositionReduite.safeParse(valeur).success, "programme-reduit.ts").toBe(attendu);
    });
  }
});

describe("p0: modes de déplacement — brief.ts et grounding/interfaces.ts d'accord", () => {
  it("MODES_DEPLACEMENT et MODES_ROUTES sont identiques, dans le même ordre", () => {
    expect([...MODES_ROUTES]).toEqual([...MODES_DEPLACEMENT]);
  });
});

/**
 * B7a (décision 0077 § 1 point 3, B7-TL-1 : liste fermée ; 0032 point 10) : copies de `src/prototype` tenues égales dans
 * `src/ai` (`candidat.ts`, `reglages.ts`) et `src/research` (`candidat.ts`). Une table par copie ; une copie modifiée
 * d'un seul côté fait échouer le test. Toute autre copie demande un amendement de 0077.
 */
describe("p0: copies de src/prototype tenues égales", () => {
  it("TYPES_CRENEAU et TypeCreneau (src/ai/candidat.ts)", () => {
    expect([...copieIa.TYPES_CRENEAU]).toEqual([...originalCandidat.TYPES_CRENEAU]);
    expectTypeOf<copieIa.TypeCreneau>().toEqualTypeOf<originalCandidat.TypeCreneau>();
  });

  it("LONGUEURS_TEXTE (src/ai/candidat.ts)", () => {
    expect(copieIa.LONGUEURS_TEXTE).toEqual(originalCandidat.LONGUEURS_TEXTE);
    expectTypeOf<typeof copieIa.LONGUEURS_TEXTE>().toEqualTypeOf<typeof originalCandidat.LONGUEURS_TEXTE>();
  });

  it("CANDIDAT_ID_PATTERN (src/ai/candidat.ts) et MODELE_ID_PATTERN (src/ai/reglages.ts) : mêmes motifs", () => {
    for (const [copie, original] of [
      [copieIa.CANDIDAT_ID_PATTERN, originalCandidat.CANDIDAT_ID_PATTERN],
      [reglagesIa.MODELE_ID_PATTERN, originalConfig.MODELE_ID_PATTERN],
    ] as const) {
      expect(copie.source).toBe(original.source);
      expect(copie.flags).toBe(original.flags);
    }
  });

  it("MOTEURS_RECHERCHE_WEB et MoteurRechercheWeb, Routage (src/ai/reglages.ts)", () => {
    expect([...reglagesIa.MOTEURS_RECHERCHE_WEB]).toEqual([...originalConfig.MOTEURS_RECHERCHE_WEB]);
    expectTypeOf<reglagesIa.MoteurRechercheWeb>().toEqualTypeOf<originalConfig.MoteurRechercheWeb>();
    expectTypeOf<reglagesIa.Routage>().toEqualTypeOf<originalConfig.Routage>();
  });

  it("CLASSES_SOURCE et ClasseSource (src/research/candidat.ts)", () => {
    expect([...copieRecherche.CLASSES_SOURCE]).toEqual([...originalCandidat.CLASSES_SOURCE]);
    expectTypeOf<copieRecherche.ClasseSource>().toEqualTypeOf<originalCandidat.ClasseSource>();
  });

  describe("contientUrl et texteMaison (src/ai/candidat.ts) : même verdict (table)", () => {
    const table: [string, number][] = [
      ["Musée maison", 80],
      ["", 80],
      ["   ", 80],
      ["x".repeat(80), 80],
      ["x".repeat(81), 80],
      ["ligne\u0007son", 80],
      ["un <b>lieu</b>", 80],
      ["voir https://exemple.org", 300],
      ["voir www.exemple", 300],
      ["voir exemple.com", 300],
      ["mailto:a", 300],
      ["javascript:alert(1)", 300],
      ["texte\u200bcaché", 300],
      ["droite\u202egauche", 300],
      ["Café du Lac, 12 €", 300],
      ["東京の美術館", 300],
    ];
    for (const [texte, max] of table) {
      it(JSON.stringify(texte), () => {
        expect(copieIa.contientUrl(texte)).toBe(originalCandidat.contientUrl(texte));
        expect(copieIa.texteMaison(max).safeParse(texte).success).toBe(originalCandidat.texteMaison(max).safeParse(texte).success);
      });
    }
  });

  describe("NotesSchema et Notes (src/ai/candidat.ts) : même verdict (table)", () => {
    const valide = { matchesWishes: true, notForMeRisk: 3, mustSee: false, slotFit: ["activity"] };
    const table: unknown[] = [
      valide,
      { ...valide, slotFit: ["activity", "meal", "evening"] },
      { ...valide, slotFit: [] },
      { ...valide, slotFit: ["activity", "activity"] },
      { ...valide, slotFit: ["event"] },
      { ...valide, notForMeRisk: 0 },
      { ...valide, notForMeRisk: 11 },
      { ...valide, notForMeRisk: 2.5 },
      { ...valide, placeId: "x" },
      { ...valide, mustSee: "oui" },
      null,
    ];
    for (const valeur of table) {
      it(JSON.stringify(valeur), () => {
        expect(copieIa.NotesSchema.safeParse(valeur).success).toBe(originalCandidat.NotesSchema.safeParse(valeur).success);
      });
    }
    it("types égaux", () => {
      expectTypeOf<copieIa.Notes>().toEqualTypeOf<originalCandidat.Notes>();
    });
  });

  describe("CandidatRechercheSchema (src/research/candidat.ts) et CandidatSchema : même verdict (table)", () => {
    const valide = {
      id: "c_001",
      nom: "Musée maison",
      resume: "Résumé maison.",
      categorie: "museum",
      typeEtape: "activity",
      source: { url: "https://guide.example/page", date: "2026-09-01", classe: "independante" },
      aReserver: false,
    };
    const table: unknown[] = [
      valide,
      { ...valide, evenement: { date: "2026-11-24", heure: "20:00", dateConfirmee: true } },
      { ...valide, evenement: { date: "2026-11-24", dateConfirmee: false } },
      { ...valide, evenement: { date: "2026-11-24" } },
      { ...valide, prixParPersonne: 0, dureeMinutes: 15 },
      { ...valide, prixParPersonne: 1001 },
      { ...valide, dureeMinutes: 14 },
      { ...valide, id: "c_1" },
      { ...valide, nom: "voir https://exemple.org" },
      { ...valide, categorie: "plage" },
      { ...valide, typeEtape: "hotel" },
      { ...valide, source: { ...valide.source, classe: "autre" } },
      { ...valide, source: { ...valide.source, date: "01/09/2026" } },
      { ...valide, source: { ...valide.source, placeId: "x" } },
      { ...valide, placeId: "x" },
      { ...valide, aReserver: undefined },
      // Candidat enrichi (décision 0094 § 1 point 3) : pour chaque champ, une valeur admise, une trop longue, une avec URL,
      // une avec balise ; `incontournable` sans `secteur` refusé.
      ...(
        [
          ["secteur", "Rome antique", 60],
          ["incontournable", "Colisée", 80],
          ["prix", "18 EUR, billet combiné", 60],
          ["horaires", "9h-19h, fermé le lundi", 120],
          ["conseil", "Réserver le premier créneau.", 160],
        ] as const
      ).flatMap(([champ, admise, max]) => {
        const avecSecteur = champ === "incontournable" ? { secteur: "Rome antique" } : {};
        return [
          { ...valide, ...avecSecteur, [champ]: admise },
          { ...valide, ...avecSecteur, [champ]: "x".repeat(max) },
          { ...valide, ...avecSecteur, [champ]: "x".repeat(max + 1) },
          { ...valide, ...avecSecteur, [champ]: "voir https://exemple.org" },
          { ...valide, ...avecSecteur, [champ]: "voir exemple.com" },
          { ...valide, ...avecSecteur, [champ]: "un <b>lieu</b>" },
          { ...valide, ...avecSecteur, [champ]: "" },
          { ...valide, ...avecSecteur, [champ]: 12 },
        ];
      }),
      { ...valide, incontournable: "Colisée" },
      { ...valide, secteur: "Rome antique", incontournable: "Colisée", prix: "18 EUR", horaires: "9h-19h", conseil: "Tôt le matin." },
      { ...valide, secteur: "Rome antique", raison: "pas une clé du candidat" },
    ];
    for (const valeur of table) {
      it(JSON.stringify(valeur), () => {
        expect(copieRecherche.CandidatRechercheSchema.safeParse(valeur).success).toBe(originalCandidat.CandidatSchema.safeParse(valeur).success);
      });
    }
    it("verdicts attendus du candidat enrichi (0094 § 1 points 1 et 3)", () => {
      const avec = (champs: Record<string, unknown>) => originalCandidat.CandidatSchema.safeParse({ ...valide, ...champs }).success;
      expect(avec({ secteur: "Rome antique", incontournable: "Colisée", prix: "18 EUR", horaires: "9h-19h", conseil: "Tôt." })).toBe(true);
      expect(avec({ incontournable: "Colisée" })).toBe(false);
      expect(avec({ secteur: "x".repeat(61) })).toBe(false);
      expect(avec({ conseil: "x".repeat(160) })).toBe(true);
      expect(avec({ horaires: "voir www.exemple.ch" })).toBe(false);
      expect(avec({ prix: "<b>x</b>" })).toBe(false);
    });

    it("types égaux (Candidat)", () => {
      expectTypeOf<copieRecherche.CandidatRecherche>().toEqualTypeOf<originalCandidat.Candidat>();
    });
  });

  it("CandidatPourModele (src/ai/entrees.ts) est exactement la projection de vuePourModele (0077 § 1 point 5)", () => {
    expectTypeOf<CandidatPourModele>().toEqualTypeOf<ReturnType<typeof originalCandidat.vuePourModele>>();
  });
});
