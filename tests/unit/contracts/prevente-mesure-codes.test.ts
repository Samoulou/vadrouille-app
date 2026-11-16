// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import * as contrats from "@/contracts/prevente-mesure";
import {
  PREVENTE_DESTINATION_MAX,
  PREVENTE_PROVENANCES,
  PREVENTE_PROVENANCES_SUIVI,
  PreventeProvenanceDeclareeSchema,
  PreventeProvenanceSchema,
  PreventeReleveDestinationsSchema,
  PreventeReleveReponsesSchema,
  PreventeReleveVisitesSchema,
  PreventeReponseSchema,
  PreventeVerdictReponseSchema,
} from "@/contracts/prevente-mesure";

import * as base from "../../../db/prevente-codes";

/**
 * Listes fermées de la mesure de la prévente (spécification C2 § 2.2 point 4 et § 3.1 ; tâche C2b, ticket 1130 ;
 * décision 0172 § 1 point 7) : « une source par côté, un test entre les deux ». `db/prevente-codes.ts` (schéma,
 * migration `0029_prevente_mesure`, tests de base) et `src/contracts/prevente-mesure.ts` (application) ne s'importent pas
 * l'un l'autre ; ce test prouve leur égalité, sur le modèle de `db/jsonb-keys.ts`, et qu'aucune troisième copie n'existe.
 */

const RACINE = path.resolve(__dirname, "../../..");

describe("mesure de la prévente : les listes de src/contracts égalent celles de db/prevente-codes.ts", () => {
  it.each([
    ["provenances", contrats.PREVENTE_PROVENANCES, base.PREVENTE_PROVENANCES],
    ["parcours", contrats.PREVENTE_PARCOURS, base.PREVENTE_PARCOURS],
    ["périodes (question 2)", contrats.PREVENTE_PERIODES, base.PREVENTE_PERIODES],
    ["préparations (question 3)", contrats.PREVENTE_PREPARATIONS, base.PREVENTE_PREPARATIONS],
    ["motifs, parcours precommande (question 4)", contrats.PREVENTE_MOTIFS.precommande, base.PREVENTE_MOTIFS.precommande],
    ["motifs, parcours visite (question 4)", contrats.PREVENTE_MOTIFS.visite, base.PREVENTE_MOTIFS.visite],
    ["découvertes (question 5)", contrats.PREVENTE_DECOUVERTES, base.PREVENTE_DECOUVERTES],
    ["rubriques du relevé", contrats.PREVENTE_RUBRIQUES, base.PREVENTE_RUBRIQUES],
  ] as const)("%s : mêmes valeurs, même ordre", (_nom, cote, db) => {
    expect([...cote]).toEqual([...db]);
  });

  it("mêmes parcours pour les motifs, même longueur de la question 1, même plafond du jour", () => {
    expect(Object.keys(contrats.PREVENTE_MOTIFS)).toEqual(Object.keys(base.PREVENTE_MOTIFS));
    expect(contrats.PREVENTE_DESTINATION_MAX).toBe(base.PREVENTE_DESTINATION_MAX);
    expect(contrats.PREVENTE_PLAFOND_REPONSES_JOUR).toBe(base.PREVENTE_PLAFOND_REPONSES_JOUR);
  });

  it("les codes admis par le relevé sont ceux du domaine prevente_code, rubriques comprises", () => {
    const codes = PreventeReleveReponsesSchema.shape.code.unwrap().options;
    expect([...new Set<string>([...codes, ...contrats.PREVENTE_RUBRIQUES])].sort()).toEqual([...base.PREVENTE_CODES].sort());
  });

  it("interne n'est jamais une provenance stockée ; direct et autre le sont, après la liste de suivi.md", () => {
    expect(PREVENTE_PROVENANCES).not.toContain("interne");
    expect(base.PREVENTE_PROVENANCES).not.toContain("interne");
    expect([...PREVENTE_PROVENANCES]).toEqual([...PREVENTE_PROVENANCES_SUIVI, "direct", "autre"]);
    expect(PREVENTE_PROVENANCES_SUIVI).toEqual(["proches", "forum", "groupe", "reddit", "instagram", "instagram-pub", "createur"]);
    expect(PreventeProvenanceSchema.safeParse("interne").success).toBe(false);
    expect(PreventeProvenanceDeclareeSchema.safeParse("interne").success).toBe(true);
    expect(PreventeProvenanceDeclareeSchema.safeParse("inconnu-123").success).toBe(false);
  });

  it("aucune troisième copie : hors de ces deux fichiers, aucun fichier de src/ ni de db/ ne réécrit une liste", () => {
    // Deux codes voisins, propres à ces listes, écrits en littéraux dans un même fichier : signe d'une liste recopiée.
    const PAIRES = [
      ["instagram-pub", "createur"],
      ["pentecote", "plus-tard"],
      ["guides-blogs", "avis-cartes"],
      ["adresses-sourcees", "gain-de-temps"],
      ["pas-de-voyage", "assistant-gratuit"],
      ["connait-createur", "createur-contenu"],
    ] as const;
    const SOURCES = new Set(["src/contracts/prevente-mesure.ts", "db/prevente-codes.ts"]);
    const lus: string[] = [];
    const ecarts: string[] = [];
    const lire = (dossier: string): void => {
      for (const nom of readdirSync(path.join(RACINE, dossier))) {
        const relatif = `${dossier}/${nom}`;
        if (statSync(path.join(RACINE, relatif)).isDirectory()) {
          // Migrations et instantanés Drizzle : générés depuis `db/prevente-codes.ts`, la liste y est dans la base.
          if (relatif !== "db/migrations" && nom !== "node_modules") lire(relatif);
        } else if (/\.(ts|tsx|mts|js|mjs)$/.test(nom)) {
          lus.push(relatif);
          if (SOURCES.has(relatif)) continue;
          const texte = readFileSync(path.join(RACINE, relatif), "utf8");
          for (const [a, b] of PAIRES) {
            if ([a, b].every((code) => new RegExp(`["'\`]${code}["'\`]`).test(texte))) ecarts.push(`${relatif} : ${a}, ${b}`);
          }
        }
      }
    };
    lire("src");
    lire("db");
    expect(lus).toEqual(expect.arrayContaining([...SOURCES]));
    expect(ecarts).toEqual([]);
  });
});

describe("mesure de la prévente : schémas stricts", () => {
  const valide = { src: "forum", parcours: "visite", destination: "Lisbonne", periode: "paques", preparation: ["assistant"], motifs: ["prix"], decouverte: "ami" };

  it("une réponse valide passe, pour chaque parcours avec ses motifs", () => {
    expect(PreventeReponseSchema.parse(valide)).toEqual(valide);
    expect(PreventeReponseSchema.safeParse({ ...valide, parcours: "precommande", motifs: ["demonstration", "prix"] }).success).toBe(true);
  });

  it.each([
    ["clé inconnue", { ...valide, email: "a@b.c" }],
    ["provenance interne", { ...valide, src: "interne" }],
    ["provenance hors liste", { ...valide, src: "inconnu-123" }],
    ["parcours inconnu", { ...valide, parcours: "autre" }],
    ["motifs de l'autre parcours", { ...valide, parcours: "precommande", motifs: ["pas-de-voyage"] }],
    ["motifs de l'autre parcours (visite)", { ...valide, motifs: ["demonstration"] }],
    ["code de période hors liste", { ...valide, periode: "noel" }],
    ["code de préparation hors liste", { ...valide, preparation: ["tarot"] }],
    ["code de découverte hors liste", { ...valide, decouverte: "tele" }],
    ["doublon dans une liste", { ...valide, preparation: ["agence", "agence"] }],
    ["destination vide", { ...valide, destination: "" }],
    ["destination de 81 caractères", { ...valide, destination: "x".repeat(PREVENTE_DESTINATION_MAX + 1) }],
    ["champ absent", { src: "forum", parcours: "visite" }],
    ["réponse entièrement vide", { src: "forum", parcours: "visite", destination: null, periode: null, preparation: [], motifs: [], decouverte: null }],
  ])("refusée : %s", (_nom, reponse) => {
    expect(PreventeReponseSchema.safeParse(reponse).success).toBe(false);
  });

  it("une destination de 80 caractères seule suffit ; une seule case aussi", () => {
    const vide = { src: "direct", parcours: "visite", destination: null, periode: null, preparation: [], motifs: [], decouverte: null };
    expect(PreventeReponseSchema.safeParse({ ...vide, destination: "x".repeat(PREVENTE_DESTINATION_MAX) }).success).toBe(true);
    expect(PreventeReponseSchema.safeParse({ ...vide, motifs: ["autre"] }).success).toBe(true);
  });

  it("verdict de l'écriture : admise ou plafond_atteint, rien d'autre", () => {
    expect(PreventeVerdictReponseSchema.options).toEqual(["admise", "plafond_atteint"]);
    expect(PreventeVerdictReponseSchema.safeParse("refusee").success).toBe(false);
  });

  it("relevé : nombres, jours et codes seulement ; clé inconnue et texte libre refusés", () => {
    expect(PreventeReleveVisitesSchema.safeParse({ semaine: "2026-11-09", src: "forum", visites: 12 }).success).toBe(true);
    expect(PreventeReleveVisitesSchema.safeParse({ semaine: "2026-11-09", src: "interne", visites: 1 }).success).toBe(false);
    expect(PreventeReleveVisitesSchema.safeParse({ semaine: "2026-11-09", src: "forum", visites: 1, ip: "x" }).success).toBe(false);
    expect(PreventeReleveReponsesSchema.safeParse({ rubrique: "total", code: null, reponses: 3 }).success).toBe(true);
    expect(PreventeReleveReponsesSchema.safeParse({ rubrique: "periode", code: "paques", reponses: 1 }).success).toBe(true);
    expect(PreventeReleveReponsesSchema.safeParse({ rubrique: "periode", code: "Lisbonne", reponses: 1 }).success).toBe(false);
    expect(PreventeReleveReponsesSchema.safeParse({ rubrique: "destination", code: null, reponses: 1 }).success).toBe(false);
    expect(PreventeReleveDestinationsSchema.safeParse({ reponsesAvecDestination: 5, destinationsCiteesDeuxFois: 2 }).success).toBe(true);
    expect(PreventeReleveDestinationsSchema.safeParse({ reponsesAvecDestination: 5, destinationsCiteesDeuxFois: 2, destinations: ["Rome"] }).success).toBe(false);
  });
});
