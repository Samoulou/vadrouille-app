// @vitest-environment node
import { beforeAll, describe, expect, it } from "vitest";

import type { ProgrammeReduit } from "@/prototype/programme-reduit";

import type { Rapport } from "../../../scripts/p0/rapport";
import { charger, clesDe, CLES_INTERDITES, executerCapture, sentinelles, texteDesRequetes, type Capture } from "./harnais";

/**
 * Tests « canari » de la spécification P0 : le client Places simulé renvoie des valeurs sentinelles (nom, adresse,
 * coordonnée 55.9533123, horaires, note, niveau de prix, statut, placeId SENTINELLE_PLACE_ID_…) et le client
 * Routes une durée sentinelle de 4321 s. Aucune de ces valeurs ne doit atteindre un prompt, le journal ou le rapport ;
 * le programme ne contient que le placeId (et la table `positions`).
 */

const { fixtures } = charger();
const { placeIds, autres } = sentinelles(fixtures);
const longitudes = Object.values(fixtures.places.lieux).map((lieu) => String(lieu.position.lng));
/** Valeurs d'horaires sentinelles (547 = 09:07, 667, 1433 = 23:53) écrites comme heures. */
const HEURES_SENTINELLES = ["09:07", "11:07", "23:53"];

let capture: Capture;
let programme: ProgrammeReduit;
let rapport: Rapport;

beforeAll(async () => {
  const execution = await executerCapture();
  capture = execution.capture;
  rapport = execution.resultat.rapport;
  expect(execution.resultat.programme).toBeDefined();
  programme = execution.resultat.programme as ProgrammeReduit;
});

function sansDonneeGoogle(texte: string, ou: string) {
  for (const valeur of [...autres, ...longitudes, "SENTINELLE"]) expect(texte, `${ou} : ${valeur}`).not.toContain(valeur);
  for (const placeId of placeIds) expect(texte, `${ou} : placeId`).not.toContain(placeId);
}

function sansCleInterdite(valeur: unknown, ou: string) {
  const cles = clesDe(valeur);
  for (const cle of CLES_INTERDITES) expect(cles.has(cle), `${ou} : clé ${cle}`).toBe(false);
}

describe("p0: canari, aucune donnée Google dans un prompt, un journal ou le rapport", () => {
  it("l'exécution a bien interrogé Places et Routes (le canari a de quoi fuir)", () => {
    expect(capture.details.length).toBeGreaterThan(10);
    expect(capture.matrices.length).toBeGreaterThan(0);
    expect(capture.requetes.some((requete) => requete.etape === "notation")).toBe(true);
    expect(capture.requetes.some((requete) => requete.etape === "raisons")).toBe(true);
  });

  it("aucune sentinelle, placeId compris, dans les requêtes au modèle", () => {
    sansDonneeGoogle(texteDesRequetes(capture.requetes), "requêtes");
    sansCleInterdite(capture.requetes, "requêtes");
    // La durée sentinelle et les horaires sentinelles n'y figurent sous aucune forme.
    const texte = texteDesRequetes(capture.requetes);
    for (const heure of HEURES_SENTINELLES) expect(texte).not.toContain(heure);
    expect(texte).not.toMatch(/\b72\b/); // 4321 s arrondies à la minute supérieure
  });

  it("aucune sentinelle, placeId compris, dans le journal", () => {
    const journal = capture.journal.join("\n");
    sansDonneeGoogle(journal, "journal");
    sansCleInterdite(capture.journal.map((ligne) => JSON.parse(ligne) as unknown), "journal");
  });

  it("aucune sentinelle, placeId compris, dans le rapport", () => {
    sansDonneeGoogle(JSON.stringify(rapport), "rapport");
    sansCleInterdite(rapport, "rapport");
  });
});

describe("p0: canari, le programme ne contient que le placeId comme donnée Google", () => {
  it("contient le placeId sentinelle dans les champs placeId et comme clé de positions", () => {
    const texte = JSON.stringify(programme);
    expect(texte).toContain("SENTINELLE_PLACE_ID_");
    expect(Object.keys(programme.positions).every((cle) => cle.startsWith("SENTINELLE_PLACE_ID_"))).toBe(true);
    expect(JSON.stringify(programme.positions)).toContain("55.9533123");
  });

  it("la coordonnée sentinelle n'apparaît que dans la table positions", () => {
    const reste = { ...programme, positions: undefined };
    const texte = JSON.stringify(reste);
    expect(texte).not.toContain("55.9533123");
    for (const longitude of longitudes) expect(texte).not.toContain(longitude);
  });

  it("aucune autre sentinelle, ni clé interdite hors de positions ; placeId seulement dans les champs placeId", () => {
    const reste = { ...programme, positions: undefined };
    sansCleInterdite(reste, "programme");
    const parcourir = (noeud: unknown, cle: string) => {
      if (Array.isArray(noeud)) return noeud.forEach((enfant) => parcourir(enfant, cle));
      if (noeud !== null && typeof noeud === "object") {
        for (const [nom, enfant] of Object.entries(noeud)) parcourir(enfant, nom);
        return;
      }
      if (typeof noeud !== "string") {
        expect(String(noeud), cle).not.toBe("4321");
        return;
      }
      for (const valeur of autres) expect(noeud, `${cle} : ${valeur}`).not.toContain(valeur);
      if (cle !== "placeId" && cle !== "depart" && cle !== "arrivee") expect(noeud, cle).not.toContain("SENTINELLE");
    };
    parcourir(reste, "");
    // Le terminus ne porte que des placeId de logement.
    for (const terminus of programme.terminus) {
      expect(placeIds).toContain(terminus.depart);
      expect(placeIds).toContain(terminus.arrivee);
    }
  });

  it("Day.title, Proposal.context et detour ne contiennent ni sentinelle, ni placeId, ni durée", () => {
    const textes = [
      ...programme.trip.days.map((day) => day.title),
      ...programme.proposals.flatMap((proposition) => [proposition.context, proposition.detour]),
    ];
    expect(programme.proposals.length).toBeGreaterThan(0);
    for (const texte of textes) {
      expect(texte).not.toContain("SENTINELLE");
      expect(texte).not.toContain("55.9533123");
      expect(texte).not.toMatch(/4321|\b72 ?min/);
      for (const valeur of autres) expect(texte).not.toContain(valeur);
    }
  });
});

describe("p0: le rapport n'utilise aucun nom de champ de la liste interdite", () => {
  it("elapsedMs, jamais duration", () => {
    const cles = clesDe(rapport);
    expect(cles.has("elapsedMs")).toBe(true);
    expect(cles.has("duration")).toBe(false);
    sansCleInterdite(rapport, "rapport");
  });
});
