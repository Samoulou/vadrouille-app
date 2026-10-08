"use client";

import { useState, type ComponentPropsWithRef, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

export interface ChipProps
  extends Omit<ComponentPropsWithRef<"button">, "children" | "aria-pressed" | "onChange"> {
  /** Libellé visible, qui est aussi le nom accessible. */
  label: string;
  /** État contrôlé. Sans `selected`, la chip gère son état à partir de `defaultSelected`. */
  selected?: boolean;
  defaultSelected?: boolean;
  /** Valeur déduite (brief raconté) : contour pointillé, à confirmer par la personne. */
  inferred?: boolean;
  /** Appelée à chaque bascule avec le nouvel état. */
  onSelectedChange?: (selected: boolean) => void;
}

/**
 * Choix multiple (préférences du brief). Rendu provisoire, absent du design system (Q13) :
 * sélectionnée = aplat `line` ; déduite = contour pointillé `ink`.
 */
export function Chip({
  label,
  selected,
  defaultSelected = false,
  inferred = false,
  onSelectedChange,
  onClick,
  className,
  type,
  ...props
}: ChipProps) {
  const [internal, setInternal] = useState(defaultSelected);
  const isSelected = selected ?? internal;

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented) {
      return;
    }
    const next = !isSelected;
    if (selected === undefined) {
      setInternal(next);
    }
    onSelectedChange?.(next);
  }

  return (
    <button
      type={type ?? "button"}
      aria-pressed={isSelected}
      data-inferred={inferred || undefined}
      onClick={handleClick}
      className={cn(
        "inline-flex min-h-(--touch-target) shrink-0 cursor-pointer items-center justify-center rounded-control border-(length:--ligne-trait-controle) bg-clip-padding px-4 text-corps font-semibold disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-soft",
        isSelected ? "border-line bg-line text-on-line" : "border-border-control bg-raised text-ink",
        inferred && "border-dashed border-ink",
        className,
      )}
      {...props}
    >
      {label}
    </button>
  );
}
