// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import { EntreeRevisionSchema, type EntreeRevision } from "@/ai/entree-revision";
import { requeteRevision } from "@/ai/requetes";
import { BriefSchema } from "@/prototype/brief";
import { entreeRevisionDepuisProgramme, nomNormalise, nomsEcartes, retirerEtapesEcartees, type EntreeRevisionP0 } from "@/server/p0/revision";
import { choixRevisionValides, PART_REVISION_MICROS, plafondModelesMicros, REVISIONS_PAR_VOYAGE } from "@/workflows/p0-run";

/**
 * Révision après le tri (E2E-essai, lot 4 ; décision 0126) : entrée tirée des seuls textes de l'IA (canari : aucune
 * donnée Google ni verdict d'ancrage), filet du code sur les étapes écartées, partage du fusible d'IA. Fonctions pures.
 */

const BRIEF = BriefSchema.parse(JSON.parse(readFileSync(path.join(process.cwd(), "prototype/briefs/edimbourg-1.json"), "utf8")));

/** Valeurs sentinelles posées dans tous les champs Google ou de verdict du programme écrit. */
const SENTINELLES = ["SENTINELLE_PLACE_ID", "SENTINELLE_SITE", "SENTINELLE_MINUTES", "SENTINELLE_BADGE", "SENTINELLE_PROPOSITION", "SENTINELLE_LOGEMENT"];

const etape = (id: string, name: string, kind: "visit" | "meal" = "visit") => ({
  type: "stop",
  stop: {
    id,
    name,
    kind,
    start: "10:00",
    end: "11:00",
    placeId: "SENTINELLE_PLACE_ID",
    position: { lat: 55.95, lng: -3.19 },
    locked: true,
    exceptions: ["SENTINELLE_BADGE"],
    source: { url: "https://example.org/SENTINELLE_SITE" },
    reason: `Pourquoi ${name}.`,
    facts: { area: "Vieille ville", durationMinutes: 4242, travelMinutes: "SENTINELLE_MINUTES" },
  },
});

const PROGRAMME = {
  schema: 1,
  terminus: { logement: "SENTINELLE_LOGEMENT" },
  proposals: [{ name: "SENTINELLE_PROPOSITION" }],
  trip: {
    id: "proto_edimbourg_44444444444444448444444444444444",
    destination: "Édimbourg",
    days: [
      {
        index: 1,
        date: "2026-11-24",
        items: [etape("j2-1", "Galerie des portraits"), { type: "travel", minutes: "SENTINELLE_MINUTES" }, etape("j2-2", "Bistrot du port", "meal")],
      },
      { index: 0, date: "2026-11-23", theme: "Vieille ville", items: [{ type: "terminus", role: "arrival" }, etape("j1-1", "Forteresse du rocher"), etape("j1-2", "Taverne aux tourtes", "meal")] },
    ],
  },
} as never;

describe("révision : entrée tirée du programme écrit (décision 0126 § 3)", () => {
  const entree = entreeRevisionDepuisProgramme(PROGRAMME, BRIEF, { pasPourMoi: ["j1-1", "j1-1", "inconnu"], jAime: ["j1-2", "j1-1", "j9-9"] });

  it("forme : jours dans l'ordre, étapes seules, textes de l'IA ; choix dédoublonnés, inconnus et recouvrements retirés", () => {
    expect(entree.programme.jours.map((jour) => jour.date)).toEqual(["2026-11-23", "2026-11-24"]);
    expect(entree.programme.jours[0]).toEqual({
      date: "2026-11-23",
      titre: "Vieille ville",
      etapes: [
        { id: "j1-1", debut: "10:00", fin: "11:00", repas: false, lieu: "Forteresse du rocher", quartier: "Vieille ville", pourquoi: "Pourquoi Forteresse du rocher." },
        { id: "j1-2", debut: "10:00", fin: "11:00", repas: true, lieu: "Taverne aux tourtes", quartier: "Vieille ville", pourquoi: "Pourquoi Taverne aux tourtes." },
      ],
    });
    expect(entree.choix).toEqual({ pasPourMoi: ["j1-1"], jAime: ["j1-2"] });
    expect(EntreeRevisionSchema.safeParse(entree).success).toBe(true);
  });

  it("canari : aucune valeur ni clé Google ou de verdict dans l'entrée ni dans la requête revision", () => {
    const requete = requeteRevision(EntreeRevisionSchema.parse(entree), "modele-test", { zdr: true, data_collection: "deny" } as never);
    for (const texte of [JSON.stringify(entree), JSON.stringify(requete)]) {
      for (const valeur of [...SENTINELLES, "55.95", "4242"]) expect(texte).not.toContain(valeur);
      for (const cle of ["placeId", "position", "lat", "lng", "locked", "exceptions", "source", "durationMinutes", "travelMinutes", "proposals", "terminus"]) {
        expect(texte).not.toContain(`"${cle}"`);
      }
    }
    expect(requete).toMatchObject({ etape: "programme", prompt: { id: "revision" } });
  });

  it("schéma strict : une clé en trop (placeId) ou un choix hors du programme refuse l'entrée", () => {
    const glissee = structuredClone(entree) as unknown as { programme: { jours: { etapes: Record<string, unknown>[] }[] } };
    glissee.programme.jours[0]!.etapes[0]!.placeId = "SENTINELLE_PLACE_ID";
    expect(EntreeRevisionSchema.safeParse(glissee).success).toBe(false);
    expect(EntreeRevisionSchema.safeParse({ ...entree, choix: { pasPourMoi: ["j5-5"], jAime: [] } }).success).toBe(false);
    expect(EntreeRevisionSchema.safeParse({ ...entree, choix: { pasPourMoi: [], jAime: [] } }).success).toBe(false);
    expect(EntreeRevisionSchema.safeParse({ ...entree, choix: { pasPourMoi: ["j1-1"], jAime: ["j1-1"] } }).success).toBe(false);
  });

  it("type : EntreeRevisionP0 et EntreeRevision ont la même forme", () => {
    expectTypeOf<EntreeRevisionP0["programme"]>().toEqualTypeOf<EntreeRevision["programme"]>();
    expectTypeOf<EntreeRevisionP0["choix"]>().toEqualTypeOf<EntreeRevision["choix"]>();
  });
});

describe("révision : filet du code sur les étapes écartées (décision 0126 § 4)", () => {
  it("noms écartés : ceux de l'IA pour les identifiants donnés", () => {
    expect(new Set(nomsEcartes(PROGRAMME, ["j1-1", "j2-2"]))).toEqual(new Set(["Bistrot du port", "Forteresse du rocher"]));
  });

  it("nom normalisé : casse, accents et signes ignorés", () => {
    expect(nomNormalise("  Forteresse du Rocher ! ")).toBe(nomNormalise("forteresse-du-rocher"));
    expect(nomNormalise("Église Saint-Gilles")).toBe("eglise saint gilles");
  });

  it("créneaux du lieu écarté retirés, autres gardés, compteur rendu ; aucun nom : sortie inchangée", () => {
    const sortie = {
      bonsPlans: [],
      jours: [
        { date: "2026-11-23", creneaux: [{ lieu: "FORTERESSE DU ROCHER" }, { lieu: "Taverne aux tourtes" }, {}] },
        { date: "2026-11-24", creneaux: [{ lieu: "Forteresse  du rocher." }] },
      ],
    };
    const { programme, retires } = retirerEtapesEcartees(sortie, ["Forteresse du rocher"]);
    expect(retires).toBe(2);
    expect(programme.jours.map((jour) => jour.creneaux)).toEqual([[{ lieu: "Taverne aux tourtes" }, {}], []]);
    expect(programme.bonsPlans).toEqual([]);
    expect(retirerEtapesEcartees(sortie, [])).toEqual({ programme: sortie, retires: 0 });
  });
});

describe("révision : partage du fusible d'IA d'un voyage (Q601 ; décision 0126 § 2)", () => {
  it("fichier : fusible entier ; saisi : fusible moins les révisions ; révision : sa part ; somme au plus le fusible", () => {
    expect(REVISIONS_PAR_VOYAGE).toBe(2);
    expect(PART_REVISION_MICROS).toBe(250_000);
    expect(plafondModelesMicros(2, "fichier")).toBe(2_000_000);
    expect(plafondModelesMicros(2, "saisi")).toBe(1_500_000);
    expect(plafondModelesMicros(2, "revision")).toBe(250_000);
    expect(plafondModelesMicros(2, "saisi") + REVISIONS_PAR_VOYAGE * plafondModelesMicros(2, "revision")).toBeLessThanOrEqual(2_000_000);
    expect(plafondModelesMicros(0.1, "revision")).toBe(100_000);
    expect(plafondModelesMicros(0.1, "saisi")).toBe(0);
  });
});

describe("révision : choix bien formés (entrée du workflow p0Revision, décision 0126 § 1)", () => {
  const TRIP = "proto_rome_44444444444444448444444444444444";
  it("identifiants maison seulement, au moins un « Pas pour moi », sans doublon ni recouvrement, voyage valide", () => {
    expect(choixRevisionValides({ tripId: TRIP, pasPourMoi: ["j1-2"], jAime: ["j1-1"] })).toBe(true);
    for (const mauvais of [
      { tripId: TRIP, pasPourMoi: [], jAime: [] },
      { tripId: TRIP, pasPourMoi: ["ChIJ-SENTINELLE"], jAime: [] },
      { tripId: TRIP, pasPourMoi: ["j1-2", "j1-2"], jAime: [] },
      { tripId: TRIP, pasPourMoi: ["j1-2"], jAime: ["j1-2"] },
      { tripId: "pas un voyage", pasPourMoi: ["j1-2"], jAime: [] },
      { tripId: TRIP, pasPourMoi: "j1-2", jAime: [] },
      { tripId: TRIP, pasPourMoi: Array.from({ length: 121 }, (_, i) => `j${i % 15}-${i % 99}`), jAime: [] },
    ]) {
      expect(choixRevisionValides(mauvais)).toBe(false);
    }
  });
});
