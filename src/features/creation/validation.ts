import type { Brief, BriefRequest, DestinationRegion, Lodging, TripDraft } from "@/contracts";
import {
  ADULTS,
  AREA_LENGTH,
  CHILDREN,
  CITY_NAME_LENGTH,
  COMMITMENT_LABEL_LENGTH,
  DESTINATION_LENGTH,
  KNOWN_LODGING_LENGTH,
  MEAL_BUDGET_CHF,
  PROTOTYPE_STAY_DAYS_MAX,
  STORY_LENGTH,
} from "@/contracts/values";
import { fuseauDeVille, fuseauDuPays, paysParCode } from "@/lib/fuseaux";

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
  | "range"
  // Site d'essai (spécification E2E-essai, lot 2, D1) : pays ou région manquants d'une ville absente de la table des
  // villes (demande de Samuel du 23 octobre 2026), seconde ville, séjour trop long.
  | "country"
  | "timeZone"
  | "singleCity"
  | "tooLong";

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

/** Jours entre deux dates valides `AAAA-MM-JJ`. */
function joursEntre(start: string, end: string): number {
  return (Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000;
}

export interface ValidateTripOptions {
  /**
   * Site d'essai (adaptateur `prototype` ; spécification E2E-essai, lot 2, critère 2, et D1) : une seule ville ; une
   * destination absente de la table des villes (`fuseauDeVille`, aucune donnée Google) demande son pays, et sa région
   * pour un pays à plusieurs fuseaux (table maison des pays, demande de Samuel du 23 octobre 2026) ; et
   * `PROTOTYPE_STAY_DAYS_MAX` jours au plus, la borne de `BriefSchema` (`src/prototype/brief.ts`), écrite une seule fois
   * dans `@/contracts/values`. Refus au champ.
   */
  essai?: boolean;
}

/** Vrai si la destination saisie (non vide) est absente de la table maison des villes : l'écran 1 demande alors son pays. */
export function destinationHorsTable(destination: string): boolean {
  return textError(destination, DESTINATION_LENGTH) === null && fuseauDeVille(destination) === null;
}

/**
 * Pays et fuseau choisis pour une destination hors de la table des villes, résolus contre la table des pays (un pays à un
 * seul fuseau n'en demande pas) ; `null` si la destination est dans la table, ou si le choix est incomplet ou hors liste.
 */
export function destinationRegion(trip: Pick<TripForm, "destination" | "country" | "timeZone">): DestinationRegion | null {
  if (!destinationHorsTable(trip.destination)) return null;
  const pays = paysParCode(trip.country || undefined);
  if (pays === null) return null;
  const timeZone = fuseauDuPays(pays.code, pays.fuseaux.length === 1 ? undefined : (trip.timeZone ?? ""));
  return timeZone === null ? null : { country: pays.code, timeZone };
}

/** Erreurs de l'écran 1, dans l'ordre d'affichage des champs (le focus va sur la première). */
export function validateTrip(trip: TripForm, today: string, options: ValidateTripOptions = {}): FormError[] {
  const errors: FormError[] = [];
  const push = (field: string, code: FieldError | null) => {
    if (code) errors.push({ field, code });
  };

  const essai = options.essai === true;
  const destinationError = textError(trip.destination, DESTINATION_LENGTH);
  push("destination", destinationError);
  if (essai && destinationHorsTable(trip.destination) && destinationRegion(trip) === null) {
    // Pays absent ou hors liste : le champ « Pays » ; pays à plusieurs fuseaux sans région : le champ « Fuseau horaire ».
    const code = paysParCode(trip.country || undefined) === null ? "country" : "timeZone";
    push(code, code);
  }
  const start = isDate(trip.start) ? trip.start : null;
  const end = isDate(trip.end) ? trip.end : null;
  push("start", start === null ? "required" : start < today ? "past" : null);
  push(
    "end",
    end === null
      ? "required"
      : start !== null && end <= start
        ? "endBeforeStart"
        : essai && start !== null && joursEntre(start, end) > PROTOTYPE_STAY_DAYS_MAX - 1
          ? "tooLong"
          : null,
  );
  const datesValid = start !== null && end !== null && start < end;
  errors.push(...lodgingErrors(trip.lodging, "lodging"));

  let previous = start;
  trip.otherCities.forEach((city, index) => {
    const base = `otherCities.${index}`;
    push(`${base}.name`, essai ? "singleCity" : textError(city.name, CITY_NAME_LENGTH));
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
  const region = destinationRegion(trip);
  return {
    destination: trip.destination.trim(),
    ...(region === null ? {} : { destinationRegion: region }),
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
