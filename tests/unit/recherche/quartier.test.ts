// @vitest-environment node
import { describe, expect, it } from "vitest";

import { creerCoucheIa, type CoucheIa } from "@/ai/couche";
import { LodgingSuggestionSchema } from "@/contracts";
import { creerRecherche } from "@/research/recherche";

import { configurationRecherche, lecteurScripte, modelesScriptes, rechercheScriptee } from "../../support/recherche-doubles";

/**
 * `recherche: quartier conseillé` (spécification B7, critères « B7b » ; B7-PO-3) : `suggererQuartier` ne lit aucune page,
 * reste dans les bornes du profil `mini`, écarte un logement dont l'URL n'est pas dans les résultats, pose `areaId` et
 * `lodgingId` (ceux d'un modèle sont ignorés), rend `lodgings: []` avec une zone quand aucun logement ne passe, et
 * `no_option` quand le modèle ne propose aucune zone. Doubles seulement.
 */

const QUARTIER = { ville: "Édimbourg", debut: "2026-11-23", fin: "2026-11-28" };
const URL_A = "https://hotels.example/vieille-ville";
const URL_B = "https://guide.example/new-town";
const URL_C = "https://guide.example/leith";
const URL_HORS = "https://piege.example/hors-resultats";
const ZONE = {
  nom: "Vieille ville",
  raison: "Au pied du château, tout se fait à pied.",
  centre: { lat: 55.95, lng: -3.19 },
  rayonM: 900,
};
const logement = (nom: string, sourceUrl: string, extra: Record<string, unknown> = {}) => ({ nom, meta: "Maison d'hôtes · près du tram", sourceUrl, ...extra });
const reponse = (valeur: unknown) => JSON.stringify(valeur);

const RESULTATS = [
  {
    url: URL_A,
    titre: "Hôtels de la vieille ville",
    extrait: "Plusieurs hôtels.",
  },
  { url: URL_B, titre: "New Town", extrait: "Quartier géorgien." },
  { url: URL_C, titre: "Leith", extrait: "Port et restaurants." },
];

const REGLAGE = {
  modele: "fournisseur/recherche-test",
  routage: { data_collection: "deny" as const },
};
const REGLAGES = {
  structuration: REGLAGE,
  quartier: REGLAGE,
  plan: REGLAGE,
  notation: REGLAGE,
  raisons: REGLAGE,
};

function monter(
  sortieModele: string,
  options: {
    ia?: Pick<CoucheIa, "proposerQuartier">;
    resultats?: typeof RESULTATS;
    web?: ReturnType<typeof rechercheScriptee>;
  } = {},
) {
  const modeles = modelesScriptes({ quartier: [sortieModele] });
  const web = options.web ?? rechercheScriptee(options.resultats ?? RESULTATS);
  const lecteur = lecteurScripte();
  const ia = options.ia ?? creerCoucheIa({ modeles: modeles.client, reglages: REGLAGES });
  const recherche = creerRecherche({
    ia,
    modeles: modeles.client,
    rechercheWeb: web.client,
    lecteur: lecteur.lecteur,
    configuration: configurationRecherche(),
  });
  return { recherche, modeles, web, lecteur };
}

describe("recherche: quartier conseillé", () => {
  it("ne lit aucune page, reste dans les bornes du profil mini, écarte un logement hors des résultats, pose les identifiants", async () => {
    const { recherche, modeles, web, lecteur } = monter(
      reponse({
        zone: ZONE,
        logements: [
          logement("Hôtel du Château", URL_A),
          logement("Piège", URL_HORS),
          logement("Maison Georgienne", URL_B),
          logement("Auberge du Port", URL_C),
          logement("Quatrième", URL_A),
          // Identifiants proposés par un modèle : l'élément est écarté (clé en trop), jamais accepté.
          {
            ...logement("Avec identifiant", URL_A),
            lodgingId: "lodging_99",
            placeId: "x",
          },
        ],
      }),
    );
    const ecartes: number[] = [];
    const resultat = await recherche.suggererQuartier(QUARTIER, (n) => ecartes.push(n));
    expect(resultat.ok).toBe(true);
    if (!resultat.ok) return;
    // Aucune lecture de page ; au plus `recherchesWeb` (2) recherches posées par le code ; une seule requête de modèle.
    expect(lecteur.lues).toEqual([]);
    expect(web.requetes).toHaveLength(configurationRecherche().profils.mini.logements.recherchesWeb);
    expect(modeles.appels("quartier")).toBe(1);
    expect(modeles.appels("plan")).toBe(0);
    // Logements : la couche IA n'en garde que trois au plus (les suivants sont refusés) ; parmi eux, ceux dont l'URL est dans
    // les résultats (« Piège » tombe), identifiants posés par le code.
    expect(resultat.valeur.lodgings).toEqual([
      {
        lodgingId: "lodging_1",
        name: "Hôtel du Château",
        meta: "Maison d'hôtes · près du tram",
      },
      {
        lodgingId: "lodging_2",
        name: "Maison Georgienne",
        meta: "Maison d'hôtes · près du tram",
      },
    ]);
    expect(resultat.valeur.area).toEqual({
      areaId: "area_1",
      name: "Vieille ville",
      reason: ZONE.raison,
      center: ZONE.centre,
      radiusM: 900,
    });
    expect(ecartes).toHaveLength(1);
    // La sortie complétée d'un `placeId` de test passe `LodgingSuggestionSchema`.
    const completee = {
      area: resultat.valeur.area,
      lodgings: resultat.valeur.lodgings.map((l, rang) => ({
        ...l,
        placeId: `place-test-${rang}`,
      })),
    };
    expect(LodgingSuggestionSchema.safeParse(completee).success).toBe(true);
    for (const l of resultat.valeur.lodgings) expect(l).not.toHaveProperty("placeId");
  });

  it("contrôle l'URL aussi dans src/research : une couche IA qui rend un logement hors des résultats ne le fait pas passer", async () => {
    const ia: Pick<CoucheIa, "proposerQuartier"> = {
      proposerQuartier: async () => ({
        ok: true,
        valeur: {
          zone: {
            nom: "Vieille ville",
            raison: "Au pied du château.",
            centre: { lat: 55.95, lng: -3.19 },
            rayonM: 900,
          },
          logements: [
            { nom: "Piège", meta: "Hôtel", sourceUrl: URL_HORS },
            {
              nom: "Hôtel du Château",
              meta: "Hôtel",
              sourceUrl: `${URL_A}#ancre`,
            },
          ],
          refuses: 2,
        },
      }),
    };
    const ecartes: number[] = [];
    const { recherche } = monter("{}", { ia });
    const resultat = await recherche.suggererQuartier(QUARTIER, (n) => ecartes.push(n));
    expect(resultat.ok && resultat.valeur.lodgings.map((l) => l.name)).toEqual(["Hôtel du Château"]);
    expect(ecartes).toEqual([3]);
  });

  it("aucun logement ne passe : une zone seule est une réponse valide (lodgings: [])", async () => {
    const { recherche } = monter(reponse({ zone: ZONE, logements: [logement("Piège", URL_HORS)] }));
    const resultat = await recherche.suggererQuartier(QUARTIER);
    expect(resultat.ok && resultat.valeur.lodgings).toEqual([]);
    expect(resultat.ok && resultat.valeur.area.areaId).toBe("area_1");
    expect(LodgingSuggestionSchema.safeParse(resultat.ok && resultat.valeur).success).toBe(true);
  });

  it("le modèle déclare n'avoir aucune zone : no_option ; une sortie invalide reste model_output_invalid", async () => {
    expect(await monter(reponse({ zone: null, logements: [] })).recherche.suggererQuartier(QUARTIER)).toEqual({
      ok: false,
      code: "no_option",
      retryable: false,
    });
    expect(await monter("pas du JSON").recherche.suggererQuartier(QUARTIER)).toEqual({ ok: false, code: "model_output_invalid", retryable: false });
    expect(await monter(reponse({ logements: [] })).recherche.suggererQuartier(QUARTIER)).toMatchObject({ ok: false, code: "model_output_invalid" });
  });

  it("entrée refusée avant toute recherche : invalid_input", async () => {
    const { recherche, web, modeles } = monter("{}");
    expect(await recherche.suggererQuartier({ ...QUARTIER, ville: "x" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(await recherche.suggererQuartier({ ...QUARTIER, fin: "2026-11-01" })).toMatchObject({ ok: false, code: "invalid_input" });
    expect(
      await recherche.suggererQuartier({
        ...QUARTIER,
        logement: "Hôtel X",
      } as never),
    ).toMatchObject({ ok: false, code: "invalid_input" });
    expect(web.requetes).toEqual([]);
    expect(modeles.requetes).toEqual([]);
  });

  it("plafond atteint pendant la recherche : code fermé rendu sans appel de modèle quand aucun résultat n'a été obtenu", async () => {
    const web = rechercheScriptee(() => {
      throw Object.assign(new Error("cap_reached"), { code: "cap_reached" });
    });
    const { recherche, modeles } = monter("{}", { web });
    expect(await recherche.suggererQuartier(QUARTIER)).toEqual({
      ok: false,
      code: "cap_reached",
      retryable: false,
    });
    expect(modeles.requetes).toEqual([]);
  });

  it("requête web envoyée chez le moteur : valeur normalisée, sans caractère de format, de contrôle, de balise ni retour à la ligne", async () => {
    // U+E0041 (balise), U+2060, U+00AD, U+FE0F, U+202E, U+200B, U+200C : tous retirés ou remplacés avant l'envoi.
    const ville = "\u{E0041}Édi⁠m­bourg️‮ ​‌<b>\r\n";
    const { recherche, web } = monter(reponse({ zone: null, logements: [] }));
    await recherche.suggererQuartier({ ...QUARTIER, ville });
    expect(web.requetes.length).toBeGreaterThan(0);
    for (const requete of web.requetes) {
      expect(requete, "format").not.toMatch(/\p{Cf}/u);
      expect(requete, "contrôle").not.toMatch(/\p{Cc}/u);
      expect(requete).not.toMatch(/[<>]/);
      expect(requete).not.toMatch(new RegExp("[\\n\\r\\u2028\\u2029]"));
      expect(requete).not.toMatch(new RegExp("[\\uFE00-\\uFE0F\\u{E0100}-\\u{E01EF}]", "u"));
      expect(requete).toContain("Édimbourg");
    }
  });
});
