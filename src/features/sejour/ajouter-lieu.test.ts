import { describe, expect, it } from "vitest";

import { poserAjoutSimule } from "@/adapters/mock-lieux";
import type { AddPlaceRequest, Day, DayLineItem, RevisionPreview, Stop } from "@/contracts";

import { apercuSurJourAffiche, demandeDuMoment, ideeDeLEntree, joursAvecEtapeEcrite, lireEntree, momentPropose, momentsDuJour, trajetsCalculesApres } from "./ajouter-lieu";

/** Fonctions pures de « Ajouter un lieu » (M5d-2 ; spécification M5 § 6, M5-PO-12 ; critère 22 ; addendum 0147 A.5). */

const DUREES = { activity: 90, lunch: 75, dinner: 90 };

const etape = (id: string, start: string, end: string, locked = false): DayLineItem => ({
  type: "stop",
  stop: { id, kind: "activity", placeId: `ChIJ-${id}`, name: id, start, end, facts: {}, exceptions: [], locked },
});
const segment = (estimated = false): DayLineItem => ({ type: "segment", segment: { mode: "walk", minutes: 10, estimated } });

const jour = (items: DayLineItem[]): Day => ({ index: 2, date: "2026-08-31", items, events: [], travelMinutes: 0 }) as unknown as Day;

/** Jour du critère 22 : A 09:00 – 10:30, temps libre 10:30 – 11:15, B verrouillée, C, temps libre 14:30 – 18:00. */
const CRITERE_22 = jour([
  etape("A", "09:00", "10:30"),
  { type: "free", from: "10:30", to: "11:15" },
  etape("B", "11:15", "13:00", true),
  etape("C", "13:00", "14:30"),
  { type: "free", from: "14:30", to: "18:00" },
]);

describe("ajouter: heure proposée (M5-PO-12, critère 22)", () => {
  it("premier temps libre au moins aussi long que la durée prévue : 14:30, activité", () => {
    const propose = momentPropose(momentsDuJour(CRITERE_22), null, DUREES);
    expect(propose).toMatchObject({ type: "libre", from: "14:30", to: "18:00" });
    expect(demandeDuMoment(propose!)).toEqual({ time: "14:30", kind: "activity" });
  });

  it("aucun temps libre assez long : aucune heure proposée, la liste offre « Temps libre 10:30 – 11:15 »", () => {
    const sansPlace = jour([...CRITERE_22.items.slice(0, 4), etape("D", "14:30", "18:00", true)]);
    const moments = momentsDuJour(sansPlace);
    expect(momentPropose(moments, null, DUREES)).toBeNull();
    expect(moments).toEqual([{ id: "libre-10:30-11:15", type: "libre", from: "10:30", to: "11:15" }]);
  });

  it("le moment désigné par l'adresse l'emporte s'il est assez long ; trop court, la règle générale ; repas : son heure, `meal`", () => {
    const moments = momentsDuJour(CRITERE_22);
    expect(momentPropose(moments, { type: "libre", from: "10:30", to: "11:15" }, DUREES)?.id).toBe("libre-14:30-18:00");
    const avecRepas = jour([...CRITERE_22.items, { type: "openMeal", time: "19:00", meal: "dinner" }]);
    const repas = momentPropose(momentsDuJour(avecRepas), { type: "repas", time: "19:00", meal: "dinner" }, DUREES);
    expect(repas).toMatchObject({ type: "repas", time: "19:00" });
    expect(demandeDuMoment(repas!)).toEqual({ time: "19:00", kind: "meal" });
  });
});

describe("ajouter: paramètres d'adresse (F7-PO-8)", () => {
  it("`de` et `a`, `de` et `repas`, ou `idee` ; tout le reste est ignoré et l'adresse nettoyée", () => {
    expect(lireEntree({})).toEqual({ entree: null, invalide: false });
    expect(lireEntree({ de: "15:00", a: "18:30" })).toEqual({ entree: { type: "libre", from: "15:00", to: "18:30" }, invalide: false });
    expect(lireEntree({ de: "19:00", repas: "dinner" })).toEqual({ entree: { type: "repas", time: "19:00", meal: "dinner" }, invalide: false });
    expect(lireEntree({ de: "25:00", a: "18:30" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ de: "19:00", repas: "brunch" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ de: "18:30", a: "15:00" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ idee: "idee-1" })).toEqual({ entree: { type: "idee", id: "idee-1" }, invalide: false });
    expect(lireEntree({ idee: "idee-1", de: "15:00" })).toEqual({ entree: { type: "idee", id: "idee-1" }, invalide: true });
    expect(lireEntree({ idee: "ChIJ x/../y" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ de: "15:00", a: "18:30", etape: "x" })).toEqual({ entree: { type: "libre", from: "15:00", to: "18:30" }, invalide: true });
  });
});

describe("ajouter: « Temps de trajet calculé après l'ajout » (addendum 0147, A.5)", () => {
  const ajoutee: Stop = { id: "ajout-apercu", kind: "activity", placeId: "ChIJ-ajout", name: "Mon lieu", start: "15:00", end: "16:30", facts: {}, exceptions: [], locked: true, addedBy: "person" };
  const apercu = (items: DayLineItem[]): RevisionPreview => ({
    kind: "add",
    id: "apercu",
    baseVersion: 1,
    days: [jour(items)],
    changes: [{ type: "added", time: "15:00", label: "Mon lieu" }],
    changedStopIds: ["ajout-apercu"],
    targetStopId: "ajout-apercu",
  });

  it("durées connues des deux côtés : rien ; segment estimé ou absent vers une voisine : la phrase", () => {
    expect(trajetsCalculesApres(apercu([etape("A", "13:00", "14:30"), segment(), { type: "stop", stop: ajoutee }, segment(), etape("B", "17:00", "18:00")]))).toBe(false);
    expect(trajetsCalculesApres(apercu([etape("A", "13:00", "14:30"), segment(true), { type: "stop", stop: ajoutee }, segment(), etape("B", "17:00", "18:00")]))).toBe(true);
    expect(trajetsCalculesApres(apercu([etape("A", "13:00", "14:30"), { type: "free", from: "14:30", to: "15:00" }, { type: "stop", stop: ajoutee }]))).toBe(true);
    expect(trajetsCalculesApres(apercu([{ type: "stop", stop: ajoutee }, { type: "free", from: "16:30", to: "18:00" }]))).toBe(false);
  });

  it("l'étape écrite reprend l'identifiant `ajout-<requestId>` dans les jours affichés", () => {
    const jours = joursAvecEtapeEcrite(apercu([{ type: "stop", stop: ajoutee }]), "ajout-demande");
    const item = jours[0]?.items[0];
    expect(item?.type === "stop" ? item.stop.id : null).toBe("ajout-demande");
  });
});

describe("ajouter: idée « Surprends-moi » (`?idee=`, F7-PO-8 ; décision 0154 § 6 point 2)", () => {
  const idee = { id: "j2-idee", placeId: "mock_place_idee", name: "[Ruelle]", facts: {}, reason: "[Raison]", source: { label: "[Source]", url: "https://example.org" } };
  const avecIdee = { ...CRITERE_22, surprise: idee } as unknown as Day;

  it("l'idée du jour, avec ou sans `placeId` (une idée n'en a pas à reprendre) ; un autre identifiant ou aucune idée : `null`", () => {
    expect(ideeDeLEntree(avecIdee, { type: "idee", id: "j2-idee" })).toMatchObject({ name: "[Ruelle]" });
    expect(ideeDeLEntree(avecIdee, { type: "idee", id: "j4-idee" })).toBeNull();
    expect(ideeDeLEntree({ ...avecIdee, surprise: { ...idee, placeId: undefined } } as unknown as Day, { type: "idee", id: "j2-idee" })).toMatchObject({ name: "[Ruelle]" });
    expect(ideeDeLEntree(CRITERE_22, { type: "idee", id: "j2-idee" })).toBeNull();
    expect(ideeDeLEntree(avecIdee, null)).toBeNull();
  });
});

describe("ajouter: second ajout du même jour sur `mock` (décision 0154 § 3)", () => {
  const ajout = (id: string, start: string, end: string, kind: "activity" | "meal" = "activity"): Stop => ({
    id, kind, placeId: `ChIJ-${id}`, name: id, start, end, facts: {}, exceptions: [], locked: true, addedBy: "person",
  });
  const apercuDe = (day: Day, stop: Stop): RevisionPreview => ({
    kind: "add", id: "apercu", baseVersion: 1, days: [day], changes: [{ type: "added", time: stop.start, label: stop.name }], changedStopIds: [stop.id], targetStopId: stop.id,
  });
  // Jour simulé : temps libre 14:30 – 18:00, puis un dîner pas encore choisi.
  const simule = jour([etape("C", "13:00", "14:30"), { type: "free", from: "14:30", to: "18:00" }, { type: "openMeal", time: "19:30", meal: "dinner" }]);
  const premier = ajout("ajout-1", "14:30", "16:00");
  // Jour affiché après le premier ajout (mémoire de la page).
  const affiche = jour([etape("C", "13:00", "14:30"), { type: "stop", stop: premier }, { type: "free", from: "16:00", to: "18:00" }, { type: "openMeal", time: "19:30", meal: "dinner" }]);

  it("le second lieu s'ajoute au premier : le temps libre restant est coupé autour de lui, le premier reste", () => {
    const second = ajout("ajout-2", "16:00", "17:30");
    // L'aperçu de `mock` part du jour simulé : il ne connaît pas le premier ajout.
    const duSimule = jour([etape("C", "13:00", "14:30"), { type: "free", from: "14:30", to: "16:00" }, { type: "stop", stop: second }, { type: "free", from: "17:30", to: "18:00" }, { type: "openMeal", time: "19:30", meal: "dinner" }]);
    const reporte = apercuSurJourAffiche(apercuDe(duSimule, second), affiche);
    expect(reporte.days[0]?.items).toEqual([
      etape("C", "13:00", "14:30"),
      { type: "stop", stop: premier },
      { type: "stop", stop: second },
      { type: "free", from: "17:30", to: "18:00" },
      { type: "openMeal", time: "19:30", meal: "dinner" },
    ]);
    expect(reporte.targetStopId).toBe("ajout-2");
  });

  it("repas : le second lieu prend la place du dîner pas encore choisi, le premier reste", () => {
    const diner = ajout("ajout-3", "19:30", "21:00", "meal");
    const duSimule = jour([etape("C", "13:00", "14:30"), { type: "free", from: "14:30", to: "18:00" }, { type: "stop", stop: diner }]);
    const reporte = apercuSurJourAffiche(apercuDe(duSimule, diner), affiche);
    expect(reporte.days[0]?.items).toEqual([etape("C", "13:00", "14:30"), { type: "stop", stop: premier }, { type: "free", from: "16:00", to: "18:00" }, { type: "stop", stop: diner }]);
  });

  it("autre jour, ou aucune place dans le jour affiché : l'aperçu est rendu tel quel", () => {
    const second = ajout("ajout-2", "14:30", "16:00");
    const apercu = apercuDe(simule, second);
    expect(apercuSurJourAffiche(apercu, { ...affiche, index: 3 } as Day)).toBe(apercu);
    expect(apercuSurJourAffiche(apercu, affiche)).toBe(apercu);
  });
});

describe("ajouter: une seule pose pour l'adaptateur `mock` et l'écran (revue de la PR 973, bloquant 1)", () => {
  const simule = jour([
    etape("C", "13:00", "14:30"),
    { type: "free", from: "14:30", to: "18:00" },
    { type: "openMeal", time: "19:30", meal: "dinner" },
    { type: "free", from: "21:00", to: "23:00" },
  ]);
  const demande = (time: string, kind: "activity" | "meal"): AddPlaceRequest => ({ tripId: "t", baseVersion: 1, day: 2, time, kind, name: "Mon lieu", resultId: "ChIJ-lieu" });

  it.each([
    ["début du temps libre", demande("14:30", "activity")],
    ["milieu du temps libre", demande("15:00", "activity")],
    ["fin exacte du temps libre", demande("16:30", "activity")],
    ["dîner pas encore choisi", demande("19:30", "meal")],
    ["repas posé dans un temps libre", demande("21:00", "meal")],
  ])("%s : `poserAjoutSimule` (adaptateur) et `apercuSurJourAffiche` (écran) rendent le même jour", (_cas, requete) => {
    const pose = poserAjoutSimule(simule, "ajout-x", requete, DUREES);
    expect(pose).not.toBeNull();
    const apercu: RevisionPreview = {
      kind: "add", id: "a", baseVersion: 1, days: [pose!.day], changes: [], changedStopIds: [pose!.stop.id], targetStopId: pose!.stop.id,
    };
    // L'écran repose l'étape de l'aperçu sur le jour d'avant l'ajout : même résultat que l'adaptateur.
    expect(apercuSurJourAffiche(apercu, simule).days[0]).toEqual(pose!.day);
  });

  it("aucune place : l'adaptateur refuse (`null`) et l'écran rend l'aperçu tel quel", () => {
    expect(poserAjoutSimule(simule, "ajout-x", demande("17:00", "activity"), DUREES)).toBeNull();
  });
});
