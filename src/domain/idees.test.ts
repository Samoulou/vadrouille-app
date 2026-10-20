// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { ConfigClassement, ParametresClassement } from "@/domain/classement";
import type { CandidatMoteur } from "@/domain/entrees";
import { candidatsDIdees, type EntreeCandidatsDIdees, type JourPourIdees } from "@/domain/idees";
import type { Trajet } from "@/domain/planification";
import { INCONNU, type Relectures } from "@/domain/relectures";

/**
 * `candidatsDIdees` (décision 0105 § 5.1 point 2, tests (a)) : borne par jour, déterminisme et égalités, exclusion des lieux
 * du plan, dédoublonnage entre jours, candidat non admissible, candidat sans trajet, entrée non modifiée, liste vide, et le
 * cas à deux villes. Doubles maison (`SENTINELLE_PLACE_*`), aucune donnée Google.
 */

const FORMULE: ConfigClassement = {
  schema: 1,
  poids: { matchesWishes: 30, mustSee: 25, notForMeRisk: 4, source: { officielle: 4, independante: 6, generique: -8 }, sourceAncienne: 6 },
  matchesWishesNon: "penaliser",
  penaliteHorsEnvies: 20,
  prioriteMustSee: "avant",
  coutTrajetParMinute: { activity: 0.1, meal: 1, evening: 1, surprise: 2 },
};
const PARAMETRES: ParametresClassement = { classement: FORMULE, ageSourceMaxJours: 365, dateReference: "2026-10-20" };
const place = (id: string) => `SENTINELLE_PLACE_${id.toUpperCase()}`;

function candidat(id: string, extra: Partial<CandidatMoteur> = {}): CandidatMoteur {
  return {
    id,
    nom: `Lieu maison ${id}`,
    resume: `Résumé maison ${id}.`,
    categorie: "museum",
    typeEtape: "activity",
    faits: { costPerPerson: 10 },
    sources: [{ url: `https://guide.example/${id}`, date: "2026-10-01", classe: "independante" }],
    notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: ["activity"] },
    placeId: place(id),
    aReserver: false,
    ...extra,
  };
}

const relectures: Relectures = {
  validite: (placeId) => (placeId === place("ferme") ? "ferme_definitivement" : "valide"),
  plages: () => INCONNU,
  duree: () => INCONNU,
};

/** Minutes depuis chaque logement (nuit) ; absent : aucun trajet connu. */
function trajetDe(minutes: Readonly<Record<number, Readonly<Record<string, number>>>>): Trajet {
  return (depuis, vers) => {
    if (!("logement" in depuis) || !("lieu" in vers)) return undefined;
    const valeur = minutes[depuis.logement]?.[vers.lieu];
    return valeur === undefined ? undefined : { mode: "walk", minutes: valeur, estimee: false };
  };
}

const jour = (logementArrivee: number, ids: string[] = [], lieux: string[] = []): JourPourIdees => ({ logementArrivee, ids, lieux });

function entree(modif: Partial<EntreeCandidatsDIdees> & Pick<EntreeCandidatsDIdees, "candidats" | "trajet">): EntreeCandidatsDIdees {
  return { jours: [jour(0), jour(0)], relectures, parametres: PARAMETRES, parJour: 3, ...modif };
}

const ids = (liste: readonly CandidatMoteur[]) => liste.map((c) => c.id);

describe("candidatsDIdees (0105 § 5.1 point 2)", () => {
  const six = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"].map((id) => candidat(id));
  const proches = trajetDe({ 0: Object.fromEntries(six.map((c, rang) => [c.placeId as string, 5 + rang])) });

  it("borne par jour : au plus parJour par jour planifié, sans doublon entre jours, dans l'ordre du classement", () => {
    const offerts = candidatsDIdees(entree({ candidats: six, trajet: proches }));
    expect(ids(offerts)).toEqual(["c1", "c2", "c3", "c4", "c5", "c6"]);
    expect(new Set(offerts.map((c) => c.placeId)).size).toBe(offerts.length);
  });

  it("déterministe ; à égalité de score, ordre des identifiants", () => {
    const egaux = ["z", "b", "a"].map((id) => candidat(id));
    const trajet = trajetDe({ 0: Object.fromEntries(egaux.map((c) => [c.placeId as string, 10])) });
    const premier = candidatsDIdees(entree({ jours: [jour(0)], candidats: egaux, trajet }));
    expect(ids(premier)).toEqual(["a", "b", "z"]);
    expect(ids(candidatsDIdees(entree({ jours: [jour(0)], candidats: [...egaux].reverse(), trajet })))).toEqual(ids(premier));
  });

  it("exclut les candidats et les lieux du plan, tous jours confondus", () => {
    const offerts = candidatsDIdees(entree({ jours: [jour(0, ["c1"]), jour(0, [], [place("c2")])], candidats: six, trajet: proches }));
    expect(ids(offerts)).not.toContain("c1");
    expect(ids(offerts)).not.toContain("c2");
    expect(ids(offerts)).toEqual(["c3", "c4", "c5", "c6", "c7", "c8"]);
  });

  it("dédoublonne entre jours par lieu : deux candidats sur un même lieu ne sont offerts qu'une fois", () => {
    const jumeaux = [candidat("a"), candidat("b", { placeId: place("a") }), candidat("c")];
    const trajet = trajetDe({ 0: { [place("a")]: 5, [place("c")]: 9 } });
    const offerts = candidatsDIdees(entree({ parJour: 1, candidats: jumeaux, trajet }));
    expect(ids(offerts)).toEqual(["a", "c"]);
  });

  it("candidat non admissible : lieu non valide à la relecture, sans source https:, sans lieu", () => {
    const candidats = [
      candidat("ferme"),
      candidat("http", { sources: [{ url: "http://guide.example/x", date: "2026-10-01", classe: "independante" }] }),
      candidat("sanslieu", { placeId: undefined }),
      candidat("ok"),
    ];
    const trajet = trajetDe({ 0: { [place("ferme")]: 1, [place("http")]: 1, [place("ok")]: 9 } });
    expect(ids(candidatsDIdees(entree({ candidats, trajet })))).toEqual(["ok"]);
  });

  it("candidat sans trajet connu depuis le logement du jour : pas offert ce jour-là", () => {
    const candidats = [candidat("loin"), candidat("pres")];
    const trajet = trajetDe({ 0: { [place("pres")]: 5 } });
    expect(ids(candidatsDIdees(entree({ jours: [jour(0)], candidats, trajet })))).toEqual(["pres"]);
  });

  it("n'altère pas l'entrée ; liste vide et borne nulle : aucune idée", () => {
    const copie = structuredClone(six);
    candidatsDIdees(entree({ candidats: six, trajet: proches }));
    expect(six).toEqual(copie);
    expect(candidatsDIdees(entree({ candidats: [], trajet: proches }))).toEqual([]);
    expect(candidatsDIdees(entree({ candidats: six, trajet: proches, parJour: 0 }))).toEqual([]);
    expect(candidatsDIdees(entree({ jours: [], candidats: six, trajet: proches }))).toEqual([]);
  });

  it("deux villes : les candidats de la ville de J1 tous mieux classés, J2 reçoit quand même les siens, classés depuis son logement", () => {
    const villeA = ["a1", "a2", "a3", "a4", "a5"].map((id) => candidat(id, { notes: { matchesWishes: true, notForMeRisk: 0, mustSee: true, slotFit: ["activity"] } }));
    const villeB = ["b1", "b2", "b3", "b4"].map((id) => candidat(id));
    // Les lieux de A ne sont mesurés que depuis le logement de J1 (nuit 0), ceux de B que depuis celui de J2 (nuit 1).
    const trajet = trajetDe({
      0: Object.fromEntries(villeA.map((c, rang) => [c.placeId as string, 5 + rang])),
      1: { [place("b1")]: 30, [place("b2")]: 4, [place("b3")]: 12, [place("b4")]: 50 },
    });
    const offerts = candidatsDIdees(entree({ jours: [jour(0), jour(1)], candidats: [...villeA, ...villeB], trajet }));
    expect(ids(offerts)).toEqual(["a1", "a2", "a3", "b2", "b3", "b1"]);
  });
});
