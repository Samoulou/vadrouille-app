import {
  ProposalRecordSchema,
  TripSnapshotSchema,
  type ChecklistMoment,
  type DayLineItemSnapshot,
  type DaySnapshot,
  type PreviewSlot,
  type Proposal,
  type ProposalRecord,
  type Stop,
  type StopSnapshot,
  type Trip,
  type TripSnapshot,
} from "@/contracts";
import { edimbourgCarte } from "@/mocks/edimbourg-carte";
import { EDIMBOURG_DEBLOQUE_TRIP_ID, EDIMBOURG_TRIP_ID } from "@/mocks/edimbourg";
import { lieuConverti, logementDeTest, tableDesRelectures, VOYAGES_SIMULES, type VoyageSimule } from "@/mocks/relectures-voyages";

/**
 * Données de test en base de la lecture des voyages (spécification B6, B6a point 7 ; décision 0086 § 1.6 ; réponses
 * du rôle data du 2026-10-18, commentaire sur #471, points 3 à 6). Outillage de test seulement : aucune commande de
 * semis dans l'application ni dans `package.json`.
 *
 * Deux parties :
 * - **conversion** pure (`convertirVoyageSimule`, `convertirVoyagesSimules`) des quatre voyages de `listTrips` de
 *   `mock` en lignes, selon les règles de B6a point 7 : `placeId` sentinelles `test_place_<id de l'étape>` pour les
 *   étapes sans lieu (même valeur pour la proposition de même `id`), logement `test_place_logement_<id de mock>`,
 *   coordonnées d'Édimbourg seulement (logement au point `start` du J2 de `edimbourgCarte`), mobilité `null`,
 *   `estimated` recopié, J6 du voyage débloqué servi comme un jour en préparation sans étape (exécution `batch` non
 *   terminée). Instantanés validés par `TripSnapshotSchema` et propositions par `ProposalRecordSchema` avant
 *   l'écriture ; contrôles préalables (`controlesPrealables`) qui font échouer le test ;
 * - **écriture** (`ecrireVoyage`, `ecrireVoyagesSimules`) pour une organisation **déjà créée** (`createOrg` de
 *   `tests/db/helpers.ts`, sous `vadrouille_auth`, réponse de data point 3) par un exécuteur structurel : le module
 *   n'importe pas `pg` (capacité `module:pg`, réservée à `tests/db/helpers.ts`). Lignes métier sous `vadrouille_app`
 *   avec le contexte de l'organisation ; coordonnées par `store_place_coordinates` ; droit `tripUnlocked` par
 *   `vadrouille_webhook` (`SET LOCAL ROLE`, comme `seedOrganization`), sans ligne `billing` (facultative, data 6.4).
 *
 * Écart signalé (PR de B6a) : `ProposalRecordSchema` exige `detour` (« Partie Q5 »), que la plupart des propositions
 * de `mock` n'ont pas ; la conversion y écrit `DETOUR_DE_TEST`, et la comparaison retire `detour` de ces seules
 * propositions.
 */

/** Exécuteur structurel : un client `pg` connecté sous `vadrouille_app`, hors transaction. */
export type ExecuteurTest = { query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }> };

/** Organisation créée par `createOrg` (`tests/db/helpers.ts`). */
export type OrgTest = { readonly org: string; readonly owner: string };

/** `detour` des propositions converties que `mock` rend sans `detour` (écart signalé). */
export const DETOUR_DE_TEST = "[Détour des données de test]";

export type LigneProposition = {
  readonly phase: "preview" | "deck";
  readonly position: number;
  readonly slotType: "proposal" | "noOption";
  readonly day: number;
  readonly time: string;
  readonly kind: "activity" | "meal";
  readonly content: unknown;
};

/** Lignes d'un voyage à écrire. Les tests de cohérence en dérivent des variantes (données incohérentes comprises). */
export type DonneesVoyage = {
  readonly destination: string;
  readonly start: string;
  readonly end: string;
  readonly timeZone: string | null;
  readonly travellers: { readonly adults: number; readonly children: number };
  /** Version `i + 1`, de parent `i` (aucun pour la première) ; `createdAt` : instant ISO, sinon l'horloge de la base. */
  readonly versions: readonly { readonly snapshot: unknown; readonly createdAt?: string }[];
  /** `trips.current_version` ; par défaut, la dernière version. `null` : voyage en création. */
  readonly currentVersion?: number | null;
  readonly stays: readonly { readonly kind: "lodging" | "neighbourhood"; readonly placeId: string | null; readonly label: string; readonly from: string; readonly to: string }[];
  /** `briefs.mobility` d'une ligne `briefs` (version 1) ; absent : aucune ligne `briefs`. */
  readonly mobility?: string | null;
  readonly checklist: readonly {
    readonly label: string;
    readonly moment: ChecklistMoment;
    readonly done: boolean;
    readonly bookingUrl?: string;
    readonly sponsored: boolean;
    readonly stopId?: string;
  }[];
  /** Exécutions de génération, dans l'ordre de leur début. */
  readonly runs: readonly { readonly kind: "preview" | "full" | "batch" | "mini"; readonly finished: boolean; readonly propositions: readonly LigneProposition[] }[];
  readonly entitlements: readonly ("preview" | "tripUnlocked")[];
  readonly coordonnees: readonly { readonly placeId: string; readonly lat: number; readonly lng: number }[];
};

export type VoyageConverti = { readonly mockId: string; readonly trip: Trip; readonly donnees: DonneesVoyage };

// --- Conversion ---------------------------------------------------------------------------------------------

function etapeConvertie(stop: Stop): StopSnapshot {
  const copie: Stop = { ...stop, placeId: lieuConverti(stop), exceptions: stop.exceptions.filter((e) => e !== "toConfirm") };
  delete copie.verifiedAt;
  return copie;
}

function evenementConverti(event: Stop): StopSnapshot {
  const copie: Stop = { ...event, exceptions: event.exceptions.filter((e) => e !== "toConfirm") };
  delete copie.verifiedAt;
  return copie;
}

function jourConverti(trip: Trip, index: number): DaySnapshot {
  const day = trip.days.find((candidat) => candidat.index === index);
  if (day === undefined) throw new Error(`jour ${index} absent`);
  // J6 du voyage débloqué : jour en préparation, converti sans étape (B6a point 7, écart connu 2).
  if (trip.id === EDIMBOURG_DEBLOQUE_TRIP_ID && day.generating) {
    return { index: day.index, date: day.date, items: [], events: [], travelBudgetMinutes: day.travelBudgetMinutes };
  }
  const items: DayLineItemSnapshot[] = day.items.map((item) => {
    if (item.type === "stop") return { type: "stop", stop: etapeConvertie(item.stop) };
    if (item.type === "segment") return { type: "segment", segment: { mode: item.segment.mode, estimated: item.segment.estimated } };
    return item;
  });
  const surprise = day.surprise === undefined ? undefined : { ...day.surprise };
  if (surprise !== undefined) delete surprise.verifiedAt;
  return {
    index: day.index,
    date: day.date,
    items,
    events: day.events.map(evenementConverti),
    travelBudgetMinutes: day.travelBudgetMinutes,
    ...(surprise === undefined ? {} : { surprise }),
    ...(day.theme === undefined ? {} : { theme: day.theme }),
  };
}

/** `proposals.content` d'une proposition de `mock` (validé par `ProposalRecordSchema`). */
export function enregistrementConverti(proposal: Proposal): ProposalRecord {
  const record = {
    id: proposal.id,
    kind: proposal.kind,
    day: proposal.day,
    time: proposal.time,
    stop: etapeConvertie(proposal.stop),
    category: proposal.category,
    ...(proposal.travelFromPrevious === undefined
      ? {}
      : { travelFromPrevious: { mode: proposal.travelFromPrevious.mode, estimated: proposal.travelFromPrevious.estimated } }),
    detour: proposal.detour ?? DETOUR_DE_TEST,
  };
  return ProposalRecordSchema.parse(record);
}

function lignesApercu(previewSlots: readonly PreviewSlot[]): LigneProposition[] {
  return previewSlots.map((slot, i) =>
    slot.type === "proposal"
      ? { phase: "preview", position: i + 1, slotType: "proposal", day: slot.proposal.day, time: slot.proposal.time, kind: slot.proposal.kind, content: enregistrementConverti(slot.proposal) }
      : { phase: "preview", position: i + 1, slotType: "noOption", day: slot.day, time: slot.time, kind: slot.kind, content: null },
  );
}

/** Positions fabriquées d'Édimbourg (et de son pendant débloqué) : étapes de `edimbourgCarte`, logement au `start` du J2. */
function coordonneesDe(trip: Trip, snapshot: TripSnapshot): DonneesVoyage["coordonnees"] {
  if (trip.id !== EDIMBOURG_TRIP_ID && trip.id !== EDIMBOURG_DEBLOQUE_TRIP_ID) return [];
  // Étapes du jeu converti seulement (le J6 du voyage débloqué n'en a plus).
  const stops = new Map(snapshot.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" ? [[item.stop.id, item.stop] as const] : []))));
  const coordonnees: { placeId: string; lat: number; lng: number }[] = [];
  for (const map of edimbourgCarte) {
    for (const point of map.points) {
      if (point.ref.type !== "stop") continue;
      const stop = stops.get(point.ref.stopId);
      if (stop !== undefined) coordonnees.push({ placeId: lieuConverti(stop), lat: point.lat, lng: point.lng });
    }
  }
  const hotel = edimbourgCarte.find((map) => map.dayIndex === 2)?.points.find((p) => p.ref.type === "terminus" && p.ref.role === "start");
  if (hotel === undefined) throw new Error("point start du J2 absent de edimbourgCarte");
  coordonnees.push({ placeId: logementDeTest(trip.id), lat: hotel.lat, lng: hotel.lng });
  // Doublons identiques retirés (une étape présente sur deux jours garde une seule ligne).
  return coordonnees.filter((c, i) => coordonnees.findIndex((d) => d.placeId === c.placeId) === i);
}

/** Étiquette des terminus du logement dans `mock` : celle du terminus `end` du J1. */
function etiquetteLogement(trip: Trip): string {
  const fin = trip.days[0]?.items.find((item) => item.type === "terminus" && item.role === "end");
  if (fin === undefined || fin.type !== "terminus") throw new Error("terminus end du J1 absent");
  return fin.label;
}

export function convertirVoyageSimule(voyage: VoyageSimule): VoyageConverti {
  const { trip } = voyage;
  const snapshot: TripSnapshot = TripSnapshotSchema.parse({ days: trip.days.map((day) => jourConverti(trip, day.index)) });
  const enPreparation = trip.days.some((day) => day.generating);
  const propositions: LigneProposition[] = [
    ...lignesApercu(voyage.previewSlots),
    ...voyage.proposals.map((proposal, i): LigneProposition => ({
      phase: "deck",
      position: i + 1,
      slotType: "proposal",
      day: proposal.day,
      time: proposal.time,
      kind: proposal.kind,
      content: enregistrementConverti(proposal),
    })),
  ];
  return {
    mockId: trip.id,
    trip,
    donnees: {
      destination: trip.destination,
      start: trip.start,
      end: trip.end,
      timeZone: trip.timeZone,
      travellers: trip.travellers,
      versions: [{ snapshot }],
      stays: [{ kind: "lodging", placeId: logementDeTest(trip.id), label: etiquetteLogement(trip), from: trip.start, to: trip.end }],
      mobility: null,
      checklist: trip.checklist.map((item) => ({
        label: item.label,
        moment: item.when,
        done: item.done,
        sponsored: item.sponsored,
        ...(item.bookingUrl === undefined ? {} : { bookingUrl: item.bookingUrl }),
        ...(item.stopId === undefined ? {} : { stopId: item.stopId }),
      })),
      runs: [
        ...(propositions.length > 0 ? [{ kind: "preview" as const, finished: true, propositions }] : []),
        ...(enPreparation ? [{ kind: "batch" as const, finished: false, propositions: [] }] : []),
      ],
      entitlements: trip.unlocked ? ["tripUnlocked"] : [],
      coordonnees: coordonneesDe(trip, snapshot),
    },
  };
}

export function convertirVoyagesSimules(): VoyageConverti[] {
  const convertis = VOYAGES_SIMULES.map(convertirVoyageSimule);
  const erreurs = controlesPrealables(convertis);
  if (erreurs.length > 0) throw new Error(`données de test incohérentes : ${erreurs.join(" ; ")}`);
  return convertis;
}

const nuitsDe = (start: string, end: string): string[] => {
  const nuits: string[] = [];
  for (let instant = Date.parse(`${start}T00:00:00Z`); instant < Date.parse(`${end}T00:00:00Z`); instant += 86_400_000) {
    nuits.push(new Date(instant).toISOString().slice(0, 10));
  }
  return nuits;
};

/**
 * Contrôles préalables (B6a point 7 ; réponse de data, point 6.2), sur les quatre voyages **réunis** : chaque nuit a
 * exactement une ligne `stays` ; aucun couple (point, point, mode) ni (lieu, date) ne reçoit deux valeurs (J5 compris :
 * ses deux segments sont mesurés ensemble, par la somme) ; aucune coordonnée hors du jeu converti, ni deux
 * coordonnées différentes pour un même `placeId` ; autant de jours dans l'instantané que dans `mock`.
 */
export function controlesPrealables(convertis: readonly VoyageConverti[]): string[] {
  const erreurs: string[] = [...tableDesRelectures().conflits];
  const positions = new Map<string, string>();
  for (const { mockId, trip, donnees } of convertis) {
    for (const nuit of nuitsDe(donnees.start, donnees.end)) {
      const lignes = donnees.stays.filter((stay) => stay.from <= nuit && nuit < stay.to);
      if (lignes.length !== 1) erreurs.push(`${mockId} : nuit ${nuit} couverte par ${lignes.length} lignes stays`);
    }
    const snapshot = TripSnapshotSchema.parse(donnees.versions.at(-1)?.snapshot);
    if (snapshot.days.length !== trip.days.length) erreurs.push(`${mockId} : ${snapshot.days.length} jours au lieu de ${trip.days.length}`);
    const lieux = new Set<string>([
      ...donnees.stays.flatMap((stay) => (stay.placeId === null ? [] : [stay.placeId])),
      ...snapshot.days.flatMap((day) => day.items.flatMap((item) => (item.type === "stop" && item.stop.placeId !== undefined ? [item.stop.placeId] : []))),
    ]);
    for (const { placeId, lat, lng } of donnees.coordonnees) {
      if (!lieux.has(placeId)) erreurs.push(`${mockId} : coordonnée hors du jeu converti (${placeId})`);
      const valeur = `${lat},${lng}`;
      const existante = positions.get(placeId);
      if (existante !== undefined && existante !== valeur) erreurs.push(`deux coordonnées pour ${placeId}`);
      positions.set(placeId, valeur);
    }
  }
  return erreurs;
}

// --- Écriture -----------------------------------------------------------------------------------------------

async function enTransaction<T>(executeur: ExecuteurTest, org: OrgTest, fn: () => Promise<T>): Promise<T> {
  await executeur.query("BEGIN");
  try {
    await executeur.query("SELECT set_config('app.organization_id', $1, true), set_config('app.user_id', $2, true)", [org.org, org.owner]);
    const resultat = await fn();
    await executeur.query("COMMIT");
    return resultat;
  } catch (erreur) {
    await executeur.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  }
}

/** Fuseau provisoire d'un voyage écrit « sans fuseau », remplacé par `NULL` par `simulerFuseauNul` après l'écriture. */
const FUSEAU_PROVISOIRE = "UTC";

/**
 * Ligne `trips` sans fuseau, antérieure à la migration 0012_creation_voyage (B9b, 0081 B9-TL-6 (d) : `CHECK (time_zone
 * IS NOT NULL) NOT VALID`, qui refuse toute écriture d'un fuseau nul, y compris par l'administration). Reproduite, pour
 * les seuls tests de lecture de B6a qui l'éprouvent (`time_zone_missing`), par la connexion d'administration (rôle
 * propriétaire de la base de test) dans **une** transaction : la contrainte est retirée, la valeur mise à `NULL`, puis la
 * contrainte reposée à l'identique (`NOT VALID`), si bien qu'aucune autre session ne la voit absente. Base de test
 * seulement (`tests/db`, fichiers en série).
 */
async function simulerFuseauNul(admin: ExecuteurTest, tripId: string): Promise<void> {
  await admin.query("BEGIN");
  try {
    await admin.query('ALTER TABLE public.trips DROP CONSTRAINT "trips_time_zone_check"');
    await admin.query("UPDATE public.trips SET time_zone = NULL WHERE id = $1", [tripId]);
    await admin.query('ALTER TABLE public.trips ADD CONSTRAINT "trips_time_zone_check" CHECK (time_zone IS NOT NULL) NOT VALID');
    await admin.query("COMMIT");
  } catch (erreur) {
    await admin.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  }
}

/**
 * Ligne `stays` qui ne couvre aucune nuit (`to_date` ≤ `from_date`), antérieure à la migration 0012_creation_voyage
 * (0081 B9-TL-6 (f) : `CHECK (to_date > from_date) NOT VALID`). Même procédé que `simulerFuseauNul` : écrite avec une
 * borne provisoire, puis, par la connexion d'administration et dans une transaction, la contrainte est retirée, la borne
 * posée et la contrainte reposée à l'identique (`NOT VALID`). Seuls tests de lecture de B6a qui l'éprouvent (`stay_missing`).
 */
async function simulerSejourSansNuit(admin: ExecuteurTest, stayId: string, toDate: string): Promise<void> {
  await admin.query("BEGIN");
  try {
    await admin.query('ALTER TABLE public.stays DROP CONSTRAINT "stays_to_date_exclusive_check"');
    await admin.query("UPDATE public.stays SET to_date = $2::date WHERE id = $1", [stayId, toDate]);
    await admin.query('ALTER TABLE public.stays ADD CONSTRAINT "stays_to_date_exclusive_check" CHECK (to_date > from_date) NOT VALID');
    await admin.query("COMMIT");
  } catch (erreur) {
    await admin.query("ROLLBACK").catch(() => undefined);
    throw erreur;
  }
}

/**
 * Options d'écriture. `candidats` (M1g, PR 869) : chaque proposition `proposal` dont l'étape a un lieu reçoit sa ligne
 * `candidates` (champs maison de la proposition, source de test en `example.org`, notes neutres) et la désigne par
 * `proposals.candidate_id`, comme une proposition déjà vérifiée de la génération. Absente : aucune ligne `candidates` (les
 * autres scénarios ne changent pas).
 */
export type OptionsEcriture = { readonly candidats?: boolean };

const FAITS_CANDIDAT = ["durationMinutes", "costPerPerson", "area"] as const;

/** Ligne `candidates` d'une proposition convertie, ou `null` (case vide, étape sans lieu, événement). */
function candidatDeTest(ligne: LigneProposition) {
  if (ligne.slotType !== "proposal" || ligne.content === null) return null;
  const record = ProposalRecordSchema.parse(ligne.content);
  const stop = record.stop;
  if (stop.placeId === undefined || (stop.kind !== "activity" && stop.kind !== "meal")) return null;
  const facts = Object.fromEntries(FAITS_CANDIDAT.flatMap((cle) => (stop.facts[cle] === undefined ? [] : [[cle, stop.facts[cle]] as const])));
  return {
    name: stop.name,
    summary: stop.reason ?? null,
    category: record.category,
    facts,
    sources: [{ label: "[Source de test]", url: `https://example.org/mock/${stop.id}`, checkedOn: "2026-08-01" }],
    placeId: stop.placeId,
    stopKind: stop.kind,
    toReserve: stop.exceptions.includes("toReserve"),
  };
}

type Requete = (texte: string, valeurs?: readonly unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * Ligne `batch` du jeu (migration 0015_recalcul_lot, décision 0119 § 1.1) : une version de base et la clôture du tri
 * qui l'a déclenchée, écrite d'abord, puis la ligne par un seul `INSERT` qui porte `kind`, `base_version` et
 * `deck_closure_id` (la `CHECK` de 0015 est immédiate, et la migration 0016 retire à `vadrouille_app` l'`UPDATE` de ces
 * colonnes, décision 0120 S8 : ne jamais écrire une autre ligne puis la passer en `batch`). Comme en production (0119
 * § 1.1 point 3), la clôture vise l'exécution `preview`
 * du voyage ; elle est de phase `deck`, si bien que la lecture du tri (`SQL_CLOTURE`, clôtures de l'exécution `preview`
 * **et de sa phase**) reste celle d'un tri ouvert, comme avant 0015. Un voyage du jeu sans exécution `preview` (en
 * préparation, sans proposition) reçoit une exécution `mini` close, que nulle lecture ne regarde, pour porter la
 * clôture. Ordre de la purge (0119 § 5.2) : la ligne `batch`, puis la clôture, puis les autres exécutions.
 */
async function ecrireLot(
  q: Requete,
  org: string,
  tripId: string,
  options: { apercu: string | null; versionDeBase: number; derniereVersion: number | null; debut: number; terminee: boolean },
): Promise<string> {
  const cible =
    options.apercu ??
    ((
      await q(
        "INSERT INTO generation_runs (organization_id, trip_id, kind, phase, started_at, finished_at) VALUES ($1, $2, 'mini', 'ready', now() - make_interval(mins => $3::integer), now()) RETURNING id",
        [org, tripId, options.debut + 1],
      )
    ).rows[0]?.id as string);
  const cloture = (
    await q(
      "INSERT INTO deck_closures (organization_id, trip_id, generation_run_id, phase, through_position, request_id) VALUES ($1, $2, $3, 'deck', 1, gen_random_uuid()) RETURNING id",
      [org, tripId, cible],
    )
  ).rows[0]?.id as string;
  return (
    await q(
      `INSERT INTO generation_runs (organization_id, trip_id, kind, phase, last_version, base_version, deck_closure_id, started_at, finished_at)
       VALUES ($1, $2, 'batch', $3, $4, $5, $6, now() - make_interval(mins => $7::integer), CASE WHEN $8::boolean THEN now() END) RETURNING id`,
      [org, tripId, options.terminee ? "ready" : "preparing", options.derniereVersion, options.versionDeBase, cloture, options.debut, options.terminee],
    )
  ).rows[0]?.id as string;
}

/**
 * Écrit un voyage pour l'organisation ; rend l'`uuid` du voyage. Un voyage sans fuseau (`timeZone: null`) ou avec une
 * ligne `stays` sans nuit exige la connexion d'administration (`admin`, voir `simulerFuseauNul` et
 * `simulerSejourSansNuit`).
 */
export async function ecrireVoyage(executeur: ExecuteurTest, org: OrgTest, donnees: DonneesVoyage, admin?: ExecuteurTest, options: OptionsEcriture = {}): Promise<string> {
  if (donnees.timeZone === null && admin === undefined) throw new Error("voyage sans fuseau : connexion d'administration requise (migration 0012)");
  if (donnees.stays.some((stay) => stay.to <= stay.from) && admin === undefined) throw new Error("séjour sans nuit : connexion d'administration requise (migration 0012)");
  const sansNuit: { id: string; to: string }[] = [];
  const ecrit = await enTransaction(executeur, org, async () => {
    const q = (texte: string, valeurs: readonly unknown[] = []) => executeur.query(texte, valeurs);
    const tripId = (
      await q(
        `INSERT INTO trips (organization_id, created_by, request_id, destination, start_date, end_date, travellers_adults, travellers_children, time_zone)
         VALUES ($1, $2, gen_random_uuid(), $3, $4, $5, $6, $7, $8) RETURNING id`,
        [org.org, org.owner, donnees.destination, donnees.start, donnees.end, donnees.travellers.adults, donnees.travellers.children, donnees.timeZone ?? FUSEAU_PROVISOIRE],
      )
    ).rows[0]?.id as string;
    for (const [i, version] of donnees.versions.entries()) {
      await q(
        `INSERT INTO trip_versions (organization_id, trip_id, version, parent_version, request_id, snapshot, author_kind, created_at)
         VALUES ($1, $2, $3, $4, gen_random_uuid(), $5, 'engine', COALESCE($6::timestamptz, now()))`,
        [org.org, tripId, i + 1, i === 0 ? null : i, JSON.stringify(version.snapshot), version.createdAt ?? null],
      );
    }
    const courante = donnees.currentVersion === undefined ? (donnees.versions.length > 0 ? donnees.versions.length : null) : donnees.currentVersion;
    await q("UPDATE trips SET current_version = $1 WHERE organization_id = $2 AND id = $3", [courante, org.org, tripId]);
    for (const stay of donnees.stays) {
      const provisoire = stay.to <= stay.from;
      const ligne = await q(
        "INSERT INTO stays (organization_id, trip_id, kind, place_id, label, from_date, to_date) VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $8 THEN $6::date + 1 ELSE $7::date END) RETURNING id",
        [org.org, tripId, stay.kind, stay.placeId, stay.label, stay.from, stay.to, provisoire],
      );
      if (provisoire) sansNuit.push({ id: ligne.rows[0]?.id as string, to: stay.to });
    }
    if (donnees.mobility !== undefined) {
      await q("INSERT INTO briefs (organization_id, trip_id, version, mobility) VALUES ($1, $2, 1, $3)", [org.org, tripId, donnees.mobility]);
    }
    for (const item of donnees.checklist) {
      await q(
        "INSERT INTO checklist_items (organization_id, trip_id, stop_id, kind, label, moment, booking_url, sponsored, done) VALUES ($1, $2, $3, 'other', $4, $5, $6, $7, $8)",
        [org.org, tripId, item.stopId ?? null, item.label, JSON.stringify(item.moment), item.bookingUrl ?? null, item.sponsored, item.done],
      );
    }
    const ecrirePropositions = async (runId: string, propositions: readonly LigneProposition[]) => {
      for (const ligne of propositions) {
        const candidat = options.candidats === true ? candidatDeTest(ligne) : null;
        const candidateId =
          candidat === null
            ? null
            : ((
                await q(
                  `INSERT INTO candidates (organization_id, trip_id, kind, name, summary, category, facts, sources, place_id, stop_kind, to_reserve, fit, not_for_me_risk, must_see, slot_fit)
                   VALUES ($1, $2, 'place', $3, $4, $5, $6, $7, $8, $9, $10, true, 1, false, $11) RETURNING id`,
                  [org.org, tripId, candidat.name, candidat.summary, candidat.category, JSON.stringify(candidat.facts), JSON.stringify(candidat.sources), candidat.placeId, candidat.stopKind, candidat.toReserve, [candidat.stopKind]],
                )
              ).rows[0]?.id as string);
        await q(
          "INSERT INTO proposals (organization_id, trip_id, generation_run_id, phase, position, slot_type, day, time, kind, content, candidate_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)",
          [org.org, tripId, runId, ligne.phase, ligne.position, ligne.slotType, ligne.day, ligne.time, ligne.kind, ligne.content === null ? null : JSON.stringify(ligne.content), candidateId],
        );
      }
    };
    // Deux passes : les exécutions hors `batch` d'abord, puis les lignes `batch`, chacune par un seul `INSERT` (voir
    // `ecrireLot` : aucun `UPDATE` de `kind`, `base_version` ni `deck_closure_id`, refusé à `vadrouille_app` depuis la
    // migration 0016, décision 0120 S8). Leur clôture vise ainsi la dernière exécution `preview` du voyage (début le plus
    // récent, comme `SQL_EXECUTION_APERCU`), quel que soit l'ordre de `donnees.runs` (revue de #657, mineur 3 de la
    // seconde revue). `started_at` suit le rang dans `donnees.runs`, pas l'ordre d'écriture.
    let derniereApercu: string | null = null;
    const lots: { readonly rang: number; readonly run: DonneesVoyage["runs"][number] }[] = [];
    for (const [rang, run] of donnees.runs.entries()) {
      if (run.kind === "batch") {
        lots.push({ rang, run });
        continue;
      }
      const runId = (
        await q(
          `INSERT INTO generation_runs (organization_id, trip_id, kind, phase, last_version, started_at, finished_at)
           VALUES ($1, $2, $3, $4, $5, now() - make_interval(mins => $6::integer), CASE WHEN $7::boolean THEN now() END) RETURNING id`,
          // Phases fermées depuis B9b (migration 0012_creation_voyage : `generation_runs_phase_check`).
          [org.org, tripId, run.kind, run.finished ? "ready" : "preparing", courante, 100 - rang, run.finished],
        )
      ).rows[0]?.id as string;
      // Rang croissant, début de plus en plus récent : la dernière `preview` écrite est la plus récente.
      if (run.kind === "preview") derniereApercu = runId;
      await ecrirePropositions(runId, run.propositions);
    }
    for (const { rang, run } of lots) {
      const runId = await ecrireLot(q, org.org, tripId, { apercu: derniereApercu, versionDeBase: courante ?? 0, derniereVersion: courante, debut: 100 - rang, terminee: run.finished });
      await ecrirePropositions(runId, run.propositions);
    }
    for (const { placeId, lat, lng } of donnees.coordonnees) await q("SELECT public.store_place_coordinates($1, $2, $3)", [placeId, lat, lng]);
    if (donnees.entitlements.length > 0) {
      await q("SET LOCAL ROLE vadrouille_webhook");
      for (const kind of donnees.entitlements) await q("INSERT INTO entitlements (organization_id, trip_id, kind) VALUES ($1, $2, $3)", [org.org, tripId, kind]);
    }
    return tripId;
  });
  if (donnees.timeZone === null && admin !== undefined) await simulerFuseauNul(admin, ecrit);
  for (const { id, to } of sansNuit) if (admin !== undefined) await simulerSejourSansNuit(admin, id, to);
  return ecrit;
}

/** Écrit les quatre voyages convertis ; rend l'`uuid` de chacun par identifiant de `mock`. */
export async function ecrireVoyagesSimules(executeur: ExecuteurTest, org: OrgTest, options: OptionsEcriture = {}): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const converti of convertirVoyagesSimules()) ids.set(converti.mockId, await ecrireVoyage(executeur, org, converti.donnees, undefined, options));
  return ids;
}
