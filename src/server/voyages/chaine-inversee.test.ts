import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import { TripSnapshotSchema, type DaySnapshot, type StopSnapshot } from "@/contracts";
import type { DemandeRelectures, Relectures, SourceRelectures } from "@/domain/relectures";
import { CHAINE_APERCU } from "@/server/config/generation";
import type { OrgTransaction } from "@/server/with-org";

import { chaineDeLecture, creerLectureVoyages, type DependancesLecture } from "./lecture";

/**
 * Lecture de `api` sous la chaîne inversée, sans base (M1a-3, PR 862 ; décision 0136 § 3.5, § 3.6 et § 4.2) : journées
 * servies avant le déblocage (J1 et les journées des cases de l'aperçu, même `retenir` qu'à l'écriture), badge « à confirmer »
 * d'une étape sans lieu, chaîne lue à l'appel. Transaction simulée qui rend les lignes de chaque requête (reconnue par sa
 * table) et note les paramètres ; les tests de base (`tests/db/chaine-inversee.test.ts`) font foi pour le SQL. Aucune donnée
 * Google : `placeId` sentinelles `test_place_…`, aucune coordonnée réelle.
 */

const ORG = "00000000-0000-4000-8000-0000000000a2";
const USER = "00000000-0000-4000-8000-0000000000b2";
const TRIP = "00000000-0000-4000-8000-0000000000c2";
const ctx: AdapterContext = { organizationId: ORG, userId: USER, role: "owner" };
const LOGEMENT = "test_place_logement_inversee";

const etape = (id: string, start: string, end: string, placeId: string | undefined, reason: string | undefined = `[Raison ${id}]`): StopSnapshot => ({
  id,
  kind: "activity",
  ...(placeId === undefined ? {} : { placeId }),
  name: `[Étape ${id}]`,
  start,
  end,
  ...(reason === undefined ? {} : { reason }),
  facts: { costPerPerson: 10 },
  exceptions: [],
  locked: false,
});

const journee = (index: number, date: string, etapes: readonly StopSnapshot[]): DaySnapshot => ({
  index,
  date,
  items: [
    { type: "terminus", role: "start", time: "09:00", label: "[Logement]" },
    ...etapes.flatMap((stop) => [{ type: "segment" as const, segment: { mode: "walk" as const, estimated: false } }, { type: "stop" as const, stop }]),
    { type: "segment", segment: { mode: "walk", estimated: false } },
    { type: "terminus", role: "end", time: "20:00", label: "[Logement]" },
  ],
  events: [],
  travelBudgetMinutes: 90,
});

/**
 * Trois journées : J1 (une étape ancrée et rédigée, une étape sans lieu), J2 (une étape ancrée), J3 (une étape ancrée, hors de
 * l'aperçu : `selectionApercu` ne lit que J1 et J2).
 */
const snapshot = TripSnapshotSchema.parse({
  days: [
    journee(1, "2028-03-01", [etape("a", "10:00", "11:00", "test_place_a"), etape("b", "12:00", "13:00", undefined)]),
    journee(2, "2028-03-02", [etape("c", "10:00", "11:00", "test_place_c")]),
    journee(3, "2028-03-03", [etape("d", "10:00", "11:00", "test_place_d")]),
  ],
});

/** Lignes « À faire » : J3 et étape `d` (hors aperçu), étape `a` et avant le départ (gardées). */
const A_FAIRE = [
  { id: "l1", kind: "other", label: "[Avant le départ]", moment: { type: "beforeDeparture" }, done: false, booking_url: null, sponsored: false, stop_id: null },
  { id: "l2", kind: "reservation", label: "[Pour l'étape a]", moment: { type: "beforeDeparture" }, done: false, booking_url: null, sponsored: false, stop_id: "a" },
  { id: "l3", kind: "other", label: "[Le jour 3]", moment: { type: "tripDay", day: 3 }, done: false, booking_url: null, sponsored: false, stop_id: null },
  { id: "l4", kind: "reservation", label: "[Pour l'étape d]", moment: { type: "beforeDeparture" }, done: false, booking_url: null, sponsored: false, stop_id: "d" },
];

/** Texte et paramètres d'une requête de `executeurSql`, parcourue par sa forme (comme `lecture.test.ts`). */
function requeteDe(requete: unknown): { texte: string; params: unknown[] } {
  const params: unknown[] = [];
  const visiter = (noeud: unknown): string => {
    if (typeof noeud !== "object" || noeud === null) throw new Error("requeteDe: forme inconnue");
    if ("queryChunks" in noeud && Array.isArray(noeud.queryChunks)) return noeud.queryChunks.map(visiter).join("");
    if ("encoder" in noeud) {
      params.push((noeud as { value?: unknown }).value);
      return "$?";
    }
    if ("value" in noeud && Array.isArray(noeud.value) && noeud.value.every((v) => typeof v === "string")) return noeud.value.join("");
    throw new Error("requeteDe: forme inconnue");
  };
  return { texte: visiter(requete), params };
}

/** Transaction simulée : `debloque` dit si le voyage porte `tripUnlocked` ; chaque requête est notée. */
function base(debloque: boolean) {
  const requetes: { texte: string; params: unknown[] }[] = [];
  const lignes = (texte: string, params: readonly unknown[]): Record<string, unknown>[] => {
    if (texte.startsWith("SET TRANSACTION")) return [];
    if (texte.includes("FROM public.trips")) {
      return [{ id: TRIP, destination: "Testville", start: "2028-03-01", end: "2028-03-03", adults: 2, children: 0, time_zone: "Europe/Zurich", current_version: 1 }];
    }
    if (texte.includes("trip_versions")) return [{ version: 1, snapshot, created_ms: Date.parse("2028-01-01T00:00:00Z") }];
    if (texte.includes("public.stays")) {
      return [{ place_id: LOGEMENT, from: "2028-03-01", to: "2028-03-03", kind: "lodging", lodging_kind: "known", city: "Testville", area_center_lat: null, area_center_lng: null }];
    }
    if (texte.includes("public.briefs")) return [{ mobility: "walk" }];
    if (texte.includes("generation_runs")) return [{ en_cours: false }];
    if (texte.includes("public.entitlements")) return [{ debloque }];
    if (texte.includes("public.checklist_items")) return A_FAIRE;
    if (texte.includes("public.place_coordinates")) {
      const demandes = Array.isArray(params[0]) ? (params[0] as unknown[]) : [];
      return [LOGEMENT, "test_place_a", "test_place_c", "test_place_d"].flatMap((place_id, rang) => (demandes.includes(place_id) ? [{ place_id, lat: 46 + rang / 100, lng: 6 }] : []));
    }
    return [];
  };
  const tx = {
    async execute(requete: unknown) {
      const lue = requeteDe(requete);
      requetes.push(lue);
      return { rows: lignes(lue.texte, lue.params) };
    },
  };
  const withOrg: NonNullable<DependancesLecture["withOrg"]> = async (_ctx, fn) => fn(tx as unknown as OrgTransaction);
  return { withOrg, requetes };
}

/** Port de relectures qui note chaque demande : lieux valides, plages ouvertes, 5 minutes par trajet. */
function source() {
  const demandes: DemandeRelectures[] = [];
  const relectures: Relectures = { validite: () => "valide", plages: () => [{ debut: 0, fin: 2880 }], duree: () => ({ minutes: 5, estimee: false }) };
  const port: SourceRelectures = {
    async pour(_voyage, demande) {
      demandes.push(demande);
      return { ok: true, relectures };
    },
  };
  return { port, demandes };
}

function lecture(chaine: "inversee" | "ancienne" | undefined, debloque: boolean) {
  const b = base(debloque);
  const s = source();
  const voyages = creerLectureVoyages({ relectures: s.port, withOrg: b.withOrg, ...(chaine === undefined ? {} : { chaine }) });
  return { voyages, requetes: b.requetes, demandes: s.demandes };
}

const lieuxDemandes = (demandes: readonly DemandeRelectures[]) => demandes.flatMap((d) => d.lieux.map((l) => l.placeId));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lecture de api : chaîne lue à l'appel (0136 § 4.2)", () => {
  it("composition de l'app (aucun withOrg injecté) : CHAINE_APERCU ; jeu de test sans chaîne : ancienne ; chaîne nommée : elle", () => {
    expect(CHAINE_APERCU).toBe("inversee");
    expect(chaineDeLecture({})).toBe(CHAINE_APERCU);
    expect(chaineDeLecture({ withOrg: base(false).withOrg })).toBe("ancienne");
    expect(chaineDeLecture({ withOrg: base(false).withOrg, chaine: "inversee" })).toBe("inversee");
    expect(chaineDeLecture({ chaine: "ancienne" })).toBe("ancienne");
  });
});

describe("lecture de api sous la chaîne inversée : journées servies avant le déblocage (0136 § 3.5)", () => {
  it("getTrip non débloqué : J1 et J2 (journées de l'aperçu), lignes « À faire » de ces journées ; J3 jamais relue", async () => {
    const { voyages, demandes } = lecture("inversee", false);
    const trip = await voyages.getTrip(ctx, TRIP);
    expect(trip?.unlocked).toBe(false);
    expect(trip?.days.map((d) => d.index)).toEqual([1, 2]);
    expect(trip?.checklist.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(lieuxDemandes(demandes)).not.toContain("test_place_d");
  });

  it("getTrip débloqué : tout ; ancienne chaîne (jeu de test sans chaîne) : tout, sans filtre", async () => {
    for (const { chaine, debloque } of [
      { chaine: "inversee" as const, debloque: true },
      { chaine: undefined, debloque: false },
    ]) {
      const { voyages } = lecture(chaine, debloque);
      const trip = await voyages.getTrip(ctx, TRIP);
      expect(trip?.days.map((d) => d.index)).toEqual([1, 2, 3]);
      expect(trip?.checklist.map((l) => l.id)).toEqual(["l1", "l2", "l3", "l4"]);
    }
  });

  it("getDay hors aperçu : null avant le déblocage, sans relecture ; servi après ; journée de l'aperçu servie", async () => {
    const avant = lecture("inversee", false);
    expect(await avant.voyages.getDay(ctx, TRIP, 3)).toBeNull();
    expect(avant.demandes).toEqual([]);
    expect((await avant.voyages.getDay(ctx, TRIP, 2))?.index).toBe(2);
    const apres = lecture("inversee", true);
    expect((await apres.voyages.getDay(ctx, TRIP, 3))?.index).toBe(3);
  });

  it("getDay sous l'ancienne chaîne : aucune lecture du déblocage, J3 servie", async () => {
    const { voyages, requetes } = lecture(undefined, false);
    expect((await voyages.getDay(ctx, TRIP, 3))?.index).toBe(3);
    expect(requetes.some((r) => r.texte.includes("public.entitlements"))).toBe(false);
  });

  it("getDayMap hors aperçu : null, aucune position lue ; après le déblocage : la carte", async () => {
    const avant = lecture("inversee", false);
    expect(await avant.voyages.getDayMap(ctx, TRIP, 3)).toBeNull();
    expect(avant.requetes.some((r) => r.texte.includes("place_coordinates"))).toBe(false);
    const apres = lecture("inversee", true);
    expect((await apres.voyages.getDayMap(ctx, TRIP, 3))?.dayIndex).toBe(3);
  });

  it("getTripMap non débloqué : cartes et positions des journées de l'aperçu seulement", async () => {
    const { voyages, requetes } = lecture("inversee", false);
    const cartes = await voyages.getTripMap(ctx, TRIP);
    expect(cartes.map((c) => c.dayIndex)).toEqual([1, 2]);
    const positions = requetes.filter((r) => r.texte.includes("place_coordinates"));
    expect(positions).toHaveLength(1);
    expect(JSON.stringify(positions[0]?.params)).not.toContain("test_place_d");
    const debloque = lecture("inversee", true);
    expect((await debloque.voyages.getTripMap(ctx, TRIP)).map((c) => c.dayIndex)).toEqual([1, 2, 3]);
  });
});

describe("lecture de api : badge « à confirmer » d'une étape sans lieu (0136 § 3.6)", () => {
  it("chaîne inversée : l'étape sans placeId porte toConfirm ; les étapes ancrées non ; ancienne chaîne : aucun badge", async () => {
    const etapesDuJ1 = async (chaine: "inversee" | undefined) => {
      const day = await lecture(chaine, false).voyages.getDay(ctx, TRIP, 1);
      return Object.fromEntries((day?.items ?? []).flatMap((ligne) => (ligne.type === "stop" ? [[ligne.stop.id, ligne.stop.exceptions]] : [])));
    };
    expect(await etapesDuJ1("inversee")).toEqual({ a: [], b: ["toConfirm"] });
    expect(await etapesDuJ1(undefined)).toEqual({ a: [], b: [] });
  });
});
