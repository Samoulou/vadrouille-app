import "server-only";

import type { Brief, Category, Lodging, TripCommitment, TripDraft, TripRequest } from "@/contracts";
import type { BriefField, CommitmentKind, MobilityMode, Pace } from "@/contracts/values";

/**
 * Brouillon et brief en lignes, et retour (spécification B9, B9b points 1 et 2 ; décision 0081 B9-TL-5 et B9-TL-6) :
 * conversion pure, sans requête, plus la relecture `lireBrouillon` (tests de l'aller-retour, puis workflows 1 et 4).
 * Une ligne `stays` par ville (destination d'abord), de l'arrivée à l'arrivée suivante (borne exclusive, B9-TL-6 (f)) ;
 * le type de logement d'origine (`lodging_kind`) et les valeurs maison de la suggestion retenue sont gardés tels
 * quels. Seul identifiant Google écrit : le `placeId` d'un logement suggéré (`stays.place_id`, CLAUDE.md, 0011) ;
 * aucune autre donnée Google n'entre dans ces lignes. `TripRequest.story` (facultatif, site d'essai seulement, décision 0125 § 5) n'est jamais écrit ici : `briefs.story` reste nul.
 */

export interface LigneSejour {
  readonly city: string;
  readonly fromDate: string;
  readonly toDate: string;
  readonly kind: "lodging" | "neighbourhood" | "none";
  readonly lodgingKind: Lodging["kind"];
  readonly label: string;
  readonly placeId: string | null;
  readonly suggestionId: string | null;
  readonly areaCenterLat: number | null;
  readonly areaCenterLng: number | null;
  readonly areaRadiusM: number | null;
}

export interface LigneEngagement {
  readonly rank: number;
  readonly kind: CommitmentKind;
  readonly label: string;
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string | null;
}

export interface LigneBrief {
  readonly pace: Pace;
  readonly mobilityModes: readonly MobilityMode[];
  readonly wishes: readonly Category[];
  readonly limitCategories: readonly Category[];
  readonly mealBudget: string | null;
  readonly inferredFields: readonly BriefField[];
}

export interface LignesDuBrouillon {
  readonly voyage: {
    readonly destination: string;
    readonly startDate: string;
    readonly endDate: string;
    readonly travellersAdults: number;
    readonly travellersChildren: number;
  };
  readonly brief: LigneBrief;
  readonly sejours: readonly LigneSejour[];
  readonly engagements: readonly LigneEngagement[];
}

/** Colonnes de logement d'une ville (type d'origine et valeurs maison, B9-TL-5). */
function colonnesLogement(city: string, lodging: Lodging): Omit<LigneSejour, "city" | "fromDate" | "toDate"> {
  const vide = { placeId: null, suggestionId: null, areaCenterLat: null, areaCenterLng: null, areaRadiusM: null };
  switch (lodging.kind) {
    case "known":
      return { ...vide, kind: "lodging", lodgingKind: "known", label: lodging.label };
    case "area":
      return { ...vide, kind: "neighbourhood", lodgingKind: "area", label: lodging.label };
    case "none":
      return { ...vide, kind: "none", lodgingKind: "none", label: city };
    case "suggestedLodging":
      return { ...vide, kind: "lodging", lodgingKind: "suggestedLodging", label: lodging.name, placeId: lodging.placeId ?? null, suggestionId: lodging.lodgingId };
    case "suggestedArea":
      return {
        kind: "neighbourhood",
        lodgingKind: "suggestedArea",
        label: lodging.name,
        placeId: null,
        suggestionId: lodging.areaId,
        areaCenterLat: lodging.center.lat,
        areaCenterLng: lodging.center.lng,
        areaRadiusM: lodging.radiusM,
      };
  }
}

/** Lignes à écrire pour une demande validée (`TripRequestSchema`). */
export function lignesDuBrouillon(request: TripRequest): LignesDuBrouillon {
  const { draft, brief } = request;
  const villes = [{ name: draft.destination, arrival: draft.start, lodging: draft.lodging }, ...draft.otherCities];
  const sejours = villes.map((ville, indice) => ({
    city: ville.name,
    fromDate: ville.arrival,
    toDate: villes[indice + 1]?.arrival ?? draft.end,
    ...colonnesLogement(ville.name, ville.lodging),
  }));
  const engagements = draft.commitments.map((engagement, rank) => ({
    rank,
    kind: engagement.kind,
    label: engagement.label,
    date: engagement.date,
    startTime: engagement.start,
    endTime: engagement.end ?? null,
  }));
  return {
    voyage: {
      destination: draft.destination,
      startDate: draft.start,
      endDate: draft.end,
      travellersAdults: brief.travellers.adults,
      travellersChildren: brief.travellers.children,
    },
    brief: {
      pace: brief.pace,
      mobilityModes: brief.mobility,
      wishes: brief.wishes,
      limitCategories: brief.limits,
      mealBudget: brief.mealBudgetPerPerson === undefined ? null : String(brief.mealBudgetPerPerson),
      inferredFields: brief.inferredFields,
    },
    sejours,
    engagements,
  };
}

/** Exécuteur structurel (`executeurSql` de `src/server/with-org.ts`). */
export interface ExecuteurCreation {
  query(texte: string, valeurs?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

const SQL_VOYAGE = `SELECT destination, to_char(start_date, 'YYYY-MM-DD') AS start, to_char(end_date, 'YYYY-MM-DD') AS "end",
  travellers_adults AS adults, travellers_children AS children, time_zone
  FROM public.trips WHERE organization_id = $1 AND id = $2`;
const SQL_BRIEF = `SELECT pace, mobility_modes, wishes, limit_categories, meal_budget, inferred_fields
  FROM public.briefs WHERE organization_id = $1 AND trip_id = $2 ORDER BY version DESC LIMIT 1`;
const SQL_SEJOURS = `SELECT city, to_char(from_date, 'YYYY-MM-DD') AS from_date, lodging_kind, label, place_id, suggestion_id,
  area_center_lat, area_center_lng, area_radius_m
  FROM public.stays WHERE organization_id = $1 AND trip_id = $2 ORDER BY from_date`;
const SQL_ENGAGEMENTS = `SELECT kind, label, to_char(date, 'YYYY-MM-DD') AS date, start_time, end_time
  FROM public.trip_commitments WHERE organization_id = $1 AND trip_id = $2 ORDER BY rank`;

const texte = (valeur: unknown): string => {
  if (typeof valeur !== "string") throw new TypeError("lireBrouillon : colonne illisible");
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
      throw new TypeError("lireBrouillon : type de logement illisible");
  }
}

/**
 * Relecture du brouillon et du brief d'un voyage écrit par `createTrip` (organisation posée par `withOrg`), ou `null`
 * pour un voyage absent. Un voyage antérieur à B9b (colonnes nulles) lève : il n'a pas de brouillon complet.
 */
export async function lireBrouillon(
  executeur: ExecuteurCreation,
  organizationId: string,
  tripId: string,
): Promise<{ draft: TripDraft; brief: Brief; timeZone: string } | null> {
  const voyage = (await executeur.query(SQL_VOYAGE, [organizationId, tripId])).rows[0];
  if (voyage === undefined) return null;
  const ligneBrief = (await executeur.query(SQL_BRIEF, [organizationId, tripId])).rows[0];
  if (ligneBrief === undefined) throw new TypeError("lireBrouillon : brief absent");
  const sejours = (await executeur.query(SQL_SEJOURS, [organizationId, tripId])).rows;
  const engagements = (await executeur.query(SQL_ENGAGEMENTS, [organizationId, tripId])).rows;
  const [premier, ...autres] = sejours;
  if (premier === undefined) throw new TypeError("lireBrouillon : séjour absent");

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
  return { draft, brief, timeZone: texte(voyage.time_zone) };
}
