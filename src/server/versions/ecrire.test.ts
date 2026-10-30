import { describe, expect, it } from "vitest";

import { TripSnapshotSchema, type StopSnapshot, type TripSnapshot } from "@/contracts";
import { identifiantLigneAFaire } from "@/domain/a-faire";

import { ecrireVersion, type ExecuteurVersions } from "./ecrire";

/**
 * `ecrireVersion` et la liste « À faire » (tâche M5e ; décision 0147 § 7.2, T7), sans base : exécuteur doublé qui note les
 * requêtes et rend des lignes fixées. Les tests de base de données (`tests/db/`) font foi pour le SQL lui-même.
 */

const ORG = "11111111-1111-4111-8111-111111111111";
const TRIP = "22222222-2222-4222-8222-222222222222";
const DEMANDE = "33333333-3333-4333-8333-333333333333";

const etape = (id: string, start: string, exceptions: StopSnapshot["exceptions"] = []): StopSnapshot => ({
  id,
  kind: "activity",
  placeId: `test_place_${id}`,
  name: `[Nom ${id}]`,
  start,
  facts: {},
  exceptions,
  locked: false,
});
const instantane = (...etapes: StopSnapshot[]): TripSnapshot =>
  TripSnapshotSchema.parse({ days: [{ index: 1, date: "2027-05-01", travelBudgetMinutes: 90, events: [], items: etapes.map((stop) => ({ type: "stop", stop })) }] });

const AVANT = instantane(etape("j1-1", "09:00", ["toReserve"]), etape("j1-2", "11:00", ["toReserve"]));
const APRES = instantane(etape("j1-3", "09:00", ["toReserve"]), etape("j1-2", "13:00", ["toReserve"]));

type Requete = { texte: string; valeurs: readonly unknown[] };

function executeur(options: { existante?: boolean; lignes?: Record<string, unknown>[] } = {}) {
  const requetes: Requete[] = [];
  const x: ExecuteurVersions = {
    async query(texte, valeurs = []) {
      requetes.push({ texte, valeurs });
      if (texte.includes("request_id = $3") && texte.startsWith("SELECT version")) return { rows: options.existante ? [{ version: 4 }] : [] };
      if (texte.startsWith("INSERT INTO public.trip_versions")) return { rows: [{ version: 5 }] };
      if (texte.includes("FROM public.checklist_items")) return { rows: options.lignes ?? [] };
      return { rows: [] };
    },
  };
  return { x, requetes };
}

const demande = { organizationId: ORG, tripId: TRIP, requestId: DEMANDE, auteur: "workflow" as const, instantane: APRES };
const LIGNES = [
  { id: "00000001-0000-4000-8000-000000000000", stop_id: "j1-1", kind: "reservation", done: false, label: "[Nom j1-1]" },
  { id: "00000002-0000-4000-8000-000000000000", stop_id: "j1-1", kind: "ticket", done: true, label: "[Billets]" },
  { id: "00000003-0000-4000-8000-000000000000", stop_id: "j1-2", kind: "reservation", done: false, label: "[Nom j1-2]" },
  { id: "00000004-0000-4000-8000-000000000000", stop_id: null, kind: "other", done: false, label: "[Bon plan]" },
];

describe("ecrireVersion : liste « À faire » suivie dans la même transaction (M5e, 0147 § 7.2)", () => {
  it("a-faire: version 1 (instantanePrecedent nul) : aucune lecture ni écriture de la liste", async () => {
    const { x, requetes } = executeur();
    const ecrite = await ecrireVersion(x, { ...demande, instantanePrecedent: null });
    expect(ecrite).toMatchObject({ version: 5, creee: true });
    expect(ecrite.aFaire).toBeUndefined();
    expect(requetes.some((r) => r.texte.includes("checklist_items"))).toBe(false);
  });

  it("a-faire: version suivante : retraits, déliaisons et ajouts après la version, identifiants sur le request_id", async () => {
    const { x, requetes } = executeur({ lignes: LIGNES });
    const ecrite = await ecrireVersion(x, { ...demande, instantanePrecedent: AVANT });
    expect(ecrite.aFaire).toMatchObject({ retirer: [LIGNES[0]!.id], delier: [LIGNES[1]!.id] });
    const liste = requetes.filter((r) => r.texte.includes("checklist_items"));
    expect(liste.map((r) => r.texte.split(/\s/)[0])).toEqual(["SELECT", "DELETE", "UPDATE", "INSERT"]);
    // Après l'écriture de la version et l'avance de `current_version`.
    const rang = (motif: RegExp) => requetes.findIndex((r) => motif.test(r.texte));
    expect(rang(/^UPDATE public\.trips/)).toBeLessThan(rang(/FROM public\.checklist_items/));
    expect(liste[1]!.texte).toMatch(/AND NOT done/);
    expect(liste[1]!.valeurs).toEqual([ORG, TRIP, [LIGNES[0]!.id]]);
    expect(liste[2]!.valeurs).toEqual([ORG, TRIP, [LIGNES[0]!.id, LIGNES[1]!.id]]);
    expect(liste[3]!.texte).toMatch(/ON CONFLICT \(id\) DO NOTHING/);
    expect(liste[3]!.valeurs).toEqual([ORG, TRIP, identifiantLigneAFaire(DEMANDE, 0), "j1-3", "reservation", "[Nom j1-3]"]);
  });

  it("a-faire: rejeu (version déjà écrite par ce request_id) : la liste n'est ni relue ni réécrite", async () => {
    const { x, requetes } = executeur({ existante: true, lignes: LIGNES });
    const ecrite = await ecrireVersion(x, { ...demande, instantanePrecedent: AVANT });
    expect(ecrite).toMatchObject({ version: 4, creee: false });
    expect(requetes.some((r) => r.texte.includes("checklist_items"))).toBe(false);
  });

  it("a-faire: rien à suivre : seule la lecture des lignes", async () => {
    const { x, requetes } = executeur({ lignes: LIGNES });
    await ecrireVersion(x, { ...demande, instantane: AVANT, instantanePrecedent: AVANT });
    expect(requetes.filter((r) => r.texte.includes("checklist_items")).map((r) => r.texte.split(/\s/)[0])).toEqual(["SELECT"]);
  });

  it("a-faire: instantané précédent invalide ou ligne illisible : refus levé", async () => {
    await expect(ecrireVersion(executeur().x, { ...demande, instantanePrecedent: { days: [{ googleApiKey: "AIzaSENTINELLE" }] } as unknown as TripSnapshot })).rejects.toThrow();
    const illisible = executeur({ lignes: [{ ...LIGNES[0], kind: "booking" }] });
    await expect(ecrireVersion(illisible.x, { ...demande, instantanePrecedent: AVANT })).rejects.toThrow(RangeError);
  });
});
