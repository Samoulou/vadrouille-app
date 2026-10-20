// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ErreurModele, ETAPES_REQUETE, type ClientModeles, type EtapeRequete, type ReponseModele } from "@/ai/client";
import { creerCoucheIa, type ReglagesIa } from "@/ai/couche";
import { CODES_ERREUR_IA } from "@/ai/erreurs";
import { MODELE_ID_PATTERN } from "@/ai/reglages";
import {
  ATTRIBUTS_TRACE,
  COUT_MAX_MICROS,
  DUREE_MAX_MS,
  ETAPES_TRACE,
  executionIdAdmis,
  PROMPTS_TRACE,
  STATUTS_TRACE,
  TOKENS_MAX,
  tracerModeles,
  tracerRechercheWeb,
  type DebutEtape,
  type FinEtape,
  type TracesIa,
} from "@/ai/traces";
import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { creerRecherche } from "@/research/recherche";

import {
  configurationRecherche,
  ENTREE,
  GUIDE,
  lecteurScripte,
  modelesScriptes,
  PLAN,
  RECHERCHER,
  rechercheScriptee,
  tour,
  candidatBrut,
} from "../../support/recherche-doubles";

/**
 * B7b (décision 0096 § 2, B7-TL-7 ; spécification B7, « Traces ») : le port de traces et ses deux décorateurs. Exportateur
 * simulé, sentinelles fabriquées, aucun réseau, aucune clé, aucune donnée Google.
 */

const ROUTAGE = { data_collection: "deny" as const };
const REGLAGES: ReglagesIa = {
  structuration: { modele: "test/structuration", routage: ROUTAGE },
  quartier: { modele: "test/quartier", routage: ROUTAGE },
  plan: { modele: "test/plan", routage: ROUTAGE },
  notation: { modele: "test/notation", routage: ROUTAGE },
  raisons: { modele: "test/raisons", routage: ROUTAGE },
};

const SENTINELLES = ["SENTINELLE_RECIT_4F2", "SENTINELLE_BRIEF_9C1", "SENTINELLE_PAGE_7D3", "SENTINELLE_REQUETE_2B8", "SENTINELLE_VILLE_6E5"] as const;

/** Exportateur simulé : tout ce que le port reçoit, tel quel. */
function exportateur() {
  const debuts: unknown[] = [];
  const fins: unknown[] = [];
  const traces: TracesIa = {
    debutEtape(debut) {
      debuts.push(structuredClone(debut));
      return { n: debuts.length };
    },
    finEtape(_jeton, fin) {
      fins.push(structuredClone(fin));
    },
  };
  return { traces, debuts, fins, tout: () => [...debuts, ...fins] };
}

const horloge = () => {
  let t = 1_000;
  return () => (t += 7);
};

const REPONSES: Record<EtapeRequete, string> = {
  structuration: JSON.stringify({
    pace: "relaxed",
    wishes: ["museum"],
    inferredFields: ["pace"],
  }),
  quartier: JSON.stringify({
    zone: {
      nom: "Vieille ville",
      raison: "Proche.",
      centre: { lat: 55.95, lng: -3.19 },
      rayonM: 800,
    },
    logements: [],
  }),
  plan: JSON.stringify({
    secteurs: [
      {
        nom: "Vieille ville",
        raison: "Le cœur.",
        voisins: [],
        incontournables: [],
      },
    ],
    requetes: [{ requete: "musées", creneau: "activity" }],
  }),
  recherche: JSON.stringify({ actions: [], candidats: [], termine: true }),
  notation: JSON.stringify({
    notes: [
      {
        id: "c_001",
        matchesWishes: true,
        notForMeRisk: 2,
        mustSee: true,
        slotFit: ["activity"],
      },
    ],
  }),
  raisons: JSON.stringify({
    raisons: [{ id: "c_001", raison: "Pour les musées.", detour: "Au centre." }],
  }),
};

const clientDeBase = (
  reponse: (etape: EtapeRequete) => ReponseModele = (etape) => ({
    texte: REPONSES[etape],
    coutUsd: 0.0012,
    tokens: { entree: 120, sortie: 45 },
  }),
): ClientModeles => ({
  envoyer: async (requete) => reponse(requete.etape),
});

/** Vérifie qu'un évènement exporté ne contient que la liste fermée, et que chaque valeur est une valeur fermée. */
function verifierFermes(evenements: readonly unknown[]) {
  const interdits = ATTRIBUTS_TRACE.filter((cle) => cle === "executionId"); // posé par l'adaptateur de B9, jamais par src/ai
  for (const evenement of evenements) {
    const objet = evenement as Record<string, unknown>;
    for (const [cle, valeur] of Object.entries(objet)) {
      expect(ATTRIBUTS_TRACE as readonly string[], `attribut ${cle}`).toContain(cle);
      expect(interdits as readonly string[], `attribut ${cle}`).not.toContain(cle);
      if (typeof valeur === "number") {
        expect(Number.isInteger(valeur), cle).toBe(true);
        expect(valeur).toBeGreaterThanOrEqual(0);
        if (cle === "dureeMs") expect(valeur).toBeLessThanOrEqual(DUREE_MAX_MS);
        if (cle === "tokensEntree" || cle === "tokensSortie") expect(valeur).toBeLessThanOrEqual(TOKENS_MAX);
        if (cle === "coutMicros") expect(valeur).toBeLessThanOrEqual(COUT_MAX_MICROS);
        continue;
      }
      expect(typeof valeur, cle).toBe("string");
      if (cle === "etape") expect(ETAPES_TRACE as readonly string[]).toContain(valeur);
      else if (cle === "promptId") expect(PROMPTS_TRACE as readonly string[]).toContain(valeur);
      else if (cle === "statut") expect(STATUTS_TRACE as readonly string[]).toContain(valeur);
      else if (cle === "modele") expect(MODELE_ID_PATTERN.test(valeur as string)).toBe(true);
      else throw new Error(`attribut chaîne inattendu : ${cle}`);
    }
  }
}

/** Une requête réelle de la couche (avec son identifiant de prompt), obtenue par un client qui la mémorise. */
const PROMPT_REQUETE = async () => {
  let vue: unknown;
  const couche = creerCoucheIa({
    modeles: {
      envoyer: async (r) => ((vue = r), { texte: REPONSES[r.etape], coutUsd: 0 }),
    },
    reglages: REGLAGES,
  });
  await couche.noter({
    entree: ENTREE,
    candidats: [
      {
        id: "c_001",
        nom: "Musée",
        resume: "Un musée.",
        categorie: "museum",
        typeEtape: "activity",
      },
    ],
  });
  return vue as never;
};

describe("traces: aucun prompt ni brief dans les attributs exportés", () => {
  it("une exécution de chaque étape (récit, brief, pages et requêtes sentinelles) n'exporte que des attributs de la liste fermée", async () => {
    const sortie = exportateur();
    // Les modèles de la couche IA et de l'agent partagent le même client décoré (un client déjà décoré est rendu tel quel).
    const modeles = tracerModeles(clientDeBase(), sortie.traces, horloge());
    const couche = creerCoucheIa({
      modeles,
      reglages: REGLAGES,
      traces: sortie.traces,
    });

    const entree = {
      ...ENTREE,
      destination: `Édimbourg ${SENTINELLES[4]}`,
      envies: ["museum" as const],
    };
    await couche.structurerBrief({
      story: `Nous aimons marcher. ${SENTINELLES[0]}`,
      trip: {
        destination: "Édimbourg",
        start: "2026-11-23",
        end: "2026-11-26",
        otherCities: [],
      },
    });
    await couche.proposerQuartier({
      quartier: { ville: "Édimbourg", debut: "2026-11-23", fin: "2026-11-26" },
      resultats: [
        {
          url: "https://guide.example/x",
          titre: SENTINELLES[2],
          extrait: SENTINELLES[2],
        },
      ],
    });
    await couche.planifierRecherche({ entree: ENTREE });
    await couche.noter({
      entree: ENTREE,
      candidats: [
        {
          id: "c_001",
          nom: SENTINELLES[1],
          resume: SENTINELLES[1],
          categorie: "museum",
          typeEtape: "activity",
        },
      ],
    });
    await couche.rediger({
      entree: ENTREE,
      lieux: [
        {
          id: "c_001",
          nom: SENTINELLES[1],
          resume: SENTINELLES[1],
          categorie: "museum",
          typeEtape: "activity",
          sourceDomaine: "guide.example",
        },
      ],
    });

    // Agent : étape `recherche` (client partagé), et recherche web décorée par la composition.
    const web = tracerRechercheWeb(
      rechercheScriptee([{ ...GUIDE, titre: SENTINELLES[2], extrait: SENTINELLES[2] }]).client,
      sortie.traces,
      { modele: "test/web" },
      horloge(),
    );
    const scripte = modelesScriptes({
      plan: [PLAN],
      recherche: [
        tour({
          actions: [{ type: "rechercher", requete: SENTINELLES[3] }, RECHERCHER],
          candidats: [candidatBrut("Musée maison")],
          termine: true,
        }),
      ],
    });
    const recherche = creerRecherche({
      ia: couche,
      modeles: tracerModeles(scripte.client, sortie.traces, horloge()),
      rechercheWeb: web,
      lecteur: lecteurScripte(SENTINELLES[2]).lecteur,
      configuration: configurationRecherche(),
    });
    await recherche.rechercher({ entree }, "apercu");

    const etapes = new Set(sortie.debuts.map((debut) => (debut as DebutEtape).etape));
    for (const etape of ETAPES_TRACE) expect(etapes.has(etape), etape).toBe(true);
    verifierFermes(sortie.tout());

    const texte = JSON.stringify(sortie.tout());
    for (const sentinelle of SENTINELLES) expect(texte).not.toContain(sentinelle);
    for (const fin of sortie.fins as FinEtape[]) expect(fin.statut).toBe("ok");
    // Chaque étape ouverte est fermée, une fois.
    expect(sortie.fins).toHaveLength(sortie.debuts.length);
  });

  it("le début d'une étape ne porte que étape, modèle, promptId et promptVersion ; la requête web n'est jamais lue", async () => {
    const sortie = exportateur();
    const requetes: string[] = [];
    const web: ClientRechercheWeb = {
      async rechercher(requete) {
        requetes.push(requete);
        return { resultats: [], coutUsd: 0.002 };
      },
    };
    await tracerRechercheWeb(web, sortie.traces, { modele: "test/web" }, horloge()).rechercher(`musées ${SENTINELLES[3]}`);
    expect(requetes).toEqual([`musées ${SENTINELLES[3]}`]);
    expect(sortie.debuts).toEqual([
      {
        etape: "recherche_web",
        modele: "test/web",
        promptId: expect.any(String),
        promptVersion: expect.any(Number),
      },
    ]);
    expect(sortie.fins).toEqual([{ statut: "ok", dureeMs: 7, coutMicros: 2000 }]);
  });

  it("jetons et coût de la réponse : entiers bornés ; une valeur hors bornes ferme l'intervalle avec le seul statut", async () => {
    const sortie = exportateur();
    const client = tracerModeles(
      clientDeBase(() => ({
        texte: "{}",
        coutUsd: 0.0005,
        tokens: { entree: 1.5, sortie: 3 },
      })),
      sortie.traces,
      horloge(),
    );
    await client.envoyer(await PROMPT_REQUETE());
    expect(sortie.fins).toEqual([{ statut: "ok" }]);
    const bon = exportateur();
    await tracerModeles(clientDeBase(), bon.traces, horloge()).envoyer(await PROMPT_REQUETE());
    expect(bon.fins).toEqual([
      {
        statut: "ok",
        dureeMs: 7,
        tokensEntree: 120,
        tokensSortie: 45,
        coutMicros: 1200,
      },
    ]);
  });

  it("une requête sans identifiant de prompt n'ouvre aucune trace, et l'étape va quand même à son terme", async () => {
    const sortie = exportateur();
    const reponse = await tracerModeles(clientDeBase(), sortie.traces, horloge()).envoyer({
      etape: "plan",
      modele: "test/plan",
      routage: ROUTAGE,
      messages: [],
    } as never);
    expect(reponse.texte).toBe(REPONSES.plan);
    expect(sortie.debuts).toEqual([]);
    expect(sortie.fins).toEqual([]);
  });
});

describe("traces: les traces ne cassent jamais une étape", () => {
  it("un port qui lève, rejette ou rend un « thenable » piégé est absorbé", async () => {
    const requete = await PROMPT_REQUETE();
    const pieges: TracesIa[] = [
      {
        debutEtape: () => {
          throw new Error(SENTINELLES[0]);
        },
        finEtape: () => undefined,
      },
      {
        debutEtape: () => ({}),
        finEtape: () => {
          throw new Error(SENTINELLES[0]);
        },
      },
      {
        debutEtape: () => Promise.reject(new Error(SENTINELLES[0])) as never,
        finEtape: () => undefined,
      },
      {
        debutEtape: () => ({
          get then() {
            throw new Error(SENTINELLES[0]);
          },
        }),
        finEtape: () => undefined,
      },
      {
        debutEtape: () => ({}),
        finEtape: () => Promise.reject(new Error(SENTINELLES[0])) as never,
      },
    ];
    for (const port of pieges) {
      const client = tracerModeles(clientDeBase(), port, horloge());
      await expect(client.envoyer(requete)).resolves.toMatchObject({
        texte: REPONSES.notation,
      });
    }
  });

  it("une erreur du client est propagée telle quelle ; le statut est son code fermé, jamais son message", async () => {
    const requete = await PROMPT_REQUETE();
    const sortie = exportateur();
    const code = tracerModeles(
      clientDeBase(() => {
        throw new ErreurModele("model_error");
      }),
      sortie.traces,
      horloge(),
    );
    await expect(code.envoyer(requete)).rejects.toBeInstanceOf(ErreurModele);
    const inattendue = tracerModeles(
      clientDeBase(() => {
        throw new Error(SENTINELLES[0]);
      }),
      sortie.traces,
      horloge(),
    );
    await expect(inattendue.envoyer(requete)).rejects.toThrow(SENTINELLES[0]);
    expect((sortie.fins as FinEtape[]).map((fin) => fin.statut)).toEqual(["model_error", "erreur_inattendue"]);
    expect(JSON.stringify(sortie.tout())).not.toContain(SENTINELLES[0]);
    expect(CODES_ERREUR_IA).toContain("model_error");
  });

  it("un client déjà décoré est rendu tel quel : une étape n'est tracée qu'une fois", async () => {
    const sortie = exportateur();
    const une = tracerModeles(clientDeBase(), sortie.traces, horloge());
    const deux = tracerModeles(une, sortie.traces, horloge());
    expect(deux).toBe(une);
    const web = tracerRechercheWeb(rechercheScriptee([]).client, sortie.traces, { modele: "test/web" }, horloge());
    expect(tracerRechercheWeb(web, sortie.traces, { modele: "test/web" }, horloge())).toBe(web);
    const couche = creerCoucheIa({
      modeles: une,
      reglages: REGLAGES,
      traces: sortie.traces,
    });
    await couche.noter({
      entree: ENTREE,
      candidats: [
        {
          id: "c_001",
          nom: "Musée",
          resume: "Un musée.",
          categorie: "museum",
          typeEtape: "activity",
        },
      ],
    });
    expect(sortie.debuts).toHaveLength(1);
  });

  it("sans port de traces, aucune trace : le comportement est celui de B7a", async () => {
    const couche = creerCoucheIa({
      modeles: clientDeBase(),
      reglages: REGLAGES,
    });
    expect(
      await couche.noter({
        entree: ENTREE,
        candidats: [
          {
            id: "c_001",
            nom: "Musée",
            resume: "Un musée.",
            categorie: "museum",
            typeEtape: "activity",
          },
        ],
      }),
    ).toMatchObject({ ok: true });
  });

  it("identifiant d'exécution : seul un motif opaque est admis, le reste est omis", () => {
    expect(executionIdAdmis("0b6f2c1e-8c7a-4d11-9f3e-5a1d2b3c4d5e")).toBe("0b6f2c1e-8c7a-4d11-9f3e-5a1d2b3c4d5e");
    for (const mauvais of ["", "a b", "org/123", "x".repeat(65), "é", undefined, 12, null, "id\n"]) expect(executionIdAdmis(mauvais)).toBeUndefined();
  });

  it("toutes les étapes de modèle sont dans la liste des étapes tracées", () => {
    for (const etape of ETAPES_REQUETE) expect(ETAPES_TRACE as readonly string[]).toContain(etape);
    expect(ETAPES_TRACE).toContain("recherche_web");
  });
});
