import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BORNES_PLAFONDS,
  ConfigClassementSchema,
  ConfigModelesSchema,
  ConfigPlafondsSchema,
  ConfigRechercheSchema,
  modelesDeLaVariante,
  validerConfiguration,
} from "./config";

const DOSSIER = join(process.cwd(), "prototype", "config");
const lire = (nom: string): unknown => JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), "utf8"));
const brut = () => ({
  modeles: lire("modeles"),
  recherche: lire("recherche"),
  classement: lire("classement"),
  plafonds: lire("plafonds"),
});

describe("p0: configuration commitée (décision 0032, A2)", () => {
  it("les quatre fichiers de prototype/config passent leur schéma et les contrôles croisés", () => {
    const configuration = validerConfiguration(brut());
    expect(configuration.modeles.routage.data_collection).toBe("deny");
  });

  it("garde les modèles choisis par Samuel (décision 0027)", () => {
    const { modeles } = validerConfiguration(brut());
    expect(modelesDeLaVariante(modeles, "b")).toEqual({
      recherche: "deepseek/deepseek-v4.1-flash",
      notation: "perplexity/pplx-decider-v1.1-27b",
      raisons: "deepseek/deepseek-v4.1-flash",
    });
  });

  it("p0: la variante A ne change que le modèle de notation", () => {
    const { modeles } = validerConfiguration(brut());
    const a = modelesDeLaVariante(modeles, "a");
    const b = modelesDeLaVariante(modeles, "b");
    expect(a.recherche).toBe(b.recherche);
    expect(a.raisons).toBe(b.raisons);
    expect(a.notation).toBe("deepseek/deepseek-v4.1-flash");
    // La forme ne permet pas à la variante A de toucher une autre étape.
    const autre = structuredClone(brut().modeles) as { variantes: { a: Record<string, string> } };
    autre.variantes.a.recherche = "autre/modele";
    expect(ConfigModelesSchema.safeParse(autre).success).toBe(false);
  });

  it("refuse une configuration de modèles sans data_collection deny", () => {
    const sans = structuredClone(brut().modeles) as { routage: Record<string, unknown> };
    delete sans.routage.data_collection;
    expect(ConfigModelesSchema.safeParse(sans).success).toBe(false);
    const permis = structuredClone(brut().modeles) as { routage: Record<string, unknown> };
    permis.routage.data_collection = "allow";
    expect(ConfigModelesSchema.safeParse(permis).success).toBe(false);
  });

  it("refuse un identifiant de modèle mal formé ou trop long", () => {
    for (const identifiant of ["deepseek", "DeepSeek/x", "a/b c", `a/${"x".repeat(100)}`, "https://exemple.org/x"]) {
      const config = structuredClone(brut().modeles) as { etapes: Record<string, string> };
      config.etapes.recherche = identifiant;
      expect(ConfigModelesSchema.safeParse(config).success, identifiant).toBe(false);
    }
  });

  it("p0: aucun champ de configuration ne peut ouvrir un chemin réel", () => {
    const schemas = {
      modeles: ConfigModelesSchema,
      recherche: ConfigRechercheSchema,
      classement: ConfigClassementSchema,
      plafonds: ConfigPlafondsSchema,
    } as const;
    for (const [nom, schema] of Object.entries(schemas)) {
      const valide = lire(nom) as Record<string, unknown>;
      expect(schema.safeParse(valide).success, nom).toBe(true);
      for (const cle of ["mode", "reel", "real", "host", "hote", "url", "baseUrl", "apiKey", "cle", "env"]) {
        expect(schema.safeParse({ ...valide, [cle]: true }).success, `${nom}.${cle}`).toBe(false);
        expect(schema.safeParse({ ...valide, [cle]: "https://openrouter.ai" }).success, `${nom}.${cle}`).toBe(false);
      }
    }
    // Clés inconnues refusées aussi aux niveaux imbriqués.
    const modeles = structuredClone(brut().modeles) as { routage: Record<string, unknown> };
    modeles.routage.host = "exemple.org";
    expect(ConfigModelesSchema.safeParse(modeles).success).toBe(false);
  });

  it("refuse un plafond au-dessus de sa borne provisoire (A2)", () => {
    const plafonds = lire("plafonds") as Record<string, number>;
    for (const [compteur, borne] of Object.entries(BORNES_PLAFONDS)) {
      expect(ConfigPlafondsSchema.safeParse({ ...plafonds, [compteur]: borne }).success, compteur).toBe(true);
      expect(ConfigPlafondsSchema.safeParse({ ...plafonds, [compteur]: borne + 1 }).success, compteur).toBe(false);
      expect(ConfigPlafondsSchema.safeParse({ ...plafonds, [compteur]: 0 }).success, compteur).toBe(false);
    }
    expect(ConfigPlafondsSchema.safeParse({ ...plafonds, coutUsd: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("refuse un total de candidats visé au-dessus du plafond candidatsTrouves (contrôle croisé)", () => {
    const configuration = brut();
    (configuration.recherche as Record<string, unknown>).totalCandidats = 81;
    expect(() => validerConfiguration(configuration)).toThrow(/candidatsTrouves/);
  });

  it("refuse des cibles par créneau dont la somme dépasse le total visé", () => {
    const configuration = brut();
    (configuration.recherche as { ciblesParCreneau: Record<string, number> }).ciblesParCreneau.activity = 40;
    expect(() => validerConfiguration(configuration)).toThrow(/cibles/);
  });

  it("la formule de classement n'accepte aucune chaîne libre", () => {
    const classement = lire("classement") as Record<string, unknown>;
    expect(ConfigClassementSchema.safeParse({ ...classement, matchesWishesNon: "ignorer" }).success).toBe(false);
    expect(ConfigClassementSchema.safeParse({ ...classement, prioriteMustSee: "Prends les plus connus" }).success).toBe(
      false,
    );
    const poids = structuredClone(classement) as { poids: Record<string, unknown> };
    poids.poids.mustSee = "25";
    expect(ConfigClassementSchema.safeParse(poids).success).toBe(false);
  });
});
