import Link from "next/link";
import type { KeyboardEvent, Ref } from "react";

import type { Weekday } from "@/contracts";
import { format } from "@/i18n";
import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

const t = messages.ligne.jour;

export interface DayBadgeProps {
  /** 1 = J1. */
  day: number;
  /** Jour abrégé, utilisé seulement dans le nom accessible (Q18). */
  weekday?: Weekday;
  active?: boolean;
  /** Jour complet (Déplacer) : pas de lien, mention « complet » visible. */
  disabled?: boolean;
  /** Sans `href`, pastille non interactive. */
  href?: string;
  /** Proposition (Q18) : « sm » = pastille réduite non interactive (26 px). */
  size?: "md" | "sm";
  /** Proposition : valeur d'aria-current quand la pastille est active ; « true » par défaut (handover § 5). */
  currentValue?: "true" | "page";
  className?: string;
}

/** Nom accessible : « Jour 2 », « Jour 2, lun. », puis « , complet » si la pastille est désactivée. */
export function dayBadgeName({ day, weekday, disabled }: Pick<DayBadgeProps, "day" | "weekday" | "disabled">) {
  const nom = weekday ? format(t.nomAvecJour, { day, weekday }) : format(t.nom, { day });
  return disabled ? format(t.nomComplet, { nom }) : nom;
}

/** Classes communes du mode lien et du rendu radio : pastille inactive, active (plein `line`) ou désactivée (F3). */
function dayBadgeClasses({ small, active, disabled, className }: { small: boolean; active: boolean; disabled: boolean; className?: string }) {
  return cn(
    "relative inline-flex shrink-0 flex-col items-center justify-center font-extrabold tabular-nums",
    small
      ? "h-(--ligne-pastille-reduite) min-w-(--ligne-pastille-reduite) rounded-(--ligne-rayon-mini) px-1.5 text-etiquette"
      : "min-h-(--touch-target) min-w-(--touch-target) rounded-badge px-(--ligne-espace-2) text-(length:--ligne-texte-pastille) leading-(--ligne-texte-pastille-interligne)",
    disabled
      ? "bg-muted text-ink-soft"
      : active
        ? "border-(length:--ligne-trait-controle) border-line bg-line text-on-line"
        : "border-(length:--ligne-trait-controle) border-outline-strong bg-raised text-ink",
    className,
  );
}

/** Contenu visible (« J2 », puis « complet ») et nom accessible complet en texte masqué. */
function DayBadgeContent({ day, weekday, disabled }: Pick<DayBadgeProps, "day" | "weekday" | "disabled">) {
  return (
    <>
      <span aria-hidden="true" className="flex flex-col items-center">
        <span>{format(t.pastille, { day })}</span>
        {disabled ? <span className="text-legende font-semibold">{t.complet}</span> : null}
      </span>
      <span className="sr-only">{dayBadgeName({ day, weekday, disabled })}</span>
    </>
  );
}

/** Pastille de jour (J1, J2…), numéro de ligne et onglet de navigation. Design system : components/DayBadge. */
export function DayBadge({
  day,
  weekday,
  active = false,
  disabled = false,
  href,
  size = "md",
  currentValue = "true",
  className,
}: DayBadgeProps) {
  const small = size === "sm";
  const isActive = active && !disabled;
  const classes = dayBadgeClasses({ small, active: isActive, disabled, className });
  const content = <DayBadgeContent day={day} weekday={weekday} disabled={disabled} />;

  const current = isActive ? currentValue : undefined;

  if (disabled && !small) {
    return (
      <span role="link" aria-disabled="true" data-day={day} className={classes}>
        {content}
      </span>
    );
  }
  if (href && !small) {
    return (
      <Link href={href} aria-current={current} data-day={day} className={classes}>
        {content}
      </Link>
    );
  }
  return (
    <span aria-current={current} data-day={day} className={classes}>
      {content}
    </span>
  );
}

export interface DayBadgeRadioProps {
  day: number;
  weekday?: Weekday;
  /** Jour coché (`aria-checked="true"`) : rendu de la pastille active de F3. */
  checked: boolean;
  /** Jour « complet » : `aria-disabled="true"`, mention visible « complet », jamais coché (décision 0019 § 1.2). */
  disabled?: boolean;
  /** Arrêt de tabulation du groupe (`tabIndex={0}`), sinon `-1`. */
  tabStop: boolean;
  buttonRef: Ref<HTMLButtonElement>;
  onActivate: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

/**
 * Rendu radio de `DayBadge` (décision 0019 § 1.2), **réservé à `DayBadgeGroup`** : il n'est pas exporté par
 * `src/components/ligne/index.ts`, et sa logique clavier vient du groupe (`useRadioGroup`). `<button role="radio">`
 * avec `aria-checked` et le nom accessible de F3 (« Jour 4 », « Jour 3, complet ») ; jamais `aria-current` ni
 * `aria-pressed`. Un jour « complet » garde le focus (`aria-disabled`, pas l'attribut natif `disabled`).
 */
export function DayBadgeRadio({ day, weekday, checked, disabled = false, tabStop, buttonRef, onActivate, onKeyDown }: DayBadgeRadioProps) {
  const isChecked = checked && !disabled;
  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={isChecked}
      aria-disabled={disabled || undefined}
      tabIndex={tabStop ? 0 : -1}
      data-day={day}
      onClick={onActivate}
      onKeyDown={onKeyDown}
      className={dayBadgeClasses({
        small: false,
        active: isChecked,
        disabled,
        className: disabled ? "cursor-not-allowed" : "cursor-pointer",
      })}
    >
      <DayBadgeContent day={day} weekday={weekday} disabled={disabled} />
    </button>
  );
}
