// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { ConfigClassementSchema } from "@/domain/classement";
import { ConfigurationMoteurSchema } from "@/domain/configuration";
import { CLASSES_SOURCE as CLASSES_DOMAINE, TYPES_CRENEAU as CRENEAUX_DOMAINE } from "@/domain/entrees";
import { CLASSES_SOURCE, TYPES_CRENEAU } from "@/prototype/candidat";

import { lireConfiguration, lireConfigurationMoteur } from "../../../scripts/p0/fichiers";

/**
 * Configuration du moteur (spécification B5a ; décision 0045 § 4, B5-TL-4) : un seul fichier de valeurs,
 * `src/server/config/moteur.json`, validé par le schéma strict de `src/domain/configuration.ts`. Reprend aussi les
 * contrôles du schéma de classement, déplacé de `src/prototype/config.ts` vers `src/domain/classement.ts`.
 */

const FICHIER = join(process.cwd(), "src", "server", "config", "moteur.json");
const brut = (): Record<string, unknown> => JSON.parse(readFileSync(FICHIER, "utf8")) as Record<string, unknown>;
const accepte = (valeur: unknown) => ConfigurationMoteurSchema.safeParse(valeur).success;

describe("configuration du moteur: valeur absente ou hors bornes refusée", () => {
  it("le fichier commité passe le schéma", () => {
    expect(accepte(brut())).toBe(true);
  });

  it("chaque clé obligatoire absente : refusé", () => {
    const configuration = brut();
    for (const cle of Object.keys(configuration)) {
      const sans = Object.fromEntries(Object.entries(configuration).filter(([nom]) => nom !== cle));
      expect(accepte(sans), cle).toBe(false);
    }
  });

  it("valeur hors bornes, de mauvais type ou incohérente : refusé", () => {
    const cas: Array<[string, (c: Record<string, unknown>) => Record<string, unknown>]> = [
      ["budget négatif", (c) => ({ ...c, budgetTrajetParRythme: { relaxed: -5, balanced: 90, intense: 150 } })],
      ["budget en texte", (c) => ({ ...c, budgetTrajetParRythme: { relaxed: "60", balanced: 90, intense: 150 } })],
      ["rythme manquant", (c) => ({ ...c, activitesParRythme: { relaxed: 2, balanced: 3 } })],
      ["activités nulles", (c) => ({ ...c, activitesParRythme: { relaxed: 0, balanced: 3, intense: 4 } })],
      ["marge trop grande", (c) => ({ ...c, margeMinutes: 61 })],
      ["marge décimale", (c) => ({ ...c, margeMinutes: 2.5 })],
      ["seuil trop petit", (c) => ({ ...c, seuilTempsLibreMinutes: 4 })],
      ["heure invalide", (c) => ({ ...c, debutSoiree: "25:00" })],
      ["fenêtre inversée", (c) => ({ ...c, fenetreJour: { debut: "22:30", fin: "09:00" } })],
      [
        "dîner avant déjeuner",
        (c) => ({ ...c, repas: { lunch: { auPlusTot: "18:30", auPlusTard: "20:45" }, dinner: { auPlusTot: "12:00", auPlusTard: "14:00" } } }),
      ],
      ["durée trop courte", (c) => ({ ...c, dureesParDefaut: { activity: 10, lunch: 75, dinner: 90, evening: 90 } })],
      ["clé inconnue", (c) => ({ ...c, consigne: "Prends les plus connus" })],
      ["version de schéma inconnue", (c) => ({ ...c, schema: 2 })],
    ];
    for (const [nom, modif] of cas) expect(accepte(modif(brut())), nom).toBe(false);
  });
});

describe("configuration du moteur: transfert aéroport facultatif", () => {
  it("absent : accepté ; présent dans ses bornes : accepté ; hors bornes : refusé", () => {
    expect(brut()).not.toHaveProperty("transfertAeroportMinutes");
    expect(accepte({ ...brut(), transfertAeroportMinutes: 45 })).toBe(true);
    expect(accepte({ ...brut(), transfertAeroportMinutes: -1 })).toBe(false);
    expect(accepte({ ...brut(), transfertAeroportMinutes: 241 })).toBe(false);
  });
});

describe("configuration du moteur: lecture par P0", () => {
  it("P0 lit les mêmes valeurs que le fichier commité", () => {
    expect(lireConfigurationMoteur()).toEqual(ConfigurationMoteurSchema.parse(brut()));
    expect(lireConfiguration().moteur).toEqual(ConfigurationMoteurSchema.parse(brut()));
  });
});

describe("configuration du moteur: formule de classement (schéma déplacé dans src/domain)", () => {
  const classement = (): Record<string, unknown> =>
    JSON.parse(readFileSync(join(process.cwd(), "prototype", "config", "classement.json"), "utf8")) as Record<string, unknown>;

  it("classement.json passe le schéma du domaine", () => {
    expect(ConfigClassementSchema.safeParse(classement()).success).toBe(true);
    expect(lireConfiguration().classement).toEqual(ConfigClassementSchema.parse(classement()));
  });

  it("la formule de classement n'accepte aucune chaîne libre", () => {
    expect(ConfigClassementSchema.safeParse({ ...classement(), matchesWishesNon: "ignorer" }).success).toBe(false);
    expect(ConfigClassementSchema.safeParse({ ...classement(), prioriteMustSee: "Prends les plus connus" }).success).toBe(false);
    const poids = structuredClone(classement()) as { poids: Record<string, unknown> };
    poids.poids.mustSee = "25";
    expect(ConfigClassementSchema.safeParse(poids).success).toBe(false);
  });

  it("les clés de créneau et de classe de source sont celles de candidat.ts et de src/domain/entrees.ts", () => {
    const trier = (cles: Iterable<string>) => [...cles].sort();
    expect(trier(CRENEAUX_DOMAINE)).toEqual(trier(TYPES_CRENEAU));
    expect(trier(CLASSES_DOMAINE)).toEqual(trier(CLASSES_SOURCE));
    expect(trier(Object.keys(ConfigClassementSchema.shape.poids.shape.source.shape))).toEqual(trier(CLASSES_SOURCE));
    expect(trier(Object.keys(ConfigClassementSchema.shape.coutTrajetParMinute.shape))).toEqual(trier([...TYPES_CRENEAU, "surprise"]));
  });
});
