import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import { PARTS_FORFAIT } from "@/server/config/generation";
import { PLAFONDS_VARIANTE_SIMULEE, type PlafondsUsage } from "@/server/config/usage";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { EtatEtape } from "@/server/generation/etat";
import { etapePlanification } from "@/server/generation/etapes";
import { partDe } from "@/server/generation/forfait-etape";
import type { TripDraft } from "@/contracts";

import {
  MAINTENANT,
  doublesEdimbourg,
  banc,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  derouler,
  ETAPES,
} from "../support/banc-apercu";
import { compterAppels, compteursVides } from "../support/compteur-appels";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Aperçu à deux villes dont la seconde n'a pas de logement (`none`) ; défaut #605, relevé pendant B9d (PR 600). La zone d'une
 * ville `none` passe par un Text Search de son nom à l'étape `e` (0087 § 2.3), que `PARTS_FORFAIT` ne couvrait pas : l'aperçu
 * s'arrêtait en `cap_reached`. Décision 0113 § 3 bis : `e` reçoit une réserve exacte d'une requête par ville `area` ou `none`
 * qu'elle positionne, prise sur la part de `c`. Variante simulée **par défaut** (valeurs de test `PLAFONDS_VARIANTE_SIMULEE`,
 * forfait en mémoire), barrière fermée : aucun appel réel, aucune clé.
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

/**
 * Les fixtures d'Édimbourg ne résolvent aucun nom de ville (ni « Glasgow » ni « Édimbourg ») : le double fait correspondre le
 * nom « Glasgow » à une entrée maison des fixtures (valeur sentinelle, aucune donnée Google), pour que la zone se résolve.
 */
const ENTREE_GLASGOW = "Vieille ville d'Édimbourg (Old Town)";

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
          return d.places.textSearch(requete.texte === "Glasgow" ? { ...requete, texte: ENTREE_GLASGOW } : requete);
        },
      },
    };
  };
}

function dependances(fabrique: () => FabriqueGeneration, plafonds?: PlafondsUsage): DependancesGeneration {
  // Sans `plafonds` ni `reserverEnSimulee` : valeurs par défaut de la variante simulée (décision 0110 § 3).
  return {
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    composition: fabrique,
    ...(plafonds === undefined ? {} : { plafonds }),
  };
}

const GLASGOW: Partial<TripDraft> = { otherCities: [{ name: "Glasgow", arrival: "2026-11-24", lodging: { kind: "none" } }] };

async function lancer(org: Org, draft: Partial<TripDraft> = GLASGOW) {
  const { adapter } = banc(withOrg);
  const demande = demandeEdimbourg(draft);
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
    versions: (await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).rows as {
      snapshot: { days: { index: number; items: { type: string }[] }[] };
    }[],
    cases: (await c.query("SELECT day, slot_type, content FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId])).rows as {
      day: number;
      slot_type: string;
      content: unknown;
    }[],
  }));
}

const etapesDuJour = (snapshot: { days: { index: number; items: { type: string }[] }[] }, jour: number) =>
  snapshot.days.find((d) => d.index === jour)?.items.filter((item) => item.type === "stop").length ?? 0;

describe("aperçu : deux villes, la seconde sans logement (valeurs par défaut de la variante simulée)", () => {
  it("l'étape e positionne Glasgow par un seul Text Search, sur sa réserve : l'aperçu va au bout, avec des étapes en J2", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);

    // Étapes a à d : l'ancrage (c) cherche la zone de Glasgow par un Text Search de son nom, dans sa part.
    const avantE = { textSearch: 0 };
    const apresD = await derouler(etat, dependances(() => composerSimuleeAvec({ doubles: doublesComptes(avantE) })), ETAPES.length - 1);
    expect(apresD.arret).toBeUndefined();
    expect(avantE.textSearch).toBeGreaterThan(0);

    // Étape e : sa réserve vaut une requête (Glasgow, seule ville `none` de J1 et J2) ; un seul Text Search part.
    const enE = { textSearch: 0 };
    let partE: number | undefined;
    const base = () => composerSimuleeAvec({ doubles: doublesComptes(enE) });
    const fin = await etapePlanification(
      apresD,
      dependances(() => {
        const fabrique = base();
        return { ...fabrique, finale: (o) => ((partE = o.forfait.textSearchRequetes), fabrique.finale(o)) };
      }),
    );
    expect(fin.arret).toBeUndefined();
    expect(partE).toBe(1);
    expect(enE.textSearch).toBe(1);

    const lu = await lignes(org, tripId);
    expect(lu.run.stop_reason).toBeNull();
    expect(["ready", "incomplete"]).toContain(lu.run.phase);
    expect(lu.versions).toHaveLength(1);
    // J1 (Édimbourg) et J2 (arrivée à Glasgow, zone positionnée par `e`) ont des étapes.
    expect(etapesDuJour(lu.versions[0]!.snapshot, 1)).toBeGreaterThan(0);
    expect(etapesDuJour(lu.versions[0]!.snapshot, 2)).toBeGreaterThan(0);
    expect(lu.cases.some((c) => c.day === 2 && c.slot_type === "proposal")).toBe(true);
  });

  it("refus : une réserve plus grande que la part de c donne cap_reached à l'étape a, avant tout appel", async () => {
    // Deux villes à positionner (Édimbourg `area`, Glasgow `none`) : réserve de 2 ; profil réduit à 1 Text Search, dont la part
    // de `c` vaut 1. Valeurs de test.
    const plafonds: PlafondsUsage = {
      ...PLAFONDS_VARIANTE_SIMULEE,
      generations: { ...PLAFONDS_VARIANTE_SIMULEE.generations, apercu: { ...PLAFONDS_VARIANTE_SIMULEE.generations.apercu, placesTextSearch: 1 } },
    };
    expect(partDe(1, PARTS_FORFAIT.textSearch, "c")).toBeLessThan(2);
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org, { ...GLASGOW, lodging: { kind: "area", label: "Vieille ville" } });
    const compteurs = compteursVides();
    const fin = await derouler(etat, dependances(() => composerSimuleeAvec({ doubles: () => compterAppels(doublesEdimbourg(), compteurs) }), plafonds));
    expect(fin.arret).toBe("cap_reached");
    expect(fin.rang).toBe(1);
    expect(compteurs).toEqual(compteursVides());
    const lu = await lignes(org, tripId);
    expect(lu.run).toMatchObject({ phase: "failed", stop_reason: "cap_reached" });
    expect(lu.versions).toHaveLength(0);
    expect(lu.cases).toHaveLength(0);
  });
});
