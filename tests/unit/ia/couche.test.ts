// @vitest-environment node
import { describe, expect, expectTypeOf, it } from "vitest";

import { ErreurModele, type ClientModeles, type EtapeRequete, type ReponseModele } from "@/ai/client";
import { CLES_INTERDITES_ENTREE, creerCoucheIa, MAX_NOEUDS_ENTREE, type CoucheIa, type ReglagesIa } from "@/ai/couche";
import { versEntreeQuartier, type CandidatPourModele, type EntreeModeles, type EntreeQuartier, type LieuRetenu } from "@/ai/entrees";
import { requeteNotation, requeteRaisons } from "@/ai/requetes";
import type { BriefRequest, LodgingRequest } from "@/contracts";
import type { Brief } from "@/prototype/brief";
import { candidatPourModele, entreeModelesDepuisBrief, lieuRetenuDepuisCandidat } from "@/server/p0/vers-couche-ia";

import { journalDePrompts, type JournalPrompts } from "../../support/journal-prompts";

/**
 * B7a (décision 0077 § 2 ; spécification B7a, critères `prompts: …`) : la couche IA de production (`creerCoucheIa`).
 * Modèles simulés (réponses fabriquées par étape), journal de prompts de test ; aucun appel réel.
 */

const ROUTAGE = { data_collection: "deny" as const };
const REGLAGES: ReglagesIa = {
  structuration: { modele: "test/structuration", routage: ROUTAGE },
  quartier: { modele: "test/quartier", routage: ROUTAGE },
  plan: { modele: "test/plan", routage: ROUTAGE },
  notation: { modele: "test/notation", routage: ROUTAGE },
  raisons: { modele: "test/raisons", routage: ROUTAGE },
};

const ENTREE: EntreeModeles = {
  destination: "Édimbourg",
  pays: "Royaume-Uni",
  arrivee: "2026-11-23",
  depart: "2026-11-26",
  voyageurs: { adultes: 2, enfants: 1 },
  rythme: "balanced",
  envies: ["museum", "walk"],
  limites: ["nightlife"],
  deplacements: ["walk", "transit"],
  budgetRepasChf: 40,
};
const CANDIDATS: CandidatPourModele[] = [
  { id: "c_001", nom: "Musée maison", resume: "Un musée écrit par nous.", categorie: "museum", typeEtape: "activity" },
  { id: "c_002", nom: "Promenade maison", resume: "Une promenade écrite par nous.", categorie: "walk", typeEtape: "activity" },
];
const LIEUX: LieuRetenu[] = CANDIDATS.map((candidat) => ({ ...candidat, sourceDomaine: "guide.example" }));
const DEMANDE: BriefRequest = {
  story: "Nous aimons les musées et marcher tranquillement, avec notre fille de huit ans.",
  trip: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-26", otherCities: [] },
};
const QUARTIER: EntreeQuartier = { ville: "Édimbourg", debut: "2026-11-23", fin: "2026-11-26" };
const RESULTATS = [{ url: "https://guide.example/logements", titre: "Logements", extrait: "Maisons d'hôtes du centre." }];

const REPONSES: Record<EtapeRequete, string> = {
  structuration: JSON.stringify({ pace: "relaxed", wishes: ["museum", "walk"], inferredFields: ["pace", "wishes"] }),
  quartier: JSON.stringify({
    zone: { nom: "Vieille ville", raison: "Proche des musées.", centre: { lat: 55.95, lng: -3.19 }, rayonM: 800 },
    logements: [{ nom: "Maison d'hôtes", meta: "Maison d'hôtes · près du tram", sourceUrl: "https://guide.example/logements" }],
  }),
  plan: JSON.stringify({ requetes: [{ requete: "musées Édimbourg", creneau: "activity" }] }),
  recherche: JSON.stringify({ actions: [], candidats: [], termine: true }),
  notation: JSON.stringify({
    notes: [
      { id: "c_001", matchesWishes: true, notForMeRisk: 2, mustSee: true, slotFit: ["activity"] },
      { id: "c_002", matchesWishes: true, notForMeRisk: 3, mustSee: false, slotFit: ["activity"] },
    ],
  }),
  raisons: JSON.stringify({
    raisons: [
      { id: "c_001", raison: "Pour les musées.", detour: "Au centre." },
      { id: "c_002", raison: "Pour marcher.", detour: "Près du logement." },
    ],
  }),
};

function monter(reponse: (etape: EtapeRequete) => ReponseModele | Promise<ReponseModele> = (etape) => ({ texte: REPONSES[etape], coutUsd: 0 })) {
  const modeles: ClientModeles = { envoyer: async (requete) => reponse(requete.etape) };
  const journal: JournalPrompts = journalDePrompts(modeles);
  const couche = creerCoucheIa({ modeles: journal.client, reglages: REGLAGES });
  return { couche, journal };
}

/** Appel de chaque méthode avec une entrée valide, puis avec une entrée modifiée par `modifier`. */
const METHODES: { nom: keyof CoucheIa; appeler: (couche: CoucheIa, modifier?: (entree: Record<string, unknown>) => unknown) => Promise<unknown> }[] = [
  { nom: "structurerBrief", appeler: (c, m) => c.structurerBrief((m ? m({ ...DEMANDE }) : DEMANDE) as BriefRequest) },
  { nom: "proposerQuartier", appeler: (c, m) => c.proposerQuartier((m ? m({ quartier: QUARTIER, resultats: RESULTATS }) : { quartier: QUARTIER, resultats: RESULTATS }) as never) },
  { nom: "planifierRecherche", appeler: (c, m) => c.planifierRecherche((m ? m({ entree: ENTREE }) : { entree: ENTREE }) as never) },
  { nom: "noter", appeler: (c, m) => c.noter((m ? m({ entree: ENTREE, candidats: CANDIDATS }) : { entree: ENTREE, candidats: CANDIDATS }) as never) },
  { nom: "rediger", appeler: (c, m) => c.rediger((m ? m({ entree: ENTREE, lieux: LIEUX }) : { entree: ENTREE, lieux: LIEUX }) as never) },
];

/** Ajoute `cle: valeur` à la racine, puis à chaque objet imbriqué possible de l'entrée (premier élément des listes). */
function variantes(cle: string, valeur: unknown): ((entree: Record<string, unknown>) => unknown)[] {
  const profond = (noeud: unknown, chemin: string[]): unknown => {
    if (chemin.length === 0) return noeud !== null && typeof noeud === "object" && !Array.isArray(noeud) ? { ...noeud, [cle]: valeur } : noeud;
    const [tete, ...reste] = chemin;
    if (Array.isArray(noeud)) return noeud.map((element, i) => (i === 0 ? profond(element, chemin) : element));
    if (noeud === null || typeof noeud !== "object" || tete === undefined) return noeud;
    return Object.fromEntries(Object.entries(noeud).map(([k, v]) => [k, k === tete ? profond(v, reste) : v]));
  };
  const chemins = [[], ["trip"], ["quartier"], ["resultats"], ["entree"], ["entree", "voyageurs"], ["candidats"], ["lieux"]];
  return chemins.map((chemin) => (entree: Record<string, unknown>) => profond(entree, chemin));
}

describe("creerCoucheIa : cinq méthodes, un résultat fermé (0077 § 2)", () => {
  it("entrées valides : réussite pour chaque méthode, une requête chacune, à l'étape et au modèle réglés", async () => {
    const { couche, journal } = monter();
    for (const { appeler } of METHODES) expect(await appeler(couche)).toMatchObject({ ok: true });
    expect(journal.requetes.map((r) => r.etape)).toEqual(["structuration", "quartier", "plan", "notation", "raisons"]);
    expect(journal.requetes.map((r) => r.modele)).toEqual(["test/structuration", "test/quartier", "test/plan", "test/notation", "test/raisons"]);
    for (const requete of journal.requetes) expect(requete.routage).toEqual(ROUTAGE);
  });

  it("valeurs lues : brief déduit, quartier, plan, notes et raisons (refus comptés)", async () => {
    const { couche } = monter();
    expect(await couche.structurerBrief(DEMANDE)).toEqual({ ok: true, valeur: { pace: "relaxed", wishes: ["museum", "walk"], inferredFields: ["pace", "wishes"] } });
    const quartier = await couche.proposerQuartier({ quartier: QUARTIER, resultats: RESULTATS });
    expect(quartier.ok && quartier.valeur.zone?.nom).toBe("Vieille ville");
    const plan = await couche.planifierRecherche({ entree: ENTREE });
    expect(plan).toEqual({ ok: true, valeur: { requetes: [{ requete: "musées Édimbourg", creneau: "activity" }], refuses: 0 } });
    const notes = await couche.noter({ entree: ENTREE, candidats: CANDIDATS });
    expect(notes.ok && [...notes.valeur.notes.keys()]).toEqual(["c_001", "c_002"]);
    const raisons = await couche.rediger({ entree: ENTREE, lieux: LIEUX });
    expect(raisons.ok && raisons.valeur.raisons.get("c_002")).toEqual({ raison: "Pour marcher.", detour: "Près du logement." });
  });

  it("noter et rediger passent par les seuls chemins d'envoi de P0r3 (requeteNotation, requeteRaisons)", async () => {
    const { couche, journal } = monter();
    await couche.noter({ entree: ENTREE, candidats: CANDIDATS });
    await couche.rediger({ entree: ENTREE, lieux: LIEUX });
    expect(journal.requetes[0]).toEqual(requeteNotation(ENTREE, CANDIDATS, "test/notation", ROUTAGE));
    expect(journal.requetes[1]).toEqual(requeteRaisons(ENTREE, LIEUX, "test/raisons", ROUTAGE));
  });

  it("sortie illisible : model_output_invalid, non réessayable ; éléments refusés parmi d'autres : réussite avec leur compte", async () => {
    const { couche } = monter(() => ({ texte: "pas du JSON", coutUsd: 0 }));
    for (const { appeler } of METHODES) expect(await appeler(couche)).toEqual({ ok: false, code: "model_output_invalid", retryable: false });
    const partiel = monter((etape) => ({
      texte: etape === "notation" ? JSON.stringify({ notes: [{ id: "c_001", matchesWishes: true, notForMeRisk: 2, mustSee: true, slotFit: ["activity"] }, { id: "c_999" }] }) : REPONSES[etape],
      coutUsd: 0,
    }));
    const notes = await partiel.couche.noter({ entree: ENTREE, candidats: CANDIDATS });
    expect(notes.ok && notes.valeur.refuses).toBe(1);
  });

  it("« aucune zone » : réussite, zone nulle (B7b la traduit en no_option)", async () => {
    const { couche } = monter((etape) => ({ texte: etape === "quartier" ? '{"zone": null, "logements": []}' : REPONSES[etape], coutUsd: 0 }));
    expect(await couche.proposerQuartier({ quartier: QUARTIER, resultats: RESULTATS })).toEqual({ ok: true, valeur: { zone: null, logements: [], refuses: 0 } });
  });

  it("erreurs attendues du client : un code fermé, retryable vrai seulement pour upstream_unavailable et upstream_timeout", async () => {
    for (const [erreur, attendu] of [
      // Forme des erreurs du client réel (`code` fermé) sans importer son module de capacité (tests/unit/p0/clients-reels.test.ts).
      [Object.assign(new Error("upstream_timeout"), { code: "upstream_timeout" }), { ok: false, code: "upstream_timeout", retryable: true }],
      [Object.assign(new Error("cap_reached"), { code: "cap_reached" }), { ok: false, code: "cap_reached", retryable: false }],
      [new ErreurModele("model_unavailable"), { ok: false, code: "model_unavailable", retryable: false }],
    ] as const) {
      const { couche } = monter(() => {
        throw erreur;
      });
      for (const { appeler } of METHODES) expect(await appeler(couche)).toEqual(attendu);
    }
  });

  it("garde data_collection avant chaque requête : réglage sans deny refusé sans appel (data_collection_missing)", async () => {
    let appels = 0;
    const couche = creerCoucheIa({
      modeles: { envoyer: async () => ((appels += 1), { texte: REPONSES.plan, coutUsd: 0 }) },
      reglages: { ...REGLAGES, plan: { modele: "test/plan", routage: { data_collection: "allow" } as never } },
    });
    expect(await couche.planifierRecherche({ entree: ENTREE })).toEqual({ ok: false, code: "data_collection_missing", retryable: false });
    expect(appels).toBe(0);
  });

  it("exception inattendue (défaut de programmation) : elle se propage, non convertie", async () => {
    const { couche } = monter(() => {
      throw new TypeError("défaut");
    });
    for (const { appeler } of METHODES) await expect(appeler(couche)).rejects.toThrow(TypeError);
    const avecCodeInconnu = monter(() => {
      throw Object.assign(new Error("x"), { code: "ECONNRESET" });
    });
    await expect(avecCodeInconnu.couche.planifierRecherche({ entree: ENTREE })).rejects.toThrow("x");
  });
});

describe("prompts: le constructeur n'accepte que des types maison", () => {
  it("refusé par le type : une clé de la liste interdite n'a pas de champ", () => {
    expectTypeOf<EntreeModeles>().not.toHaveProperty("placeId");
    expectTypeOf<CandidatPourModele>().not.toHaveProperty("placeId");
    expectTypeOf<CandidatPourModele>().not.toHaveProperty("location");
    expectTypeOf<EntreeQuartier>().not.toHaveProperty("lodging");
    const { couche } = monter();
    const appels = () => {
      // @ts-expect-error `placeId` n'est pas un champ de `CandidatPourModele`
      void couche.noter({ entree: ENTREE, candidats: [{ id: "c_001", nom: "N", resume: "R", categorie: "museum", typeEtape: "activity", placeId: "p" }] });
      // @ts-expect-error `displayName` n'est pas un champ de `EntreeModeles`
      void couche.planifierRecherche({ entree: { ...ENTREE, displayName: "x" } });
      // @ts-expect-error `formattedAddress` n'est pas un champ de `EntreeQuartier`
      void couche.proposerQuartier({ quartier: { ville: "V", debut: "2026-11-23", fin: "2026-11-24", formattedAddress: "x" }, resultats: [] });
      // @ts-expect-error `location` n'est pas un champ de `LieuRetenu`
      void couche.rediger({ entree: ENTREE, lieux: [{ ...LIEUX[0], location: { latitude: 1, longitude: 2 } }] });
      // @ts-expect-error `regularOpeningHours` n'est pas un champ de `BriefRequest`
      void couche.structurerBrief({ ...DEMANDE, regularOpeningHours: [] });
      // @ts-expect-error `rating` n'est pas un champ de `CandidatPourModele` (constructeur direct)
      requeteNotation(ENTREE, [{ id: "c_001", nom: "N", resume: "R", categorie: "museum", typeEtape: "activity", rating: 4.5 }], "test/n", ROUTAGE);
    };
    expect(typeof appels).toBe("function");
  });

  it.each([...CLES_INTERDITES_ENTREE].filter((cle) => cle !== "story"))("refusé à l'exécution, à chaque niveau, sans requête : %s", async (cle) => {
    const { couche, journal } = monter();
    for (const { nom, appeler } of METHODES) {
      for (const modifier of variantes(cle, "SENTINELLE")) {
        let intacte = true;
        const resultat = await appeler(couche, (entree) => {
          const modifiee = modifier(entree);
          intacte = JSON.stringify(modifiee) === JSON.stringify(entree);
          return modifiee;
        });
        if (!intacte) expect(resultat, `${nom}`).toEqual({ ok: false, code: "invalid_input", retryable: false });
      }
    }
    // Seules les variantes sans effet (chemin absent de l'entrée de la méthode) ont envoyé une requête.
    expect(journal.texte()).not.toContain("SENTINELLE");
  });

  it("une clé en trop, même inoffensive, est refusée avant toute requête (schémas stricts)", async () => {
    const { couche, journal } = monter();
    for (const { nom, appeler } of METHODES) expect(await appeler(couche, (e) => ({ ...e, inconnue: 1 })), nom).toEqual({ ok: false, code: "invalid_input", retryable: false });
    expect(await couche.noter({ entree: ENTREE, candidats: [CANDIDATS[0] as CandidatPourModele, CANDIDATS[0] as CandidatPourModele] })).toMatchObject({ code: "invalid_input" });
    expect(await couche.noter({ entree: ENTREE, candidats: [] })).toMatchObject({ code: "invalid_input" });
    expect(journal.requetes).toEqual([]);
  });
});

describe("prompts: la couche IA refuse récit et logement", () => {
  const CLES = ["recit", "logements", "logement", "lodging", "lodgings", "commitments", "engagements", "email", "story"];
  it.each(CLES)("%s, à n'importe quel niveau d'une entrée des cinq méthodes : invalid_input, journal vide", async (cle) => {
    const { couche, journal } = monter();
    for (const { nom, appeler } of METHODES) {
      for (const modifier of variantes(cle, nom === "structurerBrief" && cle === "story" ? undefined : "SENTINELLE-RECIT")) {
        if (nom === "structurerBrief" && cle === "story") continue; // `story` à la racine : le champ du contrat (ci-dessous)
        const modifiee = modifier(nom === "structurerBrief" ? { ...DEMANDE } : {});
        if (JSON.stringify(modifiee) === JSON.stringify(nom === "structurerBrief" ? DEMANDE : {})) continue;
        expect(await appeler(couche, modifier), `${nom}`).toEqual({ ok: false, code: "invalid_input", retryable: false });
      }
    }
    // `story` imbriqué dans la demande de structuration : refusé ; à la racine, c'est le récit du contrat.
    if (cle === "story") expect(await couche.structurerBrief({ ...DEMANDE, trip: { ...DEMANDE.trip, story: "x" } } as never)).toMatchObject({ code: "invalid_input" });
    expect(journal.requetes).toEqual([]);
  });

  it("aucun type d'entrée de la couche n'a de champ pour le récit, le logement, un engagement ou un email", () => {
    expectTypeOf<EntreeModeles>().not.toHaveProperty("recit");
    expectTypeOf<EntreeModeles>().not.toHaveProperty("logements");
    expectTypeOf<EntreeModeles>().not.toHaveProperty("engagements");
    expectTypeOf<EntreeModeles>().not.toHaveProperty("email");
    expectTypeOf<Parameters<CoucheIa["noter"]>[0]>().not.toHaveProperty("complement");
    expectTypeOf<Parameters<CoucheIa["rediger"]>[0]>().not.toHaveProperty("complement");
    expectTypeOf<Parameters<CoucheIa["planifierRecherche"]>[0]>().not.toHaveProperty("complement");
  });
});

describe("prompts: le récit ne part qu'à la structuration", () => {
  it("un récit sentinelle dans la demande : seule la requête structuration le contient", async () => {
    const RECIT = "SENTINELLE-RECIT-7f3a nous fêtons un anniversaire";
    const { couche, journal } = monter();
    await couche.structurerBrief({ ...DEMANDE, story: RECIT });
    await couche.proposerQuartier({ quartier: QUARTIER, resultats: RESULTATS });
    await couche.planifierRecherche({ entree: ENTREE });
    await couche.noter({ entree: ENTREE, candidats: CANDIDATS });
    await couche.rediger({ entree: ENTREE, lieux: LIEUX });
    expect(journal.requetes).toHaveLength(5);
    for (const requete of journal.requetes) {
      expect(JSON.stringify(requete).includes("SENTINELLE-RECIT-7f3a"), requete.etape).toBe(requete.etape === "structuration");
    }
  });
});

describe("prompts: le récit et le logement de P0 n'atteignent la couche IA par aucun champ", () => {
  it("brief de P0 à récit et logement sentinelles, converti par vers-couche-ia.ts : aucune requête des cinq méthodes ne les contient", async () => {
    const brief: Brief = {
      schema: 1,
      destination: "Édimbourg",
      pays: "Royaume-Uni",
      fuseau: "Europe/London",
      arrivee: "2026-11-23",
      depart: "2026-11-25",
      heureArrivee: "12:00",
      heureDepart: "16:00",
      voyageurs: { adultes: 2, enfants: 0 },
      rythme: "equilibre",
      envies: ["museum"],
      deplacements: ["walk"],
      logements: [{ texte: "SENTINELLE-LOGEMENT-Hotel-c9e1", nuits: 2 }],
      engagements: [{ libelle: "SENTINELLE-ENGAGEMENT-b2", date: "2026-11-24", heure: "20:00", type: "ticket" }],
      recit: "SENTINELLE-RECIT-P0-44d anniversaire de Martine",
    };
    const candidats = [
      {
        id: "c_001",
        nom: "Musée maison",
        resume: "Un musée écrit par nous.",
        categorie: "museum" as const,
        typeEtape: "activity" as const,
        source: { url: "https://guide.example/musees", date: "2026-09-01", classe: "independante" as const },
        aReserver: false,
      },
    ];
    const entree = entreeModelesDepuisBrief(brief);
    const { couche, journal } = monter((etape) => ({
      texte: etape === "notation" ? JSON.stringify({ notes: [] }) : etape === "raisons" ? JSON.stringify({ raisons: [] }) : REPONSES[etape],
      coutUsd: 0,
    }));
    const demande: BriefRequest = { story: DEMANDE.story, trip: { destination: brief.destination, start: brief.arrivee, end: brief.depart, otherCities: [] } };
    expect(await couche.structurerBrief(demande)).toMatchObject({ ok: true });
    expect(await couche.proposerQuartier({ quartier: { ville: brief.destination, debut: brief.arrivee, fin: brief.depart }, resultats: RESULTATS })).toMatchObject({ ok: true });
    expect(await couche.planifierRecherche({ entree })).toMatchObject({ ok: true });
    expect(await couche.noter({ entree, candidats: candidats.map(candidatPourModele) })).toMatchObject({ ok: true });
    expect(await couche.rediger({ entree, lieux: candidats.map(lieuRetenuDepuisCandidat) })).toMatchObject({ ok: true });
    expect(journal.requetes).toHaveLength(5);
    for (const sentinelle of ["SENTINELLE-LOGEMENT", "SENTINELLE-RECIT-P0", "SENTINELLE-ENGAGEMENT", "Martine", "Hotel-c9e1"]) {
      expect(journal.texte(), sentinelle).not.toContain(sentinelle);
    }
  });
});

describe("prompts: l'entrée du quartier ne vient que du contrat", () => {
  const DRAFT: LodgingRequest["draft"] = {
    destination: "Édimbourg",
    start: "2026-11-20",
    end: "2026-11-30",
    lodging: {
      kind: "suggestedLodging",
      lodgingId: "SENTINELLE-LODGING-ID",
      placeId: "SENTINELLE-PLACE-ID-LOGEMENT",
      name: "SENTINELLE-NOM-LOGEMENT-SUGGERE",
    },
    otherCities: [
      { name: "Glasgow", arrival: "2026-11-24", lodging: { kind: "known", label: "SENTINELLE-LOGEMENT-GLASGOW" } },
      { name: "Inverness", arrival: "2026-11-27", lodging: { kind: "area", label: "SENTINELLE-QUARTIER-INVERNESS" } },
    ],
    commitments: [{ kind: "ticket", label: "SENTINELLE-ENGAGEMENT-CONCERT", date: "2026-11-25", start: "20:00" }],
  };

  it("versEntreeQuartier : { ville, debut, fin } de la bonne ville (destination, puis chaque autre ville)", () => {
    expect(versEntreeQuartier({ draft: DRAFT, city: 0 })).toEqual({ ville: "Édimbourg", debut: "2026-11-20", fin: "2026-11-24" });
    expect(versEntreeQuartier({ draft: DRAFT, city: 1 })).toEqual({ ville: "Glasgow", debut: "2026-11-24", fin: "2026-11-27" });
    expect(versEntreeQuartier({ draft: DRAFT, city: 2 })).toEqual({ ville: "Inverness", debut: "2026-11-27", fin: "2026-11-30" });
    expect(versEntreeQuartier({ draft: { ...DRAFT, otherCities: [] }, city: 0 })).toEqual({ ville: "Édimbourg", debut: "2026-11-20", fin: "2026-11-30" });
    expect(() => versEntreeQuartier({ draft: DRAFT, city: 3 })).toThrow(RangeError);
  });

  it("aucune sentinelle du logement ni des engagements dans la requête quartier du journal", async () => {
    const { couche, journal } = monter();
    for (const city of [0, 1, 2]) {
      expect(await couche.proposerQuartier({ quartier: versEntreeQuartier({ draft: DRAFT, city }), resultats: RESULTATS })).toMatchObject({ ok: true });
    }
    expect(journal.requetes.map((r) => r.etape)).toEqual(["quartier", "quartier", "quartier"]);
    expect(journal.texte()).not.toContain("SENTINELLE");
  });
});

describe("couche IA : revue du head 5a955f8 (mineurs 3 et 4)", () => {
  it("clés interdites : variantes d'écriture (place_id, formatted_address, PlaceId…) refusées sans requête", async () => {
    const { couche, journal } = monter();
    for (const cle of ["place_id", "formatted_address", "PlaceId", "FORMATTED-ADDRESS", "Display_Name", "regular_opening_hours"]) {
      const candidats = [{ ...CANDIDATS[0], [cle]: "x" }];
      expect(await couche.noter({ entree: ENTREE, candidats } as never), cle).toEqual({ ok: false, code: "invalid_input", retryable: false });
    }
    expect(journal.requetes).toEqual([]);
  });

  it("entrée cyclique ou démesurée : refusée sans boucle ni requête (défaut fermé)", async () => {
    const { couche, journal } = monter();
    const cyclique: Record<string, unknown> = { ...ENTREE };
    cyclique.boucle = cyclique;
    expect(await couche.planifierRecherche({ entree: cyclique } as never)).toEqual({ ok: false, code: "invalid_input", retryable: false });
    const partage = { a: 1 };
    expect(await couche.planifierRecherche({ entree: { ...ENTREE, x: [partage, partage] } } as never)).toMatchObject({ code: "invalid_input" });
    const enorme = { entree: ENTREE, candidats: CANDIDATS, bourrage: Array.from({ length: MAX_NOEUDS_ENTREE + 1 }, () => 0) };
    expect(await couche.noter(enorme as never)).toEqual({ ok: false, code: "invalid_input", retryable: false });
    expect(journal.requetes).toEqual([]);
  });

  it("quartier : un logement dont la source n'est pas un résultat reçu est refusé et compté", async () => {
    const reponse = JSON.stringify({
      zone: { nom: "Vieille ville", raison: "Proche des musées.", centre: { lat: 55.95, lng: -3.19 }, rayonM: 800 },
      logements: [
        { nom: "Maison d'hôtes", meta: "Près du tram", sourceUrl: "https://guide.example/logements" },
        { nom: "Hôtel piégé", meta: "Réserve vite", sourceUrl: "https://hameconnage.example/reserver" },
      ],
    });
    const { couche } = monter((etape) => ({ texte: etape === "quartier" ? reponse : REPONSES[etape], coutUsd: 0 }));
    const resultat = await couche.proposerQuartier({ quartier: QUARTIER, resultats: RESULTATS });
    expect(resultat.ok && resultat.valeur.logements.map((l) => l.nom)).toEqual(["Maison d'hôtes"]);
    expect(resultat.ok && resultat.valeur.refuses).toBe(1);
  });
});
