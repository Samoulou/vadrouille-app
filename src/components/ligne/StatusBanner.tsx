import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export type StatusBannerKind = "offline" | "conflict" | "noOption" | "error" | "generating";

export interface StatusBannerProps {
  kind: StatusBannerKind;
  /** Message fourni par l'écran appelant : dit ce qui se passe et ce qu'on peut faire. */
  message: string;
  /** Action éventuelle (un `Button` `text` ou `secondary`), placée sous le message. */
  action?: ReactNode;
  className?: string;
}

/** Provisoire (Q13) : `alert` pour `error` seulement, `status` pour les autres types. */
export function statusBannerRole(kind: StatusBannerKind): "alert" | "status" {
  return kind === "error" ? "alert" : "status";
}

const RAIL_CLASSES: Record<StatusBannerKind, string> = {
  offline: "bg-ink-soft",
  conflict: "bg-ink",
  noOption: "bg-ink-soft",
  error: "bg-ink",
  // La ligne qui se dessine : seule animation, absente sous prefers-reduced-motion.
  generating: "bg-line motion-safe:animate-pulse",
};

/**
 * Bandeau d'état transverse (hors ligne, conflit, aucune option, erreur, génération).
 * Le texte porte toute l'information ; le filet à gauche n'est qu'un repère visuel.
 * Rendu provisoire, absent du design system (Q13).
 */
export function StatusBanner({ kind, message, action, className }: StatusBannerProps) {
  return (
    <div
      role={statusBannerRole(kind)}
      data-kind={kind}
      className={cn("flex gap-3 rounded-block bg-muted p-4 text-corps text-ink-2", className)}
    >
      <span
        aria-hidden="true"
        data-rail=""
        className={cn("w-1 shrink-0 self-stretch rounded-full", RAIL_CLASSES[kind])}
      />
      <div className="flex min-w-0 flex-col items-start gap-2">
        <p>{message}</p>
        {action}
      </div>
    </div>
  );
}
