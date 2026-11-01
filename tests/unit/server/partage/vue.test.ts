// @vitest-environment node
import { createHash } from "node:crypto";

import { describe, expect, it, vi } from "vitest";

import { projectSharedTrip } from "@/adapters/share-projection";
import { SharedTripViewSchema } from "@/contracts/share";
import type { HeadersLike } from "@/server/ip";
import { creerLectureVue, projeterVuePartagee, SQL_TRANSACTION_VUE, type ExecuteurVue, type TransactionVue } from "@/server/partage/vue";
import { edimbourgDebloque } from "@/mocks/edimbourg";

/**
 * Lecture de la vue partagée sur `api` (ticket 1013, M6a ; décision 0158 § 3 et § 4.2 ; décision 0157 § 1.4 et § 2.1
 * point 5), sur un client simulé : **la même suite de requêtes**, dans le même ordre et avec les mêmes paramètres, pour
 * un jeton inconnu, un lien désactivé, un lien expiré, un voyage reverrouillé (vues vides) et un lien valide ; la
 * décision n'est prise qu'après la dernière lecture. La requête non « comptée » ne lit rien. La projection ne recopie que
 * les champs de `SharedTripSchema`. Le comportement des vues en base est éprouvé par `tests/db/partage-api.test.ts`.
 */

const JETON = "B".repeat(43);
const CHEMIN = `/p/${JETON}`;

const VOYAGE = {
  destination: edimbourgDebloque.destination,
  start: edimbourgDebloque.start,
  end: edimbourgDebloque.end,
  adults: edimbourgDebloque.travellers.adults,
  children: edimbourgDebloque.travellers.children,
  time_zone: edimbourgDebloque.timeZone,
};
/** Instantané tel que la version le garde, avec des champs que la vue ne doit jamais recopier. */
const VERSION = { version: 3, snapshot: { days: edimbourgDebloque.days, budget: { total: 1200 }, surprise: true } };

type Scenario = { etat: string | null; voyages: Record<string, unknown>[]; versions: Record<string, unknown>[] };

const SCENARIOS: Record<string, Scenario> = {
  "jeton inconnu": { etat: null, voyages: [], versions: [] },
  "lien désactivé": { etat: "revoked", voyages: [], versions: [] },
  "lien expiré": { etat: "expired", voyages: [], versions: [] },
  "voyage reverrouillé (0158 § 2 : vues vides sans droit tripUnlocked)": { etat: "valid", voyages: [], versions: [] },
  "lien valide": { etat: "valid", voyages: [VOYAGE], versions: [VERSION] },
};

function client(scenario: Scenario) {
  const requetes: { texte: string; valeurs: readonly unknown[] }[] = [];
  const executeur: ExecuteurVue = {
    async query(texte, valeurs = []) {
      requetes.push({ texte, valeurs });
      if (texte === SQL_TRANSACTION_VUE[1]) return { rows: scenario.etat === null ? [] : [{ state: scenario.etat }] };
      if (texte === SQL_TRANSACTION_VUE[3]) return { rows: scenario.voyages };
      if (texte === SQL_TRANSACTION_VUE[4]) return { rows: scenario.versions };
      return { rows: [] };
    },
  };
  const appels = vi.fn();
  const transaction: TransactionVue = (fn) => {
    appels();
    return fn(executeur);
  };
  return { transaction, appels, requetes };
}

const entetes: HeadersLike = { get: () => null };

describe("vue partagée : un seul chemin de lecture (0158 § 3 et § 4.2)", () => {
  it.each(Object.keys(SCENARIOS))("%s : même suite de requêtes, mêmes paramètres", async (nom) => {
    const scenario = SCENARIOS[nom] as Scenario;
    const { transaction, appels, requetes } = client(scenario);
    const lecture = creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true });
    const vue = await lecture.lire(JETON, CHEMIN);
    expect(appels).toHaveBeenCalledTimes(1);
    expect(requetes.map((r) => r.texte)).toEqual([...SQL_TRANSACTION_VUE]);
    const empreinte = createHash("sha256").update(JETON, "utf8").digest();
    expect(requetes.map((r) => r.valeurs)).toEqual([[], [empreinte], [], [], []]);
    expect(JSON.stringify(requetes)).not.toContain(JETON);
    if (nom === "lien valide") expect(vue).not.toBeNull();
    else expect(vue).toBeNull();
  });

  it("état valid mais une seule des deux vues rend une ligne : null (404 commun), après la même suite", async () => {
    for (const scenario of [
      { etat: "valid", voyages: [VOYAGE], versions: [] },
      { etat: "valid", voyages: [], versions: [VERSION] },
      { etat: "revoked", voyages: [VOYAGE], versions: [VERSION] },
    ]) {
      const { transaction, requetes } = client(scenario);
      expect(await creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true }).lire(JETON, CHEMIN)).toBeNull();
      expect(requetes).toHaveLength(SQL_TRANSACTION_VUE.length);
    }
  });

  it("aucune requête ne lit une table, entitlements ou shared_checklist", () => {
    const sql = SQL_TRANSACTION_VUE.join("\n");
    expect(sql).not.toMatch(/\bentitlements\b|\bshared_checklist\b|public\.(trips|trip_versions|share_links|place_coordinates)\b/);
    expect(SQL_TRANSACTION_VUE[2]).toBe("SET LOCAL ROLE vadrouille_share");
  });

  it("requête non comptée (0157 § 2.1 point 5) : null sans aucune lecture", async () => {
    const { transaction, appels } = client(SCENARIOS["lien valide"] as Scenario);
    const comptee = vi.fn(() => false);
    expect(await creerLectureVue({ transaction, entetes: async () => entetes, comptee }).lire(JETON, CHEMIN)).toBeNull();
    expect(comptee).toHaveBeenCalledWith(entetes, CHEMIN);
    expect(appels).not.toHaveBeenCalled();
  });
});

describe("vue partagée : projection champ par champ, sans carte (0157 § 1.4, Q814)", () => {
  it("vue valide : conforme au schéma strict, mêmes champs que la projection simulée, aucune position", async () => {
    const { transaction } = client(SCENARIOS["lien valide"] as Scenario);
    const vue = await creerLectureVue({ transaction, entetes: async () => entetes, comptee: () => true }).lire(JETON, CHEMIN);
    expect(vue?.timeZone).toBe(edimbourgDebloque.timeZone);
    const parsee = SharedTripViewSchema.parse({ trip: vue?.trip, maps: vue?.maps });
    // Même vue que la projection de l'adaptateur simulé, à trois écarts près : couleur recalculée depuis la destination,
    // durée des trajets inconnue (jamais stockée, aucune relecture pour un visiteur) et « en préparation » déduit de
    // l'absence d'étape (l'instantané ne porte pas `generating` ; le jour 6 simulé est marqué en génération).
    const attendu = projectSharedTrip(edimbourgDebloque);
    const sansDurees = (trip: typeof attendu) =>
      trip.days.map((d) => ({
        ...d,
        generating: !d.items.some((i) => i.type === "stop"),
        items: d.items.map((i) => (i.type === "segment" ? { ...i, segment: { ...i.segment, minutes: null } } : i)),
      }));
    expect(parsee.trip.days).toEqual(sansDurees(attendu));
    expect({ ...parsee.trip, days: [], destinationColor: "" }).toEqual({ ...attendu, days: [], destinationColor: "" });
    expect(parsee.maps).toEqual(attendu.days.map((d) => ({ index: d.index, points: [] })));
    const texte = JSON.stringify(vue);
    for (const interdit of ["placeId", '"id"', "reason", "source", "locked", "commitment", "budget", "surprise", "toReserve", "time_zone"]) {
      expect(texte, interdit).not.toContain(interdit);
    }
  });

  it("jour sans étape : en préparation ; exceptions réduites à toConfirm et unconfirmed", () => {
    const { trip } = projeterVuePartagee(VOYAGE, {
      snapshot: {
        days: [
          { index: 1, date: "2026-11-10", items: [], events: [] },
          {
            index: 2,
            date: "2026-11-11",
            items: [{ type: "stop", stop: { id: "x", placeId: "ChIJ", kind: "activity", name: "Château", start: "10:00", end: "11:00", facts: { tip: "t" }, exceptions: ["toReserve", "toConfirm", "unconfirmed"] } }],
            events: [],
          },
          { index: 3, date: "2026-11-12", items: [{ type: "transfer", from: "a", to: "b" }], events: [] },
        ],
      },
    });
    const jours = trip.days as { generating: boolean; items: { stop?: { exceptions: string[]; key: string } }[] }[];
    expect(jours.map((j) => j.generating)).toEqual([true, false, true]);
    expect(jours[1]?.items[0]?.stop).toEqual({ kind: "activity", name: "Château", start: "10:00", end: "11:00", facts: {}, key: "1", exceptions: ["toConfirm", "unconfirmed"] });
    expect(jours[2]?.items).toEqual([]);
  });

  it("voyage sans fuseau ni destination : erreur (page d'erreur commune), jamais un 404", () => {
    expect(() => projeterVuePartagee({ ...VOYAGE, time_zone: null }, VERSION)).toThrow();
    expect(() => projeterVuePartagee({ ...VOYAGE, destination: null }, VERSION)).toThrow();
  });
});
