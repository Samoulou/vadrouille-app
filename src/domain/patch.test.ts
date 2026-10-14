// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  ApiErrorSchema,
  PatchResultSchema,
  TripSnapshotSchema,
  type DaySnapshot,
  type Pace,
  type StopSnapshot,
  type TripCommitment,
  type TripPatch,
  type TripPatchOperation,
  type TripSnapshot,
} from "@/contracts";

import type { ConfigClassement } from "@/domain/classement";
import type { ConfigurationMoteur } from "@/domain/configuration";
import type { CandidatMoteur, EtatChoix, Nuit } from "@/domain/entrees";
import { generer } from "@/domain/generation";
import { appliquerPatch, type EntreePatch, type ResultatPatch } from "@/domain/patch";
import { INCONNU, memePoint, type ModeTrajet, type Plage, type Point, type Relectures } from "@/domain/relectures";
import { versMinutes } from "@/domain/temps";
import { estBloquante } from "@/domain/validation";
import { erreurDeVersion, REFUS_MOTEUR, type CodeRefus } from "@/domain/version";

/**
 * Moteur sans IA, sous-tâche B5c (décision 0041) : patches, versions et annulation. Jeux fabriqués ici ; doubles des
 * interfaces à valeurs sentinelles (durées 37, 41 et 12 min, plage 547–1433, `placeId` `SENTINELLE_PLACE_*`),
 * jamais tirés d'une réponse réelle. Les identifiants de candidat sont opaques pour le moteur (0045 § 5.2).
 */

const CONFIG: ConfigurationMoteur = {
  schema: 1,
  budgetTrajetParRythme: { relaxed: 60, balanced: 90, intense: 150 },
  activitesParRythme: { relaxed: 2, balanced: 3, intense: 4 },
  tempsLibreMinParRythme: { relaxed: 120, balanced: 60, intense: 30 },
  fenetreJour: { debut: "09:00", fin: "23:00" },
  repas: { lunch: { auPlusTot: "12:00", auPlusTard: "14:00" }, dinner: { auPlusTot: "18:30", auPlusTard: "20:45" } },
  debutSoiree: "20:30",
  dureesParDefaut: { activity: 90, lunch: 75, dinner: 90, evening: 90 },
  margeMinutes: 5,
  seuilTempsLibreMinutes: 30,
};

const FORMULE: ConfigClassement = {
  schema: 1,
  poids: { matchesWishes: 30, mustSee: 25, notForMeRisk: 4, source: { officielle: 4, independante: 6, generique: -8 }, sourceAncienne: 6 },
  matchesWishesNon: "penaliser",
  penaliteHorsEnvies: 20,
  prioriteMustSee: "avant",
  coutTrajetParMinute: { activity: 0.1, meal: 1, evening: 1, surprise: 2 },
};

const SENTINELLES = { marche: 41, transports: 37, proche: 12, plage: { debut: 547, fin: 1433 } satisfies Plage };
const place = (id: string) => `SENTINELLE_PLACE_${id.toUpperCase()}`;

/** Doubles : 41 min à pied, 37 en transports, 12 vers ou depuis le lieu « proche » ; `appels` compte chaque appel. */
function relectures(appels = { nombre: 0 }, transportsEstimes = false): Relectures {
  return {
    validite(placeId) {
      appels.nombre += 1;
      return placeId === place("ferme") ? "ferme_definitivement" : "valide";
    },
    plages() {
      appels.nombre += 1;
      return [SENTINELLES.plage];
    },
    duree(depuis: Point, vers: Point, mode: ModeTrajet) {
      appels.nombre += 1;
      const mesure = (minutes: number) => ({ minutes, estimee: false });
      if (memePoint(depuis, vers)) return mesure(0);
      const lieux = [depuis, vers].flatMap((point) => ("lieu" in point ? [point.lieu] : []));
      if (lieux.includes(place("proche"))) return mesure(SENTINELLES.proche);
      if (mode === "walk") return mesure(SENTINELLES.marche);
      if (mode === "transit") return { minutes: SENTINELLES.transports, estimee: transportsEstimes };
      return INCONNU;
    },
  };
}

function candidat(id: string, typeEtape: CandidatMoteur["typeEtape"], extra: Partial<CandidatMoteur> = {}): CandidatMoteur {
  return {
    id,
    nom: `Lieu maison ${id}`,
    resume: `Résumé maison ${id}.`,
    categorie: typeEtape === "meal" ? "restaurant" : "museum",
    typeEtape,
    faits: { costPerPerson: 10 },
    sources: [{ url: `https://guide.example/${id}`, date: "2026-10-01", classe: "independante" }],
    notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: typeEtape === "meal" ? ["meal"] : ["activity"] },
    placeId: place(id),
    aReserver: false,
    ...extra,
  };
}

const ACTIVITES = ["a1", "a2", "a3", "a4", "a5", "a6", "a7", "a8", "a9"].map((id) => candidat(id, "activity"));
const REPAS = ["m1", "m2", "m3", "m4", "m5", "m6"].map((id) => candidat(id, "meal"));
const SOIREES = ["s1", "s2"].map((id) =>
  candidat(id, "activity", { notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: ["evening"] } }),
);
/** Candidats de la réserve gardés pour un `replace` : jamais retenus par la génération (aucun créneau admis). */
const RESERVE = {
  proche: candidat("proche", "activity", { faits: { costPerPerson: 25, durationMinutes: 60 }, notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: [] } }),
  autre: candidat("autre", "activity", { faits: { costPerPerson: 10, durationMinutes: 60 }, notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: [] } }),
  /** Lieu « fermé définitivement » pour le double `validite` : un `replace` vers lui crée une entrée bloquante. */
  ferme: candidat("ferme", "activity", { faits: { costPerPerson: 10, durationMinutes: 60 }, notes: { matchesWishes: true, notForMeRisk: 1, mustSee: false, slotFit: [] } }),
};
const TOUS_CHOISIS = new Map<string, EtatChoix>([...REPAS, ...SOIREES].map((c) => [c.id, "choisi"]));

const VOLS: TripCommitment[] = [
  { kind: "flight", label: "Arrivée", date: "2026-11-23", start: "08:10", end: "11:40" },
  { kind: "flight", label: "Départ", date: "2026-11-25", start: "17:00" },
];
const BILLET: TripCommitment = { kind: "ticket", label: "Billet du château", date: "2026-11-24", start: "16:00", end: "17:00" };
const NUITS: Nuit[] = [
  { etiquette: "Logement de test", placeId: "SENTINELLE_PLACE_LOGEMENT" },
  { etiquette: "Logement de test", placeId: "SENTINELLE_PLACE_LOGEMENT" },
];

function moteur(pace: Pace = "relaxed"): EntreePatch["moteur"] {
  return {
    voyage: { destination: "Édimbourg", start: "2026-11-23", end: "2026-11-25", timeZone: "Europe/London", travellers: { adults: 2, children: 0 } },
    brief: { travellers: { adults: 2, children: 0 }, pace, wishes: ["museum"], limits: [], mobility: ["walk", "transit"], inferredFields: [] },
    nuits: NUITS,
    engagements: [...VOLS, BILLET],
    candidats: [...ACTIVITES, ...REPAS, ...SOIREES, RESERVE.proche, RESERVE.autre, RESERVE.ferme],
    evenements: [],
    idees: [],
    choix: TOUS_CHOISIS,
    configuration: CONFIG,
    classement: { formule: FORMULE, ageSourceMaxJours: 365 },
    relectures: relectures(),
    dateReference: "2026-10-13",
    budgetTrajetReduit: false,
  };
}

/** Version 2 générée par le moteur (B5b) : base des patches. */
function version2(pace: Pace = "relaxed"): TripSnapshot {
  const resultat = generer({ ...moteur(pace), version: 2 });
  if (!resultat.ok) throw new Error(`génération refusée : ${resultat.code}`);
  return resultat.instantane;
}

const REQUETE = "6f1c2d3e-4b5a-4c7d-8e9f-0a1b2c3d4e5f";

function patch(baseVersion: number, operations: TripPatchOperation[]): TripPatch {
  return { requestId: REQUETE, baseVersion, operations };
}

function entree(base: TripSnapshot, p: TripPatch, modif: Partial<EntreePatch> = {}): EntreePatch {
  return { moteur: moteur(), patch: p, versionCourante: p.baseVersion, base, ...modif };
}

function reussi(resultat: ResultatPatch) {
  if (!resultat.ok) throw new Error(`patch refusé : ${resultat.code}`);
  return resultat;
}

const etapes = (jour: DaySnapshot): StopSnapshot[] => jour.items.flatMap((item) => (item.type === "stop" ? [item.stop] : []));
const jourN = (instantane: TripSnapshot, index: number): DaySnapshot => {
  const jour = instantane.days.find((d) => d.index === index);
  if (jour === undefined) throw new Error(`jour ${index} absent`);
  return jour;
};
const etape = (instantane: TripSnapshot, predicat: (stop: StopSnapshot) => boolean): StopSnapshot => {
  const trouvee = instantane.days.flatMap(etapes).find(predicat);
  if (trouvee === undefined) throw new Error("étape absente");
  return trouvee;
};
/** Première activité de jour (ni engagement ni soirée) d'un jour. */
const activiteDuJour = (instantane: TripSnapshot, index: number, rang = 0): StopSnapshot => {
  const trouvee = etapes(jourN(instantane, index)).filter(
    (stop) => stop.kind === "activity" && stop.commitment === undefined && versMinutes(stop.start) < versMinutes(CONFIG.debutSoiree),
  )[rang];
  if (trouvee === undefined) throw new Error("activité absente");
  return trouvee;
};
const billet = (instantane: TripSnapshot) => etape(instantane, (stop) => stop.commitment === "ticket");

describe("versions: une révision obsolète est refusée explicitement", () => {
  it("baseVersion 3 sur une version courante 4 : refus sans calcul, ApiError version_conflict, puis rejoué sur 4", () => {
    const base = version2();
    const appels = { nombre: 0 };
    const cible = activiteDuJour(base, 2);
    const operations: TripPatchOperation[] = [{ op: "replace", stopId: cible.id, candidateId: RESERVE.proche.id, newStopId: "v5-remplace" }];
    const contexte = { ...entree(base, patch(3, operations)).moteur, relectures: relectures(appels) };

    const obsolete = appliquerPatch({ moteur: contexte, patch: patch(3, operations), versionCourante: 4, base });
    expect(obsolete).toEqual({ ok: false, code: "version_conflict", currentVersion: 4 });
    expect(appels.nombre).toBe(0);
    if (obsolete.ok || obsolete.code !== "version_conflict") throw new Error("refus attendu");
    const erreur = erreurDeVersion(obsolete);
    expect(ApiErrorSchema.parse(erreur)).toEqual({ code: "version_conflict", retryable: true, currentVersion: 4 });

    const rejoue = reussi(appliquerPatch({ moteur: contexte, patch: patch(4, operations), versionCourante: 4, base }));
    expect(rejoue.resultat.version).toBe(5);
    expect(etape(rejoue.instantane, (stop) => stop.id === "v5-remplace").name).toBe(RESERVE.proche.nom);
  });
});

describe("versions: annuler crée une version identique", () => {
  it("replace → version 3, puis revert vers 2 → version 4 égale à la version 2 ; rien n'est supprimé ni modifié", () => {
    const v2 = version2();
    const gelee2 = structuredClone(v2);
    const cible = activiteDuJour(v2, 2);
    const v3 = reussi(
      appliquerPatch(entree(v2, patch(2, [{ op: "replace", stopId: cible.id, candidateId: RESERVE.proche.id, newStopId: "v3-remplace" }]))),
    );
    expect(v3.resultat.version).toBe(3);
    const gelee3 = structuredClone(v3.instantane);

    const historique = new Map([[2, v2]]);
    const v4 = reussi(appliquerPatch(entree(v3.instantane, patch(3, [{ op: "revert", toVersion: 2 }]), { versionsAnterieures: historique })));
    expect(v4.resultat.version).toBe(4);
    expect(v4.instantane).toEqual(v2);
    expect(v4.instantane).not.toBe(v2);
    expect(TripSnapshotSchema.parse(v4.instantane)).toEqual(v2);
    expect(v4.resultat.touchedDays).toEqual([2]);
    expect(PatchResultSchema.parse(v4.resultat)).toEqual(v4.resultat);
    // Aucune version supprimée ni modifiée.
    expect(v2).toEqual(gelee2);
    expect(v3.instantane).toEqual(gelee3);
    expect([...historique.keys()]).toEqual([2]);
  });
});

describe("moteur: une étape verrouillée est conservée", () => {
  it("replace ou move d'une étape verrouillée (engagement verrouillé compris) est refusé", () => {
    const base = version2();
    const ticket = billet(base);
    expect(ticket.locked).toBe(true);
    const activite = activiteDuJour(base, 2);
    const cas: TripPatchOperation[][] = [
      [{ op: "replace", stopId: ticket.id, candidateId: RESERVE.proche.id, newStopId: "n1" }],
      [{ op: "move", stopId: ticket.id, day: 3, time: "10:00" }],
      [{ op: "lock", stopId: activite.id }, { op: "replace", stopId: activite.id, candidateId: RESERVE.proche.id, newStopId: "n1" }],
      [{ op: "lock", stopId: activite.id }, { op: "move", stopId: activite.id, day: 3, time: "10:00" }],
    ];
    for (const operations of cas) expect(appliquerPatch(entree(base, patch(2, operations)))).toEqual({ ok: false, code: "locked_stop" });
  });

  it("add ou move d'une autre étape ne déplace jamais une étape verrouillée", () => {
    const base = version2();
    const ticket = billet(base);
    const activite = activiteDuJour(base, 2);
    const verrouillee = reussi(appliquerPatch(entree(base, patch(2, [{ op: "lock", stopId: activite.id }])))).instantane;
    for (const operations of [
      [{ op: "add", stopId: "ajout-1", kind: "activity", day: 2, time: "14:00", name: "Atelier saisi" }],
      [{ op: "move", stopId: activiteDuJour(verrouillee, 3).id, day: 2, time: "14:00" }],
    ] satisfies TripPatchOperation[][]) {
      const resultat = reussi(appliquerPatch(entree(verrouillee, patch(3, operations), { versionCourante: 3 })));
      expect(resultat.resultat.touchedDays).toContain(2);
      expect(billet(resultat.instantane)).toEqual(ticket);
      expect(etape(resultat.instantane, (stop) => stop.id === activite.id)).toEqual({ ...activite, locked: true });
      expect(resultat.rapport.filter((e) => e.regle === "R3")).toEqual([]);
    }
  });

  it("après unlock d'un engagement, un move de cet engagement est accepté (même patch ou patch suivant)", () => {
    const base = version2();
    const ticket = billet(base);
    const deplacement: TripPatchOperation = { op: "move", stopId: ticket.id, day: 2, time: "15:00" };
    const memePatch = reussi(appliquerPatch(entree(base, patch(2, [{ op: "unlock", stopId: ticket.id }, deplacement]))));
    expect(billet(memePatch.instantane)).toMatchObject({ start: "15:00", end: "16:00", locked: false, commitment: "ticket" });

    const deverrouille = reussi(appliquerPatch(entree(base, patch(2, [{ op: "unlock", stopId: ticket.id }])))).instantane;
    const suivant = reussi(appliquerPatch(entree(deverrouille, patch(3, [deplacement]))));
    expect(billet(suivant.instantane)).toMatchObject({ start: "15:00", locked: false, commitment: "ticket" });
    expect(suivant.instantane).toEqual(memePatch.instantane);
  });
});

describe("patch: tout ou rien", () => {
  it("un patch dont la deuxième opération est refusée ne change rien", () => {
    const base = version2();
    const gelee = structuredClone(base);
    const activite = activiteDuJour(base, 2);
    const resultat = appliquerPatch(
      entree(base, patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.proche.id, newStopId: "n1" }, { op: "unlock", stopId: activite.id }])),
    );
    expect(resultat).toEqual({ ok: false, code: "unknown_stop" });
    expect(base).toEqual(gelee);
    expect(Object.keys(resultat)).toEqual(["ok", "code"]);
  });

  it("une première opération valide puis une deuxième refusée (locked_stop, out_of_trip) : refus seul, base intacte", () => {
    const base = version2();
    const gelee = structuredClone(base);
    const premiere: TripPatchOperation = { op: "replace", stopId: activiteDuJour(base, 2).id, candidateId: RESERVE.proche.id, newStopId: "n1" };
    for (const [code, seconde] of [
      ["locked_stop", { op: "move", stopId: billet(base).id, day: 3, time: "10:00" }],
      ["out_of_trip", { op: "add", stopId: "n2", kind: "activity", day: 4, time: "10:00", name: "Hors séjour" }],
    ] satisfies [CodeRefus, TripPatchOperation][]) {
      expect(appliquerPatch(entree(base, patch(2, [seconde])))).toEqual({ ok: false, code });
      const resultat = appliquerPatch(entree(base, patch(2, [premiere, seconde])));
      expect(resultat).toEqual({ ok: false, code });
      expect(Object.keys(resultat)).toEqual(["ok", "code"]);
    }
    expect(base).toEqual(gelee);
  });
});

describe("patch: rejoué tel quel, même résultat", () => {
  it("deux applications du même patch à la même version donnent le même instantané et le même résultat", () => {
    const base = version2();
    const activite = activiteDuJour(base, 2);
    const p = patch(2, [
      { op: "replace", stopId: activite.id, candidateId: RESERVE.proche.id, newStopId: "srv-1" },
      { op: "add", stopId: "srv-2", kind: "activity", day: 2, time: "14:00", name: "Atelier saisi" },
    ]);
    const premiere = reussi(appliquerPatch(entree(base, p)));
    const seconde = reussi(appliquerPatch(entree(base, p)));
    expect(JSON.stringify(seconde.instantane)).toBe(JSON.stringify(premiere.instantane));
    expect(seconde.resultat).toEqual(premiere.resultat);
    expect(etape(premiere.instantane, (stop) => stop.id === "srv-2")).toMatchObject({ name: "Atelier saisi", start: "14:00", end: "15:30", facts: {} });
  });
});

describe("patch: PatchResult", () => {
  it("version, jours touchés croissants et distincts, changements selon B5-PO-15, PatchResultSchema", () => {
    const base = version2();
    const activite = activiteDuJour(base, 3);
    const { resultat, instantane } = reussi(
      appliquerPatch(entree(base, patch(2, [{ op: "move", stopId: activite.id, day: 2, time: "14:00" }]))),
    );
    expect(resultat.version).toBe(3);
    expect(resultat.touchedDays).toEqual([2, 3]);
    expect(PatchResultSchema.parse(resultat)).toEqual(resultat);
    expect(resultat.changes.at(0)).toEqual({
      type: "moved",
      label: activite.name,
      before: { day: 3, time: activite.start },
      after: { day: 2, time: "14:00" },
    });
    // `unchanged` pour chaque étape des jours touchés qui garde lieu et heure, verrouillées comprises (F7-PO-6).
    const gardees = [2, 3].flatMap((index) =>
      etapes(jourN(instantane, index)).filter((stop) => {
        const avant = etapes(jourN(base, index)).find((s) => s.id === stop.id);
        return avant !== undefined && avant.start === stop.start && avant.placeId === stop.placeId;
      }),
    );
    expect(gardees.some((stop) => stop.locked)).toBe(true);
    const unchanged = resultat.changes.filter((c) => c.type === "unchanged");
    expect(unchanged).toEqual(gardees.map((stop) => ({ type: "unchanged", label: stop.name, time: stop.start })));
    // Budget (B5-PO-10) : le J3 perd l'étape déplacée (30 → 20) ; le J2 a un engagement sans coût, donc aucun budget.
    expect(resultat.changes.filter((c) => c.type === "budget")).toEqual([{ type: "budget", deltaPerPerson: -10 }]);
  });

  for (const pace of ["relaxed", "balanced", "intense"] satisfies Pace[]) {
    it(`lock (${pace}) : chaque étape non verrouillée de chaque jour ; jour identique au drapeau près, toutes ses étapes « unchanged »`, () => {
      const base = version2(pace);
      let verifiees = 0;
      for (const jourBase of base.days) {
        for (const cible of etapes(jourBase).filter((stop) => !stop.locked)) {
          const { instantane, resultat } = reussi(appliquerPatch({ ...entree(base, patch(2, [{ op: "lock", stopId: cible.id }])), moteur: moteur(pace) }));
          const attendu = structuredClone(base);
          const jour = jourN(attendu, jourBase.index);
          jour.items = jour.items.map((item) => (item.type === "stop" && item.stop.id === cible.id ? { ...item, stop: { ...item.stop, locked: true } } : item));
          expect(instantane, `${pace}, jour ${jourBase.index}, ${cible.id}`).toEqual(attendu);
          expect(resultat.touchedDays).toEqual([jourBase.index]);
          expect(resultat.changes).toEqual(etapes(jourBase).map((stop) => ({ type: "unchanged", label: stop.name, time: stop.start })));
          verifiees += 1;
        }
      }
      // Chaque jour a au moins une étape non verrouillée : le test n'est jamais vide.
      expect(verifiees).toBeGreaterThanOrEqual(base.days.length);
    });
  }

  it("replace : Change[replaced] et Change[segment] pour le trajet dont la durée change", () => {
    const base = version2();
    const activite = activiteDuJour(base, 3);
    const { resultat } = reussi(
      appliquerPatch(entree(base, patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.proche.id, newStopId: "srv-9" }]))),
    );
    expect(resultat.touchedDays).toEqual([3]);
    expect(resultat.changes.at(0)).toEqual({ type: "replaced", time: activite.start, before: activite.name, after: RESERVE.proche.nom });
    expect(resultat.changes).toContainEqual({
      type: "segment",
      label: RESERVE.proche.nom,
      before: SENTINELLES.transports,
      after: SENTINELLES.proche,
      estimated: false,
    });
    expect(resultat.changes).toContainEqual({ type: "budget", deltaPerPerson: 15 });
  });
});

describe("patch: aucune durée dans ce qui est écrit", () => {
  it("le patch reçu reste tel quel ; l'instantané passe TripSnapshotSchema ; les durées ne sont que dans PatchResult", () => {
    const base = version2();
    const activite = activiteDuJour(base, 2);
    const p = patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.proche.id, newStopId: "srv-3" }]);
    const ecrit = JSON.stringify(p);
    const { instantane, resultat } = reussi(appliquerPatch(entree(base, p)));
    expect(JSON.stringify(p)).toBe(ecrit);
    expect(TripSnapshotSchema.parse(instantane)).toEqual(instantane);
    const texte = JSON.stringify(instantane);
    expect(texte).not.toContain('"minutes"');
    expect(texte).not.toContain("verifiedAt");
    expect(texte).not.toContain("toConfirm");
    expect(texte).not.toContain("travelMinutes");
    expect(resultat.changes.some((c) => c.type === "segment")).toBe(true);
  });
});

describe("patch: refus typés", () => {
  const cas: { nom: string; code: CodeRefus; operations: (base: TripSnapshot) => TripPatchOperation[]; modif?: Partial<EntreePatch> }[] = [
    { nom: "étape inconnue", code: "unknown_stop", operations: () => [{ op: "lock", stopId: "absente" }] },
    {
      nom: "candidat absent de la réserve",
      code: "unknown_candidate",
      operations: (base) => [{ op: "replace", stopId: activiteDuJour(base, 2).id, candidateId: "c_999", newStopId: "n1" }],
    },
    {
      nom: "jour hors séjour (add)",
      code: "out_of_trip",
      operations: () => [{ op: "add", stopId: "n1", kind: "activity", day: 4, time: "10:00", name: "Hors séjour" }],
    },
    { nom: "jour hors séjour (move)", code: "out_of_trip", operations: (base) => [{ op: "move", stopId: activiteDuJour(base, 2).id, day: 9, time: "10:00" }] },
    { nom: "étape verrouillée", code: "locked_stop", operations: (base) => [{ op: "move", stopId: billet(base).id, day: 2, time: "10:00" }] },
    { nom: "verrou sans effet (lock)", code: "no_effect", operations: (base) => [{ op: "lock", stopId: billet(base).id }] },
    { nom: "verrou sans effet (unlock)", code: "no_effect", operations: (base) => [{ op: "unlock", stopId: activiteDuJour(base, 2).id }] },
    { nom: "annulation invalide (version absente)", code: "invalid_revert", operations: () => [{ op: "revert", toVersion: 1 }] },
    {
      nom: "annulation invalide (pas seule)",
      code: "invalid_revert",
      operations: (base) => [{ op: "lock", stopId: activiteDuJour(base, 2).id }, { op: "revert", toVersion: 1 }],
      modif: { versionsAnterieures: new Map([[1, { days: [] }]]) },
    },
    {
      nom: "annulation invalide (toVersion égale à baseVersion)",
      code: "invalid_revert",
      operations: () => [{ op: "revert", toVersion: 2 }],
      modif: { versionsAnterieures: new Map([[2, { days: [] }]]) },
    },
    {
      nom: "annulation invalide (toVersion après baseVersion)",
      code: "invalid_revert",
      operations: () => [{ op: "revert", toVersion: 3 }],
      modif: { versionsAnterieures: new Map([[3, { days: [] }]]) },
    },
    {
      nom: "annulation invalide (toVersion 0)",
      code: "invalid_revert",
      operations: () => [{ op: "revert", toVersion: 0 }],
      modif: { versionsAnterieures: new Map([[0, { days: [] }]]) },
    },
    {
      nom: "annulation invalide (instantané de l'historique invalide)",
      code: "invalid_revert",
      operations: () => [{ op: "revert", toVersion: 1 }],
      modif: { versionsAnterieures: new Map([[1, { days: [{ index: 0 }] } as unknown as TripSnapshot]]) },
    },
  ];

  it("couvre chaque code de REFUS_MOTEUR", () => {
    const codes = new Set([...cas.map((c) => c.code), "version_conflict", "no_option"]);
    expect([...codes].sort()).toEqual([...REFUS_MOTEUR].sort());
  });

  for (const { nom, code, operations, modif } of cas) {
    it(`${nom} : ${code}, sans autre détail, rien produit`, () => {
      const base = version2();
      const gelee = structuredClone(base);
      const resultat = appliquerPatch(entree(base, patch(2, operations(base)), modif));
      expect(resultat).toEqual({ ok: false, code });
      expect(base).toEqual(gelee);
    });
  }
});

describe("patch: aucune option compatible", () => {
  it("add ou move vers un moment où le jour ne peut pas être replanifié : no_option, rien produit", () => {
    const base = version2();
    const gelee = structuredClone(base);
    const cas: TripPatchOperation[][] = [
      // Après la fin du jour de départ (vol à 17:00).
      [{ op: "add", stopId: "n1", kind: "activity", day: 3, time: "18:00", name: "Trop tard" }],
      // Pendant le billet verrouillé (16:00–17:00).
      [{ op: "move", stopId: activiteDuJour(base, 2).id, day: 2, time: "16:15" }],
      // Pas de place avant minuit.
      [{ op: "add", stopId: "n2", kind: "activity", day: 2, time: "23:00", name: "Trop tard" }],
      // Début du jour (09:00, au logement) : le trajet et la marge ne tiennent pas avant l'étape posée à 09:00.
      [{ op: "move", stopId: activiteDuJour(base, 3).id, day: 2, time: "09:00" }],
      [{ op: "move", stopId: activiteDuJour(base, 2).id, day: 3, time: "09:00" }],
      // Jour d'arrivée : 12:00 tombe avant la fin du vol d'arrivée et du transfert.
      [{ op: "move", stopId: activiteDuJour(base, 2).id, day: 1, time: "12:00" }],
    ];
    for (const operations of cas) expect(appliquerPatch(entree(base, patch(2, operations))), JSON.stringify(operations)).toEqual({ ok: false, code: "no_option" });
    expect(base).toEqual(gelee);
  });
});

describe("patch: entrée bloquante nouvelle (validation des jours touchés)", () => {
  it("replace par un candidat dont le lieu est fermé : entrée bloquante nouvelle, no_option, rien produit", () => {
    const base = version2();
    const gelee = structuredClone(base);
    const activite = activiteDuJour(base, 2);
    // Le même replace vers un lieu ouvert passe : seul le lieu fermé fait refuser.
    reussi(appliquerPatch(entree(base, patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.autre.id, newStopId: "n1" }]))));
    const resultat = appliquerPatch(entree(base, patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.ferme.id, newStopId: "n1" }])));
    expect(resultat).toEqual({ ok: false, code: "no_option" });
    expect(Object.keys(resultat)).toEqual(["ok", "code"]);
    expect(base).toEqual(gelee);
  });

  it("une entrée bloquante déjà présente dans la base ne fait pas refuser un patch sans rapport sur le même jour", () => {
    const base = version2();
    const ancienne = activiteDuJour(base, 2);
    const autre = etapes(jourN(base, 2)).find((stop) => !stop.locked && stop.id !== ancienne.id);
    if (autre === undefined) throw new Error("autre étape absente");
    // Base : le lieu d'une étape du J2 est désormais fermé (relecture d'ancrage postérieure à la version).
    const fermee = structuredClone(base);
    const jour = jourN(fermee, 2);
    jour.items = jour.items.map((item) => (item.type === "stop" && item.stop.id === ancienne.id ? { ...item, stop: { ...item.stop, placeId: place("ferme") } } : item));
    const gelee = structuredClone(fermee);

    const { instantane, resultat, rapport } = reussi(appliquerPatch(entree(fermee, patch(2, [{ op: "lock", stopId: autre.id }]))));
    expect(resultat.touchedDays).toEqual([2]);
    expect(etape(instantane, (stop) => stop.id === autre.id).locked).toBe(true);
    // L'entrée bloquante R1 du lieu fermé est toujours dans le rapport du jour touché : elle n'a pas été créée par ce
    // patch, qui n'est donc pas refusé (écart 1).
    const bloquantes = rapport.filter((e) => estBloquante(e, instantane.days));
    expect(bloquantes.length).toBeGreaterThan(0);
    expect(bloquantes).toContainEqual(expect.objectContaining({ regle: "R1", etape: ancienne.id }));
    expect(fermee).toEqual(gelee);
  });
});

describe("moteur: durée estimée reprise dans le trajet", () => {
  const segments = (instantane: TripSnapshot) =>
    instantane.days.flatMap((jour) => jour.items.flatMap((item) => (item.type === "segment" ? [item.segment] : [])));

  it("estimee du mode retenu → Segment.estimated ; choix du mode sur les minutes seules ; rien dans le rapport (0048 § 3)", () => {
    // Transports estimés (37 min) plus rapides que la marche mesurée (41 min) : les transports sont retenus.
    const estime = generer({ ...moteur(), relectures: relectures(undefined, true), version: 2 });
    if (!estime.ok) throw new Error(estime.code);
    const parMode = segments(estime.instantane);
    expect(parMode.filter((s) => s.mode === "transit").length).toBeGreaterThan(0);
    expect(parMode.every((s) => s.mode !== "transit" || s.estimated)).toBe(true);
    expect(parMode.every((s) => s.mode === "transit" || !s.estimated)).toBe(true);
    expect(JSON.stringify(estime.rapport)).not.toContain("estimee");
    expect(JSON.stringify(estime.instantane)).not.toContain("estimee");

    // Mesurés : aucun trajet estimé.
    expect(segments(version2()).every((s) => !s.estimated)).toBe(true);

    // Patch : la replanification reprend aussi `estimee`.
    const base = estime.instantane;
    const activite = activiteDuJour(base, 3);
    const contexte = { ...moteur(), relectures: relectures(undefined, true) };
    const p = patch(2, [{ op: "replace", stopId: activite.id, candidateId: RESERVE.autre.id, newStopId: "srv-e" }]);
    const { instantane, rapport } = reussi(appliquerPatch({ moteur: contexte, patch: p, versionCourante: 2, base }));
    expect(segments(instantane).filter((s) => s.mode === "transit").every((s) => s.estimated)).toBe(true);
    expect(JSON.stringify(rapport)).not.toContain("estimee");
  });
});
