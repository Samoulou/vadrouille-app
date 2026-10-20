// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ErreurModele } from "@/ai/client";
import { PlafondAgentAtteint } from "@/research/plafonds-agent";
import { creerRecherche, type DemandeProfil, type DependancesRecherche } from "@/research/recherche";

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
  type CandidatBrut,
} from "../../support/recherche-doubles";

/**
 * `recherche: bornes du profil` (spécification B7, critères « B7b » ; B7-PO-5) : pour chaque profil (`apercu`, `complet`,
 * `mini`), l'agent s'arrête à la cible de candidats, au total, au nombre de tours, au délai du profil (horloge injectée)
 * ou au premier refus `cap_reached` ; aucune recherche ni lecture après l'arrêt ; candidats déjà rendus conservés.
 * Comptage des cibles : `creneauCompte` (ticket 483, qui remplace le comptage par `creneauDe` de la spécification) ; une
 * cible à 0 est atteinte d'emblée. Doubles seulement : aucun appel réel, aucune clé.
 */

const repas = (nom: string): CandidatBrut => candidatBrut(nom, { categorie: "restaurant", typeEtape: "meal" });
const activite = (nom: string): CandidatBrut => candidatBrut(nom);
const soiree = (nom: string): CandidatBrut => candidatBrut(nom, { slotFit: ["evening"] });
const evenement = (nom: string, date: string): CandidatBrut =>
  candidatBrut(nom, {
    categorie: "nightlife",
    typeEtape: "event",
    evenement: { date, heure: "20:00" },
  });

/** Profils et de quoi atteindre exactement leur cible (cibles de `configurationRecherche`). */
const PROFILS: readonly [string, DemandeProfil, CandidatBrut[]][] = [
  ["apercu", "apercu", [activite("Musée A"), activite("Musée B"), repas("Table A")]],
  ["complet", "complet", [activite("Musée A"), activite("Musée B"), activite("Musée C"), repas("Table A"), repas("Table B"), soiree("Vue du soir")]],
  ["mini (repas)", { mini: "meal" }, [repas("Table A"), repas("Table B")]],
];

function monter(
  reponses: Parameters<typeof modelesScriptes>[0],
  options: {
    avantModele?: Parameters<typeof modelesScriptes>[1];
    horloge?: () => number;
    web?: ReturnType<typeof rechercheScriptee>;
    lecteur?: ReturnType<typeof lecteurScripte>;
    configuration?: DependancesRecherche["configuration"];
  } = {},
) {
  const modeles = modelesScriptes(reponses, options.avantModele);
  const web = options.web ?? rechercheScriptee([GUIDE]);
  const lecteur = options.lecteur ?? lecteurScripte();
  const recherche = creerRecherche({
    ia: {
      proposerQuartier: async () => ({
        ok: false,
        code: "no_option",
        retryable: false,
      }),
    },
    modeles: modeles.client,
    rechercheWeb: web.client,
    lecteur: lecteur.lecteur,
    configuration: options.configuration ?? configurationRecherche(),
    ...(options.horloge === undefined ? {} : { horloge: options.horloge }),
  });
  return { recherche, modeles, web, lecteur };
}

describe("recherche: bornes du profil", () => {
  it.each(PROFILS)("%s : arrêt à la cible de candidats, aucune recherche ni tour après l'arrêt", async (_nom, profil, candidats) => {
    const { recherche, modeles, web, lecteur } = monter({
      plan: [PLAN],
      recherche: [tour({ actions: [RECHERCHER] }), tour({ candidats, actions: [RECHERCHER, LIRE] }), tour({ actions: [RECHERCHER] })],
    });
    const resultat = await recherche.rechercher({ entree: ENTREE }, profil);
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.candidats.map((c) => c.name).sort()).toEqual(candidats.map((c) => String(c.nom)).sort());
    // Plan, deux tours : le troisième tour n'a pas lieu, ni la recherche et la lecture demandées au tour 2.
    expect(modeles.appels("plan")).toBe(1);
    expect(modeles.appels("recherche")).toBe(2);
    expect(web.requetes).toHaveLength(1);
    expect(lecteur.lues).toEqual([]);
    expect(resultat.valeur.bilan.errors).toEqual([]);
  });

  it("une cible à 0 est atteinte d'emblée : le profil mini ne s'arrête pas sur des activités quand sa cible est le repas", async () => {
    const { recherche, modeles } = monter({
      plan: [PLAN],
      recherche: [
        tour({ actions: [RECHERCHER] }),
        tour({
          candidats: [activite("Musée A"), activite("Musée B"), activite("Musée C")],
          actions: [RECHERCHER],
        }),
        tour({ actions: [RECHERCHER] }),
      ],
    });
    const resultat = await recherche.rechercher({ entree: ENTREE }, { mini: "meal" });
    // Total du mini (3) atteint par les trois activités : arrêt sur le total, sans cible de repas servie.
    expect(resultat.ok && resultat.valeur.candidats).toHaveLength(3);
    expect(modeles.appels("recherche")).toBe(2);
  });

  it.each(PROFILS)("%s : arrêt au nombre de tours du profil", async (_nom, profil) => {
    const tours = Array.from({ length: 10 }, () => tour({ actions: [RECHERCHER] }));
    const { recherche, modeles, web } = monter({
      plan: [PLAN],
      recherche: tours,
    });
    const resultat = await recherche.rechercher({ entree: ENTREE }, profil);
    const profils = configurationRecherche().profils;
    const attendu = profil === "apercu" ? profils.apercu.toursMax : profil === "complet" ? profils.complet.toursMax : profils.mini.toursMax;
    expect(resultat.ok && resultat.valeur.candidats).toEqual([]);
    expect(modeles.appels("recherche")).toBe(attendu);
    expect(web.requetes).toHaveLength(attendu);
  });

  it("arrêt au total (les événements comptent dans le total, jamais dans une cible de créneau)", async () => {
    const configuration = configurationRecherche({
      apercu: {
        ciblesParCreneau: { activity: 1, meal: 0, evening: 0 },
        totalCandidats: 2,
        toursMax: 3,
        ageSourceMaxJours: 1095,
        delaiMs: 30_000,
      },
    });
    const { recherche, modeles } = monter(
      {
        plan: [PLAN],
        recherche: [
          tour({ actions: [RECHERCHER] }),
          tour({
            candidats: [evenement("Concert A", "2026-11-24"), evenement("Concert B", "2026-11-25")],
            actions: [RECHERCHER],
          }),
          tour({ actions: [RECHERCHER] }),
        ],
      },
      { configuration },
    );
    const resultat = await recherche.rechercher({ entree: ENTREE }, "apercu");
    expect(resultat.ok && resultat.valeur.candidats).toHaveLength(2);
    expect(modeles.appels("recherche")).toBe(2);
  });

  it("arrêt au délai du profil (horloge injectée) : rien ne part après l'échéance, les candidats admis sont conservés", async () => {
    let instant = 1_000_000;
    const horloge = () => instant;
    const { recherche, modeles, web } = monter(
      {
        plan: [PLAN],
        recherche: [
          tour({ actions: [RECHERCHER] }),
          tour({
            candidats: [activite("Musée A")],
            actions: [RECHERCHER, LIRE],
          }),
          tour({ actions: [RECHERCHER] }),
        ],
      },
      {
        horloge,
        // Chaque appel de modèle prend 12 s : le plan finit à 12 s, le tour 1 à 24 s, le tour 2 à 36 s (délai : 30 s).
        avantModele: { avant: () => void (instant += 12_000) },
      },
    );
    const resultat = await recherche.rechercher({ entree: ENTREE }, "apercu");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.candidats.map((c) => c.name)).toEqual(["Musée A"]);
    // Tour 2 admis (24 s), ses actions refusées (36 s) : une seule recherche web (tour 1), aucune lecture, pas de tour 3.
    expect(modeles.appels("recherche")).toBe(2);
    expect(web.requetes).toHaveLength(1);
    expect(resultat.valeur.bilan.durationMs).toBe(36_000);
  });

  it("plafond atteint (cap_reached) : arrêt au premier refus, candidats conservés, code dans le bilan, aucun appel ensuite", async () => {
    let appels = 0;
    const web = rechercheScriptee(() => {
      appels += 1;
      if (appels === 2) throw new PlafondAgentAtteint();
      return [GUIDE];
    });
    const lecteur = lecteurScripte();
    const { recherche, modeles } = monter(
      {
        plan: [PLAN],
        recherche: [
          tour({ actions: [RECHERCHER] }),
          tour({
            candidats: [activite("Musée A")],
            actions: [RECHERCHER, LIRE, RECHERCHER],
          }),
          tour({ actions: [RECHERCHER] }),
        ],
      },
      { web, lecteur },
    );
    const resultat = await recherche.rechercher({ entree: ENTREE }, "complet");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.candidats.map((c) => c.name)).toEqual(["Musée A"]);
    expect(resultat.valeur.bilan.errors).toEqual(["cap_reached"]);
    expect(appels).toBe(2);
    expect(lecteur.lues).toEqual([]);
    expect(modeles.appels("recherche")).toBe(2);
  });

  it("plafond atteint sans aucun candidat : le code fermé est rendu tel quel, non réessayable", async () => {
    const web = rechercheScriptee(() => {
      throw new PlafondAgentAtteint();
    });
    const { recherche } = monter({ plan: [PLAN], recherche: [tour({ actions: [RECHERCHER] })] }, { web });
    expect(await recherche.rechercher({ entree: ENTREE }, "apercu")).toEqual({
      ok: false,
      code: "cap_reached",
      retryable: false,
    });
  });

  it("refus d'un client de modèles (code fermé) : même règle ; un code réessayable le reste", async () => {
    const { recherche } = monter(
      { plan: [PLAN] },
      {
        avantModele: {
          avant: () => {
            throw new ErreurModele("model_unavailable");
          },
        },
      },
    );
    const resultat = await recherche.rechercher({ entree: ENTREE }, "apercu");
    expect(resultat).toEqual({
      ok: false,
      code: "model_unavailable",
      retryable: false,
    });
  });

  it("une exception sans code fermé est un défaut de programmation : elle se propage", async () => {
    const { recherche } = monter(
      { plan: [PLAN] },
      {
        avantModele: {
          avant: () => {
            throw new TypeError("SENTINELLE-DEFAUT");
          },
        },
      },
    );
    await expect(recherche.rechercher({ entree: ENTREE }, "apercu")).rejects.toThrow("SENTINELLE-DEFAUT");
  });

  it("entrée refusée avant tout appel : invalid_input (entrée, nom déjà trouvé trop long, profil inconnu)", async () => {
    const { recherche, modeles, web } = monter({ plan: [PLAN] });
    expect(await recherche.rechercher({ entree: { ...ENTREE, destination: "x" } }, "apercu")).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await recherche.rechercher({ entree: ENTREE, dejaTrouves: ["x".repeat(201)] }, "apercu")).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await recherche.rechercher({ entree: ENTREE }, "inconnu" as unknown as DemandeProfil)).toMatchObject({ ok: false, code: "invalid_input" });
    expect(
      await recherche.rechercher({ entree: ENTREE }, {
        mini: "nuit",
      } as unknown as DemandeProfil),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await recherche.rechercher({ entree: { ...ENTREE, placeId: "x" } as never }, "apercu")).toMatchObject({ ok: false, code: "invalid_input" });
    expect(modeles.requetes).toEqual([]);
    expect(web.requetes).toEqual([]);
  });

  it("les noms déjà trouvés sont remis au modèle et jamais re-trouvés (recherche complémentaire)", async () => {
    const { recherche, modeles } = monter({
      plan: [PLAN],
      recherche: [
        tour({ actions: [RECHERCHER] }),
        tour({
          candidats: [activite("Musée connu"), activite("Musée nouveau")],
          termine: true,
        }),
      ],
    });
    const resultat = await recherche.rechercher({ entree: ENTREE, dejaTrouves: ["Musée connu"] }, "complet");
    expect(resultat.ok && resultat.valeur.candidats.map((c) => c.name)).toEqual(["Musée nouveau"]);
    const tours = modeles.requetes.filter((r) => r.etape === "recherche");
    expect(tours[0]?.messages.map((m) => m.contenu).join("\n")).toContain("Musée connu");
  });

  it("le bilan : requêtes émises, pages lues, durée, coût estimé en micro-USD, codes fermés ; aucun compteur de candidats", async () => {
    let instant = 5_000;
    const { recherche } = monter(
      {
        plan: [PLAN],
        recherche: [
          tour({ actions: [RECHERCHER, LIRE] }),
          tour({
            candidats: [activite("Musée A"), repas("Table A"), activite("Musée B")],
            termine: true,
          }),
        ],
      },
      {
        horloge: () => instant,
        avantModele: { avant: () => void (instant += 1_000), coutUsd: 0.001 },
        web: rechercheScriptee([GUIDE], {
          avant: () => void (instant += 500),
          coutUsd: 0.002,
        }),
      },
    );
    const resultat = await recherche.rechercher({ entree: ENTREE }, "apercu");
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    expect(resultat.valeur.bilan).toEqual({
      queries: ["musées Édimbourg"],
      pagesRead: 1,
      durationMs: 3_500,
      // Trois appels de modèle (0,001 USD) et une recherche web (0,002 USD).
      costEstimateMicros: 5_000,
      errors: [],
    });
    expect(Object.keys(resultat.valeur.bilan).sort()).toEqual(["costEstimateMicros", "durationMs", "errors", "pagesRead", "queries"]);
  });
});

void URL_GUIDE;
