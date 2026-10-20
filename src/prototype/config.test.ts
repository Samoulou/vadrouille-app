// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  BORNES_ESSAI,
  BORNES_MODE_REEL,
  BORNES_PLAFONDS,
  CHAMPS_MODE_REEL_DECIDES_PO,
  ConfigModeReelSchema,
  ConfigModelesSchema,
  ConfigPlafondsSchema,
  ConfigRechercheSchema,
  modelesDeLaVariante,
  moteurRechercheWebAttendu,
  validerConfigEssai,
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
      notation: "deepseek/deepseek-v4.1-flash",
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
    // Décision 0076 : A et B ne diffèrent plus par la notation ; la surcharge `variantes.a` reste, identique.
    expect(a.notation).toBe(b.notation);
    // La forme ne permet pas à la variante A de toucher une autre étape.
    const autre = structuredClone(brut().modeles) as { variantes: { a: Record<string, string> } };
    autre.variantes.a.recherche = "autre/modele";
    expect(ConfigModelesSchema.safeParse(autre).success).toBe(false);
  });

  it("p0: modelesDeLaVariante applique variantes.a avec une configuration de test où la notation de A diffère (P0-PO-12)", () => {
    const { modeles } = validerConfiguration(brut());
    const test = { ...modeles, variantes: { a: { notation: "test/notation-a" } } };
    expect(modelesDeLaVariante(test, "a")).toEqual({ ...modeles.etapes, notation: "test/notation-a" });
    expect(modelesDeLaVariante(test, "b")).toEqual(modeles.etapes);
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
      placesTextSearch: 90,
      placesDetails: 90,
      routesRequetes: 30,
      routesElements: 840,
      fiches: { margeMinimum: 4, margePart: 0.2 },
      coutsEstimesMicros: { requeteModele: 20_000, rechercheWeb: 40_000 },
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
      ["uniteQuotaRoutes", "minutes"],
      ["fiches", { margeMinimum: 4, margePart: 1.2 }],
      ["mode", "SENTINELLE-MODE"],
      ["coutsEstimesMicros", { requeteModele: 0, rechercheWeb: 40_000 }],
      ["coutsEstimesMicros", { requeteModele: 20_000, rechercheWeb: 1_000_001 }],
      ["coutsEstimesMicros", { requeteModele: 20_000 }],
    ];
    for (const [champ, valeur] of cas) {
      const resultat = validerConfigModeReel({ ...complete(), [champ]: valeur });
      expect(resultat, champ).toEqual({ ok: false, code: "config_reel_invalide" });
      expect(JSON.stringify(resultat)).not.toContain(String(valeur));
    }
    // Contrôle croisé (0102 § 5) : 86 candidats visés + 5 logements dépassent 90 Text Search ; 85 + 5 = 90 passe.
    expect(validerConfigModeReel(complete(), 86)).toEqual({ ok: false, code: "config_reel_invalide" });
    expect(validerConfigModeReel(complete(), 85)).toMatchObject({ ok: true });
    expect(validerConfigModeReel(null)).toEqual({ ok: false, code: "config_reel_invalide" });
  });
});

describe("p0: champs retirés de la configuration du mode réel et de l'essai (0093 point 5, décision 0102 § 8)", () => {
  const RETIRES = ["recherchesWeb", "pagesLues", "candidatsTrouves", "dureeMs"] as const;
  const fichiers = { "mode-reel": validerConfigModeReel, essai: validerConfigEssai } as const;

  it("aucun des quatre noms n'est dans mode-reel.json, essai.json, le schéma ni les bornes", () => {
    for (const nom of RETIRES) {
      for (const fichier of ["mode-reel", "essai"]) expect(Object.keys(lire(fichier) as object), `${fichier} : ${nom}`).not.toContain(nom);
      expect(Object.keys(ConfigModeReelSchema.shape), nom).not.toContain(nom);
      expect(Object.keys(BORNES_MODE_REEL), nom).not.toContain(nom);
      expect(Object.keys(BORNES_ESSAI), nom).not.toContain(nom);
    }
  });

  it("un des quatre champs retirés présent dans le fichier est refusé (strictObject)", () => {
    for (const [fichier, valider] of Object.entries(fichiers)) {
      for (const nom of RETIRES) {
        const resultat = valider({ ...(lire(fichier) as object), [nom]: 1 });
        expect(resultat, `${fichier} : ${nom}`).toEqual({ ok: false, code: "config_reel_invalide" });
      }
    }
  });
});

describe("p0: configuration de l'essai d'intégration (P0S2-PO-12 amendé, décisions 0063, 0073 et 0093)", () => {
  const essai = () => lire("essai") as Record<string, unknown>;

  it("fichier commité : mêmes plafonds par exécution que mode-reel.json (décision 0073) sauf le fusible de coût, 2 USD (0093 point 5), acceptés", () => {
    expect(essai()).toEqual({
      schema: 1,
      uniteQuotaRoutes: "elements",
      coutUsd: 2,
      placesTextSearch: 90,
      placesDetails: 90,
      routesRequetes: 30,
      routesElements: 840,
      fiches: { margeMinimum: 4, margePart: 0.2 },
      coutsEstimesMicros: { requeteModele: 20_000, rechercheWeb: 40_000 },
    });
    expect(validerConfigEssai(essai())).toEqual({ ok: true, config: essai() });
    // Chaque valeur commitée est exactement la borne : le fichier ne peut que descendre. Seul `coutUsd` est sous sa
    // borne (0093 point 5 : 2 USD d'IA pour l'essai, 3 USD de borne comme le mode réel, `BORNES_ESSAI` inchangé).
    for (const [champ, borne] of Object.entries(BORNES_ESSAI)) {
      if (champ === "coutUsd") expect(essai()[champ], champ).toBe(2);
      else expect(essai()[champ], champ).toBe(borne);
    }
    expect(BORNES_ESSAI.coutUsd).toBe(3);
    // Décision 0073 amendée par 0093 : fichier de l'essai identique à celui du mode réel hors `coutUsd` ; bornes égales
    // aux plafonds commités du mode réel (qui reste à 3 USD).
    const reel = lire("mode-reel") as Record<string, unknown>;
    expect({ ...essai(), coutUsd: reel.coutUsd }).toEqual(reel);
    expect(reel.coutUsd).toBe(3);
    for (const [champ, borne] of Object.entries(BORNES_ESSAI)) expect(reel[champ], champ).toBe(borne);
  });

  it("au-delà d'une borne de l'essai, refusée sans recopier la valeur", () => {
    const cas: [string, number][] = [
      ["coutUsd", 3.01],
      ["placesTextSearch", 91],
      ["placesDetails", 91],
      ["routesRequetes", 31],
      ["routesElements", 841],
    ];
    expect(cas.map(([champ]) => champ).sort()).toEqual(Object.keys(BORNES_ESSAI).sort());
    for (const [champ, valeur] of cas) {
      const resultat = validerConfigEssai({ ...essai(), [champ]: valeur });
      expect(resultat, champ).toEqual({ ok: false, code: "config_reel_invalide" });
      expect(JSON.stringify(resultat)).not.toContain(String(valeur));
    }
  });

  it("mêmes codes que le mode réel : champ absent, config_reel_incomplete", () => {
    const sans: Record<string, unknown> = { ...essai() };
    delete sans.coutsEstimesMicros;
    expect(validerConfigEssai(sans)).toEqual({ ok: false, code: "config_reel_incomplete" });
  });

  it("recherche-essai.json : profil de l'essai (12 candidats visés), fusible toursMax aligné sur le mode réel (0073)", () => {
    const recherche = ConfigRechercheSchema.parse(lire("recherche-essai"));
    expect(recherche.totalCandidats).toBe(12);
    expect(validerConfigEssai(essai(), recherche.totalCandidats)).toMatchObject({ ok: true });
    expect(recherche.totalCandidats + 5).toBeLessThanOrEqual(BORNES_ESSAI.placesTextSearch);
    expect(recherche.toursMax).toBe(ConfigRechercheSchema.parse(lire("recherche")).toursMax);
    const cibles = Object.values(recherche.ciblesParCreneau).reduce((a, b) => a + b, 0);
    expect(cibles).toBeLessThanOrEqual(recherche.totalCandidats);
  });
});
