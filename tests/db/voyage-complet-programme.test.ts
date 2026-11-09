import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import { TripSnapshotSchema, type TripDraft, type TripRequest, type TripSnapshot } from "@/contracts";
import { joursCandidatsApercu } from "@/domain/apercu";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import type { PlafondsUsage } from "@/server/config/usage";
import { etapesRestantes } from "@/server/generation/complet-programme";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { etapeCompletDebut, etapeCompletLogement, etapeCompletRecherche } from "@/server/generation/etapes-complet";
import { etapeProgrammeDebut, etapeProgrammeEcriture } from "@/server/generation/etapes-programme";
import { EtatCompletSchema, type EtatComplet, type EtatProgramme } from "@/server/generation/etat";
import { ecrireVersion } from "@/server/versions/ecrire";

import { BRIEF_EDIMBOURG, MAINTENANT, PLAFONDS_LARGES, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests } from "../support/banc-apercu";
import { journalDePrompts, type JournalPrompts } from "../support/journal-prompts";

import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type Org } from "./helpers";

/**
 * Voyage complet de la chaîne inversée sur `api` (M1c, ticket 1048 ; réponse de Samuel à Q638 du 2026-11-09) sur la base
 * réelle : avant le paiement, la génération ne vérifie que les lieux des journées de l'aperçu ; après le déblocage, l'exécution
 * `full` (étapes `a` puis `l` de `generateFullTrip`, déroulées sans le SDK) vérifie les lieux restants et écrit une version.
 * Variante simulée sur les fixtures de Rome, aucune clé, aucun appel réel, aucune position écrite ; chaîne injectée
 * (`chaine: "inversee"`).
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: BaseApercu["app"];
let auth: BaseApercu["auth"];
let admin: BaseApercu["admin"];
let doublesRome: () => DoublesGeneration;

beforeAll(async () => {
  base = await creerBaseApercu("complet_programme");
  ({ db, app, auth, admin } = base);
  withOrg = creerWithOrg(db);
  doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

const BROUILLON_ROME: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti (près du Colisée)" },
  otherCities: [],
  commitments: [],
};

const demandeRome = (): TripRequest => ({ requestId: crypto.randomUUID(), draft: BROUILLON_ROME, brief: BRIEF_EDIMBOURG });

function dependances(surcharge: Partial<DependancesGeneration> = {}, fabrique?: () => FabriqueGeneration): DependancesGeneration {
  return {
    chaine: "inversee",
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    plafonds: PLAFONDS_LARGES,
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    reserverEnSimulee: true,
    ...(fabrique === undefined ? {} : { composition: fabrique }),
    ...surcharge,
  };
}

/** Composition simulée de Rome qui note les requêtes de modèles et les textes Text Search (et peut remplacer un double). */
function espionnee(remplacer: (d: DoublesGeneration) => Partial<DoublesGeneration> = () => ({})) {
  const journaux: JournalPrompts[] = [];
  const recherches: string[] = [];
  let compositions = 0;
  const fabrique = () => {
    compositions += 1;
    return composerSimuleeAvec({
      doubles: () => {
        const d = doublesRome();
        const remplaces = { ...d, ...remplacer(d) };
        const j = journalDePrompts(remplaces.modeles);
        journaux.push(j);
        return {
          ...remplaces,
          modeles: j.client,
          places: {
            ...remplaces.places,
            textSearch: async (requete: Parameters<DoublesGeneration["places"]["textSearch"]>[0]) => {
              recherches.push(requete.texte);
              return remplaces.places.textSearch(requete);
            },
          },
        };
      },
    });
  };
  return { fabrique, requetes: () => journaux.flatMap((j) => j.requetes), recherches, compositions: () => compositions };
}

async function dernierRun(org: Org, tripId: string, kind: string) {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(
      "SELECT id, phase, stop_reason, step_seq, last_version FROM public.generation_runs WHERE trip_id = $1 AND kind = $2 ORDER BY started_at DESC, id DESC LIMIT 1",
      [tripId, kind],
    );
    return rows[0] as { id: string; phase: string; stop_reason: string | null; step_seq: number; last_version: number | null };
  });
}

async function lire<T>(org: Org, texte: string, valeurs: unknown[]): Promise<T[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query(texte, valeurs)).rows as T[]);
}

async function version(org: Org, tripId: string, n: number): Promise<TripSnapshot> {
  const [ligne] = await lire<{ snapshot: unknown }>(org, "SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 AND version = $2", [tripId, n]);
  return TripSnapshotSchema.parse(ligne!.snapshot);
}

const nombreDeVersions = async (org: Org, tripId: string) =>
  (await lire<{ n: number }>(org, "SELECT count(*)::int AS n FROM public.trip_versions WHERE trip_id = $1", [tripId]))[0]!.n;

const etapes = (jour: TripSnapshot["days"][number]) => jour.items.flatMap((ligne) => (ligne.type === "stop" ? [ligne.stop] : []));

/** Voyage de Rome créé, aperçu publié (version 1), débloqué ; la ligne `full` réservée par la réconciliation (`queued`). */
async function voyageDebloque(org: Org, fabriqueApercu?: () => FabriqueGeneration) {
  const demarrerVoyageComplet = vi.fn(async () => `wrun_${crypto.randomUUID()}`);
  const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: async () => null, demarrerVoyageComplet, chaine: "inversee" });
  const r = await adapter.createTrip(contexteDe(org), demandeRome());
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const apercu = await dernierRun(org, tripId, "preview");
  const etat: EtatProgramme = { generationRunId: apercu.id, organizationId: org.org, rang: 0 };
  const deps = dependances({}, fabriqueApercu);
  const apresA = await etapeProgrammeDebut(etat, deps);
  expect(apresA.arret).toBeUndefined();
  expect((await etapeProgrammeEcriture(apresA, deps)).arret).toBeUndefined();
  await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
  expect((await adapter.getFullTripStatus(contexteDe(org), tripId)).ok).toBe(true);
  const complet = await dernierRun(org, tripId, "full");
  expect(complet.phase).toBe("queued");
  const entree: EtatComplet = { generationRunId: complet.id, organizationId: org.org, rang: 0 };
  return { adapter, tripId, complet, entree };
}

/** Déroule `generateFullTrip` comme le workflow, sans le SDK : `a`, `l`, puis `b` (qui trouve la ligne finie). */
async function deroulerComplet(entree: EtatComplet, deps: DependancesGeneration): Promise<EtatComplet[]> {
  const sorties: EtatComplet[] = [];
  let etat = entree;
  for (const etape of [etapeCompletDebut, etapeCompletLogement, etapeCompletRecherche]) {
    const suivant = await etape(etat, deps);
    sorties.push(suivant);
    if (suivant.arret !== undefined || suivant.rang === etat.rang) break;
    etat = suivant;
  }
  return sorties;
}

describe("voyage complet (chaîne inversée) : avant le paiement, l'aperçu seulement (Q638)", () => {
  it("chaine-inversee: la génération ne vérifie que les lieux des journées de l'aperçu ; les autres étapes sont écrites sans placeId", async () => {
    const org = await createOrg(auth);
    const espion = espionnee();
    const { tripId } = await voyageDebloque(org, espion.fabrique);
    const v1 = await version(org, tripId, 1);
    const apercu = joursCandidatsApercu(v1.days);
    expect([...apercu]).toEqual([1, 2]);
    expect(v1.days.length).toBeGreaterThan(2);
    for (const jour of v1.days) {
      if (apercu.has(jour.index)) expect(etapes(jour).some((stop) => stop.placeId !== undefined)).toBe(true);
      else for (const stop of etapes(jour)) expect(stop.placeId).toBeUndefined();
    }
    // Aucune recherche Text Search pour un nom qui n'apparaît que hors de l'aperçu (le logement mis à part).
    const nomsApercu = new Set(v1.days.filter((jour) => apercu.has(jour.index)).flatMap((jour) => etapes(jour).map((stop) => stop.name)));
    const nomsAilleurs = new Set(v1.days.filter((jour) => !apercu.has(jour.index)).flatMap((jour) => etapes(jour).map((stop) => stop.name)).filter((nom) => !nomsApercu.has(nom)));
    expect(nomsAilleurs.size).toBeGreaterThan(0);
    for (const texte of espion.recherches) for (const nom of nomsAilleurs) expect(texte.startsWith(`${nom},`)).toBe(false);
    // Huit cases, toutes ancrées.
    const cases = await lire<{ content: { stop: { placeId?: string } } }>(org, "SELECT content FROM public.proposals WHERE trip_id = $1", [tripId]);
    expect(cases).toHaveLength(8);
    for (const c of cases) expect(c.content.stop.placeId).toBeDefined();
  });
});

describe("voyage complet (chaîne inversée) : après le déblocage, les lieux restants", () => {
  it("voyage complet: a réserve, l vérifie les lieux restants et écrit la version 2 (aucune requête de modèle, aperçu inchangé, segments posés)", async () => {
    const org = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const v1 = await version(org, tripId, 1);
    const restantes = etapesRestantes(v1);
    expect(restantes.length).toBeGreaterThan(0);

    const espion = espionnee();
    const sorties = await deroulerComplet(entree, dependances({}, espion.fabrique));
    expect(sorties.map((s) => s.arret)).toEqual([undefined, undefined, undefined]);
    expect(sorties.map((s) => s.rang)).toEqual([1, 2, 2]);
    for (const s of sorties) {
      expect(EtatCompletSchema.safeParse(s).success).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/placeId|SENTINELLE|lat|lng|Rome/);
    }
    expect(espion.requetes()).toHaveLength(0);
    expect(espion.compositions()).toBe(1);
    expect(await dernierRun(org, tripId, "full")).toMatchObject({ phase: "ready", stop_reason: null, step_seq: 2, last_version: 2 });
    expect(await nombreDeVersions(org, tripId)).toBe(2);

    const v2 = await version(org, tripId, 2);
    const [ligne] = await lire<{ author_kind: string }>(org, "SELECT author_kind FROM public.trip_versions WHERE trip_id = $1 AND version = 2", [tripId]);
    expect(ligne!.author_kind).toBe("workflow");
    // Journées de l'aperçu inchangées ; ailleurs, mêmes étapes (identifiant, nom, heures), un `placeId` pour les lieux trouvés.
    for (const jour of v2.days) {
      const avant = v1.days.find((j) => j.index === jour.index)!;
      if (jour.index <= 2) {
        expect(jour).toEqual(avant);
        continue;
      }
      expect(etapes(jour).map((s) => [s.id, s.name, s.start, s.end])).toEqual(etapes(avant).map((s) => [s.id, s.name, s.start, s.end]));
      // Un segment avant chaque étape qui a un `placeId`, et avant le terminus de fin.
      jour.items.forEach((item, rang) => {
        if ((item.type === "stop" && item.stop.placeId !== undefined) || (item.type === "terminus" && item.role === "end")) {
          expect(jour.items[rang - 1]?.type).toBe("segment");
        }
      });
    }
    const trouvees = v2.days.filter((j) => j.index > 2).flatMap(etapes).filter((s) => s.placeId !== undefined);
    expect(trouvees.length).toBeGreaterThan(0);
    // Aucune durée de trajet écrite (0093 § 3).
    expect(JSON.stringify(v2)).not.toMatch(/"minutes"|travelMinutes|verifiedAt/);
    // Les cases de l'aperçu ne changent pas.
    expect((await lire<{ n: number }>(org, "SELECT count(*)::int AS n FROM public.proposals WHERE trip_id = $1", [tripId]))[0]!.n).toBe(8);
    // Rien de plus à vérifier dans les journées hors de l'aperçu, sauf des lieux introuvables.
    expect(etapesRestantes(v2).length).toBe(restantes.length - trouvees.length);
  });

  it("voyage complet: rejeu de l refusé par step_seq, aucune seconde version", async () => {
    const org = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const deps = dependances({}, espionnee().fabrique);
    const apresA = await etapeCompletDebut(entree, deps);
    expect(apresA.arret).toBeUndefined();
    expect((await etapeCompletLogement(apresA, deps)).arret).toBeUndefined();
    const rejeu = await etapeCompletLogement(apresA, deps);
    expect(rejeu).toEqual(apresA);
    expect(await nombreDeVersions(org, tripId)).toBe(2);
  });

  it("voyage complet: un lieu restant introuvable garde sa forme, sans placeId", async () => {
    const org = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const cible = etapesRestantes(await version(org, tripId, 1))[0]!;
    const espion = espionnee((d) => ({
      places: { ...d.places, textSearch: async (requete) => (requete.texte.startsWith(`${cible.nom},`) ? { placeIds: [] } : d.places.textSearch(requete)) },
    }));
    expect((await deroulerComplet(entree, dependances({}, espion.fabrique))).every((s) => s.arret === undefined)).toBe(true);
    const v2 = await version(org, tripId, 2);
    const stop = v2.days.flatMap(etapes).find((s) => s.id === cible.stopId)!;
    expect(stop.placeId).toBeUndefined();
    expect(stop.name).toBe(cible.nom);
  });

  it("voyage complet: forfait verification respecté (Text Search épuisé : les lieux suivants restent sans placeId, aucun dépassement)", async () => {
    const org = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const restantes = etapesRestantes(await version(org, tripId, 1));
    // Une requête pour le logement, une pour le premier lieu restant.
    const plafonds: PlafondsUsage = { ...PLAFONDS_LARGES, generations: { ...PLAFONDS_LARGES.generations, verification: { placesTextSearch: 2, placesDetails: 100 } } };
    const espion = espionnee();
    expect((await deroulerComplet(entree, dependances({ plafonds }, espion.fabrique))).every((s) => s.arret === undefined)).toBe(true);
    expect(espion.recherches.length).toBeLessThanOrEqual(2);
    const v2 = await version(org, tripId, 2);
    const trouvees = v2.days.flatMap(etapes).filter((s) => restantes.some((r) => r.stopId === s.id) && s.placeId !== undefined);
    expect(trouvees.length).toBe(1);
  });

  it("voyage complet: version courante changée pendant la vérification, rien n'est écrit (ready, last_version nul)", async () => {
    const org = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const v1 = await version(org, tripId, 1);
    let ecrite = false;
    // Une version écrite par un autre écrivain pendant la vérification (première recherche de lieu) : la publication relit la
    // version courante sous le verrou des versions et n'écrit rien.
    const espion = espionnee((d) => ({
      places: {
        ...d.places,
        textSearch: async (requete) => {
          if (!ecrite) {
            ecrite = true;
            await inTx(app, { org: org.org, user: org.owner }, (c) =>
              ecrireVersion(c, { organizationId: org.org, tripId, requestId: crypto.randomUUID(), auteur: "workflow", instantane: v1, instantanePrecedent: v1 }),
            );
          }
          return d.places.textSearch(requete);
        },
      },
    }));
    expect((await deroulerComplet(entree, dependances({}, espion.fabrique))).every((s) => s.arret === undefined)).toBe(true);
    expect(ecrite).toBe(true);
    expect(await dernierRun(org, tripId, "full")).toMatchObject({ phase: "ready", stop_reason: null, last_version: null });
    expect(await nombreDeVersions(org, tripId)).toBe(2);
    expect(await version(org, tripId, 2)).toEqual(v1);
  });

  it("voyage complet: une autre organisation ne fait rien avancer (garde refusée, aucune écriture)", async () => {
    const org = await createOrg(auth);
    const autre = await createOrg(auth);
    const { tripId, entree } = await voyageDebloque(org);
    const sortie = await etapeCompletDebut({ ...entree, organizationId: autre.org }, dependances({}, espionnee().fabrique));
    expect(sortie.arret).toBe("step_expired");
    expect(await dernierRun(org, tripId, "full")).toMatchObject({ phase: "queued", step_seq: 0 });
    expect(await nombreDeVersions(org, tripId)).toBe(1);
  });
});
