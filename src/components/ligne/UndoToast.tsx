"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { messages } from "@/i18n";
import { cn } from "@/lib/utils";

export interface UndoToastProps {
  /** « [X] écarté. », fourni par l'appelant depuis fr.json. */
  message: string;
  onUndo: () => void;
  /** Fin du délai : la décision devient définitive. */
  onExpire: () => void;
  /** Délai en ms, 5 000 par défaut (handover § 5). */
  duration?: number;
  className?: string;
}

export interface UndoToastRegionProps {
  /** Le `UndoToast` en cours, ou rien. */
  children?: ReactNode;
  className?: string;
}

/**
 * Région `role="status"` du toast, montée en permanence (avant toute décision) : le toast y est
 * injecté ensuite, pour que les lecteurs d'écran annoncent chaque message sans prendre le focus. Sa
 * hauteur minimale (une cible tactile) réserve la place du toast : son apparition ne décale pas le
 * contenu qui précède.
 */
export function UndoToastRegion({ children, className }: UndoToastRegionProps) {
  return (
    <div role="status" data-undo-region="" className={cn("flex min-h-(--touch-target) flex-col", className)}>
      {children}
    </div>
  );
}

/**
 * Annulation de la dernière action pendant 5 s (handover § 5 et § 7). Se place dans une
 * `UndoToastRegion` (`role="status"`) : le message est annoncé sans prendre le focus. Le délai est suspendu tant que le toast a le focus ou est survolé, et
 * reprend à la sortie (WCAG 2.2.1). Rendu provisoire (F6-Q1) : aplat `ink`, texte `page`, « Annuler »
 * souligné en 700. Remonter le composant (clé) pour une nouvelle action relance le délai.
 */
export function UndoToast({ message, onUndo, onExpire, duration = 5000, className }: UndoToastProps) {
  const [paused, setPaused] = useState({ focus: false, hover: false });
  const remaining = useRef(duration);
  const onExpireRef = useRef(onExpire);
  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  const isPaused = paused.focus || paused.hover;

  useEffect(() => {
    if (isPaused) return;
    const startedAt = Date.now();
    const timer = setTimeout(() => onExpireRef.current(), remaining.current);
    return () => {
      clearTimeout(timer);
      remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt));
    };
  }, [isPaused]);

  return (
    <div
      data-undo-toast=""
      data-paused={isPaused || undefined}
      onFocus={() => setPaused((p) => ({ ...p, focus: true }))}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setPaused((p) => ({ ...p, focus: false }));
        }
      }}
      onMouseEnter={() => setPaused((p) => ({ ...p, hover: true }))}
      onMouseLeave={() => setPaused((p) => ({ ...p, hover: false }))}
      className={cn("flex min-h-(--touch-target) items-center gap-3 rounded-control bg-ink pl-4 pr-1 text-corps-s text-page", className)}
    >
      <p className="min-w-0 flex-1 py-2">{message}</p>
      <button
        type="button"
        onClick={onUndo}
        className="inline-flex min-h-(--touch-target) min-w-(--touch-target) shrink-0 cursor-pointer items-center justify-center rounded-control px-3 font-bold text-page underline underline-offset-2"
      >
        {messages.presentation.toast.annuler}
      </button>
    </div>
  );
}
