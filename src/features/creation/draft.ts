import type { Category, InferredBrief } from "@/contracts";
import {
  ADULTS,
  BRIEF_FIELDS,
  CHILDREN,
  MAX_CITIES,
  MAX_COMMITMENTS,
  type BriefField,
  type CommitmentKind,
  type MobilityMode,
  type Pace,
} from "@/contracts/values";

/**
 * Brouillon de création en mémoire de l'onglet (F8-PO-1, décision 0017 § 5) : réducteur pur, testé sans React,
 * que `DraftProvider` monte dans le groupe de routes `(creation)`. Rien n'est écrit côté navigateur : un
 * rechargement le perd. Les saisies sont gardées telles quelles (textes), la validation se fait au bouton
 * principal (`validation.ts`).
 */

/** Réponse à « As-tu déjà un logement ? » : « Oui », « Un quartier », « Pas encore ». */
export type LodgingAnswer = "known" | "area" | "none";
export const LODGING_ANSWERS: readonly LodgingAnswer[] = ["known", "area", "none"];

export interface LodgingForm {
  answer: LodgingAnswer | null;
  /** Nom ou adresse (« Oui ») ou quartier (« Un quartier ») ; gardé si la réponse change puis revient. */
  label: string;
}

export interface CityForm {
  /** Clé stable de la ville dans la liste (React), jamais envoyée. */
  key: string;
  name: string;
  arrival: string;
  lodging: LodgingForm;
}

export interface CommitmentForm {
  key: string;
  kind: CommitmentKind | null;
  label: string;
  date: string;
  start: string;
  end: string;
}

export interface TripForm {
  destination: string;
  start: string;
  end: string;
  lodging: LodgingForm;
  otherCities: CityForm[];
  commitments: CommitmentForm[];
}

/** Champs à choix multiple du brief, rendus en `Chip`. */
export type ChipField = "wishes" | "limits" | "mobility";
export type ChipValue<F extends ChipField> = F extends "mobility" ? MobilityMode : Category;

export interface BriefValues {
  /** Saisies numériques gardées en texte jusqu'à la validation. */
  adults: string;
  children: string;
  pace: Pace | null;
  wishes: Category[];
  limits: Category[];
  mobility: MobilityMode[];
  mealBudget: string;
}

/**
 * Marques « déduit » encore présentes (F8-PO-7) : une valeur déduite que la personne n'a pas touchée. Pour les
 * champs à `Chip`, la marque est portée par chaque valeur ; toucher une `Chip` ne retire que la sienne.
 */
export interface BriefMarks {
  travellers: boolean;
  pace: boolean;
  mealBudget: boolean;
  wishes: Category[];
  limits: Category[];
  mobility: MobilityMode[];
}

export interface BriefForm {
  values: BriefValues;
  marks: BriefMarks;
  /** Champs déduits à l'affichage de la vérification (`inferred_fields_count` de `brief_completed`). */
  shown: BriefField[];
  /** Champs modifiés par la personne depuis cet affichage (un champ compte une fois). */
  edited: BriefField[];
  /** Champs modifiés par la personne depuis le début : un nouveau passage par le récit les garde (F8-PO-5). */
  touched: BriefField[];
}

export type BriefStage = "story" | "review";

export interface DraftState {
  trip: TripForm;
  /** L'écran 1 a été validé : l'écran 2 a un brouillon (sinon, retour à l'écran 1 avec l'annonce). */
  tripReady: boolean;
  stage: BriefStage;
  story: string;
  brief: BriefForm;
  /** L'écran 2 a été validé (« Continuer » à l'état « Vérification »). */
  briefReady: boolean;
  /** Annonce à écrire sur l'écran 1 après un brouillon perdu (écrite après le premier rendu, 0018 § 14). */
  lostNotice: boolean;
  /** L'annonce du brouillon perdu est écrite dans sa région, jusqu'à la validation de l'écran 1. */
  noticeVisible: boolean;
  /** Compteur des clés de villes et d'engagements. */
  serial: number;
}

const emptyLodging = (): LodgingForm => ({ answer: null, label: "" });

export function emptyBriefValues(): BriefValues {
  return {
    adults: String(ADULTS.min),
    children: String(CHILDREN.min),
    pace: null,
    wishes: [],
    limits: [],
    mobility: [],
    mealBudget: "",
  };
}

const noMarks = (): BriefMarks => ({ travellers: false, pace: false, mealBudget: false, wishes: [], limits: [], mobility: [] });

export function initialDraft(): DraftState {
  return {
    trip: { destination: "", start: "", end: "", lodging: emptyLodging(), otherCities: [], commitments: [] },
    tripReady: false,
    stage: "story",
    story: "",
    brief: { values: emptyBriefValues(), marks: noMarks(), shown: [], edited: [], touched: [] },
    briefReady: false,
    lostNotice: false,
    noticeVisible: false,
    serial: 0,
  };
}

/** Champs encore marqués « déduit » (ils restent déduits dans le brief, `inferredFields`). */
export function markedFields(marks: BriefMarks): BriefField[] {
  return BRIEF_FIELDS.filter((field) => {
    switch (field) {
      case "travellers":
      case "pace":
      case "mealBudget":
        return marks[field];
      default:
        return marks[field].length > 0;
    }
  });
}

/** Valeur du formulaire d'un champ, pour remettre à vide ce qui n'est plus déduit. */
function resetField(values: BriefValues, field: BriefField): BriefValues {
  const empty = emptyBriefValues();
  switch (field) {
    case "travellers":
      return { ...values, adults: empty.adults, children: empty.children };
    case "mealBudget":
      return { ...values, mealBudget: empty.mealBudget };
    default:
      return { ...values, [field]: empty[field] };
  }
}

/**
 * Applique un brief déduit (F8-PO-5) : les champs modifiés par la personne sont gardés ; les autres prennent la
 * valeur déduite (marquée) ou redeviennent vides s'ils ne sont plus déduits.
 */
export function applyInferred(brief: BriefForm, inferred: InferredBrief | null): BriefForm {
  let values = brief.values;
  const marks = noMarks();
  const keep = new Set(brief.touched);
  for (const field of BRIEF_FIELDS) {
    if (keep.has(field)) continue;
    values = resetField(values, field);
    if (!inferred) continue;
    switch (field) {
      case "travellers":
        if (inferred.travellers) {
          values = { ...values, adults: String(inferred.travellers.adults), children: String(inferred.travellers.children) };
          marks.travellers = true;
        }
        break;
      case "pace":
        if (inferred.pace) {
          values = { ...values, pace: inferred.pace };
          marks.pace = true;
        }
        break;
      case "mealBudget":
        if (inferred.mealBudgetPerPerson !== undefined) {
          values = { ...values, mealBudget: String(inferred.mealBudgetPerPerson) };
          marks.mealBudget = true;
        }
        break;
      case "wishes":
      case "limits":
        if (inferred[field]) {
          values = { ...values, [field]: [...inferred[field]] };
          marks[field] = [...inferred[field]];
        }
        break;
      case "mobility":
        if (inferred.mobility) {
          values = { ...values, mobility: [...inferred.mobility] };
          marks.mobility = [...inferred.mobility];
        }
        break;
    }
  }
  // Une envie gardée par la personne ne peut pas aussi être à limiter (et inversement) : la déduction cède.
  if (!keep.has("limits")) {
    values = { ...values, limits: values.limits.filter((limit) => !values.wishes.includes(limit)) };
  } else if (!keep.has("wishes")) {
    values = { ...values, wishes: values.wishes.filter((wish) => !values.limits.includes(wish)) };
  }
  marks.limits = marks.limits.filter((limit) => values.limits.includes(limit));
  marks.wishes = marks.wishes.filter((wish) => values.wishes.includes(wish));
  return { values, marks, shown: markedFields(marks), edited: [], touched: brief.touched };
}

export type DraftAction =
  | { type: "trip"; patch: Partial<Pick<TripForm, "destination" | "start" | "end">> }
  | { type: "lodging"; city: number; patch: Partial<LodgingForm> }
  | { type: "addCity" }
  | { type: "city"; index: number; patch: Partial<Pick<CityForm, "name" | "arrival">> }
  | { type: "removeCity"; index: number }
  | { type: "addCommitment" }
  | { type: "commitment"; index: number; patch: Partial<Omit<CommitmentForm, "key">> }
  | { type: "removeCommitment"; index: number }
  | { type: "tripReady" }
  | { type: "lost" }
  | { type: "noticeShown" }
  | { type: "story"; story: string }
  | { type: "inferred"; brief: InferredBrief }
  | { type: "fillMyself" }
  | { type: "backToStory" }
  | { type: "travellers"; patch: Partial<Pick<BriefValues, "adults" | "children">> }
  | { type: "pace"; pace: Pace }
  | { type: "toggle"; field: ChipField; value: Category | MobilityMode }
  | { type: "mealBudget"; value: string }
  | { type: "briefReady" };

function touch(brief: BriefForm, field: BriefField): BriefForm {
  return {
    ...brief,
    touched: brief.touched.includes(field) ? brief.touched : [...brief.touched, field],
    edited: !brief.shown.includes(field) || brief.edited.includes(field) ? brief.edited : [...brief.edited, field],
  };
}

function updateLodging(trip: TripForm, city: number, patch: Partial<LodgingForm>): TripForm {
  if (city === 0) return { ...trip, lodging: { ...trip.lodging, ...patch } };
  return {
    ...trip,
    otherCities: trip.otherCities.map((item, index) => (index === city - 1 ? { ...item, lodging: { ...item.lodging, ...patch } } : item)),
  };
}

export function draftReducer(state: DraftState, action: DraftAction): DraftState {
  switch (action.type) {
    case "trip":
      return { ...state, trip: { ...state.trip, ...action.patch } };
    case "lodging":
      return { ...state, trip: updateLodging(state.trip, action.city, action.patch) };
    case "addCity": {
      if (state.trip.otherCities.length >= MAX_CITIES - 1) return state;
      const city: CityForm = { key: `ville-${state.serial + 1}`, name: "", arrival: "", lodging: emptyLodging() };
      return { ...state, serial: state.serial + 1, trip: { ...state.trip, otherCities: [...state.trip.otherCities, city] } };
    }
    case "city":
      return {
        ...state,
        trip: {
          ...state.trip,
          otherCities: state.trip.otherCities.map((city, index) => (index === action.index ? { ...city, ...action.patch } : city)),
        },
      };
    case "removeCity":
      return { ...state, trip: { ...state.trip, otherCities: state.trip.otherCities.filter((_, index) => index !== action.index) } };
    case "addCommitment": {
      if (state.trip.commitments.length >= MAX_COMMITMENTS) return state;
      const commitment: CommitmentForm = { key: `engagement-${state.serial + 1}`, kind: null, label: "", date: "", start: "", end: "" };
      return { ...state, serial: state.serial + 1, trip: { ...state.trip, commitments: [...state.trip.commitments, commitment] } };
    }
    case "commitment":
      return {
        ...state,
        trip: {
          ...state.trip,
          commitments: state.trip.commitments.map((item, index) => (index === action.index ? { ...item, ...action.patch } : item)),
        },
      };
    case "removeCommitment":
      return { ...state, trip: { ...state.trip, commitments: state.trip.commitments.filter((_, index) => index !== action.index) } };
    case "tripReady":
      return { ...state, tripReady: true, lostNotice: false, noticeVisible: false };
    case "lost":
      return { ...initialDraft(), lostNotice: true };
    case "noticeShown":
      return state.lostNotice ? { ...state, lostNotice: false, noticeVisible: true } : state;
    case "story":
      return { ...state, story: action.story };
    case "inferred":
      return { ...state, stage: "review", brief: applyInferred(state.brief, action.brief) };
    case "fillMyself":
      return { ...state, stage: "review", brief: applyInferred(state.brief, null) };
    case "backToStory":
      return { ...state, stage: "story" };
    case "travellers": {
      const brief = touch(state.brief, "travellers");
      return { ...state, brief: { ...brief, values: { ...brief.values, ...action.patch }, marks: { ...brief.marks, travellers: false } } };
    }
    case "pace": {
      if (state.brief.values.pace === action.pace) return state;
      const brief = touch(state.brief, "pace");
      return { ...state, brief: { ...brief, values: { ...brief.values, pace: action.pace }, marks: { ...brief.marks, pace: false } } };
    }
    case "toggle": {
      const field = action.field;
      const current = state.brief.values[field] as (Category | MobilityMode)[];
      const other = field === "wishes" ? state.brief.values.limits : field === "limits" ? state.brief.values.wishes : [];
      // Une envie choisie est indisponible dans « À limiter », et inversement : l'activer n'a pas d'effet.
      if (!current.includes(action.value) && (other as (Category | MobilityMode)[]).includes(action.value)) return state;
      const next = current.includes(action.value) ? current.filter((value) => value !== action.value) : [...current, action.value];
      const brief = touch(state.brief, field);
      const marks = (brief.marks[field] as (Category | MobilityMode)[]).filter((value) => value !== action.value);
      return { ...state, brief: { ...brief, values: { ...brief.values, [field]: next }, marks: { ...brief.marks, [field]: marks } } };
    }
    case "mealBudget": {
      const brief = touch(state.brief, "mealBudget");
      return { ...state, brief: { ...brief, values: { ...brief.values, mealBudget: action.value }, marks: { ...brief.marks, mealBudget: false } } };
    }
    case "briefReady":
      return { ...state, briefReady: true };
  }
}
