import { describe, expect, it } from "vitest";

import { TripPatchSchema, TripSnapshotSchema, type StopSnapshot, type TripSnapshot } from "@/contracts";
import type { CandidatMoteur } from "@/domain/entrees";
import { appliquerPatch } from "@/domain/patch";
import type { Relectures } from "@/domain/relectures";
import type { BaseDeRevision } from "@/server/voyages/lecture";

import {
  choisirRemplacement,
  DemandeApercuSchema,
  DemandeApplicationSchema,
  demandeDuRemplacement,
  entreeMoteurDeRevision,
  identifiantRemplacement,
  patchDuRemplacement,
  RELECTURES_INCONNUES,
  type ChoixRetenu,
  type ContexteVoyage,
  type PropositionDuVoyage,
} from "./remplacement";

/**
 * Remplacement d'une étape (tâche M1g, PR 869), sans base : choix de la proposition, patch `replace` (`candidateId` =
 * identifiant du candidat), instantané **calculé par le moteur** (`appliquerPatch`) et rejouable. Noms entre crochets et
 * `placeId` sentinelles (`test_place_…`) : aucune donnée Google.
 */

const etape = (id: string, kind: "activity" | "meal", start: string, extra: Partial<StopSnapshot> = {}): StopSnapshot => ({
  id,
  kind,
  placeId: `test_place_${id}`,
  name: `[Nom ${id}]`,
  start,
  facts: {},
  source: { label: "[Source]", url: `https://example.org/${id}` },
  exceptions: [],
  locked: false,
  ...extra,
});

const INSTANTANE: TripSnapshot = TripSnapshotSchema.parse({
  days: [
    {
      index: 1,
      date: "2027-05-01",
      travelBudgetMinutes: 90,
      events: [],
      items: [
        { type: "terminus", role: "start", time: "09:00", label: "[Hôtel]" },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: etape("musee", "activity", "09:30", { end: "11:30", facts: { durationMinutes: 120 } }) },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: etape("diner", "meal", "19:00", { end: "20:30", reason: "[Raison]" }) },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "stop", stop: etape("concert", "activity", "21:00", { end: "22:00", locked: true }) },
        { type: "segment", segment: { mode: "walk", estimated: false } },
        { type: "terminus", role: "end", time: "23:00", label: "[Hôtel]" },
      ],
    },
    { index: 2, date: "2027-05-02", travelBudgetMinutes: 90, events: [], items: [{ type: "stop", stop: etape("parc", "activity", "10:00") }] },
  ],
});

const ID_A = "aaaaaaaa-0000-4000-8000-000000000001";
const ID_B = "bbbbbbbb-0000-4000-8000-000000000002";
const ID_C = "cccccccc-0000-4000-8000-000000000003";
const DEMANDE = "dddddddd-0000-4000-8000-000000000004";

const candidat = (id: string, typeEtape: "activity" | "meal", placeId: string, faits: CandidatMoteur["faits"] = {}): CandidatMoteur => ({
  id,
  nom: `[Candidat ${id.slice(0, 1)}]`,
  resume: "[Résumé maison]",
  categorie: typeEtape === "meal" ? "restaurant" : "museum",
  typeEtape,
  faits,
  sources: [{ url: `https://example.org/candidat-${id.slice(0, 1)}`, date: "2027-04-01", classe: "generique" }],
  notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: [typeEtape] },
  placeId,
  aReserver: false,
});
const proposition = (c: CandidatMoteur, day = 1): PropositionDuVoyage => ({ proposalId: `p-${c.id}`, day, candidat: c });

const DEJA_LA = candidat(ID_A, "meal", "test_place_musee");
const ACTIVITE = candidat(ID_B, "activity", "test_place_galerie", { durationMinutes: 60 });
const REPAS = candidat(ID_C, "meal", "test_place_bistrot");

const choisir = (stopId: string, propositions: readonly PropositionDuVoyage[], options: { etapesAFaire?: Set<string>; candidateId?: string } = {}) =>
  choisirRemplacement({
    instantane: INSTANTANE,
    baseVersion: 1,
    stopId,
    propositions,
    etapesAFaire: options.etapesAFaire ?? new Set(),
    ...(options.candidateId ? { candidateId: options.candidateId } : {}),
  });

const retenu = (choix: ReturnType<typeof choisir>): ChoixRetenu => {
  if (!choix.ok) throw new Error(choix.refus);
  return choix;
};

/** Port de relectures de test : tous les lieux valides et ouverts, 10 minutes entre deux points quelconques. */
const RELECTURES: Relectures = {
  validite: () => "valide",
  plages: () => [{ debut: 0, fin: 2880 }],
  duree: (_depuis, _vers, mode) => ({ minutes: 10, estimee: mode !== "walk" }),
};

const BASE: BaseDeRevision = {
  tripId: "00000000-0000-4000-8000-000000000010",
  start: "2027-05-01",
  end: "2027-05-03",
  timeZone: "Europe/Zurich",
  version: 1,
  snapshot: INSTANTANE,
  chaine: [{ version: 1, snapshot: INSTANTANE, createdAtMs: 0 }],
  sejours: [],
  modes: ["walk"],
  nuits: 2,
};
const CONTEXTE: ContexteVoyage = {
  base: BASE,
  brief: { travellers: { adults: 2, children: 0 }, pace: "balanced", wishes: [], limits: [], mobility: ["walk"], inferredFields: [] },
  nuits: [{ etiquette: "[Hôtel]" }, { etiquette: "[Hôtel]" }],
  engagements: [],
  destination: "[Ville de test]",
  travellers: { adults: 2, children: 0 },
};

const appliquer = (choix: ChoixRetenu, relectures: Relectures = RELECTURES) =>
  appliquerPatch({
    moteur: entreeMoteurDeRevision(CONTEXTE, [choix.proposition.candidat], relectures),
    patch: patchDuRemplacement(DEMANDE, 1, choix),
    versionCourante: 1,
    base: INSTANTANE,
  });

describe("remplacement : choix de la proposition (PR 869)", () => {
  it("PR 869 : première proposition de même nature dont le lieu n'est pas au programme", () => {
    expect(retenu(choisir("diner", [proposition(DEJA_LA), proposition(ACTIVITE), proposition(REPAS)])).proposition.candidat.id).toBe(ID_C);
    expect(retenu(choisir("musee", [proposition(REPAS), proposition(ACTIVITE)])).proposition.candidat.id).toBe(ID_B);
  });

  it("PR 869 : le candidat de l'aperçu est revérifié à l'application (même identifiant, toujours compatible)", () => {
    expect(choisir("diner", [proposition(DEJA_LA), proposition(REPAS)], { candidateId: ID_C }).ok).toBe(true);
    expect(choisir("diner", [proposition(DEJA_LA), proposition(REPAS)], { candidateId: ID_A })).toEqual({ ok: false, refus: "no_option" });
    expect(choisir("diner", [proposition(DEJA_LA), proposition(REPAS)], { candidateId: ID_B })).toEqual({ ok: false, refus: "no_option" });
  });

  it("PR 869 : refus : étape inconnue, verrouillée, engagement, désignée par « À faire », aucune proposition compatible", () => {
    expect(choisir("inconnue", [proposition(REPAS)])).toEqual({ ok: false, refus: "unknown_stop" });
    expect(choisir("concert", [proposition(ACTIVITE)])).toEqual({ ok: false, refus: "locked_stop" });
    expect(choisir("diner", [proposition(REPAS)], { etapesAFaire: new Set(["diner"]) })).toEqual({ ok: false, refus: "no_option" });
    expect(choisir("diner", [proposition(DEJA_LA), proposition(ACTIVITE)])).toEqual({ ok: false, refus: "no_option" });
    const engagement = TripSnapshotSchema.parse({
      days: [{ ...INSTANTANE.days[0], items: [{ type: "stop", stop: etape("billet", "activity", "10:00", { commitment: "ticket" }) }] }],
    });
    expect(choisirRemplacement({ instantane: engagement, baseVersion: 1, stopId: "billet", propositions: [proposition(ACTIVITE)], etapesAFaire: new Set() })).toEqual({
      ok: false,
      refus: "no_option",
    });
  });

  it("PR 869 : identifiant de l'étape créée fixé par la version de base et le candidat", () => {
    expect(identifiantRemplacement(1, ID_C)).toBe("remplacement-v2-cccccccc");
    expect(identifiantRemplacement(4, ID_C)).toBe("remplacement-v5-cccccccc");
  });
});

describe("remplacement : patch et instantané du moteur (PR 869)", () => {
  it("PR 869 : le patch `replace` porte l'identifiant du candidat (`candidates.id`) et l'étape créée", () => {
    const choix = retenu(choisir("diner", [proposition(REPAS)]));
    expect(patchDuRemplacement(DEMANDE, 1, choix)).toEqual(
      TripPatchSchema.parse({
        requestId: DEMANDE,
        baseVersion: 1,
        operations: [{ op: "replace", stopId: "diner", candidateId: ID_C, newStopId: "remplacement-v2-cccccccc" }],
      }),
    );
  });

  it("PR 869 : l'instantané vient du moteur : durée du candidat (60 min) et non celle du créneau remplacé (120 min)", () => {
    const resultat = appliquer(retenu(choisir("musee", [proposition(ACTIVITE)])));
    if (!resultat.ok) throw new Error(resultat.code);
    const cree = resultat.instantane.days[0]?.items.flatMap((i) => (i.type === "stop" && i.stop.id === "remplacement-v2-bbbbbbbb" ? [i.stop] : []))[0];
    expect(cree).toMatchObject({ kind: "activity", placeId: "test_place_galerie", name: "[Candidat b]", locked: false });
    expect(cree?.facts.durationMinutes).toBe(60);
    expect(cree?.end).not.toBe("11:30");
    expect(cree?.commitment).toBeUndefined();
    expect(resultat.resultat.changes[0]).toMatchObject({ type: "replaced", before: "[Nom musee]", after: "[Candidat b]" });
    expect(resultat.resultat.touchedDays).toEqual([1]);
    // L'autre jour et l'étape verrouillée ne bougent pas ; l'instantané valide le contrat de stockage (aucune durée).
    expect(resultat.instantane.days[1]).toEqual(INSTANTANE.days[1]);
    const concert = resultat.instantane.days[0]?.items.find((i) => i.type === "stop" && i.stop.id === "concert");
    expect(concert).toEqual(INSTANTANE.days[0]?.items.find((i) => i.type === "stop" && i.stop.id === "concert"));
    expect(() => TripSnapshotSchema.parse(resultat.instantane)).not.toThrow();
  });

  it("PR 869 : le patch écrit se rejoue tel quel (même candidat, même instantané), et un candidat absent est refusé", () => {
    const choix = retenu(choisir("diner", [proposition(REPAS)]));
    const premier = appliquer(choix);
    expect(premier.ok).toBe(true);
    expect(appliquer(choix)).toEqual(premier);
    const sansCandidat = appliquerPatch({
      moteur: entreeMoteurDeRevision(CONTEXTE, [], RELECTURES),
      patch: patchDuRemplacement(DEMANDE, 1, choix),
      versionCourante: 1,
      base: INSTANTANE,
    });
    expect(sansCandidat).toEqual({ ok: false, code: "unknown_candidate" });
  });

  it("PR 869 : version de base dépassée : refus du moteur sans calcul", () => {
    const choix = retenu(choisir("diner", [proposition(REPAS)]));
    const resultat = appliquerPatch({
      moteur: entreeMoteurDeRevision(CONTEXTE, [choix.proposition.candidat], RELECTURES),
      patch: patchDuRemplacement(DEMANDE, 1, choix),
      versionCourante: 2,
      base: INSTANTANE,
    });
    expect(resultat).toMatchObject({ ok: false, code: "version_conflict", currentVersion: 2 });
  });

  it("PR 869 : la demande de relectures couvre le lieu du candidat et ses trajets voisins, et le jour de base", () => {
    const choix = retenu(choisir("diner", [proposition(REPAS)]));
    const demande = demandeDuRemplacement(BASE, choix);
    const lieux = demande.lieux.map((l) => l.placeId);
    expect(lieux).toContain("test_place_bistrot");
    expect(lieux).toContain("test_place_diner");
    expect(demande.trajets.some((t) => "lieu" in t.vers && t.vers.lieu === "test_place_bistrot")).toBe(true);
    expect(demande.trajets.some((t) => "lieu" in t.depuis && t.depuis.lieu === "test_place_bistrot")).toBe(true);
  });

  it("PR 869 : l'annulation recopie l'instantané de la version de base (`revert`), sans relecture", () => {
    const choix = retenu(choisir("diner", [proposition(REPAS)]));
    const remplace = appliquer(choix);
    if (!remplace.ok) throw new Error(remplace.code);
    const annule = appliquerPatch({
      moteur: entreeMoteurDeRevision(CONTEXTE, [], RELECTURES_INCONNUES),
      patch: TripPatchSchema.parse({ requestId: ID_A, baseVersion: 2, operations: [{ op: "revert", toVersion: 1 }] }),
      versionCourante: 2,
      base: remplace.instantane,
      versionsAnterieures: new Map([[1, INSTANTANE]]),
    });
    if (!annule.ok) throw new Error(annule.code);
    expect(annule.instantane).toEqual(INSTANTANE);
  });
});

describe("remplacement : entrées (PR 869)", () => {
  it("PR 869 : entrées strictes : un champ d'organisation est refusé, le souhait est borné, la version est un entier ≥ 0", () => {
    const base = { tripId: "t", stopId: "diner", reason: "notMyStyle", baseVersion: 1 };
    expect(DemandeApercuSchema.safeParse(base).success).toBe(true);
    expect(DemandeApercuSchema.safeParse({ ...base, baseVersion: 0 }).success).toBe(true);
    expect(DemandeApercuSchema.safeParse({ ...base, baseVersion: -1 }).success).toBe(false);
    expect(DemandeApercuSchema.safeParse({ ...base, organizationId: ID_A }).success).toBe(false);
    expect(DemandeApercuSchema.safeParse({ ...base, wish: "x".repeat(201) }).success).toBe(false);
    expect(DemandeApplicationSchema.safeParse({ tripId: "t", requestId: ID_A, stopId: "diner", candidateId: "pas-un-uuid", baseVersion: 1 }).success).toBe(false);
    expect(DemandeApplicationSchema.safeParse({ tripId: "t", requestId: ID_A, stopId: "diner", proposalId: ID_B, baseVersion: 1 }).success).toBe(false);
  });
});
