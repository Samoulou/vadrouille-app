// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { CandidatMoteur } from "@/domain/entrees";
import { demandeDuJour as demandeDuJourDomaine } from "@/domain/demande-du-jour";
import { squeletteAvecEngagements } from "@/domain/squelette";
import type { ClientPlacesMvp, ClientRoutes } from "@/grounding/interfaces";
import { creerPlacesSimule, FixturesPlacesSchema } from "@/grounding/places.simule";
import { creerRoutesSimule, FixturesRoutesSchema } from "@/grounding/routes.simule";
import { CONFIGURATION_CLASSEMENT } from "@/server/config/classement";
import { MARGE_FICHES } from "@/server/config/generation";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import { demandeBornee, demandeDuJour } from "@/server/p0/vers-moteur";

import fixturesPlaces from "../../../prototype/fixtures/places/edimbourg.json";
import fixturesRoutes from "../../../prototype/fixtures/routes/edimbourg.json";
import { capaciteMatrice, preparerPlanification, villesPositionnees, type EntreePlanification } from "./planification";

/**
 * `preparerPlanification` (étape `e` de l'aperçu ; revue de la PR #563, bloquants 4 et 7) : jours non planifiés, budgets,
 * et module partagé avec P0 pour la demande d'un jour. Doubles de B8 sur les fixtures d'Édimbourg (valeurs sentinelles),
 * appels comptés ; aucun appel réel.
 */

const LOGEMENT = "SENTINELLE_PLACE_ID_LOGEMENT";
const MODES = ["walk", "transit"] as const;
const TOUT = ["activity", "meal", "evening"] as const;

/** Lieux d'activité (001 à 023, sauf 013 fermé) et de repas (024 à 034) des fixtures. */
const ACTIVITES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 19, 20, 21, 22, 23];
const REPAS = [24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34];
const placeIdDe = (n: number) => `SENTINELLE_PLACE_ID_${String(n).padStart(3, "0")}`;

function candidat(n: number, typeEtape: "activity" | "meal"): CandidatMoteur & { readonly ville: number } {
  return {
    id: `c-${n}`,
    nom: `Lieu ${n}`,
    resume: "Résumé de test",
    categorie: typeEtape === "meal" ? "restaurant" : "walk",
    typeEtape,
    faits: {},
    sources: [{ url: "https://exemple.test/page", date: "2026-10-01", classe: "independante" }],
    notes: { matchesWishes: true, notForMeRisk: 2 + (n % 5), mustSee: n % 7 === 0, slotFit: [...TOUT] },
    placeId: placeIdDe(n),
    aReserver: false,
    ville: 0,
  };
}

const CANDIDATS = [...ACTIVITES.map((n) => candidat(n, "activity")), ...REPAS.map((n) => candidat(n, "meal"))];

const squelette = (debut: string, fin: string, nuits: number) =>
  squeletteAvecEngagements({
    voyage: { start: debut, end: fin },
    pace: "balanced",
    nombreDeNuits: nuits,
    engagements: [],
    configuration: CONFIGURATION_MOTEUR,
    budgetTrajetReduit: false,
  });

function compteurs() {
  const base = creerPlacesSimule(FixturesPlacesSchema.parse(fixturesPlaces));
  const routesBase = creerRoutesSimule(FixturesRoutesSchema.parse(fixturesRoutes));
  const fiches: string[] = [];
  const positions: string[] = [];
  const textSearch: string[] = [];
  const matrices: { origines: string[]; destinations: string[]; mode: string }[] = [];
  const places: ClientPlacesMvp = {
    ...base,
    async textSearch(requete) {
      textSearch.push(requete.texte);
      return base.textSearch(requete);
    },
    async details(placeId) {
      fiches.push(placeId);
      return base.details(placeId);
    },
    async position(placeId) {
      positions.push(placeId);
      return base.position(placeId);
    },
  };
  const routes: ClientRoutes = {
    async matrice(requete) {
      matrices.push({ origines: requete.origines.map(String), destinations: requete.destinations.map(String), mode: requete.mode });
      return routesBase.matrice(requete);
    },
  };
  return { places, routes, fiches, positions, textSearch, matrices };
}

function entree(jours: EntreePlanification["jours"], budgets: Partial<EntreePlanification["budgets"]> = {}): EntreePlanification {
  return {
    jours,
    nuitsVille: [0, 0, 0, 0, 0],
    villes: [{ rang: 0, nom: "Édimbourg", logement: { kind: "known", placeId: LOGEMENT } }],
    candidats: CANDIDATS,
    modes: [...MODES],
    classement: { classement: CONFIGURATION_CLASSEMENT, ageSourceMaxJours: 365, dateReference: "2026-10-20" },
    configuration: CONFIGURATION_MOTEUR,
    budgets: { textSearch: 0, fiches: 40, routesRequetes: 40, routesElements: 2_000, marge: MARGE_FICHES, ...budgets },
  };
}

describe("planification: demande du jour partagée avec P0", () => {
  it("la génération importe le module du domaine, P0 le ré-exporte : une seule définition", () => {
    expect(demandeDuJour).toBe(demandeDuJourDomaine);
    const jour = squelette("2026-11-23", "2026-11-28", 5)[1];
    if (jour === undefined) throw new Error("squelette vide");
    expect(demandeDuJour(jour, CONFIGURATION_MOTEUR)).toEqual(demandeDuJourDomaine(jour, CONFIGURATION_MOTEUR));
    expect(demandeBornee({ activity: 3, meal: 2, evening: 1 }, 4)).toEqual({ activity: 3, meal: 1, evening: 0 });
  });
});

describe("planification: jours non planifiés et budgets", () => {
  const sixJours = squelette("2026-11-23", "2026-11-28", 5);
  const planifies = sixJours.filter((jour) => jour.index <= 2);

  it("ne lit aucune fiche ni aucun trajet pour un lieu qui n'appartient qu'aux jours non planifiés", async () => {
    const c = compteurs();
    const issue = await preparerPlanification(entree(planifies), { places: c.places, routes: c.routes });
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    // Fiches : au plus la première série des deux jours planifiés et sa marge, jamais celle des six jours.
    const demande = planifies.reduce((somme, jour) => somme + Object.values(demandeDuJour(jour, CONFIGURATION_MOTEUR)).reduce((a, b) => a + b, 0), 0);
    const tous = sixJours.reduce((somme, jour) => somme + Object.values(demandeDuJour(jour, CONFIGURATION_MOTEUR)).reduce((a, b) => a + b, 0), 0);
    expect(demande).toBeLessThan(tous);
    expect(new Set(c.fiches).size).toBe(c.fiches.length);
    expect(c.fiches.length).toBeLessThanOrEqual(demande + Math.max(MARGE_FICHES.minimum, Math.ceil(demande * MARGE_FICHES.part)));
    // Trajets : une matrice par jour planifié et par mode au plus, sur les seuls points des jours planifiés.
    expect(c.matrices.length).toBeLessThanOrEqual(planifies.length * MODES.length);
    const lus = new Set(c.fiches);
    for (const matrice of c.matrices) {
      for (const point of [...matrice.origines, ...matrice.destinations]) expect(point === LOGEMENT || lus.has(point)).toBe(true);
    }
    // Les candidats rendus sont ceux dont la fiche a été lue.
    for (const retenu of issue.valeur.candidats) expect(lus.has(retenu.placeId ?? "")).toBe(true);
  });

  it("un jour de plus planifié lit davantage de fiches : la demande suit les jours à planifier", async () => {
    const deux = compteurs();
    const quatre = compteurs();
    await preparerPlanification(entree(planifies), { places: deux.places, routes: deux.routes });
    await preparerPlanification(entree(sixJours.filter((jour) => jour.index <= 4)), { places: quatre.places, routes: quatre.routes });
    expect(quatre.fiches.length).toBeGreaterThan(deux.fiches.length);
  });

  it("le budget de fiches borne les lectures, le budget Routes borne les requêtes", async () => {
    const serre = compteurs();
    const issue = await preparerPlanification(entree(planifies, { fiches: 3 }), { places: serre.places, routes: serre.routes });
    // Une première série qui ne tient pas dans le budget de fiches est refusée avant toute fiche, comme dans P0.
    expect(issue).toMatchObject({ ok: false, code: "cap_reached", retryable: false });
    expect(serre.fiches).toHaveLength(0);
    // Un budget juste suffisant lit la première série et sa marge, pas davantage.
    const demande = planifies.reduce((somme, jour) => somme + Object.values(demandeDuJour(jour, CONFIGURATION_MOTEUR)).reduce((a, b) => a + b, 0), 0);
    const juste = compteurs();
    // Le budget de l'étape comprend la position de la ville (une fiche, 0113 § 4 point 3).
    const lue = await preparerPlanification(entree(planifies, { fiches: demande + 1 }), { places: juste.places, routes: juste.routes });
    expect(lue.ok).toBe(true);
    expect(juste.fiches.length).toBeLessThanOrEqual(demande);
    const unDeMoins = compteurs();
    expect(await preparerPlanification(entree(planifies, { fiches: demande }), { places: unDeMoins.places, routes: unDeMoins.routes })).toMatchObject({ ok: false, code: "cap_reached" });
    expect(unDeMoins.fiches).toHaveLength(0);

    const sansRoutes = compteurs();
    const refus = await preparerPlanification(entree(planifies, { routesElements: 0, routesRequetes: 0 }), { places: sansRoutes.places, routes: sansRoutes.routes });
    // Aucune place dans la matrice alors que les jours attendent des lieux : `cap_reached` (décision 0113 § 4), aucun appel.
    expect(refus).toEqual({ ok: false, code: "cap_reached", retryable: false });
    expect(sansRoutes.matrices).toHaveLength(0);
    expect(sansRoutes.fiches).toHaveLength(0);
  });

  it("les positions rendues sont celles des fiches lues, jamais d'un lieu non lu", async () => {
    const c = compteurs();
    const issue = await preparerPlanification(entree(planifies), { places: c.places, routes: c.routes });
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    expect(issue.valeur.positions.size).toBeGreaterThan(0);
    const lus = new Set(c.fiches);
    for (const placeId of issue.valeur.positions.keys()) expect(lus.has(placeId)).toBe(true);
  });

  it("une fiche en erreur est un résultat fermé, jamais une exception", async () => {
    const c = compteurs();
    const places: ClientPlacesMvp = { ...c.places, details: async () => { throw new Error("test_place_fuite"); } };
    const issue = await preparerPlanification(entree(planifies), { places, routes: c.routes });
    expect(issue.ok).toBe(false);
    expect(JSON.stringify(issue)).not.toContain("test_place_fuite");
  });
});

describe("planification: garde Text Search des villes area et none (décision 0113 § 3 bis point 4)", () => {
  const planifies = squelette("2026-11-23", "2026-11-28", 5).filter((jour) => jour.index <= 2);
  // J1 à Édimbourg (logement connu), J2 arrive à Glasgow (`none`) : la zone de Glasgow demande un Text Search de son nom.
  const deuxVilles = (budgets: Partial<EntreePlanification["budgets"]>): EntreePlanification => ({
    ...entree(planifies, budgets),
    nuitsVille: [0, 1, 1, 1, 1],
    villes: [
      { rang: 0, nom: "Édimbourg", logement: { kind: "known", placeId: LOGEMENT } },
      { rang: 1, nom: "Glasgow", logement: { kind: "none" } },
    ],
    candidats: CANDIDATS.map((c, rang) => ({ ...c, ville: rang % 2 })),
  });

  it("garde : sans requête Text Search dans le budget, aucun appel ne part pour la ville, jamais un centre inventé", async () => {
    const c = compteurs();
    const issue = await preparerPlanification(deuxVilles({ textSearch: 0 }), { places: c.places, routes: c.routes });
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    expect(c.textSearch).toEqual([]);
    // Seule la position du logement d'Édimbourg est lue ; aucun lieu de Glasgow n'est relu ni rendu.
    expect(c.positions).toEqual([LOGEMENT]);
    const deGlasgow = new Set(CANDIDATS.filter((_, rang) => rang % 2 === 1).map((cand) => cand.placeId));
    expect(c.fiches.some((placeId) => deGlasgow.has(placeId))).toBe(false);
    expect(issue.valeur.candidats.some((cand) => deGlasgow.has(cand.placeId))).toBe(false);
    expect(issue.valeur.candidats.length).toBeGreaterThan(0);
  });

  it("avec une requête dans la part : un seul Text Search, le nom de la ville", async () => {
    const c = compteurs();
    const issue = await preparerPlanification(deuxVilles({ textSearch: 1 }), { places: c.places, routes: c.routes });
    expect(c.textSearch).toEqual(["Glasgow"]);
    // Le double d'Édimbourg ne connaît pas Glasgow : résultat déterministe, la zone est introuvable.
    expect(issue).toEqual({ ok: false, code: "lodging_unresolved", retryable: false });
  });
});

describe("planification: jour sans matrice possible (décision 0113 § 4, ticket 609)", () => {
  const sixJours = squelette("2026-11-23", "2026-11-28", 5);
  const unJour = sixJours.filter((jour) => jour.index === 3);

  it("une requête Routes pour deux modes : capacité nulle, cap_reached avant toute position, fiche ou matrice", async () => {
    expect(capaciteMatrice(1, MODES.length, { routesRequetes: 1, routesElements: 50 })).toBe(0);
    const c = compteurs();
    const issue = await preparerPlanification(entree(unJour, { routesRequetes: 1, routesElements: 50 }), { places: c.places, routes: c.routes });
    expect(issue).toEqual({ ok: false, code: "cap_reached", retryable: false });
    expect(c.positions).toEqual([]);
    expect(c.fiches).toEqual([]);
    expect(c.textSearch).toEqual([]);
    expect(c.matrices).toEqual([]);
  });

  it("capacité entièrement prise par le logement du jour : cap_reached avant toute fiche ou matrice", async () => {
    // Un mode, une requête et un élément : la matrice admet un point, celui du logement ; aucun lieu n'y tient.
    expect(capaciteMatrice(1, 1, { routesRequetes: 1, routesElements: 1 })).toBe(1);
    const c = compteurs();
    const issue = await preparerPlanification(
      { ...entree(unJour, { routesRequetes: 1, routesElements: 1 }), modes: ["walk"] },
      { places: c.places, routes: c.routes },
    );
    expect(issue).toEqual({ ok: false, code: "cap_reached", retryable: false });
    expect(c.fiches).toEqual([]);
    expect(c.matrices).toEqual([]);
  });

  it("deux requêtes pour deux modes : le jour est planifié (aucun changement quand la part suffit)", async () => {
    const c = compteurs();
    const issue = await preparerPlanification(entree(unJour, { routesRequetes: 2, routesElements: 100 }), { places: c.places, routes: c.routes });
    expect(issue.ok).toBe(true);
    if (!issue.ok) return;
    expect(issue.valeur.candidats.length).toBeGreaterThan(0);
    expect(c.matrices.length).toBeGreaterThan(0);
  });
});

describe("planification: budget de fiches à deux villes (décision 0113 § 4 point 3, ticket 609)", () => {
  const sixJours = squelette("2026-11-23", "2026-11-28", 5);
  const villes = [
    { rang: 0, nom: "Édimbourg", logement: { kind: "known" as const, placeId: LOGEMENT } },
    // Logement de Glasgow : une valeur sentinelle des fixtures, pour que sa position se lise dans le double.
    { rang: 1, nom: "Glasgow", logement: { kind: "known" as const, placeId: placeIdDe(20) } },
  ];
  // Deux nuits à Édimbourg, trois à Glasgow : J1 et J2 arrivent à Édimbourg, J3 à J6 à Glasgow.
  const nuitsVille = [0, 0, 1, 1, 1];
  const jour = (index: number) => sixJours.filter((j) => j.index === index);

  it("villes positionnées : celles d'un jour planifié, jamais toutes les villes du passage", () => {
    expect(villesPositionnees({ jours: jour(4), nuitsVille, villes }).map((v) => v.nom)).toEqual(["Glasgow"]);
    expect(villesPositionnees({ jours: jour(1), nuitsVille, villes }).map((v) => v.nom)).toEqual(["Édimbourg"]);
    expect(villesPositionnees({ jours: [...jour(1), ...jour(4)], nuitsVille, villes })).toHaveLength(2);
  });

  it("un jour d'une ville sur deux : une seule fiche de position déduite, la première série tient avec demande + 1", async () => {
    const jours = jour(1);
    const demande = Object.values(demandeDuJour(jours[0]!, CONFIGURATION_MOTEUR)).reduce((a, b) => a + b, 0);
    expect(demande).toBeGreaterThan(0);
    const c = compteurs();
    // Avant le ticket 609, les deux villes du passage étaient déduites : la première série ne tenait pas (`cap_reached`).
    const issue = await preparerPlanification({ ...entree(jours, { fiches: demande + 1 }), nuitsVille, villes }, { places: c.places, routes: c.routes });
    expect(issue.ok).toBe(true);
    expect(c.positions).toEqual([LOGEMENT]);
    expect(c.fiches.length).toBeLessThanOrEqual(demande);
    // Deux jours, un par ville : deux positions, deux fiches déduites.
    const deux = compteurs();
    const deuxJours = [...jour(1), ...jour(4)];
    const demandeDeux = deuxJours.reduce((somme, j) => somme + Object.values(demandeDuJour(j, CONFIGURATION_MOTEUR)).reduce((a, b) => a + b, 0), 0);
    expect(await preparerPlanification({ ...entree(deuxJours, { fiches: demandeDeux + 1 }), nuitsVille, villes }, { places: deux.places, routes: deux.routes })).toMatchObject({ ok: false, code: "cap_reached" });
  });
});
