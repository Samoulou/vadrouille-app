import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { ClientRechercheWeb } from "@/ai/recherche-web";
import { composerSimuleeAvec, type FabriqueGeneration } from "@/server/composition/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { PortPositions } from "@/grounding/port-positions";
import type { EtatEtape } from "@/server/generation/etat";
import { etapeBrief } from "@/server/generation/etapes";
import type { OrgTransaction } from "@/server/with-org";

import {
  ETAPES,
  doublesEdimbourg,
  MAINTENANT,
  PLAFONDS_LARGES,
  banc,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
  demandeEdimbourg,
  derouler,
} from "../support/banc-apercu";
import { journalDePrompts } from "../support/journal-prompts";
import { avecSentinellesGoogle, sentinellesPresentes } from "../support/sentinelles-google";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Revue de la PR #563 (head 37cab3b), bloquant 7 : critères de l'aperçu mesurés sur la base réelle, avec les doubles de
 * fournisseurs (variante simulée). Aucune clé, aucun appel réel, aucune écriture de programme.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;

// Base jetable : les forfaits de l'aperçu n'entrent pas dans les sommes du jour de la base commune (`usage.test.ts`).
beforeAll(async () => {
  base = await creerBaseApercu("revue");
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

const nouvelleOrg = (): Promise<Org> => createOrg(auth);

async function lancer(org: Org) {
  const { adapter } = banc(withOrg);
  const r = await adapter.createTrip(contexteDe(org), demandeEdimbourg());
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

type LigneUsage = { step: string; provider: string; sku: string; units: number };

/** Lignes du registre d'usage d'une exécution, triées pour la comparaison. */
async function usage(org: Org, runId: string): Promise<LigneUsage[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(
      "SELECT step, provider, sku, units::int AS units FROM public.usage_ledger WHERE generation_run_id = $1 ORDER BY step, provider, sku, created_at",
      [runId],
    );
    return rows as LigneUsage[];
  });
}

const ECHEC_RETRYABLE = { ok: false, code: "upstream_unavailable", retryable: true } as const;
const ECHEC_FERME = { ok: false, code: "cap_reached", retryable: false } as const;

describe("aperçu (revue) : barrière à l'entrée de chaque étape", () => {
  it.each(ETAPES.map((etape, i) => [i, etape.name] as const))("étape %i : sans déclaration d'environnement, production_refused, aucun forfait ni composition", async (rang) => {
    const org = await nouvelleOrg();
    const { tripId, run, etat } = await lancer(org);
    const apres = await derouler(etat, dependances(), rang);
    expect(apres.arret).toBeUndefined();
    const avant = await usage(org, run.id);
    let compositions = 0;
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const refusee = await ETAPES[rang]!(
      apres,
      dependances({ barriere: { env: {} } }, () => {
        compositions += 1;
        return base;
      }),
    );
    expect(refusee.arret).toBe("production_refused");
    expect(compositions).toBe(0);
    expect(await usage(org, run.id)).toEqual(avant);
    const fin = await dernierRun(org, tripId);
    expect(fin.phase).toBe("failed");
    expect(fin.stop_reason).toBe("production_refused");
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
  });
});

describe("aperçu (revue) : forfait et registre d'usage", () => {
  it("chemin nominal : le registre ne porte que des lignes réservées par étape (fiches et matrices : tests `critères`)", async () => {
    const org = await nouvelleOrg();
    const { run, etat } = await lancer(org);
    const fin = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    const lignes = await usage(org, run.id);
    expect(lignes.length).toBeGreaterThan(0);
    const etapes = new Set(lignes.map((l) => l.step));
    for (const e of etapes) expect(["b", "c", "d", "e", "f", "forfait"]).toContain(e);
  });

  it("rejeu : une étape déjà passée ne se réexécute pas et le registre ne bouge pas", async () => {
    const org = await nouvelleOrg();
    const { run, etat } = await lancer(org);
    const apresA = await derouler(etat, dependances(), 3);
    const avant = await usage(org, run.id);
    const rejeu = await ETAPES[1]!(apresA, dependances());
    expect(rejeu.arret).toBe("step_expired");
    expect(await usage(org, run.id)).toEqual(avant);
  });

  it("le forfait de l'exécution est réservé une seule fois : un plafond d'organisation abaissé après l'étape a ne change pas les étapes suivantes", async () => {
    const org = await nouvelleOrg();
    const { run, etat } = await lancer(org);
    const apresA = await derouler(etat, dependances(), 2);
    expect(apresA.arret).toBeUndefined();
    const forfaits = async () => (await usage(org, run.id)).filter((l) => l.step === "forfait");
    const reserve = await forfaits();
    expect(reserve.length).toBeGreaterThan(0);
    const suite = await ETAPES[2]!(apresA, dependances({ plafonds: { ...PLAFONDS_LARGES, parOrganisationJourMicros: 1 } }));
    expect(suite.arret).toBeUndefined();
    expect(await forfaits()).toEqual(reserve);
  });

  it("plafond de l'organisation atteint avant la première réservation : arrêt fermé, non relançable, rien de publié", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances({ plafonds: { ...PLAFONDS_LARGES, parOrganisationJourMicros: 1 } }), 3);
    expect(["cap_reached", "envelope_reached"]).toContain(fin.arret);
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(false);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
  });
});

describe("aperçu (revue) : erreurs de fournisseur par étape", () => {
  const CAS: readonly (readonly [string, number, (echec: typeof ECHEC_RETRYABLE | typeof ECHEC_FERME) => Surcharge])[] = [
    ["logement", 1, (e) => ({ logement: () => ({ verifier: async () => e }) })],
    ["recherche", 2, (e) => ({ recherche: () => ({ rechercher: async () => e }) })],
    ["ancrage", 3, (e) => ({ ancrage: () => ({ ancrer: async () => e }) })],
    ["notation", 4, (e) => ({ notation: () => ({ noter: async () => e }) })],
  ];

  it.each(CAS)("%s : erreur passagère, failed et relançable ; erreur fermée, failed et non relançable ; rien d'écrit", async (_nom, rang, surcharge) => {
    for (const [echec, relancable] of [[ECHEC_RETRYABLE, true], [ECHEC_FERME, false]] as const) {
      const org = await nouvelleOrg();
      const { adapter, tripId, etat } = await lancer(org);
      const progres = await derouler(etat, dependances(), rang);
      expect(progres.arret).toBeUndefined();
      const fin = await ETAPES[rang]!(progres, dependances({}, avec(surcharge(echec) as Surcharge)));
      expect(fin.arret).toBe(echec.code);
      const run = await dernierRun(org, tripId);
      expect(run.phase).toBe("failed");
      expect(run.stop_reason).toBe(echec.code);
      const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
      expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(relancable);
      expect(await nombre(org, "proposals", tripId)).toBe(0);
      expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    }
  });

  it("planification : erreur du moteur final, failed, rien d'écrit", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const progres = await derouler(etat, dependances(), 5);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fin = await ETAPES[5]!(
      progres,
      dependances({}, () => ({ ...base, finale: (o) => ({ ...base.finale(o), planifier: async () => ECHEC_RETRYABLE }) })),
    );
    expect(fin.arret).toBe("upstream_unavailable");
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
  });
});

describe("aperçu (revue) : étape a et panne de la base", () => {
  it("l'étape a relève une panne passagère de la base pour que la file la rejoue ; la garde admet le rejeu", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const base = creerWithSystemOrgPourTests(db);
    let pannes = 0;
    const transaction: NonNullable<DependancesGeneration["transaction"]> = (organizationId, fn) =>
      base(organizationId, (tx) => {
        if (pannes === 0) {
          pannes += 1;
          return Promise.reject(new Error("panne injectée"));
        }
        return fn(tx as OrgTransaction);
      });
    await expect(etapeBrief(etat, dependances({ transaction }))).rejects.toThrow("panne injectée");
    const rejeu = await etapeBrief(etat, dependances());
    expect(rejeu.arret).toBeUndefined();
  });
});

describe("aperçu (revue) : repli sans option", () => {
  it("aucun candidat noté : huit cases noOption, phase incomplète, aucun motif d'échec, une version publiée", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    // La notation ne note rien : aucun candidat n'a de notes, donc aucun n'a de rôle dans le programme (B9-PO-9).
    const fin = await derouler(etat, dependances({}, avec({ notation: () => ({ noter: async () => ({ ok: true, valeur: new Map() }) }) })));
    expect(fin.arret).toBeUndefined();
    const run = await dernierRun(org, tripId);
    expect(run.phase).toBe("incomplete");
    expect(run.stop_reason).toBeNull();
    const cases = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT slot_type, day, time FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId])).rows as { slot_type: string; day: number; time: string }[]);
    expect(cases).toHaveLength(8);
    expect(cases.every((c) => c.slot_type === "noOption")).toBe(true);
    expect(new Set(cases.map((c) => `${c.day}|${c.time}`)).size).toBe(8);
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "incomplete" && [statut.value.ready, statut.value.expected]).toEqual([0, 8]);
  });
});

describe("aperçu (revue) : aucune donnée Google en entrée de la recherche web", () => {
  it("canari : les requêtes de recherche web ne portent aucune sentinelle Google", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const requetes: string[] = [];
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
          const web: ClientRechercheWeb = {
            ...d.rechercheWeb,
            async rechercher(requete: string) {
              requetes.push(requete);
              return d.rechercheWeb.rechercher(requete);
            },
          } as ClientRechercheWeb;
          const places = { ...d.places, textSearch: s.places.textSearch, async details(placeId: string) { const [decore, brut] = await Promise.all([s.places.details(placeId), d.places.details(placeId)]); return { ...decore, niveauPrix: brut.niveauPrix }; } };
          return { ...d, modeles: j.client, rechercheWeb: web, places, routes: s.routes };
        },
      });
    const fin = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeUndefined();
    expect(requetes.length).toBeGreaterThan(0);
    expect(sentinellesPresentes(requetes.join("\n"), sentinelles)).toEqual([]);
  });
});

/** Horloge calée sur celle de la base : le port refuse des positions obtenues plus d'une minute dans le futur (0060 § 1.3). */
const horlogeDeLaBase = () => creerHorlogeManuelle(Date.now());

describe("aperçu (revue) : coordonnées: positions au cache (0060 § 4, B8c fusionnée)", () => {
  const positionsCache = async (org: Org) => {
    const { rows } = await admin.query("SELECT place_id, fetched_at FROM public.place_coordinates WHERE organization_id = $1 ORDER BY place_id", [org.org]);
    return rows as { place_id: string; fetched_at: Date }[];
  };

  it("coordonnées: écrites avec la version publiée seulement", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances({ ecriturePositions: true, horloge: horlogeDeLaBase() }));
    expect(fin.arret).toBeUndefined();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    const ecrites = await positionsCache(org);
    expect(ecrites.length).toBeGreaterThan(0);
    // Un seul placeId par lieu publié : jamais plus que les cases prêtes.
    expect(ecrites.length).toBeLessThanOrEqual(await nombre(org, "proposals", tripId));
  });

  it("coordonnées: aucune position écrite quand la publication échoue (transaction annulée en entier)", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    const base = creerWithSystemOrgPourTests(db);
    const transaction: NonNullable<DependancesGeneration["transaction"]> = (organizationId, fn) =>
      base(organizationId, (tx) => {
        const enveloppe = {
          execute: async (requete: Parameters<typeof tx.execute>[0]) => {
            const resultat = await tx.execute(requete);
            const texte = JSON.stringify((requete as { queryChunks?: unknown }).queryChunks ?? "");
            if (texte.includes("last_version")) throw new Error("panne injectée après les positions");
            return resultat;
          },
        } as unknown as OrgTransaction;
        return fn(enveloppe);
      });
    const fin = await derouler(etat, dependances({ transaction, ecriturePositions: true, horloge: horlogeDeLaBase() }));
    // Publication épuisée : panne externe passagère, donc réessayable (0081 B9-TL-3 points 2 et 4).
    expect(fin.arret).toBe("upstream_unavailable");
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(true);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    expect(await positionsCache(org)).toEqual([]);
  });

  it("coordonnées: une position lue n'est jamais réécrite", async () => {
    const org = await nouvelleOrg();
    const premier = await lancer(org);
    await derouler(premier.etat, dependances({ ecriturePositions: true, horloge: horlogeDeLaBase() }));
    const avant = await positionsCache(org);
    expect(avant.length).toBeGreaterThan(0);
    const second = await lancer(org);
    await derouler(second.etat, dependances({ ecriturePositions: true, horloge: horlogeDeLaBase() }));
    const apres = await positionsCache(org);
    expect(apres.map((l) => [l.place_id, l.fetched_at.getTime()])).toEqual(avant.map((l) => [l.place_id, l.fetched_at.getTime()]));
  });

  it("coordonnées: échec d'écriture traité (base, non relançable) : l'étape s'arrête sur upstream_error, rien de publié", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const portEnPanne = (): PortPositions => ({
      lire: async () => ({ ok: true, valeur: new Map() }),
      ecrire: async () => ({ ok: false, code: "base", retryable: false }),
    });
    const fin = await derouler(etat, dependances({ ecriturePositions: true, portPositions: portEnPanne }));
    expect(fin.arret).toBe("upstream_error");
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
  });

  it("coordonnées: écriture suspendue ou non autorisée : aucun appel au port, aucune ligne", async () => {
    for (const env of [{ VADROUILLE_ENV: "ci", POSITIONS_ECRITURE_SUSPENDUE: "1" }, { VADROUILLE_ENV: "ci" }]) {
      const org = await nouvelleOrg();
      const { tripId, etat } = await lancer(org);
      let appels = 0;
      const espion = (): PortPositions => {
        appels += 1;
        return { lire: async () => ({ ok: true, valeur: new Map() }), ecrire: async () => ({ ok: true, valeur: undefined }) } as unknown as PortPositions;
      };
      const fin = await derouler(etat, dependances({ barriere: { env }, portPositions: espion }));
      expect(fin.arret).toBeUndefined();
      expect(await nombre(org, "trip_versions", tripId)).toBe(1);
      expect(appels).toBe(0);
      expect(await positionsCache(org)).toEqual([]);
    }
  });
});

describe("aperçu (revue) : cinq lieux résolus, huit cases", () => {
  it("5 lieux résolus à l'ancrage : proposals et noOption cohérents, incomplete avec ready < expected, aucune erreur", async () => {
    const org = await nouvelleOrg();
    const { adapter, tripId, etat } = await lancer(org);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({
      ...base,
      ancrage: (o: Parameters<FabriqueGeneration["ancrage"]>[0]) => {
        const reel = base.ancrage(o);
        return {
          async ancrer(...args: Parameters<typeof reel.ancrer>) {
            const issue = await reel.ancrer(...args);
            if (!issue.ok) return issue;
            // Cinq lieux résolus, ceux que le programme nominal retient (J1 : 001, 003, 004 ; J2 : 002, 006).
            const gardes = new Set(["SENTINELLE_PLACE_ID_001", "SENTINELLE_PLACE_ID_002", "SENTINELLE_PLACE_ID_003", "SENTINELLE_PLACE_ID_004", "SENTINELLE_PLACE_ID_006"]);
            return { ok: true as const, valeur: new Map([...issue.valeur].filter(([, placeId]) => gardes.has(placeId))) };
          },
        };
      },
    });
    const fin = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeUndefined();
    const cases = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT position, slot_type, day, time FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId])).rows as { position: number; slot_type: string; day: number; time: string }[]);
    // B9-PO-5 (0106 § 4, 0105 § 4.1) : 5 `proposal` en ordre chronologique (jour, heure), puis 3 `noOption`, sans doublon de créneau.
    expect(cases.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(cases.map((c) => c.slot_type)).toEqual(["proposal", "proposal", "proposal", "proposal", "proposal", "noOption", "noOption", "noOption"]);
    const chrono = cases.slice(0, 5).map((c) => c.day * 10_000 + Number(c.time.slice(0, 2)) * 60 + Number(c.time.slice(3)));
    expect(chrono).toEqual([...chrono].sort((a, b) => a - b));
    expect(new Set(cases.map((c) => `${c.day}|${c.time}`)).size).toBe(8);
    expect(cases.every((c) => c.day === 1 || c.day === 2)).toBe(true);
    const run = await dernierRun(org, tripId);
    expect(run.phase).toBe("incomplete");
    expect(run.stop_reason).toBeNull();
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "incomplete" && [statut.value.ready, statut.value.expected]).toEqual([5, 8]);
  });
});

describe("aperçu (revue) : durée avec latence fixe des fournisseurs", () => {
  it("doubles à 50 ms par appel : l'aperçu complet se publie, durée mesurée et bornée", async () => {
    const org = await nouvelleOrg();
    const { etat } = await lancer(org);
    const LATENCE_MS = 50;
    const appels = { n: 0 };
    const lent = <T extends object>(objet: T): T =>
      Object.fromEntries(
        Object.entries(objet).map(([nom, valeur]) => [
          nom,
          typeof valeur !== "function"
            ? valeur
            : async (...args: unknown[]) => {
                appels.n += 1;
                await new Promise((resolve) => setTimeout(resolve, LATENCE_MS));
                return (valeur as (...a: unknown[]) => unknown).apply(objet, args);
              },
        ]),
      ) as T;
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          return { modeles: lent(d.modeles), rechercheWeb: lent(d.rechercheWeb), lecteur: lent(d.lecteur), places: lent(d.places), routes: lent(d.routes) };
        },
      });
    const debut = Date.now();
    const fin = await derouler(etat, dependances({}, fabrique));
    const duree = Date.now() - debut;
    expect(fin.arret).toBeUndefined();
    expect(appels.n).toBeGreaterThan(0);
    // Chaque appel coûte au moins la latence ; le total reste très en deçà des 6 étapes de 5 minutes (borne large, pas de plafond de performance).
    expect(duree).toBeGreaterThanOrEqual(LATENCE_MS);
    expect(duree).toBeLessThan(60_000);
    console.info(`DUREE_APERCU_MS=${duree} APPELS=${appels.n} LATENCE_MS=${LATENCE_MS}`);
  });
});

describe("aperçu (revue) : deux candidats sur le même lieu", () => {
  it("un lieu n'est publié qu'une fois, avec le candidat gardé par le moteur : aucune case en double, pas d'échec", async () => {
    const org = await nouvelleOrg();
    const { tripId, etat } = await lancer(org);
    const base = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({
      ...base,
      ancrage: (o: Parameters<FabriqueGeneration["ancrage"]>[0]) => {
        const reel = base.ancrage(o);
        return {
          async ancrer(...args: Parameters<typeof reel.ancrer>) {
            const issue = await reel.ancrer(...args);
            if (!issue.ok) return issue;
            const entrees = [...issue.valeur];
            const [premier, deuxieme] = entrees;
            if (premier !== undefined && deuxieme !== undefined) entrees[1] = [deuxieme[0], premier[1]];
            return { ok: true as const, valeur: new Map(entrees) };
          },
        };
      },
    });
    const fin = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeUndefined();
    const lignes = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT slot_type, candidate_id FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId])).rows as { slot_type: string; candidate_id: string | null }[]);
    expect(lignes).toHaveLength(8);
    const candidatsLieux = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      (await c.query("SELECT id, place_id FROM public.candidates WHERE trip_id = $1 AND kind = 'place' ORDER BY created_at, id", [tripId])).rows as { id: string; place_id: string | null }[],
    );
    // Le mieux classé (premier de la recherche) garde le lieu ; le second le perd et n'a plus de rôle (aucune case).
    const [premier, second] = candidatsLieux;
    expect(premier?.place_id).not.toBeNull();
    expect(second?.place_id).toBeNull();
    const portes = lignes.filter((l) => l.slot_type === "proposal").map((l) => l.candidate_id);
    expect(new Set(portes).size).toBe(portes.length);
    expect(portes).not.toContain(second?.id);
    // La case qui porte ce lieu, s'il est retenu, porte le premier candidat.
    expect(portes).toContain(premier?.id);
    // Aucun lieu n'est porté par deux candidats après l'ancrage (assertion indépendante des données comparées, mineur 6).
    const lieuxPortes = candidatsLieux.flatMap((c) => (c.place_id === null ? [] : [c.place_id]));
    expect(lieuxPortes.length).toBeGreaterThan(0);
    expect(new Set(lieuxPortes).size).toBe(lieuxPortes.length);
  });
});
