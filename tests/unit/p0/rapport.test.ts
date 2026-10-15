// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CRITERES } from "@/contracts/prototype-suivi";
import * as messages from "@/i18n/messages";
import { decouperProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import { criteresDuRapport, texteDuRapport } from "@/server/p0/rapport";

import { arretee, executionSuivie } from "./suivi-fabrique";

/**
 * Rapport sans donnée Google (spécification P0-suite-2, « Rapport sans donnée Google » ; D24 ; verdict P0-Q32) :
 * critères A1 à A9 en oui ou non, calculés en mémoire ; texte copié fait de libellés, de listes fermées et
 * d'identifiants seulement. Programme de test : lieux, noms et identifiants sentinelles.
 */

const SOURCE = readFileSync(path.join(process.cwd(), "prototype/programmes-test/proto_test_20261012_1.json"), "utf8");
const PREFIXE = "SENTINELLEGOOGLE_";
/** Contenu stocké (sans positions) d'un programme valide, `placeId` sentinelles. */
const contenuValide = (): Record<string, unknown> =>
  JSON.parse(JSON.stringify(decouperProgramme(ProgrammeReduitSchema.parse(JSON.parse(SOURCE.replaceAll("SENTINELLE_PLACE_ID_", PREFIXE)))).contenu));

const t = messages.prototype.lancement.rapport;

describe("p0: critères du rapport", () => {
  it("programme écrit et contenu valide : A1 à A8 oui ; A9 selon le canari (nul : non relevé)", () => {
    const criteres = criteresDuRapport(executionSuivie(), contenuValide());
    expect(Object.keys(criteres)).toEqual([...CRITERES]);
    for (const c of CRITERES) expect(criteres[c], c).toBe("oui");
    expect(criteresDuRapport(executionSuivie({ canaryOk: false }), contenuValide()).A9).toBe("non");
    expect(criteresDuRapport(executionSuivie({ canaryOk: null }), contenuValide()).A9).toBe("non_releve");
  });

  it("programme écrit mais plus lisible (purgé) : A1, A2 et A6 non relevés, A3 à A5, A7 et A8 oui", () => {
    const criteres = criteresDuRapport(executionSuivie(), null);
    expect([criteres.A1, criteres.A2, criteres.A6]).toEqual(["non_releve", "non_releve", "non_releve"]);
    expect([criteres.A3, criteres.A4, criteres.A5, criteres.A7, criteres.A8]).toEqual(["oui", "oui", "oui", "oui", "oui"]);
  });

  it("contenu refusé par le schéma, avec positions, ou d'une autre forme : A1, A2 et A6 non", () => {
    const avecPositions = { ...contenuValide(), positions: {} };
    const sansTrip = { ...contenuValide(), trip: undefined };
    for (const contenu of [{}, [], "x", 3, avecPositions, sansTrip]) {
      const criteres = criteresDuRapport(executionSuivie(), contenu);
      expect([criteres.A1, criteres.A2, criteres.A6], JSON.stringify(contenu)?.slice(0, 40)).toEqual(["non", "non", "non"]);
    }
  });

  it("A2 : une étape de lieu sans source est « non », A1 et A6 restent oui", () => {
    const contenu = contenuValide();
    const jours = (contenu.trip as { days: { items: { type: string; stop?: Record<string, unknown> }[] }[] }).days;
    const etape = jours.flatMap((j) => j.items).find((ligne) => ligne.type === "stop");
    expect(etape?.stop?.source).toBeDefined();
    delete etape!.stop!.source;
    const criteres = criteresDuRapport(executionSuivie(), contenu);
    expect(criteres).toMatchObject({ A1: "oui", A2: "non", A6: "oui" });
  });

  it("A6 : une proposition sans placeId est « non », A1 et A2 restent oui", () => {
    const contenu = contenuValide();
    const propositions = contenu.proposals as { stop: Record<string, unknown> }[];
    delete propositions[0]!.stop.placeId;
    const criteres = criteresDuRapport(executionSuivie(), contenu);
    expect(criteres).toMatchObject({ A1: "oui", A2: "oui", A6: "non" });
  });

  it("exécution arrêtée : A1 à A8 non, contenu ignoré ; A9 selon le canari", () => {
    const criteres = criteresDuRapport(arretee("pipeline_failed", { canaryOk: null }), contenuValide());
    for (const c of CRITERES.filter((x) => x !== "A9")) expect(criteres[c], c).toBe("non");
    expect(criteres.A9).toBe("non_releve");
  });

  it("exécution en cours : aucun rapport (erreur de programmation)", () => {
    expect(() => criteresDuRapport(executionSuivie({ statut: "en_cours", phase: "ancrage", coutModelesMicros: 10_000, ecouleMs: 5 }), null)).toThrow();
  });
});

describe("p0: texte du rapport (« Copier le rapport »)", () => {
  it("identité, issue, critères et dernière purge ; aucune donnée Google, aucun coût ni durée", () => {
    const execution = executionSuivie({ brief: "edimbourg-2.json", variante: "A", mode: "essai" });
    const texte = texteDuRapport(execution, criteresDuRapport(execution, contenuValide()), "2026-10-14T03:00:00Z");
    const lignes = texte.split("\n");
    expect(lignes[0]).toBe(t.titre);
    expect(lignes).toContain(`${t.mode} : ${t.modes.essai}`);
    expect(lignes).toContain(`${t.brief} : edimbourg-2.json`);
    expect(lignes).toContain(`${t.variante} : A`);
    expect(lignes).toContain(`${t.commit} : ${"a".repeat(40)}`);
    expect(lignes).toContain(`${t.issue} : ${t.issues.programme_ecrit}`);
    expect(lignes).toContain(`A1 ${t.criteres.A1} : ${t.valeurs.oui}`);
    expect(lignes.at(-1)).toBe(`${t.dernierePurge} : 2026-10-14T03:00:00Z`);
    expect(lignes.some((l) => l.startsWith(t.codeArret))).toBe(false);
    expect(lignes).toHaveLength(7 + CRITERES.length + 1);
    // Ni identifiant ni texte du programme (le contenu n'entre pas dans le texte), ni USD, ni durée.
    expect(texte).not.toContain(PREFIXE);
    expect(texte).not.toContain("[Lieu de test");
    expect(texte).not.toMatch(/USD|\bmin\b|\bms\b/);
  });

  it("exécution arrêtée : code d'arrêt ; aucune purge : « aucune »", () => {
    const execution = arretee("upstream_unavailable");
    const texte = texteDuRapport(execution, criteresDuRapport(execution, null), null);
    expect(texte).toContain(`${t.issue} : ${t.issues.arretee}`);
    expect(texte).toContain(`${t.codeArret} : upstream_unavailable`);
    expect(texte.split("\n").at(-1)).toBe(`${t.dernierePurge} : ${t.aucunePurge}`);
  });
});
