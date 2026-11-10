// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdapterContext } from "@/adapters/types";
import type { DaySnapshot } from "@/contracts";
import { edimbourg } from "@/mocks/edimbourg";
import { SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR } from "@/server/config/lieux";
import { RATE_LIMITS } from "@/server/config/limites";
import { formatLogLine } from "@/server/log";
import { SQL_VERROU_VERSIONS } from "@/server/versions/ecrire";

import type { DependancesAction } from "./actions";
import {
  ACTION_LIMITEUR_SIGNALEMENT,
  SQL_DOUBLON_SIGNALEMENT,
  SQL_INSERTION_SIGNALEMENT,
  SQL_SIGNALEMENTS_DU_JOUR,
  signalerEtape,
  type DependancesSignalement,
} from "./signalement";

type FonctionWithOrg = NonNullable<DependancesAction["withOrg"]>;

/**
 * Cas d'usage `reportStop` sur `api`, sans base (tâche M5c, ticket 904 ; décision 0147 § 1 point 4, § 2, § 12 S1). `withOrg`
 * est un double qui répond selon le texte de la requête ; les jours lus et le limiteur sont injectés. La partie en base
 * (index uniques, borne UTC sous un autre fuseau, isolation) est dans `tests/db/signalement.test.ts`.
 */

const CTX: AdapterContext = { organizationId: "0d000000-0000-4000-8000-000000000001", userId: "0d000000-0000-4000-8000-000000000002", role: "owner" };
const TRIP = "0d000000-0000-4000-8000-0000000000aa";
const REQUETE = "0d000000-0000-4000-8000-0000000000cc";
const SQL_VOYAGE = "SELECT 1 AS present FROM public.trips WHERE organization_id = $1 AND id = $2";

/** Jours du jeu d'Édimbourg, pris comme jours stockés (seules les lignes et les événements comptent ici). */
const JOURS = edimbourg.days as unknown as readonly DaySnapshot[];

type Requete = { texte: string; valeurs: unknown[] };
type Base = { voyage?: boolean; doublon?: boolean; compte?: number; insere?: boolean };

/** Double de `withOrg` : transaction fabriquée, réponses selon la requête ; une requête inconnue lève. */
function doubleWithOrg(base: Base = {}) {
  const requetes: Requete[] = [];
  const withOrg = vi.fn(async (_ctx: unknown, fn: (tx: never) => Promise<unknown>): Promise<unknown> => {
    const tx = {
      execute: async (requete: { queryChunks: unknown[] }) => {
        const morceaux: string[] = [];
        const valeurs: unknown[] = [];
        for (const morceau of requete.queryChunks) {
          const m = morceau as { value?: unknown; queryChunks?: unknown[] };
          if (Array.isArray(m.value)) morceaux.push(m.value.join(""));
          else if (m.queryChunks !== undefined) {
            for (const interne of m.queryChunks) {
              const i = interne as { value?: unknown };
              if (Array.isArray(i.value)) morceaux.push(i.value.join(""));
              else {
                valeurs.push(i.value);
                morceaux.push(`$${valeurs.length}`);
              }
            }
          }
        }
        const texte = morceaux.join("");
        requetes.push({ texte, valeurs });
        if (texte === SQL_VOYAGE) return { rows: base.voyage === false ? [] : [{ present: 1 }] };
        if (texte === SQL_VERROU_VERSIONS) return { rows: [{}] };
        if (texte === SQL_DOUBLON_SIGNALEMENT) return { rows: base.doublon === true ? [{ present: 1 }] : [] };
        if (texte === SQL_SIGNALEMENTS_DU_JOUR) return { rows: [{ n: base.compte ?? 0 }] };
        if (texte === SQL_INSERTION_SIGNALEMENT) return { rows: base.insere === false ? [] : [{ id: "0d000000-0000-4000-8000-0000000000dd" }] };
        throw new Error(`requête inattendue : ${texte}`);
      },
    };
    return fn(tx as never);
  });
  return { withOrg: withOrg as unknown as FonctionWithOrg & typeof withOrg, requetes };
}

function banc(base: Base = {}, options: { jours?: readonly DaySnapshot[] | null; limiteur?: DependancesSignalement["limiteur"]; ctx?: AdapterContext | null } = {}) {
  const { withOrg, requetes } = doubleWithOrg(base);
  const limiteur = vi.fn(options.limiteur ?? (async () => ({ ok: true as const, value: undefined })));
  const lireJours = vi.fn(async () => (options.jours === undefined ? JOURS : options.jours));
  const dependances: DependancesSignalement = { contexte: async () => (options.ctx === undefined ? CTX : options.ctx), withOrg, limiteur, lireJours };
  const textes = () => requetes.map((r) => r.texte);
  return { dependances, requetes, textes, limiteur, lireJours, withOrg };
}

const entree = (extra: Record<string, unknown> = {}) => ({ tripId: TRIP, stopId: "j2-dean-village", reason: "closed", requestId: REQUETE, ...extra });

/** Lignes écrites par `console.log` (journal du serveur) pendant l'appel. */
function journal() {
  const espion = vi.spyOn(console, "log").mockImplementation(() => {});
  return () => espion.mock.calls.map((appel) => JSON.parse(String(appel[0])) as Record<string, unknown>);
}

afterEach(() => vi.restoreAllMocks());

describe("signalement: entrée et session", () => {
  it("sans session : unauthenticated, rien n'est lu", async () => {
    const b = banc({}, { ctx: null });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: false, error: { code: "unauthenticated" } });
    expect(b.withOrg).not.toHaveBeenCalled();
  });

  it("signalement: motifs fermés, aucun texte : un motif inconnu ou un champ de plus est refusé sans rien lire", async () => {
    for (const extra of [{ reason: "dirty" }, { text: "Fermé depuis mars" }, { placeId: "ChIJ-x" }, { organizationId: CTX.organizationId }]) {
      const b = banc();
      const resultat = await signalerEtape(b.dependances, entree(extra));
      expect(resultat.ok ? null : resultat.error.code, JSON.stringify(extra)).toBe("validation_failed");
      expect(b.withOrg).not.toHaveBeenCalled();
    }
  });
});

describe("signalement: ordre des refus (0147 § 1 point 4)", () => {
  it("voyage hors de l'organisation : not_found, aucun verrou, aucune lecture des jours", async () => {
    const b = banc({ voyage: false });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: false, error: { code: "not_found" } });
    expect(b.textes()).toEqual([SQL_VOYAGE]);
    expect(b.lireJours).not.toHaveBeenCalled();
  });

  it("étape absente de la version courante : not_found, rien d'autre", async () => {
    const b = banc();
    expect(await signalerEtape(b.dependances, entree({ stopId: "j9-inconnue" }))).toEqual({ ok: false, error: { code: "not_found" } });
    expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS]);
    expect(b.limiteur).not.toHaveBeenCalled();
  });

  it("signalement: engagement d'une journée non servie : not_found, pas validation_failed", async () => {
    // Jours servis avant le déblocage : J1 (et son engagement, le Tattoo) n'en est pas.
    const servis = JOURS.filter((jour) => jour.index !== 1 && jour.index !== 2);
    for (const stopId of ["j1-tattoo", "j2-concert-orgue", "j2-dean-village"]) {
      const b = banc({}, { jours: servis });
      expect(await signalerEtape(b.dependances, entree({ stopId })), stopId).toEqual({ ok: false, error: { code: "not_found" } });
      expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS]);
    }
  });

  it("événement, engagement, lieu à soi d'une journée servie : validation_failed sur stopId, aucun doublon cherché", async () => {
    const avecAjout = JOURS.map((jour) =>
      jour.index !== 3
        ? jour
        : { ...jour, items: jour.items.map((ligne) => (ligne.type === "stop" && ligne === jour.items.find((l) => l.type === "stop") ? { ...ligne, stop: { ...ligne.stop, id: "ajout-x", addedBy: "person" as const } } : ligne)) },
    );
    for (const stopId of ["j1-tattoo", "j2-concert-orgue", "ajout-x"]) {
      const b = banc({}, { jours: avecAjout });
      expect(await signalerEtape(b.dependances, entree({ stopId })), stopId).toEqual({ ok: false, error: { code: "validation_failed", field: "stopId" } });
      expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS]);
    }
  });

  it("le verrou des versions est pris avant la lecture de la version courante", async () => {
    const b = banc();
    b.lireJours.mockImplementation(async () => {
      expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS]);
      return JOURS;
    });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: true, value: null });
    expect(b.requetes[1]?.valeurs).toEqual([TRIP]);
  });
});

describe("signalement: idempotent, doublon avant le plafond, plafonds", () => {
  it("nouveau : une écriture (étape, placeId de la version courante, auteur de la session, request_id), un événement au motif seul", async () => {
    const lignes = journal();
    const reseau = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("réseau interdit pendant un signalement"));
    const b = banc({ compte: SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR - 1 });
    expect(await signalerEtape(b.dependances, entree({ reason: "hours" }))).toEqual({ ok: true, value: null });
    // Rien d'autre que ces cinq requêtes : ni version, ni liste « À faire », ni appel de modèle ou de Google (réseau).
    expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS, SQL_DOUBLON_SIGNALEMENT, SQL_SIGNALEMENTS_DU_JOUR, SQL_INSERTION_SIGNALEMENT]);
    expect(reseau).not.toHaveBeenCalled();
    expect(b.requetes[2]?.valeurs).toEqual([CTX.organizationId, TRIP, REQUETE, "j2-dean-village", "hours", "mock_place_dean_village"]);
    expect(b.requetes[4]?.valeurs).toEqual([CTX.organizationId, TRIP, "j2-dean-village", "mock_place_dean_village", "hours", CTX.userId, REQUETE]);
    expect(b.limiteur).toHaveBeenCalledTimes(1);
    expect(lignes()).toEqual([{ level: "info", event: "voyages.stop_reported", reason: "hours" }]);
  });

  it("signalement: idempotent : un doublon (même requestId ou même motif sur la même étape) reçoit ok(null), sans compter, écrire ni journaliser", async () => {
    const lignes = journal();
    const b = banc({ doublon: true, compte: SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR + 5 });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: true, value: null });
    expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS, SQL_DOUBLON_SIGNALEMENT]);
    expect(b.limiteur).not.toHaveBeenCalled();
    expect(lignes()).toEqual([]);
  });

  it("écriture concurrente identique (aucune ligne rendue) : ok(null), aucun événement", async () => {
    const lignes = journal();
    const b = banc({ insere: false });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: true, value: null });
    expect(lignes()).toEqual([]);
  });

  it("signalement: plafond : le 21e signalement du jour rend rate_limited, sans écriture ni événement", async () => {
    const lignes = journal();
    const b = banc({ compte: SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: false, error: { code: "rate_limited" } });
    expect(b.textes()).not.toContain(SQL_INSERTION_SIGNALEMENT);
    expect(lignes()).toEqual([]);
  });

  it("débit par adresse IP refusé : rate_limited, ni compte ni écriture", async () => {
    const b = banc({}, { limiteur: async () => ({ ok: false, error: { code: "rate_limited", retryable: true } }) });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: false, error: { code: "rate_limited", retryable: true } });
    expect(b.textes()).toEqual([SQL_VOYAGE, SQL_VERROU_VERSIONS, SQL_DOUBLON_SIGNALEMENT]);
  });

  it("erreur inattendue : internal, aucun événement de signalement", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const lignes = journal();
    const b = banc({ compte: Number.NaN });
    expect(await signalerEtape(b.dependances, entree())).toEqual({ ok: false, error: { code: "internal" } });
    expect(lignes()).toEqual([]);
  });
});

describe("signalement: configuration et requêtes", () => {
  it("plafond de 20 par voyage et par jour UTC ; débit signalement : une règle ip, 60 s, 10 (0147 § 6.4 point 2)", () => {
    expect(SIGNALEMENTS_PAR_VOYAGE_ET_PAR_JOUR).toBe(20);
    expect(ACTION_LIMITEUR_SIGNALEMENT).toBe("signalement");
    expect(RATE_LIMITS[ACTION_LIMITEUR_SIGNALEMENT]).toEqual([{ kind: "ip", windowSeconds: 60, threshold: 10 }]);
  });

  it("borne du jour en timestamptz explicite (minuit UTC du jour de la base), jamais une date du fuseau de la session", () => {
    expect(SQL_SIGNALEMENTS_DU_JOUR).toContain("created_at >= pg_catalog.date_trunc('day', pg_catalog.now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'");
    expect(SQL_SIGNALEMENTS_DU_JOUR).not.toMatch(/::date|current_date|CURRENT_DATE/);
  });

  it("écriture : scope stop, texte nul, ON CONFLICT DO NOTHING sans cible ; aucun UPDATE", () => {
    expect(SQL_INSERTION_SIGNALEMENT).toContain("NULL, 'stop', $6, $7) ON CONFLICT DO NOTHING RETURNING id");
    for (const texte of [SQL_DOUBLON_SIGNALEMENT, SQL_SIGNALEMENTS_DU_JOUR, SQL_INSERTION_SIGNALEMENT]) expect(texte).not.toMatch(/UPDATE/i);
  });
});

describe("journal: voyages.stop_reported (0147 § 12 S1)", () => {
  it("chaque motif passe ; un motif inconnu est retiré ; tripId, placeId, stopId, organizationId et texte sont retirés", () => {
    for (const reason of ["closed", "hours", "wrongPlace", "price", "other"]) {
      expect(JSON.parse(formatLogLine("voyages.stop_reported", { reason }))).toEqual({ level: "info", event: "voyages.stop_reported", reason });
    }
    expect(JSON.parse(formatLogLine("voyages.stop_reported", { reason: "notMyStyle" }))).toEqual({ level: "info", event: "voyages.stop_reported", dropped: 1 });
    const ligne = JSON.parse(
      formatLogLine("voyages.stop_reported", { reason: "price", tripId: TRIP, placeId: "ChIJ-x", stopId: "j2-dean-village", organizationId: CTX.organizationId, text: "x" }),
    );
    expect(ligne).toEqual({ level: "info", event: "voyages.stop_reported", reason: "price", dropped: 5 });
  });

  it("le motif d'un signalement n'est pas une raison admise d'un autre événement", () => {
    expect(JSON.parse(formatLogLine("voyages.read_failed", { reason: "wrongPlace" }))).toEqual({ level: "info", event: "voyages.read_failed", dropped: 1 });
  });
});
