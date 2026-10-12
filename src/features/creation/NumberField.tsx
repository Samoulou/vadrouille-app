"use client";

import type { Ref, SVGProps } from "react";

import { cn } from "@/lib/utils";

import { INPUT_CLASS } from "./fields";

export interface NumberFieldProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Identifiants des textes qui nomment le champ (libellé visible, ou « Environ » et « CHF par personne… »). */
  labelledBy: string;
  /** Identifiants des textes qui le décrivent (mention « déduit », message d'erreur). */
  describedBy?: string;
  /** Valeur déduite du récit (décision 0017 § 6, F8-TL-4) : contour pointillé `ink` (0018 § 16). */
  inferred?: boolean;
  invalid?: boolean;
  inputRef?: Ref<HTMLInputElement>;
  /** `compact` : 44 × 52 px, chiffre en `section` 800 centré (voyageurs) ; `amount` : budget par repas. */
  size: "compact" | "amount";
}

/**
 * Champ numérique du brief (décision 0017 § 6), propre à la création : il n'est pas dans le design system. Saisie
 * au clavier numérique, gardée en texte jusqu'à la validation au bouton principal.
 */
export function NumberField({ id, value, onChange, labelledBy, describedBy, inferred = false, invalid = false, inputRef, size }: NumberFieldProps) {
  return (
    <input
      ref={inputRef}
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      value={value}
      maxLength={size === "compact" ? 1 : 3}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
      data-inferred={inferred || undefined}
      // Contenu sélectionné au focus : taper un chiffre remplace « 2 » malgré `maxLength` (une seule position).
      onFocus={(event) => event.currentTarget.select()}
      onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
      className={cn(
        INPUT_CLASS,
        "tabular-nums",
        inferred && "border-dashed border-ink",
        size === "compact" ? "w-(--touch-target) px-0 text-center text-section font-extrabold" : "w-(--ligne-champ-montant)",
      )}
    />
  );
}

/**
 * Icône « moins » : absente du jeu Ligne. Icône provisoire isolée (U2-Q1, décision 0018 § 16), hors du jeu commun,
 * tracée selon les règles de l'iconographie (grille 24, trait 2,2, extrémités arrondies) ; remplacée si Samuel
 * l'ajoute au jeu.
 */
export function IconMoinsProvisoire({ className, ...props }: Omit<SVGProps<SVGSVGElement>, "children">) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={cn("size-(--ligne-icone-petite) shrink-0", className)}
      {...props}
    >
      <path d="M5 12h14" />
    </svg>
  );
}
