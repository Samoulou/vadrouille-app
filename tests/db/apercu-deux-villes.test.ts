import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { EtatEtape } from "@/server/generation/etat";
import { etapePlanification } from "@/server/generation/etapes";

import { MAINTENANT, doublesEdimbourg, banc, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests, demandeEdimbourg, derouler, ETAPES } from "../support/banc-apercu";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Aperçu à deux villes dont la seconde n'a pas de logement (`none`) ; défaut relevé pendant B9d (PR 600, question « Tech
 * Lead, IA »). La part Text Search de l'étape `e` est nulle (`PARTS_FORFAIT`) alors que la zone d'une ville `none` passe par
 * un Text Search de son nom (0087 § 2.3) : l'aperçu s'arrêtait en `cap_reached`. Variante simulée **par défaut** (valeurs de
 * test `PLAFONDS_VARIANTE_SIMULEE`, forfait en mémoire), barrière fermée : aucun appel réel, aucune clé.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("apercu_deux_villes");
  ({ db, app, auth } = base);
  withOrg = creerWithOrg(db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

/** Doubles d'Édimbourg dont les Text Search sont comptés (appels qui atteignent le double, donc admis par le registre). */
function doublesComptes(compte: { textSearch: number }): () => DoublesGeneration {
  return () => {
    const d = doublesEdimbourg();
    return {
      ...d,
      places: {
        ...d.places,
        textSearch: (requete) => {
          compte.textSearch += 1;
          return d.places.textSearch(requete);
        },
      },
    };
  };
}

function dependances(fabrique: () => FabriqueGeneration): DependancesGeneration {
  // Ni `plafonds` ni `reserverEnSimulee` : valeurs par défaut de la variante simulée (décision 0110 § 3).
  return {
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    composition: fabrique,
  };
}

async function lancer(org: Org) {
  const { adapter } = banc(withOrg);
  const demande = demandeEdimbourg({ otherCities: [{ name: "Glasgow", arrival: "2026-11-24", lodging: { kind: "none" } }] });
  const r = await adapter.createTrip(contexteDe(org), demande);
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1", [tripId]);
    return rows[0] as { id: string };
  });
  const etat: EtatEtape = { generationRunId: run.id, organizationId: org.org, rang: 0 };
  return { tripId, etat };
}

async function lignes(org: Org, tripId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => ({
    run: (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0] as { phase: string; stop_reason: string | null },
    versions: (await c.query("SELECT count(*)::int AS n FROM public.trip_versions WHERE trip_id = $1", [tripId])).rows[0].n as number,
    cases: (await c.query("SELECT day, slot_type, content FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId])).rows as {
      day: number;
      slot_type: string;
      content: unknown;
    }[],
  }));
}

describe("aperçu : deux villes, la seconde sans logement (valeurs par défaut de la variante simulée)", () => {
  it("l'étape e ne lance aucun Text Search sans part : l'aperçu va au bout, la ville sans logement reste à préciser", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);

    // Étapes a à d : l'ancrage (c) cherche la zone de Glasgow par un Text Search de son nom, dans sa part.
    const avantE = { textSearch: 0 };
    const apresD = await derouler(etat, dependances(() => composerSimuleeAvec({ doubles: doublesComptes(avantE) })), ETAPES.length - 1);
    expect(apresD.arret).toBeUndefined();
    expect(avantE.textSearch).toBeGreaterThan(0);

    // Étape e : sa part Text Search est nulle, elle n'en lance aucun et publie quand même la version.
    const enE = { textSearch: 0 };
    const fin = await etapePlanification(apresD, dependances(() => composerSimuleeAvec({ doubles: doublesComptes(enE) })));
    expect(fin.arret).toBeUndefined();
    expect(enE.textSearch).toBe(0);

    const lu = await lignes(org, tripId);
    expect(lu.run.stop_reason).toBeNull();
    expect(["ready", "incomplete"]).toContain(lu.run.phase);
    expect(lu.versions).toBe(1);
    expect(lu.cases).toHaveLength(8);
    // J1 (Édimbourg) garde ses lieux ; J2 (arrivée à Glasgow, zone non relue) n'en invente aucun : aucune proposition ce jour-là.
    const proposees = lu.cases.filter((c) => c.slot_type === "proposal");
    expect(proposees.length).toBeGreaterThan(0);
    expect(proposees.every((c) => c.day === 1)).toBe(true);
    expect(lu.run.phase).toBe("incomplete");
  });
});
