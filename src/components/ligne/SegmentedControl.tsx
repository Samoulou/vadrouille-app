"use client";

import { useId, type Ref } from "react";

import * as messages from "@/i18n/messages";
import { cn } from "@/lib/utils";

import { IconCoche } from "./icons";
import { useRadioGroup } from "./useRadioGroup";

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
   * Identifiant du titre qui nomme le groupe (« Pourquoi la remplacer ? ») : `aria-labelledby` à la place de
   * `aria-label`, pour que le nom ne soit pas écrit deux fois.
   */
  labelledBy?: string;
  /**
   * `vertical` (décision 0016 § 8, rendu de 0018 § 6) : une option par rangée, pleine largeur, libellé aligné à
   * gauche, coche de 20 px devant l'option choisie (indice non coloré). `horizontal` par défaut (rendu de 0012).
   */
  orientation?: "horizontal" | "vertical";
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

/**
 * Choix exclusif (radiogroup) : un seul arrêt de tabulation, les flèches changent d'option (logique clavier de
 * `useRadioGroup`, décision 0019 § 1.2).
 * Rendu décidé par UX/UI (décision 0012, Q13) : rail `muted`, option choisie en aplat `line`.
 * Option déduite choisie (0018 § 16 avec 0012) : fond `raised`, contour pointillé `ink`, texte `ink` 700,
 * coche de 20 px en `ink` ; la mention « déduit de ton récit » décrit le groupe (`aria-describedby`).
 * Choix invalide : contour `ink` du rail et `aria-invalid` (0018, « Champ invalide »). Focus clavier : anneau
 * global `line` (`:focus-visible`), jamais retiré, sur l'option qui porte l'arrêt de tabulation.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  labelledBy,
  orientation = "horizontal",
  inferredValue,
  describedBy,
  invalid = false,
  id,
  groupRef,
  className,
}: SegmentedControlProps<T>) {
  const inferredId = useId();
  const selectedIndex = options.findIndex((option) => option.value === value);
  // Sans option choisie, la première reste atteignable au clavier.
  const radio = useRadioGroup({
    count: options.length,
    selectedIndex,
    onSelect: (index) => {
      const option = options[index];
      if (option) onChange(option.value);
    },
  });
  const inferred = inferredValue !== undefined && value === inferredValue;
  const description = [inferred ? inferredId : undefined, describedBy].filter(Boolean).join(" ") || undefined;
  const vertical = orientation === "vertical";

  return (
    <div
      ref={groupRef}
      id={id}
      role="radiogroup"
      aria-label={labelledBy ? undefined : label}
      aria-labelledby={labelledBy}
      aria-orientation={vertical ? "vertical" : undefined}
      aria-describedby={description}
      aria-invalid={invalid || undefined}
      tabIndex={-1}
      className={cn(
        "flex w-full gap-1 rounded-control bg-muted p-1",
        // Choix invalide (0018, « Champ invalide ») : contour `ink` intérieur, sans décaler les options ni masquer
        // l'anneau de focus (`outline`) que le groupe reçoit avec l'erreur.
        "aria-invalid:ring-(length:--ligne-trait-controle) aria-invalid:ring-ink aria-invalid:ring-inset",
        vertical && "flex-col",
        className,
      )}
    >
      {options.map((option, index) => {
        const checked = option.value === value;
        const marked = checked && inferred;
        return (
          <button
            key={option.value}
            ref={radio.itemRef(index)}
            type="button"
            role="radio"
            aria-checked={checked}
            data-inferred={marked || undefined}
            tabIndex={index === radio.tabStop ? 0 : -1}
            onClick={() => radio.onActivate(index)}
            onKeyDown={(event) => radio.onKeyDown(event, index)}
            className={cn(
              "inline-flex min-h-(--touch-target) cursor-pointer items-center gap-1 rounded-control text-corps",
              vertical ? "w-full justify-start px-4 text-left" : "flex-1 justify-center px-3",
              marked
                ? "border-(length:--ligne-trait-controle) border-dashed border-ink bg-raised bg-clip-padding font-bold text-ink"
                : checked
                  ? "bg-line font-bold text-on-line"
                  : "bg-transparent font-semibold text-ink-2",
            )}
          >
            {/* Coche du jeu Ligne : option déduite (le pointillé n'est jamais la seule information), ou option choisie en vertical. */}
            {marked || (vertical && checked) ? (
              <IconCoche data-part="segment-check" className="size-(--ligne-icone-petite) shrink-0" />
            ) : vertical ? (
              // Place de la coche réservée : les libellés restent alignés (0018 § 6).
              <span aria-hidden="true" className="size-(--ligne-icone-petite) shrink-0" />
            ) : null}
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
