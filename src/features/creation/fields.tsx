"use client";

import type { ReactNode, Ref } from "react";

import { cn } from "@/lib/utils";

/**
 * Champs de saisie de la création (décision 0018, « Règles communes », « Champ de saisie » et « Message d'erreur
 * et annonces ») : libellé visible au-dessus (`corps` 700), aide éventuelle (`corps-s` `ink-soft`), champ `raised`
 * à contour `border-control` de 1,5 px, 52 px de haut ; invalide : contour `ink`, `aria-invalid`, message sous le
 * champ (`corps-s` 600 `ink`). `aria-describedby` : l'aide, puis le message d'erreur, puis le compteur.
 */

/** Identifiant de page d'un champ (« otherCities.0.name » → « champ-otherCities-0-name »). */
export function fieldId(field: string): string {
  return `champ-${field.replace(/\./g, "-")}`;
}

/** Focus sur un champ ou un groupe par son nom (erreur de validation, champ ajouté ; règle des erreurs de 0018). */
export function focusField(field: string): void {
  document.getElementById(fieldId(field))?.focus();
}

export const helpId = (id: string) => `${id}-aide`;
export const errorId = (id: string) => `${id}-erreur`;

/** Identifiants qui décrivent un champ, dans l'ordre de 0018. */
export function describedBy(...ids: (string | false | null | undefined)[]): string | undefined {
  return ids.filter(Boolean).join(" ") || undefined;
}

/**
 * Région live vide (`role="status"` ou `role="alert"`, présente dès l'affichage, 0018 § 14) : hors du flux tant
 * qu'elle est vide, pour ne pas ajouter d'écart dans la colonne ; elle reste rendue (jamais `hidden` ni
 * `display: none`), donc annoncée dès qu'un texte y est écrit.
 */
export const EMPTY_LIVE_REGION_CLASS = "absolute";

export const INPUT_CLASS =
  "h-13 w-full min-w-0 rounded-control border-(length:--ligne-trait-controle) border-border-control bg-raised bg-clip-padding px-4 text-corps text-ink aria-invalid:border-ink";

export function FieldLabel({ htmlFor, id, children }: { htmlFor?: string; id?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} id={id} className="text-corps font-bold text-ink">
      {children}
    </label>
  );
}

export function FieldHelp({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="text-corps-s text-ink-soft">
      {children}
    </p>
  );
}

export function FieldMessage({ id, message }: { id: string; message: string | null }) {
  return message ? (
    <p id={id} className="text-corps-s font-semibold text-ink">
      {message}
    </p>
  ) : null;
}

export interface TextFieldProps {
  field: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "date" | "time";
  help?: string;
  error?: string | null;
  maxLength?: number;
  /** Calendrier : premières et dernières dates proposées (`AAAA-MM-JJ`). */
  min?: string;
  max?: string;
  autoComplete?: string;
  inputRef?: Ref<HTMLInputElement>;
  className?: string;
}

export function TextField({
  field,
  label,
  value,
  onChange,
  type = "text",
  help,
  error = null,
  maxLength,
  min,
  max,
  autoComplete = "off",
  inputRef,
  className,
}: TextFieldProps) {
  const id = fieldId(field);
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {help ? <FieldHelp id={helpId(id)}>{help}</FieldHelp> : null}
      <input
        ref={inputRef}
        id={id}
        type={type}
        value={value}
        maxLength={maxLength}
        min={min}
        max={max}
        autoComplete={autoComplete}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(help && helpId(id), error && errorId(id))}
        onChange={(event) => onChange(event.target.value)}
        // Date et heure : la tabulation atteint aussi le bouton interne du calendrier, que seul `:focus-within` voit
        // sur le champ ; le contour de focus commun (2 px `line`, décalé de 2 px) y est donc aussi posé.
        className={cn(INPUT_CLASS, type !== "text" && "tabular-nums focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-line")}
      />
      <FieldMessage id={errorId(id)} message={error} />
    </div>
  );
}

/** Rangée de champs côte à côte, empilés sous `--ligne-champ-min` chacun (WCAG 1.4.10). */
export function FieldRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-3 *:min-w-(--ligne-champ-min) *:flex-1">{children}</div>;
}
