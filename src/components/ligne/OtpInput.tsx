"use client";

import { useRef, useState, type ChangeEvent, type ClipboardEvent, type KeyboardEvent } from "react";

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
  disabled?: boolean;
  className?: string;
}

const t = messages.ligne.otp;

function digitsOf(text: string): string[] {
  return Array.from(text.replace(/\D/g, ""));
}

/**
 * Code à usage unique, une case par chiffre. Accepte le collage et le remplissage automatique
 * (`autocomplete="one-time-code"`). Rendu provisoire, absent du design system (Q13).
 */
export function OtpInput({
  length = 6,
  onComplete,
  defaultValue = "",
  label,
  disabled = false,
  className,
}: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length }, (_, index) => digitsOf(defaultValue)[index] ?? ""),
  );
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  function focusAt(index: number) {
    const input = refs.current[Math.max(0, Math.min(length - 1, index))];
    input?.focus();
    input?.select();
  }

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

  return (
    <div
      role="group"
      aria-label={label ?? format(t.groupe, { length })}
      className={cn("flex gap-2", className)}
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
          value={digit}
          disabled={disabled}
          onChange={(event) => handleChange(event, index)}
          onPaste={(event) => handlePaste(event, index)}
          onKeyDown={(event) => handleKeyDown(event, index)}
          onFocus={(event) => event.target.select()}
          className="h-13 w-(--touch-target) min-w-0 rounded-control border-(length:--ligne-trait-controle) border-border-control bg-raised text-center text-section font-extrabold text-ink tabular-nums disabled:bg-muted disabled:text-ink-soft"
        />
      ))}
    </div>
  );
}
