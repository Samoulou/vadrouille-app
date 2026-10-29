import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { createApiCreationAdapter } from "@/adapters/api-creation";
import type { ClientModeles } from "@/ai/client";
import { createApiTripAdapter } from "@/adapters/api";
import { FixturesModelesSchema } from "@/ai/modeles.simule";
import { lireProgramme, ordreEcrit } from "@/ai/sorties";
import {
  TripSnapshotSchema,
  type TripDraft,
  type TripRequest,
  type TripSnapshot,
} from "@/contracts";
import { INCONNU, type SourceRelectures } from "@/domain/relectures";
import { chargerDoubles } from "@/server/composition/fixtures-simulees";
import {
  composerSimuleeAvec,
  reduireSiteDuProgramme,
  type DoublesGeneration,
  type FabriqueGeneration,
} from "@/server/composition/generation";
import { CONFIGURATION_IA } from "@/server/config/ia";
import { CONFIGURATION_MOTEUR } from "@/server/config/moteur";
import type { DependancesGeneration } from "@/server/generation/dependances";
import { etapeCompletDebut } from "@/server/generation/etapes-complet";
import { etapeLotDebut } from "@/server/generation/etapes-lot";
import {
  etapeProgrammeDebut,
  etapeProgrammeEcriture,
  identifiantBonPlan,
} from "@/server/generation/etapes-programme";
import {
  EtatProgrammeSchema,
  type EtatProgramme,
} from "@/server/generation/etat";
import {
  assemblerProgrammeIa,
  modeDeTrajet,
} from "@/server/programme/assemblage";
import { briefDepuisFormulaire } from "@/server/programme/brief";
import { instantaneDuProgramme } from "@/server/programme/instantane";
import { avecSiteGarde, sitesDuProgramme } from "@/server/programme/sites";
import type { OrgTransaction } from "@/server/with-org";

import {
  BRIEF_EDIMBOURG,
  MAINTENANT,
  PLAFONDS_LARGES,
  contexteDe,
  creerHorlogeManuelle,
  creerWithOrg,
  creerWithSystemOrgPourTests,
} from "../support/banc-apercu";
import {
  journalDePrompts,
  type JournalPrompts,
} from "../support/journal-prompts";
import {
  avecSentinellesGoogle,
  sentinellesPresentes,
} from "../support/sentinelles-google";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { creerBaseApercu, type BaseApercu } from "./base-apercu";
import { closeAll, createOrg, inTx, type DbClient, type Org } from "./helpers";

/**
 * Chaîne inversée sur `api` (M1a-2, ticket 851 ; décision 0136 § 2, § 3 et § 4 ; verdict 0139) sur la base réelle : workflow
 * `generateProgramme` déroulé sans le SDK (étapes `a` puis `e`), variante simulée sur les fixtures de Rome (`rome-1`), aucune
 * clé, aucun appel réel, aucune position écrite. La chaîne est **injectée** (`chaine: "inversee"`) : `CHAINE_APERCU` vaut
 * encore `"ancienne"` dans cette PR (M1a-3 la bascule).
 */

let base: BaseApercu;
let db: BaseApercu["db"];
let withOrg: ReturnType<typeof creerWithOrg>;
let app: DbClient;
let auth: DbClient;
let admin: DbClient;
let doublesRome: () => DoublesGeneration;

beforeAll(async () => {
  base = await creerBaseApercu("chaine_inversee");
  ({ db, app, auth, admin } = base);
  withOrg = creerWithOrg(db);
  doublesRome = await chargerDoubles({ VADROUILLE_ENV: "ci" }, "Rome");
}, 120_000);
afterAll(async () => {
  await base.supprimer();
  await closeAll();
});
afterEach(() => {
  vi.restoreAllMocks();
});

const BROUILLON_ROME: TripDraft = {
  destination: "Rome",
  start: "2027-05-04",
  end: "2027-05-08",
  lodging: { kind: "area", label: "Rione Monti (près du Colisée)" },
  otherCities: [],
  commitments: [],
};

const demandeRome = (draft: Partial<TripDraft> = {}): TripRequest => ({
  requestId: crypto.randomUUID(),
  draft: { ...BROUILLON_ROME, ...draft },
  brief: BRIEF_EDIMBOURG,
});

function dependances(
  surcharge: Partial<DependancesGeneration> = {},
  fabrique?: () => FabriqueGeneration,
): DependancesGeneration {
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

/** Composition simulée de Rome dont chaque étape journalise ses requêtes de modèles (et peut remplacer un double). */
function journalisee(
  remplacer: (d: DoublesGeneration) => Partial<DoublesGeneration> = () => ({}),
) {
  const journaux: JournalPrompts[] = [];
  const fabrique = () =>
    composerSimuleeAvec({
      doubles: () => {
        const d = doublesRome();
        const remplaces = { ...d, ...remplacer(d) };
        const j = journalDePrompts(remplaces.modeles);
        journaux.push(j);
        return { ...remplaces, modeles: j.client };
      },
    });
  return {
    fabrique,
    requetes: () => journaux.flatMap((j) => j.requetes),
    texte: () => journaux.map((j) => j.texte()).join("\n"),
  };
}

function adaptateur(chaine: "inversee" | "ancienne" = "inversee") {
  const demarrerApercu = vi.fn<
    (generationRunId: string, organizationId: string) => Promise<string | null>
  >(async () => null);
  const demarrerVoyageComplet = vi.fn<
    (generationRunId: string, organizationId: string) => Promise<string | null>
  >(async () => `wrun_${crypto.randomUUID()}`);
  const adapter = createApiCreationAdapter({
    withOrg,
    maintenant: () => MAINTENANT,
    demarrerApercu,
    demarrerVoyageComplet,
    chaine,
  });
  return { adapter, demarrerApercu, demarrerVoyageComplet };
}

async function lancer(org: Org, demande = demandeRome()) {
  const outils = adaptateur();
  const r = await outils.adapter.createTrip(contexteDe(org), demande);
  expect(r.ok).toBe(true);
  const tripId = (r as { value: { tripId: string } }).value.tripId;
  const run = await dernierRun(org, tripId);
  const etat: EtatProgramme = {
    generationRunId: run.id,
    organizationId: org.org,
    rang: 0,
  };
  return { ...outils, tripId, run, etat };
}

/** Déroule `generateProgramme` comme le workflow, sans le SDK : `a`, puis `e` si `a` ne s'est pas arrêtée. */
async function derouler(
  etat: EtatProgramme,
  deps: DependancesGeneration,
): Promise<{ readonly fin: EtatProgramme; readonly sorties: EtatProgramme[] }> {
  const apresA = await etapeProgrammeDebut(etat, deps);
  if (apresA.arret !== undefined) return { fin: apresA, sorties: [apresA] };
  const apresE = await etapeProgrammeEcriture(apresA, deps);
  return { fin: apresE, sorties: [apresA, apresE] };
}

async function dernierRun(org: Org, tripId: string, kind = "preview") {
  return inTx(app, { org: org.org, user: org.owner }, async (c) => {
    const { rows } = await c.query(
      "SELECT id, phase, stop_reason, step_seq, last_version FROM public.generation_runs WHERE trip_id = $1 AND kind = $2 ORDER BY started_at DESC, id DESC LIMIT 1",
      [tripId, kind],
    );
    return rows[0] as {
      id: string;
      phase: string;
      stop_reason: string | null;
      step_seq: number;
      last_version: number | null;
    };
  });
}

async function lire<T>(
  org: Org,
  texte: string,
  valeurs: unknown[],
): Promise<T[]> {
  return inTx(
    app,
    { org: org.org, user: org.owner },
    async (c) => (await c.query(texte, valeurs)).rows as T[],
  );
}

const nombre = async (org: Org, table: string, tripId: string) =>
  (
    await lire<{ n: number }>(
      org,
      `SELECT count(*)::int AS n FROM public.${table} WHERE trip_id = $1`,
      [tripId],
    )
  )[0]!.n;

/** Texte SQL d'une requête de drizzle (fragments de texte seulement, paramètres exclus ; comme `apercu.test.ts`). */
function texteSql(requete: unknown): string {
  const morceaux: string[] = [];
  const visiter = (noeud: unknown): void => {
    if (typeof noeud !== "object" || noeud === null) return;
    const objet = noeud as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(objet.queryChunks)) objet.queryChunks.forEach(visiter);
    else if (
      Array.isArray(objet.value) &&
      objet.value.every((v) => typeof v === "string")
    )
      morceaux.push(...(objet.value as string[]));
  };
  visiter(requete);
  return morceaux.join("");
}

/**
 * Base dont chaque transaction note le texte de ses requêtes : la transaction passée au travail n'expose que `execute`, seul
 * chemin de `executeurSql` et de `withOrg` (même enveloppe que `transactionIntercepte` de `apercu.test.ts`).
 */
function baseEnregistree(textes: string[]): BaseApercu["db"] {
  const enveloppe = (tx: OrgTransaction): OrgTransaction =>
    ({
      execute: (requete: Parameters<OrgTransaction["execute"]>[0]) => {
        textes.push(texteSql(requete));
        return tx.execute(requete);
      },
    }) as unknown as OrgTransaction;
  return {
    transaction: <T>(travail: (tx: OrgTransaction) => Promise<T>) => db.transaction((tx) => travail(enveloppe(tx as unknown as OrgTransaction))),
  } as unknown as BaseApercu["db"];
}

/** Relectures permissives pour la lecture (les lieux des fixtures de Rome ne sont pas dans la table du double des voyages). */
const RELECTURES: SourceRelectures = {
  pour: async () => ({
    ok: true,
    relectures: {
      validite: () => "valide",
      plages: () => INCONNU,
      duree: () => ({ minutes: 10, estimee: true }),
    },
  }),
};

async function version1(org: Org, tripId: string): Promise<TripSnapshot> {
  const [ligne] = await lire<{ snapshot: unknown }>(
    org,
    "SELECT snapshot FROM public.trip_versions WHERE trip_id = $1 AND version = 1",
    [tripId],
  );
  return TripSnapshotSchema.parse(ligne!.snapshot);
}

const lignesDuJournal = (
  espion: { mock: { calls: unknown[][] } },
  prefixe: string,
) =>
  espion.mock.calls
    .map((args) => String(args[0]))
    .filter((ligne) => ligne.includes(`"event":"${prefixe}`));

describe("chaîne inversée : chemin nominal (Rome)", () => {
  it("chaine-inversee: createTrip sur api écrit la version 1 (ready, huit cases ancrées et justifiées, step_seq 2, À faire dans l'ordre, story NULL)", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(org);
    const { fin, sorties } = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    expect(sorties.map((s) => s.rang)).toEqual([1, 2]);
    for (const s of sorties) {
      expect(EtatProgrammeSchema.safeParse(s).success).toBe(true);
      expect(JSON.stringify(s)).not.toMatch(/placeId|SENTINELLE|lat|lng|Rome/);
    }
    const run = await dernierRun(org, tripId);
    expect(run).toMatchObject({
      phase: "ready",
      stop_reason: null,
      step_seq: 2,
      last_version: 1,
    });

    const cases = await lire<{
      position: number;
      slot_type: string;
      content: { stop: { placeId?: string }; detour: string };
    }>(
      org,
      "SELECT position, slot_type, content FROM public.proposals WHERE trip_id = $1 ORDER BY position",
      [tripId],
    );
    expect(cases.map((c) => c.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    for (const c of cases) {
      expect(c.slot_type).toBe("proposal");
      expect(c.content.stop.placeId).toMatch(/\S/);
      expect(c.content.detour.trim()).not.toBe("");
    }

    const versions = await lire<{
      version: number;
      author_kind: string;
      snapshot: { days: { index: number }[] };
    }>(
      org,
      "SELECT version, author_kind, snapshot FROM public.trip_versions WHERE trip_id = $1",
      [tripId],
    );
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe(1);
    expect(versions[0]!.author_kind).toBe("workflow");
    expect(TripSnapshotSchema.safeParse(versions[0]!.snapshot).success).toBe(
      true,
    );
    expect(
      await lire(
        org,
        "SELECT current_version FROM public.trips WHERE id = $1",
        [tripId],
      ),
    ).toEqual([{ current_version: 1 }]);
    // Toutes les journées du séjour (4 au 8 mai) dans la version 1, sans durée ni date de contrôle ni position.
    expect(versions[0]!.snapshot.days.map((j) => j.index)).toEqual([
      1, 2, 3, 4, 5,
    ]);
    expect(JSON.stringify(versions[0]!.snapshot)).not.toMatch(
      /"minutes"|"travelMinutes"|"verifiedAt"|"lat"|"lng"/,
    );

    // Quartier (`area`) : la zone ne vit qu'en mémoire, `stays.place_id` reste NULL (0136 § 3.2).
    expect(
      await lire(org, "SELECT place_id FROM public.stays WHERE trip_id = $1", [
        tripId,
      ]),
    ).toEqual([{ place_id: null }]);

    const aFaire = await lire<{
      id: string;
      label: string;
      kind: string;
      sponsored: boolean;
    }>(
      org,
      "SELECT id, label, kind, sponsored FROM public.checklist_items WHERE trip_id = $1 ORDER BY id",
      [tripId],
    );
    expect(aFaire.length).toBeGreaterThan(0);
    expect(aFaire.map((l) => l.id)).toEqual(
      aFaire.map((_, rang) => identifiantBonPlan(etat.generationRunId, rang)),
    );
    for (const l of aFaire)
      expect(l).toMatchObject({ kind: "other", sponsored: false });

    expect(
      await lire(org, "SELECT story FROM public.briefs WHERE trip_id = $1", [
        tripId,
      ]),
    ).toEqual([{ story: null }]);
    expect(
      (
        await admin.query(
          "SELECT count(*)::int AS n FROM public.place_coordinates WHERE organization_id = $1",
          [org.org],
        )
      ).rows[0].n,
    ).toBe(0);

    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(statut.ok && statut.value.phase).toBe("ready");
  });

  it("chaine-inversee: le programme écrit suit la sortie de l'IA (mêmes journées, créneaux, repas et ordre que assemblerProgrammeIa)", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const ecrit = await version1(org, tripId);
    // Chemin pur, sur la même sortie simulée de Rome et la même vérification (placeId lus dans la version écrite, par le lieu et
    // l'heure de chaque créneau ; aucun site gardé : variante simulée).
    const conversion = briefDepuisFormulaire(
      BROUILLON_ROME,
      BRIEF_EDIMBOURG,
      undefined,
    );
    if (!conversion.ok) throw new Error("conversion refusée");
    const brief = conversion.brief;
    const modeles = FixturesModelesSchema.parse(
      JSON.parse(
        await readFile(
          path.join(process.cwd(), "prototype/fixtures/modeles/rome.json"),
          "utf8",
        ),
      ),
    );
    const lecture = lireProgramme(JSON.stringify(modeles.programme), {
      arrivee: brief.arrivee,
      depart: brief.depart,
    });
    if (lecture.valeur === null) throw new Error("fixture illisible");
    const programme = ordreEcrit(lecture.valeur);
    const sites = sitesDuProgramme(programme, reduireSiteDuProgramme);
    const etapesEcrites = ecrit.days.map((jour) =>
      jour.items.flatMap((ligne) =>
        ligne.type === "stop" ? [ligne.stop] : [],
      ),
    );
    const logement = (
      await doublesRome().places.textSearch({
        texte: brief.logements[0]!.texte,
        biais: null,
      })
    ).placeIds[0]!;
    const complet = assemblerProgrammeIa({
      tripId,
      organizationId: org.org,
      brief,
      jours: programme.jours.map((jour, indiceJour) => ({
        date: jour.date,
        ...(jour.titre === undefined ? {} : { titre: jour.titre }),
        creneaux: jour.creneaux.map((creneau, rang) => ({
          ...avecSiteGarde(
            creneau,
            sites.adresseDe(indiceJour, rang),
            new Set(),
          ),
          placeId: etapesEcrites[indiceJour]?.find(
            (stop) =>
              stop.name === creneau.lieu && stop.start === creneau.debut,
          )?.placeId,
        })),
      })),
      bonsPlans: programme.bonsPlans,
      logements: [logement],
      configuration: CONFIGURATION_MOTEUR,
      mode: modeDeTrajet(brief),
      trajets: () => undefined,
    });
    const attendu = instantaneDuProgramme(complet.trip);
    expect(ecrit.days.length).toBe(programme.jours.length);
    expect(JSON.parse(JSON.stringify(ecrit.days))).toEqual(
      JSON.parse(JSON.stringify(attendu.days)),
    );
    // Repas de midi et du soir de la sortie de l'IA présents dans le programme écrit (étapes `meal`).
    const repas = etapesEcrites.flat().filter((stop) => stop.kind === "meal");
    expect(repas.some((stop) => stop.start < "15:00")).toBe(true);
    expect(repas.some((stop) => stop.start >= "18:00")).toBe(true);
  });

  it("chaine-inversee: un lieu introuvable n'a pas de placeId (étape gardée, sans case, signalée à la lecture)", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const { fabrique } = journalisee((d) => ({
      places: {
        ...d.places,
        textSearch: async (requete) =>
          requete.texte.includes("Colisée") &&
          !requete.texte.includes("Rione Monti")
            ? { placeIds: [] }
            : d.places.textSearch(requete),
      },
    }));
    expect(
      (await derouler(etat, dependances({}, fabrique))).fin.arret,
    ).toBeUndefined();
    const ecrit = await version1(org, tripId);
    const etapes = ecrit.days.flatMap((jour) =>
      jour.items.flatMap((ligne) =>
        ligne.type === "stop" ? [ligne.stop] : [],
      ),
    );
    const colisee = etapes.filter((stop) => stop.name === "Colisée");
    expect(colisee.length).toBeGreaterThan(0);
    for (const stop of colisee) expect(stop.placeId).toBeUndefined();
    expect(etapes.some((stop) => stop.placeId !== undefined)).toBe(true);
    const cases = await lire<{ content: { stop: { id: string } } }>(
      org,
      "SELECT content FROM public.proposals WHERE trip_id = $1",
      [tripId],
    );
    const sansPlace = new Set(colisee.map((stop) => stop.id));
    expect(cases.every((c) => !sansPlace.has(c.content.stop.id))).toBe(true);
  });

  it("chaine-inversee: aperçu en 8 cases (listPreviewSlots), lignes de proposals de l'organisation de la session", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const voyages = createApiTripAdapter({ relectures: RELECTURES, withOrg });
    const cases = await voyages.listPreviewSlots(contexteDe(org), tripId);
    expect(cases).toHaveLength(8);
    expect(
      (
        await admin.query(
          "SELECT DISTINCT organization_id FROM public.proposals WHERE trip_id = $1",
          [tripId],
        )
      ).rows,
    ).toEqual([{ organization_id: org.org }]);
  });

  it("isolation: une organisation ne lit ni ne modifie le voyage inversé d'une autre", async () => {
    const proprietaire = await createOrg(auth);
    const autre = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(proprietaire);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const voyages = createApiTripAdapter({ relectures: RELECTURES, withOrg });
    const avant = await dernierRun(proprietaire, tripId);
    expect(await voyages.getTrip(contexteDe(autre), tripId)).toBeNull();
    expect(await voyages.listPreviewSlots(contexteDe(autre), tripId)).toEqual(
      [],
    );
    expect(
      await adapter.getGenerationStatus(contexteDe(autre), tripId),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(
      await adapter.retryGeneration(contexteDe(autre), {
        tripId,
        requestId: crypto.randomUUID(),
      }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    expect(await dernierRun(proprietaire, tripId)).toEqual(avant);
    expect(await nombre(proprietaire, "trip_versions", tripId)).toBe(1);
    expect(
      (
        await lire<{ n: number }>(
          autre,
          "SELECT count(*)::int AS n FROM public.generation_runs",
          [],
        )
      )[0]!.n,
    ).toBe(0);
    // Le propriétaire lit son voyage : la lecture n'est pas vide par construction.
    expect((await voyages.getTrip(contexteDe(proprietaire), tripId))?.id).toBe(
      tripId,
    );
  });

  it("chaine-inversee: aucun accès au schéma prototype (aucune requête de createTrip ni des étapes ne vise prototype.*)", async () => {
    const org = await createOrg(auth);
    const textes: string[] = [];
    const enregistree = baseEnregistree(textes);
    const adapter = createApiCreationAdapter({
      withOrg: creerWithOrg(enregistree),
      maintenant: () => MAINTENANT,
      demarrerApercu: async () => null,
      chaine: "inversee",
    });
    const r = await adapter.createTrip(contexteDe(org), demandeRome());
    expect(r.ok).toBe(true);
    const tripId = (r as { value: { tripId: string } }).value.tripId;
    const run = await dernierRun(org, tripId);
    const { fin } = await derouler(
      { generationRunId: run.id, organizationId: org.org, rang: 0 },
      dependances({ transaction: creerWithSystemOrgPourTests(enregistree) }),
    );
    expect(fin.arret).toBeUndefined();
    expect(
      await adapter.getGenerationStatus(contexteDe(org), tripId),
    ).toMatchObject({ ok: true, value: { phase: "ready" } });
    expect(textes.length).toBeGreaterThan(5);
    expect(textes.some((t) => /public\.trip_versions/.test(t))).toBe(true);
    expect(textes.filter((t) => /\bprototype\s*\./i.test(t))).toEqual([]);
  });

  it("generateProgramme: logement connu, stays.place_id écrit avec la publication", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(
      org,
      demandeRome({
        lodging: {
          kind: "known",
          label: "Rione Monti (près du Colisée), Rome",
        },
      }),
    );
    const { fin } = await derouler(etat, dependances());
    expect(fin.arret).toBeUndefined();
    const sejours = await lire<{ place_id: string | null }>(
      org,
      "SELECT place_id FROM public.stays WHERE trip_id = $1",
      [tripId],
    );
    expect(sejours).toHaveLength(1);
    expect(sejours[0]!.place_id).toMatch(/\S/);
  });

  it("chaine-inversee: relance sans doublon (rejeu de e refusé par step_seq ; même requestId, même voyage, sans seconde exécution ni version)", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const { sorties } = await derouler(etat, dependances());
    const avant = await lire(
      org,
      "SELECT position, content FROM public.proposals WHERE trip_id = $1 ORDER BY position",
      [tripId],
    );
    const rejeu = await etapeProgrammeEcriture(sorties[0]!, dependances());
    expect(rejeu.arret).toBe("step_expired");
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect(
      await lire(
        org,
        "SELECT position, content FROM public.proposals WHERE trip_id = $1 ORDER BY position",
        [tripId],
      ),
    ).toEqual(avant);
    expect((await dernierRun(org, tripId)).step_seq).toBe(2);
    // Second createTrip avec le même requestId : même voyage, aucune seconde exécution ni version.
    const demande = demandeRome();
    const { adapter } = adaptateur();
    const premier = await adapter.createTrip(contexteDe(org), demande);
    const second = await adapter.createTrip(contexteDe(org), demande);
    expect(second).toEqual(premier);
    const autre = (premier as { value: { tripId: string } }).value.tripId;
    expect(
      (
        await lire<{ n: number }>(
          org,
          "SELECT count(*)::int AS n FROM public.generation_runs WHERE trip_id = $1",
          [autre],
        )
      )[0]!.n,
    ).toBe(1);
    expect(
      (
        await lire<{ n: number }>(
          org,
          "SELECT count(*)::int AS n FROM public.trips WHERE request_id = $1",
          [demande.requestId],
        )
      )[0]!.n,
    ).toBe(1);
  });

  it("chaine-inversee: aucune écriture hors de l'organisation de l'exécution", async () => {
    const proprietaire = await createOrg(auth);
    const autre = await createOrg(auth);
    const { tripId, etat } = await lancer(proprietaire);
    const { fabrique, requetes } = journalisee();
    const avant = await dernierRun(proprietaire, tripId);
    const fausse: EtatProgramme = { ...etat, organizationId: autre.org };
    for (const etape of [etapeProgrammeDebut, etapeProgrammeEcriture]) {
      const sortie = await etape(fausse, dependances({}, fabrique));
      expect(sortie.arret).toBe("step_expired");
      expect(sortie.organizationId).toBe(autre.org);
    }
    expect(requetes()).toHaveLength(0);
    expect(await dernierRun(proprietaire, tripId)).toEqual(avant);
    expect(await nombre(proprietaire, "trip_versions", tripId)).toBe(0);
    expect(await nombre(proprietaire, "checklist_items", tripId)).toBe(0);
    expect(
      (
        await lire<{ n: number }>(
          autre,
          "SELECT count(*)::int AS n FROM public.generation_runs",
          [],
        )
      )[0]!.n,
    ).toBe(0);
    // Exécution par l'organisation qui la possède : chaque ligne écrite porte cette organisation, et aucune autre.
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    for (const table of ["trip_versions", "proposals", "checklist_items", "stays", "generation_runs"]) {
      const { rows } = await admin.query(`SELECT DISTINCT organization_id FROM public.${table} WHERE trip_id = $1`, [tripId]);
      expect(rows, table).toEqual([{ organization_id: proprietaire.org }]);
    }
  });
});

describe("chaîne inversée : requête programme, prompts et journal", () => {
  it("generateProgramme: une seule requête programme, routage zdr et data_collection deny, modèle de la configuration", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const { fabrique, requetes } = journalisee();
    expect(
      (await derouler(etat, dependances({}, fabrique))).fin.arret,
    ).toBeUndefined();
    expect(requetes()).toHaveLength(1);
    const [requete] = requetes();
    expect(requete!.etape).toBe("programme");
    expect(requete!.modele).toBe(CONFIGURATION_IA.programme.modele);
    expect(requete!.routage).toMatchObject({
      data_collection: "deny",
      zdr: true,
    });
  });

  it("generateProgramme: routage refusé par le fournisseur, échec fermé sans seconde requête ni écriture", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const refus: ClientModeles = {
      envoyer: async () => {
        // Erreur fermée du client de modèles (forme de `ErreurOpenRouter`, dont le module de capacité n'est importé que par ses
        // propres tests : `tests/unit/p0/clients-reels.test.ts`).
        throw Object.assign(new Error("invalid_request"), {
          name: "ErreurOpenRouter",
          code: "invalid_request",
          retryable: false,
        });
      },
    };
    const { fabrique, requetes } = journalisee(() => ({ modeles: refus }));
    const { fin } = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeDefined();
    expect(requetes()).toHaveLength(1);
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "checklist_items", tripId)).toBe(0);
  });

  it("chaine-inversee: aucune donnée Google dans l'état, le journal ni le prompt (sentinelles des fiches et des recherches)", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const valeurs = new Set<string>();
    const { fabrique, texte } = journalisee((d) => {
      const s = avecSentinellesGoogle(d);
      for (const v of s.valeurs) valeurs.add(v);
      // Le niveau de prix sentinelle n'est pas une valeur du contrat de lieu : celui du double est gardé.
      return {
        places: {
          ...d.places,
          textSearch: s.places.textSearch,
          async details(placeId: string) {
            const [decore, brut] = await Promise.all([
              s.places.details(placeId),
              d.places.details(placeId),
            ]);
            return { ...decore, niveauPrix: brut.niveauPrix };
          },
        },
        routes: s.routes,
      };
    });
    const espion = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const { fin, sorties } = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBeUndefined();
    // Prompt : aucune sentinelle de fiche ni de recherche, aucun identifiant de lieu des doubles.
    expect(texte().length).toBeGreaterThan(0);
    expect(sentinellesPresentes(texte(), { valeurs })).toEqual([]);
    expect(texte()).not.toMatch(/test_place|SENTINELLE/);
    // Journal : la ligne de l'étape et toute autre ligne émise pendant le déroulé.
    const journal = espion.mock.calls.map((args) => String(args[0])).join("\n");
    expect(journal).toContain("generation.programme_written");
    expect(sentinellesPresentes(journal, { valeurs })).toEqual([]);
    expect(journal).not.toMatch(/test_place|SENTINELLE|placeId/);
    // État sérialisé : les quatre champs fermés seulement (0136 § 2.6).
    for (const sortie of sorties) {
      expect(
        Object.keys(sortie).filter(
          (cle) =>
            !["generationRunId", "organizationId", "rang", "arret"].includes(
              cle,
            ),
        ),
      ).toEqual([]);
      expect(sentinellesPresentes(JSON.stringify(sortie), { valeurs })).toEqual(
        [],
      );
    }
  });

  it("chaine-inversee: sites simulés, aucune résolution ni connexion (barrière fermée, aucun site soumis)", async () => {
    const org = await createOrg(auth);
    const { etat } = await lancer(org);
    const espion = vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const [ligne] = lignesDuJournal(espion, "generation.programme_written");
    const champs = JSON.parse(ligne!) as Record<string, unknown>;
    expect(champs.sitesChecked).toBe(0);
    expect(champs.sitesRemoved).toBe(0);
    expect(champs.sitesUnchecked).toBe(champs.sitesProposed);
  });

  it("chaine-inversee: aucun événement p0.* sur api", async () => {
    const espion = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const erreurs = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Exécution complète, puis `lodging_unresolved` et `model_output_invalid` (0139 § 2 point 7).
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const lignes = lignesDuJournal(espion, "generation.programme_written");
    expect(lignes).toHaveLength(1);
    const champs = JSON.parse(lignes[0]!) as Record<string, unknown>;
    expect(champs.level).toBe("info");
    expect(champs.modelCalls).toBe(1);
    expect(champs.days).toBe(5);
    for (const interdit of [tripId, org.org, etat.generationRunId, "Rome", "placeId"]) expect(lignes[0]).not.toContain(interdit);

    const sansLogement = journalisee((d) => ({ places: { ...d.places, textSearch: async () => ({ placeIds: [] }) } }));
    expect((await derouler((await lancer(org)).etat, dependances({}, sansLogement.fabrique))).fin.arret).toBe("lodging_unresolved");
    const illisible: ClientModeles = { envoyer: async () => ({ texte: "pas du JSON", coutUsd: 0 }) };
    const sortieIllisible = journalisee(() => ({ modeles: illisible }));
    expect((await derouler((await lancer(org)).etat, dependances({}, sortieIllisible.fabrique))).fin.arret).toBe("model_output_invalid");

    expect(lignesDuJournal(espion, "generation.programme_written").length).toBeGreaterThanOrEqual(2);
    expect([...lignesDuJournal(espion, "p0."), ...lignesDuJournal(erreurs, "p0.")]).toEqual([]);
  });

  it("journal: generation.programme_written, compteurs indépendants de l'ancrage", async () => {
    const compteurs = async (
      remplacer?: (d: DoublesGeneration) => Partial<DoublesGeneration>,
    ) => {
      const org = await createOrg(auth);
      const { etat } = await lancer(org);
      const espion = vi
        .spyOn(console, "log")
        .mockImplementation(() => undefined);
      const { fabrique } = journalisee(remplacer);
      await derouler(etat, dependances({}, fabrique));
      const [ligne] = lignesDuJournal(espion, "generation.programme_written");
      espion.mockRestore();
      return JSON.parse(ligne!) as Record<string, unknown>;
    };
    const nominal = await compteurs();
    // Aucun lieu trouvé hors du logement : la vérification échoue partout, le journal ne change pas.
    const sansLieux = await compteurs((d) => ({
      places: {
        ...d.places,
        textSearch: async (requete) =>
          requete.texte.includes("Rione Monti")
            ? d.places.textSearch(requete)
            : { placeIds: [] },
      },
    }));
    expect(sansLieux).toEqual(nominal);
  });
});

describe("chaîne inversée : échecs et reprise", () => {
  it("génération: logement introuvable, aucun appel d'IA (generateProgramme : lodging_unresolved avant toute requête de modèle)", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(org);
    const { fabrique, requetes } = journalisee((d) => ({
      places: { ...d.places, textSearch: async () => ({ placeIds: [] }) },
    }));
    const { fin } = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBe("lodging_unresolved");
    expect(requetes()).toHaveLength(0);
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(
      statut.ok && statut.value.phase === "failed" && statut.value.retryable,
    ).toBe(false);
  });

  it("chaine-inversee: barrière fermée (plafonds absents : aucun client réel construit, aucune requête réseau, rien d'écrit)", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const reseau = vi.fn(async () => {
      throw new Error("transport de test : aucune requête réseau");
    });
    vi.stubGlobal("fetch", reseau);
    try {
      // Toutes les autres conditions de la barrière réunies (branche, drapeau, cookie, question 9 forcée) : seuls les plafonds manquent.
      const { fin } = await derouler(
        etat,
        dependances({
          plafonds: null,
          programmesReelsAutorises: true,
          barriere: {
            env: {
              VERCEL_ENV: "preview",
              VERCEL_GIT_COMMIT_REF: "claude/essai-reel",
              GENERATION_APPELS_REELS: "1",
            },
            branche: "claude/essai-reel",
            cookieValide: async () => true,
          },
        }),
      );
      expect(fin.arret).toBeDefined();
    } finally {
      vi.unstubAllGlobals();
    }
    expect(reseau).not.toHaveBeenCalled();
    expect((await dernierRun(org, tripId)).phase).toBe("failed");
    expect(await nombre(org, "trip_versions", tripId)).toBe(0);
    expect(await nombre(org, "proposals", tripId)).toBe(0);
  });

  it("chaine-inversee: sortie illisible (model_output_invalid sans version, réessayable sous la chaîne inversée seulement ; la relance écrit la version 1)", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(org);
    const illisible: ClientModeles = {
      envoyer: async () => ({ texte: "pas du JSON", coutUsd: 0 }),
    };
    const { fabrique, requetes } = journalisee(() => ({ modeles: illisible }));
    const { fin } = await derouler(etat, dependances({}, fabrique));
    expect(fin.arret).toBe("model_output_invalid");
    expect(requetes()).toHaveLength(1);
    const run = await dernierRun(org, tripId);
    expect(run).toMatchObject({
      phase: "failed",
      stop_reason: "model_output_invalid",
    });
    expect(await nombre(org, "proposals", tripId)).toBe(0);
    expect(await nombre(org, "checklist_items", tripId)).toBe(0);

    const ancienne = adaptateur("ancienne").adapter;
    const statutAncien = await ancienne.getGenerationStatus(
      contexteDe(org),
      tripId,
    );
    expect(
      statutAncien.ok &&
        statutAncien.value.phase === "failed" &&
        statutAncien.value.retryable,
    ).toBe(false);
    expect(
      (
        await ancienne.retryGeneration(contexteDe(org), {
          tripId,
          requestId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(false);

    const statut = await adapter.getGenerationStatus(contexteDe(org), tripId);
    expect(
      statut.ok && statut.value.phase === "failed" && statut.value.retryable,
    ).toBe(true);
    expect(
      (
        await adapter.retryGeneration(contexteDe(org), {
          tripId,
          requestId: crypto.randomUUID(),
        })
      ).ok,
    ).toBe(true);
    const relance = await dernierRun(org, tripId);
    expect(relance.id).not.toBe(run.id);
    expect(
      (
        await derouler(
          { generationRunId: relance.id, organizationId: org.org, rang: 0 },
          dependances(),
        )
      ).fin.arret,
    ).toBeUndefined();
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
    expect(await nombre(org, "proposals", tripId)).toBe(8);
  });

  it("chaine-inversee: une seule ville (otherCities refusé sur draft.otherCities sans écriture ; admis sous l'ancienne chaîne)", async () => {
    const org = await createOrg(auth);
    const autres = {
      otherCities: [
        {
          name: "Florence",
          arrival: "2027-05-06",
          lodging: { kind: "none" as const },
        },
      ],
    };
    const refus = await adaptateur("inversee").adapter.createTrip(
      contexteDe(org),
      demandeRome(autres),
    );
    expect(refus).toMatchObject({
      ok: false,
      error: { code: "validation_failed", field: "draft.otherCities" },
    });
    expect(
      (
        await lire<{ n: number }>(
          org,
          "SELECT count(*)::int AS n FROM public.trips",
          [],
        )
      )[0]!.n,
    ).toBe(0);
    const admis = await adaptateur("ancienne").adapter.createTrip(
      contexteDe(org),
      demandeRome(autres),
    );
    expect(admis.ok).toBe(true);
  });
});

describe("chaîne inversée : récit fermé (0139 § 1.2 point 6)", () => {
  it("createTrip: story reste NULL tant que la garde est fermée", async () => {
    const org = await createOrg(auth);
    const { tripId } = await lancer(org);
    expect(
      await lire(org, "SELECT story FROM public.briefs WHERE trip_id = $1", [
        tripId,
      ]),
    ).toEqual([{ story: null }]);
  });

  it("generateProgramme: recit absent de l'entrée tant que la garde est fermée", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    const RECIT = "RECIT_SENTINELLE_carbonara_au_Testaccio";
    await admin.query(
      "UPDATE public.briefs SET story = $2 WHERE trip_id = $1",
      [tripId, RECIT],
    );
    const { fabrique, requetes, texte } = journalisee();
    expect(
      (await derouler(etat, dependances({}, fabrique))).fin.arret,
    ).toBeUndefined();
    expect(requetes()).toHaveLength(1);
    expect(texte()).not.toContain(RECIT);
    expect(texte()).not.toMatch(/"recit"/);
  });
});

describe("chaine-inversee: voyage complet et recalcul clos sans écriture (0136 § 4.4)", () => {
  it("full : ligne close en ready sur la version 1, aucune nouvelle version ni appel", async () => {
    const org = await createOrg(auth);
    const { adapter, tripId, etat } = await lancer(org);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    await admin.query(
      "INSERT INTO public.entitlements (organization_id, trip_id, kind) VALUES ($1, $2, 'tripUnlocked')",
      [org.org, tripId],
    );
    expect((await adapter.getFullTripStatus(contexteDe(org), tripId)).ok).toBe(
      true,
    );
    const complet = await dernierRun(org, tripId, "full");
    expect(complet.phase).toBe("queued");
    let compositions = 0;
    const sortie = await etapeCompletDebut(
      { generationRunId: complet.id, organizationId: org.org, rang: 0 },
      dependances({}, () => {
        compositions += 1;
        return composerSimuleeAvec({ doubles: doublesRome });
      }),
    );
    expect(sortie.arret).toBeUndefined();
    expect(compositions).toBe(0);
    expect(await dernierRun(org, tripId, "full")).toMatchObject({
      phase: "ready",
      stop_reason: null,
      last_version: 1,
    });
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
  });

  it("batch : ligne close en ready sur sa version de base, aucune nouvelle version ni appel", async () => {
    const org = await createOrg(auth);
    const { tripId, etat } = await lancer(org);
    expect((await derouler(etat, dependances())).fin.arret).toBeUndefined();
    const lot = await inTx(
      app,
      { org: org.org, user: org.owner },
      async (c) => {
        const cloture = (
          await c.query(
            "INSERT INTO public.deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'preview', 8, gen_random_uuid()) RETURNING id",
            [org.org, tripId, etat.generationRunId],
          )
        ).rows[0].id as string;
        return (
          await c.query(
            "INSERT INTO public.generation_runs (organization_id, trip_id, kind, phase, base_version, deck_closure_id, request_id) VALUES ($1, $2, 'batch', 'queued', 1, $3, gen_random_uuid()) RETURNING id",
            [org.org, tripId, cloture],
          )
        ).rows[0].id as string;
      },
    );
    let compositions = 0;
    const sortie = await etapeLotDebut(
      { generationRunId: lot, organizationId: org.org, rang: 0 },
      dependances({}, () => {
        compositions += 1;
        return composerSimuleeAvec({ doubles: doublesRome });
      }),
    );
    expect(sortie.arret).toBeUndefined();
    expect(compositions).toBe(0);
    expect(await dernierRun(org, tripId, "batch")).toMatchObject({
      phase: "ready",
      stop_reason: null,
      last_version: 1,
    });
    expect(await nombre(org, "trip_versions", tripId)).toBe(1);
  });
});
