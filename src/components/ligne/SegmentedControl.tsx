"use client";

import { useId, useRef, type KeyboardEvent, type Ref } from "react";

import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  /** `null` : aucune option choisie (pas de choix par défaut, décision 0017 § 6 ; 0016 § 8). */
  value: T | null;
  onChange: (value: T) => void;
  /** Nom accessible du groupe (« Rythme »). */
  label: string;
  /**
   * Valeur déduite (brief raconté, décision 0017 § 6, F8-TL-4) : son option porte la marque « déduit » tant
   * qu'elle est choisie. L'écran la retire dès que la personne touche au groupe. Sans elle, rien ne change.
   */
  inferredValue?: T;
  /** Identifiants des textes qui décrivent le groupe (aide, message d'erreur), dans cet ordre. */
  describedBy?: string;
  /** Erreur de choix : `aria-invalid` sur le groupe, message relié par `describedBy`. */
  invalid?: boolean;
  /** Identifiant du groupe, qui reçoit le focus d'une erreur de choix (règle des erreurs de 0018). */
  id?: string;
  groupRef?: Ref<HTMLDivElement>;
  className?: string;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Choix exclusif (radiogroup) : un seul arrêt de tabulation, les flèches changent d'option.
 * Rendu décidé par UX/UI (décision 0012, Q13) : rail `muted`, option choisie en aplat `line`.
 * Option déduite choisie (0018 § 16 avec 0012) : fond `raised`, contour pointillé `ink`, texte `ink` 700,
 * coche de 20 px en `ink` ; la mention « déduit de ton récit » décrit le groupe (`aria-describedby`).
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  inferredValue,
  describedBy,
  invalid = false,
  id,
  groupRef,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const inferredId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  // Sans option choisie, la première reste atteignable au clavier.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;
  const inferred = inferredValue !== undefined && value === inferredValue;
  const description = [inferred ? inferredId : undefined, describedBy].filter(Boolean).join(" ") || undefined;

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let target: number;
    if (NEXT_KEYS.has(event.key)) {
      target = (index + 1) % options.length;
    } else if (PREVIOUS_KEYS.has(event.key)) {
      target = (index - 1 + options.length) % options.length;
    } else if (event.key === "Home") {
      target = 0;
    } else if (event.key === "End") {
      target = options.length - 1;
    } else {
      return;
    }
    event.preventDefault();
    const option = options[target];
    if (!option) {
      return;
    }
    refs.current[target]?.focus();
    if (option.value !== value) {
      onChange(option.value);
    }
  }

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-label={label}
      aria-describedby={description}
      aria-invalid={invalid || undefined}
      tabIndex={-1}
      className={cn("flex w-full gap-1 rounded-control bg-muted p-1", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const marked = checked && inferred;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            data-inferred={marked || undefined}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              if (!checked) {
                onChange(option.value);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-(--touch-target) flex-1 cursor-pointer items-center justify-center gap-1 rounded-control px-3 text-corps",
              marked
                ? "border-(length:--ligne-trait-controle) border-dashed border-ink bg-raised bg-clip-padding font-bold text-ink"
                : checked
                  ? "bg-line font-bold text-on-line"
                  : "bg-transparent font-semibold text-ink-2",
            )}
          >
            {/* Coche du jeu Ligne, seulement sur l'option déduite : le pointillé n'est jamais la seule information. */}
            {marked ? <IconCoche data-part="segment-check" className="size-(--ligne-icone-petite)" /> : null}
            {option.label}
          </button>
        );
      })}
      {inferred ? (
        <span id={inferredId} hidden>
          {messages.ligne.deduit}
        </span>
      ) : null}
    </div>
  );
}
