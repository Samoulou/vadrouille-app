// @vitest-environment node
import { describe, expect, it } from "vitest";

import { TripSnapshotSchema, type StopSnapshot, type TripSnapshot } from "@/contracts";

import {
  etapesDansLOrdre,
  identifiantLigneAFaire,
  lignesApresVersion,
  lignesDuProgramme,
  ordreDeLecture,
  type LigneAFaire,
  type SuiteDeLaListe,
} from "./a-faire";

/**
 * Liste « À faire avant de partir » (tâche M5e ; spécification M5 § 7 ; décision 0147 § 7, T7 et T9), sans base : lignes de la
 * version 1, suite de la liste après une version, ordre de lecture. Noms entre crochets et `placeId` sentinelles
 * (`test_place_…`) : aucune donnée Google.
 */

const RUN = "0f0e0d0c-0b0a-4908-8706-050403020100";
const DEMANDE = "1a2b3c4d-5e6f-4a0b-8c1d-2e3f4a5b6c7d";

const etape = (id: string, start: string, extra: Partial<StopSnapshot> = {}): StopSnapshot => ({
  id,
  kind: "activity",
  placeId: `test_place_${id}`,
  name: `[Nom ${id}]`,
  start,
  facts: {},
  exceptions: [],
  locked: false,
  ...extra,
});
const reserver = (id: string, start: string, extra: Partial<StopSnapshot> = {}) => etape(id, start, { exceptions: ["toReserve"], ...extra });

const jour = (index: number, etapes: readonly StopSnapshot[], events: readonly StopSnapshot[] = []) => ({
  index,
  date: `2027-05-0${index}`,
  travelBudgetMinutes: 90,
  events: [...events],
  items: etapes.map((stop) => ({ type: "stop" as const, stop })),
});
const instantane = (...jours: ReturnType<typeof jour>[]): TripSnapshot => TripSnapshotSchema.parse({ days: jours });

/** Applique une suite à des lignes (ce que fait `ecrireVersion` dans sa transaction). */
function appliquer(lignes: readonly LigneAFaire[], suite: SuiteDeLaListe, base: string): LigneAFaire[] {
  const retirees = new Set(suite.retirer);
  const deliees = new Set(suite.delier);
  return [
    ...lignes.filter((l) => !retirees.has(l.id)).map((l) => (deliees.has(l.id) ? { ...l, stopId: null } : l)),
    ...suite.ajouter.map((l, rang) => ({ id: identifiantLigneAFaire(base, rang), ...l })),
  ];
}

/** Aucune ligne ne désigne une étape absente de l'instantané (contrôle `checklist_orphan` de la lecture). */
function sansOrpheline(lignes: readonly LigneAFaire[], apres: TripSnapshot): boolean {
  const ids = new Set(etapesDansLOrdre(apres).map(({ stop }) => stop.id));
  return lignes.every((l) => l.stopId === null || ids.has(l.stopId));
}

const reservationsParEtape = (lignes: readonly LigneAFaire[]) => {
  const compte = new Map<string, number>();
  for (const l of lignes) if (l.kind === "reservation" && l.stopId !== null) compte.set(l.stopId, (compte.get(l.stopId) ?? 0) + 1);
  return compte;
};

const ligne = (id: number, stopId: string | null, extra: Partial<LigneAFaire> = {}): LigneAFaire => ({
  id: `0000000${id}-0000-4000-8000-000000000000`,
  stopId,
  kind: "reservation",
  done: false,
  label: stopId === null ? "[Bon plan]" : `[Nom ${stopId}]`,
  ...extra,
});

describe("a-faire : lignes écrites à la génération (version 1 ; 0147 § 7.1)", () => {
  it("a-faire: lignes écrites à la génération : une réservation par étape toReserve, une ligne faite par engagement, dans l'ordre du programme", () => {
    const v1 = instantane(
      jour(1, [etape("j1-1", "09:00"), reserver("j1-2", "11:00"), reserver("j1-3", "20:00")], [etape("j1-c1", "18:00", { kind: "event", commitment: "ticket", locked: true, name: "[Billets du concert]" })]),
      jour(2, [reserver("j2-1", "10:00", { commitment: "reservation", locked: true }), reserver("j2-2", "12:00")]),
    );
    expect(lignesDuProgramme(v1)).toEqual([
      { stopId: "j1-2", kind: "reservation", label: "[Nom j1-2]", done: false },
      // L'engagement de 18:00 prend sa place dans la journée, entre 11:00 et 20:00, et naît coché.
      { stopId: "j1-c1", kind: "ticket", label: "[Billets du concert]", done: true },
      { stopId: "j1-3", kind: "reservation", label: "[Nom j1-3]", done: false },
      // Une étape engagement (`commitment`) n'est jamais « à réserver » : déjà réservée.
      { stopId: "j2-2", kind: "reservation", label: "[Nom j2-2]", done: false },
    ]);
  });

  it("a-faire: identifiants stables : rang sur 8 chiffres hexadécimaux, puis la fin de la base ; rang hors bornes refusé", () => {
    expect(identifiantLigneAFaire(RUN, 0)).toBe("00000000-0b0a-4908-8706-050403020100");
    expect(identifiantLigneAFaire(RUN, 26)).toBe("0000001a-0b0a-4908-8706-050403020100");
    expect(identifiantLigneAFaire(RUN, 3)).toBe(identifiantLigneAFaire(RUN, 3));
    expect(() => identifiantLigneAFaire(RUN, -1)).toThrow(RangeError);
    expect(() => identifiantLigneAFaire(RUN, 1.5)).toThrow(RangeError);
  });
});

describe("a-faire : suite de la liste après une version (0147 § 7.2)", () => {
  it("a-faire: M1c : une seule ligne par étape à réserver", () => {
    // Version 1 : deux journées, trois étapes à réserver (une déjà cochée), une étape ordinaire, un bon plan.
    const v1 = instantane(jour(1, [reserver("j1-1", "09:00"), etape("j1-2", "11:00"), reserver("j1-3", "15:00")]), jour(2, [reserver("j2-1", "10:00")]), jour(3, []));
    const lignesV1: LigneAFaire[] = [
      ...lignesDuProgramme(v1).map((l, rang) => ({ id: identifiantLigneAFaire(RUN, rang), ...l })),
      { id: identifiantLigneAFaire(RUN, 3), stopId: null, kind: "other" as const, done: false, label: "[Bon plan]" },
    ].map((l) => (l.stopId === "j1-3" ? { ...l, done: true } : l));
    expect(reservationsParEtape(lignesV1)).toEqual(new Map([["j1-1", 1], ["j1-3", 1], ["j2-1", 1]]));

    // Version du voyage complet : garde j1-1, déplace j1-3 (autre jour, autre heure) et j2-1 (autre heure), ajoute deux
    // étapes à réserver nouvelles et une ordinaire, et réutilise l'identifiant `j3-1` pour un lieu nouveau.
    const complet = instantane(
      jour(1, [reserver("j1-1", "09:00"), etape("j1-2", "11:00")]),
      jour(2, [reserver("j2-1", "14:00"), reserver("j2-2", "16:00")]),
      jour(3, [reserver("j1-3", "10:00"), reserver("j3-1", "12:00"), etape("j3-2", "15:00")]),
    );
    const suite = lignesApresVersion(lignesV1, v1, complet);
    expect(suite.retirer).toEqual([]);
    expect(suite.delier).toEqual([]);
    expect(suite.ajouter.map((l) => l.stopId)).toEqual(["j2-2", "j3-1"]);
    const apres = appliquer(lignesV1, suite, DEMANDE);
    // Une ligne `reservation` par étape `toReserve` de la version, ni plus ni moins ; la ligne cochée reste cochée.
    const aReserver = etapesDansLOrdre(complet).flatMap(({ stop }) => (stop.exceptions.includes("toReserve") ? [stop.id] : []));
    expect(reservationsParEtape(apres)).toEqual(new Map(aReserver.map((id) => [id, 1])));
    expect(apres.find((l) => l.stopId === "j1-3")?.done).toBe(true);
    expect(sansOrpheline(apres, complet)).toBe(true);
    // Rejouée sur ses propres lignes (même version), la fonction n'ajoute rien de plus.
    expect(lignesApresVersion(apres, v1, complet).ajouter).toEqual([]);
    expect(lignesApresVersion(apres, complet, complet)).toEqual({ retirer: [], delier: [], ajouter: [], changements: [] });
  });

  it("a-faire: une retouche met la liste à jour : remplacement d'une étape toReserve (ligne non faite retirée, ligne faite déliée, ligne nouvelle)", () => {
    const avant = instantane(jour(1, [reserver("j1-1", "09:00"), reserver("j1-2", "11:00")]));
    const lignes = [ligne(1, "j1-1"), ligne(2, "j1-2", { done: true, kind: "ticket", label: "[Billets]" }), ligne(3, null, { kind: "other" })];
    // Remplacement : j1-1 devient « remplacement-v1-… » (étape nouvelle à réserver), j1-2 est remplacée par une étape ordinaire.
    const apres = instantane(jour(1, [reserver("remplacement-v1-aaaa", "09:00"), etape("remplacement-v1-bbbb", "11:00")]));
    const suite = lignesApresVersion(lignes, avant, apres);
    expect(suite.retirer).toEqual([ligne(1, "j1-1").id]);
    expect(suite.delier).toEqual([ligne(2, "j1-2").id]);
    expect(suite.ajouter).toEqual([{ stopId: "remplacement-v1-aaaa", kind: "reservation", label: "[Nom remplacement-v1-aaaa]", done: false }]);
    expect(suite.changements).toEqual([
      { type: "checklist", action: "removed", label: "[Nom j1-1]" },
      { type: "checklist", action: "added", label: "[Nom remplacement-v1-aaaa]" },
    ]);
    const nouvelles = appliquer(lignes, suite, DEMANDE);
    // Aucune ligne faite n'est retirée ni décochée ; jamais de ligne orpheline.
    expect(nouvelles.find((l) => l.id === ligne(2, "j1-2").id)).toMatchObject({ done: true, stopId: null });
    expect(sansOrpheline(nouvelles, apres)).toBe(true);
  });

  it("a-faire: identifiant réutilisé pour un autre lieu ou un autre nom : l'ancienne étape est absente (0147 § 5.2 point 1)", () => {
    const avant = instantane(jour(1, [reserver("j1-1", "09:00")]));
    for (const autre of [reserver("j1-1", "09:00", { placeId: "test_place_autre" }), reserver("j1-1", "09:00", { name: "[Autre nom]" })]) {
      const suite = lignesApresVersion([ligne(1, "j1-1")], avant, instantane(jour(1, [autre])));
      expect(suite.retirer).toEqual([ligne(1, "j1-1").id]);
      expect(suite.ajouter).toEqual([{ stopId: "j1-1", kind: "reservation", label: autre.name, done: false }]);
    }
  });

  it("a-faire: étape déplacée, verrouillée ou d'heure changée : rien ; étape ordinaire nouvelle : rien", () => {
    const avant = instantane(jour(1, [reserver("j1-1", "09:00")]), jour(2, []));
    const apres = instantane(jour(1, [etape("j1-9", "10:00")]), jour(2, [reserver("j1-1", "15:00", { locked: true })]));
    expect(lignesApresVersion([ligne(1, "j1-1")], avant, apres)).toEqual({ retirer: [], delier: [], ajouter: [], changements: [] });
  });

  it("a-faire: retour à une version (revert) : les lignes suivent comme pour toute version", () => {
    const v1 = instantane(jour(1, [reserver("j1-1", "09:00")]));
    const v2 = instantane(jour(1, [reserver("remplacement-v1-aaaa", "09:00")]));
    const apresV2 = appliquer([ligne(1, "j1-1")], lignesApresVersion([ligne(1, "j1-1")], v1, v2), DEMANDE);
    const retour = lignesApresVersion(apresV2, v2, v1);
    expect(retour.retirer).toEqual([identifiantLigneAFaire(DEMANDE, 0)]);
    expect(retour.ajouter.map((l) => l.stopId)).toEqual(["j1-1"]);
    expect(reservationsParEtape(appliquer(apresV2, retour, RUN))).toEqual(new Map([["j1-1", 1]]));
  });

  it("a-faire: une ligne liée à une étape absente de la version de départ reste tant que l'identifiant existe", () => {
    const avant = instantane(jour(1, []));
    const apres = instantane(jour(1, [etape("j1-1", "09:00")]));
    expect(lignesApresVersion([ligne(1, "j1-1"), ligne(2, "j1-x")], avant, apres).retirer).toEqual([ligne(2, "j1-x").id]);
  });
});

describe("a-faire : ordre de lecture (0147 § 7.1 point 3)", () => {
  it("a-faire: lignes liées par la position de leur étape (jour, heure), puis lignes sans étape par identifiant", () => {
    const v = instantane(jour(1, [etape("j1-1", "09:00"), etape("j1-2", "14:00")], [etape("j1-c1", "12:00", { kind: "event" })]), jour(2, [etape("j2-1", "10:00")]));
    const lignes = [
      { id: "a", stopId: "j2-1" },
      { id: "b" },
      { id: "c", stopId: "j1-2" },
      { id: "0", stopId: null },
      { id: "d", stopId: "j1-c1" },
      { id: "e", stopId: "j1-1" },
      { id: "f", stopId: "j1-1" },
    ];
    expect(ordreDeLecture(lignes, v).map((l) => l.id)).toEqual(["e", "f", "d", "c", "a", "0", "b"]);
  });
});
