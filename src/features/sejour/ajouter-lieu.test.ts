import { describe, expect, it } from "vitest";

import type { Day, DayLineItem, RevisionPreview, Stop } from "@/contracts";

import { demandeDuMoment, joursAvecEtapeEcrite, lireEntree, momentPropose, momentsDuJour, trajetsCalculesApres } from "./ajouter-lieu";

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
  it("`de` et `a`, ou `de` et `repas` ; tout le reste est ignoré et l'adresse nettoyée", () => {
    expect(lireEntree({})).toEqual({ entree: null, invalide: false });
    expect(lireEntree({ de: "15:00", a: "18:30" })).toEqual({ entree: { type: "libre", from: "15:00", to: "18:30" }, invalide: false });
    expect(lireEntree({ de: "19:00", repas: "dinner" })).toEqual({ entree: { type: "repas", time: "19:00", meal: "dinner" }, invalide: false });
    expect(lireEntree({ de: "25:00", a: "18:30" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ de: "19:00", repas: "brunch" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ de: "18:30", a: "15:00" })).toEqual({ entree: null, invalide: true });
    expect(lireEntree({ idee: "idee-1" })).toEqual({ entree: null, invalide: true });
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
