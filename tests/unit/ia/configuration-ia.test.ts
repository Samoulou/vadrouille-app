// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, expectTypeOf, it } from "vitest";

import { ETAPES_REQUETE } from "@/ai/client";
import type { ReglagesIa } from "@/ai/couche";
import { MOTEURS_RECHERCHE_WEB } from "@/ai/reglages";
import type { BornesRecherche } from "@/research/bornes";
import { CONFIGURATION_IA, ETAPES_REGLAGES, ETAPES_ZDR, chargerConfigurationIa, type ConfigurationIa } from "@/server/config/ia";

import iaJson from "../../../src/server/config/ia.json";
import modelesJson from "../../../prototype/config/modeles.json";
import rechercheJson from "../../../prototype/config/recherche.json";
import { validerConfigurationIa } from "../../support/configuration-ia";

/**
 * B7b (décision 0096 § 3 point 9) : la configuration de production de la couche IA. Tous les cas partent des fichiers
 * commités, copiés puis modifiés ; aucun fichier n'est écrit.
 */

type Arbre = { [cle: string]: unknown };

const copie = <T>(valeur: T): T => structuredClone(valeur);
const ia = (): Arbre => copie(iaJson) as Arbre;
const modeles = (): Arbre => copie(modelesJson) as Arbre;
const recherche = (): Arbre => copie(rechercheJson) as Arbre;

/** Noeud d'un chemin (objets seulement) ; lève si le chemin n'existe pas. */
function noeud(racine: Arbre, chemin: readonly string[]): Arbre {
  let courant: Arbre = racine;
  for (const cle of chemin) {
    const suivant = courant[cle];
    if (suivant === null || typeof suivant !== "object") throw new Error(`chemin absent : ${chemin.join(".")}`);
    courant = suivant as Arbre;
  }
  return courant;
}
/** Copie de `racine` dont la valeur du chemin est remplacée (ou ajoutée). */
function avec(racine: Arbre, chemin: readonly string[], valeur: unknown): Arbre {
  const copieRacine = copie(racine);
  const dernier = chemin[chemin.length - 1];
  if (dernier === undefined) throw new Error("chemin vide");
  noeud(copieRacine, chemin.slice(0, -1))[dernier] = valeur;
  return copieRacine;
}
/** Copie de `racine` sans la clé du chemin. */
function sans(racine: Arbre, chemin: readonly string[]): Arbre {
  const copieRacine = copie(racine);
  const dernier = chemin[chemin.length - 1];
  if (dernier === undefined) throw new Error("chemin vide");
  delete noeud(copieRacine, chemin.slice(0, -1))[dernier];
  return copieRacine;
}

const charge = (production: unknown = ia(), m: unknown = modeles(), r: unknown = recherche()) => validerConfigurationIa(production, m, r);

describe("configuration ia: valeur absente, inconnue ou hors bornes refusée", () => {
  it("les fichiers commités passent", () => {
    expect(() => charge()).not.toThrow();
    expect(() => validerConfigurationIa(iaJson, modelesJson, rechercheJson)).not.toThrow();
  });

  it("chaque clé obligatoire de ia.json absente est refusée", () => {
    const chemins: string[][] = [
      ["schema"],
      ["variante"],
      ["zdr"],
      ["profils"],
      ["profils", "apercu"],
      ["profils", "apercu", "ciblesParCreneau"],
      ["profils", "apercu", "ciblesParCreneau", "activity"],
      ["profils", "apercu", "ciblesParCreneau", "meal"],
      ["profils", "apercu", "ciblesParCreneau", "evening"],
      ["profils", "apercu", "totalCandidats"],
      ["profils", "apercu", "toursMax"],
      ["profils", "apercu", "delaiMs"],
      ["profils", "complet"],
      ["profils", "complet", "delaiMs"],
      ["profils", "mini"],
      ["profils", "mini", "cible"],
      ["profils", "mini", "totalCandidats"],
      ["profils", "mini", "toursMax"],
      ["profils", "mini", "delaiMs"],
      ["profils", "mini", "logements"],
      ["profils", "mini", "logements", "cible"],
      ["profils", "mini", "logements", "recherchesWeb"],
    ];
    for (const chemin of chemins) {
      expect(() => charge(sans(ia(), chemin)), chemin.join(".")).toThrow();
    }
  });

  it("une clé inconnue est refusée, à chaque niveau", () => {
    const chemins: string[][] = [
      [],
      ["profils"],
      ["profils", "apercu"],
      ["profils", "apercu", "ciblesParCreneau"],
      ["profils", "complet"],
      ["profils", "mini"],
      ["profils", "mini", "logements"],
      ["zdr"],
    ];
    for (const chemin of chemins) {
      expect(() => charge(avec(ia(), [...chemin, "inconnue"], 1)), chemin.join(".")).toThrow();
    }
  });

  it("une borne de profil refusée par BornesRechercheSchema", () => {
    // Somme des cibles (18) au-dessus du total.
    expect(() => charge(avec(ia(), ["profils", "apercu", "totalCandidats"], 17))).toThrow();
    expect(() =>
      charge(
        avec(ia(), ["profils", "apercu", "ciblesParCreneau"], {
          activity: 0,
          meal: 0,
          evening: 0,
        }),
      ),
    ).toThrow();
    expect(() => charge(avec(ia(), ["profils", "apercu", "delaiMs"], 0))).toThrow();
  });

  it("une cible mini à 0 est refusée", () => {
    expect(() => charge(avec(ia(), ["profils", "mini", "cible"], 0))).toThrow();
  });

  it("un identifiant de modèle hors de MODELE_ID_PATTERN est refusé", () => {
    for (const mauvais of ["sansbarre", "Majuscule/Modele", "a/b c", "a/".padEnd(120, "b")]) {
      expect(() => charge(ia(), avec(modeles(), ["etapes", "recherche"], mauvais)), mauvais.slice(0, 20)).toThrow();
    }
    const variante = avec(modeles(), ["variantes", "a", "notation"], "pas un modele");
    // Le modèle de la variante A n'est lu (et donc contrôlé) que si la variante A est retenue.
    const varianteA = avec(ia(), ["variante"], "a");
    expect(() => charge(varianteA, variante)).toThrow();
    expect(() => charge(varianteA)).not.toThrow();
  });

  it("un schema différent, une variante inconnue et un zdr sur une étape inconnue sont refusés", () => {
    expect(() => charge(avec(ia(), ["schema"], 2))).toThrow();
    expect(() => charge(avec(ia(), ["variante"], "c"))).toThrow();
    expect(() => charge(avec(ia(), ["zdr", "inconnue"], true))).toThrow();
    expect(() => charge(avec(ia(), ["zdr", "structuration"], "oui"))).toThrow();
  });

  it("le schéma accepte exactement les sept clés zdr de ETAPES_ZDR (clés réelles, pas la copie)", () => {
    expect(ETAPES_ZDR).toHaveLength(7);
    for (const etape of ETAPES_ZDR) expect(() => charge(avec(ia(), ["zdr", etape], true)), etape).not.toThrow();
  });

  it("un moteur de recherche web inconnu est refusé", () => {
    expect(() => charge(ia(), avec(modeles(), ["rechercheWeb", "moteur"], "inconnu"))).toThrow();
    expect(MOTEURS_RECHERCHE_WEB).toContain(modelesJson.rechercheWeb.moteur);
  });

  it("les copies en dur de ia.ts sont exactement ETAPES_REQUETE (contrôle de la copie)", () => {
    expect([...ETAPES_ZDR].sort()).toEqual([...ETAPES_REQUETE].sort());
    // Les cinq réglages de la couche IA : toutes les étapes de modèle sauf `recherche` (réglage propre à l'agent) et
    // `programme` (rédaction du programme du prototype, `p0Run` et `pnpm p0` seulement, décision 0115 § 5.5).
    expect([...ETAPES_REGLAGES].sort()).toEqual(ETAPES_REQUETE.filter((etape) => etape !== "recherche" && etape !== "programme").sort());
    expect(Object.keys(CONFIGURATION_IA.reglages).sort()).toEqual([...ETAPES_REGLAGES].sort());
  });

  // Décision 0116 § 2.2 (verdict S5 de 0117) : `modeles.json` porte `routage.zdr: true`, exigé ; avant elle, tout `zdr`
  // y était refusé. Les cas de refus de `data_collection` sont inchangés.
  it("routage.data_collection autre que deny, ou absent, est refusé ; routage.zdr exigé à true (décision 0116 § 2.2)", () => {
    for (const routage of [{ data_collection: "allow", zdr: true }, { zdr: true }, {}, { data_collection: "deny" }, { data_collection: "deny", zdr: false }, { data_collection: "deny", zdr: "true" }]) {
      expect(() => charge(ia(), avec(modeles(), ["routage"], routage)), JSON.stringify(routage)).toThrow();
    }
    expect(() => charge(ia(), sans(modeles(), ["routage"]))).toThrow();
    expect(() => charge(ia(), avec(modeles(), ["routage"], { data_collection: "deny", zdr: true }))).not.toThrow();
  });

  it("types : la configuration chargée est assignable aux types de src/ai et src/research", () => {
    expectTypeOf<ConfigurationIa["reglages"]>().toMatchTypeOf<ReglagesIa>();
    expectTypeOf<ConfigurationIa["profils"]["apercu"]>().toMatchTypeOf<BornesRecherche>();
    expectTypeOf<ConfigurationIa["profils"]["complet"]>().toMatchTypeOf<BornesRecherche>();
  });
});

describe("configuration ia: une seule source par valeur", () => {
  it("ia.json ne porte aucune valeur dérivée de P0 (schéma strict)", () => {
    const CIBLES = { activity: 18, meal: 14, evening: 4 };
    const ajouts: [string[], unknown][] = [
      [["toursMax"], 6],
      [["ageSourceMaxJours"], 1095],
      [["totalCandidats"], 40],
      [["ciblesParCreneau"], CIBLES],
      [["tailleLotNotation"], 10],
      [["etapes"], { recherche: "a/b" }],
      [["modeles"], {}],
      [["routage"], { data_collection: "deny" }],
      [["rechercheWeb"], { moteur: "exa" }],
      [["profils", "complet", "toursMax"], 6],
      [["profils", "complet", "ciblesParCreneau"], CIBLES],
      [["profils", "complet", "totalCandidats"], 40],
      [["profils", "complet", "ageSourceMaxJours"], 1095],
      [["profils", "apercu", "ageSourceMaxJours"], 1095],
    ];
    for (const [chemin, valeur] of ajouts) {
      expect(() => chargerConfigurationIa(avec(ia(), chemin, valeur), modeles(), recherche()), chemin.join(".")).toThrow();
    }
  });

  it("les valeurs chargées sont égales à celles des fichiers de P0", () => {
    const c = CONFIGURATION_IA;
    expect(c.profils.complet.ciblesParCreneau).toEqual(rechercheJson.ciblesParCreneau);
    expect(c.profils.complet.totalCandidats).toBe(rechercheJson.totalCandidats);
    expect(c.profils.complet.toursMax).toBe(rechercheJson.toursMax);
    expect(c.profils.complet.ageSourceMaxJours).toBe(rechercheJson.ageSourceMaxJours);
    expect(c.profils.apercu.ageSourceMaxJours).toBe(rechercheJson.ageSourceMaxJours);
    expect(c.tailleLotNotation).toBe(rechercheJson.tailleLotNotation);
    expect(c.recherche.modele).toBe(modelesJson.etapes.recherche);
    expect(c.reglages.structuration.modele).toBe(modelesJson.etapes.recherche);
    expect(c.reglages.quartier.modele).toBe(modelesJson.etapes.recherche);
    expect(c.reglages.plan.modele).toBe(modelesJson.etapes.recherche);
    expect(c.reglages.raisons.modele).toBe(modelesJson.etapes.raisons);
    expect(c.reglages.notation.modele).toBe(iaJson.variante === "a" ? modelesJson.variantes.a.notation : modelesJson.etapes.notation);
    expect(c.rechercheWeb.moteur).toBe(modelesJson.rechercheWeb.moteur);
    expect(c.rechercheWeb.modele).toBe(modelesJson.etapes.recherche);
    for (const reglage of [...Object.values(c.reglages), c.recherche, c.rechercheWeb])
      expect(reglage.routage.data_collection).toBe(modelesJson.routage.data_collection);
  });

  it("aucun fichier de src/ ne recopie une borne de profil", () => {
    const racine = join(__dirname, "../../..");
    const autorises = new Set(["src/server/config/ia.json", "src/prototype/config.ts", "src/workflows/p0-run.ts"].map((chemin) => join(racine, chemin)));
    const fichiers: string[] = [];
    const parcourir = (dossier: string) => {
      for (const nom of readdirSync(dossier)) {
        if (nom === "node_modules" || nom === ".next") continue;
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(ts|tsx|js|mjs|json)$/.test(nom) && !/\.test\.(ts|tsx)$/.test(nom)) fichiers.push(chemin);
      }
    };
    parcourir(join(racine, "src"));
    const bornes = /["']?\b(toursMax|ageSourceMaxJours|totalCandidats|delaiMs)\b["']?\s*:\s*-?\d/;
    const cibles = /\bciblesParCreneau\b["']?\s*:\s*\{[^}]*\d/;
    const fautifs = fichiers.filter((fichier) => {
      if (autorises.has(fichier)) return false;
      const texte = readFileSync(fichier, "utf8");
      return bornes.test(texte) || cibles.test(texte);
    });
    expect(fautifs.map((fichier) => relative(racine, fichier))).toEqual([]);
  });
});

describe("configuration ia: valeurs de départ", () => {
  it("instantané de CONFIGURATION_IA", () => {
    expect(CONFIGURATION_IA).toMatchInlineSnapshot(`
      {
        "profils": {
          "apercu": {
            "ageSourceMaxJours": 1095,
            "ciblesParCreneau": {
              "activity": 8,
              "evening": 2,
              "meal": 8,
            },
            "delaiMs": 30000,
            "totalCandidats": 18,
            "toursMax": 3,
          },
          "complet": {
            "ageSourceMaxJours": 1095,
            "ciblesParCreneau": {
              "activity": 18,
              "evening": 4,
              "meal": 14,
            },
            "delaiMs": 300000,
            "totalCandidats": 40,
            "toursMax": 6,
          },
          "mini": {
            "cible": 6,
            "delaiMs": 20000,
            "logements": {
              "cible": 3,
              "recherchesWeb": 2,
            },
            "totalCandidats": 6,
            "toursMax": 2,
          },
        },
        "recherche": {
          "modele": "deepseek/deepseek-v4.1-flash",
          "routage": {
            "data_collection": "deny",
          },
        },
        "rechercheWeb": {
          "modele": "deepseek/deepseek-v4.1-flash",
          "moteur": "exa",
          "routage": {
            "data_collection": "deny",
          },
        },
        "reglages": {
          "notation": {
            "modele": "deepseek/deepseek-v4.1-flash",
            "routage": {
              "data_collection": "deny",
            },
          },
          "plan": {
            "modele": "deepseek/deepseek-v4.1-flash",
            "routage": {
              "data_collection": "deny",
            },
          },
          "quartier": {
            "modele": "deepseek/deepseek-v4.1-flash",
            "routage": {
              "data_collection": "deny",
            },
          },
          "raisons": {
            "modele": "deepseek/deepseek-v4.1-flash",
            "routage": {
              "data_collection": "deny",
            },
          },
          "structuration": {
            "modele": "deepseek/deepseek-v4.1-flash",
            "routage": {
              "data_collection": "deny",
              "zdr": true,
            },
          },
        },
        "tailleLotNotation": 10,
        "variante": "b",
      }
    `);
  });
});
