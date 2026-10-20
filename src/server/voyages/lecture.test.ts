import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiTripAdapter } from "@/adapters/api";
import type { AdapterContext } from "@/adapters/types";
import { TripSnapshotSchema, type DaySnapshot } from "@/contracts";
import type { Relectures, SourceRelectures, VoyageARelire } from "@/domain/relectures";
import type { OrgTransaction } from "@/server/with-org";

import { creerLectureVoyages, type DependancesLecture } from "./lecture";

/**
 * Cas d'usage de lecture sans base (revue du head 7402324 de la PR 473, bloquant 1 et mineur 8) : une transaction
 * simulée rend les lignes de chaque requête (reconnue par sa table) ; les tests de base (`tests/db/adaptateur-api.test.ts`)
 * font foi pour le SQL. Aucune donnée Google : `placeId` sentinelles `test_place_…`, aucune coordonnée.
 */

const ORG = "00000000-0000-4000-8000-0000000000a1";
const USER = "00000000-0000-4000-8000-0000000000b1";
const TRIP = "00000000-0000-4000-8000-0000000000c1";
const ctx: AdapterContext = { organizationId: ORG, userId: USER, role: "owner" };
const L1 = "test_place_logement_lecture";
const P0 = "test_place_etape_lecture";
const SECRET_SQL = 'relation "public.trips" does not exist at character 42 (organization_id = 00000000-0000-4000-8000-0000000000a1)';

const jour: DaySnapshot = {
  index: 1,
  date: "2028-03-01",
  items: [
    { type: "terminus", role: "start", time: "09:00", label: "[Hôtel de test]" },
    { type: "segment", segment: { mode: "walk", estimated: false } },
    { type: "stop", stop: { id: "e", kind: "activity", placeId: P0, name: "[Étape de test]", start: "10:00", end: "11:00", facts: { costPerPerson: 10 }, exceptions: [], locked: false } },
    { type: "segment", segment: { mode: "walk", estimated: false } },
    { type: "terminus", role: "end", time: "18:00", label: "[Hôtel de test]" },
  ],
  events: [],
  travelBudgetMinutes: 90,
};
const snapshot = TripSnapshotSchema.parse({ days: [jour] });

/**
 * Texte d'une requête de `executeurSql` sans importer drizzle (confinement des spécificateurs, CI de la PR 473) :
 * l'objet SQL est parcouru par sa forme (`queryChunks` imbriqués, morceaux de texte `value: string[]`, paramètres
 * reconnus à leur `encoder` et rendus `$?`). Une forme inconnue lève, pour qu'un changement interne échoue bruyamment au lieu de passer à vide.
 */
function texteSql(requete: unknown): string {
  if (typeof requete !== "object" || requete === null) throw new Error("texteSql: forme inconnue");
  if ("queryChunks" in requete && Array.isArray(requete.queryChunks)) return requete.queryChunks.map(texteSql).join("");
  if ("encoder" in requete) return "$?";
  if ("value" in requete && Array.isArray(requete.value) && requete.value.every((v) => typeof v === "string")) return requete.value.join("");
  throw new Error("texteSql: forme inconnue");
}

/** Lignes rendues par table interrogée ; `leve` : la requête de cette table échoue avec un message de base. */
function transaction(leve?: string) {
  const lignes = (texte: string): Record<string, unknown>[] => {
    if (texte.startsWith("SET TRANSACTION")) return [];
    if (texte.includes("FROM public.trips")) {
      return [{ id: TRIP, destination: "Testville", start: "2028-03-01", end: "2028-03-02", adults: 2, children: 0, time_zone: "Europe/Zurich", current_version: 1 }];
    }
    if (texte.includes("trip_versions")) return [{ version: 1, snapshot, created_ms: Date.parse("2028-01-01T00:00:00Z") }];
    if (texte.includes("public.stays")) {
      return [{ place_id: L1, from: "2028-03-01", to: "2028-03-02", kind: "lodging", lodging_kind: "known", city: "Testville", area_center_lat: null, area_center_lng: null }];
    }
    if (texte.includes("public.briefs")) return [{ mobility: "walk" }];
    if (texte.includes("generation_runs")) return [{ en_cours: false }];
    return [];
  };
  const tx = {
    async execute(requete: unknown) {
      const texte = texteSql(requete);
      if (leve !== undefined && texte.includes(leve)) throw new Error(SECRET_SQL);
      return { rows: lignes(texte) };
    },
  };
  const withOrg: NonNullable<DependancesLecture["withOrg"]> = async (_ctx, fn) => fn(tx as unknown as OrgTransaction);
  return withOrg;
}

/** Double du port : plages ouvertes, lieux valides, et la durée donnée pour tout trajet. */
const relectures = (minutes: number): SourceRelectures => ({
  async pour() {
    const r: Relectures = { validite: () => "valide", plages: () => [{ debut: 0, fin: 2880 }], duree: () => ({ minutes, estimee: false }) };
    return { ok: true, relectures: r };
  },
});

/** Source qui garde le voyage reçu (contexte, portée et séjours posés par le cas d'usage). */
function source(minutes = 5) {
  const recus: VoyageARelire[] = [];
  const double = relectures(minutes);
  const pour: SourceRelectures["pour"] = async (voyage, demande) => {
    recus.push(voyage);
    return double.pour(voyage, demande);
  };
  return { source: { pour } as SourceRelectures, recus };
}

function journal() {
  const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
  const avertissements = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  const lignes = () => [...erreurs.mock.calls, ...avertissements.mock.calls].map(([texte]) => JSON.parse(String(texte)) as Record<string, unknown>);
  return { lignes };
}

const raison = (reason: string) => expect.objectContaining({ name: "LectureVoyageError", reason, message: reason });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("lecture: sortie de getDay validée par DaySchema (bloquant 1)", () => {
  it("lecture: une durée valide rend le jour", async () => {
    const day = await createApiTripAdapter({ relectures: relectures(5), withOrg: transaction() }).getDay(ctx, TRIP, 1);
    expect(day?.items.flatMap((i) => (i.type === "segment" ? [i.segment.minutes] : []))).toEqual([5, 5]);
  });

  it.each([2.5, -5])("lecture: une durée relue invalide (%s) est output_invalid, journalisée, sans ZodError ni valeur", async (minutes) => {
    const { lignes } = journal();
    for (const lecture of [creerLectureVoyages({ relectures: relectures(minutes), withOrg: transaction() }), createApiTripAdapter({ relectures: relectures(minutes), withOrg: transaction() })]) {
      await expect(lecture.getDay(ctx, TRIP, 1)).rejects.toEqual(raison("output_invalid"));
    }
    expect(lignes()).toEqual([
      expect.objectContaining({ level: "error", event: "voyages.read_failed", reason: "output_invalid", tripId: TRIP, version: 1, dayIndex: 1 }),
      expect.objectContaining({ level: "error", event: "voyages.read_failed", reason: "output_invalid", tripId: TRIP, version: 1, dayIndex: 1 }),
    ]);
    const texte = JSON.stringify(lignes());
    for (const interdit of [P0, L1, String(minutes)]) expect(texte).not.toContain(interdit);
  });
});

describe("lecture: erreur de la base en erreur fermée (mineur 8)", () => {
  const lectures = {
    listTrips: (l: ReturnType<typeof creerLectureVoyages>) => l.listTrips(ctx),
    getTrip: (l: ReturnType<typeof creerLectureVoyages>) => l.getTrip(ctx, TRIP),
    getDay: (l: ReturnType<typeof creerLectureVoyages>) => l.getDay(ctx, TRIP, 1),
    listProposals: (l: ReturnType<typeof creerLectureVoyages>) => l.listProposals(ctx, TRIP),
    listPreviewSlots: (l: ReturnType<typeof creerLectureVoyages>) => l.listPreviewSlots(ctx, TRIP),
    getDayMap: (l: ReturnType<typeof creerLectureVoyages>) => l.getDayMap(ctx, TRIP, 1),
    getTripMap: (l: ReturnType<typeof creerLectureVoyages>) => l.getTripMap(ctx, TRIP),
  };

  it.each(Object.entries(lectures))("lecture: %s : une requête en échec rend unavailable, sans message SQL", async (nom, lecture) => {
    // `listTrips` ne lit pas `stays` : seule la requête des voyages y échoue.
    const tables = nom === "listTrips" ? ["public.trips"] : ["public.trips", "public.stays"];
    for (const table of tables) {
      const { lignes } = journal();
      const adapter = createApiTripAdapter({ relectures: relectures(5), withOrg: transaction(table) });
      const erreur = await lecture(adapter).catch((e: unknown) => e);
      const journalisees = lignes();
      vi.restoreAllMocks();
      expect(erreur, table).toEqual(raison("unavailable"));
      expect((erreur as Error).message).toBe("unavailable");
      expect((erreur as Error).stack ?? "").not.toContain("relation");
      expect(journalisees, table).toEqual([
        expect.objectContaining({ level: "error", event: "voyages.read_failed", reason: "unavailable", ...(nom === "listTrips" ? {} : { tripId: TRIP }) }),
      ]);
      expect(JSON.stringify(journalisees)).not.toContain("relation");
    }
  });

  it("lecture: une erreur fermée levée dans la transaction remonte telle quelle (pas de conversion en unavailable)", async () => {
    const { lignes } = journal();
    const adapter = createApiTripAdapter({ relectures: relectures(-1), withOrg: transaction() });
    await expect(adapter.getDay(ctx, TRIP, 1)).rejects.toEqual(raison("output_invalid"));
    expect(lignes().map((l) => l.reason)).toEqual(["output_invalid"]);
  });
});

describe("lecture: propagation du contexte (0100 § 3.2 point 1)", () => {
  it("lecture: getDay pose le contexte de la session, la portée jour et les séjours de chaque nuit", async () => {
    const { source: porte, recus } = source();
    await createApiTripAdapter({ relectures: porte, withOrg: transaction() }).getDay(ctx, TRIP, 1);
    expect(recus).toHaveLength(1);
    expect(recus[0]).toEqual({
      logementsParNuit: [L1],
      contexte: { organizationId: ORG, userId: USER, tripId: TRIP },
      portee: "jour",
      sejoursParNuit: [{ placeId: L1, ville: "Testville", centre: null, type: "lodging", logement: "known" }],
    });
  });

  it("lecture: getTrip pose la portée voyage ; le contexte vient de la session, jamais de la demande", async () => {
    const { source: porte, recus } = source();
    await createApiTripAdapter({ relectures: porte, withOrg: transaction() }).getTrip(ctx, TRIP);
    expect(recus).toHaveLength(1);
    expect(recus[0]?.portee).toBe("voyage");
    expect(recus[0]?.contexte).toEqual({ organizationId: ORG, userId: USER, tripId: TRIP });
    // Aucun champ du voyage lu n'est une donnée de la demande : la demande ne porte ni organisation, ni utilisateur, ni portée.
    const { source: autre, recus: autres } = source();
    await createApiTripAdapter({ relectures: autre, withOrg: transaction() }).getDay({ ...ctx, userId: "00000000-0000-4000-8000-0000000000b2" }, TRIP, 1);
    expect(autres[0]?.contexte.userId).toBe("00000000-0000-4000-8000-0000000000b2");
  });

  it("lecture: une ligne de séjour illisible (type inconnu, centre à moitié posé) est output_invalid, sans valeur", async () => {
    journal();
    const lignesStays = (ligne: Record<string, unknown>): NonNullable<DependancesLecture["withOrg"]> => {
      const base = transaction();
      return async (c, fn) =>
        base(c, (tx) =>
          fn({
            async execute(requete: unknown) {
              const texte = texteSql(requete);
              if (texte.includes("public.stays")) return { rows: [{ place_id: L1, from: "2028-03-01", to: "2028-03-02", kind: "lodging", lodging_kind: "known", city: null, area_center_lat: null, area_center_lng: null, ...ligne }] };
              return (tx as unknown as { execute(r: unknown): Promise<{ rows: unknown[] }> }).execute(requete);
            },
          } as unknown as OrgTransaction),
        );
    };
    for (const ligne of [{ kind: "autre" }, { lodging_kind: "autre" }, { area_center_lat: 12.5 }, { city: 4 }]) {
      await expect(createApiTripAdapter({ relectures: relectures(5), withOrg: lignesStays(ligne) }).getDay(ctx, TRIP, 1), JSON.stringify(ligne)).rejects.toEqual(raison("output_invalid"));
    }
  });
});
