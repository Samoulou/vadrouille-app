import Link from "next/link";

import type { Weekday } from "@/contracts";
import { format, messages } from "@/i18n";
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
  const name = dayBadgeName({ day, weekday, disabled });
  const label = format(t.pastille, { day });

  const classes = cn(
    "relative inline-flex shrink-0 flex-col items-center justify-center font-extrabold tabular-nums",
    small
      ? "h-(--ligne-pastille-reduite) min-w-(--ligne-pastille-reduite) rounded-(--ligne-rayon-mini) px-1.5 text-etiquette"
      : "min-h-(--touch-target) min-w-(--touch-target) rounded-badge px-(--ligne-espace-2) text-(length:--ligne-texte-pastille) leading-(--ligne-texte-pastille-interligne)",
    disabled
      ? "bg-muted text-ink-soft"
      : isActive
        ? "border-(length:--ligne-trait-controle) border-line bg-line text-on-line"
        : "border-(length:--ligne-trait-controle) border-outline-strong bg-raised text-ink",
    className,
  );

  const content = (
    <>
      <span aria-hidden="true" className="flex flex-col items-center">
        <span>{label}</span>
        {disabled ? <span className="text-legende font-semibold">{t.complet}</span> : null}
      </span>
      <span className="sr-only">{name}</span>
    </>
  );

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
