// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CRITERES } from "@/contracts/prototype-suivi";
import * as messages from "@/i18n/messages";
import { CODES_ARRET } from "@/prototype/arret";
import { decouperProgramme } from "@/prototype/decoupage";
import { ProgrammeReduitSchema } from "@/prototype/programme-reduit";
import { CODES_PLAFOND, criteresDuRapport, etapesAvecSiteDuRapport, etapesDuRapport, liensSitesDuRapport, texteDuRapport } from "@/server/p0/rapport";

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

  // Lot 2a (amendement 3 de la spécification, PPI-PO-12 ; 0122 § 2.3 point 2) : A2 ne porte plus que sur le `placeId`.
  // Ce test, qui exigeait « non » pour une étape sans source, porte désormais l'absence de `placeId` (même étape) ; la
  // source n'y entre plus (voir « rapport: A2 sur le seul placeId »).
  it("A2 : une étape de lieu sans placeId est « non », A1 et A6 restent oui ; sans source, A2 reste oui", () => {
    const contenu = contenuValide();
    const jours = (contenu.trip as { days: { items: { type: string; stop?: Record<string, unknown> }[] }[] }).days;
    const etape = jours.flatMap((j) => j.items).find((ligne) => ligne.type === "stop");
    expect(etape?.stop?.source).toBeDefined();
    delete etape!.stop!.source;
    expect(criteresDuRapport(executionSuivie(), contenu)).toMatchObject({ A1: "oui", A2: "oui", A6: "oui" });
    delete etape!.stop!.placeId;
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

  it("exécution arrêtée : A1 à A6 non, contenu ignoré ; A7 et A8 non relevés ; A9 selon le canari", () => {
    const criteres = criteresDuRapport(arretee("pipeline_failed", { canaryOk: null }), contenuValide());
    for (const c of ["A1", "A2", "A3", "A4", "A5", "A6"] as const) expect(criteres[c], c).toBe("non");
    expect(criteres).toMatchObject({ A7: "non_releve", A8: "non_releve", A9: "non_releve" });
  });

  it.each(["upstream_unavailable", "upstream_redirect", "usage_unavailable", "pipeline_failed", "real_mode_unavailable"])(
    "A7 et A8 : arrêt %s, aucun plafond signalé : non relevés (jamais un faux « non »)",
    (code) => {
      expect(criteresDuRapport(arretee(code), null)).toMatchObject({ A7: "non_releve", A8: "non_releve" });
    },
  );

  it.each(CODES_PLAFOND)("A7 et A8 : arrêt %s, plafond signalé : non", (code) => {
    expect(criteresDuRapport(arretee(code), null)).toMatchObject({ A7: "non", A8: "non" });
  });

  it("A7 et A8 : oui si et seulement si un programme est écrit, même illisible", () => {
    expect(criteresDuRapport(executionSuivie(), contenuValide())).toMatchObject({ A7: "oui", A8: "oui" });
    expect(criteresDuRapport(executionSuivie(), null)).toMatchObject({ A7: "oui", A8: "oui" });
    expect([...CODES_PLAFOND]).toEqual(["cap_reached", "timeout"]);
  });

  it("sous S4, aucun code de plafond n'est écrit en base (`pipeline_failed`) : une exécution arrêtée rend A7 et A8 non relevés", () => {
    for (const code of CODES_PLAFOND) expect(CODES_ARRET as readonly string[], code).not.toContain(code);
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
    // Lot 2a : une ligne « liens vers les sites affichés » après les critères (PPI-PO-12).
    expect(lignes).toHaveLength(7 + CRITERES.length + 1 + 1);
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

describe("p0: rapport sans donnée Google (spécification P0-programme-par-ia, A12 et § 6 ; 0117 § 4)", () => {
  it("rapport: étapesDuRapport(null) : non relevé sans programme, jamais zéro", () => {
    // Exécution arrêtée sans programme écrit (contenu non lu) ou programme absent : `null` (« non relevé » sur la page),
    // jamais `{ avecPlaceId: 0, sansPlaceId: 0 }`, qui dirait un programme vide.
    expect(etapesDuRapport(null)).toBeNull();
    expect(etapesDuRapport(undefined)).toBeNull();
    expect(etapesDuRapport({})).toBeNull();
    expect(etapesDuRapport("programme")).toBeNull();
  });

  it("p0: rapport sans donnée Google", () => {
    const contenu = contenuValide();
    const jours = (contenu.trip as { days: { items: { type: string; stop?: Record<string, unknown> }[] }[] }).days;
    const etapes = jours.flatMap((j) => j.items).filter((ligne) => ligne.type === "stop");
    // Une étape non vérifiée : écrite sans placeId (0116 § 5.1).
    delete etapes[1]!.stop!.placeId;
    const compte = etapesDuRapport(contenu);
    // Nombres d'étapes avec et sans placeId, calculés à la lecture du programme stocké ; rien d'autre ne sort.
    expect(compte).toEqual({ avecPlaceId: etapes.length - 1, sansPlaceId: 1 });
    expect(Object.keys(compte ?? {}).sort()).toEqual(["avecPlaceId", "sansPlaceId"]);
    expect(JSON.stringify(compte)).not.toContain(PREFIXE);
    // Programme absent ou hors schéma : aucun nombre.
    expect(etapesDuRapport(null)).toBeNull();
    expect(etapesDuRapport({})).toBeNull();
    // « Copier le rapport » ne les contient jamais : texteDuRapport ne les reçoit pas, et le texte ne porte aucun
    // identifiant de lieu, aucun nom ni aucun nombre d'étapes.
    expect(texteDuRapport.length).toBe(3);
    const texte = texteDuRapport(executionSuivie(), criteresDuRapport(executionSuivie(), contenu), null);
    expect(texte).not.toContain(PREFIXE);
    for (const etape of etapes) expect(texte).not.toContain(String(etape.stop!.name));
    expect(texte).not.toMatch(/placeId|avecPlaceId|sansPlaceId|unverified|verifi/i);
  });
});

describe("p0: rapport, lot 2a (spécification § 11.4, A24 ; amendement 3, PPI-PO-12 ; verdict 0122 § 2.3)", () => {
  type Ligne = { type: string; stop?: Record<string, unknown> };
  const etapesDe = (contenu: Record<string, unknown>) =>
    (contenu.trip as { days: { items: Ligne[] }[] }).days.flatMap((jour) => jour.items).filter((ligne) => ligne.type === "stop");

  it("rapport: A2 sur le seul placeId", () => {
    // Toutes les étapes avec placeId et aucune avec source : A2 « oui », ligne des sites « non ».
    const contenu = contenuValide();
    for (const etape of etapesDe(contenu)) delete etape.stop!.source;
    const execution = executionSuivie();
    expect(criteresDuRapport(execution, contenu).A2).toBe("oui");
    expect(liensSitesDuRapport(execution, contenu)).toBe("non");
    // Une étape avec source et sans placeId : A2 « non », ligne des sites « oui » ; jamais combinées.
    const melange = contenuValide();
    const [premiere, ...autres] = etapesDe(melange);
    for (const etape of autres) delete etape.stop!.source;
    delete premiere!.stop!.placeId;
    expect(criteresDuRapport(execution, melange).A2).toBe("non");
    expect(liensSitesDuRapport(execution, melange)).toBe("oui");
  });

  it("rapport: étapes avec site à la lecture, texte copié en oui ou non", () => {
    const contenu = contenuValide();
    const etapes = etapesDe(contenu);
    for (const etape of etapes.slice(1)) delete etape.stop!.source;
    const execution = executionSuivie();
    // Sur la page : nombre d'étapes avec source, calculé à la lecture du programme stocké.
    expect(etapesAvecSiteDuRapport(contenu)).toBe(1);
    expect(etapesAvecSiteDuRapport(contenuValide())).toBe(etapes.length);
    // Texte copié : une ligne oui ou non, sans nombre, sans hôte ni adresse, sans compteur du journal.
    const texte = texteDuRapport(execution, criteresDuRapport(execution, contenu), null, liensSitesDuRapport(execution, contenu));
    const ligne = texte.split("\n").find((l) => l.startsWith(t.liensSites));
    expect(ligne).toBe(`${t.liensSites} : ${t.valeurs.oui}`);
    expect(ligne).not.toMatch(/\d/);
    const source = etapes[0]!.stop!.source as { label: string; url: string };
    expect(texte).not.toContain(source.label);
    expect(texte).not.toContain(source.url);
    expect(texte).not.toMatch(/sites(Proposed|Checked|Removed|Unchecked)|placeId/);
    expect(texte).not.toContain(t.etapesAvecSite.split(" :")[0]!);
    // La ligne des sites ne lit que `source` : retirer tous les placeId ne la change pas.
    for (const etape of etapes) delete etape.stop!.placeId;
    expect(liensSitesDuRapport(execution, contenu)).toBe("oui");
  });

  it("rapport: ligne des sites non relevée sans programme", () => {
    expect(liensSitesDuRapport(executionSuivie(), null)).toBe("non_releve");
    expect(liensSitesDuRapport(executionSuivie(), {})).toBe("non_releve");
    expect(liensSitesDuRapport(executionSuivie(), { ...contenuValide(), positions: {} })).toBe("non_releve");
    expect(liensSitesDuRapport(arretee("upstream_unavailable"), contenuValide())).toBe("non_releve");
    expect(etapesAvecSiteDuRapport(null)).toBeNull();
    expect(etapesAvecSiteDuRapport({})).toBeNull();
    // Par défaut (aucune valeur passée) : « non relevé », jamais « non ».
    const texte = texteDuRapport(arretee("upstream_unavailable"), criteresDuRapport(arretee("upstream_unavailable"), null), null);
    expect(texte).toContain(`${t.liensSites} : ${t.valeurs.non_releve}`);
  });
});
