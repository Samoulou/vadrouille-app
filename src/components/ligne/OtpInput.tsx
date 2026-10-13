"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";

import { format, messages } from "@/i18n";
import { cn } from "@/lib/utils";

export interface OtpInputProps {
  /** Nombre de chiffres du code. */
  length?: number;
  /** Appelée une fois, quand la dernière position est remplie, avec le code complet. */
  onComplete?: (code: string) => void;
  /** Code déjà saisi (chiffres seulement), par exemple pour une démonstration. */
  defaultValue?: string;
  /** Nom accessible du groupe ; par défaut « Code à 6 chiffres ». */
  label?: string;
  /**
   * Libellé visible (spécification F8, écran 4 ; décision 0012, Q30) : `label` est affiché au-dessus des cases
   * (`corps` 700 `ink`) et nomme le groupe par `aria-labelledby`, sans `aria-label` (nom accessible et libellé
   * visible identiques, WCAG 2.5.3). Faux par défaut : comportement de F2 inchangé.
   */
  labelVisible?: boolean;
  /**
   * Focus sur la première case au montage (étape code de l'écran 4). Pour vider les cases et rendre le focus à la
   * première (code refusé), l'écran remonte le composant (nouvelle `key`).
   */
  autoFocus?: boolean;
  disabled?: boolean;
  /** Code refusé : contour `ink` et `aria-invalid="true"` sur chaque case (décision 0012, Q13). */
  invalid?: boolean;
  /**
   * Identifiant de l'élément qui porte le message écrit, fourni par l'écran (Q10) : relié au groupe par
   * `aria-describedby`. À passer avec `invalid`.
   */
  describedBy?: string;
  className?: string;
}

const t = messages.ligne.otp;

function digitsOf(text: string): string[] {
  return Array.from(text.replace(/\D/g, ""));
}

/**
 * Code à usage unique, une case par chiffre. Accepte le collage et le remplissage automatique
 * (`autocomplete="one-time-code"`). Rendu décidé par UX/UI (décision 0012, Q13 et Q30), absent du design system.
 */
export function OtpInput({
  length = 6,
  onComplete,
  defaultValue = "",
  label,
  labelVisible = false,
  autoFocus = false,
  disabled = false,
  invalid = false,
  describedBy,
  className,
}: OtpInputProps) {
  const labelId = useId();
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, (_, index) => digitsOf(defaultValue)[index] ?? ""),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function focusAt(index: number) {
    const input = refs.current[Math.max(0, Math.min(length - 1, index))];
    input?.focus();
    input?.select();
  }

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
    // Au montage seulement : un nouveau focus demande un nouveau montage (nouvelle `key`).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function commit(next: string[]) {
    const wasComplete = digits.every(Boolean);
    setDigits(next);
    if (!wasComplete && next.every(Boolean)) {
      onComplete?.(next.join(""));
    }
  }

  /** Écrit des chiffres à partir d'une position (saisie, collage ou remplissage automatique). */
  function fillFrom(index: number, incoming: string[]) {
    if (incoming.length === 0) {
      return;
    }
    const next = [...digits];
    incoming.slice(0, length - index).forEach((digit, offset) => {
      next[index + offset] = digit;
    });
    commit(next);
    focusAt(index + incoming.length);
  }

  function handleChange(event: ChangeEvent<HTMLInputElement>, index: number) {
    const raw = event.target.value;
    const previous = digits[index] ?? "";
    // Le navigateur ajoute le nouveau caractère au chiffre présent : on retire l'ancien.
    const typed = previous && raw.startsWith(previous) ? raw.slice(previous.length) : raw;
    fillFrom(index, digitsOf(typed));
  }

  function handlePaste(event: ClipboardEvent<HTMLInputElement>, index: number) {
    event.preventDefault();
    fillFrom(index, digitsOf(event.clipboardData.getData("text")));
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>, index: number) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault();
      const next = [...digits];
      if (next[index]) {
        next[index] = "";
        commit(next);
      } else if (event.key === "Backspace" && index > 0) {
        // Case vide : effacer revient au chiffre précédent.
        next[index - 1] = "";
        commit(next);
        focusAt(index - 1);
      }
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focusAt(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focusAt(index + 1);
    }
  }

  const name = label ?? format(t.groupe, { length });
  const visible = labelVisible && label !== undefined;
  const group = (
    <div
      role="group"
      aria-label={visible ? undefined : name}
      aria-labelledby={visible ? labelId : undefined}
      aria-describedby={describedBy}
      className={cn("flex gap-2", !visible && className)}
    >
      {digits.map((digit, index) => (
        <input
          // Les positions sont fixes : l'index est une clé stable.
          key={index}
          ref={(element) => {
            refs.current[index] = element;
          }}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="one-time-code"
          aria-label={format(t.position, { position: index + 1, length })}
          aria-invalid={invalid || undefined}
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(event, index)}
          onPaste={(event) => handlePaste(event, index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onFocus={(event) => event.target.select()}
          className={cn(
            "h-13 w-(--touch-target) min-w-0 rounded-control border-(length:--ligne-trait-controle) bg-raised text-center text-section font-extrabold text-ink tabular-nums disabled:bg-muted disabled:text-ink-soft",
            invalid ? "border-ink" : "border-border-control",
          )}
        />
      ))}
    </div>
  );
  if (!visible) return group;
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <p id={labelId} className="text-corps font-bold text-ink">
        {name}
      </p>
      {group}
    </div>
  );
}
