"use client";

import { useRef, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentedControlProps<T extends string> {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Nom accessible du groupe (« Rythme »). */
  label: string;
  className?: string;
}

const NEXT_KEYS = new Set(["ArrowRight", "ArrowDown"]);
const PREVIOUS_KEYS = new Set(["ArrowLeft", "ArrowUp"]);

/**
 * Choix exclusif (radiogroup) : un seul arrêt de tabulation, les flèches changent d'option.
 * Rendu provisoire, absent du design system (Q13) : option choisie en aplat `line`.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // Sans option choisie, la première reste atteignable au clavier.
  const tabStop = selectedIndex === -1 ? 0 : selectedIndex;

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
      role="radiogroup"
      aria-label={label}
      className={cn("flex w-full gap-1 rounded-control bg-muted p-1", className)}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            ref={(element) => {
              refs.current[index] = element;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStop ? 0 : -1}
            onClick={() => {
              if (!checked) {
                onChange(option.value);
              }
            }}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-(--touch-target) flex-1 cursor-pointer items-center justify-center rounded-control px-3 text-corps",
              checked ? "bg-line font-bold text-on-line" : "bg-transparent font-semibold text-ink-2",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
