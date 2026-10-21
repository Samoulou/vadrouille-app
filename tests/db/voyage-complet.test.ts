import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import { createApiTripAdapter } from "@/adapters/api";
import { INCONNU, type SourceRelectures } from "@/domain/relectures";
import { composerSimuleeAvec, type CapaciteAncrage, type CapaciteRecherche, type FabriqueGeneration } from "@/server/composition/generation";
import { EXPIRATION_EXECUTION_MS, PARTS_FORFAIT } from "@/server/config/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import {
  etapeClotureComplet,
  etapeCompletAncrage,
  etapeCompletDebut,
  etapeCompletLogement,
  etapeCompletNotation,
  etapeCompletPlanification,
  etapeCompletRecherche,
} from "@/server/generation/etapes-complet";
import { EtatCompletSchema, type EtatComplet } from "@/server/generation/etat";
import { CODES_ARRET } from "@/server/generation/raison-echec";
import { partDe } from "@/server/generation/forfait-etape";
import { RANG_COMPLET, rangDuJour, requestIdDeVersion } from "@/server/generation/voyage-complet";
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
import { compterAppels, compteursVides } from "../support/compteur-appels";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";
import { executeurSql } from "@/server/with-org";
import { PLAFONDS_VARIANTE_SIMULEE, type PlafondsUsage } from "@/server/config/usage";

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
 * Plafonds de test du voyage complet : ceux des bancs (`PLAFONDS_LARGES`, profil `complet` de la variante simulée, sans
 * élargissement), avec un cumul par organisation et par jour élargi : plusieurs passages par voyage et par jour (reprises),
 * chacun réserve son forfait. Valeurs de test, sans lien avec les montants réels (réservés à Samuel).
 */
const PLAFONDS_COMPLET: PlafondsUsage = { ...PLAFONDS_LARGES, parOrganisationJourMicros: 500_000_000 };

const dependances = (fabrique?: () => FabriqueGeneration, plafonds: PlafondsUsage = PLAFONDS_COMPLET): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  reserverEnSimulee: true,
  ...(fabrique === undefined ? {} : { composition: fabrique }),
});

/** Planification qui échoue (erreur passagère du fournisseur) à partir de l'appel numéro `apres` (0 : dès le premier jour). */
const planificationEnEchec = (apres = 0, echec: { readonly ok: false; readonly code: string; readonly retryable: boolean } = ECHEC_FOURNISSEUR) => {
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
            return appels > apres ? (echec as typeof ECHEC_FOURNISSEUR) : finale.planifier(...args);
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
async function voyageDebloque(org: Org, draft: Parameters<typeof demandeEdimbourg>[0] = {}, plafondsApercu: PlafondsUsage = PLAFONDS_COMPLET, fabrique?: () => FabriqueGeneration) {
  const outils = adaptateur();
  const r = await outils.adapter.createTrip(contexteDe(org), demandeEdimbourg(draft));
  expect(r).toMatchObject({ ok: true });
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId])).rows[0].id as string);
  expect((await derouler({ generationRunId: apercu, organizationId: org.org, rang: 0 }, dependances(fabrique, plafondsApercu))).arret).toBeUndefined();
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

  it("profil complet par défaut (valeurs de test) : un voyage de six jours va au bout sans plafond atteint", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(undefined, PLAFONDS_LARGES));
    // Le profil `complet` des bancs est celui de la variante simulée (valeur par défaut), sans élargissement propre au test.
    expect(PLAFONDS_LARGES.generations.complet).toEqual(PLAFONDS_VARIANTE_SIMULEE.generations.complet);
    expect(fin.arret).toBeUndefined();
    const apres = await lignes(org, tripId);
    expect(["ready", "incomplete"]).toContain(apres.complet[0]!.phase);
    expect(apres.versions.at(-1)!.snapshot.days.filter((d) => d.index >= 3 && d.items.some((i) => i.type === "stop")).length).toBeGreaterThan(0);
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

// --- Revue consolidée de la PR 600 (bloquant 2) : critères de B9d sur le workflow 4 ------------------------------------

type Journal = { recherches: string[]; ancrages: string[] };

/** Doubles d'Édimbourg observés : villes cherchées et ancrées ; recherche refusée ou interrompue pour une ville donnée. */
const observee =
  (journal: Journal, options: { readonly echoue?: (ville: string) => boolean; readonly pendant?: (ville: string) => Promise<void> } = {}) =>
  (): FabriqueGeneration => {
    const fabrique = composerSimuleeAvec({ doubles: () => doublesEdimbourg() });
    return {
      ...fabrique,
      recherche: (o): CapaciteRecherche => {
        const capacite = fabrique.recherche(o);
        return {
          async rechercher(...args) {
            journal.recherches.push(args[1].nom);
            await options.pendant?.(args[1].nom);
            if (options.echoue?.(args[1].nom) === true) return ECHEC_FOURNISSEUR;
            return capacite.rechercher(...args);
          },
        };
      },
      ancrage: (o): CapaciteAncrage => {
        const capacite = fabrique.ancrage(o);
        return {
          async ancrer(...args) {
            journal.ancrages.push(args[1]);
            return capacite.ancrer(...args);
          },
        };
      },
    };
  };

/**
 * Glasgow arrive le 24 (deuxième ville de l'aperçu), Londres le 26 : le changement de ville tombe en J4, pendant le complet.
 * Quartiers maison (centre et rayon fabriqués, posés sur la zone des fixtures d'Édimbourg des doubles ; aucune donnée Google) :
 * la zone de ces villes se résout sans appel.
 */
const quartier = (areaId: string) => ({ kind: "suggestedArea" as const, areaId, name: "[Quartier maison]", center: { lat: 55.95, lng: -3.19 }, radiusM: 3000 });
const TROIS_VILLES = {
  otherCities: [
    { name: "Glasgow", arrival: "2026-11-24", lodging: quartier("area_test_1") },
    { name: "Londres", arrival: "2026-11-26", lodging: quartier("area_test_2") },
  ],
};

/**
 * Voyage de trois villes : les requêtes Text Search du profil `complet` doublées. La part de l'étape `c` (80 % de 60) répartie sur deux villes
 * laisse 24 requêtes par ville, moins que les candidats d'une ville des doubles d'Édimbourg (écart signalé au Tech Lead dans la
 * PR 600). Valeurs de test.
 */
const PLAFONDS_TROIS_VILLES: PlafondsUsage = {
  ...PLAFONDS_COMPLET,
  generations: {
    ...PLAFONDS_COMPLET.generations,
    complet: { ...PLAFONDS_COMPLET.generations.complet, placesTextSearch: PLAFONDS_COMPLET.generations.complet.placesTextSearch * 2 },
  },
};

async function recherchesDe(org: Org, generationRunId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) =>
    (
      await c.query(
        `SELECT r.id, (SELECT count(*)::int FROM public.candidates k WHERE k.research_run_id = r.id) AS candidats,
           (SELECT array_agg(lower(k.name) ORDER BY k.name) FROM public.candidates k WHERE k.research_run_id = r.id) AS noms
         FROM public.research_runs r WHERE r.generation_run_id = $1 ORDER BY r.started_at, r.id`,
        [generationRunId],
      )
    ).rows as { id: string; candidats: number; noms: string[] | null }[],
  );
}

const ligneComplete = async (org: Org, tripId: string) =>
  (await admin.query("SELECT * FROM public.generation_runs WHERE organization_id = $1 AND trip_id = $2 AND kind = 'full'", [org.org, tripId])).rows[0] as Record<string, unknown>;

describe("voyage complet (B9d) : plusieurs villes, changement de ville pendant le complet", () => {
  it("chaque ville est cherchée et ancrée par le jour qui l'introduit ; reprise en cours de route : seule la ville manquante est cherchée", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org, TROIS_VILLES, PLAFONDS_TROIS_VILLES);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const entree: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    const apercu = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId])).rows[0].id as string);
    const recherchesApercu = await recherchesDe(org, apercu);
    expect(recherchesApercu).toHaveLength(2);

    // Passage 0 : J3 (Glasgow) publié ; J4 introduit Londres, dont la recherche échoue.
    const premier: Journal = { recherches: [], ancrages: [] };
    const { fin } = await deroulerComplet(entree, dependances(observee(premier, { echoue: (ville) => ville === "Londres" }), PLAFONDS_TROIS_VILLES));
    expect(fin.arret).toBe("upstream_unavailable");
    expect(premier.recherches).toEqual(["Glasgow", "Londres"]);
    expect(premier.ancrages).toEqual(["Glasgow"]);
    const apresEchec = await lignes(org, tripId);
    expect(apresEchec.versions.at(-1)!.request_id).toBe(requestIdDeVersion({ id: ligne.id, reprisesPersonne: 0, reprisesStudio: 0 }, 3));
    expect(etapesDuJour(apresEchec.versions.at(-1)!, 3)).toBeGreaterThan(0);
    const recherches0 = await recherchesDe(org, ligne.id);
    expect(recherches0).toHaveLength(1);
    // La ville de rang 0 du complet (Glasgow) reprend les candidats de la ville de rang 1 de l'aperçu (`rangDansLApercu`).
    for (const nom of recherchesApercu[1]!.noms ?? []) expect(recherches0[0]!.noms).toContain(nom);

    // Reprise : le passage 1 commence en J4, qui introduit Glasgow et Londres ; seule Londres est cherchée.
    expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: true, value: { tripId } });
    const second: Journal = { recherches: [], ancrages: [] };
    const { fin: fin2 } = await deroulerComplet(entree, dependances(observee(second), PLAFONDS_TROIS_VILLES));
    expect(fin2.arret).toBeUndefined();
    expect(second.recherches).toEqual(["Londres"]);
    expect(second.ancrages.length).toBeGreaterThan(0);
    expect(second.ancrages.every((ville) => ville === "Glasgow" || ville === "Londres")).toBe(true);
    // J5 et J6 n'introduisent aucune ville : aucun ancrage de plus que les villes introduites en J4.
    expect(second.ancrages.length).toBeLessThanOrEqual(2);
    expect(await recherchesDe(org, ligne.id)).toHaveLength(2);

    const finales = await lignes(org, tripId);
    const passage1 = finales.versions.slice(apresEchec.versions.length);
    expect(passage1[0]!.request_id).toBe(requestIdDeVersion({ id: ligne.id, reprisesPersonne: 1, reprisesStudio: 0 }, 4));
    // J3 (passage 0) et J1, J2 (aperçu) gardés.
    for (const j of [1, 2, 3]) expect(finales.versions.at(-1)!.snapshot.days.find((d) => d.index === j)).toEqual(apresEchec.versions.at(-1)!.snapshot.days.find((d) => d.index === j));
    expect(["ready", "incomplete"]).toContain(finales.complet[0]!.phase);
  }, 180_000);

  it("contrôle de rang : une recherche écrite entre-temps pour l'exécution arrête l'étape b sans rien écrire", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org, TROIS_VILLES, PLAFONDS_TROIS_VILLES);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const intrus = async (ville: string) => {
      if (ville !== "Londres") return;
      await admin.query(
        `INSERT INTO public.research_runs (organization_id, trip_id, generation_run_id, queries, pages_read, duration_ms, cost_estimate_micros, errors, started_at, finished_at)
         VALUES ($1, $2, $3, '{}', 0, 0, 0, '{}', now(), now())`,
        [org.org, tripId, ligne.id],
      );
    };
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(observee({ recherches: [], ancrages: [] }, { pendant: intrus }), PLAFONDS_TROIS_VILLES));
    expect(fin.arret).toBe("invalid_input");
    const recherches = await recherchesDe(org, ligne.id);
    // La recherche de Glasgow et l'intruse ; aucune ligne ni aucun candidat pour Londres.
    expect(recherches).toHaveLength(2);
    expect(recherches[1]!.candidats).toBe(0);
    expect((await lignes(org, tripId)).complet[0]).toMatchObject({ phase: "failed", stop_reason: "invalid_input" });
  }, 180_000);
});

/**
 * Réserve Text Search de l'étape `e` (décision 0113 § 3 bis, ticket #605) : Glasgow (`none`) de J2 à la fin, donc la ville
 * des quatre jours du complet. Chaque étape `e` positionne Glasgow par un Text Search de son nom : une requête par jour, prise
 * sur la part de `c` avant sa répartition. Text Search du profil doublés comme pour les autres tests à plusieurs villes
 * (0113 § 3 point 3) ; le reste du profil est celui des bancs.
 */
describe("voyage complet : ville sans logement sur plusieurs jours, réserve Text Search de l'étape e", () => {
  const draft = { otherCities: [{ name: "Glasgow", arrival: "2026-11-24", lodging: { kind: "none" as const } }] };
  // Les fixtures d'Édimbourg ne résolvent aucun nom de ville : « Glasgow » correspond, dans le double seulement, à une entrée
  // maison des fixtures (valeur sentinelle, aucune donnée Google).
  const doubles = (journal?: string[]) => () => {
    const d = doublesEdimbourg();
    return {
      ...d,
      places: {
        ...d.places,
        textSearch: (requete: Parameters<typeof d.places.textSearch>[0]) => {
          journal?.push(requete.texte);
          return d.places.textSearch(requete.texte === "Glasgow" ? { ...requete, texte: "Vieille ville d'Édimbourg (Old Town)" } : requete);
        },
      },
    };
  };

  it("un Text Search de e par jour de la ville none, part de c réduite d'autant, total inchangé", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org, draft, PLAFONDS_TROIS_VILLES, () => composerSimuleeAvec({ doubles: doubles() }));
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const partsC: number[] = [];
    const partsE: number[] = [];
    const textSearchE: string[] = [];
    const fabrique = (): FabriqueGeneration => {
      const base = composerSimuleeAvec({ doubles: doubles() });
      const comptee = composerSimuleeAvec({ doubles: doubles(textSearchE) });
      return {
        ...base,
        ancrage: (o) => (partsC.push(o.forfait.textSearchRequetes), base.ancrage(o)),
        finale: (o) => (partsE.push(o.forfait.textSearchRequetes), comptee.finale(o)),
      };
    };
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(fabrique, PLAFONDS_TROIS_VILLES));
    expect(fin.arret).toBeUndefined();
    // Quatre jours au complet (J3 à J6), tous à Glasgow : une requête exacte par étape `e`, un Text Search de son nom chacune.
    expect(partsE).toEqual([1, 1, 1, 1]);
    expect(textSearchE).toEqual(["Glasgow", "Glasgow", "Glasgow", "Glasgow"]);
    // Part de `c` : celle de `PARTS_FORFAIT` moins la réserve du passage (4), répartie sur les villes introduites.
    const total = PLAFONDS_TROIS_VILLES.generations.complet.placesTextSearch;
    expect(partsC.reduce((a, b) => a + b, 0)).toBe(partDe(total, PARTS_FORFAIT.textSearch, "c") - 4);
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]!.stop_reason).toBeNull();
    for (const jour of [3, 4, 5, 6]) expect(etapesDuJour(apres.versions.at(-1)!, jour)).toBeGreaterThan(0);
  }, 180_000);

  it("refus : réserve de e (4) + besoin propre de c (1) > part de c (4), la réserve seule tenant : cap_reached à l'étape a, avant tout appel ni réservation", async () => {
    // Réserve du passage : Glasgow (`none`) sur les quatre jours du complet, une requête par jour = 4. Besoin propre de `c` :
    // le Text Search du nom de Glasgow, seule ville introduite par le passage = 1 (0113 § 3 bis point 3). Profil `complet`
    // réduit à 5 Text Search : la part de `l` vaut 1, celle de `c` 4 ; la réserve seule tiendrait, pas avec le besoin de `c`.
    // Valeurs de test.
    const PLAFONDS_REFUS: PlafondsUsage = {
      ...PLAFONDS_COMPLET,
      generations: { ...PLAFONDS_COMPLET.generations, complet: { ...PLAFONDS_COMPLET.generations.complet, placesTextSearch: 5 } },
    };
    expect(partDe(5, PARTS_FORFAIT.textSearch, "c")).toBe(4);
    const org = await createOrg(auth);
    // Aperçu aux plafonds des autres tests à plusieurs villes : seul le profil `complet` du passage est réduit.
    const { adapter, tripId } = await voyageDebloque(org, draft, PLAFONDS_TROIS_VILLES, () => composerSimuleeAvec({ doubles: doubles() }));
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const avant = await lignes(org, tripId);
    const ligne = avant.complet[0]!;
    const registre = async () => inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT count(*)::int AS n FROM public.usage_ledger")).rows[0].n as number);
    const registreAvant = await registre();
    const compteurs = compteursVides();
    const { fin } = await deroulerComplet(
      { generationRunId: ligne.id, organizationId: org.org, rang: 0 },
      dependances(() => composerSimuleeAvec({ doubles: () => compterAppels(doubles()(), compteurs) }), PLAFONDS_REFUS),
    );
    expect(fin.arret).toBe("cap_reached");
    expect(fin.rang).toBe(RANG_COMPLET.a);
    // Aucun appel d'aucun fournisseur (ni `l`, ni `b`), aucune réservation du forfait du passage, aucune version publiée.
    expect(compteurs).toEqual(compteursVides());
    expect(await registre()).toBe(registreAvant);
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]).toMatchObject({ phase: "failed", stop_reason: "cap_reached" });
    expect(apres.versions).toEqual(avant.versions);
  }, 180_000);
});

describe("voyage complet (B9d) : plafonds, reprises refusées et lecture du voyage", () => {
  /** Profil `complet` réduit à dix fiches : la planification du premier jour (J3, deux fiches) dépasse sa part (`cap_reached`). */
  const PLAFONDS_DIX_FICHES: PlafondsUsage = {
    ...PLAFONDS_COMPLET,
    generations: { ...PLAFONDS_COMPLET.generations, complet: { ...PLAFONDS_COMPLET.generations.complet, placesDetails: 10 } },
  };

  it("plafond atteint au jour 3 d'un voyage de six jours : jours 1 et 2 gardés, aucun jour à moitié planifié ; reprise de la personne refusée sans écriture, reprise du studio arrêtée de même, compteur de la personne intact", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const avant = await lignes(org, tripId);
    const ligne = avant.complet[0]!;
    const espion = vi.spyOn(console, "log");
    const entree: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    const { fin } = await deroulerComplet(entree, dependances(undefined, PLAFONDS_DIX_FICHES));
    expect(fin.arret).toBe("cap_reached");
    expect(fin.rang).toBe(6);
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]).toMatchObject({ phase: "failed", stop_reason: "cap_reached" });
    // Aucune version écrite : les jours 1 et 2 de l'aperçu sont intacts, les jours 3 à 6 restent sans étape.
    expect(apres.versions).toEqual(avant.versions);
    for (const j of [3, 4, 5, 6]) expect(etapesDuJour(apres.versions.at(-1)!, j)).toBe(0);
    // Cause non réessayable : bloquée d'emblée (un événement), « Réessayer » refusé dès la première reprise, sans écriture.
    expect(evenementsBloques(espion)).toBe(1);
    expect(await adapter.getFullTripStatus(contexteDe(org), tripId)).toEqual({ ok: true, value: { phase: "failed", tripId, retryable: false } });
    const figee = await ligneComplete(org, tripId);
    expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed" }) });
    expect(await ligneComplete(org, tripId)).toEqual(figee);

    // Reprise du studio sous les mêmes plafonds : acceptée (aucune condition de cause), puis arrêtée comme pour la personne.
    const transaction = <T>(organizationId: string, travail: (x: ReturnType<typeof executeurSql>) => Promise<T>) =>
      creerWithSystemOrgPourTests(base.db)(organizationId, (tx) => travail(executeurSql(tx)));
    expect(await reprendreParLeStudio(["--organisation", org.org, "--voyage", tripId], { transaction })).toBe("repris");
    const { fin: fin2 } = await deroulerComplet(entree, dependances(undefined, PLAFONDS_DIX_FICHES));
    expect(fin2.arret).toBe("cap_reached");
    const reprise = (await lignes(org, tripId)).complet[0]!;
    expect(reprise).toMatchObject({ phase: "failed", stop_reason: "cap_reached", studio_retries: 1, reprises: [] });
    expect((await lignes(org, tripId)).versions).toEqual(avant.versions);
    expect(evenementsBloques(espion)).toBe(2);
    expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed" }) });
    expect((await lignes(org, tripId)).complet[0]!.reprises).toEqual([]);
  }, 180_000);

  it("part Routes du jour 4 sans matrice possible (une requête pour deux modes) : cap_reached, J3 publié et gardé, aucune version pour J4 (ticket 609)", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const avant = await lignes(org, tripId);
    const ligne = avant.complet[0]!;
    // Deux modes (marche et transports) : une matrice demande au moins deux requêtes. La part Routes de la deuxième étape `e`
    // (J4) est réduite à une requête : capacité nulle alors que le jour attend des lieux. Valeur de test.
    let appels = 0;
    const routesJ4: number[] = [];
    const fabrique = (): FabriqueGeneration => {
      const base = composerSimuleeAvec({ doubles: () => doublesEdimbourg() });
      return {
        ...base,
        finale: (o) => {
          appels += 1;
          if (appels !== 2) return base.finale(o);
          const reduite = { ...o, forfait: { ...o.forfait, routesRequetes: 1 } };
          const finale = base.finale(reduite);
          return { ...finale, planifier: async (entree) => (routesJ4.push(reduite.forfait.routesRequetes), finale.planifier(entree)) };
        },
      };
    };
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(fabrique));
    expect(routesJ4).toEqual([1]);
    expect(fin.arret).toBe("cap_reached");
    expect(fin.rang).toBe(rangDuJour(1, "e"));
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]).toMatchObject({ phase: "failed", stop_reason: "cap_reached" });
    // Une seule version de plus, celle de J3 : J4 n'en écrit aucune, jamais un jour publié vide en silence.
    expect(apres.versions).toHaveLength(avant.versions.length + 1);
    const derniere = apres.versions.at(-1)!;
    expect(derniere.request_id).toBe(requestIdDeVersion({ id: ligne.id, reprisesPersonne: 0, reprisesStudio: 0 }, 3));
    for (const j of [1, 2, 3]) expect(etapesDuJour(derniere, j)).toBeGreaterThan(0);
    for (const j of [4, 5, 6]) expect(etapesDuJour(derniere, j)).toBe(0);
  }, 180_000);

  it("voyage de dix jours aux valeurs de test : une requête Routes par jour pour deux modes, cap_reached au jour 3 au lieu de jours vides (ticket 609)", async () => {
    // Huit requêtes Routes du profil `complet` sur huit jours (J3 à J10) : une par jour, capacité nulle avec deux modes.
    expect(PLAFONDS_COMPLET.generations.complet.routesRequetes).toBe(8);
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org, { end: "2026-12-02" });
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const avant = await lignes(org, tripId);
    const ligne = avant.complet[0]!;
    const { fin } = await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances());
    expect(fin.arret).toBe("cap_reached");
    expect(fin.rang).toBe(rangDuJour(0, "e"));
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]).toMatchObject({ phase: "failed", stop_reason: "cap_reached" });
    // Aucune version écrite : J1 et J2 de l'aperçu gardés, J3 à J10 sans étape, et la ligne ne finit pas `ready`.
    expect(apres.versions).toEqual(avant.versions);
    for (const j of [1, 2]) expect(etapesDuJour(apres.versions.at(-1)!, j)).toBeGreaterThan(0);
  }, 180_000);

  it("quota refusé au jour 4 : J3 publié et gardé, J4 à J6 sans étape (aucun jour à moitié planifié)", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const { fin } = await deroulerComplet(
      { generationRunId: ligne.id, organizationId: org.org, rang: 0 },
      dependances(planificationEnEchec(1, { ok: false, code: "daily_quota_insufficient", retryable: false })),
    );
    expect(fin.arret).toBe("daily_quota_insufficient");
    const apres = await lignes(org, tripId);
    expect(apres.complet[0]).toMatchObject({ phase: "failed", stop_reason: "daily_quota_insufficient" });
    const derniere = apres.versions.at(-1)!;
    expect(derniere.request_id).toBe(requestIdDeVersion({ id: ligne.id, reprisesPersonne: 0, reprisesStudio: 0 }, 3));
    expect(etapesDuJour(derniere, 3)).toBeGreaterThan(0);
    for (const j of [4, 5, 6]) expect(etapesDuJour(derniere, j)).toBe(0);
  }, 180_000);

  it("« Réessayer » sans droit tripUnlocked : refusé, sans écriture", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    expect((await deroulerComplet({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, dependances(planificationEnEchec()))).fin.arret).toBe("upstream_unavailable");
    await admin.query("DELETE FROM public.entitlements WHERE organization_id = $1 AND trip_id = $2", [org.org, tripId]);
    const figee = await ligneComplete(org, tripId);
    expect(await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).toEqual({ ok: false, error: expect.objectContaining({ code: "validation_failed" }) });
    expect(await ligneComplete(org, tripId)).toEqual(figee);
  }, 180_000);

  it("deux écrivains concurrents (clôture sur erreur inattendue et expiration step_expired) : une seule écriture, un seul generation.full_stuck", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, avancer } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const deps = dependances();
    const etat = await etapeCompletDebut({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, deps);
    expect(etat.arret).toBeUndefined();
    // Ligne déjà reprise par le studio : tout échec la bloque, quel que soit l'écrivain gagnant.
    await admin.query("UPDATE public.generation_runs SET studio_retries = 1 WHERE id = $1", [ligne.id]);
    const espion = vi.spyOn(console, "log");
    avancer(EXPIRATION_EXECUTION_MS + 1);
    await Promise.all([etapeClotureComplet(etat, "upstream_unavailable", deps), adapter.getFullTripStatus(contexteDe(org), tripId), etapeClotureComplet(etat, "upstream_unavailable", deps)]);
    expect((await lignes(org, tripId)).complet[0]!.phase).toBe("failed");
    expect(evenementsBloques(espion)).toBe(1);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    expect(evenementsBloques(espion)).toBe(1);
  }, 180_000);

  it("clôture gardée par le rang : un ancien workflow ne clôt pas le passage suivant", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const deps = dependances();
    // Ancien workflow arrêté après l'étape c du premier jour (rang 4).
    let ancien: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    for (const etape of [etapeCompletDebut, etapeCompletLogement, etapeCompletRecherche, etapeCompletAncrage]) ancien = await etape(ancien, deps);
    expect(ancien.rang).toBe(4);
    // La ligne passe en failed puis est reprise : le nouveau passage est à l'étape a.
    await admin.query("UPDATE public.generation_runs SET phase = 'failed', stop_reason = 'step_expired', finished_at = now() WHERE id = $1", [ligne.id]);
    expect((await adapter.retryGeneration(contexteDe(org), { tripId, requestId: crypto.randomUUID(), kind: "full" })).ok).toBe(true);
    expect((await etapeCompletDebut({ generationRunId: ligne.id, organizationId: org.org, rang: 0 }, deps)).arret).toBeUndefined();
    await etapeClotureComplet(ancien, "upstream_unavailable", deps);
    expect((await lignes(org, tripId)).complet[0]!.phase).toBe("preparing");
  }, 180_000);

  it("Day.generating : vrai pour un jour sans étape pendant l'exécution, faux après la fin", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    // Relectures permissives (les lieux des doubles d'Édimbourg ne sont pas dans la table du double des voyages simulés).
    const relectures: SourceRelectures = {
      pour: async () => ({ ok: true, relectures: { validite: () => "valide", plages: () => INCONNU, duree: () => ({ minutes: 10, estimee: true }) } }),
    };
    const voyages = createApiTripAdapter({ relectures, withOrg });
    const enPreparation = async () => ((await voyages.getTrip(contexteDe(org), tripId))?.days ?? []).map((d) => [d.index, d.generating]);
    const deps = dependances();
    let etat: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };
    for (const etape of [etapeCompletDebut, etapeCompletLogement, ...ETAPES_JOUR]) etat = await etape(etat, deps);
    expect(etat.arret).toBeUndefined();
    // J3 publié, J4 à J6 encore sans étape : en préparation.
    expect(await enPreparation()).toEqual([
      [1, false],
      [2, false],
      [3, false],
      [4, true],
      [5, true],
      [6, true],
    ]);
    // Les trois jours restants (J4 à J6) : le dernier clôt la ligne.
    for (const etape of Array.from({ length: 3 }, () => ETAPES_JOUR).flat()) etat = await etape(etat, deps);
    expect(etat.arret).toBeUndefined();
    expect(["ready", "incomplete"]).toContain((await lignes(org, tripId)).complet[0]!.phase);
    expect(await enPreparation()).toEqual([1, 2, 3, 4, 5, 6].map((j) => [j, false]));
  }, 180_000);
});

/** Liste interdite du handover back-end § 8 (« workflows : aucune donnée Google dans l'état sérialisé »). */
const CLES_INTERDITES = [
  "rating", "userRatingCount", "openingHours", "regularOpeningHours", "currentOpeningHours", "businessStatus", "priceLevel",
  "photos", "phone", "nationalPhoneNumber", "internationalPhoneNumber", "address", "formattedAddress", "displayName", "reviews",
  "lat", "lng", "latitude", "longitude", "location", "viewport", "duration", "staticDuration", "distanceMeters", "polyline",
];

function toutesLesCles(valeur: unknown, cles: Set<string> = new Set()): Set<string> {
  if (Array.isArray(valeur)) for (const v of valeur) toutesLesCles(v, cles);
  else if (valeur !== null && typeof valeur === "object") {
    for (const [cle, v] of Object.entries(valeur)) {
      cles.add(cle);
      toutesLesCles(v, cles);
    }
  }
  return cles;
}

describe("workflows: aucune donnée Google dans l'état sérialisé (workflow 4)", () => {
  const verifier = (etats: readonly EtatComplet[]) => {
    for (const etat of etats) {
      const serialise = JSON.parse(JSON.stringify(etat)) as unknown;
      expect(EtatCompletSchema.safeParse(serialise).success).toBe(true);
      const cles = toutesLesCles(serialise);
      for (const cle of cles) expect(["generationRunId", "organizationId", "rang", "arret"]).toContain(cle);
      for (const interdite of CLES_INTERDITES) expect(cles.has(interdite)).toBe(false);
      if (etat.arret !== undefined) expect(CODES_ARRET as readonly string[]).toContain(etat.arret);
    }
  };

  it("entrées et sorties de chaque étape, voie nominale et erreur de fournisseur dont le message porte un lieu et une adresse", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId } = await voyageDebloque(org);
    await adapter.getFullTripStatus(contexteDe(org), tripId);
    const ligne = (await lignes(org, tripId)).complet[0]!;
    const entree: EtatComplet = { generationRunId: ligne.id, organizationId: org.org, rang: 0 };

    // Erreur de fournisseur au deuxième jour : son message (nom de lieu, adresse) ne sort pas de l'étape.
    const SENTINELLE = "Musée Sentinelle, 12 Royal Mile, Edinburgh EH1 1AA";
    let appels = 0;
    const fabrique = (): FabriqueGeneration => {
      const f = composerSimuleeAvec({ doubles: () => doublesEdimbourg() });
      return {
        ...f,
        finale: (o) => {
          const finale = f.finale(o);
          return {
            ...finale,
            planifier: async (...args: Parameters<typeof finale.planifier>) => {
              appels += 1;
              if (appels > 1) throw new Error(SENTINELLE);
              return finale.planifier(...args);
            },
          };
        },
      };
    };
    const echec = await deroulerComplet(entree, dependances(fabrique));
    expect(echec.fin.arret).toBeDefined();
    verifier([entree, ...echec.sorties]);
    expect(JSON.stringify(echec.sorties)).not.toContain("Sentinelle");
    const stop = (await lignes(org, tripId)).complet[0]!.stop_reason;
    expect(CODES_ARRET as readonly string[]).toContain(stop);
    const erreurs = await admin.query("SELECT errors::text AS e FROM public.research_runs WHERE generation_run_id = $1", [ligne.id]);
    for (const { e } of erreurs.rows) expect(String(e)).not.toContain("Sentinelle");

    // Reprise (par le studio : la cause peut ne pas être réessayable), puis voie nominale jusqu'au dernier jour.
    const transaction = <T>(organizationId: string, travail: (x: ReturnType<typeof executeurSql>) => Promise<T>) =>
      creerWithSystemOrgPourTests(base.db)(organizationId, (tx) => travail(executeurSql(tx)));
    expect(await reprendreParLeStudio(["--organisation", org.org, "--voyage", tripId], { transaction })).toBe("repris");
    const nominale = await deroulerComplet(entree, dependances());
    expect(nominale.fin.arret).toBeUndefined();
    verifier([entree, ...nominale.sorties]);
  }, 180_000);
});
