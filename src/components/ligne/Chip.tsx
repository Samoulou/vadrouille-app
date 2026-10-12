"use client";

import { useState, type ComponentPropsWithRef, type MouseEvent } from "react";

import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";

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
 * Choix multiple (préférences du brief). Rendu décidé par UX/UI (décision 0012, Q13), absent du design system :
 * - non choisie : fond `raised`, contour `border-control`, texte `ink` ;
 * - choisie : aplat `line`, texte `on-line`, précédée d'une coche de 20 px en `on-line` ;
 * - déduite, choisie ou non : fond `raised`, contour pointillé `ink`, texte `ink` ; choisie, coche de 20 px en
 *   `ink`. L'aplat `line` est réservé à ce que la personne a choisi elle-même (principe produit 3) ;
 * - indisponible (`disabled` ou `aria-disabled`) : fond `muted`, texte `ink-soft`, sans contour.
 * Texte en 600 dans tous les états.
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
  const unavailable = props["aria-disabled"] === true || props["aria-disabled"] === "true";

  function handleClick(event: MouseEvent<HTMLButtonElement>) {
    onClick?.(event);
    if (event.defaultPrevented || unavailable) {
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
        "inline-flex min-h-(--touch-target) shrink-0 cursor-pointer items-center justify-center gap-2 rounded-control border-(length:--ligne-trait-controle) bg-clip-padding px-4 text-corps font-semibold",
        inferred
          ? "border-dashed border-ink bg-raised text-ink"
          : isSelected
            ? "border-line bg-line text-on-line"
            : "border-border-control bg-raised text-ink",
        // Sur `muted`, `border-control` tomberait sous 3:1 : le fond et le texte écrit identifient l'état.
        "disabled:cursor-not-allowed disabled:border-transparent disabled:bg-muted disabled:text-ink-soft",
        "aria-disabled:cursor-not-allowed aria-disabled:border-transparent aria-disabled:bg-muted aria-disabled:text-ink-soft",
        className,
      )}
      {...props}
    >
      {/* Coche du jeu Ligne (grille 24, trait 2,2), à la couleur du texte : `on-line`, ou `ink` si déduite. */}
      {isSelected ? <IconCoche data-part="chip-check" strokeWidth={2.2} className="size-5" /> : null}
      {label}
    </button>
  );
}
