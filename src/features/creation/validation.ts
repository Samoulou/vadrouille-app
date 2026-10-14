import type { Brief, BriefRequest, Lodging, TripDraft } from "@/contracts";
import {
  ADULTS,
  AREA_LENGTH,
  CHILDREN,
  CITY_NAME_LENGTH,
  COMMITMENT_LABEL_LENGTH,
  DESTINATION_LENGTH,
  KNOWN_LODGING_LENGTH,
  MEAL_BUDGET_CHF,
  STORY_LENGTH,
} from "@/contracts/values";

import { DESTINATION_KEY, markedFields, type BriefForm, type BriefValues, type LodgingChoice, type LodgingForm, type TripForm } from "./draft";

/**
 * Validation de l'interface des écrans 1 et 2 (F8-PO-2 à F8-PO-5), fonctions pures. Les bornes viennent de
 * `@/contracts/values`, comme les schémas de `src/contracts/creation.ts` (décision 0017 § 2.1) : aucune borne
 * n'est recopiée ici, et le Zod complet n'entre pas dans les pages. Le serveur revalide (F8-PO-17).
 */

export type FieldError =
  | "required"
  | "length"
  | "past"
  | "endBeforeStart"
  | "cityOrder"
  | "cityBeforeEnd"
  | "outOfTrip"
  | "endTime"
  | "range";

/** Erreur d'un champ ; `field` est aussi la base de l'identifiant du champ dans la page. */
export interface FormError {
  field: string;
  code: FieldError;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Date du jour de l'appareil, en heure locale (« arrivée au plus tôt aujourd'hui », F8-PO-3). */
export function todayIso(now: Date = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

/** Texte libre obligatoire, borné après retrait des espaces aux extrémités. */
export function textError(value: string, bounds: { min: number; max: number }): FieldError | null {
  const length = value.trim().length;
  if (length === 0) return "required";
  return length < bounds.min || length > bounds.max ? "length" : null;
}

function lodgingErrors(lodging: LodgingForm, base: string): FormError[] {
  if (lodging.answer === null) return [{ field: base, code: "required" }];
  if (lodging.answer === "none") return [];
  const code = textError(lodging.label, lodging.answer === "known" ? KNOWN_LODGING_LENGTH : AREA_LENGTH);
  return code ? [{ field: `${base}.label`, code }] : [];
}

/** Date `AAAA-MM-JJ` qui existe au calendrier (`2026-02-31` est refusée, comme par le schéma serveur). */
export function isDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

/** Erreurs de l'écran 1, dans l'ordre d'affichage des champs (le focus va sur la première). */
export function validateTrip(trip: TripForm, today: string): FormError[] {
  const errors: FormError[] = [];
  const push = (field: string, code: FieldError | null) => {
    if (code) errors.push({ field, code });
  };

  push("destination", textError(trip.destination, DESTINATION_LENGTH));
  const start = isDate(trip.start) ? trip.start : null;
  const end = isDate(trip.end) ? trip.end : null;
  push("start", start === null ? "required" : start < today ? "past" : null);
  push("end", end === null ? "required" : start !== null && end <= start ? "endBeforeStart" : null);
  const datesValid = start !== null && end !== null && start < end;
  errors.push(...lodgingErrors(trip.lodging, "lodging"));

  let previous = start;
  trip.otherCities.forEach((city, index) => {
    const base = `otherCities.${index}`;
    push(`${base}.name`, textError(city.name, CITY_NAME_LENGTH));
    if (!isDate(city.arrival)) {
      push(`${base}.arrival`, "required");
    } else if (datesValid) {
      if (previous !== null && city.arrival <= previous) push(`${base}.arrival`, "cityOrder");
      else if (city.arrival >= (end as string)) push(`${base}.arrival`, "cityBeforeEnd");
    }
    previous = isDate(city.arrival) ? city.arrival : previous;
    errors.push(...lodgingErrors(city.lodging, `${base}.lodging`));
  });

  trip.commitments.forEach((commitment, index) => {
    const base = `commitments.${index}`;
    push(`${base}.kind`, commitment.kind === null ? "required" : null);
    push(`${base}.label`, textError(commitment.label, COMMITMENT_LABEL_LENGTH));
    if (!isDate(commitment.date)) push(`${base}.date`, "required");
    else if (datesValid && (commitment.date < (start as string) || commitment.date > (end as string))) push(`${base}.date`, "outOfTrip");
    push(`${base}.start`, TIME.test(commitment.start) ? null : "required");
    if (commitment.end !== "" && TIME.test(commitment.start) && (!TIME.test(commitment.end) || commitment.end <= commitment.start)) {
      push(`${base}.end`, "endTime");
    }
  });
  return errors;
}

export interface CityRange {
  name: string;
  start: string;
  end: string;
}

/**
 * Dates de chaque ville, déduites et jamais stockées (0017 § 2.2) : la première ville est la destination et
 * commence à l'arrivée du voyage ; chaque ville se termine le jour d'arrivée dans la suivante ; la dernière, au
 * départ du voyage. `null` tant que les dates ne sont pas cohérentes.
 */
export function cityRanges(trip: Pick<TripForm, "destination" | "start" | "end" | "otherCities">): CityRange[] | null {
  const arrivals = [trip.start, ...trip.otherCities.map((city) => city.arrival)];
  const all = [...arrivals, trip.end];
  if (!all.every(isDate)) return null;
  for (let index = 1; index < all.length; index += 1) {
    if ((all[index] as string) <= (all[index - 1] as string)) return null;
  }
  const names = [trip.destination, ...trip.otherCities.map((city) => city.name)].map((name) => name.trim());
  return names.map((name, index) => ({ name, start: all[index] as string, end: all[index + 1] as string }));
}

function toLodging(lodging: LodgingForm, choice: LodgingChoice | undefined): Lodging {
  switch (lodging.answer) {
    case "known":
      return { kind: "known", label: lodging.label.trim() };
    case "area":
      return { kind: "area", label: lodging.label.trim() };
    default:
      // « Pas encore » : le choix de l'écran 3 s'il y en a un (identifiants seulement), sinon « pas encore ».
      return choice ?? { kind: "none" };
  }
}

/**
 * `TripDraft` d'un écran 1 validé (contrat livré par F8a, 0017 § 2 ; lu par la création du voyage de F8c et par
 * le test de concordance). Un engagement sans type est une erreur d'appel, jamais remplacé par une valeur.
 */
export function toTripDraft(trip: TripForm, choices: Readonly<Record<string, LodgingChoice>> = {}): TripDraft {
  if (trip.commitments.some((commitment) => commitment.kind === null)) {
    throw new Error("toTripDraft : écran 1 non validé (engagement sans type).");
  }
  return {
    destination: trip.destination.trim(),
    start: trip.start,
    end: trip.end,
    lodging: toLodging(trip.lodging, choices[DESTINATION_KEY]),
    otherCities: trip.otherCities.map((city) => ({
      name: city.name.trim(),
      arrival: city.arrival,
      lodging: toLodging(city.lodging, choices[city.key]),
    })),
    commitments: trip.commitments.map((commitment) => ({
      kind: commitment.kind as NonNullable<typeof commitment.kind>,
      label: commitment.label.trim(),
      date: commitment.date,
      start: commitment.start,
      ...(commitment.end ? { end: commitment.end } : {}),
    })),
  };
}

/** Entrée minimale de `structureBrief` (0017 § 2.3) : ni logement, ni identifiant, ni engagement. */
export function toBriefRequest(trip: TripForm, story: string): BriefRequest {
  return {
    story,
    trip: {
      destination: trip.destination.trim(),
      start: trip.start,
      end: trip.end,
      otherCities: trip.otherCities.map((city) => ({ name: city.name.trim(), arrival: city.arrival })),
    },
  };
}

/** Récit : au moins `STORY_LENGTH.min` caractères hors espaces aux extrémités (le plafond est tenu par le champ). */
export function storyError(story: string): FieldError | null {
  const length = story.trim().length;
  if (length < STORY_LENGTH.min) return "required";
  return length > STORY_LENGTH.max ? "length" : null;
}

/** Entier saisi dans les bornes, sinon `null`. */
export function parseInteger(value: string, bounds: { min: number; max: number }): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value.trim());
  return number >= bounds.min && number <= bounds.max ? number : null;
}

/** Erreurs de la vérification (F8-PO-5), dans l'ordre d'affichage : voyageurs, rythme, envies, budget par repas. */
export function validateBrief(values: BriefValues): FormError[] {
  const errors: FormError[] = [];
  if (parseInteger(values.adults, ADULTS) === null) errors.push({ field: "adults", code: "range" });
  if (parseInteger(values.children, CHILDREN) === null) errors.push({ field: "children", code: "range" });
  if (values.pace === null) errors.push({ field: "pace", code: "required" });
  if (values.wishes.length === 0) errors.push({ field: "wishes", code: "required" });
  if (values.mealBudget.trim() !== "" && parseInteger(values.mealBudget, MEAL_BUDGET_CHF) === null) {
    errors.push({ field: "mealBudget", code: "range" });
  }
  return errors;
}

/** `Brief` d'une vérification validée ; les champs encore marqués restent déduits (`inferredFields`, F8-PO-7). */
export function toBrief(brief: BriefForm): Brief {
  const { values } = brief;
  const budget = parseInteger(values.mealBudget, MEAL_BUDGET_CHF);
  return {
    travellers: { adults: parseInteger(values.adults, ADULTS) ?? ADULTS.min, children: parseInteger(values.children, CHILDREN) ?? CHILDREN.min },
    pace: values.pace ?? "balanced",
    wishes: [...values.wishes],
    limits: [...values.limits],
    mobility: [...values.mobility],
    ...(budget === null ? {} : { mealBudgetPerPerson: budget }),
    inferredFields: markedFields(brief.marks),
  };
}
