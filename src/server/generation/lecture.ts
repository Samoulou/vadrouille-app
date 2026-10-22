import "server-only";

import { TripSnapshotSchema, type Brief, type Category, type Lodging, type TripCommitment, type TripDraft, type TripSnapshot } from "@/contracts";
import type { BriefField, CommitmentKind, MobilityMode, Pace } from "@/contracts/values";
import type { Nuit } from "@/domain/entrees";
import { ajouterJours, joursEntre } from "@/domain/temps";

import { LectureIllisible } from "./illisible";

/**
 * Lecture de ce que l'aperçu a besoin du voyage, **par l'étape** (décision 0081 B9-TL-3 point 1 : brouillon, brief et logements
 * sont relus en base dans l'étape, jamais passés par l'état sérialisé). Mêmes colonnes et mêmes conversions que
 * `lireBrouillon` de `src/server/creation/brouillon.ts` (que ce dossier ne peut pas importer, 0081 B9-TL-1 point 2) ; le test
 * `génération: lecture du brouillon égale à lireBrouillon` en vérifie l'égalité sur un voyage écrit par `createTrip`.
 * S'y ajoutent le `place_id` et la borne de fin de chaque séjour, dont dépend le découpage en villes de l'aperçu.
 */

export interface ExecuteurLecture {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SQL_VOYAGE = `SELECT destination, to_char(start_date, 'YYYY-MM-DD') AS start, to_char(end_date, 'YYYY-MM-DD') AS "end",
  travellers_adults AS adults, travellers_children AS children, time_zone
  FROM public.trips WHERE organization_id = $1 AND id = $2`;
const SQL_BRIEF = `SELECT pace, mobility_modes, wishes, limit_categories, meal_budget, inferred_fields
  FROM public.briefs WHERE organization_id = $1 AND trip_id = $2 ORDER BY version DESC LIMIT 1`;
const SQL_SEJOURS = `SELECT city, to_char(from_date, 'YYYY-MM-DD') AS from_date, to_char(to_date, 'YYYY-MM-DD') AS to_date, lodging_kind, label, place_id,
  suggestion_id, area_center_lat, area_center_lng, area_radius_m
  FROM public.stays WHERE organization_id = $1 AND trip_id = $2 ORDER BY from_date`;
const SQL_ENGAGEMENTS = `SELECT kind, label, to_char(date, 'YYYY-MM-DD') AS date, start_time, end_time
  FROM public.trip_commitments WHERE organization_id = $1 AND trip_id = $2 ORDER BY rank`;

const texte = (valeur: unknown): string => {
  if (typeof valeur !== "string") throw new TypeError("génération : colonne illisible");
  return valeur;
};
const textes = <T extends string>(valeur: unknown): T[] => (Array.isArray(valeur) ? valeur.map((v) => texte(v) as T) : []);

function logementDe(ligne: Record<string, unknown>): Lodging {
  const label = texte(ligne.label);
  switch (ligne.lodging_kind) {
    case "known":
      return { kind: "known", label };
    case "area":
      return { kind: "area", label };
    case "none":
      return { kind: "none" };
    case "suggestedLodging":
      return ligne.place_id === null
        ? { kind: "suggestedLodging", lodgingId: texte(ligne.suggestion_id), name: label }
        : { kind: "suggestedLodging", lodgingId: texte(ligne.suggestion_id), placeId: texte(ligne.place_id), name: label };
    case "suggestedArea":
      return {
        kind: "suggestedArea",
        areaId: texte(ligne.suggestion_id),
        name: label,
        center: { lat: Number(ligne.area_center_lat), lng: Number(ligne.area_center_lng) },
        radiusM: Number(ligne.area_radius_m),
      };
    default:
      throw new TypeError("génération : type de logement illisible");
  }
}

/** Séjour d'une ville : dates `[du, au[`, logement du brouillon et `placeId` écrit (ou `null`) sur la ligne. */
export type Sejour = {
  readonly ville: string;
  readonly du: string;
  readonly au: string;
  readonly logement: Lodging;
  readonly placeId: string | null;
};

export type VoyageLu = {
  readonly draft: TripDraft;
  readonly brief: Brief;
  readonly timeZone: string;
  readonly sejours: readonly Sejour[];
};

/** Brouillon, brief, fuseau et séjours d'un voyage, ou `null` si le voyage n'est pas lisible (organisation posée par le contexte). */
export async function lireVoyage(executeur: ExecuteurLecture, organizationId: string, tripId: string): Promise<VoyageLu | null> {
  const voyage = (await executeur.query(SQL_VOYAGE, [organizationId, tripId])).rows[0];
  if (voyage === undefined) return null;
  const ligneBrief = (await executeur.query(SQL_BRIEF, [organizationId, tripId])).rows[0];
  if (ligneBrief === undefined) throw new TypeError("génération : brief absent");
  const lignes = (await executeur.query(SQL_SEJOURS, [organizationId, tripId])).rows;
  const engagements = (await executeur.query(SQL_ENGAGEMENTS, [organizationId, tripId])).rows;
  const [premier, ...autres] = lignes;
  if (premier === undefined) throw new TypeError("génération : séjour absent");
  const draft: TripDraft = {
    destination: texte(voyage.destination),
    start: texte(voyage.start),
    end: texte(voyage.end),
    lodging: logementDe(premier),
    otherCities: autres.map((ligne) => ({ name: texte(ligne.city), arrival: texte(ligne.from_date), lodging: logementDe(ligne) })),
    commitments: engagements.map((ligne): TripCommitment => {
      const base = { kind: texte(ligne.kind) as CommitmentKind, label: texte(ligne.label), date: texte(ligne.date), start: texte(ligne.start_time) };
      return ligne.end_time === null ? base : { ...base, end: texte(ligne.end_time) };
    }),
  };
  const repas = ligneBrief.meal_budget;
  const brief: Brief = {
    travellers: { adults: Number(voyage.adults), children: Number(voyage.children) },
    pace: texte(ligneBrief.pace) as Pace,
    wishes: textes<Category>(ligneBrief.wishes),
    limits: textes<Category>(ligneBrief.limit_categories),
    mobility: textes<MobilityMode>(ligneBrief.mobility_modes),
    ...(repas === null ? {} : { mealBudgetPerPerson: Number(texte(repas)) }),
    inferredFields: textes<BriefField>(ligneBrief.inferred_fields),
  };
  const sejours: Sejour[] = lignes.map((ligne, rang) => ({
    ville: texte(ligne.city),
    du: texte(ligne.from_date),
    au: texte(ligne.to_date),
    logement: rang === 0 ? draft.lodging : (draft.otherCities[rang - 1]?.lodging as Lodging),
    placeId: ligne.place_id === null || ligne.place_id === undefined ? null : texte(ligne.place_id),
  }));
  return { draft, brief, timeZone: texte(voyage.time_zone), sejours };
}

/** Ville de l'aperçu : séjour qui recoupe les jours planifiés, dates de l'aperçu dans cette ville. */
export type VilleDeLApercu = {
  readonly rang: number;
  readonly nom: string;
  readonly arrivee: string;
  readonly depart: string;
  readonly sejour: Sejour;
};

/**
 * Villes de l'aperçu : séjours qui recoupent les jours planifiés (`jours` : indices, 1 = J1), dans l'ordre du séjour ; dates
 * limitées aux jours planifiés (`arrivee` = max(début du séjour, J1), `depart` = min(fin du séjour, dernier jour planifié)).
 * Limite connue (signalée dans la PR) : un séjour qui ne couvre que la fin de la fenêtre n'est cherché que sur ses jours.
 */
export function villesDeLApercu(voyage: VoyageLu, jours: readonly number[]): VilleDeLApercu[] {
  const premier = ajouterJours(voyage.draft.start, Math.min(...jours) - 1);
  const dernier = ajouterJours(voyage.draft.start, Math.max(...jours) - 1);
  const retenus = voyage.sejours.filter((sejour) => sejour.du <= dernier && sejour.au > premier);
  return retenus.map((sejour, rang) => ({
    rang,
    nom: sejour.ville,
    arrivee: sejour.du > premier ? sejour.du : premier,
    depart: sejour.au < dernier ? sejour.au : dernier,
    sejour,
  }));
}

/**
 * Nuits du voyage (une par date de l'arrivée à la veille du départ) : étiquette maison du logement du séjour qui la contient
 * et `placeId` écrit sur ce séjour ; `rang` de la ville de l'aperçu qui la contient, ou -1 hors de l'aperçu.
 */
export function nuitsDuVoyage(voyage: VoyageLu, villes: readonly VilleDeLApercu[]): { readonly nuits: Nuit[]; readonly nuitsVille: number[] } {
  const nombre = joursEntre(voyage.draft.start, voyage.draft.end);
  const nuits: Nuit[] = [];
  const nuitsVille: number[] = [];
  for (let rang = 0; rang < nombre; rang += 1) {
    const date = ajouterJours(voyage.draft.start, rang);
    const sejour = voyage.sejours.find((s) => s.du <= date && s.au > date) ?? voyage.sejours.at(-1);
    if (sejour === undefined) throw new TypeError("génération : séjour absent");
    const etiquette = sejour.logement.kind === "none" ? sejour.ville : sejour.logement.kind === "known" || sejour.logement.kind === "area" ? sejour.logement.label : sejour.logement.name;
    nuits.push({ etiquette, ...(sejour.placeId === null ? {} : { placeId: sejour.placeId }) });
    nuitsVille.push(villes.find((v) => v.sejour === sejour)?.rang ?? -1);
  }
  return { nuits, nuitsVille };
}

// --- Versions du programme -------------------------------------------------------------------------------------------------

const SQL_VERSION_COURANTE = `SELECT v.version, v.snapshot FROM public.trips t
  JOIN public.trip_versions v ON v.organization_id = t.organization_id AND v.trip_id = t.id AND v.version = t.current_version
  WHERE t.organization_id = $1 AND t.id = $2`;
const SQL_VERSION = `SELECT version, snapshot FROM public.trip_versions WHERE organization_id = $1 AND trip_id = $2 AND version = $3`;

function versionLue(ligne: Record<string, unknown> | undefined): { version: number; instantane: TripSnapshot } {
  if (ligne === undefined) throw new LectureIllisible();
  const brut = typeof ligne.snapshot === "string" ? JSON.parse(ligne.snapshot) : ligne.snapshot;
  const lu = TripSnapshotSchema.safeParse(brut);
  if (!lu.success) throw new LectureIllisible();
  return { version: Number(ligne.version), instantane: lu.data };
}

/**
 * Dernière version du voyage (`trips.current_version`), validée par `TripSnapshotSchema` ; absente ou illisible :
 * `invalid_input`. Lue par le voyage complet (workflow 4) et par le lot (workflow 5), dans leurs transactions.
 */
export async function lireInstantane(x: ExecuteurLecture, organizationId: string, tripId: string): Promise<{ version: number; instantane: TripSnapshot }> {
  return versionLue((await x.query(SQL_VERSION_COURANTE, [organizationId, tripId])).rows[0]);
}

/** Version `version` du voyage (version de base d'un lot, 0119 § 1.1 point 2), validée ; absente ou illisible : `invalid_input`. */
export async function lireVersion(x: ExecuteurLecture, organizationId: string, tripId: string, version: number): Promise<{ version: number; instantane: TripSnapshot }> {
  return versionLue((await x.query(SQL_VERSION, [organizationId, tripId, version])).rows[0]);
}
