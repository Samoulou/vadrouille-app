import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { PortPositions } from "@/grounding/port-positions";
import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import { PARTS_FORFAIT } from "@/server/config/generation";
import type { DependancesGeneration } from "@/server/generation/dependances";
import type { EtatEtape } from "@/server/generation/etat";
import { partDe } from "@/server/generation/forfait-etape";

import {
  ETAPES,
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
import { compterAppels, compteursVides, type Compteurs } from "../support/compteur-appels";
import { journalDePrompts } from "../support/journal-prompts";
import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Revue de la PR #563 (head 065634d), bloquants 3, 4 et 6 : critères de la spécification B9c mesurés sur la base réelle,
 * avec les doubles de fournisseurs (variante simulée). Aucune clé, aucun appel réel, aucune écriture de programme.
 */

let base: BaseApercu;
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;

beforeAll(async () => {
  base = await creerBaseApercu("criteres");
  ({ app, auth, admin } = base);
  withOrg = creerWithOrg(base.db);
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const dependances = (fabrique?: () => FabriqueGeneration, surcharge: Partial<DependancesGeneration> = {}): DependancesGeneration => ({
  transaction: creerWithSystemOrgPourTests(base.db),
  horloge: creerHorlogeManuelle(MAINTENANT),
  plafonds: PLAFONDS_LARGES,
  barriere: { env: { VADROUILLE_ENV: "ci" } },
  // Bancs de la séquence de réservation : la variante simulée réserve aussi dans `usage_ledger` (décision 0110 § 3).
  reserverEnSimulee: true,
  ...(fabrique === undefined ? {} : { composition: fabrique }),
  ...surcharge,
});

const plafondsApercu = (apercu: Partial<(typeof PLAFONDS_LARGES)["generations"]["apercu"]>, limites: Partial<(typeof PLAFONDS_LARGES)["limites"]> = {}) => ({
  ...PLAFONDS_LARGES,
  limites: { ...PLAFONDS_LARGES.limites, ...limites },
  generations: { ...PLAFONDS_LARGES.generations, apercu: { ...PLAFONDS_LARGES.generations.apercu, ...apercu } },
});

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
    const { rows } = await c.query("SELECT id, phase, stop_reason, step_seq FROM public.generation_runs WHERE trip_id = $1 ORDER BY started_at DESC, id DESC LIMIT 1", [tripId]);
    return rows[0] as { id: string; phase: string; stop_reason: string | null; step_seq: number };
  });
}

async function nombre(org: Org, table: string, tripId: string): Promise<number> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(`SELECT count(*)::int AS n FROM public.${table} WHERE trip_id = $1`, [tripId]);
    return rows[0].n as number;
  });
}

async function ecrits(org: Org, tripId: string) {
  return {
    recherches: await nombre(org, "research_runs", tripId),
    candidats: await nombre(org, "candidates", tripId),
    versions: await nombre(org, "trip_versions", tripId),
    cases: await nombre(org, "proposals", tripId),
  };
}

async function ligneRegistre(org: Org, runId: string): Promise<string> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => JSON.stringify((await c.query("SELECT step, provider, sku, units FROM public.usage_ledger WHERE generation_run_id = $1 ORDER BY created_at, step, sku", [runId])).rows));
}

/** Fabrique de composition dont les doubles comptent leurs appels dans `compteurs`. */
const comptee = (compteurs: Compteurs, adapter: (d: DoublesGeneration) => DoublesGeneration = (d) => d) => () =>
  composerSimuleeAvec({ doubles: () => compterAppels(adapter(doublesEdimbourg()), compteurs) });

// --- Bloquant 3 : plafond et quota aux étapes b, c, d, e ------------------------------------------------------------------

describe("aperçu (critères) : plafond atteint à chaque étape, aucun appel après le refus", () => {
  // Chaque cas sature le registre en mémoire de la seule étape visée (sa part du forfait, `PARTS_FORFAIT`), les étapes
  // précédentes passant : la part de l'étape est épuisée, l'étape s'arrête sur `cap_reached` et aucun appel ne part ensuite.
  const CAS: readonly {
    nom: string;
    rang: number;
    apercu: Partial<(typeof PLAFONDS_LARGES)["generations"]["apercu"]>;
    appelsMax: (c: Compteurs) => void;
  }[] = [
    { nom: "b : recherche", rang: 3, apercu: { coutModelesMicros: 1_000 }, appelsMax: (c) => expect([c.modeles, c.rechercheWeb]).toEqual([0, 0]) },
    {
      nom: "c : ancrage",
      rang: 4,
      apercu: { placesTextSearch: 8 },
      // Parts Text Search de `l` et `c` (la réserve de `e`, décision 0113 § 3 bis, est prise sur `c` : nulle ici, Édimbourg a
      // un logement connu, donc la somme des trois parts reste celle de `l` et `c`).
      appelsMax: (c) => expect(c.places).toBeLessThanOrEqual(partDe(8, PARTS_FORFAIT.textSearch, "l") + partDe(8, PARTS_FORFAIT.textSearch, "c") + 2),
    },
    {
      nom: "d : notation",
      rang: 5,
      apercu: { coutModelesMicros: 100_000 },
      // Réserve de l'étape : 20 % de 100 000 micro-USD, soit une requête estimée à 20 000.
      appelsMax: (c) => expect(c.modeles).toBeLessThanOrEqual(3 + 1),
    },
    {
      nom: "e : planification",
      rang: 6,
      apercu: { placesDetails: 16 },
      appelsMax: (c) => expect(c.routes).toBe(0),
    },
  ];

  it.each(CAS)("$nom : cap_reached, non relançable, rien d'écrit, trips.current_version jamais posée, aucun appel de plus", async ({ rang, apercu, appelsMax }) => {
    const org = await createOrg(auth);
    const { adapter, tripId, run, etat } = await lancer(org);
    const compteurs = compteursVides();
    const deps = dependances(comptee(compteurs), { plafonds: plafondsApercu(apercu) });
    const fin = await derouler(etat, deps);
    expect(fin.arret).toBe("cap_reached");
    const apres = await dernierRun(org, tripId);
    expect(apres.phase).toBe("failed");
    expect(apres.stop_reason).toBe("cap_reached");
    expect(apres.step_seq).toBe(rang);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(false);
    expect((await ecrits(org, tripId)).versions).toBe(0);
    expect((await ecrits(org, tripId)).cases).toBe(0);
    const { rows } = await inTx(app, { org: org.org, user: org.owner }, (c) => c.query("SELECT current_version FROM public.trips WHERE id = $1", [tripId]));
    expect(rows[0].current_version).toBeNull();
    appelsMax(compteurs);
    // Après le refus, rejouer toutes les étapes ne dépense plus rien : ni appel de double, ni ligne de registre.
    const avant = { compteurs: { ...compteurs }, registre: await ligneRegistre(org, run.id) };
    for (const etape of ETAPES) await etape({ ...etat, rang: 0 }, deps);
    expect(compteurs).toEqual(avant.compteurs);
    expect(await ligneRegistre(org, run.id)).toBe(avant.registre);
  });

  it("quota du jour atteint : refus à la réservation du forfait (étape a), aucun appel de double, rien d'écrit", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(org);
    const compteurs = compteursVides();
    const fin = await derouler(etat, dependances(comptee(compteurs), { plafonds: plafondsApercu({}, { quotaJourParMethode: 1 }) }));
    expect(fin.arret).toBe("daily_quota_insufficient");
    expect(Object.values(compteurs).reduce((a, b) => a + b, 0)).toBe(0);
    const run = await dernierRun(org, tripId);
    expect([run.phase, run.stop_reason]).toEqual(["failed", "daily_quota_insufficient"]);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase === "failed" && statut.value.retryable).toBe(false);
    expect(await ecrits(org, tripId)).toMatchObject({ recherches: 0, candidats: 0, versions: 0, cases: 0 });
  });
});

// --- Rejeu sans doublon aux étapes b, c, d, e -----------------------------------------------------------------------------

describe("aperçu (critères) : rejeu d'une étape déjà passée, aucun doublon ni appel", () => {
  it.each([
    ["b", 2],
    ["c", 3],
    ["d", 4],
    ["e", 5],
  ] as const)("étape %s : refusée par la garde (step_expired), ni écriture, ni ligne de registre, ni appel", async (_nom, indice) => {
    const org = await createOrg(auth);
    const { tripId, run, etat } = await lancer(org);
    const compteurs = compteursVides();
    const deps = dependances(comptee(compteurs));
    const entrees: EtatEtape[] = [etat];
    let courant = etat;
    for (const etape of ETAPES) {
      courant = await etape(courant, deps);
      entrees.push(courant);
    }
    expect(courant.arret).toBeUndefined();
    const avant = { ecrits: await ecrits(org, tripId), registre: await ligneRegistre(org, run.id), compteurs: { ...compteurs } };
    const rejeu = await ETAPES[indice]!(entrees[indice]!, deps);
    expect(rejeu.arret).toBe("step_expired");
    expect(await ecrits(org, tripId)).toEqual(avant.ecrits);
    expect(await ligneRegistre(org, run.id)).toBe(avant.registre);
    expect(compteurs).toEqual(avant.compteurs);
  });
});

// --- Fiches de logement, de lieux et positions -----------------------------------------------------------------------------

describe("aperçu (critères) : une fiche de logement, une fiche par étape, six jours dont deux planifiés", () => {
  it("l'étape l lit au plus une fiche de logement ; l'étape e ne relit aucune fiche deux fois et ne cherche rien", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const parEtape = new Map<number, { details: string[]; textSearch: number; routes: number }>();
    let rang = 0;
    const fabrique = comptee(compteursVides(), (d) => {
      const lu = parEtape.get(rang) ?? { details: [], textSearch: 0, routes: 0 };
      parEtape.set(rang, lu);
      return {
        ...d,
        places: {
          ...d.places,
          async textSearch(requete) {
            lu.textSearch += 1;
            return d.places.textSearch(requete);
          },
          async details(placeId) {
            lu.details.push(placeId);
            return d.places.details(placeId);
          },
        },
        routes: Object.fromEntries(
          Object.entries(d.routes).map(([nom, valeur]) => [nom, typeof valeur !== "function" ? valeur : (...a: unknown[]) => ((lu.routes += 1), (valeur as (...x: unknown[]) => unknown).apply(d.routes, a))]),
        ) as typeof d.routes,
      };
    });
    let courant = etat;
    for (const [i, etape] of ETAPES.entries()) {
      rang = i + 1;
      courant = await etape(courant, dependances(fabrique));
      expect(courant.arret).toBeUndefined();
    }
    // Étape l (rang 2) : un logement connu, donc une fiche `details` (après un Text Search) et rien d'autre.
    expect(parEtape.get(2)?.details.length).toBeLessThanOrEqual(1);
    expect(parEtape.get(2)?.textSearch).toBeLessThanOrEqual(1);
    // Étape e (rang 6) : au plus une fiche par lieu, aucune recherche, et des matrices pour J1 et J2 seulement (voyage de 6 jours).
    const e = parEtape.get(6);
    expect(e).toBeDefined();
    expect(e?.textSearch).toBe(0);
    expect(new Set(e?.details).size).toBe(e?.details.length);
    expect(e?.routes).toBeGreaterThan(0);
    expect(e?.routes).toBeLessThanOrEqual(2 * 2);
  });

  it("positions: au plus une position par lieu publié, écrites avec la version, à partir des seules fiches lues", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances(undefined, { ecriturePositions: true, horloge: creerHorlogeManuelle(Date.now()) }));
    expect(fin.arret).toBeUndefined();
    const { rows } = await admin.query("SELECT place_id FROM public.place_coordinates WHERE organization_id = $1", [org.org]);
    const publies = await inTx(app, { org: org.org, user: org.owner }, async (c) => {
      const r = await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1", [tripId]);
      const brut = r.rows[0].snapshot;
      const jours = (typeof brut === "string" ? JSON.parse(brut) : brut).days as { items: { type: string; stop?: { placeId?: string } }[] }[];
      return new Set(jours.flatMap((j) => j.items.flatMap((i) => (i.type === "stop" && i.stop?.placeId !== undefined ? [i.stop.placeId] : []))));
    });
    const ids = rows.map((r) => r.place_id as string);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThan(0);
    for (const id of ids) expect(publies.has(id)).toBe(true);
  });
});

// --- Canari d'état au niveau de l'exécuteur --------------------------------------------------------------------------------

describe("aperçu (critères) : un message d'erreur de fournisseur n'atteint ni l'état ni la base", () => {
  it("erreur brute (nom de lieu et adresse) levée par une capacité : code fermé seulement, dans la sortie, l'exécution et le registre", async () => {
    const org = await createOrg(auth);
    const { tripId, run, etat } = await lancer(org);
    const progres = await derouler(etat, dependances(), 2);
    const secret = "Café Royal, 17 West Register Street, Edinburgh EH2 2AA";
    const reel = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({ ...reel, recherche: () => ({ rechercher: async () => { throw Object.assign(new Error(secret), { adresse: secret }); } }) as never });
    const fin = await ETAPES[2]!(progres, dependances(fabrique));
    expect(fin.arret).toBe("upstream_error");
    expect(JSON.stringify(fin)).not.toContain("Royal");
    const ligne = await inTx(app, { org: org.org, user: org.owner }, async (c) => JSON.stringify((await c.query("SELECT * FROM public.generation_runs WHERE trip_id = $1", [tripId])).rows));
    expect(ligne).not.toMatch(/Royal|Register|Edinburgh EH2/);
    expect(await ligneRegistre(org, run.id)).not.toMatch(/Royal|Register/);
  });
});

// --- Positions (0060 § 4) -----------------------------------------------------------------------------------------------------

describe("aperçu (critères) : positions au cache, cas de 0060 § 4", () => {
  const horloge = () => creerHorlogeManuelle(Date.now());
  const portDe = (ecrire: PortPositions["ecrire"]) => (): PortPositions => ({ lire: async () => ({ ok: true, valeur: new Map() }), ecrire }) as PortPositions;
  const cache = async (org: Org) => (await admin.query("SELECT place_id FROM public.place_coordinates WHERE organization_id = $1", [org.org])).rows;

  it("perimees : la version est publiée sans positions, sans erreur", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const fin = await derouler(etat, dependances(undefined, { ecriturePositions: true, horloge: horloge(), portPositions: portDe(async () => ({ ok: false, code: "perimees", retryable: false })) }));
    expect(fin.arret).toBeUndefined();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect(await cache(org)).toEqual([]);
  });

  it("base réessayable : la transaction est annulée en entier puis rejouée, une seule version, positions écrites une fois", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    let appels = 0;
    const reel = (await import("@/server/positions/cache-positions")).creerPortPositions;
    const fabrique: NonNullable<DependancesGeneration["portPositions"]> = (executeur) => {
      const port = reel(executeur as never);
      return {
        lire: (ids) => port.lire(ids),
        ecrire: async (positions, instant) => {
          appels += 1;
          return appels === 1 ? { ok: false, code: "base", retryable: true } : port.ecrire(positions, instant);
        },
      } as PortPositions;
    };
    const fin = await derouler(etat, dependances(undefined, { ecriturePositions: true, horloge: horloge(), portPositions: fabrique }));
    expect(fin.arret).toBeUndefined();
    expect(appels).toBe(2);
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect((await cache(org)).length).toBeGreaterThan(0);
  });

  it("génération arrêtée avant l'étape e : aucun appel au port d'écriture", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    let appels = 0;
    const port = (): PortPositions => {
      appels += 1;
      return { lire: async () => ({ ok: true, valeur: new Map() }), ecrire: async () => ({ ok: true, valeur: undefined }) } as unknown as PortPositions;
    };
    const fin = await derouler(etat, dependances(undefined, { ecriturePositions: true, portPositions: port, plafonds: plafondsApercu({ coutModelesMicros: 1_000 }) }));
    expect(fin.arret).toBe("cap_reached");
    expect(appels).toBe(0);
    expect(await cache(org)).toEqual([]);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
  });
});

// --- Bloquant 6 : 7a et 7b -------------------------------------------------------------------------------------------------------

describe("aperçu (critères) : réparation sans appel de modèle (7a) et candidat réutilisé ré-ancré (7b)", () => {
  it("réparation: aucun appel de modèle : un lieu fermé à la relecture est remplacé, et l'étape e n'envoie que des requêtes de raisons", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const progres = await derouler(etat, dependances(), 5);
    expect(progres.arret).toBeUndefined();
    const journaux: ReturnType<typeof journalDePrompts>[] = [];
    const fermes = new Set<string>();
    const ferme = (placeId: string) => placeId === "SENTINELLE_PLACE_ID_003" || placeId === "SENTINELLE_PLACE_ID_004";
    const fabrique = () =>
      composerSimuleeAvec({
        doubles: () => {
          const d = doublesEdimbourg();
          const j = journalDePrompts(d.modeles);
          journaux.push(j);
          return {
            ...d,
            modeles: j.client,
            places: {
              ...d.places,
              async details(placeId) {
                const fiche = await d.places.details(placeId);
                if (!ferme(placeId)) return fiche;
                fermes.add(placeId);
                return { ...fiche, statut: "CLOSED_PERMANENTLY" as const };
              },
            },
          };
        },
      });
    const fin = await ETAPES[5]!(progres, dependances(fabrique));
    expect(fin.arret).toBeUndefined();
    expect(fermes.size).toBeGreaterThan(0);
    const requetes = journaux.flatMap((j) => j.requetes);
    expect(requetes.length).toBeGreaterThan(0);
    // Entre la validation et les raisons, le journal ne gagne aucune requête : tout ce que l'étape e envoie est une rédaction.
    expect(requetes.every((r) => r.etape === "raisons")).toBe(true);
    const run = await dernierRun(org, tripId);
    expect(run.stop_reason).toBeNull();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
  });

  it("ancrage: un candidat réutilisé est ré-ancré : double appelé pour lui, place_id non confirmé retiré, aucune case ne le porte", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const apresB = await derouler(etat, dependances(), 3);
    expect(apresB.arret).toBeUndefined();
    const candidats = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      (await c.query("SELECT id, name FROM public.candidates WHERE trip_id = $1 AND kind = 'place' ORDER BY created_at, id", [tripId])).rows as { id: string; name: string }[],
    );
    expect(candidats.length).toBeGreaterThan(2);
    const [reutilise, disparu] = candidats;
    // Candidats « réutilisés » : déjà un place_id (périmé pour le premier, d'un lieu disparu pour le second) ; le second n'existe plus pour le double.
    await admin.query("UPDATE public.candidates SET place_id = 'ANCIEN_PLACE_ID' WHERE id = $1", [reutilise!.id]);
    await admin.query("UPDATE public.candidates SET place_id = 'LIEU_DISPARU', name = 'Lieu absent des fixtures' WHERE id = $1", [disparu!.id]);
    const requetes: string[] = [];
    const fabrique = comptee(compteursVides(), (d) => ({
      ...d,
      places: {
        ...d.places,
        async textSearch(requete) {
          requetes.push(requete.texte);
          return d.places.textSearch(requete);
        },
      },
    }));
    let courant = apresB;
    for (const etape of ETAPES.slice(3)) courant = await etape(courant, dependances(fabrique));
    expect(courant.arret).toBeUndefined();
    // Le double est appelé pour les deux, y compris pour celui qui avait déjà un place_id.
    expect(requetes.some((t) => t.includes(reutilise!.name))).toBe(true);
    expect(requetes.some((t) => t.includes("Lieu absent des fixtures"))).toBe(true);
    const apres = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      (await c.query("SELECT id, place_id FROM public.candidates WHERE id = ANY($1::uuid[])", [[reutilise!.id, disparu!.id]])).rows as { id: string; place_id: string | null }[],
    );
    const parId = new Map(apres.map((l) => [l.id, l.place_id]));
    // La présence d'un place_id ne vaut jamais verdict : le premier est remplacé par ce que le double résout, le second est retiré.
    expect(parId.get(reutilise!.id)).not.toBe("ANCIEN_PLACE_ID");
    expect(parId.get(reutilise!.id)).toMatch(/^SENTINELLE_PLACE_ID_/);
    expect(parId.get(disparu!.id)).toBeNull();
    const portes = await inTx(app, { org: org.org, user: org.owner }, async (c) =>
      (await c.query("SELECT 1 FROM public.proposals WHERE trip_id = $1 AND candidate_id = $2", [tripId, disparu!.id])).rows,
    );
    expect(portes).toEqual([]);
  });
});

// --- Arrêt sans raison (0105 § 4.2) -------------------------------------------------------------------------------------------

describe("aperçu (critères) : une raison absente ne fait ni échec ni case", () => {
  it("rédaction qui omet des lieux à chaque passage : l'arrêt reste dans la version sans reason, sans case proposal, exécution incomplète", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const reel = composerSimuleeAvec({ doubles: doublesEdimbourg });
    const fabrique = () => ({
      ...reel,
      finale: (o: Parameters<FabriqueGeneration["finale"]>[0]) => {
        const finale = reel.finale(o);
        return {
          ...finale,
          async rediger(...args: Parameters<typeof finale.rediger>) {
            const issue = await finale.rediger(...args);
            // Seul le premier lieu de chaque lot reçoit une raison : les autres n'en ont jamais (la rédaction les omet).
            return issue.ok ? { ok: true as const, valeur: new Map([...issue.valeur].slice(0, 1)) } : issue;
          },
        };
      },
    });
    const fin = await derouler(etat, dependances(fabrique));
    expect(fin.arret).toBeUndefined();
    const run = await dernierRun(org, tripId);
    expect(run.stop_reason).toBeNull();
    expect(run.phase).toBe("incomplete");
    const jours = await inTx(app, { org: org.org, user: org.owner }, async (c) => {
      const brut = (await c.query("SELECT snapshot FROM public.trip_versions WHERE trip_id = $1", [tripId])).rows[0].snapshot;
      return (typeof brut === "string" ? JSON.parse(brut) : brut).days as { index: number; items: { type: string; stop?: { id: string; kind: string; placeId?: string; reason?: string } }[] }[];
    });
    const etapes = jours.filter((j) => j.index <= 2).flatMap((j) => j.items.flatMap((i) => (i.type === "stop" && (i.stop?.kind === "activity" || i.stop?.kind === "meal") ? [i.stop!] : [])));
    const sansReason = etapes.filter((e) => e.reason === undefined);
    expect(sansReason.length).toBeGreaterThan(0);
    const cases = await inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query("SELECT slot_type, content FROM public.proposals WHERE trip_id = $1", [tripId])).rows as { slot_type: string; content: unknown }[]);
    const idsDesCases = cases.flatMap((c) => (c.slot_type === "proposal" ? [(typeof c.content === "string" ? JSON.parse(c.content) : (c.content as { id: string })).id as string] : []));
    for (const e of sansReason) expect(idsDesCases).not.toContain(e.id);
    expect(idsDesCases.length).toBe(cases.filter((c) => c.slot_type === "proposal").length);
    expect(cases.filter((c) => c.slot_type === "proposal").length).toBeLessThan(8);
  });
});
