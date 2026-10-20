// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { CANDIDATE_SOURCE_KEYS, STOP_FACTS_KEYS } from "../../../db/jsonb-keys";
import { StopFactsSchema } from "@/contracts";
import { BilanRechercheSchema, CandidatTrouveSchema, instantLocal, versLignes, type CandidatTrouve } from "@/research/candidat-trouve";
import { creerRecherche } from "@/research/recherche";

import {
  candidatBrut,
  configurationRecherche,
  ENTREE,
  GUIDE,
  LIRE,
  lecteurScripte,
  modelesScriptes,
  PLAN,
  RECHERCHER,
  rechercheScriptee,
  tour,
  URL_GUIDE,
} from "../../support/recherche-doubles";

/**
 * `recherche: candidats maison prêts à écrire` (spécification B7, critères « B7b » ; B7-PO-6, PO-7, PO-10, PO-11).
 * Sous `tests/unit/` : le test lit `STOP_FACTS_KEYS` et `CANDIDATE_SOURCE_KEYS` de `db/jsonb-keys.ts` (le critère de lint
 * interdit `db/…` aux `*.test.ts` de `src/ai` et `src/research`). Valeurs fabriquées, aucun appel réel.
 */

/** 2026-11-01 12:00 UTC : « aujourd'hui » du test. */
const MAINTENANT = Date.UTC(2026, 10, 1, 12, 0, 0);
const URL_AUTRE = "https://autre.example/page";

const COLONNES_CANDIDATS = ["category", "confidence", "facts", "kind", "name", "sources", "stopKind", "summary", "toReserve"];
const COLONNES_OCCURRENCES = ["category", "endsAt", "priceNote", "sourceCheckedAt", "sourceUrl", "startsAt", "status", "timezone"];

async function chercher(
  tours: string[],
  options: {
    texte?: string | null;
    web?: ReturnType<typeof rechercheScriptee>;
  } = {},
) {
  const modeles = modelesScriptes({ plan: [PLAN], recherche: tours });
  const recherche = creerRecherche({
    ia: {
      proposerQuartier: async () => ({
        ok: false,
        code: "no_option",
        retryable: false,
      }),
    },
    modeles: modeles.client,
    rechercheWeb: (options.web ?? rechercheScriptee([GUIDE, { url: URL_AUTRE, titre: "Autre", extrait: "Autre extrait." }])).client,
    lecteur: lecteurScripte(options.texte === undefined ? "Page du guide." : options.texte).lecteur,
    configuration: configurationRecherche({
      apercu: {
        ciblesParCreneau: { activity: 4, meal: 1, evening: 0 },
        totalCandidats: 10,
        toursMax: 4,
        ageSourceMaxJours: 1095,
        delaiMs: 30_000,
      },
    }),
    horloge: () => MAINTENANT,
  });
  const resultat = await recherche.rechercher({ entree: ENTREE }, "apercu");
  if (!resultat.ok) throw new Error(`recherche refusée : ${resultat.code}`);
  return resultat.valeur;
}

const evenement = (nom: string, date: string, heure?: string, surcharge: Record<string, unknown> = {}) =>
  candidatBrut(nom, {
    categorie: "nightlife",
    typeEtape: "event",
    evenement: { date, ...(heure === undefined ? {} : { heure }) },
    ...surcharge,
  });

describe("recherche: candidats maison prêts à écrire", () => {
  it("chaque candidat rendu passe son schéma strict ; sources, faits et événement suivent B7-PO-6, PO-7 et PO-11", async () => {
    const { candidats, bilan } = await chercher([
      tour({ actions: [RECHERCHER, LIRE] }),
      tour({
        candidats: [
          candidatBrut("Musée gratuit", {
            prixParPersonne: 0,
            prix: "Entrée gratuite",
            dureeMinutes: 90,
          }),
          candidatBrut("Musée payant", {
            prixParPersonne: 12,
            prix: "12 CHF",
            secteur: "Vieille ville",
          }),
          candidatBrut("Table du coin", {
            categorie: "restaurant",
            typeEtape: "meal",
            aReserver: true,
          }),
          evenement("Concert confirmé", "2026-11-24", "20:00", {
            sourceUrl: URL_GUIDE,
          }),
          evenement("Concert sans heure", "2026-11-25"),
          evenement("Concert hors dates", "2026-12-24", "20:00"),
          candidatBrut("Source inconnue", {
            sourceUrl: "https://hors-resultats.example/x",
          }),
          candidatBrut("Source ancienne", {
            sourceDate: "2020-01-01",
            sourceUrl: URL_AUTRE,
          }),
        ],
        termine: true,
      }),
    ]);
    expect(candidats.map((c) => c.name)).toEqual(["Musée gratuit", "Musée payant", "Table du coin", "Concert confirmé", "Concert sans heure"]);
    for (const candidat of candidats) {
      expect(CandidatTrouveSchema.safeParse(candidat).success, candidat.name).toBe(true);
      expect(candidat.sources).toHaveLength(1);
      for (const source of candidat.sources) {
        expect(Object.keys(source).sort(), candidat.name).toEqual([...CANDIDATE_SOURCE_KEYS].sort());
        expect(source.url.startsWith("https://")).toBe(true);
        // Aucun titre de page recopié : le libellé est le nom d'hôte sans `www.`.
        expect(source.label).toBe("guide.example");
        // Page lue : date de la lecture (2026-11-01, horloge injectée).
        expect(source.checkedOn).toBe("2026-11-01");
      }
      expect(Object.keys(candidat.facts).every((cle) => (STOP_FACTS_KEYS as readonly string[]).includes(cle))).toBe(true);
      expect(StopFactsSchema.safeParse(candidat.facts).success).toBe(true);
      expect(candidat.facts).not.toHaveProperty("area");
      expect(candidat.confidence).toBeNull();
    }
    const parNom = new Map(candidats.map((c) => [c.name, c]));
    // B7-PO-11 : durée lue ; coût 0 seulement pour un lieu gratuit ; un prix non nul est omis ; aucun secteur.
    expect(parNom.get("Musée gratuit")?.facts).toEqual({
      durationMinutes: 90,
      costPerPerson: 0,
    });
    expect(parNom.get("Musée payant")?.facts).toEqual({});
    expect(parNom.get("Table du coin")).toMatchObject({
      kind: "place",
      typeEtape: "meal",
      aReserver: true,
    });
    // B7-PO-7 : date dans les dates de la ville ; `dateConfirmee` seulement si la page relue mentionne la date.
    expect(parNom.get("Concert confirmé")).toMatchObject({
      kind: "event",
      typeEtape: "event",
      evenement: { date: "2026-11-24", heure: "20:00", dateConfirmee: false },
    });
    expect(parNom.get("Concert sans heure")?.evenement).toMatchObject({
      date: "2026-11-25",
      dateConfirmee: false,
    });
    expect(parNom.get("Concert hors dates")).toBeUndefined();
    expect(parNom.get("Source inconnue")).toBeUndefined();
    expect(parNom.get("Source ancienne")).toBeUndefined();
    // Le bilan n'a aucun compteur de candidats (0011 point 2, S4).
    expect(BilanRechercheSchema.parse(bilan)).toEqual(bilan);
    expect(Object.keys(bilan).join(" ")).not.toMatch(/candidat|found|trouv/i);
  });

  it("dateConfirmee vrai seulement si le texte de la page relue mentionne la date ; lueA est l'instant de la relecture", async () => {
    const { candidats } = await chercher(
      [
        tour({ actions: [RECHERCHER, LIRE] }),
        tour({
          candidats: [evenement("Concert", "2026-11-24", "20:00")],
          termine: true,
        }),
      ],
      { texte: "Grand concert le 24 novembre 2026 à la salle." },
    );
    expect(candidats[0]?.evenement).toEqual({
      date: "2026-11-24",
      heure: "20:00",
      dateConfirmee: true,
      lueA: new Date(MAINTENANT).toISOString(),
    });
    // Sans lecture de la page : non confirmé, pas de `lueA`, `checkedOn` = date de la recherche.
    const sansLecture = await chercher([
      tour({ actions: [RECHERCHER] }),
      tour({
        candidats: [evenement("Concert", "2026-11-24", "20:00")],
        termine: true,
      }),
    ]);
    expect(sansLecture.candidats[0]?.evenement).toEqual({
      date: "2026-11-24",
      heure: "20:00",
      dateConfirmee: false,
    });
    expect(sansLecture.candidats[0]?.sources[0]?.checkedOn).toBe("2026-11-01");
  });

  describe("versLignes", () => {
    const lieu: CandidatTrouve = {
      kind: "place",
      name: "Musée maison",
      summary: "Un musée décrit par nous.",
      category: "museum",
      typeEtape: "activity",
      aReserver: true,
      facts: { durationMinutes: 90, costPerPerson: 0 },
      sources: [{ label: "guide.example", url: URL_GUIDE, checkedOn: "2026-11-01" }],
      confidence: null,
    };
    const concert = (date: string, heure: string | undefined, dateConfirmee: boolean, lueA?: string): CandidatTrouve => ({
      ...lieu,
      kind: "event",
      typeEtape: "event",
      aReserver: false,
      category: "nightlife",
      facts: {},
      evenement: {
        date,
        ...(heure === undefined ? {} : { heure }),
        dateConfirmee,
        ...(lueA === undefined ? {} : { lueA }),
      },
    });

    it("une ligne `candidates` qui n'a que les colonnes de contenu ; faits et sources acceptés par les contraintes de la base", () => {
      const { candidat, occurrence } = versLignes(lieu, "Europe/London");
      expect(Object.keys(candidat).sort()).toEqual(COLONNES_CANDIDATS);
      expect(candidat).toMatchObject({
        kind: "place",
        name: "Musée maison",
        stopKind: "activity",
        toReserve: true,
        confidence: null,
      });
      expect(Object.keys(candidat.facts).every((cle) => (STOP_FACTS_KEYS as readonly string[]).includes(cle))).toBe(true);
      for (const source of candidat.sources) {
        expect(Object.keys(source).sort()).toEqual([...CANDIDATE_SOURCE_KEYS].sort());
        expect(source.url.startsWith("https://")).toBe(true);
      }
      expect(occurrence).toBeNull();
    });

    it("événement avec heure : une occurrence (starts_at dans le fuseau donné, status selon dateConfirmee, source_url en https)", () => {
      const lue = "2026-11-01T12:00:00.000Z";
      const hiver = versLignes(concert("2026-11-24", "20:00", true, lue), "Europe/London");
      expect(Object.keys(hiver.occurrence ?? {}).sort()).toEqual(COLONNES_OCCURRENCES);
      expect(hiver.occurrence).toMatchObject({
        timezone: "Europe/London",
        status: "confirmed",
        endsAt: null,
        priceNote: null,
        category: "nightlife",
        sourceUrl: URL_GUIDE,
      });
      expect(hiver.occurrence?.startsAt.toISOString()).toBe("2026-11-24T20:00:00.000Z");
      expect(hiver.occurrence?.sourceCheckedAt?.toISOString()).toBe(lue);
      expect(hiver.occurrence?.sourceUrl.startsWith("https://")).toBe(true);
      // Heure d'été au Royaume-Uni, Zurich (UTC+1 en hiver, +2 en été) et un fuseau à demi-heure.
      expect(versLignes(concert("2026-07-15", "20:00", false), "Europe/London").occurrence?.startsAt.toISOString()).toBe("2026-07-15T19:00:00.000Z");
      expect(versLignes(concert("2026-11-24", "20:00", false), "Europe/Zurich").occurrence?.startsAt.toISOString()).toBe("2026-11-24T19:00:00.000Z");
      expect(versLignes(concert("2026-07-15", "20:00", false), "Europe/Zurich").occurrence?.startsAt.toISOString()).toBe("2026-07-15T18:00:00.000Z");
      expect(versLignes(concert("2026-11-24", "20:00", false), "Asia/Kolkata").occurrence?.startsAt.toISOString()).toBe("2026-11-24T14:30:00.000Z");
      const nonConfirme = versLignes(concert("2026-11-24", "20:00", false), "Europe/London");
      expect(nonConfirme.occurrence).toMatchObject({
        status: "unconfirmed",
        sourceCheckedAt: null,
      });
    });

    it("événement sans heure lue : aucune occurrence (starts_at est obligatoire) ; la ligne candidat reste écrite", () => {
      const { candidat, occurrence } = versLignes(concert("2026-11-24", undefined, false), "Europe/London");
      expect(occurrence).toBeNull();
      expect(candidat).toMatchObject({ kind: "event", stopKind: "event" });
    });

    it("changement d'heure : jours de transition (Europe/London, 2026-03-29 et 2026-10-25)", () => {
      expect(instantLocal("2026-03-29", "00:30", "Europe/London").toISOString()).toBe("2026-03-29T00:30:00.000Z");
      expect(instantLocal("2026-03-29", "03:00", "Europe/London").toISOString()).toBe("2026-03-29T02:00:00.000Z");
      expect(instantLocal("2026-10-25", "12:00", "Europe/London").toISOString()).toBe("2026-10-25T12:00:00.000Z");
      expect(instantLocal("2026-10-24", "12:00", "Europe/London").toISOString()).toBe("2026-10-24T11:00:00.000Z");
    });

    it("fuseau inconnu ou candidat hors schéma : refusé, jamais écrit", () => {
      expect(() => versLignes(concert("2026-11-24", "20:00", false), "Mars/Olympus")).toThrow(RangeError);
      expect(() => versLignes({ ...lieu, facts: { area: "Vieille ville" } }, "Europe/London")).toThrow();
      expect(() =>
        versLignes(
          {
            ...lieu,
            sources: [
              {
                label: "x",
                url: "http://guide.example/x",
                checkedOn: "2026-11-01",
              },
            ],
          },
          "Europe/London",
        ),
      ).toThrow();
      expect(() => versLignes({ ...lieu, kind: "event" }, "Europe/London")).toThrow();
    });
  });

  it("types : un candidat n'a ni champ Google ni secteur ; les lignes n'ont que des colonnes de contenu", () => {
    expectTypeOf<CandidatTrouve["facts"]>().toEqualTypeOf<{
      durationMinutes?: number | undefined;
      costPerPerson?: number | undefined;
      area?: string | undefined;
    }>();
    expectTypeOf<keyof CandidatTrouve>().toEqualTypeOf<
      "kind" | "name" | "summary" | "category" | "typeEtape" | "aReserver" | "facts" | "sources" | "confidence" | "evenement"
    >();
  });
});
