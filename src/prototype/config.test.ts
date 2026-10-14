// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BORNES_MODE_REEL,
  BORNES_PLAFONDS,
  CHAMPS_MODE_REEL_DECIDES_PO,
  ConfigModeReelSchema,
  ConfigModelesSchema,
  ConfigPlafondsSchema,
  ConfigRechercheSchema,
  modelesDeLaVariante,
  moteurRechercheWebAttendu,
  validerConfigModeReel,
  validerConfiguration,
} from "./config";
import { TYPES_CRENEAU } from "./candidat";

const DOSSIER = join(process.cwd(), "prototype", "config");
const lire = (nom: string): unknown => JSON.parse(readFileSync(join(DOSSIER, `${nom}.json`), "utf8"));
const brut = () => ({
  modeles: lire("modeles"),
  recherche: lire("recherche"),
  plafonds: lire("plafonds"),
});

describe("p0: configuration commitée (décision 0032, A2)", () => {
  // `classement.json` : schéma dans `src/domain` depuis B5a (décision 0045 § 1.4), testé dans
  // `tests/unit/p0/configuration-moteur.test.ts`.
  it("les fichiers de prototype/config validés ici passent leur schéma et les contrôles croisés", () => {
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

  it("moteur de recherche web fixé (bloquant 1c de la PR 326) : exa pour le modèle de recherche choisi, cohérent avec le modèle, jamais absent", () => {
    const { modeles } = validerConfiguration(brut());
    expect(modeles.rechercheWeb).toEqual({ moteur: "exa" });
    expect(moteurRechercheWebAttendu(modeles.etapes.recherche)).toBe("exa");
    for (const [modele, attendu] of [
      ["deepseek/deepseek-v4.1-flash", "exa"],
      ["openai/gpt-x", "native"],
      ["anthropic/claude-x", "native"],
      ["google/gemini-x", "native"],
      ["perplexity/sonar-x", "native"],
      ["x-ai/grok-x", "native"],
      ["mistralai/mistral-x", "exa"],
    ] as const) {
      expect(moteurRechercheWebAttendu(modele), modele).toBe(attendu);
    }
    const avec = (recherche: string, moteur: unknown) => {
      const config = structuredClone(brut().modeles) as { etapes: Record<string, string>; rechercheWeb: Record<string, unknown> };
      config.etapes.recherche = recherche;
      config.rechercheWeb.moteur = moteur;
      return ConfigModelesSchema.safeParse(config).success;
    };
    expect(avec("deepseek/deepseek-v4.1-flash", "native")).toBe(false);
    expect(avec("openai/gpt-x", "exa")).toBe(false);
    expect(avec("openai/gpt-x", "native")).toBe(true);
    for (const moteur of ["auto", "firecrawl", "parallel", "", undefined]) expect(avec("deepseek/deepseek-v4.1-flash", moteur), String(moteur)).toBe(false);
    const sans = structuredClone(brut().modeles) as Record<string, unknown>;
    delete sans.rechercheWeb;
    expect(ConfigModelesSchema.safeParse(sans).success).toBe(false);
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

  it("les clés de créneau de recherche.json sont celles de candidat.ts (TYPES_CRENEAU)", () => {
    const trier = (cles: Iterable<string>) => [...cles].sort();
    expect(trier(Object.keys(ConfigRechercheSchema.shape.ciblesParCreneau.shape))).toEqual(trier(TYPES_CRENEAU));
  });
});

describe("p0: configuration du mode réel (décision 0055, section 6)", () => {
  const fichier = () => lire("mode-reel") as Record<string, unknown>;
  const complete = () => fichier();

  it("fichier commité : valeurs de l'amendement 1 du PO (PR 324) et de Samuel (Q330), acceptées", () => {
    expect(fichier()).toEqual({
      schema: 1,
      uniteQuotaRoutes: "elements",
      coutUsd: 3,
      recherchesWeb: 40,
      pagesLues: 100,
      candidatsTrouves: 85,
      placesTextSearch: 90,
      placesDetails: 90,
      routesRequetes: 30,
      routesElements: 500,
      dureeMs: 900_000,
      fiches: { margeMinimum: 4, margePart: 0.2 },
    });
    for (const champ of CHAMPS_MODE_REEL_DECIDES_PO) expect(Object.keys(fichier())).toContain(champ);
    expect(validerConfigModeReel(fichier())).toEqual({ ok: true, config: fichier() });
  });

  it("chaque champ obligatoire, sans valeur par défaut : absent, refusé (config_reel_incomplete)", () => {
    expect(validerConfigModeReel(complete())).toMatchObject({ ok: true });
    for (const champ of Object.keys(ConfigModeReelSchema.shape)) {
      const sans: Record<string, unknown> = { ...complete() };
      delete sans[champ];
      expect(validerConfigModeReel(sans), champ).toEqual({ ok: false, code: "config_reel_incomplete" });
    }
  });

  it("bornes de Samuel et du PO : au-delà, refusée sans recopier la valeur", () => {
    const cas: [string, unknown][] = [
      ["routesElements", BORNES_MODE_REEL.routesElements + 1],
      ["coutUsd", 3.01],
      ["placesDetails", 91],
      ["placesTextSearch", 91],
      ["recherchesWeb", 61],
      ["pagesLues", 151],
      ["candidatsTrouves", 91],
      ["dureeMs", 900_001],
      ["uniteQuotaRoutes", "minutes"],
      ["fiches", { margeMinimum: 4, margePart: 1.2 }],
      ["mode", "SENTINELLE-MODE"],
    ];
    for (const [champ, valeur] of cas) {
      const resultat = validerConfigModeReel({ ...complete(), [champ]: valeur });
      expect(resultat, champ).toEqual({ ok: false, code: "config_reel_invalide" });
      expect(JSON.stringify(resultat)).not.toContain(String(valeur));
    }
    // Contrôle croisé : 86 candidats + 5 logements dépassent 90 Text Search.
    expect(validerConfigModeReel({ ...complete(), candidatsTrouves: 86 })).toEqual({ ok: false, code: "config_reel_invalide" });
    expect(validerConfigModeReel(null)).toEqual({ ok: false, code: "config_reel_invalide" });
  });
});
