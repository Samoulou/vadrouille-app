import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { DaySnapshot } from "@/contracts";
import { COUTS_ESTIMES_MICROS, PARTS_FORFAIT } from "@/server/config/generation";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { EtatEtape } from "@/server/generation/etat";

import {
  MAINTENANT,
  PLAFONDS_LARGES,
  banc,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  derouler,
  doublesEdimbourg,
} from "../support/banc-apercu";
import { journalDePrompts } from "../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../support/sentinelles-google";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * « Surprends-moi » à l'étape e (décision 0106 § 1, 0105 § 5) : critère `aperçu: une idée par jour planifié`, invariant des
 * plans, un seul appel de rédaction par lot, idée distincte des étapes du jour, aucune donnée Google dans le prompt.
 * Base jetable, doubles sur les fixtures d'Édimbourg ; aucune clé, aucun appel réel.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("idees");
  ({ app, auth } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const dependances = (fabrique?: () => FabriqueGeneration): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds: PLAFONDS_LARGES,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

async function lancer(org: Org) {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demandeEdimbourg());
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0] as { id: string });
  const etat: EtatEtape = { generationRunId: run.id, organizationId: org.org, rang: 0 };
  return { tripId, etat, run };
}

async function jours(org: Org, tripId: string): Promise<DaySnapshot[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version DESC LIMIT 1", [tripId]);
    const brut = rows[0]?.snapshot as { days: DaySnapshot[] } | string;
    return (typeof brut === "string" ? JSON.parse(brut) : brut).days;
  });
}

const lieuxDuJour = (jour: DaySnapshot): string[] => jour.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []));

const ETAPE_E = 5;

/** Étape e seule, avec un journal de prompts sur les modèles ; les cinq premières étapes tournent sans idée ni journal. */
async function etapeEAvecJournal(org: Org, etat: EtatEtape, ideesParJour?: number) {
  const progres = await derouler(etat, dependances(), ETAPE_E);
  expect(progres.arret).toBeUndefined();
  const journaux: ReturnType<typeof journalDePrompts>[] = [];
  const sentinelles = avecSentinellesGoogle(doublesEdimbourg());
  const fabrique = () =>
    composerSimuleeAvec({
      doubles: () => {
        const d = doublesEdimbourg();
        const s = avecSentinellesGoogle(d);
        for (const v of s.valeurs) sentinelles.valeurs.add(v);
        const j = journalDePrompts(d.modeles);
        journaux.push(j);
        const places = {
          ...d.places,
          textSearch: s.places.textSearch,
          async details(placeId: string) {
            const [decore, brut] = await Promise.all([s.places.details(placeId), d.places.details(placeId)]);
            return { ...decore, niveauPrix: brut.niveauPrix };
          },
        };
        return { ...d, modeles: j.client, places, routes: s.routes };
      },
    });
  const { etapePlanification } = await import("@/server/generation/etapes");
  const fin = await etapePlanification(progres, { ...dependances(fabrique), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
  void org;
  return { fin, requetes: journaux.flatMap((j) => j.requetes), texte: journaux.map((j) => j.texte()).join("\n"), sentinelles };
}

describe("aperçu : Surprends-moi (0106 § 1, 0105 § 5)", () => {
  it("aperçu: une idée par jour planifié : J1 et J2 ont chacun une idée, jamais une étape du programme ; J3 et suivants aucune", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    const js = await jours(org, tripId);
    const auPlan = new Set(js.flatMap(lieuxDuJour));
    for (const index of [1, 2]) {
      const jour = js.find((j) => j.index === index) as DaySnapshot & { surprise?: { placeId?: string } };
      expect(jour.surprise?.placeId, `idée du jour ${index}`).toBeDefined();
      expect(lieuxDuJour(jour)).not.toContain(jour.surprise?.placeId);
      expect(auPlan.has(jour.surprise?.placeId as string)).toBe(false);
    }
    const idees = js.slice(0, 2).map((j) => (j as { surprise?: { placeId?: string } }).surprise?.placeId);
    expect(new Set(idees).size).toBe(2);
    for (const jour of js.filter((j) => j.index > 2)) expect((jour as { surprise?: unknown }).surprise).toBeUndefined();
    // Hors des huit cases : les cases ne comptent que des activités et des repas.
    const { rows } = await inTx(app, { org: org.org, user: org.owner }, (c) => c.query("SELECT count(*)::int AS n FROM public.proposals WHERE trip_id = $1", [tripId]));
    expect(rows[0].n).toBe(8);
    const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
    expect(run.phase).not.toBe("failed");
    expect(run.stop_reason).toBeNull();
  });

  it("sans candidat admissible : pas d'idée, pas d'erreur ; l'exécution finit incomplète, jamais en échec", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({
      ...base,
      ancrage: (o: Parameters<FabriqueGeneration["ancrage"]>[0]) => {
        const reel = base.ancrage(o);
        return {
          async ancrer(...args: Parameters<typeof reel.ancrer>) {
            const issue = await reel.ancrer(...args);
            return issue.ok ? { ok: true as const, valeur: new Map([...issue.valeur].slice(0, 3)) } : issue;
          },
        };
      },
    });
    const fin = await derouler(etat, dependances(fabrique));
    expect(fin.arret).toBeUndefined();
    const js = await jours(org, tripId);
    for (const jour of js) expect((jour as { surprise?: unknown }).surprise).toBeUndefined();
    const run = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT phase, stop_reason FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0]);
    expect(run.phase).toBe("incomplete");
    expect(run.stop_reason).toBeNull();
  });

  it("invariant : les étapes du programme sont identiques avec et sans idées", async () => {
    const [avec, sans] = await Promise.all(
      [undefined, 0].map(async (ideesParJour) => {
        const org = await createOrg(auth);
        const { tripId, etat } = await lancer(org);
        const progres = await derouler(etat, dependances(), ETAPE_E);
        const { etapePlanification } = await import("@/server/generation/etapes");
        const fin = await etapePlanification(progres, { ...dependances(), ...(ideesParJour === undefined ? {} : { ideesParJour }) });
        expect(fin.arret).toBeUndefined();
        return jours(org, tripId);
      }),
    );
    const etapes = (js: DaySnapshot[]) => js.map((jour) => [jour.index, jour.items.map((item) => (item.type === "stop" ? [item.stop.kind, item.stop.placeId, item.stop.start, item.stop.end, item.stop.reason] : item.type))]);
    expect(etapes(avec!)).toEqual(etapes(sans!));
    expect(avec!.filter((j) => (j as { surprise?: unknown }).surprise !== undefined)).toHaveLength(2);
    expect(sans!.filter((j) => (j as { surprise?: unknown }).surprise !== undefined)).toHaveLength(0);
  });

  it("un seul appel de rédaction par lot : le nombre de requêtes de modèle de l'étape e ne change pas avec les idées, et reste sous sa réserve", async () => {
    const orgA = await createOrg(auth);
    const a = await lancer(orgA);
    const avec = await etapeEAvecJournal(orgA, a.etat);
    const orgB = await createOrg(auth);
    const b = await lancer(orgB);
    const sans = await etapeEAvecJournal(orgB, b.etat, 0);
    expect(avec.fin.arret).toBeUndefined();
    expect(sans.fin.arret).toBeUndefined();
    expect(avec.requetes.length).toBeGreaterThan(0);
    expect(avec.requetes.length).toBe(sans.requetes.length);
    // Réserve de l'étape e : 20 % du plafond de coût des modèles de l'aperçu, à 20 000 micro-USD estimés par requête.
    const reserve = (PLAFONDS_LARGES.generations.apercu.coutModelesMicros * PARTS_FORFAIT.modeles.e) / 100;
    expect(avec.requetes.length * COUTS_ESTIMES_MICROS.requeteModele).toBeLessThanOrEqual(reserve);
    // Les noms des idées voyagent dans le lot de rédaction (nos descriptions), pas ailleurs.
    expect(avec.texte).toContain("Musée national des collections");
  });

  it("aucune donnée Google dans le prompt de rédaction (sentinelles de champs absentes)", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const { fin, texte, sentinelles } = await etapeEAvecJournal(org, etat);
    expect(fin.arret).toBeUndefined();
    expect(texte.length).toBeGreaterThan(0);
    expect(sentinellesPresentes(texte, sentinelles)).toEqual([]);
  });
});
