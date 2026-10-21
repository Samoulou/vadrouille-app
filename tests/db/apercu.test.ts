import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { OrgTransaction } from "@/server/with-org";
import { EtatEtapeSchema, type EtatEtape } from "@/server/generation/etat";
import { etapeBrief, etapeCloture, etapeLogement } from "@/server/generation/etapes";

import {
  MAINTENANT,
  doublesEdimbourg,
  PLAFONDS_LARGES,
  banc,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  ETAPES,
  derouler,
} from "../support/banc-apercu";
import { compterAppels, compteursVides } from "../support/compteur-appels";
import { journalDePrompts } from "../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../support/sentinelles-google";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Aperçu de B9c (workflows 1, 2 et 3) sur la base réelle, avec les doubles de fournisseurs (variante simulée : fixtures
 * d'Édimbourg). Aucune clé, aucun appel réel, aucune écriture de programme.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;

// Base jetable : les forfaits de l'aperçu n'entrent pas dans les sommes du jour de la base commune (`usage.test.ts`).
beforeAll(async () => {
  base = await creerBaseApercu("apercu");
  ({ db, app, auth, admin } = base);
  withOrg = creerWithOrg(db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

type Surcharge = Partial<Omit<FabriqueGeneration, "variante">>;

function dependances(surcharge: Partial<DependancesGeneration> = {}, fabrique?: () => FabriqueGeneration): DependancesGeneration {
  return {
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    plafonds: PLAFONDS_LARGES,
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    // Bancs de la séquence de réservation : la variante simulée réserve aussi dans `usage_ledger` (décision 0110 § 3).
    reserverEnSimulee: true,
    ...(fabrique === undefined ? {} : { composition: fabrique }),
    ...surcharge,
  };
}

const avec = (surcharge: Surcharge): (() => FabriqueGeneration) => {
  const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
  return () => ({ ...base, ...surcharge });
};

async function nouvelleOrg(): Promise<Org> {
  return createOrg(auth);
}

async function lancer(org: Org, demande = demandeEdimbourg()) {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demande);
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await dernierRun(org, tripId);
  const etat: EtatEtape = { generationRunId: run.id, organizationId: org.org, rang: 0 };
  return { adapter, tripId, run, etat };
}

async function dernierRun(org: Org, tripId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(
      "SELECT id, phase, stop_reason, step_seq FROM public.generation_runs WHERE trip_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1",
      [tripId],
    );
    return rows[0] as { id: string; phase: string; stop_reason: string | null; step_seq: number };
  });
}

async function nombre(org: Org, table: string, tripId: string): Promise<number> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM public.${table} WHERE trip_id = $1`, [tripId]);
    return rows[0].n as number;
  });
}

async function propositions(org: Org, tripId: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query("SELECT position, slot_type, day, content FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId]);
    return rows as { position: number; slot_type: string; day: number; content: unknown }[];
  });
}

/** Texte SQL d'une requête de drizzle (fragments de texte seulement, paramètres exclus). */
function texteSql(requete: unknown): string {
  const morceaux: string[] = [];
  const visiter = (noeud: unknown): void => {
    if (typeof noeud !== "object" || noeud === null) return;
    const objet = noeud as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(objet.queryChunks)) objet.queryChunks.forEach(visiter);
    else if (Array.isArray(objet.value) && objet.value.every((v) => typeof v === "string")) morceaux.push(...(objet.value as string[]));
  };
  visiter(requete);
  return morceaux.join("");
}

/** Transaction système dont les requêtes passent par `intercepter` : une promesse rejetée simule une panne de la base. */
function transactionIntercepte(intercepter: (texte: string) => Promise<never> | null): NonNullable<DependancesGeneration["transaction"]> {
  const base = creerWithSystemOrgPourTests(db);
  return (organizationId, fn) =>
    base(organizationId, (tx) => {
      const enveloppe = {
        execute: (requete: Parameters<typeof tx.execute>[0]) => intercepter(texteSql(requete)) ?? tx.execute(requete),
      } as unknown as OrgTransaction;
      return fn(enveloppe);
    });
}

const ECHEC_FOURNISSEUR = { ok: false, code: "upstream_unavailable", retryable: true } as const;

describe("aperçu : chemin nominal (Édimbourg)", () => {
  it("publie huit cases, une version, une exécution prête ou incomplète", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, run, etat } = await lancer(org);
    const fin = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    const apres = await dernierRun(org, tripId);
    expect(apres.stop_reason).toBeNull();
    const cases = await propositions(org, tripId);
    expect(cases).toHaveLength(8);
    expect(apres.phase).toBe(cases.every((c) => c.slot_type === "proposal") ? "ready" : "incomplete");
    expect(cases.filter((c) => c.slot_type === "proposal").length + cases.filter((c) => c.slot_type === "noOption").length).toBe(8);
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    const creneaux = await inTx(app, { org: org.org, user: org.owner }, async (c) => {
      const { rows } = await c.query("SELECT day, time FROM public.proposals WHERE trip_id = $1", [tripId]);
      return rows.map((r) => `${r.day}|${r.time}`);
    });
    expect(new Set(creneaux).size).toBe(8);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase).toBe(apres.phase);
    expect(run.id).toBe(apres.id);
  });

  it("garde de la publication : une étape e déjà passée est refusée, une seule version, aucune case en double", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    await derouler(etat, dependances());
    const avant = await propositions(org, tripId);
    const { etapePlanification } = await import("@/server/generation/etapes");
    const runAvant = await dernierRun(org, tripId);
    // Rejeu d'une étape déjà passée (même rang d'entrée que l'original) : la garde `step_seq` refuse, rien n'est écrit.
    const rejeu = await etapePlanification({ ...etat, rang: 4 }, dependances());
    expect(rejeu.arret).toBe("step_expired");
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect(await propositions(org, tripId)).toEqual(avant);
    expect((await dernierRun(org, tripId)).step_seq).toBe(runAvant.step_seq);
  });
});

describe("aperçu : état sérialisé, prompts et données Google", () => {
  it("l'état entre étapes ne porte que les quatre champs fermés", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const apresA = await etapeBrief(etat, dependances());
    const apresL = await etapeLogement(apresA, dependances());
    for (const e of [apresA, apresL]) {
      expect(EtatEtapeSchema.safeParse(e).success).toBe(true);
      expect(Object.keys(e).sort().filter((k) => !["generationRunId", "organizationId", "rang", "arret"].includes(k))).toEqual([]);
      expect(JSON.stringify(e)).not.toMatch(/test_place|SENTINELLE|lat|lng/);
    }
  });

  it("l'état est un strictObject { generationRunId, organizationId, rang, arret? } (0105 § 1) : clé en plus ou en moins refusée", () => {
    const valide = { generationRunId: crypto.randomUUID(), organizationId: crypto.randomUUID(), rang: 0 };
    expect(EtatEtapeSchema.safeParse(valide).success).toBe(true);
    expect(EtatEtapeSchema.safeParse({ ...valide, arret: "cap_reached" }).success).toBe(true);
    expect(EtatEtapeSchema.safeParse({ ...valide, arret: "message libre" }).success).toBe(false);
    expect(EtatEtapeSchema.safeParse({ ...valide, tripId: crypto.randomUUID() }).success).toBe(false);
    expect(EtatEtapeSchema.safeParse({ ...valide, lat: 55.95 }).success).toBe(false);
    const sans = { generationRunId: valide.generationRunId, rang: valide.rang };
    expect(EtatEtapeSchema.safeParse(sans).success).toBe(false);
    expect(EtatEtapeSchema.safeParse({ ...valide, organizationId: "pas-un-uuid" }).success).toBe(false);
  });

  it("organisation qui ne possède pas l'exécution : arrêt sans écriture ni appel, la portée n'est jamais élargie", async () => {
    const proprietaire = await nouvelleOrg();
    const autre = await nouvelleOrg();
    const { tripId, run, etat } = await lancer(proprietaire);
    const compteurs = compteursVides();
    const deps = dependances({}, () => composerSimuleeAvec({ doubles: () => compterAppels(doublesEdimbourg(), compteurs) }));
    const avant = await dernierRun(proprietaire, tripId);
    const registreAvant = await inTx(app, { org: proprietaire.org, user: proprietaire.owner }, async (c) => (await c.query("SELECT count(*)::int AS n FROM public.usage_ledger")).rows[0].n as number);
    const fausse: EtatEtape = { ...etat, organizationId: autre.org };
    for (const etape of ETAPES) {
      const sortie = await etape(fausse, deps);
      expect(sortie.arret, "l'étape s'arrête").toBeDefined();
      expect(sortie.organizationId).toBe(autre.org);
    }
    expect(compteurs).toEqual(compteursVides());
    expect(await dernierRun(proprietaire, tripId)).toEqual(avant);
    expect(avant.id).toBe(run.id);
    expect(await nombre(proprietaire, "research_runs", tripId)).toBe(0);
    expect(await nombre(proprietaire, "trip_versions", tripId)).toBe(0);
    const registreApres = await inTx(app, { org: proprietaire.org, user: proprietaire.owner }, async (c) => (await c.query("SELECT count(*)::int AS n FROM public.usage_ledger")).rows[0].n as number);
    expect(registreApres).toBe(registreAvant);
    // L'autre organisation n'a reçu aucune exécution ni aucune ligne.
    const chez = await inTx(app, { org: autre.org, user: autre.owner }, async (c) => (await c.query("SELECT count(*)::int AS n FROM public.generation_runs")).rows[0].n as number);
    expect(chez).toBe(0);
  });

  it("canari : aucun prompt ni requête de recherche ne contient de donnée Google", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const textes: string[] = [];
    const sentinelles = avecSentinellesGoogle(doublesEdimbourg());
    const journaux: ReturnType<typeof journalDePrompts>[] = [];
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          const s = avecSentinellesGoogle(d);
          for (const v of s.valeurs) sentinelles.valeurs.add(v);
          const j = journalDePrompts(d.modeles);
          journaux.push(j);
          // Le niveau de prix sentinelle n'est pas une valeur valide du contrat de lieu : on garde celui du double.
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
    const fin = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeUndefined();
    for (const j of journaux) textes.push(j.texte());
    expect(textes.join("").length).toBeGreaterThan(0);
    // Les placeId de fixtures ne servent qu'après le rendu : on cherche les sentinelles de champs.
    const trouvees = sentinellesPresentes(textes.join("\n"), sentinelles);
    expect(trouvees).toEqual([]);
  });
});

describe("aperçu : échecs et reprise", () => {
  it("erreur du fournisseur à la recherche : failed, retryable, rien d'écrit, puis relance sans doublon", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fin = await derouler(
      etat,
      dependances({}, avec({ recherche: () => ({ rechercher: async () => ECHEC_FOURNISSEUR }) as never }) ),
    );
    expect(base.variante).toBe("simulee");
    expect(fin.arret).toBe("upstream_unavailable");
    const run = await dernierRun(org, tripId);
    expect(run.phase).toBe("failed");
    expect(run.stop_reason).toBe("upstream_unavailable");
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(true);

    const { demarrer } = banc(withOrg);
    expect(demarrer).toBeDefined();
    const requestId = crypto.randomUUID();
    const relance = await adapter.retryGeneration(contexteDe(org), { tripId, requestId });
    expect(relance.ok).toBe(true);
    const run2 = await dernierRun(org, tripId);
    expect(run2.id).not.toBe(run.id);
    const fin2 = await derouler({ generationRunId: run2.id, organizationId: org.org, rang: 0 }, dependances());
    expect(fin2.arret).toBeUndefined();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect((await propositions(org, tripId)).length).toBe(8);
  });

  it("plafond atteint à la notation : failed cap_reached non relançable, rien d'écrit", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    const fin = await derouler(
      etat,
      dependances({ plafonds: { ...PLAFONDS_LARGES, generations: { ...PLAFONDS_LARGES.generations, apercu: { ...PLAFONDS_LARGES.generations.apercu, coutModelesMicros: 1_000_000_000 } }, parOrganisationJourMicros: 1 } }),
    );
    expect(["cap_reached", "envelope_reached"]).toContain(fin.arret);
    const run = await dernierRun(org, tripId);
    expect(run.phase).toBe("failed");
    expect(["cap_reached", "envelope_reached"]).toContain(run.stop_reason);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(false);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
  });

  it("garde de l'étape : une exécution déjà close n'est pas réécrite", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const apresA = await etapeBrief(etat, dependances());
    const clos = await etapeCloture(apresA, "upstream_error", dependances());
    expect(clos.arret).toBe("upstream_error");
    const suite = await derouler({ ...apresA, arret: undefined } as EtatEtape, dependances());
    expect(suite.arret).toBe("step_expired");
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
    expect(await nombre(org, "proposals", tripId)).toBe(0);
  });

  it("coordonnées: par défaut (écriture non autorisée, 0081 B9-TL-9), aucune position ni trajet écrit : une seule version", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    const { rows } = await admin.query("SELECT count(*)::int AS n FROM public.place_coordinates WHERE organization_id = $1", [org.org]);
    expect(rows[0].n).toBe(0);
  });
});

describe("aperçu : cases, publication et forfait", () => {
  it("huit cases : proposal puis noOption, statut cohérent avec le nombre de cases prêtes", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    await derouler(etat, dependances());
    const cases = await propositions(org, tripId);
    const prets = cases.filter((c) => c.slot_type === "proposal").length;
    expect(cases.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    // Les cases `proposal` précèdent toujours les cases `noOption` ; le jour ne décroît jamais.
    expect(cases.slice(0, prets).every((c) => c.slot_type === "proposal")).toBe(true);
    expect(cases.slice(prets).every((c) => c.slot_type === "noOption")).toBe(true);
    const jours = (liste: typeof cases) => liste.map((c) => c.day);
    expect(jours(cases.slice(0, prets))).toEqual([...jours(cases.slice(0, prets))].sort((a, b) => a - b));
    expect(jours(cases).every((jour) => jour === 1 || jour === 2)).toBe(true);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase).toBe(prets === 8 ? "ready" : "incomplete");
  });

  it("publication atomique : trois échecs de l'écriture finale ne laissent ni case ni version", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    let refus = 0;
    const transaction = transactionIntercepte((texte) => {
      if (!texte.includes("last_version")) return null;
      refus += 1;
      return Promise.reject(new Error("panne injectée"));
    });
    const fin = await derouler(etat, dependances({ transaction }));
    expect(refus).toBe(3);
    // Panne de base ou publication épuisée : cause externe passagère, donc réessayable (0081 B9-TL-3 points 2 et 4).
    expect(fin.arret).toBe("upstream_unavailable");
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(true);
    expect((await dernierRun(org, tripId)).stop_reason).toBe("upstream_unavailable");
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    const run = await dernierRun(org, tripId);
    expect(run.phase).toBe("failed");
  });

  it("publication : une panne passagère est rejouée sans appel externe, une seule version", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    let refus = 0;
    const transaction = transactionIntercepte((texte) => {
      if (refus >= 1 || !texte.includes("last_version")) return null;
      refus += 1;
      return Promise.reject(new Error("panne injectée"));
    });
    const fin = await derouler(etat, dependances({ transaction }));
    expect(fin.arret).toBeUndefined();
    expect(refus).toBe(1);
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect(await nombre(org, "proposals", tripId)).toBe(8);
  });

  it("forfait réservé avant tout appel : refus, aucune composition ouverte, exécution failed", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    let compositions = 0;
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fin = await derouler(
      etat,
      dependances({ plafonds: { ...PLAFONDS_LARGES, parOrganisationJourMicros: 1 } }, () => {
        compositions += 1;
        return base;
      }),
    );
    expect(["cap_reached", "envelope_reached"]).toContain(fin.arret);
    expect(compositions).toBe(0);
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
  });

  it("variante simulée par défaut : forfait en mémoire, aucune ligne dans usage_ledger, sommes lues par la variante réelle inchangées (0110 § 3)", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const lire = () =>
      inTx(app, { org: org.org, user: org.owner }, async (c) => ({
        sommes: (await c.query("SELECT * FROM public.usage_forfait_totals()")).rows[0],
        lignes: (await c.query("SELECT count(*)::int AS n FROM public.usage_ledger")).rows[0].n as number,
      }));
    const avant = await lire();
    const fin = await derouler(etat, dependances({ reserverEnSimulee: false }));
    expect(fin.arret).toBeUndefined();
    expect(await nombre(org, "proposals", tripId)).toBe(8);
    expect(await lire()).toEqual(avant);
  });

  it("plafonds absents (production) : usage_unavailable, aucune composition", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const fin = await derouler(etat, dependances({ plafonds: null }));
    expect(fin.arret).toBe("usage_unavailable");
  });

  it("barrière : sans déclaration d'environnement, production_refused, aucune écriture", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances({ barriere: { env: {} } }));
    expect(fin.arret).toBe("production_refused");
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "research_runs", tripId)).toBe(0);
  });

  it("logement introuvable : arrêt, aucun appel de modèle", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const journaux: ReturnType<typeof journalDePrompts>[] = [];
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          const j = journalDePrompts(d.modeles);
          journaux.push(j);
          return {
            ...d,
            modeles: j.client,
            places: { ...d.places, textSearch: async () => ({ placeIds: [] }), position: async () => { throw new Error("introuvable"); } } as never,
          };
        },
      });
    const fin = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBe("lodging_unresolved");
    expect(journaux.flatMap((j) => j.requetes)).toHaveLength(0);
    const { adapter, tripId } = { adapter: banc(withOrg).adapter, tripId: (await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT trip_id FROM public.generation_runs WHERE id = $1", [etat.generationRunId])).rows[0].trip_id as string)) };
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.reason).toBe("provider_error");
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(false);
  });
});
