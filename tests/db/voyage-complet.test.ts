import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import {
  etapeCompletAncrage,
  etapeCompletDebut,
  etapeCompletLogement,
  etapeCompletNotation,
  etapeCompletPlanification,
  etapeCompletRecherche,
} from "@/server/generation/etapes-complet";
import { EtatCompletSchema, type EtatComplet } from "@/server/generation/etat";
import { requestIdDeVersion } from "@/server/generation/voyage-complet";
import { creerSuiteVoyageComplet, DemarrageVoyageCompletError } from "@/server/payment/suite-voyage-complet";
import { reprendreParLeStudio } from "../../scripts/reprise-studio";

import {
  MAINTENANT,
  PLAFONDS_LARGES,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  derouler,
  doublesEdimbourg,
} from "../support/banc-apercu";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";
import { executeurSql } from "@/server/with-org";

/**
 * B9d (ticket #599 ; spécification B9, B9d ; décisions 0081 B9-TL-12, 0087 § 1.2 à § 1.7) : voyage complet après déblocage,
 * sur une base réelle jetable, doubles de fournisseurs (variante simulée, fixtures d'Édimbourg). Aucune clé, aucun appel réel :
 * le démarrage du workflow est un espion (`demarrerVoyageComplet`) et les étapes sont déroulées comme `generateFullTrip`.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("complet");
  ({ app, auth, admin } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const ECHEC_FOURNISSEUR = { ok: false, code: "upstream_unavailable", retryable: true } as const;
const ETAPES_JOUR = [etapeCompletRecherche, etapeCompletAncrage, etapeCompletNotation, etapeCompletPlanification] as const;

/**
 * Plafonds de test du voyage complet : ceux de l'aperçu (`PLAFONDS_LARGES`) et un profil `complet` assez large pour quatre
 * jours (la part des étapes b à e est divisée par le nombre de jours du passage). Valeurs de test, sans lien avec les montants
 * réels (réservés à Samuel).
 */
const PLAFONDS_COMPLET = {
  ...PLAFONDS_LARGES,
  // Plusieurs passages par voyage et par jour (reprises) : cumul par organisation et par jour élargi d'autant.
  parOrganisationJourMicros: 500_000_000,
  generations: { ...PLAFONDS_LARGES.generations, complet: { coutModelesMicros: 2_400_000, placesTextSearch: 300, placesDetails: 300, routesRequetes: 100, routesElements: 1_200 } },
};

const dependances = (fabrique?: () => FabriqueGeneration): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds: PLAFONDS_COMPLET,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  reserverEnSimulee: true,
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

/** Planification qui échoue (erreur passagère du fournisseur) à partir de l'appel numéro `apres` (0 : dès le premier jour). */
const planificationEnEchec = (apres = 0) => {
  let appels = 0;
  return () => {
    const fabrique = composerSimuleeAvec({ doubles: () => doublesEdimbourg() });
    return {
      ...fabrique,
      finale: (o: Parameters<FabriqueGeneration["finale"]>[0]) => {
        const finale = fabrique.finale(o);
        return {
          ...finale,
          planifier: async (...args: Parameters<typeof finale.planifier>) => {
            appels += 1;
            return appels > apres ? ECHEC_FOURNISSEUR : finale.planifier(...args);
          },
        };
      },
    } satisfies FabriqueGeneration;
  };
};

/** Déroule le voyage complet comme `generateFullTrip` : arrêt sur un code, ou sur une étape qui rend son entrée inchangée. */
async function deroulerComplet(entree: EtatComplet, deps: DependancesGeneration): Promise<{ readonly fin: EtatComplet; readonly sorties: EtatComplet[] }> {
  const suite = [etapeCompletDebut, etapeCompletLogement, ...Array.from({ length: 30 }, () => ETAPES_JOUR).flat()];
  const sorties: EtatComplet[] = [];
  let etat = entree;
  for (const etape of suite) {
    const suivant = await etape(etat, deps);
    sorties.push(suivant);
    if (suivant.arret !== undefined || suivant.rang === etat.rang) return { fin: suivant, sorties };
    etat = suivant;
  }
  return { fin: etat, sorties };
}

function adaptateur() {
  const demarrerApercu = vi.fn(async () => null);
  const demarrerVoyageComplet = vi.fn<(generationRunId: string, organizationId: string) => Promise<string | null>>(async () => `wrun_${crypto.randomUUID()}`);
  let t = MAINTENANT;
  const adapter = createApiCreationAdapter({ withOrg, maintenant: () => t, demarrerApercu, demarrerVoyageComplet });
  return { adapter, demarrerVoyageComplet, avancer: (ms: number) => (t += ms) };
}

type Lignes = {
  readonly complet: { id: string; phase: string; stop_reason: string | null; workflow_run_id: string | null; reprises: string[]; studio_retries: number }[];
  readonly versions: { version: number; request_id: string; snapshot: { days: { index: number; items: { type: string }[] }[] } }[];
};

async function lignes(org: Org, tripId: string): Promise<Lignes> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => ({
    complet: (
      await c.query(
        `SELECT id, phase, stop_reason, workflow_run_id, person_retry_request_ids::text[] AS reprises, studio_retries
         FROM public.generation_runs WHERE trip_id = $1 AND kind = 'full'`,
        [tripId],
      )
    ).rows,
    versions: (await c.query("SELECT version, request_id, snapshot FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).rows,
  }));
}

const etapesDuJour = (version: Lignes["versions"][number], jour: number) =>
  version.snapshot.days.find((d) => d.index === jour)?.items.filter((i) => i.type === "stop").length ?? 0;

/** Aperçu publié d'un voyage de six jours, puis droit `tripUnlocked` (écrit par l'administrateur, comme le ferait B4a). */
async function voyageDebloque(org: Org) {
  const outils = adaptateur();
  const r = await outils.adapter.createTrip(contexteDe(org), demandeEdimbourg());
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId])).rows[0].id as string);
  expect((await derouler({ generationRunId: apercu, organizationId: org.org, rang: 0 }, dependances())).arret).toBeUndefined();
  await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
  return { ...outils, tripId };
}

const evenementsBloques = (espion: { mock: { calls: unknown[][] } }) => espion.mock.calls.filter((args) => String(args[0]).includes("generation.full_stuck")).length;

describe("voyage complet (B9d) : démarrage une fois par droit, un jour publié à la fois", () => {
  it("sans droit : none, rien de créé ; avec droit : une ligne full démarrée une fois, puis chaque jour hors aperçu publié par sa propre version", async () => {
    const org = await createOrg(auth);
    const outils = adaptateur();
    const r = await outils.adapter.createTrip(contexteDe(org), demandeEdimbourg());
    const tripId = (r as { value: { tripId: string } }).value.tripId;
    const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0].id as string);
    expect((await derouler({ generationRunId: apercu, organizationId: org.org, rang: 0 }, dependances())).arret).toBeUndefined();

    expect(await outils.adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "none", tripId } });
    expect((await lignes(org, tripId)).complet).toEqual([]);

    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
    expect(await outils.adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "preparing", tripId } });
    expect(await outils.adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "preparing", tripId } });
    const avant = await lignes(org, tripId);
    expect(avant.complet).toHaveLength(1);
    expect(avant.complet[0]!.phase).toBe("queued");
    expect(avant.complet[0]!.workflow_run_id).not.toBeNull();
    expect(outils.demarrerVoyageComplet).toHaveBeenCalledTimes(1);
    expect(outils.demarrerVoyageComplet).toHaveBeenCalledWith(avant.complet[0]!.id, org.org);
    const ligne = avant.complet[0]!;

    const { fin, sorties } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances());
    expect(fin.arret).toBeUndefined();
    for (const s of sorties) expect(EtatCompletSchema.safeParse(s).success).toBe(true);

    const apres = await lignes(org, tripId);
    expect(["ready", "incomplete"]).toContain(apres.complet[0]!.phase);
    // Une version par jour publié, chacune avec son request_id dérivé (passage 0) ; les jours de l'aperçu ne changent pas.
    const nouvelles = apres.versions.slice(avant.versions.length);
    expect(nouvelles.length).toBeGreaterThan(0);
    expect(nouvelles.length).toBeLessThanOrEqual(4);
    const jours = [3, 4, 5, 6].slice(0, nouvelles.length);
    expect(nouvelles.map((v) => v.request_id)).toEqual(jours.map((j) => requestIdDeVersion({ id: ligne.id, reprisesPersonne: 0, reprisesStudio: 0 }, j)));
    const derniereApercu = avant.versions.at(-1)!;
    for (const [k, v] of nouvelles.entries()) {
      const precedente = k === 0 ? derniereApercu : nouvelles[k - 1]!;
      // Un jour de plus planifié à chaque version, pas davantage.
      const changes = v.snapshot.days.filter((d) => JSON.stringify(d) !== JSON.stringify(precedente.snapshot.days.find((p) => p.index === d.index)));
      expect(changes.map((d) => d.index)).toEqual([jours[k]]);
      for (const j of [1, 2]) expect(v.snapshot.days.find((d) => d.index === j)).toEqual(derniereApercu.snapshot.days.find((d) => d.index === j));
    }
    expect(etapesDuJour(nouvelles.at(-1)!, 3)).toBeGreaterThan(0);

    // Une lecture d'état après la fin ne crée ni ne démarre rien.
    expect(await outils.adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: apres.complet[0]!.phase, tripId } });
    expect(outils.demarrerVoyageComplet).toHaveBeenCalledTimes(1);
    expect((await lignes(org, tripId)).complet).toHaveLength(1);
  }, 120_000);

  it("étape rejouée après sa fin : la garde l'arrête, aucune version en double", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const deps = dependances();
    let etat: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    for (const etape of [etapeCompletDebut, etapeCompletLogement, etapeCompletRecherche, etapeCompletAncrage, etapeCompletNotation]) etat = await etape(etat, deps);
    expect(etat.arret).toBeUndefined();
    const apresE = await etapeCompletPlanification(etat, deps);
    expect(apresE.arret).toBeUndefined();
    const une = await lignes(org, tripId);
    const rejeu = await etapeCompletPlanification(etat, deps);
    expect(rejeu.arret).toBe("step_expired");
    expect((await lignes(org, tripId)).versions).toEqual(une.versions);
  }, 120_000);
});

describe("voyage complet (B9d) : suite du paiement", () => {
  const suite = (demarrer: (generationRunId: string, organizationId: string) => Promise<string | null>) =>
    creerSuiteVoyageComplet({ transaction: creerWithSystemOrgPourTests(base.db), demarrer, maintenant: () => MAINTENANT });

  it("la suite crée la ligne une fois par droit et la démarre ; rejouée, elle ne crée ni ne démarre rien de plus", async () => {
    const org = await createOrg(auth);
    const { tripId } = await voyageDebloque(org);
    const demarrer = vi.fn(async () => "wrun_suite");
    const droit = { entitlementId: crypto.randomUUID(), tripId, organizationId: org.org };
    await suite(demarrer)(droit);
    await suite(demarrer)(droit);
    const { complet } = await lignes(org, tripId);
    expect(complet).toHaveLength(1);
    expect(complet[0]).toMatchObject({ phase: "queued", workflow_run_id: "wrun_suite" });
    expect(demarrer).toHaveBeenCalledTimes(1);
  }, 120_000);

  it("démarrage perdu : la suite lève (relances de lancerSuite), la ligne reste queued sans identifiant et la suite suivante la démarre", async () => {
    const org = await createOrg(auth);
    const { tripId } = await voyageDebloque(org);
    const droit = { entitlementId: crypto.randomUUID(), tripId, organizationId: org.org };
    await expect(suite(async () => null)(droit)).rejects.toBeInstanceOf(DemarrageVoyageCompletError);
    expect((await lignes(org, tripId)).complet[0]).toMatchObject({ phase: "queued", workflow_run_id: null });
    const demarrer = vi.fn(async () => "wrun_relance");
    await suite(demarrer)(droit);
    expect((await lignes(org, tripId)).complet).toEqual([expect.objectContaining({ phase: "queued", workflow_run_id: "wrun_relance" })]);
    expect(demarrer).toHaveBeenCalledTimes(1);
  }, 120_000);

  it("voyage de deux jours : ligne ready sans démarrage ni appel", async () => {
    const org = await createOrg(auth);
    const outils = adaptateur();
    const r = await outils.adapter.createTrip(contexteDe(org), demandeEdimbourg({ start: "2026-11-23", end: "2026-11-24" }));
    const tripId = (r as { value: { tripId: string } }).value.tripId;
    const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows[0].id as string);
    expect((await derouler({ generationRunId: apercu, organizationId: org.org, rang: 0 }, dependances())).arret).toBeUndefined();
    await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
    const demarrer = vi.fn(async () => "wrun_inutile");
    await suite(demarrer)({ entitlementId: crypto.randomUUID(), tripId, organizationId: org.org });
    expect((await lignes(org, tripId)).complet).toEqual([expect.objectContaining({ phase: "ready", workflow_run_id: null })]);
    expect(demarrer).not.toHaveBeenCalled();
    expect(await outils.adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "ready", tripId } });
  }, 120_000);
});

describe("voyage complet (B9d) : reprises sans second paiement, plafond et commande du studio", () => {
  it("échec : failed réessayable ; « Réessayer » reprend la même ligne, jours publiés gardés ; reprises concurrentes : une seule acceptée", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, demarrerVoyageComplet } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    // Premier jour publié, puis échec à la planification du deuxième.
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(planificationEnEchec(1)));
    expect(fin.arret).toBe("upstream_unavailable");
    const apresEchec = await lignes(org, tripId);
    expect(apresEchec.complet[0]!.phase).toBe("failed");
    expect(await adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "failed", tripId, retryable: true } });
    // Ouvrir l'état ne relance rien.
    expect(demarrerVoyageComplet).toHaveBeenCalledTimes(1);

    const premiere = crypto.randomUUID();
    const issues = await Promise.all([
      adapter.retryGeneration(contexteDe(org), { tripId, requestId: premiere, kind: "full" }),
      adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" }),
    ]);
    expect(issues.filter((i) => i.ok)).toHaveLength(1);
    expect(issues.filter((i) => !i.ok)).toEqual([{ ok: false, error: expect.objectContaining({ code: "validation_failed" }) }]);
    const reprise = (await lignes(org, tripId)).complet;
    expect(reprise).toHaveLength(1);
    expect(reprise[0]!.id).toBe(ligne.id);
    expect(reprise[0]!.phase).toBe("queued");
    expect(reprise[0]!.reprises).toHaveLength(1);
    expect(demarrerVoyageComplet).toHaveBeenCalledTimes(2);
    // Aucun second paiement : aucun nouveau droit, aucun paiement écrit.
    const droits = await admin.query("SELECT count(*)::int AS n FROM public.entitlements WHERE trip_id = $1", [tripId]);
    expect(droits.rows[0].n).toBe(1);

    // Le second passage ne replanifie que les jours manquants, avec des request_id du passage 1.
    const { fin: fin2 } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances());
    expect(fin2.arret).toBeUndefined();
    const finales = await lignes(org, tripId);
    const passage1 = finales.versions.slice(apresEchec.versions.length);
    expect(passage1.length).toBeGreaterThan(0);
    expect(passage1[0]!.request_id).toBe(requestIdDeVersion({ id: ligne.id, reprisesPersonne: 1, reprisesStudio: 0 }, 4));
    const publiesAvant = apresEchec.versions.at(-1)!;
    expect(passage1.at(-1)!.snapshot.days.find((d) => d.index === 3)).toEqual(publiesAvant.snapshot.days.find((d) => d.index === 3));
    const tous = finales.versions.map((v) => v.request_id);
    expect(new Set(tous).size).toBe(tous.length);
  }, 180_000);

  it("plafond de trois reprises : bloquée, un seul generation.full_stuck, « Réessayer » refusé ; la commande du studio la reprend", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const espion = vi.spyOn(console, "log");
    const entree: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    expect((await deroulerComplet(entree, dependances(planificationEnEchec()))).fin.arret).toBe("upstream_unavailable");
    for (let k = 0; k < 3; k += 1) {
      expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: true, value: { tripId } });
      expect(evenementsBloques(espion)).toBe(0);
      expect((await deroulerComplet(entree, dependances(planificationEnEchec()))).fin.arret).toBe("upstream_unavailable");
    }
    expect(evenementsBloques(espion)).toBe(1);
    const evenement = JSON.parse(String(espion.mock.calls.find((a) => String(a[0]).includes("generation.full_stuck"))![0]));
    expect(evenement).toMatchObject({ event: "generation.full_stuck", tripId, organizationId: org.org, generationRunId: ligne.id, stopReason: "upstream_unavailable" });
    expect(await adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "failed", tripId, retryable: false } });
    expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed" }) });

    // Commande du studio : une écriture, rien de démarré ; mauvais couple organisation et voyage : rien.
    const transaction = <T>(organizationId: string, travail: (x: ReturnType<typeof executeurSql>) => Promise<T>) =>
      creerWithSystemOrgPourTests(base.db)(organizationId, (tx) => travail(executeurSql(tx)));
    const autre = await createOrg(auth);
    expect(await reprendreParLeStudio(["--organisation", autre.org, "--voyage", tripId], { transaction })).toBe("rien_a_reprendre");
    expect(await reprendreParLeStudio(["--organisation", org.org], { transaction })).toBe("arguments_invalides");
    expect(await reprendreParLeStudio(["--organisation", org.org, "--voyage", tripId], { transaction })).toBe("repris");
    const reprise = (await lignes(org, tripId)).complet[0]!;
    expect(reprise).toMatchObject({ phase: "queued", workflow_run_id: null, studio_retries: 1 });
    expect(reprise.reprises).toHaveLength(3);
    expect(await reprendreParLeStudio(["--organisation", org.org, "--voyage", tripId], { transaction })).toBe("rien_a_reprendre");

    // Après une reprise du studio, un nouvel échec est bloqué d'emblée : un seul nouvel événement.
    expect((await deroulerComplet(entree, dependances(planificationEnEchec()))).fin.arret).toBe("upstream_unavailable");
    expect(evenementsBloques(espion)).toBe(2);
  }, 180_000);
});
