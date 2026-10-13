"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useTrack } from "@/analytics/context";
import { Button } from "@/components/ligne/Button";
import { Chip } from "@/components/ligne/Chip";
import { IconButton } from "@/components/ligne/IconButton";
import { SegmentedControl } from "@/components/ligne/SegmentedControl";
import { IconPlus, IconRetour } from "@/components/ligne/icons";
import {
  ADULTS,
  CATEGORIES,
  CHILDREN,
  MEAL_BUDGET_CHF,
  MOBILITY_MODES,
  PACES,
  type MobilityMode,
  type Pace,
} from "@/contracts/values";
import type { Category } from "@/contracts";
import { connexionRoute } from "@/features/compte/suite";
import { format, messages } from "@/i18n";
import { formatNombre } from "@/lib/nombre";
import { cn } from "@/lib/utils";

import { TITLE_CLASS } from "./CreationShell";
import { useDraft } from "./DraftProvider";
import { IconMoinsProvisoire, NumberField } from "./NumberField";
import { briefCompletedProperties } from "./brief-fields";
import type { BriefValues, ChipField } from "./draft";
import { describedBy, EMPTY_LIVE_REGION_CLASS, errorId, FieldMessage, fieldId, focusField } from "./fields";
import type { StageProps } from "./stage";
import { creationRoutes } from "./routes";
import { parseInteger, validateBrief, type FormError } from "./validation";

const t = messages.creation;
const v = t.ecran2.verification;
const err = v.erreurs;

/** Mention « déduit de ton récit », unique dans la page, décrivant chaque champ déduit (`aria-describedby`). */
const INFERRED_ID = "brief-deduit";
const ALREADY_LIMITED_ID = "brief-deja-limite";
const ALREADY_WISHED_ID = "brief-deja-envie";

const PACE_OPTIONS = PACES.map((value) => ({ value, label: v.rythme.options[value] }));

const SECTION_TITLE_CLASS = "text-section font-extrabold text-ink";

/** « Retirer » ou « Ajouter » à la borne : indisponible comme une `Chip` (`aria-disabled`, fond `muted`). */
const STEP_BOUND_CLASS =
  "aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-muted aria-disabled:text-ink-soft";

const errorMessages: Record<string, string> = {
  adults: format(err.adultes, ADULTS),
  children: format(err.enfants, CHILDREN),
  pace: err.rythme,
  wishes: err.envies,
  mealBudget: format(err.budget, MEAL_BUDGET_CHF),
};

/** Résumé du budget par repas (« Environ 40 CHF par personne et par repas »), ou `null` sans montant valable. */
function budgetSummary(value: string): string | null {
  const amount = parseInteger(value, MEAL_BUDGET_CHF);
  return amount === null ? null : format(v.budget.resume, { montant: formatNombre(amount) });
}

function listSummary(labels: string[]): string | null {
  return labels.length > 0 ? labels.join(v.resumeSeparateur) : null;
}

/**
 * État « Vérification » de l'écran 2 (F8-PO-5 à F8-PO-7, 0018 § 16). Voyageurs, rythme et envies toujours
 * ouverts ; déplacements, à limiter et budget par repas repliés, sauf s'ils contiennent une déduction. Une valeur
 * déduite est en pointillé et décrite par « déduit de ton récit » ; la toucher retire la marque. « Continuer »
 * valide, envoie `brief_completed` et mène à la suite du parcours.
 */
export function BriefReview({ focusTitle, onStageChange }: StageProps) {
  const router = useRouter();
  const track = useTrack();
  const { state, dispatch } = useDraft();
  const { values, marks, shown } = state.brief;
  const [errors, setErrors] = useState<FormError[]>([]);
  const titleRef = useRef<HTMLHeadingElement>(null);
  // « Continuer » déjà validé : un second clic avant la navigation n'envoie pas `brief_completed` une seconde fois.
  const submitted = useRef(false);
  // Sections facultatives ouvertes d'office si elles contiennent une déduction (aucune déduction cachée).
  const [open, setOpen] = useState(() => ({
    mobility: marks.mobility.length > 0,
    limits: marks.limits.length > 0,
    mealBudget: marks.mealBudget,
  }));

  useEffect(() => {
    if (focusTitle) titleRef.current?.focus();
  }, [focusTitle]);

  const errorOf = (field: string): string | null =>
    errors.some((error) => error.field === field) ? (errorMessages[field] ?? null) : null;

  function submit() {
    if (submitted.current) return;
    const found = validateBrief(values);
    setErrors(found);
    const first = found[0];
    if (first) {
      if (first.field === "mealBudget") setOpen((current) => ({ ...current, mealBudget: true }));
      requestAnimationFrame(() => focusField(first.field));
      return;
    }
    submitted.current = true;
    dispatch({ type: "briefReady" });
    track({ name: "brief_completed", properties: briefCompletedProperties(state.brief) });
    router.push(connexionRoute(creationRoutes.lancer()));
  }

  function backToStory() {
    onStageChange();
    dispatch({ type: "backToStory" });
  }

  return (
    <>
      <h1 ref={titleRef} tabIndex={-1} className={TITLE_CLASS}>
        {v.titre}
      </h1>
      {shown.length > 0 ? <p className="text-corps-s text-ink-soft">{v.aide}</p> : null}
      <span id={INFERRED_ID} hidden>
        {messages.ligne.deduit}
      </span>
      <span id={ALREADY_LIMITED_ID} hidden>
        {v.envies.dejaLimite}
      </span>
      <span id={ALREADY_WISHED_ID} hidden>
        {v.limiter.dejaEnvie}
      </span>

      <section aria-labelledby="voyageurs-titre" className="flex flex-col gap-3">
        <h2 id="voyageurs-titre" className={SECTION_TITLE_CLASS}>
          {v.voyageurs.titre}
        </h2>
        <TravellerRow
          field="adults"
          label={v.voyageurs.adultes}
          less={v.voyageurs.retirerAdulte}
          more={v.voyageurs.ajouterAdulte}
          bounds={ADULTS}
          values={values}
          inferred={marks.travellers}
          error={errorOf("adults")}
          onChange={(adults) => dispatch({ type: "travellers", patch: { adults } })}
        />
        <TravellerRow
          field="children"
          label={v.voyageurs.enfants}
          less={v.voyageurs.retirerEnfant}
          more={v.voyageurs.ajouterEnfant}
          bounds={CHILDREN}
          values={values}
          inferred={marks.travellers}
          error={errorOf("children")}
          onChange={(children) => dispatch({ type: "travellers", patch: { children } })}
        />
      </section>

      <section aria-labelledby="rythme-titre" className="flex flex-col gap-3">
        <h2 id="rythme-titre" className={SECTION_TITLE_CLASS}>
          {v.rythme.titre}
        </h2>
        <SegmentedControl<Pace>
          label={v.rythme.titre}
          options={PACE_OPTIONS}
          value={values.pace}
          inferredValue={marks.pace && values.pace ? values.pace : undefined}
          onChange={(pace) => dispatch({ type: "pace", pace })}
          invalid={errorOf("pace") !== null}
          describedBy={describedBy(errorOf("pace") && errorId(fieldId("pace")))}
          id={fieldId("pace")}
        />
        <FieldMessage id={errorId(fieldId("pace"))} message={errorOf("pace")} />
      </section>

      <section aria-labelledby="envies-titre" className="flex flex-col gap-3">
        <h2 id="envies-titre" className={SECTION_TITLE_CLASS}>
          {v.envies.titre}
        </h2>
        <ChipGroup
          field="wishes"
          labelledBy="envies-titre"
          options={CATEGORIES}
          labels={t.envies}
          values={values}
          inferred={marks.wishes}
          blocked={values.limits}
          blockedId={ALREADY_LIMITED_ID}
          blockedLine={v.envies.indisponibles}
          error={errorOf("wishes")}
          onToggle={(value) => dispatch({ type: "toggle", field: "wishes", value })}
        />
      </section>

      <OptionalSection
        id="deplacements"
        title={v.deplacements.titre}
        open={open.mobility}
        onToggle={() => setOpen((current) => ({ ...current, mobility: !current.mobility }))}
        summary={listSummary(values.mobility.map((mode) => t.deplacements[mode]))}
      >
        <ChipGroup
          field="mobility"
          labelledBy="deplacements-titre"
          options={MOBILITY_MODES}
          labels={t.deplacements}
          values={values}
          inferred={marks.mobility}
          blocked={[]}
          onToggle={(value) => dispatch({ type: "toggle", field: "mobility", value })}
        />
      </OptionalSection>

      <OptionalSection
        id="limiter"
        title={v.limiter.titre}
        open={open.limits}
        onToggle={() => setOpen((current) => ({ ...current, limits: !current.limits }))}
        summary={listSummary(values.limits.map((category) => t.envies[category]))}
      >
        <ChipGroup
          field="limits"
          labelledBy="limiter-titre"
          options={CATEGORIES}
          labels={t.envies}
          values={values}
          inferred={marks.limits}
          blocked={values.wishes}
          blockedId={ALREADY_WISHED_ID}
          blockedLine={v.limiter.indisponibles}
          onToggle={(value) => dispatch({ type: "toggle", field: "limits", value })}
        />
      </OptionalSection>

      <OptionalSection
        id="budget"
        title={v.budget.titre}
        open={open.mealBudget}
        onToggle={() => setOpen((current) => ({ ...current, mealBudget: !current.mealBudget }))}
        summary={budgetSummary(values.mealBudget)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span id="budget-avant" className="text-corps text-ink">
              {v.budget.avant}
            </span>
            <NumberField
              id={fieldId("mealBudget")}
              size="amount"
              value={values.mealBudget}
              labelledBy="budget-avant budget-apres"
              describedBy={describedBy(marks.mealBudget && INFERRED_ID, errorOf("mealBudget") && errorId(fieldId("mealBudget")))}
              inferred={marks.mealBudget}
              invalid={errorOf("mealBudget") !== null}
              onChange={(value) => dispatch({ type: "mealBudget", value })}
            />
            <span id="budget-apres" className="text-corps text-ink">
              {v.budget.apres}
            </span>
          </div>
          <FieldMessage id={errorId(fieldId("mealBudget"))} message={errorOf("mealBudget")} />
        </div>
      </OptionalSection>

      <div className="mt-2 flex flex-col items-center gap-2">
        <Button className="w-full" onClick={submit}>
          {t.continuer}
        </Button>
        <Button variant="text" onClick={backToStory}>
          {v.revenirRecit}
        </Button>
      </div>
      <div role="status" className={EMPTY_LIVE_REGION_CLASS} />
      <div role="alert" className={EMPTY_LIVE_REGION_CLASS} />
    </>
  );
}

interface TravellerRowProps {
  field: "adults" | "children";
  label: string;
  less: string;
  more: string;
  bounds: { min: number; max: number };
  values: BriefValues;
  inferred: boolean;
  error: string | null;
  onChange: (value: string) => void;
}

/** Rangée « Adultes » ou « Enfants » : champ numérique entre « Retirer » et « Ajouter » (`IconButton` 44 px). */
function TravellerRow({ field, label, less, more, bounds, values, inferred, error, onChange }: TravellerRowProps) {
  const id = fieldId(field);
  const labelId = `${id}-libelle`;
  const current = parseInteger(values[field], { min: 0, max: Number.MAX_SAFE_INTEGER });
  const atMin = current !== null && current <= bounds.min;
  const atMax = current !== null && current >= bounds.max;
  const step = (delta: number) => {
    // À la borne, le bouton reste atteignable au clavier (`aria-disabled`) et ne fait rien.
    if ((delta < 0 && atMin) || (delta > 0 && atMax)) return;
    const base = current ?? bounds.min;
    onChange(String(Math.min(bounds.max, Math.max(bounds.min, base + delta))));
  };
  return (
    <div className="flex flex-col gap-2">
      {/* Passage à la ligne à 320 px ou en texte agrandi (0018 § 16, WCAG 1.4.10), comme la rangée du budget. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span id={labelId} className="text-corps font-bold text-ink">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <IconButton
            icon={<IconMoinsProvisoire />}
            label={less}
            aria-disabled={atMin || undefined}
            className={STEP_BOUND_CLASS}
            onClick={() => step(-1)}
          />
          <NumberField
            id={id}
            size="compact"
            value={values[field]}
            labelledBy={labelId}
            describedBy={describedBy(inferred && INFERRED_ID, error && errorId(id))}
            inferred={inferred}
            invalid={error !== null}
            onChange={onChange}
          />
          <IconButton
            icon={<IconPlus />}
            label={more}
            aria-disabled={atMax || undefined}
            className={STEP_BOUND_CLASS}
            onClick={() => step(1)}
          />
        </div>
      </div>
      <FieldMessage id={errorId(id)} message={error} />
    </div>
  );
}

interface ChipGroupProps<F extends ChipField> {
  field: F;
  labelledBy: string;
  options: readonly (F extends "mobility" ? MobilityMode : Category)[];
  labels: Record<string, string>;
  values: BriefValues;
  inferred: readonly string[];
  /** Valeurs indisponibles (déjà choisies dans l'autre liste) : `aria-disabled`, atteignables au clavier. */
  blocked: readonly string[];
  blockedId?: string;
  blockedLine?: string;
  error?: string | null;
  onToggle: (value: F extends "mobility" ? MobilityMode : Category) => void;
}

/** Groupe de `Chip` à choix multiple ; une `Chip` déduite et choisie est en pointillé et décrite « déduit ». */
function ChipGroup<F extends ChipField>({
  field,
  labelledBy,
  options,
  labels,
  values,
  inferred,
  blocked,
  blockedId,
  blockedLine,
  error = null,
  onToggle,
}: ChipGroupProps<F>) {
  const selected = values[field] as readonly string[];
  const lineId = `${fieldId(field)}-indisponibles`;
  const hasBlocked = options.some((option) => blocked.includes(option));
  return (
    <div className="flex flex-col gap-2">
      <div
        id={fieldId(field)}
        role="group"
        tabIndex={-1}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy(hasBlocked && blockedLine && lineId, error && errorId(fieldId(field)))}
        className="flex flex-wrap gap-2 outline-offset-4"
      >
        {options.map((option) => {
          const isSelected = selected.includes(option);
          const isInferred = isSelected && inferred.includes(option);
          const isBlocked = !isSelected && blocked.includes(option);
          return (
            <Chip
              key={option}
              label={labels[option] ?? option}
              selected={isSelected}
              inferred={isInferred}
              aria-disabled={isBlocked || undefined}
              aria-describedby={describedBy(isInferred && INFERRED_ID, isBlocked && blockedId)}
              onSelectedChange={() => onToggle(option)}
            />
          );
        })}
      </div>
      {hasBlocked && blockedLine ? (
        <p id={lineId} className="text-corps-s text-ink-soft">
          {blockedLine}
        </p>
      ) : null}
      <FieldMessage id={errorId(fieldId(field))} message={error} />
    </div>
  );
}

interface OptionalSectionProps {
  id: string;
  title: string;
  open: boolean;
  onToggle: () => void;
  summary: string | null;
  children: ReactNode;
}

/**
 * Section facultative repliable (cadrage § 3.1) : bouton d'en-tête `aria-expanded` ; repliée, l'en-tête dit
 * « Facultatif » ou résume les valeurs (« À pied, Transports publics »).
 */
function OptionalSection({ id, title, open, onToggle, summary, children }: OptionalSectionProps) {
  const panelId = `${id}-contenu`;
  return (
    <section aria-labelledby={`${id}-titre`} className="flex flex-col gap-3 border-t border-hairline pt-4">
      <h2 className={SECTION_TITLE_CLASS}>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex min-h-(--touch-target) w-full cursor-pointer items-center justify-between gap-3 text-left"
        >
          <span className="flex min-w-0 flex-col">
            <span id={`${id}-titre`}>{title}</span>
            {open ? null : (
              <span className="text-corps-s font-normal text-ink-soft">
                {summary ?? v.facultatif}
              </span>
            )}
          </span>
          <IconRetour className={cn("text-ink-soft", open ? "rotate-90" : "-rotate-90")} />
        </button>
      </h2>
      <div id={panelId} hidden={!open}>
        {children}
      </div>
    </section>
  );
}
