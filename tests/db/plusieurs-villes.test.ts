import { readFile } from "node:fs/promises";
import path from "node:path";

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import { createApiTripAdapter } from "@/adapters/api";
import type { ClientModeles } from "@/ai/client";
import { TripSnapshotSchema, type TripDraft, type TripRequest, type TripSnapshot } from "@/contracts";
import { INCONNU, type SourceRelectures } from "@/domain/relectures";
import type { RequeteTextSearch } from "@/grounding/interfaces";
import { FixturesPlacesSchema, creerPlacesSimule, type FixturesPlaces } from "@/grounding/places.simule";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import { composerSimuleeAvec, type DoublesGeneration, type FabriqueGeneration } from "@/server/composition/generation";
import { PLAFONDS_VARIANTE_SIMULEE } from "@/server/config/usage";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { etapeLotDebut, etapeLotPlanification } from "@/server/generation/etapes-lot";
import { etapeProgrammeDebut, etapeProgrammeEcriture } from "@/server/generation/etapes-programme";
import type { EtatLot, EtatProgramme } from "@/server/generation/etat";
import { texteDuLogement } from "@/server/programme/brief";

import { BRIEF_EDIMBOURG, MAINTENANT, PLAFONDS_LARGES, contexteDe, creerHorlogeManuelle, creerWithOrg, creerWithSystemOrgPourTests } from "../support/banc-apercu";
import { journalDePrompts, type JournalPrompts } from "../support/journal-prompts";

import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, token, type DbClient, type Org } from "./helpers";

/**
 * Plusieurs villes sur `api` (M4b, ticket #928 ; décision 0148 § 4 à § 10 ; verdict 0149 ; décision 0151) sur la base
 * réelle : `createTrip` sous la chaîne inversée, `generateProgramme` déroulé sans le SDK (étapes `a` puis `e`), révision M1b,
 * lecture et vue partagée. Variante simulée : doubles **construits ici** sur les fixtures de Rome (lieux de Florence et de
 * Venise ajoutés en mémoire, valeurs sentinelles), sortie du modèle à plusieurs villes écrite à la main ; aucune clé, aucun
 * appel réel, aucune position écrite.
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let doublesRome: () => DoublesGeneration;
let placesRome: FixturesPlaces;

beforeAll(async () => {
  base = await creerBaseApercu("plusieurs_villes");
  ({ db, app, auth, admin } = base);
  withOrg = creerWithOrg(db);
  doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
  placesRome = FixturesPlacesSchema.parse(JSON.parse(await readFile(path.join(process.cwd(), "prototype/fixtures/places/rome-chaine-inversee.json"), "utf8")));
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});

// --- Doubles à plusieurs villes ----------------------------------------------------------------------------------------

const POSITIONS = { Rome: { lat: 41.9, lng: 12.49 }, Florence: { lat: 43.77, lng: 11.25 }, Venise: { lat: 45.44, lng: 12.33 } } as const;
type Ville = keyof typeof POSITIONS;

/** Lieu fictif à valeurs sentinelles (contrainte 8), dans la ville donnée. */
function lieuFictif(numero: string, ville: Ville): FixturesPlaces["lieux"][string] {
  const modele = placesRome.lieux["Colisée"]!;
  return { ...modele, placeId: `SENTINELLE_PLACE_ID_M4B_${numero}`, position: { ...POSITIONS[ville] } };
}

/** Lieux de Rome des fixtures, plus les lieux et logements donnés (nom maison → ville). */
function placesAvec(ajouts: Readonly<Record<string, Ville>>): FixturesPlaces {
  const lieux = { ...placesRome.lieux };
  Object.entries(ajouts).forEach(([nom, ville], rang) => {
    lieux[nom] = lieuFictif(String(rang + 1).padStart(3, "0"), ville);
  });
  return { lieux };
}

type Creneau = { debut: string; fin?: string; nature: string; lieu?: string; pourquoi?: string; aReserver?: boolean; ville?: string };
type Programme = { titre: string; jours: { date: string; titre?: string; dureeEstimeeMinutes?: number; creneaux: Creneau[] }[]; bonsPlans: string[] };

const etape = (debut: string, fin: string, nature: string, lieu: string, extra: Partial<Creneau> = {}): Creneau => ({
  debut,
  fin,
  nature,
  lieu,
  pourquoi: `Retenu pour ton voyage : ${lieu}.`,
  ...extra,
});

/**
 * Composition simulée à plusieurs villes : requêtes de modèles journalisées (la requête `programme`, v5 ou révision, rend
 * `programme`), Text Search journalisées. Aucun autre double ne change.
 */
function composition(programme: Programme, places: FixturesPlaces) {
  const journaux: JournalPrompts[] = [];
  const recherches: RequeteTextSearch[] = [];
  const fabrique = () =>
    composerSimuleeAvec({
      doubles: () => {
        const d = doublesRome();
        const modeles: ClientModeles = {
          envoyer: async (requete) => (requete.etape === "programme" ? { texte: JSON.stringify(programme), coutUsd: 0.02 } : d.modeles.envoyer(requete)),
        };
        const j = journalDePrompts(modeles);
        journaux.push(j);
        const simule = creerPlacesSimule(places);
        return {
          ...d,
          modeles: j.client,
          places: {
            ...simule,
            textSearch: (requete: RequeteTextSearch) => {
              recherches.push(structuredClone(requete));
              return simule.textSearch(requete);
            },
          },
        };
      },
    });
  return { fabrique, requetes: () => journaux.flatMap((j) => j.requetes), texte: () => journaux.map((j) => j.texte()).join("\n"), recherches };
}

// --- Voyage de deux villes : Rome (04.05), Florence (05.05 au 08.05) -------------------------------------------------

const DEUX_VILLES: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti (près du Colisée)" },
  otherCities: [{ name: "Florence", arrival: "2027-05-05", lodging: { kind: "area", label: "Santa Croce" } }],
  commitments: [],
};

const PLACES_DEUX_VILLES = () =>
  placesAvec({
    [texteDuLogement({ kind: "area", label: "Santa Croce" }, "Florence")]: "Florence",
    "Lieu dans le créneau M4B": "Rome",
    "Trattoria Mario": "Florence",
    "Galerie des Offices": "Florence",
    "Ponte Vecchio": "Florence",
    "Duomo de Florence": "Florence",
    "Mercato Centrale": "Florence",
    "Palais Pitti": "Florence",
    "Jardin de Boboli": "Florence",
    "Trattoria Sostanza": "Florence",
    "Piazzale Michelangelo": "Florence",
    "Antico Vinaio": "Florence",
  });

/** Sortie du modèle (v5) : J2 est le changement de ville, départ estimé 10:00, 150 minutes (créneau occupé 10:00-12:30). */
const PROGRAMME_DEUX_VILLES: Programme = {
  titre: "Rome puis Florence",
  jours: [
    {
      date: "2027-05-04",
      titre: "Monti et le Colisée",
      creneaux: [
        { debut: "12:00", fin: "13:00", nature: "arrivee" },
        etape("13:30", "14:15", "repas_midi", "Antico Forno ai Serpenti"),
        etape("14:30", "16:30", "visite", "Colisée"),
        etape("16:45", "18:15", "visite", "Forum romain"),
        etape("18:45", "19:45", "apero", "Ai Tre Scalini"),
        etape("20:15", "22:00", "repas_soir", "Trattoria Vecchia Roma"),
      ],
    },
    {
      date: "2027-05-05",
      titre: "Titre de l'IA remplacé",
      dureeEstimeeMinutes: 150,
      creneaux: [
        etape("09:00", "09:50", "visite", "Panthéon"),
        etape("10:30", "11:30", "visite", "Lieu dans le créneau M4B"),
        etape("13:00", "14:00", "repas_midi", "Trattoria Mario", { ville: "Paris" }),
        etape("14:30", "16:00", "visite", "Galerie des Offices", { aReserver: true }),
        etape("16:30", "17:30", "visite", "Ponte Vecchio"),
        // Lieu de Rome placé après l'arrivée à Florence : cherché dans la zone de Florence, il perd son `placeId` (critère 12).
        etape("19:30", "21:00", "repas_soir", "Roscioli"),
      ],
    },
    {
      date: "2027-05-06",
      creneaux: [
        etape("09:30", "11:00", "visite", "Duomo de Florence"),
        etape("12:30", "13:30", "repas_midi", "Mercato Centrale"),
        etape("14:00", "16:00", "visite", "Palais Pitti"),
        etape("16:30", "18:00", "visite", "Jardin de Boboli"),
        // Lieu de Rome placé un jour de Florence : sans `placeId` (critère 12).
        etape("18:30", "19:30", "apero", "Ai Tre Scalini"),
        etape("20:00", "21:30", "repas_soir", "Trattoria Sostanza"),
      ],
    },
    {
      date: "2027-05-07",
      creneaux: [etape("10:00", "11:30", "visite", "Piazzale Michelangelo"), etape("12:30", "13:30", "repas_midi", "Antico Vinaio")],
    },
    { date: "2027-05-08", creneaux: [{ debut: "10:00", fin: "11:00", nature: "depart" }] },
  ],
  bonsPlans: ["Valide ton billet de train avant de monter."],
};

// --- Banc -------------------------------------------------------------------------------------------------------------

function dependances(fabrique: () => FabriqueGeneration, surcharge: Partial<DependancesGeneration> = {}): DependancesGeneration {
  return {
    chaine: "inversee",
    transaction: creerWithSystemOrgPourTests(db),
    horloge: creerHorlogeManuelle(MAINTENANT),
    plafonds: PLAFONDS_LARGES,
    barriere: { env: { VADROUILLE_ENV: "ci" } },
    reserverEnSimulee: true,
    composition: fabrique,
    ...surcharge,
  };
}

const demande = (draft: TripDraft): TripRequest => ({ requestId: crypto.randomUUID(), draft, brief: BRIEF_EDIMBOURG });

async function lire<T>(org: Org, texte: string, valeurs: unknown[]): Promise<T[]> {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => (await c.query(texte, valeurs)).rows as T[]);
}

/** `createTrip` sous la chaîne inversée, puis `generateProgramme` déroulé sans le SDK. */
async function generer(org: Org, draft: TripDraft, fabrique: () => FabriqueGeneration, surcharge: Partial<DependancesGeneration> = {}) {
  const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: async () => null, demarrerVoyageComplet: async () => null, chaine: "inversee" });
  const r = await adapter.createTrip(contexteDe(org), demande(draft));
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const [run] = await lire<{ id: string }>(org, "SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId]);
  const etat: EtatProgramme = { generationRunId: run!.id, organizationId: org.org, rang: 0 };
  const apresA = await etapeProgrammeDebut(etat, dependances(fabrique, surcharge));
  const fin = apresA.arret !== undefined ? apresA : await etapeProgrammeEcriture(apresA, dependances(fabrique, surcharge));
  return { tripId, apercu: run!.id, sorties: [apresA, fin], fin };
}

async function version(org: Org, tripId: string, numero: number): Promise<TripSnapshot> {
  const [ligne] = await lire<{ snapshot: unknown }>(org, "SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 AND version = $2", [tripId, numero]);
  return TripSnapshotSchema.parse(ligne!.snapshot);
}

const jour = (instantane: TripSnapshot, date: string) => instantane.days.find((d) => d.date === date)!;
const nomsDesEtapes = (items: TripSnapshot["days"][number]["items"]) => items.flatMap((item) => (item.type === "stop" ? [item.stop.name] : []));

const RELECTURES: SourceRelectures = {
  pour: async () => ({ ok: true, relectures: { validite: () => "valide", plages: () => INCONNU, duree: () => ({ minutes: 10, estimee: true }) } }),
};

/** Révision M1b ouverte sur la version 1 : déblocage, un « Pas pour moi » sur la deuxième case, tri clos, ligne `batch`. */
async function ouvrirRevision(org: Org, tripId: string, apercu: string) {
  await admin.query("INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')", [org.org, tripId]);
  const cases = await lire<{ id: string; content: { stop: { name: string }; category: string } }>(
    org,
    "SELECT id, content FROM public.proposals WHERE trip_id = $1 AND phase = 'preview' ORDER BY position",
    [tripId],
  );
  const ecartee = cases[1]!;
  await admin.query(
    `INSERT INTO public.preference_signals (organization_id, trip_id, request_id, signal, origin, category, proposal_id)
     VALUES ($1, $2, gen_random_uuid(), 'dislike', 'gesture', $3, $4)`,
    [org.org, tripId, ecartee.content.category, ecartee.id],
  );
  const lot = await inTx(app, { org: org.org, user: org.owner }, async (cl) => {
    const cloture = (
      await cl.query(
        "INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', $4, gen_random_uuid()) RETURNING id",
        [org.org, tripId, apercu, cases.length],
      )
    ).rows[0].id as string;
    return (
      await cl.query(
        "INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, request_id) VALUES ($1, $2, 'batch', 'queued', 1, $3, gen_random_uuid()) RETURNING id",
        [org.org, tripId, cloture],
      )
    ).rows[0].id as string;
  });
  return { lot, ecartee };
}

// --- Tests ------------------------------------------------------------------------------------------------------------

describe("plusieurs-villes : deux villes sur api (critères 1 à 12)", () => {
  it("plusieurs-villes: deux villes, ligne « Vers Florence », cadrage, vérification par ville, cases sans le jour du changement", async () => {
    const org = await createOrg(auth);
    const c = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const { tripId, sorties, fin } = await generer(org, DEUX_VILLES, c.fabrique);
    expect(fin.arret).toBeUndefined();
    // Deux lignes `stays` (critère 1), dans l'ordre.
    expect((await lire<{ city: string }>(org, "SELECT city FROM public.stays WHERE trip_id = $1 ORDER BY from_date", [tripId])).map((l) => l.city)).toEqual(["Rome", "Florence"]);
    // État du workflow : ni nom, ni ville, ni identifiant de lieu.
    for (const s of sorties) expect(JSON.stringify(s)).not.toMatch(/placeId|SENTINELLE|Rome|Florence/);

    const v1 = await version(org, tripId, 1);
    const j2 = jour(v1, "2027-05-05");
    // Thème écrit par le code ; ligne « Vers Florence » au départ estimé, durée de la sortie admise, mode des transports publics.
    expect(j2.theme).toBe("De Rome à Florence");
    const rang = j2.items.findIndex((item) => item.type === "transfer");
    expect(j2.items[rang]).toEqual({ type: "transfer", from: "Rome", to: "Florence", source: "estimated", start: "10:00", estimatedMinutes: 150, mode: "transit" });
    // Créneau de l'IA retiré (dans le créneau occupé) ; activités au-delà du rythme équilibré (2) retirées ; aucun toReserve.
    expect(nomsDesEtapes(j2.items.slice(0, rang))).toEqual(["Panthéon"]);
    expect(nomsDesEtapes(j2.items.slice(rang + 1))).toEqual(["Trattoria Mario", "Galerie des Offices", "Roscioli"]);
    expect(j2.items.flatMap((item) => (item.type === "stop" ? item.stop.exceptions : []))).not.toContain("toReserve");
    // Aucun trajet d'une ville à l'autre : pas de segment juste après la ligne.
    expect(j2.items[rang + 1]?.type).not.toBe("segment");
    // Vérification par ville (critère 12) : étape du matin de la ville quittée gardée ; lieu de Rome après l'arrivée, ou un jour
    // de Florence, sans `placeId` ; le même lieu un jour de Rome le garde.
    const placeIdDe = (date: string, nom: string) =>
      jour(v1, date).items.flatMap((item) => (item.type === "stop" && item.stop.name === nom ? [item.stop.placeId ?? null] : []))[0];
    expect(placeIdDe("2027-05-05", "Panthéon")).toEqual(expect.any(String));
    expect(placeIdDe("2027-05-05", "Roscioli")).toBeNull();
    expect(placeIdDe("2027-05-05", "Galerie des Offices")).toEqual(expect.any(String));
    expect(placeIdDe("2027-05-06", "Ai Tre Scalini")).toBeNull();
    expect(placeIdDe("2027-05-04", "Ai Tre Scalini")).toEqual(expect.any(String));
    // Aucune autre journée ne porte de transfer.
    expect(v1.days.filter((d) => d.items.some((item) => item.type === "transfer")).map((d) => d.date)).toEqual(["2027-05-05"]);

    // Créneau retiré jamais cherché ; chaque lieu cherché dans la zone de sa ville (ville de l'IA écrasée).
    const textes = c.recherches.map((r) => r.texte);
    expect(textes.some((t) => t.startsWith("Lieu dans le créneau M4B") || t.startsWith("Ponte Vecchio"))).toBe(false);
    expect(textes).toContain("Trattoria Mario, Florence");
    expect(textes).not.toContain("Trattoria Mario, Paris");
    const zoneDe = (texte: string) => c.recherches.find((r) => r.texte === texte)?.restriction;
    expect(zoneDe("Colisée, Rome")).toEqual(zoneDe("Panthéon, Rome"));
    expect(zoneDe("Trattoria Mario, Florence")).toEqual(zoneDe("Duomo de Florence, Florence"));
    expect(zoneDe("Trattoria Mario, Florence")).not.toEqual(zoneDe("Colisée, Rome"));

    // Cases de l'aperçu : jamais une étape de la journée du changement de ville (0148 § 10.1 point 1).
    const idsJ2 = new Set(j2.items.flatMap((item) => (item.type === "stop" ? [item.stop.id] : [])));
    const cases = await lire<{ position: number; content: { stop: { id: string }; day: number } }>(org, "SELECT position, content FROM public.proposals WHERE trip_id = $1 ORDER BY position", [tripId]);
    expect(cases.length).toBeGreaterThan(0);
    for (const cas of cases) {
      expect(idsJ2.has(cas.content.stop.id)).toBe(false);
      expect(cas.content.day).not.toBe(2);
    }
    // Aucune ligne « À faire » de réservation pour une étape du jour du changement.
    const aFaire = await lire<{ kind: string; label: string }>(org, "SELECT kind, label FROM public.checklist_items WHERE trip_id = $1", [tripId]);
    expect(aFaire.filter((l) => l.kind === "reservation").map((l) => l.label)).not.toContain("Galerie des Offices");

    // Prompt v5 : villes et changements, aucune donnée Google, aucun récit.
    expect(c.requetes()).toHaveLength(1);
    const texte = c.texte();
    expect(texte).toContain('\\"villes\\"');
    expect(texte).toContain('\\"changements\\"');
    expect(texte).not.toMatch(/SENTINELLE|recit/);
  });

  it("plusieurs-villes: Trip.cities lu depuis stays, absent de la vue partagée avec le transfer", async () => {
    const org = await createOrg(auth);
    const c = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const { tripId } = await generer(org, DEUX_VILLES, c.fabrique);
    const voyages = createApiTripAdapter({ relectures: RELECTURES, withOrg, chaine: "inversee" });
    const trip = await voyages.getTrip(contexteDe(org), tripId);
    expect(trip?.cities).toEqual([
      { name: "Rome", start: "2027-05-04", end: "2027-05-05" },
      { name: "Florence", start: "2027-05-05", end: "2027-05-08" },
    ]);
    // Vue partagée (0148 § 1 point 4 et § 6 point 2 ; S-M4-4) : ni transfer ni cities, sans migration.
    const jeton = token();
    await inTx(app, { org: org.org, user: org.owner }, (cl) =>
      cl.query("INSERT INTO share_links (organization_id, trip_id, token_hash, created_by, expires_at) VALUES ($1, $2, $3, $4, now() + interval '30 days')", [org.org, tripId, jeton, org.owner]),
    );
    const partage = await inTx(
      app,
      {},
      async (cl) => {
        await cl.query("SELECT set_config('app.share_token_hash', $1, true)", [jeton.toString("hex")]);
        return { trip: (await cl.query("SELECT * FROM shared_trip")).rows, version: (await cl.query("SELECT * FROM shared_trip_version")).rows };
      },
      "vadrouille_share",
    );
    expect(partage.version).toHaveLength(1);
    expect(JSON.stringify(partage.version)).not.toMatch(/transfer|Vers Florence|"cities"/);
    expect(JSON.stringify(partage.trip)).not.toMatch(/cities|Florence/);
    // La version, elle, porte la ligne.
    expect(JSON.stringify(await version(org, tripId, 1))).toContain('"transfer"');
  });

  it("changement de ville: l'engagement devenu transfer n'est pas un événement ; son libellé ne va ni au prompt, ni au journal, ni à l'état", async () => {
    const org = await createOrg(auth);
    const espion = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const espionWarn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const draft: TripDraft = { ...DEUX_VILLES, commitments: [{ kind: "ticket", label: "Train LIBELLE_BILLET_M4B", date: "2027-05-05", start: "10:12", end: "11:50" }] };
    const c = composition({ ...PROGRAMME_DEUX_VILLES, jours: PROGRAMME_DEUX_VILLES.jours.map((j) => ({ date: j.date, ...(j.titre === undefined ? {} : { titre: j.titre }), creneaux: j.creneaux })) }, PLACES_DEUX_VILLES());
    const { tripId, sorties, fin } = await generer(org, draft, c.fabrique);
    expect(fin.arret).toBeUndefined();
    const v1 = await version(org, tripId, 1);
    const j2 = jour(v1, "2027-05-05");
    expect(j2.items.filter((item) => item.type === "transfer")).toEqual([
      { type: "transfer", from: "Rome", to: "Florence", source: "entered", start: "10:12", end: "11:50", label: "Train LIBELLE_BILLET_M4B" },
    ]);
    // Jamais un événement ni une étape engagement.
    expect(JSON.stringify(v1.days.map((d) => [d.events, nomsDesEtapes(d.items)]))).not.toContain("LIBELLE_BILLET_M4B");
    expect(c.texte()).not.toContain("LIBELLE_BILLET_M4B");
    for (const s of sorties) expect(JSON.stringify(s)).not.toContain("LIBELLE_BILLET_M4B");
    const journal = [...espion.mock.calls, ...espionWarn.mock.calls].map((args) => String(args[0])).join("\n");
    expect(journal).not.toContain("LIBELLE_BILLET_M4B");
    expect(journal).not.toMatch(/SENTINELLE/);
    espion.mockRestore();
    espionWarn.mockRestore();
  });

  it("plusieurs-villes: récit gardé hors du prompt v5 tant que la garde est fermée (0139 § 1.2 point 6)", async () => {
    const org = await createOrg(auth);
    const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: async () => null, demarrerVoyageComplet: async () => null, chaine: "inversee" });
    const r = await adapter.createTrip(contexteDe(org), demande(DEUX_VILLES));
    const tripId = (r as { value: { tripId: string } }).value.tripId;
    await admin.query("UPDATE public.briefs SET story = 'RECIT_SECRET_M4B' WHERE trip_id = $1", [tripId]);
    const [run] = await lire<{ id: string }>(org, "SELECT id FROM public.generation_runs WHERE trip_id = $1 AND kind = 'preview'", [tripId]);
    const c = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const etat: EtatProgramme = { generationRunId: run!.id, organizationId: org.org, rang: 0 };
    const apresA = await etapeProgrammeDebut(etat, dependances(c.fabrique));
    expect((await etapeProgrammeEcriture(apresA, dependances(c.fabrique))).arret).toBeUndefined();
    expect(c.texte()).not.toContain("RECIT_SECRET_M4B");
  });
});

describe("plusieurs-villes : createTrip sous la chaîne inversée (critères 2 à 4)", () => {
  const creer = async (otherCities: TripDraft["otherCities"], destination = "Rome") => {
    const org = await createOrg(auth);
    const adapter = createApiCreationAdapter({ withOrg, maintenant: () => MAINTENANT, demarrerApercu: async () => null, demarrerVoyageComplet: async () => null, chaine: "inversee" });
    const r = await adapter.createTrip(contexteDe(org), demande({ ...DEUX_VILLES, destination, otherCities }));
    const [n] = await lire<{ n: number }>(org, "SELECT count(*)::int AS n FROM public.trips", []);
    return { r, ecrits: n!.n };
  };
  const ville = (name: string, arrival: string) => ({ name, arrival, lodging: { kind: "none" as const } });

  it("plusieurs-villes: trois villes acceptées, une quatrième refusée", async () => {
    const trois = await creer([ville("Florence", "2027-05-05"), ville("Venise", "2027-05-06")]);
    expect(trois.r.ok).toBe(true);
    const quatre = await creer([ville("Florence", "2027-05-05"), ville("Venise", "2027-05-06"), ville("Milan", "2027-05-07")]);
    // `createTrip` refuse par `TripRequestSchema` (`.max(MAX_CITIES - 1)`) ; le champ est rendu par `parseInput` de l'action.
    expect(quatre.r).toMatchObject({ ok: false, error: { code: "validation_failed" } });
    expect(quatre.ecrits).toBe(0);
  });

  it("plusieurs-villes: même décalage horaire", async () => {
    expect((await creer([ville("Berlin", "2027-05-06")], "Paris")).r.ok).toBe(true);
    for (const [destination, autre] of [
      ["Lisbonne", "Madrid"],
      ["Édimbourg", "Paris"],
      ["Rome", "Atlantide-M4b"],
    ] as const) {
      const refus = await creer([ville(autre, "2027-05-06")], destination);
      expect(refus.r, `${destination} puis ${autre}`).toMatchObject({ ok: false, error: { code: "validation_failed", field: "draft.otherCities.0.name" } });
      expect(refus.ecrits).toBe(0);
    }
  });

  it("plusieurs-villes: même ville deux fois de suite refusée", async () => {
    const refus = await creer([ville("Rome", "2027-05-06")]);
    expect(refus.r).toMatchObject({ ok: false, error: { code: "validation_failed", field: "draft.otherCities.0.name" } });
    expect(refus.ecrits).toBe(0);
    expect((await creer([ville("Florence", "2027-05-05"), ville("Rome", "2027-05-06")])).r.ok).toBe(true);
  });
});

describe("plusieurs-villes : révision M1b (0148 § 8 point 2)", () => {
  it("plusieurs-villes: révision d'un voyage à deux villes", async () => {
    const org = await createOrg(auth);
    const c = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const { tripId, apercu } = await generer(org, DEUX_VILLES, c.fabrique);
    const { lot, ecartee } = await ouvrirRevision(org, tripId, apercu);
    const revision = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const etat: EtatLot = { generationRunId: lot, organizationId: org.org, rang: 0 };
    const apresA = await etapeLotDebut(etat, dependances(revision.fabrique));
    expect(apresA.arret).toBeUndefined();
    const fin = await etapeLotPlanification(apresA, dependances(revision.fabrique));
    expect(fin.arret).toBeUndefined();
    const v1 = await version(org, tripId, 1);
    const v2 = await version(org, tripId, 2);
    // Le transfer est reconstruit par le code depuis la sortie v3 (durée estimée de la sortie, 150 minutes, comme à la
    // génération) : identique à celui de la version de base ; le thème aussi ; l'étape écartée a disparu.
    const transfer = (instantane: TripSnapshot) => jour(instantane, "2027-05-05").items.filter((item) => item.type === "transfer");
    expect(transfer(v2)).toEqual(transfer(v1));
    expect(transfer(v2)).toEqual([expect.objectContaining({ source: "estimated", estimatedMinutes: 150 })]);
    expect(jour(v2, "2027-05-05").theme).toBe("De Rome à Florence");
    expect(v2.days.flatMap((d) => nomsDesEtapes(d.items))).not.toContain(ecartee.content.stop.name);
    // Requête de révision : une seule, prompt `revision` v3, `zdr` et `deny` imposés, brief v5 (villes, changements) ;
    // aucune donnée Google, aucun libellé de billet, aucun récit.
    expect(revision.requetes()).toHaveLength(1);
    const [requete] = revision.requetes();
    expect(requete!.prompt).toEqual({ id: "revision", version: 3 });
    expect(requete!.routage).toEqual(expect.objectContaining({ zdr: true, data_collection: "deny" }));
    const donnees = requete!.messages.find((m) => m.role === "user")!.contenu;
    expect(donnees).toMatch(/"villes"/);
    expect(donnees).toMatch(/"changements"/);
    expect(revision.texte()).not.toMatch(/SENTINELLE|recit|placeId/);
  });
});

describe("plusieurs-villes : isolation entre organisations (Sécurité, revue de la PR 932, M4)", () => {
  it("plusieurs-villes: une autre organisation ne lit ni Trip.cities ni les séjours, et ne révise pas le voyage", async () => {
    const org = await createOrg(auth);
    const autre = await createOrg(auth);
    const c = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const { tripId, apercu } = await generer(org, DEUX_VILLES, c.fabrique);
    // Lecture : le voyage (et ses villes) n'existe pas pour l'autre organisation, ni par l'adaptateur ni en SQL (RLS).
    const voyages = createApiTripAdapter({ relectures: RELECTURES, withOrg, chaine: "inversee" });
    expect((await voyages.getTrip(contexteDe(org), tripId))?.cities).toHaveLength(2);
    expect(await voyages.getTrip(contexteDe(autre), tripId)).toBeNull();
    expect(await lire(autre, "SELECT 1 FROM public.stays WHERE trip_id = $1", [tripId])).toEqual([]);
    expect(await lire(autre, "SELECT 1 FROM public.trip_versions WHERE trip_id = $1", [tripId])).toEqual([]);
    // Révision : la ligne `batch` du voyage, déroulée sous l'autre organisation, ne lit rien et n'envoie aucune requête.
    const { lot } = await ouvrirRevision(org, tripId, apercu);
    const revision = composition(PROGRAMME_DEUX_VILLES, PLACES_DEUX_VILLES());
    const etat: EtatLot = { generationRunId: lot, organizationId: autre.org, rang: 0 };
    // La garde du lot ne trouve pas la ligne sous l'autre organisation (RLS) : arrêt, sans relecture ni forfait.
    const sortie = await etapeLotDebut(etat, dependances(revision.fabrique));
    expect(sortie.arret).toBe("step_expired");
    expect(revision.requetes()).toHaveLength(0);
    expect(await lire(org, "SELECT version FROM public.trip_versions WHERE trip_id = $1 ORDER BY version", [tripId])).toEqual([{ version: 1 }]);
    expect(await lire(org, "SELECT phase FROM public.generation_runs WHERE id = $1", [lot])).toEqual([{ phase: "queued" }]);
  });
});

describe("plusieurs-villes : forfait (critère 21 ; 0148 § 3)", () => {
  it("plusieurs-villes: trois villes et quinze jours tiennent dans le forfait simulé du profil programme", async () => {
    const villes: { nom: Ville; arrivee: string; logement: string }[] = [
      { nom: "Rome", arrivee: "2027-05-04", logement: "Rione Monti (près du Colisée)" },
      { nom: "Florence", arrivee: "2027-05-09", logement: "Santa Croce" },
      { nom: "Venise", arrivee: "2027-05-14", logement: "Cannaregio" },
    ];
    const draft: TripDraft = {
      destination: "Rome",
      start: "2027-05-04",
      end: "2027-05-18",
      lodging: { kind: "area", label: villes[0]!.logement },
      otherCities: villes.slice(1).map((v) => ({ name: v.nom, arrival: v.arrivee, lodging: { kind: "area" as const, label: v.logement } })),
      commitments: [],
    };
    const ajouts: Record<string, Ville> = {};
    for (const v of villes.slice(1)) ajouts[texteDuLogement({ kind: "area", label: v.logement }, v.nom)] = v.nom;
    const villeDuJour = (date: string): Ville => [...villes].reverse().find((v) => v.arrivee <= date)!.nom;
    const villePrecedente = (date: string): Ville => [...villes].reverse().find((v) => v.arrivee < date)!.nom;
    // Le jour d'un changement, un lieu rangé avant le départ est dans la ville quittée (0148 § 6 point 3).
    const lieu = (date: string, n: number, ville: Ville = villeDuJour(date)) => {
      const nom = `Lieu ${date} n${n}`;
      ajouts[nom] = ville;
      return nom;
    };
    const jours: Programme["jours"] = [];
    for (let i = 0; i < 15; i += 1) {
      const date = new Date(Date.UTC(2027, 4, 4 + i)).toISOString().slice(0, 10);
      const changement = villes.slice(1).some((v) => v.arrivee === date);
      // Jour ordinaire : 6 lieux ; jour de changement : 4 lieux (1 avant le départ de 10:00, 3 après le créneau occupé).
      const creneaux = changement
        ? [
            etape("09:00", "09:45", "visite", lieu(date, 1, villePrecedente(date))),
            etape("13:00", "14:00", "repas_midi", lieu(date, 2)),
            etape("14:30", "16:00", "visite", lieu(date, 3)),
            etape("19:30", "21:00", "repas_soir", lieu(date, 4)),
          ]
        : [
            etape("09:30", "11:00", "visite", lieu(date, 1)),
            etape("12:30", "13:30", "repas_midi", lieu(date, 2)),
            etape("14:00", "15:30", "visite", lieu(date, 3)),
            etape("16:00", "17:30", "visite", lieu(date, 4)),
            etape("18:30", "19:15", "apero", lieu(date, 5)),
            etape("20:00", "21:30", "repas_soir", lieu(date, 6)),
          ];
      jours.push({ date, ...(changement ? { dureeEstimeeMinutes: 120 } : {}), creneaux });
    }
    expect(Object.keys(ajouts).length).toBe(13 * 6 + 2 * 4 + 2);
    const c = composition({ titre: "Trois villes", jours, bonsPlans: [] }, placesAvec(ajouts));
    const org = await createOrg(auth);
    const { tripId, fin } = await generer(org, draft, c.fabrique, { plafonds: PLAFONDS_VARIANTE_SIMULEE });
    expect(fin.arret).toBeUndefined();
    // 86 lieux et 3 logements : 89 Text Search au plus 100 (profil `programme`), chaque étape vérifiée.
    expect(c.recherches.length).toBeLessThanOrEqual(PLAFONDS_VARIANTE_SIMULEE.generations.programme.placesTextSearch);
    const v1 = await version(org, tripId, 1);
    const etapes = v1.days.flatMap((d) => d.items.flatMap((item) => (item.type === "stop" ? [item.stop] : [])));
    expect(etapes).toHaveLength(86);
    expect(etapes.filter((s) => s.placeId === undefined).map((s) => s.name)).toEqual([]);
    expect(v1.days.filter((d) => d.items.some((item) => item.type === "transfer")).map((d) => d.date)).toEqual(["2027-05-09", "2027-05-14"]);
  });
});
